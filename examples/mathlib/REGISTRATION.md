# Registered: conemass on the Mathlib declaration graph (fourth graph type)

2026-09-23, written before the metric was run on this corpus. The
point of this file is that the interpretation rules below were fixed
before any conemass number was seen. (Originally kept local while the
run and its report were completed; published unmodified with the rest
of the study artifacts the same day. "Local, private" in the original
text referred to that pre-publication state.)

## Corpus

MathNetwork/MathlibGraph (HF, Apache-2.0), Mathlib commit 534cf0b of
2026-02-02, Lean v4.28.0-rc1. `mathlib_edges.csv`: 8,436,366 edges over
308,129 deduplicated declarations (317,655 before `@[to_additive]`
dedup). Edge direction verified from data: source depends on target.
Edges come from lean-training-data premises extraction — constants
referenced from type or proof term, elaborated closure including
instances and implicit arguments (74.2% of edges are not visible in
pretty-printed source; both explicit and implicit edges are used, as in
every prior conemass run, because implicit load is load). Known wart,
disclosed by the dataset: a small set of edges reference names missing
from the node table (~16K sources, ~13K targets in the 633K-node full
environment); these are kept as graph nodes without metadata. 5,732
nodes sit in dependency cycles; conemass handles cycles by SCC
condensation (shared score), as documented in its README.

Cone cap 200, matching the published Debian and crates rankings.

## Verification gate (must pass before the run is interpreted)

1. Spot-check >= 5 known declarations: dependencies present, direction
   correct, no obvious garbage.
2. Cross-pipeline check against mathlib-initiative/mathlib-const-dep
   (independent extraction, lean_scout, different Mathlib commit): for
   the same declarations, compare direct-dependency sets; report the
   agreement/disagreement rate and eyeball whether disagreements are
   commit drift or semantics. If the two pipelines disagree wildly
   (majority of deps mismatched on same-commit-stable declarations),
   stop and diagnose before running anything.

## Nulls (computed from the dataset's own metrics table)

- **Primary: PageRank** (alpha=0.85, precomputed). This is the Pfeiffer
  comparison the paper already makes on Debian.
- Secondary: in_degree (dependent count — the incumbent everywhere).
- Tertiary: dag_layer (depth), because this week's lesson is that depth
  quietly explains things.

Statistics, same as Prove2Me: Spearman over all common nodes, plus
top-40 overlap, per null. Disagreement at the top is where the metric
earns or fails to earn its keep.

## Registered expectations and kill conditions

Expected shape if the metric adds signal (the claim its record makes):
the head diverges from PageRank and in_degree at the top, and the
divergent rows show the quiet profile — conemass rank far ahead of
in_degree rank.

**Flat/uninformative verdicts, fixed now:**

- F1 (re-expression): >= 30/40 of the conemass top-40 shared with the
  PageRank top-40, or with the in_degree top-40. Then conemass
  re-expresses centrality on this graph and adds nothing here.
- F2 (foundational saturation): >= 30/40 of the conemass top-40 are
  foundational bootstrap declarations — operationalized as dag_layer
  <= 5, or Lean-core rows (null module in the nodes table). Mathlib is
  deep and uniform; if the head is all `Eq`/`Iff`/core plumbing that
  every metric finds, the run is the census again: true, known, and
  uninformative.
- F3 (instance flooding): if the head is dominated by typeclass
  instances (is_instance), that is the wrapper-restatement analog. Per
  house rule the metric is not patched: report the head with and
  without instance rows, and say which stratum any claim lives in.

**What would count as a finding:** top-40 overlap with PageRank <= 20/40
AND at least a handful of divergent head rows with the quiet profile
that a Mathlib maintainer would recognize as real load (the
`StochasticBandit` analog). No specific declarations are predicted.

## Not claimed in advance

Descriptive run. No maintenance, refactor-cost, or audit claims — those
belong to the separately-designed test 3 (refactor-cost retrodiction,
nulls: transitive-dependent count and file age), not to this run.
