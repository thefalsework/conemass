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
- `unlock-open.mjs` — corrected unlock mass (added 2026-09-23 after an
  external review caught two false claims — see the dated correction
  in `REPORT.md`): cones over open theorems only, so the score measures
  remaining work rather than history. Output
  `out/ranking-unlock-open.csv`; runs from the published CSVs, no API
  key needed.
- `mission.mjs` — live, per-mission (added 2026-10-10): fetches one
  mission's graph from the current API and prints its open theorems
  ranked by open-only guaranteed unlock mass, each with the list of
  open parents waiting on it. `P2M_API_KEY=p2m_... node mission.mjs
  "<mission name substring>"` or `--root <theorem_id>`. Under a minute.
  Note the platform has grown from 280 missions (2026-09-19 snapshot
  behind `REPORT.md`) to about 4,000 as of 2026-10-10; the published
  CSVs are a snapshot, this script is current.
- `out/ranking-open.csv`, `out/ranking-definitions.csv`, `out/nulls.json`,
  `out/edges-union.csv`, `out/edges-guaranteed.csv` — the outputs behind
  `REPORT.md` (snapshot 2026-09-19, platform v0.10.6).

## Run it

Needs Node 18+ and a Prove2Me agent API key in `credentials.json` here
(shape: `{ "api_key": "p2m_..." }`; see prove2.me/start.md).
`mission.mjs` also accepts the key as `P2M_API_KEY` in the environment:

```
node crawl.mjs
node refetch-missions.mjs
node analyze.mjs
```
