# conemass

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
oracle_rank,name,oracle,direct_dependents,dependents_rank
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
zlib. On the last Debian release before the xz backdoor, ORACLE ranked
liblzma5 **#8 of 63,436 packages** (against #173 by dependent count) —
twenty-one months before anyone knew to look.

The metric:

```
ORACLE(x) = sum over packages u whose truncated dependency cone
            contains x of 1 / |cone(u)|
```

Count every toolchain you are part of, weighting each by the reciprocal
of its size. High ORACLE with a low dependent count is the quiet
load-bearing profile. The rows that matter for triage are the ones where
`oracle_rank` is far ahead of `dependents_rank`.

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

**Output columns:** `oracle_rank, name, oracle, direct_dependents,
dependents_rank`.

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
- Descriptive rankings, not certified claims. ORACLE's head is
  deliberately library-heavy — libraries are the attack surface.

## Published rankings

`rankings/` contains dated top-1000 CSVs, generated with this tool:

| file | corpus | snapshot |
|---|---|---|
| `rankings/debian-trixie-2025-top1000.csv` | Debian main/binary-amd64 (68,750 packages) | trixie, 2025 |
| `rankings/crates-2022-top1000.csv` | crates.io (84,439 crates) | 2022 |

Computed 2026-09-02 and published as-is: every future incident either
involves a package in these files or it does not, and the files are
dated.

## Background

The validation — the xz retrodiction, the crates.io replication, and
the comparison against the OpenSSF criticality-score top-1000 — is
written up in
[the quiet-criticality preprint](https://github.com/thefalsework/papers/blob/main/preprints/quiet-criticality/paper.md);
the study scripts are in `oracle-scanner/` of that repo (and in this
repo's history).

## License

Apache-2.0.
