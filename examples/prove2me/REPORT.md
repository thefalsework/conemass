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
target-uses-source. Property 1 of the paper (a parent is verified once
all imported child lemmas are verified — it auto-resolves) makes the
unlock *list* exact: the set of parents that cannot complete without a
given open theorem is enumerable, not estimated. (The first version of
this report attached "exact" to the unlock *score* as well; that was
wrong — see the dated correction in the methods note.)

**Scope.** The platform-wide listing at the same snapshot contained
87,648 theorems (71,988 Proved, 5,363 Open, 7,553 Definitions, 2,744
Disproved). The 4,077-node corpus is what is reachable from mission
goals through the `/graph` endpoints' sketch and structural edges — the
curated decomposition skeleton (goal statements, milestones, accepted
sketch imports) — not the agent-generated intermediate layer beneath
each result, which is connected by Lean imports the graph API does not
expose. This is a scope choice, not truncation, and it was verified:
re-fetching the `fermat_last_theorem` mission graph live (2026-09-23)
returns 23 theorem nodes and 10 sketches, identical to the snapshot,
with no pagination, and all 280 mission graphs share the same skeletal
profile (largest: 317 theorem nodes). The rankings are therefore over
the curated mission structure, where the sketch semantics that make
the unlock list enumerable are defined — not over the full corpus.

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

(For the *dispatch* reading of this table — what to close next — see
the corrected open-only unlock ranking in the correction below: the
named rows above are largely stable under it, the mid-frontier is
not.)

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

**PageRank (added 2026-09-23, post-hoc).** The original nulls above were
registered before the rankings were read; this one was added later,
after a conemass run on the Mathlib declaration graph (308K nodes) found
near-coincidence with PageRank there (Spearman 0.96), which made the
same check on this graph obligatory. Result: over all 4,034 ranked
nodes, Spearman 0.81 and **33/40 top-40 overlap** — PageRank
(alpha=0.85, same edge orientation) surfaces nearly the same head,
including `StochasticBandit` at PageRank #2. So the practical top of
these rankings is not unique to conemass; a reader who would have used
PageRank instead loses little here. What the coincidence does not
touch: the comparisons against what the platform actually uses
(dependent count and `closability`, where the head genuinely diverges),
and the enumerability of unlock — Property 1 gives sketch edges
AND-semantics, so the parents a theorem blocks are a listed, checkable
set, a statement with no PageRank analog. (This sentence originally
said closing a theorem "releases exactly its mass" — false as
published; see the correction below. On the corrected open-only
object, the PageRank overlap drops to 18/40.) Script: `pagerank-null.mjs`. (An
earlier version of this paragraph, pushed the same morning, claimed a
clean boundary — separation on ecosystem graphs, coincidence on proof
graphs. Running the overlap on all four corpora the same day falsified
the clean version: top-40 conemass/PageRank overlap is 22/40 on
Debian, 35/40 on crates.io, 33/40 here, and ~coincident on Mathlib
(Spearman 0.96). The separation is strongest on Debian's layered
base-system topology and is not a simple package-vs-proof distinction;
the full numbers are in the paper's head-versus-bulk section.)

Where a parent theorem has several accepted sketches (182 of 1,565
sketch-bearing parents), only one alternative needs to complete, so the
union edge set over-states, and the guaranteed edge set (children in
every sketch) under-states, the blocking structure. The first version
of this paragraph called union mass "an upper bound on unlock" — false:
the brackets bound the *edge set*, not the harmonic score. Adding
members to a cone dilutes every member's 1/|cone| share, and in the
published CSV **71 of 504** open theorems score *higher* under the
guaranteed bracket than under union. The two orderings remain similar
(Spearman 0.87, 34/40 top-40 shared) — a similarity fact, not a bound.
Union numbers are reported and the guaranteed column is kept in the CSV.

## Correction (2026-09-23, same day, prompted by external review)

An external reviewer checked this report's claims against the published
CSVs and found two false. Both are corrected in place above; this
section is the accounting.

1. **"Union is an upper bound on unlock" — false for the mass.**
   71/504 published rows violate it (`flt_s2_gamma0_2_empty`: 1.20
   guaranteed vs 1.06 union). The brackets bound edge sets; harmonic
   mass is not monotone under cone growth. Corrected wording above.
2. **"Closing a theorem releases exactly its mass" — false.** The
   published score is computed on the full graph, so cones still
   contain already-proved children and credit is split over finished
   work. Exactness belongs to the enumerated parent list only. The
   corrected score — unlock mass on the **open-only subgraph** (an
   edge survives iff both endpoints are Open; proved children are done
   and transmit no blocking under Property 1) — is computed by
   `unlock-open.mjs`, output `out/ranking-unlock-open.csv`.

What the correction changes, measured: only 407 of the 8,333 union
edges are open–open (the frontier mostly hangs under proved
structure); 145 of 504 open theorems carry zero remaining-work mass;
against the published frontier the corrected one has top-40 overlap
22/40, top-10 overlap 5/10, Spearman 0.87, with large individual moves
(one row 67→497, another 172→3). The rows this report *named* survive:
Richstein 1→4, space-groups 2→2, the two WeakGoldbach lemmas 3→7 and
4→8, the zeta lemma 15→13. The bracket violation persists on the
corrected object (36/504), so the corrected wording is permanent, not
re-derived. Edge-set labeling, since nothing bounds anything and the
choice therefore matters: the comparison numbers just quoted are for
the **union** edge set, which is the CSV's sort order. On the
**guaranteed** edge set (the scheduler spec's recommendation for
dispatch) the corrected ordering agrees with the union one 37/40 in
the top-40 (7/10 in the top-10), and the named rows sit at Richstein
6, space-groups 2, zeta 10 — the CSV carries both columns. The
PageRank null rerun on the corrected object gives top-40 overlap
**18/40** on union edges and **23/40** on guaranteed edges (vs 33/40
on the published object) — under either edge set, remaining-work
unlock is more distinct from centrality than structural load was. The definition ranking is unaffected: for drift-audit the
full graph is the correct object, since a drifted definition
contaminates proved work too.

## Not claimed

- No claim that high-conemass open lemmas are *provable* — this is worth,
  not ease. Join against `closability` for effort allocation.
- Snapshot of one day on a fast-moving platform; rankings drift as
  missions are added. The tool reruns in minutes.
- One Debian retrodiction is one retrodiction; the credential is
  registered validation with reported losses, not infallibility.

## Reproduce

All scripts and outputs live at github.com/thefalsework/conemass under
`examples/prove2me/`:

```
node crawl.mjs                 # walk mission graphs -> out/edges-union.csv
node refetch-missions.mjs      # both edge variants + raw graphs cached
node analyze.mjs               # rankings, brackets, null checks
node unlock-open.mjs           # corrected open-only unlock (no API key needed)
```

Requires a Prove2Me agent API key in `credentials.json` (the first
three; `unlock-open.mjs` runs from the published CSVs alone). conemass
itself is a single dependency-free file, Apache-2.0, at the repo root.

Full outputs: `out/ranking-open.csv` (504 rows, both brackets, both null
columns), `out/ranking-unlock-open.csv` (corrected unlock, 504 rows),
`out/ranking-definitions.csv` (649 rows), `out/nulls.json`.
