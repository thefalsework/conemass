# Unlock mass on GitHub issue graphs: killed at feasibility

**Date:** 2026-09-22. **Verdict:** negative. Recorded so nobody retries it.

## The idea

conemass restricted to open nodes worked on the Prove2Me theorem graph
as an "unlock mass" ranking: open items ranked by how much downstream
work closing them releases (`examples/prove2me/REPORT.md`, Ranking 2).
The same reading should transfer to any DAG of tasks with open/closed
status. GitHub issues with blocking relationships are the obvious
large public corpus: the metric would tell a maintainer which open
issue, if closed this week, un-sticks the most work — the liblzma
profile transposed into project management, with a designable
retrodiction (rank a year-old snapshot, check what closing the
high-mass issues actually released).

## The feasibility question

Cone metrics need cones: chains of blocking relationships several
levels deep. The check was whether public GitHub projects record
blocking edges densely enough for any cone structure to exist, via
three mechanisms:

1. **Native issue dependencies** (`blockedBy`/`blocking`, GA August
   2025) — first-class edges, the ideal substrate.
2. **Task-list tracking** (`trackedIssues`/`trackedInIssues`, 2022) —
   edges induced by `- [ ] #123` task lists.
3. **Text conventions** ("blocked by #N" / "blocked on #N" in issue
   bodies) — the informal mechanism that predates both.

## Method

`probe.mjs` samples up to 2,000 most-recently-updated open issues per
repository via GraphQL and records per-issue dependency summaries and
tracking counts. Text conventions counted via the search API. Eight
large, actively maintained repositories probed on 2026-09-22:
kubernetes/kubernetes, rust-lang/rust, bevyengine/bevy,
microsoft/vscode, godotengine/godot, home-assistant/core,
NixOS/nixpkgs, grafana/grafana. Raw per-issue rows in `out/`.

## Results

| repo | issues sampled | native dep issues | blocked-by edges | tracking issues | tracked edges |
|---|---|---|---|---|---|
| kubernetes/kubernetes | 1,883 | 0 (0.0%) | 0 | 18 (1.0%) | 10 |
| rust-lang/rust | 2,000 | 6 (0.3%) | 2 | 51 (2.5%) | 35 |
| bevyengine/bevy | 2,000 | 2 (0.1%) | 1 | 13 (0.7%) | 7 |
| microsoft/vscode | 2,000 | 0 (0.0%) | 0 | 1 (0.1%) | 0 |
| godotengine/godot | 2,000 | 1 (0.1%) | 0 | 94 (4.7%) | 619 |
| home-assistant/core | 2,000 | 4 (0.2%) | 1 | 0 (0.0%) | 0 |
| NixOS/nixpkgs | 2,000 | 3 (0.1%) | 1 | 1 (0.1%) | 3 |
| grafana/grafana | 2,000 | 22 (1.1%) | 21 | 39 (1.9%) | 56 |

Text conventions are equally sparse: "blocked by" plus "blocked on"
in open-issue bodies totals 10–54 issues per repo against open-issue
populations in the thousands to tens of thousands.

The one apparent exception dissolves on inspection. Godot's 619
tracking edges live in 14 meta-issues (top counts 182, 111, 51, ...),
and **zero** sampled issues both track and are tracked. The topology
is a set of depth-1 stars: every edge goes from one epic to one leaf,
no chains, no cones. On a star, unlock mass degenerates to blocked
count — the incumbent metric conemass exists to improve on.

## Verdict

Killed at feasibility, mechanism identified: the substrate does not
exist in public GitHub data. Native dependencies (a year old at probe
time) have near-zero adoption in flagship OSS projects; task-list
tracking is used as flat epic rosters, not dependency chains; text
conventions are rare and unparseable at the density required. No cone
structure means nothing for the metric to measure, so no study and no
retrodiction were run.

## Where the terrain might exist

Not claimed, merely noted: enterprise Jira instances use "blocks"
links heavily, and GitLab has had first-class blocking links for
years. Both are mostly private. If a dense task DAG with historical
snapshots ever becomes available, the Prove2Me design (rank open
stratum, null against blocked count and depth, bracket the semantics)
transfers as-is.

## Reproduce

```
node probe.mjs owner/repo [owner/repo ...]
```

Requires a GitHub token (`GITHUB_TOKEN` or `gh auth token`). Samples
are capped at `MAX_ISSUES` (default 2,000) most-recently-updated open
issues, so re-runs on the same repos will drift as issues update.
