# Triage a Grype scan of `apache/airflow:2.9.3`

A real scanner report against a real SBOM, run through `--findings`.
Everything here reproduces from the two input files with no network
access.

```
node conemass.mjs examples/airflow-image/airflow-2.9.3.cdx.json --findings examples/airflow-image/airflow-2.9.3.grype.json
```

## Inputs

- `airflow-2.9.3.cdx.json`: CycloneDX SBOM of the official image, `syft
  registry:apache/airflow:2.9.3 -o cyclonedx-json` (syft 1.54.1,
  2026-10-18). 2,425 components (384 PyPI, 203 Debian), 1,968
  dependency edges; 573 components take part in an edge and are the
  graph.
- `airflow-2.9.3.grype.json`: `grype sbom:airflow-2.9.3.cdx.json -o
  json` (grype 0.120.1, vulnerability DB built 2026-10-18). 2,133
  matches: 124 Critical, 709 High, 858 Medium, 161 Low, 259 Negligible,
  22 Unknown. The committed file is trimmed to the fields `--findings`
  reads (`vulnerability.id/severity/fix`, `artifact.name/version/purl`),
  9.2 MB to 0.7 MB; output is byte-identical to the full report.
- `triage.csv`: the output.

The image is from July 2024 and was scanned in October 2026, so the
finding count is what a two-year-old base image looks like, not a
comment on Airflow.

## What the table says

2,133 findings land on 176 packages, and those 176 expose 405 of the 573
graph nodes. `fix_mass` sums to 405.0, one unit per exposed node.

Head of the table, sorted by `fix_mass`:

| package | findings | max severity | fixable | reach | sole | fix_mass |
|---|---:|---|---|---:|---:|---:|
| deb/gcc-12-base | 4 | High | 1/4 | 180 | 0 | 38.9 |
| deb/libc6 | 32 | Critical | 9/32 | 179 | 0 | 38.4 |
| deb/libgcc-s1 | 4 | High | 1/4 | 179 | 0 | 38.4 |
| pypi/cryptography | 7 | High | 7/7 | 176 | 2 | 15.8 |
| pypi/idna | 1 | Medium | 1/1 | 175 | 2 | 15.1 |
| pypi/protobuf | 2 | High | 2/2 | 111 | 8 | 13.3 |
| pypi/pyopenssl | 2 | High | 2/2 | 160 | 0 | 11.7 |
| pypi/jaraco-context | 1 | High | 1/1 | 156 | 1 | 11.4 |
| pypi/urllib3 | 8 | High | 8/8 | 158 | 0 | 10.9 |
| pypi/pip | 6 | Medium | 6/6 | 155 | 0 | 10.4 |

Sorted by severity instead, the top ten are `golang/stdlib` (reach 1),
`curl` (0), `libpython3.11-minimal` (7), `python3.11-minimal` (4),
`libpython3.11-stdlib` (4), `python3.11` (2), `libcurl4` (1), `rsync`
(0), `libssl3` (37), `openssl` (2). Of the 40 packages carrying a
Critical finding, 14 have reach of at most 1 and 8 have reach 0
(`curl`, `rsync`, `perl`, `sqlite3`, `openssh-client`, `locales`,
`mariadb-client`, `libmariadb3-compat`): nothing in the image depends
on them, so their exposure is their own. Only 4 Critical packages have
reach of 50 or more. Severity and reach are different axes here, as
they were in the Alpha-Omega audit data (`../alpha-omega/`).

`sole_exposure` is nonzero for 13 packages. `protobuf` is the only
affected package in the cone of 8 others; `pyasn1` of 4; `jinja2` of 3.
Those are the fixes that close dependents outright. The Debian base
triple (`gcc-12-base`, `libc6`, `libgcc-s1`) is a dependency cycle in
dpkg's records, so the three share one reach and no single one of them
is a sole exposure for anything.

## Caveats specific to this input

- syft records a Python package's `Requires-Dist` including
  extras-marked requirements, so `urllib3 -> cryptography` and
  `urllib3 -> pyopenssl` are edges here though they are only active
  under `urllib3[secure]`. `cryptography`'s reach of 176 is partly
  that. An SBOM from the resolved install (`pip`, `uv`, or the Airflow
  constraints file) would not have those edges; see
  `../alpha-omega/fetch-airflow.py` for the stripped version of the
  same graph.
- 7 scanner entries are not graph nodes (`pkg:generic/python`,
  `krb5`, `mariadb`, two Debian packages with no dependency entry).
  They are reported on stderr and left out of the table.
- Grype matched Go binaries at module granularity (no symbol capture
  in the SBOM); the `golang/stdlib` row is probably over-reported.
