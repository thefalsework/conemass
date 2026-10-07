# Unlock mass on the FLT blueprint: a second graph for the scheduler

**Chris Brink · October 2026**

**What this tests.** `../prove2me/SCHEDULER-SPEC.md` proposes ranking
open theorems by *unlock mass*: conemass on the subgraph induced on
unproved nodes, so that each open node is credited with the share of
remaining blockage it accounts for. It was demonstrated once, on the
Prove2Me mission graph. The question here is whether the same ranking
says anything different from a blocked-descendant count on a graph
humans already curate by hand, and whether a priority menu falls out of
it without new scoring code. It did not need any: `conemass.mjs` ran
unmodified on the induced subgraph.

## The graph

The [FLT project](https://github.com/ImperialCollegeLondon/FLT)
blueprint at commit `f6c6a2f` (2026-10-02). Every statement environment
in the chapters `content.tex` includes is a node; every `\uses{}`
target in its statement or proof is an edge, dependent → dependency.
Status is the blueprint's own: `\leanok` on the proof (or `\mathlibok`,
material upstreamed to Mathlib) means proved; `\notready` means the
maintainers have flagged it as not yet ready to formalise.

- 233 nodes (88 lemmas, 71 theorems, 51 definitions, 21 corollaries,
  2 propositions), 272 edges, 9 dangling `\uses` targets with no label
  in the current source.
- 137 proved, 96 open. Among the open: 37 *ready* (every dependency
  proved, not flagged), 27 `\notready`.
- Open-only subgraph: 73 edges, chains up to 8 deep, maximum 11 blocked
  descendants. 31 open nodes have unlock 0 (nothing open rests on them);
  16 of those are fully isolated.

The open frontier is two populations. The **bestiary** chapter
(`chtopbestiary`: 29 open, 25 `\notready`) is the maintainers' list of
standard background theory the project will eventually need (local
class field theory, the manifold structure on points of algebraic
varieties, automorphic forms and representations) and is where the long
chains live: the single `modularity_lifting_theorem` node has an open
cone of 37, the largest in the graph. The **mini-projects**
(`AdeleMiniproject`: 33 open, 14 ready; `ch07exampleGLn`,
`HeckeOperatorProject`, `ch03freyreduction`) are where current work
happens; their open chains are short.

## Ranking

Unlock mass over all 96 open nodes, with the three columns that make it
a schedule: `sole` is the number of blocked descendants whose only open
blocker is this node (they close the moment it does); `blocked` is the
transitive count a naive scheduler would use; `ready` means attackable
now.

| # | unlock | sole | direct (rank) | blocked (rank) | status | node |
|---|---|---|---|---|---|---|
| 1 | 2.32 | 1 | 1 (58) | 11 (1) | notready | `manifold_on_algebraic_variety_points` (bestiary) |
| 2 | 2.11 | 1 | 1 (59) | 5 (18) | notready | `maximal_unramified_extension_of_p-adic_field` (bestiary) |
| 3 | 2.00 | 2 | 2 (2) | 2 (31) | ready | `IsDedekindDomain.dvd_norm` (Adele) |
| 4 | 2.00 | 2 | 2 (4) | 2 (36) | ready | `Submonoid.units_isCompact` (Hecke) |
| 5 | 2.00 | 1 | 1 (47) | 4 (22) | ready | `instLieAlgebraAction` (GLn) |
| 6 | 1.94 | 1 | 1 (26) | 7 (10) | ready | `InfinitePlace.Completion.denseRange_algebraMap_subtype_pi` (Adele) |
| 7 | 1.94 | 1 | 1 (27) | 7 (11) | ready | `InfinitePlace.Completion.finrank_pi_eq_finrank_tensorProduct` (Adele) |
| 8 | 1.82 | 1 | 1 (62) | 10 (3) | notready | `slowly_increasing` (bestiary) |
| 9 | 1.82 | 1 | 1 (65) | 10 (4) | ready | `topology_on_affine_variety_points` (bestiary) |
| 10 | 1.50 | 1 | 1 (32) | 2 (34) | ready | `Rat.AdeleRing.zero_discrete` (Adele) |
| 11 | 1.34 | 1 | 3 (1) | 4 (21) | ready | `RestrictedProduct.relabelIso` (Adele) |
| 13 | 1.17 | 0 | 1 (14) | 5 (16) | ready | `IsDedekindDomain.AKLB.finitePresentation` (Adele) |
| 14 | 1.17 | 0 | 1 (61) | 5 (19) | ready | `pi_tensorProduct_of_finitePresentation` (Adele) |
| 16 | 1.00 | 1 | 1 (13) | 1 (47) | ready | `HurwitzRatHat.canonicalForm` (ch05) |
| 17 | 1.00 | 1 | 1 (30) | 1 (52) | ready | `NumberField.instCompactSpaceAdicCompletionIntegers` (Adele) |
| 18 | 1.00 | 1 | 1 (31) | 1 (53) | ready | `Rat.AdeleRing.cocompact` (Adele) |
| 19 | 1.00 | 1 | 1 (43) | 1 (57) | ready | `hardly_ramified_mod3_reducible` (ch03) |

**The priority menu** is the ready rows: 37 ready nodes, of which 14
have unlock ≥ 1 and 12 have at least one sole-blocked dependent. Of
the other 23, 7 carry a fractional share (they are one of several
blockers of something) and 16 are leaves of the open graph: proving
them finishes them and nothing else. Full list with Lean names and
statement text in `out/ranking-unlock.csv`.

## What separates unlock mass from blocked count here

Null checks over all 96 open nodes (`out/nulls.json`):

| against | Spearman | top-10 | top-20 |
|---|---|---|---|
| direct open dependents | 0.70 | 2/10 | 5/20 |
| blocked descendants | 0.90 | 4/10 | 9/20 |
| PageRank, open-only graph | 0.92 | 5/10 | 14/20 |
| conemass on the full graph (proved nodes included) | 0.86 | 8/10 | 16/20 |

The disagreement with blocked count is structural, and it is the
scheduler-relevant one. The bestiary is a chain: each link blocks the
9–11 links above it, so blocked count ranks the whole chapter at the
top with nearly uniform scores (rows 1–8 of the blocked ordering are all
bestiary, six of them `\notready`). Unlock mass divides each
descendant's credit by the size of its open cone; the automorphic-form
nodes at the top of that chain have cones of 8–13 and
`modularity_lifting_theorem` has 37, so a bestiary root collects a
fraction of each. `IsDedekindDomain.dvd_norm` has two blocked
descendants, both with open cone exactly {it}: proving it closes two
corollaries outright, and it scores 2.00, level with the bestiary roots
and above every other ready node. That is the "last blocker" signal,
and `sole` makes it explicit: the hard part of unlock mass is the count
of descendants that close immediately, and the fractional part is
partial credit toward the rest.

PageRank finds a similar top-20 (14/20), as it did on Prove2Me and
Mathlib. The sole-blocked and open-cone columns are what PageRank does
not give, and they are what a dispatch loop consumes.

Including proved nodes in the cones (full-graph conemass, the mistake
the Prove2Me correction of 2026-09-23 fixed) agrees on 16 of the top 20
here, because FLT's proved nodes mostly sit below the open ones rather
than among them. The agreement is a property of this graph, not a reason
to skip the induced subgraph.

## What a maintainer gets, honestly

- Kevin Buzzard assigns FLT work by hand on Zulip from exactly this
  picture, and the ready rows above are the blue nodes on the rendered
  blueprint graph. For a human who holds the graph in their head, the
  new information is the `sole` column and the cone sizes, not the
  list. The scores are small: no open node unlocks more than two
  immediate closures. The frontier is shallow outside the bestiary.
- For an agent dispatch loop (the spec's Stage 2), this is the Stage 1
  input: a menu of 37 attackable nodes with an unlock score, a hard
  immediate-closure count, and the exact parent list, computed from a
  file the maintainers already write. The tractability term is still
  missing; unlock mass is one of the three factors in the spec's
  expected-value score, not the score.
- A status fact that falls out: at this snapshot the blueprint lists 37
  open nodes between the project and the modularity lifting theorem, 25
  of them flagged not ready. That is the maintainers' own accounting of
  the distance, read mechanically.

## A parser lesson, recorded

The first run put `MulSemiringAction.charpoly` at #1 with unlock 3.48.
It is in Mathlib. The blueprint marks it `\mathlibok`, which the parser
did not treat as proved; the whole Frobenius chapter is `\mathlibok` at
this snapshot. The blueprint format has three done-markers (`\leanok`
on statement, `\leanok` on proof, `\mathlibok`), and a scheduler reading
it must honour all three or it will dispatch agents at finished work.
Fixed before the tables above were produced; 11 nodes moved from open
to proved.

## Not claimed

- Nothing about difficulty. `dvd_norm` is a routine lemma and
  `maximal_unramified_extension_of_p-adic_field` is a chapter of local
  class field theory; the ranking does not know that, and the
  `\notready` flag is the only tractability signal it carries.
- Nothing about the correctness of the blueprint's edges. `\uses` lists
  are written by the authors and can be incomplete; nine targets are
  dangling in the current source. The ranking is only as good as the
  curated graph, which is the point of using one.
- One snapshot of a moving project. `extract.mjs` reruns from a fresh
  clone in a second.

## Reproduce

```
git clone --depth 1 https://github.com/ImperialCollegeLondon/FLT C:/dev/FLT   # or set FLT_DIR
node extract.mjs
node analyze.mjs
```
