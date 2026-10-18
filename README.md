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
node conemass.mjs <input> [--cap N] [--top N] [--out FILE] [--reach] [--findings SCAN]
```

**Inputs** (auto-detected; several may be given and their edges are
unioned, which is how SBOMs from many containers become one graph):

- CycloneDX SBOM (`.json` with `"bomFormat": "CycloneDX"`) — the
  `dependencies` section is the edge list. Each `bom-ref` is mapped to
  its purl with version, qualifiers and subpath stripped
  (`pkg:cargo/syn@2.0.29?checksum=…` → `pkg:cargo/syn`), so a package
  present at several versions is one node; `--keep-versions` turns
  that off. Nested components are included. Falls back to
  `group/name` when there is no purl.
- SPDX SBOM (`.json` with `spdxVersion`) — `DEPENDS_ON` and
  `DEPENDENCY_OF` relationships (the latter reversed); packages named
  by their purl external reference when present, else by name. The
  same purl convention as CycloneDX, so SBOMs of both kinds union
  cleanly.
- Graphviz `.dot`, e.g. `nix-store -q --graph /nix/store/…` — every
  `"a" -> "b"` edge. nix-store writes reference → referrer, i.e.
  dependency → dependent; that is detected from the store paths and
  flipped, and store paths are reduced to package names (hash and
  version stripped, using Nix's own name/version split). Other `.dot`
  producers are read as dependent → dependency; `--reverse` if yours
  points the other way.
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
insensitive to cap 50–800 on tested package corpora, where closures
are small; on a graph whose closures are far larger than the cap, such
as a citation graph, the cap is the ranking, see `examples/citations/`). `--top N` emit only the
top N rows. `--out F` write CSV to a file instead of stdout.
`--reverse` flip every edge. `--keep-versions` keep versions in purls
and store paths (each version becomes its own node). `--reach` append
a column with the exact number of transitive dependents (no cap;
O(nodes × edges), so fine for a lockfile or SBOM, slow on a registry).
`--findings SCAN` switch to triage mode, below.

Lockfiles other than `Cargo.lock` (`package-lock.json`, `go.sum`,
`poetry.lock`, …) are easiest fed in as SBOMs: `syft` or `cdxgen`
turn any of them into CycloneDX in one command, and the purl naming
then matches across ecosystems.

**Output columns:** `conemass_rank, name, conemass, direct_dependents,
dependents_rank`.

### Triage mode: `--findings`

Give it the graph and a scanner report, and the output becomes one row
per affected package, ordered by what fixing it would release:

```
node conemass.mjs sbom.cdx.json --findings grype.json
```

`SCAN` is Grype JSON (`matches[]`), Trivy JSON (`Results[]`),
OSV-Scanner JSON (`results[]`), or a CSV with a `name` column and
optional `id`, `severity`, `fix` columns (for SAST findings, audit
logs, anything without a CVE). Scanner purls are matched to graph
nodes with the same purl convention as the SBOM inputs; bare-name
graphs (edge lists, Cargo.lock) match on the normalized name. Packages
the scanner reports that are not in the graph (OS packages against an
application SBOM, typically) are listed on stderr and left out.

Columns: `name, findings, max_severity, fixable, reach, sole_exposure,
fix_mass, conemass_rank, conemass, direct_dependents`.

- `reach`: packages exposed through this one (transitive dependents).
- `fix_mass`: conemass pointed at the affected set. Every exposed
  dependent splits one unit of credit equally among the affected
  packages in its cone, so `fix_mass(x)` is the number of dependents
  that fixing `x` would clean, fractional where exposure is shared.
  Sorted on this, then reach.
- `sole_exposure`: dependents for which `x` is the only affected
  package in their cone; the integer part of the above and the hard
  signal. Fixing `x` closes these outright.
- `fixable`: findings with a fix version known to the scanner, over
  total findings on the package.
- Severity is carried through unchanged so it can be read next to
  reach. The two are not correlated in the audit data we have checked
  (`examples/alpha-omega/`), which is the reason for the mode.

Worked example, a syft SBOM of the `apache/airflow:2.9.3` image and
a Grype scan of it, both committed in `examples/airflow-image/`:

```
node conemass.mjs examples/airflow-image/airflow-2.9.3.cdx.json --findings examples/airflow-image/airflow-2.9.3.grype.json --top 6
```

```
name,findings,max_severity,fixable,reach,sole_exposure,fix_mass,conemass_rank,conemass,direct_dependents
pkg:deb/debian/gcc-12-base,"CVE-2022-27943;CVE-2023-4039;…",High,1/4,180,0,38.9195,1,45.6554,2
pkg:deb/debian/libc6,"CVE-2010-4756;CVE-2018-20796;…",Critical,9/32,179,0,38.4195,2,44.6554,160
pkg:deb/debian/libgcc-s1,"CVE-2022-27943;CVE-2023-4039;…",High,1/4,179,0,38.4195,2,44.6554,8
pkg:pypi/cryptography,"GHSA-3ww4-gg4f-jr7f;…",High,7/7,176,2,15.7638,17,4.4411,22
pkg:pypi/idna,"GHSA-65pc-fj4g-8rjx",Medium,1/1,175,2,15.1483,20,4.1263,10
pkg:pypi/protobuf,"GHSA-7gcm-g887-7qv7;GHSA-8qvm-5x2c-j2w7",High,2/2,111,8,13.2517,16,4.7177,49
```

2,133 findings on 176 packages, exposing 405 of 573 nodes. Of the 40
packages with a Critical finding, 14 have reach of at most 1 and 8
have reach 0 (`curl`, `rsync`, `perl`, `sqlite3`, …): nothing in the
image depends on them. `protobuf` is High and the only affected
package in the cone of 8 others. The example README has the full
table and the caveats (syft records extras-marked requirements, so
some PyPI reach is overstated).

The same mode on SAST findings without CVEs, via the CSV input: the
five Kubernetes v1.31.0 findings from OpenRefactory's 2024 Alpha-Omega
audit against the release's module graph (`examples/alpha-omega/`):

```
node conemass.mjs examples/alpha-omega/kubernetes-edges.csv --findings examples/alpha-omega/kubernetes-findings.csv
```

Two High findings there: `go-restful` is in the cone of 31 modules,
`cadvisor` of 1. `go-cmp` is Medium and the only affected package in
the cone of 71.

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

`examples/lax/` is the fifth graph type: the concept dependency graph
of the [Lax Lean Archive](https://laxarchive.org) (1,313 concepts in 96
registered submissions, snapshot 2026-10-07), where the kernel checks
every proof but nothing checks that a definition means what its prose
says — the archive answers that with public endorsements, and at the
snapshot none of the 1,313 concept pages had one. The ranking is an
endorsement schedule: which definitions a faithfulness error would
propagate through furthest, joined to downstream-submission and
author-diversity columns and to live endorsement counts. See
[`examples/lax/REPORT.md`](examples/lax/REPORT.md).

`examples/flt/` is the second graph for the unlock-mass scheduler: the
[FLT project](https://github.com/ImperialCollegeLondon/FLT) blueprint
(233 statements, 96 open, snapshot 2026-10-02), a human-curated
dependency graph with machine-readable proved/open status. Open-only
unlock mass separates from blocked-descendant count at the head (4/10)
for a structural reason: blocked count ranks every link of a long
`\notready` chain alike, unlock mass credits the node whose proof closes
dependents outright. A 37-node ready menu with immediate-closure counts
falls out of a file the maintainers already write. See
[`examples/flt/REPORT.md`](examples/flt/REPORT.md).

`examples/alpha-omega/` is a retrodiction against a SAST audit log:
OpenRefactory's 2024 Alpha-Omega scans of every dependency of Airflow
2.9.3, Jenkins 2.476 and Kubernetes v1.31.0, joined to conemass
rankings of the three release graphs, then (`population/`) all 9,851
of OpenRefactory's Python audit rows joined to one PyPI graph of 4,233
packages. At population scale bug yield is not flat in rank: it is 0
of 20 in the top 1% and 16.7% in the bottom half (p = 0.004), so
load-bearing packages have fewer SAST findings per scan, not the same
number, and the three-project report's scanning-queue argument is
withdrawn in a dated correction. What holds at both scales is that
severity is unrelated to reach (rho = -0.03 over 78 findings; 11 of 12
High findings at reach ≤ 4), which is the premise of `--findings`. See
[`examples/alpha-omega/REPORT.md`](examples/alpha-omega/REPORT.md) and
[`examples/alpha-omega/population/README.md`](examples/alpha-omega/population/README.md).

`examples/citations/` is a recorded negative result on a citation
graph: OpenAlex topic "Neural Networks and Applications", 42,796 papers
through 2012 ranked on their internal citation structure and scored
against citations received 2013-2020. Reference closures reach the
whole field (top nodes: reach 29,000-36,000 of 42,796), so the cone cap
is the ranking rather than a tie-break; with citation count and
publication period held fixed, conemass adds nothing (within-cell rho
-0.03 to +0.07), and neither do PageRank or reach. The metric needs
bounded closures, and citation graphs do not have them. See
[`examples/citations/README.md`](examples/citations/README.md).

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
