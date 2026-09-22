#!/usr/bin/env node
// Feasibility probe: do large GitHub projects use blocking/tracking edges
// densely enough to carry a cone metric?
//
// Samples open issues per repo (newest first) and counts, per issue:
//   - native dependency edges (blockedBy / blocking, GA Aug 2025)
//   - task-list tracking edges (trackedIssues / trackedInIssues, 2022+)
//
// Usage: node probe.mjs owner/repo [owner/repo ...]
//   GITHUB_TOKEN taken from env or `gh auth token`.
// Output: per-repo summary to stdout, raw per-issue rows to out/probe-<owner>-<repo>.json

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
mkdirSync(OUT, { recursive: true });

const MAX_ISSUES = Number(process.env.MAX_ISSUES ?? 2000);
const token = process.env.GITHUB_TOKEN ?? execSync('gh auth token').toString().trim();

const QUERY = `
query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    issues(first: 100, after: $cursor, states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number
        issueDependenciesSummary { blockedBy blocking totalBlockedBy totalBlocking }
        trackedIssues { totalCount }
        trackedInIssues { totalCount }
      }
    }
  }
}`;

async function gql(variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables }),
  });
  const body = await res.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors));
  return body.data;
}

for (const slug of process.argv.slice(2)) {
  const [owner, name] = slug.split('/');
  const rows = [];
  let cursor = null;
  process.stdout.write(`${slug}: sampling`);
  while (rows.length < MAX_ISSUES) {
    let data;
    try {
      data = await gql({ owner, name, cursor });
    } catch (e) {
      process.stdout.write(` [error: ${e.message.slice(0, 200)}]`);
      break;
    }
    const page = data.repository.issues;
    for (const n of page.nodes) {
      rows.push({
        number: n.number,
        dep_blocked_by: n.issueDependenciesSummary?.blockedBy ?? 0,
        dep_blocking: n.issueDependenciesSummary?.blocking ?? 0,
        dep_total_blocked_by: n.issueDependenciesSummary?.totalBlockedBy ?? 0,
        dep_total_blocking: n.issueDependenciesSummary?.totalBlocking ?? 0,
        tracked: n.trackedIssues.totalCount,
        tracked_in: n.trackedInIssues.totalCount,
      });
    }
    process.stdout.write('.');
    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }
  console.log(` ${rows.length} issues`);

  const withDep = rows.filter((r) => r.dep_total_blocked_by + r.dep_total_blocking > 0);
  const withTrack = rows.filter((r) => r.tracked + r.tracked_in > 0);
  const depEdges = rows.reduce((s, r) => s + r.dep_total_blocked_by, 0);
  const trackEdges = rows.reduce((s, r) => s + r.tracked, 0);
  const pct = (n) => ((100 * n) / Math.max(rows.length, 1)).toFixed(1) + '%';
  console.log(`  native dependencies: ${withDep.length} issues (${pct(withDep.length)}), ${depEdges} blocked-by edges in sample`);
  console.log(`  task-list tracking:  ${withTrack.length} issues (${pct(withTrack.length)}), ${trackEdges} tracked edges in sample`);

  writeFileSync(join(OUT, `probe-${owner}-${name}.json`), JSON.stringify(rows));
}
