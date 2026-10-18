#!/usr/bin/env python3
"""Where do OpenRefactory's Alpha-Omega findings land in a conemass ranking?

For each of the three 2024 engagement targets (Airflow, Jenkins, Kubernetes):
  1. rank the project's dependency graph with conemass.mjs,
  2. join every node to OpenRefactory's public audit log (one row per
     project-version scanned: bugs filed, severity), at the granularity the
     audit uses, i.e. the upstream repository (a repo with several artifacts
     in the graph takes the best rank among them; the audited project's own
     repo is excluded),
  3. report, for the repos where they found bugs, the conemass rank vs the
     direct-dependents rank, and how many of the bug repos a top-K scan
     budget would have reached under each ordering (and under random order).

Usage: python analyze.py [--md out.md]
Needs: node (for conemass.mjs), the *-edges.csv graphs and
openrefactory-all-projects.csv (export of the public results sheet linked
from ossf/alpha-omega engagements/2024/OpenRefactory/update-2024-*.md).
"""
import collections
import csv
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CONEMASS = os.path.join(HERE, "..", "..", "conemass.mjs")


def num(x):
    try:
        return float(x)
    except ValueError:
        return 0.0


def norm(s):
    return re.sub(r"[-_.]+", "-", s).lower()


# ---------------------------------------------------------------- audit log
def load_audit():
    rows = list(csv.reader(open(os.path.join(HERE, "openrefactory-all-projects.csv"), encoding="utf-8", errors="replace")))
    hdr = rows[0]
    ix = {h: i for i, h in enumerate(hdr)}
    audit = collections.defaultdict(list)  # (lang, org, name) -> rows
    for r in rows[1:]:
        if len(r) < len(hdr) or r[ix["Language"]] not in ("Python", "Go", "Java"):
            continue
        rec = {
            "lang": r[ix["Language"]], "org": r[ix["Organization"]].lower(), "name": r[ix["Project Name (Alphabetical Order)"]].lower(),
            "version": r[ix["Version"]], "start": r[ix["Audit Start Date"]],
            "sec": num(r[ix["# of Security/Reliability Bugs Filed"]]), "other": num(r[ix["# of Logical/Other Bugs Filed"]]),
            "accepted": num(r[ix["# of Bug Reports Accepted"]]), "kind": r[ix["Bug Kind"]], "severity": r[ix["Bug Severity"]],
            "links": r[ix["Relevant Links For Reported/Fixed Bugs"]],
        }
        rec["bugs"] = rec["sec"] + rec["other"]
        audit[(rec["lang"], rec["org"], rec["name"])].append(rec)
    return audit


def lookup(audit, lang, org, name):
    """Audit key for (org, name): exact, else name-only if unambiguous."""
    org, name = (org or "").lower(), (name or "").lower()
    if (lang, org, name) in audit:
        return (lang, org, name)
    cands = [k for k in audit if k[0] == lang and k[2] == name]
    return cands[0] if len(cands) == 1 else None


def summarize(recs, window):
    """Collapse a repo's audit rows inside the engagement window; None if the
    repo was not scanned in the window. Bugs found in the same repo at other
    times (older versions, 2023 passes) are counted separately as `other`."""
    lo, hi = window
    inside = [r for r in recs if lo <= r["start"] <= hi]
    if not inside:
        return None
    sev_rank = {"High": 3, "Medium": 2, "Low": 1, "": 0}
    worst = max(inside, key=lambda r: (sev_rank.get(r["severity"], 0), r["bugs"]))
    return {
        "scans": len(inside), "bugs": sum(r["bugs"] for r in inside), "sec": sum(r["sec"] for r in inside),
        "severity": worst["severity"] if any(r["bugs"] for r in inside) else "",
        "kind": worst["kind"], "last": max(r["start"] for r in inside),
        "other": sum(r["bugs"] for r in recs if not lo <= r["start"] <= hi),
    }


# ------------------------------------------------------------- node -> repo
GO_HOSTS = [
    (r"^github\.com/([^/]+)/([^/]+)", lambda m: (m.group(1), m.group(2))),
    (r"^golang\.org/x/([^/]+)", lambda m: ("golang", m.group(1))),
    (r"^k8s\.io/([^/]+)", lambda m: ("kubernetes", m.group(1))),
    (r"^sigs\.k8s\.io/([^/]+)", lambda m: ("kubernetes-sigs", m.group(1))),
    (r"^google\.golang\.org/grpc", lambda m: ("grpc", "grpc-go")),
    (r"^google\.golang\.org/protobuf", lambda m: ("protocolbuffers", "protobuf-go")),
    (r"^google\.golang\.org/genproto", lambda m: ("googleapis", "go-genproto")),
    (r"^google\.golang\.org/api", lambda m: ("googleapis", "google-api-go-client")),
    (r"^cloud\.google\.com/go", lambda m: ("googleapis", "google-cloud-go")),
    (r"^gopkg\.in/yaml\.v", lambda m: ("go-yaml", "yaml")),
    (r"^gopkg\.in/([^/.]+)\.v\d+", lambda m: ("", m.group(1))),
    (r"^go\.uber\.org/([^/]+)", lambda m: ("uber-go", m.group(1))),
    (r"^go\.etcd\.io/etcd", lambda m: ("etcd-io", "etcd")),
    (r"^go\.etcd\.io/bbolt", lambda m: ("etcd-io", "bbolt")),
    (r"^go\.opentelemetry\.io/otel", lambda m: ("open-telemetry", "opentelemetry-go")),
    (r"^go\.opentelemetry\.io/contrib", lambda m: ("open-telemetry", "opentelemetry-go-contrib")),
    (r"^go\.opentelemetry\.io/proto", lambda m: ("open-telemetry", "opentelemetry-proto-go")),
    (r"^go\.opencensus\.io", lambda m: ("census-instrumentation", "opencensus-go")),
    (r"^honnef\.co/go/tools", lambda m: ("dominikh", "go-tools")),
    (r"^gonum\.org/v1/gonum", lambda m: ("gonum", "gonum")),
    (r"^bitbucket\.org/([^/]+)/([^/]+)", lambda m: (m.group(1), m.group(2))),
    (r"^gitlab\.com/([^/]+)/([^/]+)", lambda m: (m.group(1), m.group(2))),
]
# modules that live in the kubernetes/kubernetes tree (replace => ./staging)
K8S_STAGING = re.compile(r"^k8s\.io/(?!klog|utils|gengo|kube-openapi|system-validators|mount-utils$)")


def go_repo(mod):
    if mod == "k8s.io/kubernetes" or K8S_STAGING.match(mod) and mod not in ("k8s.io/klog/v2", "k8s.io/utils", "k8s.io/gengo/v2", "k8s.io/kube-openapi", "k8s.io/system-validators"):
        return ("kubernetes", "kubernetes")
    for pat, fn in GO_HOSTS:
        m = re.match(pat, mod)
        if m:
            return fn(m)
    return ("", mod.split("/")[-1])


def match_go(audit, mod):
    org, name = go_repo(mod)
    key = lookup(audit, "Go", org, name)
    if not key and org == "golang":
        key = lookup(audit, "Go", "go", name)
    if not key and name.startswith("go-"):
        key = lookup(audit, "Go", org, name[3:])
    return (org, name), key


# Maven groupIds whose upstream repo name is not recoverable from the
# artifactId or the license-report URL (multi-artifact repos).
JAVA_GROUP_REPO = {
    "org.springframework": ("spring-projects", "spring-framework"),
    "org.springframework.security": ("spring-projects", "spring-security"),
    "org.bouncycastle": ("bcgit", "bc-java"),
    "org.ow2.asm": ("asm", "asm"),
    "org.junit.jupiter": ("junit-team", "junit5"), "org.junit.platform": ("junit-team", "junit5"),
    "org.kohsuke.jinterop": ("skyghis", "j-interop-ng"),
    "org.kohsuke.stapler": ("jenkinsci", "stapler"), "io.jenkins.stapler": ("jenkinsci", "stapler"),
    "org.jenkins-ci.main": ("jenkinsci", "jenkins"),
    "org.jdom": ("hunterhacker", "jdom"), "org.antlr": ("antlr", "antlr4"),
    "com.thoughtworks.xstream": ("x-stream", "xstream"), "org.apache.ant": ("apache", "ant"),
    "net.jcip": ("stephenc", "jcip-annotations"), "org.jvnet.hudson": ("jenkinsci", "commons-jelly"),
    "org.jenkins-ci": None, "org.kohsuke": None,
}
JAVA_ARTIFACT_REPO = {
    "org.jenkins-ci:commons-jelly": ("jenkinsci", "commons-jelly"),
    "org.jenkins-ci.main:remoting": ("jenkinsci", "remoting"),
    "org.jenkins-ci.main:websocket-spi": ("jenkinsci", "jenkins"),
    "org.jfree:jfreechart": ("jfree", "jfreechart"), "org.jfree:jcommon": ("jfree", "jcommon"),
    "org.kohsuke:windows-package-checker": ("kohsuke", "windows-package-checker"),
    "org.kohsuke:access-modifier-annotation": ("jenkinsci", "lib-access-modifier"),
}


def java_repo(artifact, arts):
    if artifact in JAVA_ARTIFACT_REPO:
        return JAVA_ARTIFACT_REPO[artifact]
    group, art = artifact.split(":", 1)
    if JAVA_GROUP_REPO.get(group):
        return JAVA_GROUP_REPO[group]
    m = re.match(r"https?://(?:www\.)?github\.com/([^/]+)/([^/#?]+)", arts.get(artifact, {}).get("url", ""))
    if m:
        return (m.group(1).lower(), m.group(2).lower())
    return ("", art)


def match_java(audit, artifact, arts):
    org, name = java_repo(artifact, arts)
    key = lookup(audit, "Java", org, name)
    if not key:
        art = artifact.split(":", 1)[1]
        key = lookup(audit, "Java", "", art) or lookup(audit, "Java", "", art.replace("-core", ""))
    return (org, name), key


def py_repo(pkg, pins, repo_pins):
    repo = (pins.get(pkg) or {}).get("repo")
    if repo and repo_pins[repo] == 1 or (repo and repo.split("/", 1)[1] in (pkg, f"python-{pkg}", f"{pkg}-python", f"py{pkg}")):
        return tuple(repo.split("/", 1))
    return ("", pkg)


def match_py(audit, pkg, pins, repo_pins):
    org, name = py_repo(pkg, pins, repo_pins)
    key = lookup(audit, "Python", org, name)
    if not key:
        for cand in (pkg, f"python-{pkg}", f"{pkg}-python", f"py{pkg}", pkg.replace("python-", "")):
            key = lookup(audit, "Python", "", cand)
            if key:
                break
    return (org, name), key


# ---------------------------------------------------------------- ranking
def conemass(edges_csv):
    out = subprocess.run(["node", CONEMASS, edges_csv], capture_output=True, text=True, check=True).stdout
    return [{"rank": int(r["conemass_rank"]), "name": r["name"], "conemass": float(r["conemass"]),
             "dependents": int(r["direct_dependents"]), "dependents_rank": int(r["dependents_rank"])}
            for r in csv.DictReader(out.splitlines())]


def reach(edges_csv):
    """name -> number of packages in the graph that transitively depend on it."""
    up = collections.defaultdict(set)  # dependency -> direct dependents
    for row in csv.DictReader(open(edges_csv, encoding="utf-8")):
        up[row["dependency"]].add(row["dependent"])
    out = {}
    for x in list(up):
        seen, stack = set(), [x]
        while stack:
            for d in up.get(stack.pop(), ()):
                if d not in seen:
                    seen.add(d)
                    stack.append(d)
        seen.discard(x)  # a node inside a cycle reaches itself; do not count it
        out[x] = len(seen)
    return out


def study(label, edges_csv, matcher, root_repo, window, md):
    nodes = conemass(edges_csv)
    rch = reach(edges_csv)
    repos = {}  # repo key -> aggregate
    for n in nodes:
        guess, key = matcher(n["name"])
        rk = key[1:] if key else guess
        if rk == root_repo:
            continue
        r = repos.setdefault(rk, {"repo": "/".join(rk).strip("/"), "nodes": [], "rank": 10**9, "dependents_rank": 10**9, "key": key, "reach": 0})
        r["nodes"].append(n["name"])
        r["rank"] = min(r["rank"], n["rank"])
        r["dependents_rank"] = min(r["dependents_rank"], n["dependents_rank"])
        r["reach"] = max(r["reach"], rch.get(n["name"], 0))
    ranked = sorted(repos.values(), key=lambda r: (r["rank"], r["repo"]))
    for i, r in enumerate(ranked):  # re-rank at repo granularity (ties keep conemass order)
        r["rank"] = i + 1
    for i, r in enumerate(sorted(repos.values(), key=lambda r: (r["dependents_rank"], r["repo"]))):
        r["dependents_rank"] = i + 1
    n = len(ranked)
    for r in ranked:
        r["audit"] = summarize(AUDIT[r["key"]], window) if r["key"] else None
    scanned = [r for r in ranked if r["audit"]]
    buggy = [r for r in scanned if r["audit"]["bugs"] > 0]
    sec = [r for r in buggy if r["audit"]["sec"] > 0]
    high = [r for r in buggy if r["audit"]["severity"] == "High"]
    clean = [r for r in scanned if r["audit"]["bugs"] == 0]
    clean_other = [r for r in clean if r["audit"]["other"] > 0]

    md.append(f"\n## {label}\n")
    md.append(f"{len(nodes)} packages from {n} upstream repositories (the project's own repo excluded). "
              f"Matched to OpenRefactory audit rows dated {window[0]} to {window[1]}: {len(scanned)} repos scanned, "
              f"{len(buggy)} with bugs filed ({len(sec)} security/reliability, {len(high)} rated High), {len(clean)} scanned clean"
              + (f" (of which {len(clean_other)} had bugs filed in an earlier scan of another version: "
                 + ", ".join(sorted(r['repo'] for r in clean_other)) + ")" if clean_other else "") + ".\n")
    if not buggy:
        md.append("No matched findings.\n")
        return
    total = len(nodes)
    md.append("| repository (graph nodes) | conemass rank | by direct dependents | reach: packages that pull it in | bugs filed | severity | kind | audited |")
    md.append("|---|---:|---:|---:|---:|---|---|---|")
    for r in sorted(buggy, key=lambda r: r["rank"]):
        a = r["audit"]
        nodes_s = ", ".join(f"`{x}`" for x in sorted(r["nodes"])[:3]) + (f" +{len(r['nodes']) - 3}" if len(r["nodes"]) > 3 else "")
        md.append(f"| {r['repo']} ({nodes_s}) | {r['rank']} / {n} | {r['dependents_rank']} | {r['reach']} / {total} "
                  f"| {int(a['bugs'])} | {a['severity']} | {a['kind'][:40]} | {a['last']} |")

    def med(xs):
        xs = sorted(xs)
        return xs[len(xs) // 2] if xs else None

    md.append("")
    md.append(f"Median conemass rank: repos with bugs {med([r['rank'] for r in buggy])}, "
              f"repos scanned clean {med([r['rank'] for r in clean])}, all repos {(n + 1) // 2} (of {n}).")
    md.append("")
    md.append("Findings reached by a top-K scan budget, conemass order vs. direct-dependents order vs. expected at random:\n")
    md.append("| K | conemass: bugs / High | dependents: bugs / High | random: bugs / High |")
    md.append("|---:|---:|---:|---:|")
    hb, hh = {r["repo"] for r in buggy}, {r["repo"] for r in high}
    for k in [10, 25, 50, 100, 200]:
        if k > n:
            break
        cb = sum(1 for r in ranked if r["rank"] <= k and r["repo"] in hb)
        ch = sum(1 for r in ranked if r["rank"] <= k and r["repo"] in hh)
        db = sum(1 for r in ranked if r["dependents_rank"] <= k and r["repo"] in hb)
        dh = sum(1 for r in ranked if r["dependents_rank"] <= k and r["repo"] in hh)
        md.append(f"| {k} | {cb} / {ch} | {db} / {dh} | {len(buggy) * k / n:.1f} / {len(high) * k / n:.1f} |")
    md.append("")
    return ranked


AUDIT = None


def main():
    global AUDIT
    AUDIT = load_audit()
    md = ["# OpenRefactory's 2024 Alpha-Omega findings vs. conemass rank\n",
          "Generated by `analyze.py`. Audit data: OpenRefactory's public results sheet "
          "(linked from `ossf/alpha-omega`, engagements/2024/OpenRefactory). Graphs: see `fetch-*.py`.\n"]

    pins = json.load(open(os.path.join(HERE, "airflow-full-pins.json"), encoding="utf-8"))
    repo_pins = collections.Counter(v["repo"] for v in pins.values() if v.get("repo"))
    # Engagement windows, from the audit-start dates of the batches in the log
    # (Python rows 2024-08/09 at the Airflow 2.9.3 pins; Java rows from
    # 2024-09-29; Go rows 2024-11-01 to 2024-12-23).
    study("Apache Airflow 2.9.3, full constraints set", os.path.join(HERE, "airflow-full-edges.csv"),
          lambda p: match_py(AUDIT, p, pins, repo_pins), ("apache", "airflow"), ("2024-08-01", "2024-09-30"), md)

    arts = json.load(open(os.path.join(HERE, "jenkins-war-artifacts.json"), encoding="utf-8"))
    study("Jenkins 2.476 WAR", os.path.join(HERE, "jenkins-war-edges.csv"),
          lambda a: match_java(AUDIT, a, arts), ("jenkinsci", "jenkins"), ("2024-09-15", "2024-11-30"), md)

    study("Kubernetes v1.31.0", os.path.join(HERE, "kubernetes-edges.csv"),
          lambda m: match_go(AUDIT, m), ("kubernetes", "kubernetes"), ("2024-10-15", "2024-12-31"), md)

    text = "\n".join(md)
    if "--md" in sys.argv:
        open(sys.argv[sys.argv.index("--md") + 1], "w", encoding="utf-8").write(text + "\n")
    print(text)


if __name__ == "__main__":
    main()
