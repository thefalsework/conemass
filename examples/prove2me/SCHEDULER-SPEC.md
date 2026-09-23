# From priority menu to closed loop: an unlock-mass scheduler for Prove2Me

**Chris Brink · September 2026 · spec, not implementation**

This is the design that follows from the two rankings in `REPORT.md`.
It comes in two stages: a **priority menu** (human picks from a ranked
frontier — buildable today against the public API) and a **closed-loop
scheduler** (agents are dispatched automatically — buildable with one
architectural rule added). The second stage removes the human from the
inner loop. It does not, and should not, remove the human from the
boundary, and the reason is stated precisely below rather than left as
caution.

All numbers cited are from the 2026-09-19 snapshot analyzed in
`REPORT.md` (280 missions, 4,077 curated nodes, 8,333 edges, 504
ranked open theorems) and rerun in minutes by the scripts in this
directory.

## Stage 1: the priority menu

A ranked list of open theorems, recomputed on a schedule or on every
mission-graph mutation, shown wherever agents (or their operators)
choose work.

**Score.** Unlock mass on the **guaranteed bracket** — for
multi-sketch parents, only children present in every accepted sketch.
The union bracket is an upper bound on unlock (only one sketch
alternative needs to complete); the guaranteed bracket is the lower
bound, and the two nearly agree on this corpus (Spearman 0.87, 34/40
top-40 shared), so using the conservative one costs almost nothing and
means the menu never promises unlock it cannot deliver. By Property 1
of the platform's own paper, sketch edges have AND-semantics, so the
guaranteed-bracket number is exact: closing theorem T releases
*exactly* this listed set of parents, not "approximately this much
centrality."

**Columns.** `unlock_mass_guaranteed`, `unlock_mass_union`,
`transitive_dependents`, and the released set itself (the list of
parent theorems that auto-resolve or come closer to resolving). The
last column is the point: every row in the menu is an enumerable,
checkable claim, which is what lets stage 2 run unattended.

**Wrapper filter.** Rows with mass ≥ 1 and transitive dependents ≤ 2
are restatement wrappers (the `green_tao_theorem` class), filtered
mechanically, filter disclosed. The metric is not modified.

**Join with closability.** The platform's `closability` heuristic
estimates *easy to close*; unlock mass estimates *worth closing*. The
menu should present both, because stage 2 needs both.

## Stage 2: the closed loop

```
recompute unlock mass (guaranteed bracket, minutes)
      │
dispatch agents to argmax  E[unlock per compute-hour]
      │                    = unlock_mass × P(success | theorem, agent) / cost
Lean-verify completions    ── failures update P(success)
      │
mission graph mutates (parents auto-resolve per Property 1)
      │
      └──────── loop
```

No human sits in this cycle. Verification is already mechanical
(Lean); the score is deterministic and zero-parameter; recomputation
is minutes on the full corpus. The three design decisions that make
the loop sound:

**1. The dispatch score is expected unlock per compute-hour, not raw
unlock mass.** Unlock mass supplies exactly one of the three terms.
A raw-mass scheduler burns its budget slamming agents into the
highest-value nodes regardless of tractability. `P(success)` starts
from the platform's `closability` and is then updated from the
agents' own attempt history — a bandit over theorems, where each arm's
prior comes from closability and each pull is an agent-run. (The
platform's second-highest audit-priority definition is
`StochasticBandit`; the scheduler is one.) Cost is measured
compute-time per attempt. All three terms are observable; nothing is
hand-tuned.

**2. Agents close nodes; agents never create edges.** This is the
Goodhart rule and it is architectural, not advisory. Every graph
conemass has been validated on (Debian, crates.io, this one) was
produced by uncoordinated real needs — nobody grew the graph to move
the metric. The moment a score drives dispatch or reward, whoever can
write edges can mint priority: declare shallow dependents on your
theorem and your mass rises. So dependency structure may enter the
graph only through the two human gates that already exist — mission
creation and sketch acceptance — and the scheduler's write access is
limited to proof completions. Under this rule the metric stays
measuring demand rather than manufacturing it.

**3. The loop runs on the guaranteed bracket.** Union-bracket unlock
counts work that one sketch alternative might deliver; a human reading
a menu absorbs that uncertainty, an unattended dispatcher bakes it in.
Lower bound in, therefore never over-promised unlock out.

## What stays human, and why it cannot be automated away

- **Mission creation.** Unlock mass is defined relative to declared
  missions. The loop harvests the declared frontier with maximal
  efficiency; it cannot decide that a new area of mathematics is worth
  wanting. That judgment is outside the graph by construction.
- **Sketch/edge acceptance.** This is the Goodhart gate (rule 2). It
  is also the epistemic gate: accepted sketch structure is what makes
  Property 1 — and hence the exactness of every number the scheduler
  acts on — true.
- **Definition audit.** Ranking 1 of `REPORT.md` orders the audit
  queue (the `StochasticBandit` case: 3 direct dependents, a 151K-LOC
  mission resting on them). The scheduler *consumes* trusted
  definitions; auditing them is upstream of it.

Everything else — prioritize, dispatch, attempt, verify, recompute —
runs closed.

## Honest notes

- **The head is not unique to conemass.** PageRank recovers 33/40 of
  the same top-40 on this graph (`pagerank-null.mjs`). The case for
  unlock mass in an *unattended* loop is not superior discovery; it is
  that the score is an exact, enumerable quantity under the platform's
  own sketch semantics — "closing this releases these parents, listed"
  — which is what makes automated dispatch auditable after the fact.
  A fixed-point centrality with a tuned damping factor has no such
  reading, and an unattended system should prefer scores that can be
  checked over scores that can only be recomputed.
- **Value ≠ tractability**, stated again because it is the failure
  mode: unlock mass alone is not a dispatch policy. It is one factor
  of one.
- **Snapshot drift.** All numbers here are from 2026-09-19; the
  platform moves fast. Nothing in the design depends on the snapshot —
  only the worked examples do.

## Build surface

Stage 1 needs: the crawl already in `crawl.mjs`/`refetch-missions.mjs`
(public API, `/api/v1/theorems/:id/graph`), `conemass.mjs` (single
file, dependency-free), and a join against the platform's closability
field. Stage 2 adds: an attempt-history store for `P(success)`
updates, a dispatch queue, and the edge-write restriction (rule 2) —
which is a permission, not a feature.
