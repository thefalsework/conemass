"""Retrodiction on a citation graph: rank papers at a snapshot year using
only the citation structure up to then, and score the rankings against
citations received afterwards.

  python analyze.py [--snapshot 2012] [--end 2020]

Reads nodes.csv / edges.csv (fetch.py). Rankings at the snapshot:
conemass (cone = transitive references within the slice), citation
count at the snapshot (direct dependents), PageRank on the same graph.
Outcomes: in-slice citations from papers published after the snapshot,
and OpenAlex's all-source citation counts for the same years.
Writes RESULTS.md. Pure python plus conemass.mjs.
"""
import csv, gzip, os, sys, random, subprocess, statistics, collections, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))


def openc(name):  # nodes.csv / edges.csv, gzipped in the repo
    p = os.path.join(HERE, name)
    return gzip.open(p + ".gz", "rt", encoding="utf-8") if os.path.exists(p + ".gz") else open(p, encoding="utf-8")
CONEMASS = os.path.join(HERE, "..", "..", "conemass.mjs")
arg = lambda k, d: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
SNAP = int(arg("--snapshot", 2012))
END = int(arg("--end", 2020))
CAP = arg("--cap", "200")
random.seed(20261018)

# ---- load ----
nodes = {}
for r in csv.DictReader(openc("nodes.csv")):
    nodes[r["id"]] = {"year": int(r["year"] or 0), "title": r["title"], "type": r["type"],
                      "cited_by": int(r["cited_by_count"]), "after_all": int(r[f"cites_{SNAP + 1}_{END}"])}
snap = {i for i, n in nodes.items() if n["year"] <= SNAP}
snap_edges, future_in = [], collections.Counter()
for r in csv.DictReader(openc("edges.csv")):
    a, b = r["citing"], r["cited"]
    if a in snap and b in snap:
        snap_edges.append((a, b))
    elif b in snap and a in nodes and nodes[a]["year"] > SNAP:
        future_in[b] += 1
print(f"{len(snap)} snapshot papers, {len(snap_edges)} edges among them, "
      f"{sum(future_in.values())} citations from {SNAP + 1}-{END} slice papers", file=sys.stderr)

# ---- conemass + reach ----
with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, newline="", encoding="utf-8") as tf:
    w = csv.writer(tf); w.writerow(["dependent", "dependency"]); w.writerows(snap_edges)
    tfn = tf.name
out = subprocess.run(["node", CONEMASS, tfn, "--reach", "--cap", CAP], capture_output=True, text=True, check=True).stdout
os.unlink(tfn)
cm, deg, reach, cmrank = {}, {}, {}, {}
for r in csv.DictReader(out.splitlines()):
    cm[r["name"]] = float(r["conemass"]); deg[r["name"]] = int(r["direct_dependents"])
    reach[r["name"]] = int(r["reach"]); cmrank[r["name"]] = int(r["conemass_rank"])
for i in snap:  # isolated snapshot papers
    cm.setdefault(i, 0.0); deg.setdefault(i, 0); reach.setdefault(i, 0)

# ---- PageRank on the citation graph (citing -> cited) ----
def pagerank(ids, edges, d=0.85, iters=60):
    idx = {x: k for k, x in enumerate(ids)}
    n = len(ids)
    outdeg = [0] * n
    adj = [[] for _ in range(n)]
    for a, b in edges:
        adj[idx[a]].append(idx[b]); outdeg[idx[a]] += 1
    pr = [1.0 / n] * n
    for _ in range(iters):
        new = [(1 - d) / n] * n
        dangling = sum(pr[k] for k in range(n) if not outdeg[k]) * d / n
        for k in range(n):
            if outdeg[k]:
                share = d * pr[k] / outdeg[k]
                for j in adj[k]:
                    new[j] += share
        pr = [v + dangling for v in new]
    return {ids[k]: pr[k] for k in range(n)}


ids = sorted(snap)
pr = pagerank(ids, snap_edges)

# ---- helpers ----
def order(score, tiebreak=None):
    return sorted(ids, key=lambda i: (-score[i], -(tiebreak or deg)[i], i))


def rank_data(xs):
    o = sorted(range(len(xs)), key=lambda i: xs[i])
    ranks = [0.0] * len(xs); i = 0
    while i < len(o):
        j = i
        while j + 1 < len(o) and xs[o[j + 1]] == xs[o[i]]:
            j += 1
        for k in range(i, j + 1):
            ranks[o[k]] = (i + j) / 2 + 1
        i = j + 1
    return ranks


def spearman(xs, ys):
    rx, ry = rank_data(xs), rank_data(ys)
    mx, my = statistics.mean(rx), statistics.mean(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    dx = sum((a - mx) ** 2 for a in rx) ** 0.5; dy = sum((b - my) ** 2 for b in ry) ** 0.5
    return num / (dx * dy) if dx and dy else 0.0


def perm_median(a, b, n=3000):
    obs = statistics.median(a) - statistics.median(b)
    pool = a + b; ge = 0
    for _ in range(n):
        random.shuffle(pool)
        if abs(statistics.median(pool[:len(a)]) - statistics.median(pool[len(a):])) >= abs(obs):
            ge += 1
    return obs, (ge + 1) / (n + 1)


rankings = {"conemass": order(cm), "citations at snapshot": order(deg, cm), "PageRank": order(pr)}
outcomes = {f"in-slice citations {SNAP + 1}-{END}": lambda i: future_in.get(i, 0),
            f"OpenAlex citations {SNAP + 1}-{END}": lambda i: nodes[i]["after_all"]}
title = lambda i: nodes[i]["title"][:70]

md = [f"# Citation retrodiction: OpenAlex topic T10320, snapshot {SNAP}, cap {CAP}\n",
      "Generated by `analyze.py` from `nodes.csv` / `edges.csv` (`fetch.py`).\n",
      f"{len(snap)} papers published through {SNAP} with reference lists, {len(snap_edges)} citation edges among them "
      f"(references to works outside the topic are not in the graph). Rankings use only this graph. Outcomes: "
      f"citations received from the {len(nodes) - len(snap)} topic papers published {SNAP + 1}-{END} "
      f"({sum(future_in.values())} edges), and OpenAlex's all-source citation counts for the same years.\n"]

# head overlap
md.append("\n## Top-40 overlap between snapshot rankings\n")
md.append("| | conemass | citations | PageRank |")
md.append("|---|---:|---:|---:|")
names = list(rankings)
for a in names:
    md.append(f"| {a} | " + " | ".join(str(len(set(rankings[a][:40]) & set(rankings[b][:40]))) for b in names) + " |")

# rank correlation with outcomes
md.append("\n## Rank correlation with later citations\n")
md.append("Spearman rho between each snapshot score and each outcome, over all snapshot papers and over those with at least one in-slice citation at the snapshot.\n")
md.append("| score | outcome | rho (all) | rho (cited >= 1) | rho (cited >= 5) |")
md.append("|---|---|---:|---:|---:|")
scores = {"conemass": cm, "citations at snapshot": deg, "PageRank": pr, "reach": reach}
subsets = {"all": ids, "c1": [i for i in ids if deg[i] >= 1], "c5": [i for i in ids if deg[i] >= 5]}
for sname, sc in scores.items():
    for oname, of in outcomes.items():
        vals = [spearman([sc[i] for i in sub], [of(i) for i in sub]) for sub in subsets.values()]
        md.append(f"| {sname} | {oname} | {vals[0]:+.3f} | {vals[1]:+.3f} | {vals[2]:+.3f} |")

# precision at K against future top-K
md.append("\n## Head precision\n")
md.append(f"Of the top K by each snapshot ranking, how many are in the top K by in-slice citations {SNAP + 1}-{END}.\n")
md.append("| K | conemass | citations at snapshot | PageRank |")
md.append("|---:|---:|---:|---:|")
fut_order = sorted(ids, key=lambda i: (-future_in.get(i, 0), -nodes[i]["after_all"], i))
for K in (40, 100, 400, 1000):
    top = set(fut_order[:K])
    md.append(f"| {K} | " + " | ".join(str(len(set(rankings[r][:K]) & top)) for r in names) + " |")

# does conemass add information beyond citation count? within-bin correlation
md.append("\n## Within citation-count bins\n")
md.append("Papers binned by citation count at the snapshot; within each bin, Spearman rho of conemass and of PageRank with later in-slice citations. This is the test of whether the structure adds anything beyond the count.\n")
md.append("| citations at snapshot | papers | rho conemass | rho PageRank | rho reach |")
md.append("|---|---:|---:|---:|---:|")
bins = [(0, 0, "0"), (1, 1, "1"), (2, 4, "2-4"), (5, 9, "5-9"), (10, 19, "10-19"), (20, 49, "20-49"), (50, 10 ** 9, "50+")]
for lo, hi, nm in bins:
    sub = [i for i in ids if lo <= deg[i] <= hi]
    if len(sub) < 30:
        continue
    f = [future_in.get(i, 0) for i in sub]
    md.append(f"| {nm} | {len(sub)} | {spearman([cm[i] for i in sub], f):+.3f} | {spearman([pr[i] for i in sub], f):+.3f} | {spearman([reach[i] for i in sub], f):+.3f} |")

# age-controlled: cells of citation-count bin x publication period
md.append("\n## Within citation-count x period cells\n")
md.append("The same, with publication period held fixed as well (older papers have larger reference closures and fewer future citations, which confounds the table above). Weighted mean of within-cell rho over cells with at least 30 papers.\n")
md.append("| period | papers | cells | rho conemass | rho PageRank | rho reach |")
md.append("|---|---:|---:|---:|---:|---:|")
periods = [(0, 1989, "to 1989"), (1990, 1999, "1990-1999"), (2000, 2006, "2000-2006"), (2007, 2012, "2007-2012")]
for plo, phi, pname in periods:
    acc = {"cm": 0.0, "pr": 0.0, "rc": 0.0}; wsum = 0; ncell = 0
    for lo, hi, _ in bins[1:]:
        cell = [i for i in ids if plo <= nodes[i]["year"] <= phi and lo <= deg[i] <= hi]
        if len(cell) < 30:
            continue
        f = [future_in.get(i, 0) for i in cell]
        acc["cm"] += len(cell) * spearman([cm[i] for i in cell], f)
        acc["pr"] += len(cell) * spearman([pr[i] for i in cell], f)
        acc["rc"] += len(cell) * spearman([reach[i] for i in cell], f)
        wsum += len(cell); ncell += 1
    if wsum:
        md.append(f"| {pname} | {wsum} | {ncell} | {acc['cm'] / wsum:+.3f} | {acc['pr'] / wsum:+.3f} | {acc['rc'] / wsum:+.3f} |")

# quiet load-bearing: high conemass, few direct citations
md.append("\n## Quiet load-bearing papers\n")
quiet = [i for i in rankings["conemass"][:300] if deg[i] <= 5]
md.append(f"Papers in the conemass top 300 at {SNAP} with at most 5 in-slice citations at the time: {len(quiet)}. "
          f"Their later citations against papers with the same snapshot citation count and conemass rank beyond 2000:\n")
if quiet:
    a = [future_in.get(i, 0) for i in quiet]
    ctrl = []
    by_deg = collections.defaultdict(list)
    for i in ids:
        if cmrank.get(i, 10 ** 9) > 2000:
            by_deg[deg[i]].append(i)
    for i in quiet:
        pool = by_deg.get(deg[i], [])
        if pool:
            ctrl.extend(random.sample(pool, min(5, len(pool))))
    b = [future_in.get(i, 0) for i in ctrl]
    if a and b:
        d, p = perm_median(a, b)
        md.append(f"median in-slice citations {SNAP + 1}-{END}: quiet {statistics.median(a):.0f} vs matched {statistics.median(b):.0f} "
                  f"(mean {statistics.mean(a):.1f} vs {statistics.mean(b):.1f}; permutation p = {p:.3f}, n = {len(a)} vs {len(b)}).\n")
    md.append("| paper | year | conemass rank | cites at snapshot | reach | in-slice cites after | OpenAlex cites after |")
    md.append("|---|---:|---:|---:|---:|---:|---:|")
    for i in sorted(quiet, key=lambda i: cmrank[i])[:20]:
        md.append(f"| {title(i)} (`{i}`) | {nodes[i]['year']} | {cmrank[i]} | {deg[i]} | {reach[i]} | {future_in.get(i, 0)} | {nodes[i]['after_all']} |")

# named heads
for rname in ("conemass", "citations at snapshot"):
    md.append(f"\n## Top 15 by {rname} at {SNAP}\n")
    md.append("| paper | year | conemass rank | cites at snapshot | reach | in-slice cites after | OpenAlex cites after |")
    md.append("|---|---:|---:|---:|---:|---:|---:|")
    for i in rankings[rname][:15]:
        md.append(f"| {title(i)} (`{i}`) | {nodes[i]['year']} | {cmrank.get(i, '-')} | {deg[i]} | {reach[i]} | {future_in.get(i, 0)} | {nodes[i]['after_all']} |")

text = "\n".join(md)
open(os.path.join(HERE, "RESULTS.md"), "w", encoding="utf-8").write(text + "\n")
print(text)
