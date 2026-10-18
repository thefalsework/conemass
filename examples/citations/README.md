# Citation graph retrodiction: a negative result

Does conemass, computed on a field's citation graph as it stood in
2012, say anything about which papers were cited afterwards that the
2012 citation count does not already say? No. On this graph the metric
is not well defined in the sense that matters, and once that is
corrected for it adds nothing. Details below; the numbers are in
`RESULTS.md`.

Reproduce: `python fetch.py` (OpenAlex, about 650 list calls, inside
the keyless daily budget; set `OPENALEX_API_KEY` if you have one), then
`python analyze.py [--cap N]`.

## Setup

- Slice: OpenAlex topic T10320, "Neural Networks and Applications".
  57,009 works with reference lists through 2020; 42,796 published by
  2012 form the snapshot graph, with 227,985 citation edges among them.
  References to works outside the topic are not in the graph.
- Edge direction: citing paper depends on cited paper, so a cone is a
  paper's transitive reference closure within the topic, and reach is
  the number of later papers whose closure contains it.
- Rankings at 2012, using only that graph: conemass, citation count
  (direct dependents), PageRank.
- Outcomes: citations from the 14,213 topic papers published 2013-2020
  (67,368 edges), and OpenAlex's all-source citation counts for the
  same years. Both give the same answer.

## What happened

**The cones are the whole field.** In a package graph a dependency
closure is tens to a few hundred nodes and the 200-cap rarely binds.
Here the reference closure of almost any 2012 paper reaches the 1943
McCulloch-Pitts paper: the top-ranked nodes have reach 29,000-36,000 of
42,796. Every cone is truncated, and which 200 ancestors get credit is
decided by BFS layer and then by canonical node id. The cap, which is
a tie-break on package graphs, is the ranking here.

**Cap sensitivity.** The README's "rankings insensitive to cap 50-800"
is a statement about tested package corpora and it fails on this
graph. Top-40 overlap of conemass with the citation-count ranking:
13 at cap 50, 10 at 200, 5 at 800, 3 at 3000. As the cap rises
conemass converges on reach, and reach on a citation graph is mostly
publication year.

**Citation cycles merge unrelated papers.** Same-year mutual citations
and errata produce strongly connected components; conemass gives one
score to every member. The rank-20 group contains Hornik's universal
approximation theorem (1,777 citations at 2012) and "A Study of
Learning and Generalization by Exhaustive Analysis" (1 citation). The
five "quiet load-bearing" candidates the analysis surfaces are all of
this kind and all received zero citations afterwards.

**Against the outcome.** Spearman rho with 2013-2020 in-slice
citations, all 42,796 papers: citation count +0.43, PageRank +0.39,
conemass +0.38, reach +0.34. Head precision at K = 40 against the
future top 40: citation count 16, PageRank 11, conemass 6. Within
bins of 2012 citation count, conemass and reach correlate negatively
with future citations (reach -0.47 in the 20-49 bin), which is age:
older papers have larger closures and fewer citations ahead of them.
Holding both citation count and publication period fixed, the
weighted within-cell rho is +0.07, +0.04, -0.03, +0.03 for conemass
across the four periods, and PageRank and reach are in the same range.
Nothing in the structure beyond the count predicts the future count.

## Reading

The quiet-criticality claim in the paper is about graphs where a
node's closure is bounded and sharply different from its neighbors'
closures, so that 1/|cone| carries information. Citation graphs are
not that: closures are unbounded, nearly identical for everything
after the founding decade, and ordered by time. The metric reduces to
a cap artifact on top of age. This is the same failure as the
GitHub-issues attempt (a depth-1 star collapses to a count), from the
other side: a closure that is everything collapses too.

What this rules out is conemass on raw citation graphs. It does not
rule out a bounded variant (references within a window, or a
"builds-on" edge type when one exists), but that would be a different
metric and would need its own validation, not this example's.

This is the third external ground-truth test of the metric and the
first clear negative. The two that held (xz on Debian; severity
independent of reach on Alpha-Omega) were on package graphs. The
roadmap entry for a citation-graph paper is withdrawn.
