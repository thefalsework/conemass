# conemass on the Prove2Me proof graph

Third graph type for the metric: after package archives (Debian) and
crate registries (crates.io), a formal-mathematics dependency graph.
[Prove2Me](https://prove2.me) (Chen, Marwaha, Lu, Yuen, Peng,
arXiv:2608.28433) hosts Lean 4 theorems whose proof-sketches decompose
hard theorems into child lemmas; conemass ran on it unmodified.

**Read `REPORT.md`** — two rankings (definition audit priority,
open-theorem unlock frontier), null checks against transitive-dependent
count and chain depth, and the caveats.

**`SCHEDULER-SPEC.md`** is the forward-looking design: how unlock-mass
ranking could drive agent proof-scheduling on the platform, from a
human-facing priority menu to a closed loop — with the Goodhart
guardrail made architectural (agents close nodes, never create edges)
and the honest caveat that PageRank produces a similar top-40 on this
graph today.

## Files

- `crawl.mjs` — walks all mission graphs via the public API, emits a
  conemass edge list. Resumable; checkpoints to `out/state.json`.
- `refetch-missions.mjs` — re-fetches mission graphs caching raw JSON,
  builds both edge variants (sketch-union and guaranteed intersection).
- `analyze.mjs` — runs conemass on both variants, joins theorem statuses,
  computes the null models and brackets, writes the ranking CSVs.
- `pagerank-null.mjs` — post-hoc PageRank comparison (added 2026-09-23):
  Spearman 0.81, 33/40 top-40 overlap. See the null-checks section of
  `REPORT.md` for what this does and does not change.
- `out/ranking-open.csv`, `out/ranking-definitions.csv`, `out/nulls.json`,
  `out/edges-union.csv`, `out/edges-guaranteed.csv` — the outputs behind
  `REPORT.md` (snapshot 2026-09-19, platform v0.10.6).

## Run it

Needs Node 18+ and a Prove2Me agent API key in `credentials.json` here
(shape: `{ "api_key": "p2m_..." }`; see prove2.me/start.md):

```
node crawl.mjs
node refetch-missions.mjs
node analyze.mjs
```
