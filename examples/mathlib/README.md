# conemass on the Mathlib declaration graph

Fourth graph type for the metric: after package archives (Debian),
crate registries (crates.io), and a collaborative proof platform
(Prove2Me), the declaration-level dependency graph of
[Mathlib](https://github.com/leanprover-community/mathlib4) — 308,060
declarations, 8.4M edges.

**Verdict up front, because this study's honesty is its point: the
registered finding criterion was not met.** conemass near-coincides
with PageRank on this graph (Spearman 0.960), and the head is
foundational plumbing every metric finds. **Read `REPORT.md`** for the
full analysis and `REGISTRATION.md` for the expectations and kill
conditions fixed before the run. This no-finding is load-bearing for
the paper's graph-anatomy section (where conemass separates from
PageRank and where it doesn't), and the depth measurement here
(`depth-stats.mjs`) is the out-of-family check on the falsework
program's truncated-cone-depth predictor.

## Data

[MathNetwork/MathlibGraph](https://huggingface.co/datasets/MathNetwork/MathlibGraph)
(Hugging Face, Apache-2.0): `mathlib_edges.csv` (584MB, not committed
here) and the declaration metrics table. Mathlib commit 534cf0b
(2026-02-02), Lean v4.28.0-rc1, lean-training-data premises
extraction (elaborated closure: instances and implicit arguments
included). Cross-checked against the independent mathlib-const-dep
extraction — see the verification gate in `REPORT.md`.

## Files

- `REGISTRATION.md` — expectations, nulls, kill conditions, fixed
  before the run.
- `REPORT.md` — corpus, verification gate, results against PageRank /
  in-degree / dag_layer, registered verdicts, honest reading.
- `prep.mjs` — streams the 584MB edges CSV into the JSON shape
  `conemass.mjs` accepts (Node string limits forbid one-shot reads).
- `xcheck.mjs`, `xcheck2.mjs` — verification gate: spot checks,
  cross-pipeline dependency comparison, `@[to_additive]` mirror
  handling.
- `analyze.mjs` — null analysis: Spearman + top-40/top-100 overlap vs
  the dataset's precomputed PageRank, in-degree, and dag_layer;
  registered verdicts F1–F3.
- `strata.mjs` — cap robustness (200 vs 800) and the theorem stratum.
- `depth-stats.mjs` — truncated-cone depth measurement (falsework
  out-of-family check; prediction stated in the header before running).
- `out-ranking.csv.gz`, `out-ranking-cap800.csv.gz` — full conemass
  rankings, both caps.
- `out-analysis.txt/json`, `out-strata.txt` — raw analysis output.

## Reproduce

```
# download mathlib_edges.csv and decl-metrics from the HF dataset into data/
node prep.mjs                                            # data/edges.json
node ../../conemass.mjs data/edges.json --cap 200 --out out-ranking.csv
node ../../conemass.mjs data/edges.json --cap 800 --out out-ranking-cap800.csv
node analyze.mjs       # nulls + verdicts
node strata.mjs        # cap robustness + theorem stratum
node depth-stats.mjs   # truncated-cone depth
```

The xcheck scripts additionally need `hyparquet` and
`hyparquet-compressors` (`npm i`) to read the dataset's parquet
metrics table; everything else is dependency-free.
