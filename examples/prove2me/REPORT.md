# Two rankings of the Prove2Me dependency graph

**Chris Brink · September 2026**

**Provenance, in two sentences.** conemass is a dependency-graph ranking
that was validated before it touched this graph: on the last Debian
release before the xz backdoor it ranked liblzma5 #8 of 63,436 packages,
against #173 by dependent count, and the same result holds at every cone
cap tested (tool, data, and registered studies at
github.com/thefalsework/conemass). This is its third graph type — package
archives, then crate registries, now a formal-mathematics proof graph —
and the metric ran here unmodified, no tuning, same single file.

What it computes: conemass(x) = Σ over nodes u whose dependency cone
contains x of 1/|cone(u)| — count every toolchain you are part of,
weighting each by the reciprocal of its size. High mass with a low
dependent count is the quiet load-bearing profile.

## What this gives Prove2Me

Two rankings the platform does not currently compute, from a snapshot of
2026-09-19 (platform v0.10.6, public API): all 280 missions walked, giving
a mission-tree corpus of **4,077 nodes** (2,853 Proved, 521 Open, 657
Definition, 46 Disproved) and **8,333 dependency edges**. Sketch edges
were read as parent-depends-on-imported-children; structural edges as
target-uses-source. The unlock-mass reading is exact rather than
heuristic by the paper's own Property 1: a parent is verified once all
imported child lemmas are verified — it auto-resolves.

1. **Definition audit priority.** The paper fixes the audit surface in
   advance: humans review a mission's curated core — goal statement,
   definitions, milestone lemmas — and nothing beyond it. So the
   definitions are already the audit boundary; this ranking tells you
   which *audited* definitions carry the most downstream risk if the
   audit was wrong. Given the failure rate the paper itself cites for
   automated faithfulness checking (about 43% of proved statements
   faithful, Bourigault et al.), that risk is not hypothetical.
2. **Open-theorem frontier.** Which open lemmas sit under the most
   downstream mission structure — where proof effort buys the most
   unlock. Complementary to the platform's `closability` heuristic
   (in the docs, not the paper): theirs estimates *easy to close*,
   this estimates *worth closing*.

## Read this before the rankings: wrapper restatements

conemass rewards being a large share of someone's toolchain, and on this
graph that surfaces one degenerate class. `green_tao_theorem` scores mass
1.00 because exactly one theorem (`Green_Tao_Theorem`, a restatement)
depends on it and on nothing else — maximal concentration, minimal
unlock. Rows with mass ≥ 1 and transitive dependents ≤ 2 are wrappers,
not infrastructure; `transitive_dependents` is kept as a column in the
CSV so they filter out in one step. Rows where both are high are the
signal. (The metric was not modified to suppress this case; a validated
instrument stays validated by being filtered, not patched.)

## Ranking 1: definition audit priority (top 10 of 649)

| # | mass | direct deps | definition |
|---|---|---|---|
| 1 | 49.4 | 48 | `CircleMethod_char` |
| 2 | 26.3 | 3 | `StochasticBandit` |
| 3 | 24.8 | 58 | `MixingCoefficients` |
| 4 | 23.0 | 14 | `BanditPolicy` |
| 5 | 21.6 | 5 | `MTT_Arithmetic` |
| 6 | 21.6 | 11 | `Erdos9796Mission` |
| 7 | 21.5 | 26 | `BookSixth` |
| 8 | 20.6 | 10 | `mm_basic` |
| 9 | 20.6 | 10 | `mme_tensor` |
| 10 | 20.2 | 28 | `frame_2026_symplectic_free_modules_interfaces` |

Ranks #1 and #3 (`CircleMethod_char`, `MixingCoefficients`) are
high-fan-out definitions where conemass and plain dependent count agree —
any metric finds them, and they prove nothing about this one. The rows
worth attention are the low-fan-out entries, where the two metrics come
apart.

The row to look at is #2. `StochasticBandit` has **three** direct
dependents and the second-highest audit-priority score on the platform:
the entire Bandit Algorithms textbook mission (151K LOC) transitively
rests on it through those three edges. A semantic drift in that one
definition silently contaminates one of the largest missions hosted, and
no dependent-count view flags it — it is the liblzma profile transposed
to formalization. `MTT_Arithmetic` (5 dependents, #5) has the same shape.

## Ranking 2: open-theorem frontier (top 15 of 504)

| # | mass | trans. deps | lemma |
|---|---|---|---|
| 1 | 1.73 | 13 | `Richstein2001.segmented_sieve_coverage` |
| 2 | 1.70 | 4 | `LeanEval.Geometry.SpaceGroupsProblem.space_groups_master_classification` |
| 3 | 1.56 | 9 | `WeakGoldbach.prime_in_4e18_window_from_4e18_to_8875e30` |
| 4 | 1.54 | 11 | `WeakGoldbach.symmetric_pair_main_term_above_2e18` |
| 5 | 1.50 | 2 | `hardy_littlewood_conjecture_A` |
| 6 | 1.40 | 12 | `WeakGoldbach.verified_range_sieve_coverage` |
| 7 | 1.33 | 2 | `Hadamard.exists_orthogonal_pm_one` |
| 8 | 1.23 | 12 | `Richstein2001.even_goldbach_up_to_4e14` |
| 9 | 1.19 | 10 | `RybinAI2026.P01.crossIntegral_single_slot_normalized_sum_le_one` |
| 10 | 1.10 | 5 | `RybinAI2026.P16.base_four_partial_hadamards` |
| 11 | 1.10 | 5 | `RybinAI2026.P16.extend_four_to_five_partial_hadamards` |
| 12 | 1.07 | 5 | `OddPerfectNumber.k_one_deficiency_impossible` |
| 13 | 1.06 | 8 | `WeakGoldbach.prime_in_4e18_window_to_8875e30` |
| 14 | 1.06 | 15 | `flt_s2_gamma0_2_empty` |
| 15 | 1.05 | 5 | `zeta_ne_zero_of_strip_of_six_lt_im` |

The Weak Goldbach verification lemmas dominate because that mission is a
deep gated chain — a true fact about where its bottleneck is, confirmed
rather than manufactured (they also rank top-20 by transitive count). The
conemass-specific finds are the concentrated anchors that raw counting
buries: `zeta_ne_zero_of_strip_of_six_lt_im` is rank 15 here and rank 63
by transitive count, because its five dependents form an induction chain
of strip-widening lemmas that rely on almost nothing else.

The paper closes by asking how agents should search a large, evolving
corpus of formal statements. A prioritized frontier is a search order;
this ranking is a partial answer to that question, computable from the
graph the platform already maintains.

## Methods note: null checks and brackets

Of the 521 Open nodes, 504 appear in the frontier ranking: 5 are
edge-isolated (standalone conjecture statements such as `ABC_Conjecture`
and `Schanuel.schanuel_conjecture`), 8 are same-name duplicates of other
Open theorems across verification environments and merge into single
rows, and 4 share a name with a Proved theorem in another environment
and are excluded as status-ambiguous rather than guessed at.

Null checks were run before the rankings were interpreted, over the
504-lemma open stratum only. Against transitive-dependent count — the
ranking a reasonable person would propose instead — conemass has Spearman
0.80 but only **16/40 top-40 overlap**; against longest-chain depth,
Spearman 0.81 and again 16/40 (exact values 0.7995 and 0.805 in
`out/nulls.json`). High agreement in the bulk, disagreement precisely at
the top, which is where an allocation signal is consumed: 24 of the top
40 are rows the null models miss.

Where a parent theorem has several accepted sketches (182 of 1,565
sketch-bearing parents), only one alternative needs to complete, so cone
mass under the sketch-union is an upper bound on unlock; a second run
using only children shared by every sketch (the guaranteed lower bracket)
moves almost nothing (Spearman 0.87, 34/40 top-40 shared), so union
numbers are reported and the guaranteed column is kept in the CSV.

## Not claimed

- No claim that high-conemass open lemmas are *provable* — this is worth,
  not ease. Join against `closability` for effort allocation.
- Snapshot of one day on a fast-moving platform; rankings drift as
  missions are added. The tool reruns in minutes.
- One Debian retrodiction is one retrodiction; the credential is
  registered validation with reported losses, not infallibility.

## Reproduce

```
node crawl.mjs                 # walk mission graphs -> out/edges-union.csv
node refetch-missions.mjs      # both edge variants + raw graphs cached
node analyze.mjs               # rankings, brackets, null checks
```

Requires a Prove2Me agent API key in `credentials.json`. conemass itself
is a single dependency-free file, Apache-2.0:
github.com/thefalsework/conemass.

Full outputs: `out/ranking-open.csv` (504 rows, both brackets, both null
columns), `out/ranking-definitions.csv` (649 rows), `out/nulls.json`.
