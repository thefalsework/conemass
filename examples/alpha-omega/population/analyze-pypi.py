"""OpenRefactory's PyPI scans vs. conemass rank and reach, at population scale.

Reads repo-packages.csv and pypi-edges.csv (from fetch-pypi.py) and the
audit sheet, runs conemass.mjs on the population graph, and writes
RESULTS-PYPI.md. Pure python; permutation tests instead of scipy.

Two phases are analyzed separately because OpenRefactory's filing rate
changed: Aug-Dec 2023 produced 37-52 bug rows a month, 2024 produced
0-17 a month on ten times the scan volume.
"""
import csv, os, sys, random, subprocess, collections, statistics

HERE = os.path.dirname(os.path.abspath(__file__))
CONEMASS = os.path.join(HERE, "..", "..", "..", "conemass.mjs")
EDGES = os.path.join(HERE, "pypi-edges.csv")
random.seed(20261018)
SEV = {"High": 3, "Medium": 2, "Low": 1}
PHASES = [("2023 (Aug-Dec)", "2023-08-01", "2023-12-31"), ("2024 (Jan-Dec)", "2024-01-01", "2024-12-31")]


# ---- graph metrics ----
def conemass():
    out = subprocess.run(["node", CONEMASS, EDGES, "--reach"], capture_output=True, text=True, check=True).stdout
    nodes = {}
    for row in csv.DictReader(out.splitlines()):
        nodes[row["name"]] = {"rank": int(row["conemass_rank"]), "conemass": float(row["conemass"]),
                              "direct": int(row["direct_dependents"]), "reach": int(row["reach"])}
    return nodes


nodes = conemass()
N = len(nodes)

# ---- repo -> best package metrics ----
pkgs = collections.defaultdict(list)
isolated = 0
for r in csv.DictReader(open(os.path.join(HERE, "repo-packages.csv"), encoding="utf-8")):
    if not r["version"]:
        continue
    p = r["package"].lower().replace("_", "-").replace(".", "-")
    if p not in nodes:
        # resolved with no dependencies and nothing in the population depends on it:
        # a real member of the scanned population, at the bottom of every ordering
        nodes[p] = {"rank": N + 1, "conemass": 0.0, "direct": 0, "reach": 0}
        isolated += 1
    pkgs[r["repo"].lower()].append(p)
repo_metric = {}
for repo, ps in pkgs.items():
    best = min(ps, key=lambda p: nodes[p]["rank"])  # the repo's most load-bearing package
    m = dict(nodes[best]); m["package"] = best; m["n_packages"] = len(ps)
    repo_metric[repo] = m

# ---- audit rows ----
rows = list(csv.DictReader(open(os.path.join(HERE, "..", "openrefactory-all-projects.csv"), encoding="utf-8", errors="replace")))
def bugs(r):
    try:
        return int(r["# of Security/Reliability Bugs Filed"] or 0) + int(r["# of Logical/Other Bugs Filed"] or 0)
    except ValueError:
        return 0


def phase_rows(lo, hi):
    per = {}
    for r in rows:
        if r["Language"] != "Python" or r["Repository Host"] != "github.com":
            continue
        d = r["Audit Start Date"]
        if not (lo <= d <= hi):
            continue
        repo = f"{r['Organization'].strip()}/{r['Project Name (Alphabetical Order)'].strip()}".lower()
        if repo not in repo_metric:
            continue
        p = per.setdefault(repo, {"bugs": 0, "sev": 0, "sevname": "", "kinds": set(), "rows": 0, "secrel": 0})
        p["rows"] += 1
        b = bugs(r)
        p["bugs"] += b
        try:
            p["secrel"] += int(r["# of Security/Reliability Bugs Filed"] or 0)
        except ValueError:
            pass
        if b and SEV.get(r["Bug Severity"], 0) > p["sev"]:
            p["sev"], p["sevname"] = SEV[r["Bug Severity"]], r["Bug Severity"]
        if b and r["Bug Kind"]:
            p["kinds"].add(r["Bug Kind"])
    return per


# ---- stats helpers ----
def quantile_bins(values, k):
    s = sorted(values)
    cuts = [s[int(len(s) * i / k)] for i in range(1, k)]
    return cuts


def bin_index(v, cuts):
    i = 0
    while i < len(cuts) and v >= cuts[i]:
        i += 1
    return i


def perm_chi2(groups_of_flags, n_perm=5000):
    """Chi-square of hit counts across groups vs permutation of flags across groups."""
    flat = [f for g in groups_of_flags for f in g]
    sizes = [len(g) for g in groups_of_flags]
    total = sum(flat)
    def chi(gs):
        c = 0.0
        for g, n in zip(gs, sizes):
            e = total * n / len(flat)
            if e:
                c += (sum(g) - e) ** 2 / e
        return c
    obs = chi(groups_of_flags)
    ge = 0
    for _ in range(n_perm):
        random.shuffle(flat)
        gs, i = [], 0
        for n in sizes:
            gs.append(flat[i:i + n]); i += n
        if chi(gs) >= obs:
            ge += 1
    return obs, (ge + 1) / (n_perm + 1)


def rank_data(xs):
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    ranks = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return ranks


def spearman(xs, ys, n_perm=5000):
    rx, ry = rank_data(xs), rank_data(ys)
    def rho(a, b):
        ma, mb = statistics.mean(a), statistics.mean(b)
        num = sum((p - ma) * (q - mb) for p, q in zip(a, b))
        da = sum((p - ma) ** 2 for p in a) ** 0.5
        db = sum((q - mb) ** 2 for q in b) ** 0.5
        return num / (da * db) if da and db else 0.0
    obs = rho(rx, ry)
    ge = 0
    ry2 = ry[:]
    for _ in range(n_perm):
        random.shuffle(ry2)
        if abs(rho(rx, ry2)) >= abs(obs):
            ge += 1
    return obs, (ge + 1) / (n_perm + 1)


def perm_median_diff(a, b, n_perm=5000):
    obs = statistics.median(a) - statistics.median(b)
    pool = a + b
    ge = 0
    for _ in range(n_perm):
        random.shuffle(pool)
        if abs(statistics.median(pool[:len(a)]) - statistics.median(pool[len(a):])) >= abs(obs):
            ge += 1
    return obs, (ge + 1) / (n_perm + 1)


# ---- report ----
md = ["# OpenRefactory's PyPI scans vs. conemass, population scale\n",
      "Generated by `analyze-pypi.py` from `repo-packages.csv` and `pypi-edges.csv` (`fetch-pypi.py`, deps.dev) "
      "and the public results sheet.\n",
      f"Population graph: {N} PyPI packages, {sum(1 for _ in open(EDGES)) - 1} resolved dependency edges "
      f"(union of deps.dev's resolved graph for each scanned package at its audited or audit-date version). "
      f"{len(repo_metric)} scanned repositories map to a resolvable PyPI package ({isolated} of those packages have "
      "no edge at all and sit at the bottom of every ordering); a repository with several packages is represented "
      "by its best-ranked one.\n"]

for label, lo, hi in PHASES:
    per = phase_rows(lo, hi)
    repos = sorted(per)
    hit = [repo for repo in repos if per[repo]["bugs"] > 0]
    md.append(f"\n## {label}\n")
    md.append(f"{len(repos)} repositories scanned ({sum(per[r]['rows'] for r in repos)} audit rows), {len(hit)} with bugs filed "
              f"({sum(per[r]['bugs'] for r in hit)} bugs; {sum(1 for r in hit if per[r]['sevname'] == 'High')} High, "
              f"{sum(1 for r in hit if per[r]['sevname'] == 'Medium')} Medium, {sum(1 for r in hit if per[r]['sevname'] == 'Low')} Low; "
              f"{sum(1 for r in hit if per[r]['secrel'] > 0)} with a security/reliability bug).\n")
    if len(hit) < 5:
        md.append("Too few findings for the tables below.\n")
        continue

    # yield by conemass-rank quintile (within the scanned population)
    for metric, title, higher_is_more in (("rank", "conemass rank (1 = most load-bearing)", False), ("reach", "reach (transitive dependents)", True), ("direct", "direct dependents", True)):
        vals = [repo_metric[r][metric] for r in repos]
        if metric == "reach":
            cuts, names = [1, 5, 20, 100], ["0", "1-4", "5-19", "20-99", "100+"]
        elif metric == "direct":
            cuts, names = [1, 3, 10, 50], ["0", "1-2", "3-9", "10-49", "50+"]
        else:  # position in the full graph ranking; quantiles collapse on the large tie groups at the bottom
            cuts = [int(N * f) + 1 for f in (0.01, 0.05, 0.2, 0.5)]; names = ["top 1%", "1-5%", "5-20%", "20-50%", "bottom 50%"]
        groups = [[] for _ in range(len(cuts) + 1)]
        for r in repos:
            groups[bin_index(repo_metric[r][metric], cuts)].append(r)
        md.append(f"\nBug yield by {title}:\n")
        md.append("| bin | scanned | with bugs | yield | High |")
        md.append("|---|---:|---:|---:|---:|")
        flags = []
        for nm, g in zip(names, groups):
            h = [r for r in g if per[r]["bugs"] > 0]
            hi_ = sum(1 for r in h if per[r]["sevname"] == "High")
            md.append(f"| {nm} | {len(g)} | {len(h)} | {100 * len(h) / len(g):.1f}% | {hi_} |" if g else f"| {nm} | 0 | 0 | - | 0 |")
            flags.append([1 if per[r]["bugs"] > 0 else 0 for r in g])
        chi, p = perm_chi2([f for f in flags if f])
        md.append(f"\nChi-square across bins {chi:.2f}, permutation p = {p:.3f} "
                  f"({'yield differs across bins' if p < 0.05 else 'consistent with flat yield'}).\n")

    # severity vs reach among findings
    sev_vals = [(per[r]["sev"], repo_metric[r]["reach"]) for r in hit if per[r]["sev"]]
    if len(sev_vals) >= 10:
        rho, p = spearman([s for s, _ in sev_vals], [x for _, x in sev_vals])
        md.append(f"\nSeverity vs reach among the {len(sev_vals)} repositories with bugs: Spearman rho = {rho:+.3f}, permutation p = {p:.3f}.\n")
        md.append("| severity | repos | median reach | reach <= 4 | reach >= 100 |")
        md.append("|---|---:|---:|---:|---:|")
        for sname, sv in (("High", 3), ("Medium", 2), ("Low", 1)):
            xs = [x for s, x in sev_vals if s == sv]
            if xs:
                md.append(f"| {sname} | {len(xs)} | {statistics.median(xs):.0f} | {sum(1 for x in xs if x <= 4)} | {sum(1 for x in xs if x >= 100)} |")

    # reach: with bugs vs clean
    a = [repo_metric[r]["reach"] for r in hit]
    b = [repo_metric[r]["reach"] for r in repos if per[r]["bugs"] == 0]
    d, p = perm_median_diff(a, b)
    md.append(f"\nReach, repositories with bugs vs scanned clean: median {statistics.median(a):.0f} vs {statistics.median(b):.0f} "
              f"(difference {d:+.0f}, permutation p = {p:.3f}); mean {statistics.mean(a):.1f} vs {statistics.mean(b):.1f}.\n")

    # top-K budget
    md.append("\nFindings reached by a top-K scan budget over the scanned population, conemass order vs direct-dependents order vs random expectation:\n")
    md.append("| K | conemass: bugs / High | dependents: bugs / High | random: bugs / High |")
    md.append("|---:|---:|---:|---:|")
    by_cm = sorted(repos, key=lambda r: (repo_metric[r]["rank"], r))
    by_deg = sorted(repos, key=lambda r: (-repo_metric[r]["direct"], r))
    nH = sum(1 for r in hit if per[r]["sevname"] == "High")
    for K in (25, 50, 100, 200, 400):
        if K > len(repos):
            break
        def count(order):
            top = order[:K]
            return sum(1 for r in top if per[r]["bugs"] > 0), sum(1 for r in top if per[r]["sevname"] == "High")
        c1, c2 = count(by_cm), count(by_deg)
        md.append(f"| {K} | {c1[0]} / {c1[1]} | {c2[0]} / {c2[1]} | {len(hit) * K / len(repos):.1f} / {nH * K / len(repos):.1f} |")

    # the named rows: highest-reach findings and High findings at the leaves
    md.append("\nHighest-reach repositories with bugs:\n")
    md.append("| repository (package) | conemass rank | reach | direct | bugs | severity | kind |")
    md.append("|---|---:|---:|---:|---:|---|---|")
    for r in sorted(hit, key=lambda r: -repo_metric[r]["reach"])[:12]:
        m = repo_metric[r]
        md.append(f"| {r} (`{m['package']}`) | {m['rank']} / {N} | {m['reach']} | {m['direct']} | {per[r]['bugs']} | {per[r]['sevname']} | {'; '.join(sorted(per[r]['kinds']))} |")
    md.append("\nHigh-severity findings, sorted by reach:\n")
    md.append("| repository (package) | conemass rank | reach | direct | kind |")
    md.append("|---|---:|---:|---:|---|")
    for r in sorted((r for r in hit if per[r]["sevname"] == "High"), key=lambda r: -repo_metric[r]["reach"]):
        m = repo_metric[r]
        md.append(f"| {r} (`{m['package']}`) | {m['rank']} / {N} | {m['reach']} | {m['direct']} | {'; '.join(sorted(per[r]['kinds']))} |")

text = "\n".join(md)
open(os.path.join(HERE, "RESULTS-PYPI.md"), "w", encoding="utf-8").write(text + "\n")
print(text)
