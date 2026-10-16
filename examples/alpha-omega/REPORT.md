# Retrodiction: OpenRefactory's Alpha-Omega dependency audits

In 2024 OpenRefactory, under an [Alpha-Omega grant](https://github.com/ossf/alpha-omega/tree/main/alpha/engagements/2024/OpenRefactory),
ran its SAST over every dependency of the latest release of three projects:
Apache Airflow, Jenkins (v2.476) and Kubernetes. Their per-project audit
log is public (one row per project-version scanned: bugs filed, kind,
severity; linked from each monthly update). That makes a clean
retrodiction possible: rebuild each project's dependency graph as it was,
rank it with conemass, and see where the packages they found bugs in
land, against the packages they scanned and found clean.

Everything here is reproducible from the scripts in this directory;
`RESULTS.md` is the generated output.

## Setup

| project | graph | source | nodes / edges |
|---|---|---|---|
| Airflow 2.10.2 | full constraints set (core + all providers), install-time requirements only | `constraints-2.10.2/constraints-3.12.txt` + PyPI metadata (`fetch-airflow.py`) | 693 / 1,591 |
| Jenkins 2.476 | artifacts bundled in the WAR | `jenkins-war-2.476.license.xml` + deps.dev (`fetch-jenkins.py`) | 89 / 141 |
| Kubernetes v1.31.0 | Go modules in the release | `vendor/modules.txt` + each module's `go.mod` (`fetch-k8s.py`) | 215 / 2,631 |

Audit rows are keyed by upstream repository, so the analysis is at repo
granularity: a repo with several artifacts in the graph takes the best
rank among them, and the audited project's own repo (Airflow providers,
`jenkins-core`, the `k8s.io/*` staging modules) is excluded. Matching is
by repository name with hand aliases for multi-artifact Java repos
(`analyze.py`).

Coverage of the public log against the engagement's own counts is
partial: Jenkins has 26 Java rows (Oct–Nov 2024) against the 172
dependencies and 88 bugs described in the Alpha-Omega 2024 grantee
report, so most Jenkins findings are not individually recorded there.
Airflow (16 bugs claimed, 14 matched here) and Kubernetes are closer.

## Result

Across the three graphs, 536 scanned repos matched, 28 with bugs filed
(11 security/reliability, 9 rated High).

**Where the bugs are is unrelated to conemass rank.** The median rank of
a bug repo is about the median rank of a clean one (Airflow 298 vs 261
of 655; Jenkins 27 vs 57 of 66; Kubernetes 70 vs 72 of 165), and the
number of findings inside a top-K budget tracks the random expectation
at every K, for conemass order and for direct-dependent order alike:

| K | Airflow (14 bugs): conemass / dependents / random | Jenkins (8): conemass / dependents / random | Kubernetes (6): conemass / dependents / random |
|---:|---|---|---|
| 10 | 0 / 0 / 0.2 | 2 / 2 / 1.2 | 1 / 1 / 0.4 |
| 25 | 0 / 2 / 0.5 | 4 / 5 / 3.0 | 1 / 1 / 0.9 |
| 50 | 1 / 2 / 1.1 | 6 / 6 / 6.1 | 1 / 3 / 1.8 |
| 100 | 2 / 3 / 2.1 | | 4 / 4 / 3.6 |

So conemass does not predict *where a SAST will find a bug*. It is not
meant to, and this is the expected null: a package's position in the
graph says nothing about its code quality.

**What the position does say is how far a bug travels.** The reach
column in `RESULTS.md` (how many packages in the release transitively
pull the repo in) is wildly unequal across the findings:

| finding | severity | reach |
|---|---|---:|
| spring-framework (Jenkins, null deref) | High | 9 of 88, including `jenkins-core` |
| go-cmp (Kubernetes, logical) | Medium | 104 of 215 |
| aiohttp, sqlalchemy (Airflow, logical) | Low | 106, 105 of 655 |
| go-restful (Kubernetes, insecure deserialization) | High | 31 of 215 |
| kombu (Airflow, insecure deserialization) | High | 3 of 655 |
| pure-sasl, secretstorage (Airflow, weak crypto) | High | 3, 3 of 655 |
| apprise (Airflow, weak crypto) | High | 1 of 655 |
| cadvisor (Kubernetes, data race) | High | 1 of 215 |

Of the 28 bug repos, 19 have reach of 4 or fewer: a bug there is
contained to a leaf. Six have reach above 25. Severity as the SAST
rates it is uncorrelated with reach: seven of the nine High findings sit
in packages that at most three other packages depend on.

## What this means for a scanning queue

The two facts together are the case for the metric as a complement to
a SAST, not a replacement for one. Bug yield per scan is flat in graph
position, so ordering the queue by conemass costs nothing in bugs found;
what it buys is that the first bugs found are the ones with reach. A
fixed budget of N scans spent from the top of the conemass ranking
produces the same number of findings as N scans in any other order, and
the ones it produces are the spring-core / go-cmp / aiohttp class rather
than the apprise / cadvisor class.

The same reach number is also the triage input after a finding: "High,
reach 1" and "Low, reach 105" are different incidents, and the audit log
does not currently distinguish them.

## Caveats

- Small counts. 28 findings over three graphs; the random-expectation
  column is there precisely because every number above is within noise
  of it. The conclusion is "no signal", not "a signal in either
  direction".
- The graphs are reconstructions. Airflow's is the constraints set for
  Python 3.12 (692 pins; OpenRefactory counted 719), Jenkins's is the 89
  artifacts in the WAR (they counted 172, probably including
  build/test-scope and detached plugins), Kubernetes's is module-level.
- Audit rows for a repo at any version count, not only the version the
  release pinned; findings in `sympy`, `billiard` and `kube-openapi`
  predate or postdate the engagement.
- Name matching misses some repos (Airflow: 453 of 655 matched;
  Kubernetes: 72 of 165), and unmatched repos cannot be told apart from
  unscanned ones.

## Reproduce

```
python fetch-airflow.py .     # constraints + PyPI metadata  -> airflow-full-edges.csv
python fetch-jenkins.py .     # WAR license report + deps.dev -> jenkins-war-edges.csv
python fetch-k8s.py .         # vendor/modules.txt + go.mod   -> kubernetes-edges.csv
python analyze.py --md RESULTS.md
```

`openrefactory-all-projects.csv` is the "All Projects" tab of
OpenRefactory's public results sheet, exported 2026-10-16.
