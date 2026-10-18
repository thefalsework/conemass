# Retrodiction: OpenRefactory's Alpha-Omega dependency audits

In 2024 OpenRefactory, under an [Alpha-Omega grant](https://github.com/ossf/alpha-omega/tree/main/alpha/engagements/2024/OpenRefactory),
ran its SAST over every dependency of a release of three projects:
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
| Airflow 2.9.3 | full constraints set (core + all providers), install-time requirements only | `constraints-2.9.3/constraints-3.12.txt` + PyPI metadata (`fetch-airflow.py`) | 688 / 1,555 |
| Jenkins 2.476 | artifacts bundled in the WAR | `jenkins-war-2.476.license.xml` + deps.dev (`fetch-jenkins.py`) | 89 / 141 |
| Kubernetes v1.31.0 | Go modules in the release | `vendor/modules.txt` + each module's `go.mod` (`fetch-k8s.py`) | 215 / 2,631 |

The releases are identified from the log itself: the versions scanned in
the September 2024 Python batch are exactly the Airflow 2.9.3 pins
(`apprise` 1.8.0, `kombu` 5.3.7, `aiohttp` 3.9.5, `pure-sasl` 0.6.2, ...),
the November–December 2024 Go batch matches the v1.31.0 module set
(`cadvisor` 0.49.0, `bbolt` 1.3.9, `go-restful` 3.11.0, `go-cmp` 0.6.0),
and Jenkins 2.476 is named in the Alpha-Omega 2024 grantee report.

Audit rows are keyed by upstream repository, so the analysis is at repo
granularity: a repo with several artifacts in the graph takes the best
rank among them, and the audited project's own repo (Airflow providers,
`jenkins-core`, the `k8s.io/*` staging modules) is excluded. Only rows
dated inside each engagement's window count as findings; the same repos
scanned at other times (mostly 2023 passes over older versions) are
reported separately. Matching is by repository name with hand aliases
for multi-artifact Java repos (`analyze.py`).

Coverage of the public log against the engagement's own counts is
partial: Jenkins has 26 Java rows in the window against the 172
dependencies and 88 bugs described in the grantee report, so most Jenkins
findings are not individually recorded there; Airflow's window has 8
findings in the graph against "16 bugs in 16 dependencies" claimed; and
only 239 of the 651 Airflow repos have a row in the window at all.

## Result

Across the three graphs, 306 scanned repos matched inside the windows,
21 with bugs filed (8 security/reliability, 8 rated High).

**Where the bugs are is unrelated to conemass rank.** The median rank of
a bug repo is about the median rank of a clean one (Airflow 314 vs 348
of 651; Jenkins 27 vs 57 of 66; Kubernetes 67 vs 89 of 165), and the
number of findings inside a top-K budget is indistinguishable from the
random expectation at every K, for conemass order and for
direct-dependent order alike:

| K | Airflow (8 bugs): conemass / dependents / random | Jenkins (8): conemass / dependents / random | Kubernetes (5): conemass / dependents / random |
|---:|---|---|---|
| 10 | 0 / 0 / 0.1 | 2 / 2 / 1.2 | 1 / 1 / 0.3 |
| 25 | 0 / 0 / 0.3 | 4 / 5 / 3.0 | 1 / 1 / 0.8 |
| 50 | 0 / 0 / 0.6 | 6 / 6 / 6.1 | 1 / 2 / 1.5 |
| 100 | 0 / 1 / 1.2 | | 3 / 3 / 3.0 |

So conemass does not predict *where a SAST will find a bug*. It is not
meant to, and this is the expected null: a package's position in the
graph says nothing about its code quality.

**What the position does say is how far a bug travels.** The reach
column in `RESULTS.md` (how many packages in the release transitively
pull the repo in) is very unequal across the findings:

| finding | SAST severity | reach |
|---|---|---:|
| go-cmp (Kubernetes, logical) | Medium | 104 of 215 |
| ginkgo (Kubernetes, logical) | Medium | 31 of 215 |
| go-restful (Kubernetes, insecure deserialization) | High | 31 of 215 |
| bbolt (Kubernetes, logical) | Medium | 12 of 215 |
| spring-framework (Jenkins, null deref + XXE) | High | 9 of 88, including `jenkins-core` |
| pure-sasl, secretstorage (Airflow, weak crypto) | High | 3, 3 of 651 |
| ant (Jenkins, security misconfiguration) | High | 3 of 88 |
| remoting (Jenkins, path manipulation) | High | 2 of 88 |
| apprise (Airflow, weak crypto) | High | 1 of 651 |
| cadvisor (Kubernetes, data race) | High | 1 of 215 |

Of the 21 findings, 15 are in repos that 4 or fewer other packages pull
in: a bug there is contained to a leaf. Every Airflow finding is in
that group. Three (all in Kubernetes) have reach above 25. Severity as
the SAST rates it is uncorrelated with reach: six of the eight High
findings sit in packages that at most three other packages depend on.
The cleanest pair is inside Kubernetes: `go-restful` (insecure
deserialization, a runtime dependency of the apiserver) and `cadvisor`
(data race) carry the same High label at reach 31 and reach 1.

Two qualifications on reach. The Jenkins WAR graph is shallow, nearly
every artifact being a direct dependency of `jenkins-core`, so reach
discriminates little there. And Go module `require` lines do not
distinguish test-only use, so the 104 for `go-cmp` and 31 for `ginkgo`
overstate runtime reach: both are mostly test dependencies. The
contrast that survives both qualifications is Airflow (every finding at
reach ≤ 4) against `go-restful` and `spring-framework`.

## What this means for a scanning queue

The two facts together are the case for the metric as a complement to
a SAST, not a replacement for one. Bug yield per scan is flat in graph
position, so ordering the queue by conemass costs nothing in bugs found;
what it buys is that the first bugs found are the ones with reach. A
fixed budget of N scans spent from the top of the conemass ranking
produces about the same number of findings as N scans in any other
order, and the ones it produces are the go-restful / spring-core class
rather than the apprise / cadvisor class.

The same reach number is also the triage input after a finding: "High,
reach 1" and "High, reach 31" are different incidents, and the audit
log does not currently distinguish them.

## Caveats

- Small counts. 21 findings over three graphs; the random-expectation
  column is there precisely because every number above is within noise
  of it. The conclusion is "no signal", not "a signal in either
  direction".
- The graphs are reconstructions. Airflow's is the constraints set for
  Python 3.12 (687 pins; OpenRefactory counted 719), Jenkins's is the 89
  artifacts in the WAR (they counted 172, probably including
  build/test-scope and detached plugins), Kubernetes's is module-level.
- Five Airflow repos scanned clean in the window (`aiohttp`, `kombu`,
  `sqlalchemy`, `sympy`, `google-cloud-aiplatform`) had bugs filed in
  2023 scans of older versions, since fixed. They are counted as clean
  here, which is what the log says for the audited version.
- Name matching misses some repos (Airflow: 239 of 651 have an
  in-window row; Kubernetes: 56 of 165), and unmatched repos cannot be
  told apart from unscanned ones.

## Reproduce

```
python fetch-airflow.py .     # constraints + PyPI metadata  -> airflow-full-edges.csv
python fetch-jenkins.py .     # WAR license report + deps.dev -> jenkins-war-edges.csv
python fetch-k8s.py .         # vendor/modules.txt + go.mod   -> kubernetes-edges.csv
python analyze.py --md RESULTS.md
```

`openrefactory-all-projects.csv` is the "All Projects" tab of
OpenRefactory's public results sheet, exported 2026-10-16.
