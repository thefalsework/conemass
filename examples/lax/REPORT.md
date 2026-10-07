# Where to endorse first: an audit-priority ranking of the Lax archive

**Chris Brink · October 2026**

**Provenance, in two sentences.** conemass is a dependency-graph ranking
that was validated before it touched this graph: on the last Debian
release before the xz backdoor it ranked liblzma5 #8 of 63,436 packages,
against #173 by dependent count (tool, data, and registered studies at
github.com/thefalsework/conemass). This is its fifth graph type —
package archives, crate registries, the Prove2Me mission graph, the
Mathlib declaration graph, now the concept graph of a Lean archive — and
the metric ran unmodified, same single file, no tuning.

What it computes: conemass(x) = Σ over nodes u whose dependency cone
contains x of 1/|cone(u)| — count every toolchain you are part of,
weighting each by the reciprocal of its size. High mass with a low
dependent count is the quiet load-bearing profile.

## Why this graph

The Lax spec opens with the gap the ranking is for: "Lean's kernel checks
proofs for free, but it cannot check whether a formal statement means
what it claims to mean. The archive aims to provide the missing trust:
reviewers can publicly endorse formalizations as faithful, staking their
names on them." A concept is the unit of that review — a prose
definition or claim paired with its Lean encoding — and concepts import
other concepts, across submissions, forming the concept DAG. A
faithfulness error in a definition therefore propagates: every statement
built on it is kernel-checked against the wrong meaning, silently. The
question this ranking answers is where such an error would propagate
furthest, which is the same thing as where an endorsement is worth most.

## Snapshot and graph

Database `lax-archive/lax-database` at commit `a4697a7` (2026-10-07
14:59 UTC): 141 records — 96 registered, 17 draft, 13 init, 15 deleted.
Scope is the **96 registered submissions** (immutable, citable); drafts
are excluded because the spec makes them "not usable as a dependency"
and their owners can overwrite or delete them. Mathlib modules are
outside the archive and are not nodes.

**1,313 concepts** (515 definitions or infrastructure, 798 claims), 1,305
of them with at least one edge. Two edge sets, both dependent →
dependency:

- *concepts*: 4,978 concept-import edges, 2,324 of them crossing a
  submission boundary;
- *union* (primary): the above plus 745 edges from proof assumptions
  lifted to concept level — a proof of a statement in A assumes a
  statement in B. Assumptions are the pipeline's own `#print axioms`
  set recorded in `build-output.json`, not author declarations.

Eighteen registered submissions are superseded by a registered
successor (v4.30.0 → v4.33.0 ports, mostly); they are kept, flagged in
the CSVs, and tested as a sensitivity below.

## Ranking: definition audit priority (top 20 of 515)

Global conemass rank (union edges, cap 200); mass; direct importers and
the rank that count would give; downstream submissions (other than the
concept's own) whose concepts or proofs transitively rest on it;
distinct first authors among those submissions, excluding the concept's
own first author; PageRank rank for comparison.

| # | mass | direct (rank) | downstream subs | other first authors | PR | concept |
|---|---|---|---|---|---|---|
| 1 | 41.1 | 20 (62) | 19 | 1 | 2 | `Lax434930.PolynomialTime` — the complexity class P |
| 2 | 39.8 | 232 (1) | 15 | 0 | 1 | `Lax904597.Problems` — decision problems on finite structures |
| 3 | 22.1 | 9 (127) | 17 | 4 | 5 | `Lax808846.Ram` — the word RAM |
| 4 | 21.2 | 146 (3) | 15 | 0 | 3 | `Lax904597.Interpretations` |
| 5 | 17.9 | 113 (6) | 15 | 0 | 6 | `Lax904597.SecondOrder` |
| 6 | 16.9 | 120 (5) | 15 | 0 | 10 | `Lax904597.Relativized` |
| 7 | 15.3 | 2 (369) | 4 | 0 | 9 | `Lax132576.LabelledAutomata` |
| 8 | 13.7 | 180 (2) | 15 | 0 | 4 | `Lax904597.Classes` |
| 9 | 12.8 | 8 (132) | 4 | 0 | 11 | `Lax132576.RationalRelations` |
| 10 | 12.5 | 113 (6) | 9 | 0 | 16 | `Lax485149.Problems` |
| 11 | 12.4 | 13 (88) | 9 | 2 | 7 | `Lax808846.RamComputes` — computing within a time bound |
| 12 | 11.9 | 7 (145) | 3 | 1 | 17 | `Lax199508.GraphClasses` |
| 13 | 11.7 | 12 (102) | 3 | 0 | 22 | `Lax765601.MealyMachine` |
| 15 | 10.5 | 6 (163) | 0 | 0 | 15 | `Lax496464.FlowShop` |
| 17 | 9.2 | 6 (163) | 1 | 0 | 24 | `Lax12.GraphClasses` (superseded by lax-199508) |
| 18 | 9.2 | 133 (4) | 13 | 0 | 18 | `Lax904597.Sat` |
| 19 | 9.0 | 3 (268) | 9 | 3 | 19 | `Lax759944.BinaryWordEncoding` |
| 20 | 8.9 | 6 (163) | 3 | 1 | 36 | `Lax68.GraphMinors` |
| 21 | 8.8 | 11 (113) | 0 | 0 | 29 | `Lax314295.MSOLogic` |
| 22 | 8.6 | 6 (163) | 17 | 1 | 14 | `Lax434930.Certificates` — input-and-certificate encoding |

Further down, for reference: `Lax429075.CNF` #28 (4 direct, rank 219 by
count; 10 downstream submissions) and
`Lax434930.NondeterministicPolynomialTime` #34 (24 direct; 17 downstream
submissions).

## Reading the table

Three profiles are mixed in the head, and the extra columns are what
separate them.

**Hubs every metric finds.** `Lax904597.Problems` has 232 direct
importers, is #1 by dependent count and #1 by PageRank; the rest of the
descriptive-complexity base (`Interpretations`, `SecondOrder`,
`Relativized`, `Classes`, `Sat`) is the same shape. Those rows prove
nothing about conemass. They also have a specific provenance: all 15
downstream submissions share the concept's first author, so the load is
one author's series importing its own foundations. That does not make
the definitions less worth endorsing — a faithfulness slip in `Problems`
reaches 295 concepts — but the endorsement should come from someone
other than the author, and the "other first authors" column is 0.

**Quiet load-bearing rows.** `PolynomialTime` is #1 by mass and #62 by
direct count: twenty importers, but nineteen of the 96 registered
submissions transitively rest on it — the complexity and hardness
submissions of two author groups, Bonnet's (which includes the
definition's own) and Itzhaki's scheduling-hardness series. (The
descriptive-complexity series carries its own class definitions in
`Lax904597.Classes` and `Lax535992.ClassPTIME`, so the archive currently
holds two unconnected formalizations of P; a reader comparing them would
be doing exactly the review the spec asks for.) `Ram` (the word RAM) is
#3 by mass and #127 by count, with nine direct importers and the most
author-diverse cone in the archive — 17 downstream submissions by four
other first authors (Dreier's own, Itzhaki, Kuske, Bonnet, Toruńczyk);
the running-time claims of five author groups are stated on this
machine. `Certificates`
(#22 by mass, #163 by count, 17 downstream submissions),
`BinaryWordEncoding` (#19 vs #268, 3 direct, 9 submissions by 3 other
authors), and `CNF` (#28 vs #219, 4 direct, 10 submissions) are the same
profile. This is the liblzma shape transposed to a formal archive: few
visible importers, present under most of what is built. A dependent-count
view of the archive would not put these near the top; see the null
checks.

**Mass contained in one submission.** `FlowShop` (#15), `MSOLogic`
(#21), `Lax17.Paths` (#27), and `LabelledAutomata` with four downstream
submissions all of the same author series, score from the internal
structure of a single large submission (72 concepts in the flow-shop
paper). A faithfulness error there is contained in one paper. The
`downstream_submissions` column separates archive-level load from
paper-level load in one filter: of the top-40 concepts, 29 have at least
two downstream submissions, and those are the audit list in the sense
the spec's "social" paragraph intends.

**Coverage.** The cones of the top 5 definitions together contain 575
of 1,313 concepts (43.8%); the top 10 cover 48.6%, the top 20 59.2%,
the top 40 65.7%. Endorsing twenty definitions by someone other than
their author would put a second pair of eyes under three fifths of the
archive.

## Imported claims

Thirty-five of the top-40 concepts are definitions; five are concept
modules of type theorem that other concepts import — the spec forbids a
concept from *using* a statement, so these imports are for the
definitions those modules carry alongside their claims.
`Lax253009.FiniteProbability` and `Lax323828.FiniteProbability` (the
two registered versions of Håstad's inapproximability of Max Clique)
rank #14 and #16 with 27 and 25 direct importers; `Lax904597.NPClass`
is #39 with 11 downstream submissions and `Lax904597.CookLevin` #51
with seven. For these, two things need endorsing: the definitions, and
the claim's statement, since downstream work assumes it by name.

## Endorsement coverage (fetched 2026-10-07 15:38 UTC)

The archive's review service publishes endorse and flag counts per
page. Every registered concept page and submission page was read.

- **Concept pages: 0 of 1,313 carry an endorsement; 0 carry a flag.**
- Submission pages: 6 of 96 carry one endorsement each (lax-10, lax-41,
  lax-68, lax-214022, lax-379983, lax-881656). By summed concept mass
  these submissions rank 63, 66, 11, 90, 77, 89 of 96. None of the ten
  submissions with the most load — the descriptive-complexity base,
  Classical Complexity Classes, both Håstad versions, the transducer
  series, the word RAM — has an endorsement. No page carries a flag.

So the social layer the spec rests on is, two months after the first
registered record (2026-08-02), empty where it matters. That is not a criticism of a young archive; it is the reason
to publish a priority list rather than wait for coverage to arrive
uniformly. The one endorsement that does land near the head is lax-68
(Planar Graph Classes, #11 by mass), and it is at the submission level,
not on the `GraphMinors` concept that carries the load.

## Null checks and sensitivity

Run before the tables were read, over all 1,313 concepts, union edges,
cap 200 (`out/nulls.json`).

| against | Spearman | top-40 overlap |
|---|---|---|
| direct dependents | 0.857 | 13/40 |
| transitive dependents | 0.913 | 21/40 |
| downstream submissions | 0.505 | 18/40 |
| PageRank (α = 0.85, same orientation) | 0.957 | 30/40 |

Dependent count agrees in the bulk and disagrees at the head, which is
where a priority list is consumed: 27 of the top 40 are rows a
dependent-count view would not show. PageRank, as on the Prove2Me and
Mathlib graphs, finds most of the same head (30/40); a maintainer who
prefers PageRank loses little, and the comparison is reported rather
than hidden. What PageRank does not give is the auditable score — a
finite sum over named cones, enumerable per concept — nor the
`downstream_submissions` and `other first authors` columns, which are
what turn the ranking into an endorsement schedule.

- **Cap:** cap 50 and cap 800 both give top-40 overlap 40/40 with cap
  200 (Spearman 0.9998 and 1.0). The archive's cones are small; the cap
  never binds.
- **Edge set:** concept-import edges alone versus the union: 37/40
  top-40 overlap, Spearman 0.84. The 745 lifted proof-assumption edges
  change little at the head.
- **Current versions only:** dropping the 18 superseded submissions
  removes 200 concepts and 439 edges; over the remaining concepts the
  ranking has top-40 overlap 38/40 with the full one (Spearman 0.9994).
  The duplicate Håstad rows collapse to one; nothing else moves.

## Not claimed

- No claim that any ranked definition *is* unfaithful. This is where an
  error would matter, not evidence of one. The ranking says where to
  look; endorsement is the looking.
- No claim about the proofs. Every registered proof is kernel-checked,
  and a separate least-fixpoint walk over the same database finds the
  proof network well-founded within the registered scope (no cycles, no
  dangling assumptions; 8 statements rest on open claims their own
  abstracts declare).
- Snapshot of one day on an archive growing by several submissions a
  week; `extract.mjs` reruns in seconds from a fresh clone.
- The author-diversity column uses first authors as listed in manifests,
  with AI co-authors in the same field dropped; it is a proxy, not a
  conflict-of-interest determination.

## Reproduce

All scripts and outputs live at github.com/thefalsework/conemass under
`examples/lax/`. No credentials are needed:

```
git clone https://github.com/lax-archive/lax-database ~/.lax/lax-database
node extract.mjs            # out/edges-*.csv, out/nodes.json, out/snapshot.json
node endorsements.mjs       # out/endorsements.json (optional; ~20 min, paced)
node analyze.mjs            # rankings, nulls, summary
```

Full outputs: `out/ranking-definitions.csv` (515 rows),
`out/ranking-all.csv` (1,313 rows: both edge sets, three caps, the
current-versions score, reach columns, PageRank rank, endorsements),
`out/ranking-submissions.csv` (96 rows, summed mass with the per-concept
breakdown kept in the other files), `out/nulls.json`,
`out/summary.json`, `out/endorsements.json`. conemass itself is a single
dependency-free file, Apache-2.0, at the repo root.
