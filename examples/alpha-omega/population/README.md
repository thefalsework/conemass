# OpenRefactory's PyPI scans at population scale

The three-project retrodiction in `../` had 21 findings. OpenRefactory's
public sheet has 9,851 Python audit rows over 3,722 GitHub repositories
with 216 bugs filed. This directory joins all of them to one population
dependency graph and asks the same two questions: does bug yield vary
with conemass rank, and does severity track reach.

Reproduce: `python fetch-pypi.py` (deps.dev, cached under `cache/`,
about 25 minutes cold), then `python analyze-pypi.py` (writes
`RESULTS-PYPI.md`).

## Method

- Repository to package: deps.dev `projects:packageversions`. Most
  popular repos are claimed by typosquats with unverified metadata
  (`psf/requests` has 14), so a candidate is kept only if it carries a
  PyPI publish attestation (751 repos), or its normalized name equals
  the repo name with `python-`/`py` prefix variants (1,471), or, when
  neither applies to any candidate, it is the one with the most
  dependents on deps.dev (about 200). 1,370 repos map to nothing: Odoo
  add-on collections, applications, forks, and repos deps.dev does not
  know. These are not libraries in anyone's dependency graph and their
  absence biases the mapped population toward packages that are.
- Version: the audited version if it is on PyPI, else the latest
  published on or before the repo's last audit date.
- Graph: the union of deps.dev's resolved dependency graph for each
  package at that version, names only. 4,233 nodes, 16,454 edges;
  2,267 scanned repositories are in it, 413 as isolated nodes (resolved,
  no edges either way).
- Two phases, analyzed separately. OpenRefactory filed 37-52 bug rows a
  month from August to December 2023 and 0-17 a month through 2024 while
  scanning ten times as many rows. Whatever changed, pooling the phases
  would mix two different filing regimes.

## Result

2023 phase: 615 repositories, 78 with bugs (12 High). Yield is not
flat; it rises toward the bottom of the ranking.

| conemass rank in graph | scanned | with bugs | yield | High |
|---|---:|---:|---:|---:|
| top 1% | 20 | 0 | 0.0% | 0 |
| 1-5% | 45 | 2 | 4.4% | 0 |
| 5-20% | 76 | 6 | 7.9% | 0 |
| 20-50% | 91 | 6 | 6.6% | 1 |
| bottom 50% | 383 | 64 | 16.7% | 11 |

Permutation p = 0.004. The same by reach: 17.6% at reach 0, 9.4% at
1-4, 7.5% at 5-19, 7.1% at 20-99, 3.8% at 100+ (p = 0.004). Direct
dependents give the same shape (p = 0.005). A top-400 scan budget in
conemass order would have found 35 of the 78 bugs against 50.7
expected at random; in direct-dependents order, 39.

Severity does not track reach: Spearman rho = -0.03 (p = 0.79) over the
78; 11 of 12 High findings sit at reach 4 or less, and the twelfth
(`kombu`, insecure deserialization) at 13. The highest-reach bugs,
`aiohttp` (462), `sympy` (126), `sqlalchemy` (75), `numba` (48), are
all rated Low and all logical.

2024 phase: 1,895 repositories, 12 with bugs. Too few to say anything
beyond consistent with flat (p = 0.39 to 0.64); the 12 are listed in
`RESULTS-PYPI.md` and 8 of them are the Airflow findings from `../`.

## Reading

The 21-finding study said bug yield was flat in conemass rank and
severity was unrelated to reach. At n = 78 the second holds and the
first is wrong in the direction unfavorable to using conemass as a scan
queue: load-bearing packages have *fewer* SAST findings per package,
not the same number. The High findings at the bottom are the kinds
that live in applications (XSS, command injection, SSRF, log
injection: `ckan`, `beets`, `octavia`, `paddlehub`), and the packages
at the top are libraries that have been read many times.

Two consequences. For scanning, conemass is the wrong order: scan the
leaves if you want findings. For triage of what has already been
found, the independence of severity and reach is now a population
result, and it is the reason `conemass --findings` prints the two next
to each other instead of folding them into one score.

## Caveats

- Mapped repositories are the library-shaped subset of what was
  scanned. The 1,370 unmapped repos are almost all leaves; including
  them would steepen the gradient, not flatten it.
- A repository with several packages is represented by its best-ranked
  one, which can only move findings up the ranking.
- The graph is the resolved dependency graphs of the scanned packages
  unioned, not all of PyPI; reach counts dependents within this
  population. `aiohttp`'s true PyPI dependent count is far larger than
  462; the ordering is what matters.
- Bug rows are per project-version; a repo scanned at two versions
  with a bug in one counts once per phase.
