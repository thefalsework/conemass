#!/usr/bin/env python3
"""Dependency graph of the full Apache Airflow 2.9.3 install universe.

OpenRefactory's audit counted "719 dependencies" for Airflow, i.e. the full
constraints set (core + all providers/extras), not the 137 packages a bare
`pip install apache-airflow` pulls. Airflow publishes that set as a pinned
constraints file per Python version; this script takes the pins (plus
apache-airflow itself, which the file does not pin) and derives edges from
each pinned release's PyPI metadata (Requires-Dist, non-extra requirements
only), keeping only edges whose target is itself in the constraints set.
Output: edge list.
"""
import concurrent.futures as cf
import json
import re
import sys
import urllib.request

CONSTRAINTS = "https://raw.githubusercontent.com/apache/airflow/constraints-2.9.3/constraints-3.12.txt"


def norm(n):
    return re.sub(r"[-_.]+", "-", n).lower()


def get_json(url):
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            return json.load(r)
    except Exception:
        return None


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    with urllib.request.urlopen(CONSTRAINTS, timeout=60) as r:
        text = r.read().decode()
    pins = {}
    for line in text.splitlines():
        m = re.match(r"^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?==(\S+)", line.strip())
        if m:
            pins[norm(m.group(1))] = (m.group(1), m.group(2))
    # the constraints file pins everything except airflow itself
    pins["apache-airflow"] = ("apache-airflow", "2.9.3")
    print(f"{len(pins)} pinned packages in constraints-2.9.3/constraints-3.12.txt (+ apache-airflow)", file=sys.stderr)

    def deps_of(key):
        name, ver = pins[key]
        j = get_json(f"https://pypi.org/pypi/{name}/{ver}/json")
        if not j:
            return key, None, None
        out = set()
        for req in j["info"].get("requires_dist") or []:
            # skip optional (extra) requirements: including them turns dev/test
            # extras into edges and collapses the graph into one big cycle
            if re.search(r"extra\s*==", req):
                continue
            m = re.match(r"^\s*([A-Za-z0-9][A-Za-z0-9._-]*)", req)
            if m:
                out.add(norm(m.group(1)))
        # upstream GitHub repo, for matching against audit records (which are
        # keyed by repository, not by PyPI name)
        urls = list((j["info"].get("project_urls") or {}).values()) + [j["info"].get("home_page") or ""]
        repo = None
        for u in urls:
            m = re.match(r"https?://(?:www\.)?github\.com/([^/\s]+)/([^/\s#?]+)", u or "")
            if m:
                repo = f"{m.group(1)}/{m.group(2).removesuffix('.git')}".lower()
                break
        return key, out, repo

    edges, missing, repos = set(), [], {}
    with cf.ThreadPoolExecutor(16) as ex:
        for key, deps, repo in ex.map(deps_of, list(pins)):
            if deps is None:
                missing.append(key)
                continue
            repos[key] = repo
            for d in deps:
                if d in pins and d != key:
                    edges.add((key, d))
    path = f"{out_dir}/airflow-full-edges.csv"
    with open(path, "w", encoding="utf-8") as f:
        f.write("dependent,dependency\n" + "\n".join(f"{a},{b}" for a, b in sorted(edges)) + "\n")
    with open(f"{out_dir}/airflow-full-pins.json", "w", encoding="utf-8") as f:
        json.dump({k: {"version": v[1], "repo": repos.get(k)} for k, v in pins.items()}, f, indent=0, sort_keys=True)
    print(f"airflow-full: {len(pins)} packages, {len(edges)} edges -> {path}; metadata missing for {len(missing)}: {missing[:10]}")


if __name__ == "__main__":
    main()
