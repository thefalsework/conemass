# conemass on the Lax archive

Fifth graph type for the metric: the concept dependency graph of the
[Lax Lean Archive](https://laxarchive.org) (Bojańczyk, Bonnet, Dreier,
Kuske, Toruńczyk), where every submission pairs natural-language
mathematics with Lean statements, and proofs are kernel-checked against
those statements. The archive's own spec names the one thing the kernel
cannot check — whether a formal statement means what its prose claims —
and answers it with public endorsements. This example ranks the concepts
by how much of the archive rests on them, so that endorsement effort can
start where a faithfulness error would propagate furthest.

**Read `REPORT.md`** — the definition audit-priority ranking, the
imported-statement ranking, endorsement coverage joined per concept,
null checks (dependent count, transitive count, downstream submissions,
PageRank), cap and edge-set and version-chain sensitivity, and the
caveats.

## Files

- `extract.mjs` — reads a local clone of
  [lax-archive/lax-database](https://github.com/lax-archive/lax-database)
  (registered submissions only), writes the concept graph as two edge
  lists: concept imports, and imports unioned with pipeline-computed
  proof assumptions lifted to concept level.
- `endorsements.mjs` — fetches public endorse/flag counts for every
  concept page from the archive's review service (read-only, paced;
  resumable).
- `analyze.mjs` — runs `../../conemass.mjs` unmodified at caps
  50/200/800 on both edge sets, joins concept metadata, downstream reach
  (concepts, submissions, first authors), PageRank and the other nulls,
  and endorsements; writes the ranking CSVs and `out/nulls.json`,
  `out/summary.json`.
- `out/ranking-definitions.csv` (515 rows), `out/ranking-all.csv`
  (1,313 rows), `out/ranking-submissions.csv` (96 rows),
  `out/endorsements.json`, `out/edges-*.csv`, `out/snapshot.json` —
  the outputs behind `REPORT.md` (database commit `a4697a7`,
  2026-10-07).

## Run it

Needs Node 18+ and a clone of the public database (no credentials). The
site's `/index.json` lists each record's concepts and proof ids but not
concept imports or proof assumptions, so the graph needs the database:

```
git clone https://github.com/lax-archive/lax-database ~/.lax/lax-database   # or `lax doctor`
node extract.mjs            # --db PATH to point elsewhere
node endorsements.mjs       # optional; ~20 minutes at the default pacing
node analyze.mjs
```
