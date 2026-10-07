# Unlock mass on the FLT blueprint

Second graph for the scheduler idea in `../prove2me/SCHEDULER-SPEC.md`:
open-only unlock mass on a human-curated Lean blueprint. The
[FLT project](https://github.com/ImperialCollegeLondon/FLT) (Buzzard et
al.) keeps a LaTeX blueprint where every statement declares what it
`\uses` and whether its statement and proof are formalised; contributors
pick work off the rendered dependency graph. This example ranks the
unproved statements by how much remaining work proving each one would
release, with the plain blocked-count and PageRank orderings alongside.

**Read `REPORT.md`** for the ranking, the null checks, what separates
unlock mass from blocked count on this graph, and the caveats.

## Files

- `extract.mjs` — parses the blueprint chapters that `content.tex`
  includes into `out/nodes.json` (per-statement type, chapter, Lean
  names, stated/proved/notready flags) and `out/edges.csv`
  (dependent → dependency from `\uses`). Honours `\leanok`,
  `\mathlibok` (upstreamed to Mathlib) and `\notready`.
- `analyze.mjs` — conemass on the subgraph induced on open nodes
  (unlock mass), plus direct open dependents, blocked descendants,
  sole-blocked count, open-cone size, a `ready` flag (every dependency
  proved, not `\notready`), PageRank on the open-only graph, and
  conemass on the full graph for reference. Writes
  `out/ranking-unlock.csv`, `out/nulls.json`, `out/summary.json`.
- `out/` — outputs at FLT commit `f6c6a2f` (2026-10-02).

## Run it

Needs Node 18+ and a clone of the blueprint repo (no credentials):

```
git clone --depth 1 https://github.com/ImperialCollegeLondon/FLT C:/dev/FLT   # or set FLT_DIR
node extract.mjs
node analyze.mjs
```
