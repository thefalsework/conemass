# conemass on the Mathlib declaration graph: registered run, no finding

2026-09-23. Registration: `REGISTRATION.md` in this folder, fixed
before the run. (Written as a local report the same day; published
unmodified with the study artifacts — see `README.md` for the file
map and how to reproduce.) Verdict up front: **the registered finding
criterion was not met.** No kill condition fired either; the run lands
in the registered in-between, and the honest reading is the F2 one —
foundational saturation in spirit if not by the letter of the
operationalization.

## Corpus and verification gate (passed)

MathNetwork/MathlibGraph, Mathlib commit 534cf0b (2026-02-02),
308,060 nodes with edges / 8,436,366 edges, elaborated-closure
dependencies (includes instances and implicit arguments). Direction
verified from data: source depends on target.

Spot checks: `Nat.succ_le_of_lt` has exactly the five dependencies its
statement mentions (`LE.le`, `LT.lt`, `Nat.succ`, two Nat instances),
right direction, no garbage.

Cross-pipeline check against mathlib-const-dep (lean_scout, different
commit): Jaccard 0.83 (`Nat.succ_le_of_lt`), 0.81 (`zsmul_eq_mul`),
0.46 (`List.mem_toFinset`). Every disagreement attributable: one
commit-drift rename (`NSMul` → `NatSMul`), const-dep retaining private
match auxiliaries and `congrArg`/`id` plumbing, and a documented
instance refactor between commits for the low scorer. No direction
disagreements.

One structural fact confirmed before the run: `@[to_additive]` mirror
pairs are condensed onto the multiplicative primary (`Finset.sum_congr`
has zero edges in either direction; `Finset.prod_congr` carries 658
dependents). Rankings therefore name multiplicative forms carrying the
combined load of both twins.

Mechanics: the 584 MB edge CSV exceeds Node's string limit, so it was
converted (streaming, no filtering) to conemass's documented JSON input
format. The published `conemass.mjs` was run unmodified, cap 200 (the
published-ranking cap). Full run: ~40 s.

## Results against the registered nulls

| Null | Spearman (all 308,060) | top-40 overlap |
|---|---|---|
| PageRank (primary) | **0.960** | 21/40 |
| in_degree | 0.953 | 18/40 |
| dag_layer | 0.837 | — |

**Registered verdicts:**

- F1 (re-expression, kill if >= 30/40 overlap): not fired — 21/40 (PR),
  18/40 (in-degree).
- F2 (foundational saturation, kill if >= 30/40 head rows with
  dag_layer <= 5 or core module): not fired as operationalized (17/40)
  — but the operationalization was written backwards. dag_layer in this
  dataset counts from the leaves, so foundational declarations have
  *high* layer (Eq.refl = 83, the maximum), not low. Substantively the
  head is 40/40 foundational: `outParam`, `autoParam`, `OfNat`,
  `Eq.symm`, `Eq.refl`, `LE`, `Membership`, `HAdd`, typeclass carriers
  and their constructors. The letter of F2 did not fire because the
  letter was miswritten; the spirit describes the head exactly.
- F3 (instance flooding): not fired — 1/40.

**Registered finding criterion: failed.** It required top-40 PageRank
overlap <= 20/40 AND divergent quiet-profile rows a maintainer would
recognize as real discovered load. Overlap was 21/40 — over the line by
one — and the divergence arm fails independently: the rows conemass
ranks high that in-degree misses (`OfNat` at dependent-rank 6,981, `LE`,
`Add`, `HAdd`) are precisely the rows PageRank *already* surfaces
(`OfNat` is PageRank's #1). The 19 head rows PageRank does not share are
`.mk` constructors and equality/iff proof plumbing (`Eq.mpr`,
`Eq.trans`, `of_eq_true`, `propext`) — structural companions of things
every metric finds, not discoveries.

## The informative sentence

On Debian, conemass and PageRank separated exactly where it mattered
(liblzma5: PageRank 36, conemass 8). On Mathlib they nearly coincide
(Spearman 0.960), and where they differ neither side is news. The
separation that makes conemass worth running is a property of the
*graph*, not the metric: ecosystem graphs — shallow, many independent
roots, wildly heterogeneous cone sizes — give the harmonic weighting
something to see that random-walk centrality misses. A deep, uniform,
single-project graph with an 83-layer spine and one bootstrap that
everything funnels through does not. This is the registered expected
shape ("the census again") and it happened.

## Unregistered descriptive observations (no claims)

- **Theorem stratum**: below the plumbing, the head of the
  Mathlib-module theorem stratum is structure axioms
  (`AddMonoid.add_zero`, in-degree 12, conemass rank 203 of 308K;
  `Semiring.mul_one`, `NonUnitalNonAssocSemiring.left_distrib`) — quiet
  under every other metric because references route through the
  structures, but inside essentially every cone. True, and known to
  anyone who knows Mathlib's architecture.
- **The `Nat.ble` bootstrap chain**: `Nat.ble_self_eq_true` (in-degree
  1, PageRank rank 32,815, dependent-rank 122,933) sits at conemass
  rank 657 of 308,060 — the kernel-reduction path that `decide` uses
  for numeral inequalities, invisible to every other metric, present in
  a vast share of cones. The closest thing to a liblzma-shaped row in
  the run; also the kind of thing a Lean core developer would shrug at.
  Left as an observation.
- **Cap sensitivity**: top-40 stable across cap 200 vs 800 (35/40) but
  top-1000 rank correlation only 0.789 — the cap binds harder here than
  on package registries, where the paper reports insensitivity 50–800.
  Any future Mathlib claim would need a cap-sensitivity section.

## Standing state

Fourth graph type: run, verified, nulled — and reported as
uninformative at the whole-graph level, which is what the registration
was for. The four-substrate version of the paper gains a clean negative
lane: conemass transfers mechanically to formal-mathematics monoliths
but adds nothing over PageRank there, and now that boundary is measured
rather than guessed. Test 3 (refactor-cost retrodiction against git
history) is untouched by this outcome and remains the design with
independent ground truth; its nulls (transitive-dependent count, file
age) are unaffected.

Files: `REGISTRATION.md`, `prep.mjs`, `xcheck.mjs`, `xcheck2.mjs`,
`analyze.mjs`, `strata.mjs`, `out-ranking.csv` (cap 200),
`out-ranking-cap800.csv`, `out-analysis.txt`, `out-strata.txt`,
`out-analysis.json`. Data in `data/` (HF downloads, Apache-2.0).
