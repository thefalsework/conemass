# conemass

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22261985.svg)](https://doi.org/10.5281/zenodo.22261985)

Rank a dependency graph by **concentration of reach**: which packages sit
inside the most toolchains, weighted by how concentrated each toolchain's
trust is. One file, no dependencies, any graph, seconds.

```
node conemass.mjs Cargo.lock --top 50
```

The metric's whole argument fits in one command. Run it on the
eight-package lockfile in this repo:

```
node conemass.mjs test-cargo.lock
```

```
conemass_rank,name,conemass,direct_dependents,dependents_rank
1,unicode-ident,2.4262,2,2
2,proc-macro2,1.4262,3,1
3,quote,0.9262,2,2
4,syn,0.5929,1,4
5,serde_derive,0.3429,1,4
6,serde,0.1429,1,4
6,tokio,0.1429,1,4
8,myapp,0.0000,0,8
```

unicode-ident comes out **first with two direct dependents**, above
proc-macro2 with three. Counting dependents says proc-macro2 matters
more; counting *toolchains that terminate in you* says unicode-ident is
the floor everything else stands on. You can verify this by hand on
eight packages — and it is exactly what happens at registry scale, where
unicode-ident ranks #2 of 84,439 crates against #3,304 by dependent
count.

## Why this metric

The rankings that guide security attention mostly count activity and
popularity. Those miss a specific profile: the quiet, finished, deeply
embedded library — few direct dependents, present in nearly every build.
The OpenSSF criticality-score top-1000 contains Kubernetes and misses
zlib. On the last Debian release before the xz backdoor, conemass ranked
liblzma5 **#8 of 63,436 packages** (against #173 by dependent count) —
twenty-one months before anyone knew to look.

The metric:

```
conemass(x) = sum over packages u whose truncated dependency cone
              contains x of 1 / |cone(u)|
```

Count every toolchain you are part of, weighting each by the reciprocal
of its size. High conemass with a low dependent count is the quiet
load-bearing profile. The rows that matter for triage are the ones where
`conemass_rank` is far ahead of `dependents_rank`.

**How is this not PageRank?** Different functional (harmonic
cone-membership mass, not random-walk diffusion), and the difference is
measured rather than claimed: against dependent count the top-40s
overlap only 12/40 (Debian) and 19/40 (crates); against PageRank,
22/40 on Debian — where conemass surfaces deep gateway chains PageRank
buries (libkeyutils1: PageRank 981, conemass 30) — but 35/40 on
crates, where PageRank ranks unicode-ident #1 outright. Where the two
coincide, conemass is the zero-parameter, deterministic, auditable one:
a score is a finite sum you can enumerate, not a fixed point. The full
accounting, including the cases that favor PageRank, is in the paper's
head-versus-bulk section.

## Usage

```
node conemass.mjs <input> [--cap N] [--top N] [--out FILE]
```

**Inputs** (auto-detected):

- `Cargo.lock` — parsed directly. Both dependency entry forms resolve
  (`"serde"` and `"serde 1.0.188"`). Versions are collapsed to package
  names: a crate present at two versions is one node whose dependency
  set is the union, consistent with the package-level published
  rankings.
- edge-list text — one `dependent,dependency` pair per line (comma,
  tab, or space separated; a first line containing "depend" is skipped
  as a header).
- `.json` — `{"nodes":[names...],"edges":[[depIdx,depIdx]...]}` with
  edges as `[dependent, dependency]` index pairs, or a plain JSON array
  of `[dependent, dependency]` name pairs.

**Flags:** `--cap N` cone truncation (default 200; rankings are
insensitive to cap 50–800 on tested corpora). `--top N` emit only the
top N rows. `--out F` write CSV to a file instead of stdout.

**Output columns:** `conemass_rank, name, conemass, direct_dependents,
dependents_rank`.

**Project-level lists.** Compute conemass per package and sum within
each project (Debian study 13: 2 of the true top-40 buried;
src:xz-utils ranks 7 of 34149); keep the per-package breakdown,
because a project total does not say which package carries the score.
Treating a project's packages as dependencies of one another before
computing (study 13, arm A) kept only 1 of the true top-40 on Debian,
against 2 for a size-matched random grouping.

## Guarantees and caveats

- **Deterministic.** The same graph produces byte-identical output
  regardless of input file ordering (traversal and float-accumulation
  order are canonicalized by package name; verified on a shuffled
  63k-node corpus).
- **Cycles handled** via SCC condensation; members of a dependency
  cycle share a score.
- **Ties take the minimum rank.**
- A 100k-node registry takes seconds; string edge keys keep dedup
  correct past the ~2M-node limit where numeric packing would silently
  collide.
- Descriptive rankings, not certified claims. conemass's head is
  deliberately library-heavy — libraries are the attack surface.

## Published rankings

`rankings/` contains dated top-1000 CSVs, generated with this tool:

| file | corpus | snapshot |
|---|---|---|
| `rankings/debian-trixie-2025-top1000.csv` | Debian main/binary-amd64 (68,750 packages) | trixie, 2025 |
| `rankings/crates-2022-top1000.csv` | crates.io (84,439 crates) | 2022 |

Computed 2026-09-02 and published as-is: every future incident either
involves a package in these files or it does not, and the files are
dated. (2026-09-05: the CSV header row was renamed `oracle_*` →
`conemass_*`; every data row is unchanged from the 2026-09-02
computation, as the git history shows.)

## Beyond package registries

`examples/prove2me/` applies the metric, unmodified, to a third graph
type: the theorem dependency graph of the
[Prove2Me](https://prove2.me) formal-mathematics platform (280
missions, 4,077 nodes, snapshot 2026-09-19). Two rankings —
definitions by audit priority, open theorems by downstream unlock
mass — with null-model checks and full reproduction scripts. See
[`examples/prove2me/REPORT.md`](examples/prove2me/REPORT.md); a design
spec for driving agent proof-scheduling with unlock mass is at
[`examples/prove2me/SCHEDULER-SPEC.md`](examples/prove2me/SCHEDULER-SPEC.md).

`examples/mathlib/` is the fourth graph type and a recorded
no-finding: the declaration-level dependency graph of Mathlib (308,060
declarations, 8.4M edges), where conemass near-coincides with PageRank
(Spearman 0.960) and the head is foundational plumbing every metric
finds. Registered before running, kill conditions and all; the result
is load-bearing for the paper's graph-anatomy section (where the
metric separates from PageRank and where it doesn't). See
[`examples/mathlib/REPORT.md`](examples/mathlib/REPORT.md).

`examples/github-issues/` is a recorded negative result: unlock-mass
ranking of GitHub issues by blocking relationships, killed at
feasibility because public GitHub projects do not record blocking
edges densely enough to form cones (eight large repos probed; the
densest tracking structure found is depth-1 epic stars). See
[`examples/github-issues/REPORT.md`](examples/github-issues/REPORT.md)
before retrying the idea.

## Background

The validation — the xz retrodiction, the crates.io replication, the
comparison against the OpenSSF criticality-score top-1000, and a
registered RustSec retrodiction reported in full including the loss —
is written up in [the quiet-criticality paper](paper/quiet-criticality.md),
included in this repo ([PDF](paper/quiet-criticality.pdf)).

## Provenance and priority

The metric (harmonic cone-membership mass, "concentration of reach") was
derived and registered — under its working name **ORACLE**, which the
frozen study records retain — on **2026-09-01** as the complete
mechanism of a synthetic growth effect
([thefalsework/papers](https://github.com/thefalsework/papers),
`accretion-study/05-oracle.mjs`, with the derivation in
`accretion-study/THEORY.md`). It was repurposed as a supply-chain
criticality signal and published on **2026-09-02** with this tool, the
dated Debian and crates.io rankings in `rankings/`, the xz retrodiction
(liblzma5 #8 of 63,436 on pre-disclosure Debian), and the write-up
above — including a registered retrodiction against RustSec advisories
that the metric *lost* at the pooled cell, reported in the paper's
limitations. Full commit history in both repositories; this repository
is also archived at Software Heritage and on Zenodo
(DOI: [10.5281/zenodo.22261985](https://doi.org/10.5281/zenodo.22261985),
with the dated ranking CSVs attached to the corresponding GitHub
release). Later work using concentration-of-reach ranking of dependency
graphs should cite this record (`CITATION.cff`).

## License

Apache-2.0.
