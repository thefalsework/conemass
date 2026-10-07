#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Rank the Lax concept graph with conemass and join the result to what a
// maintainer would want next to it: concept type, submission, downstream
// reach measured three ways (concepts, submissions, author groups), the
// usual null models, and public endorsement counts.
//
//   node analyze.mjs
//
// Reads out/nodes.json, out/edges-*.csv, out/endorsements.json (optional).
// Runs ../../conemass.mjs unmodified at caps 50/200/800 on both edge sets.
// Writes out/ranking-all.csv, out/ranking-definitions.csv,
// out/ranking-submissions.csv, out/nulls.json, out/summary.json.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const CONEMASS = "../../conemass.mjs";
const CAPS = [50, 200, 800];
const SETS = ["concepts", "union"];
const PRIMARY = { set: "union", cap: 200 };

const { submissions, concepts } = JSON.parse(readFileSync("out/nodes.json", "utf8"));
const snapshot = JSON.parse(readFileSync("out/snapshot.json", "utf8"));
const endorseFile = existsSync("out/endorsements.json") ? JSON.parse(readFileSync("out/endorsements.json", "utf8")) : null;
const endorsements = endorseFile?.concepts ?? null;
const subEndorsements = endorseFile?.submissions ?? {};
const byId = new Map(concepts.map((c) => [c.id, c]));

// ---- run conemass ----
const cm = {}; // set -> cap -> Map(id -> {rank, mass, dd, ddRank})
for (const set of SETS) {
  cm[set] = {};
  for (const cap of CAPS) {
    const file = `out/cm-${set}-cap${cap}.csv`;
    execFileSync("node", [CONEMASS, `out/edges-${set}.csv`, "--cap", String(cap), "--out", file], { stdio: ["ignore", "ignore", "inherit"] });
    const m = new Map();
    for (const line of readFileSync(file, "utf8").split("\n").slice(1)) {
      if (!line.trim()) continue;
      const [rank, name, mass, dd, ddRank] = line.split(",");
      m.set(name, { rank: +rank, mass: +mass, dd: +dd, ddRank: +ddRank });
    }
    cm[set][cap] = m;
  }
}
const primary = cm[PRIMARY.set][PRIMARY.cap];
// concepts with no edges at all are absent from conemass output; give them zero
for (const c of concepts) if (!primary.has(c.id)) primary.set(c.id, { rank: null, mass: 0, dd: 0, ddRank: null });

// ---- reverse reachability on the primary edge set (uncapped) ----
const edges = readFileSync(`out/edges-${PRIMARY.set}.csv`, "utf8").split("\n").slice(1).filter((l) => l.trim()).map((l) => l.split(","));
const dependents = new Map(concepts.map((c) => [c.id, []]));
const deps = new Map(concepts.map((c) => [c.id, []]));
for (const [a, b] of edges) { dependents.get(b).push(a); deps.get(a).push(b); }
// first human author of a submission; manifests sometimes put "Name, Codex 6" in one field
const authorKey = (subId) => (submissions[subId]?.authors?.[0] ?? subId).split(",")[0].trim();
const isSuperseded = (subId) => !!submissions[subId]?.supersededBy;
const reach = new Map();
for (const c of concepts) {
  const seen = new Set(); const st = [c.id];
  while (st.length) { const x = st.pop(); for (const y of dependents.get(x)) if (!seen.has(y)) { seen.add(y); st.push(y); } }
  const subs = new Set([...seen].map((x) => byId.get(x).submission)); subs.delete(c.submission);
  const authors = new Set([...subs].map(authorKey)); authors.delete(authorKey(c.submission));
  reach.set(c.id, { transitive: seen.size, downstreamSubs: subs.size, downstreamAuthors: authors.size, cone: seen });
}

// ---- PageRank null (dependent -> dependency, alpha 0.85) ----
const ids = concepts.map((c) => c.id); const index = new Map(ids.map((id, i) => [id, i])); const n = ids.length;
const outDeg = new Int32Array(n); for (const [a] of edges) outDeg[index.get(a)]++;
let pr = new Float64Array(n).fill(1 / n);
for (let it = 0; it < 200; it++) {
  const next = new Float64Array(n); let dangling = 0;
  for (let i = 0; i < n; i++) if (outDeg[i] === 0) dangling += pr[i];
  next.fill((1 - 0.85) / n + (0.85 * dangling) / n);
  for (const [a, b] of edges) next[index.get(b)] += (0.85 * pr[index.get(a)]) / outDeg[index.get(a)];
  let diff = 0; for (let i = 0; i < n; i++) diff += Math.abs(next[i] - pr[i]);
  pr = next; if (diff < 1e-12) break;
}
const prRank = new Map([...ids.keys()].sort((a, b) => pr[b] - pr[a]).map((i, k) => [ids[i], k + 1]));

// ---- null-model statistics ----
function spearman(xs, ys) {
  const nn = xs.length;
  const rk = (vals) => { const ord = vals.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]); const r = new Float64Array(nn); let i = 0;
    while (i < nn) { let j = i; while (j + 1 < nn && ord[j + 1][0] === ord[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[ord[k][1]] = avg; i = j + 1; } return r; };
  const ra = rk(xs), rb = rk(ys), m = (nn + 1) / 2; let num = 0, da = 0, db = 0;
  for (let i = 0; i < nn; i++) { const xa = ra[i] - m, xb = rb[i] - m; num += xa * xb; da += xa * xa; db += xb * xb; }
  return num / Math.sqrt(da * db);
}
const top40 = (score) => new Set([...ids].sort((a, b) => score(b) - score(a) || (a < b ? -1 : 1)).slice(0, 40));
const overlap = (A, B) => [...A].filter((x) => B.has(x)).length;
const massOf = (set, cap) => (id) => cm[set][cap].get(id)?.mass ?? 0;
const P = massOf(PRIMARY.set, PRIMARY.cap);
const compare = (label, score) => ({ label, spearman: +spearman(ids.map(P), ids.map(score)).toFixed(4), top40: overlap(top40(P), top40(score)) });
// current-versions-only sensitivity: drop concepts of superseded submissions and every edge touching them
const currentEdges = edges.filter(([a, b]) => !isSuperseded(byId.get(a).submission) && !isSuperseded(byId.get(b).submission));
writeFileSync("out/edges-union-current.csv", "dependent,dependency\n" + currentEdges.map((e) => e.join(",")).join("\n") + "\n");
execFileSync("node", [CONEMASS, "out/edges-union-current.csv", "--cap", String(PRIMARY.cap), "--out", "out/cm-union-current-cap200.csv"], { stdio: ["ignore", "ignore", "inherit"] });
const cmCurrent = new Map();
for (const l of readFileSync("out/cm-union-current-cap200.csv", "utf8").split("\n").slice(1)) if (l.trim()) { const f = l.split(","); cmCurrent.set(f[1], { rank: +f[0], mass: +f[2] }); }
const currentIds = ids.filter((id) => !isSuperseded(byId.get(id).submission));
const top40On = (pool, score) => new Set([...pool].sort((a, b) => score(b) - score(a) || (a < b ? -1 : 1)).slice(0, 40));
const currentCheck = {
  label: "current versions only (superseded submissions removed) vs primary, over current concepts",
  conceptsRemoved: ids.length - currentIds.length, edgesRemoved: edges.length - currentEdges.length,
  spearman: +spearman(currentIds.map(P), currentIds.map((id) => cmCurrent.get(id)?.mass ?? 0)).toFixed(4),
  top40: overlap(top40On(currentIds, P), top40On(currentIds, (id) => cmCurrent.get(id)?.mass ?? 0)),
};

const nulls = {
  primary: PRIMARY,
  currentVersionsOnly: currentCheck,
  againstNulls: [
    compare("direct dependents", (id) => primary.get(id).dd),
    compare("transitive dependents", (id) => reach.get(id).transitive),
    compare("downstream submissions", (id) => reach.get(id).downstreamSubs),
    compare("PageRank (alpha 0.85)", (id) => pr[index.get(id)]),
  ],
  capSensitivity: CAPS.filter((c) => c !== PRIMARY.cap).map((cap) => compare(`cap ${cap} vs ${PRIMARY.cap} (${PRIMARY.set})`, massOf(PRIMARY.set, cap))),
  edgeSetSensitivity: CAPS.map((cap) => ({ cap, ...compare(`concepts-only vs union at cap ${cap}`, massOf("concepts", cap)), spearmanNote: "primary is union cap 200; this compares concepts-only at the given cap against it" })),
};
writeFileSync("out/nulls.json", JSON.stringify(nulls, null, 2));

// ---- rankings ----
const isDef = (t) => /definition|infrastructure/.test(t);
const esc = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const rows = [...ids].sort((a, b) => P(b) - P(a) || (a < b ? -1 : 1));
const header = "rank,concept,type,submission,superseded_by,title,mass_union200,mass_concepts200,mass_union50,mass_union800,mass_current200,direct_dependents,dependents_rank,transitive_dependents,downstream_submissions,downstream_first_authors,pagerank_rank,endorse,flag";
const line = (id, k) => {
  const c = byId.get(id), p = primary.get(id), r = reach.get(id), e = endorsements?.[id];
  return [k, id, esc(c.type), c.submission, submissions[c.submission].supersededBy ?? "", esc(c.title), p.mass.toFixed(4), (cm.concepts[200].get(id)?.mass ?? 0).toFixed(4), (cm.union[50].get(id)?.mass ?? 0).toFixed(4), (cm.union[800].get(id)?.mass ?? 0).toFixed(4), isSuperseded(c.submission) ? "" : (cmCurrent.get(id)?.mass ?? 0).toFixed(4), p.dd, p.ddRank ?? "", r.transitive, r.downstreamSubs, r.downstreamAuthors, prRank.get(id), e ? e.endorse : "", e ? e.flag : ""].join(",");
};
let k = 0, last = null, lastRank = 0;
const allLines = rows.map((id) => { k++; const m = P(id); if (m !== last) { lastRank = k; last = m; } return line(id, lastRank); });
writeFileSync("out/ranking-all.csv", header + "\n" + allLines.join("\n") + "\n");
const defRows = rows.filter((id) => isDef(byId.get(id).type));
k = 0; last = null; lastRank = 0;
writeFileSync("out/ranking-definitions.csv", header + "\n" + defRows.map((id) => { k++; const m = P(id); if (m !== last) { lastRank = k; last = m; } return line(id, lastRank); }).join("\n") + "\n");

// submission-level: sum of concept mass within each submission (README: keep the per-concept breakdown)
const subMass = new Map();
for (const id of ids) { const s = byId.get(id).submission; const cur = subMass.get(s) ?? { mass: 0, concepts: 0, top: null, topMass: -1, endorsed: 0 };
  cur.mass += P(id); cur.concepts++; if (P(id) > cur.topMass) { cur.topMass = P(id); cur.top = id; } if ((endorsements?.[id]?.endorse ?? 0) > 0) cur.endorsed++; subMass.set(s, cur); }
const subRows = [...subMass.entries()].sort((a, b) => b[1].mass - a[1].mass);
writeFileSync("out/ranking-submissions.csv", "rank,submission,superseded_by,title,authors,mass_sum,concepts,endorsed_concepts,submission_endorse,submission_flag,top_concept,top_concept_mass\n" +
  subRows.map(([s, v], i) => [i + 1, s, submissions[s].supersededBy ?? "", esc(submissions[s].title), esc(submissions[s].authors.join("; ")), v.mass.toFixed(4), v.concepts, v.endorsed, subEndorsements[s]?.endorse ?? "", subEndorsements[s]?.flag ?? "", v.top, v.topMass.toFixed(4)].join(",")).join("\n") + "\n");

// ---- summary ----
const coverage = (K) => { const u = new Set(); for (const id of defRows.slice(0, K)) for (const x of reach.get(id).cone) u.add(x); return u.size; };
const withEdges = ids.filter((id) => primary.get(id).rank !== null).length;
const endorsedTotal = endorsements ? Object.values(endorsements).filter((v) => v.endorse > 0).length : null;
const flaggedTotal = endorsements ? Object.values(endorsements).filter((v) => v.flag > 0).length : null;
const quiet = rows.filter((id) => primary.get(id).rank !== null && primary.get(id).rank <= 40 && primary.get(id).ddRank - primary.get(id).rank >= 40);
const summary = {
  snapshot: { commit: snapshot.commit, commitDate: snapshot.commitDate },
  concepts: n, conceptsWithEdges: withEdges, definitions: defRows.length,
  edges: snapshot.edges, primary: PRIMARY,
  coverageOfArchiveByTopDefinitions: Object.fromEntries([5, 10, 20, 40].map((K) => [K, { concepts: coverage(K), share: +(coverage(K) / n).toFixed(3) }])),
  endorsements: endorsements ? {
    fetchedAt: endorseFile.fetchedAt,
    conceptsWithEndorsement: endorsedTotal, conceptsWithFlag: flaggedTotal,
    top20DefinitionsEndorsed: defRows.slice(0, 20).filter((id) => (endorsements[id]?.endorse ?? 0) > 0).length,
    top40AllEndorsed: rows.slice(0, 40).filter((id) => (endorsements[id]?.endorse ?? 0) > 0).length,
    submissionsWithEndorsement: Object.entries(subEndorsements).filter(([, v]) => v.endorse > 0).map(([s, v]) => ({ submission: s, endorse: v.endorse, massRank: subRows.findIndex(([x]) => x === s) + 1 })),
    submissionsWithFlag: Object.entries(subEndorsements).filter(([, v]) => v.flag > 0).map(([s]) => s),
  } : null,
  quietLoadBearing: quiet.map((id) => ({ id, rank: primary.get(id).rank, ddRank: primary.get(id).ddRank, dd: primary.get(id).dd, downstreamSubs: reach.get(id).downstreamSubs })),
  nulls,
};
writeFileSync("out/summary.json", JSON.stringify(summary, null, 2));

// ---- console ----
console.log(`Lax archive @ ${snapshot.commit?.slice(0, 7)} (${snapshot.commitDate}); ${n} concepts, ${withEdges} with edges; primary = ${PRIMARY.set} cap ${PRIMARY.cap}`);
console.log("nulls:", nulls.againstNulls.map((x) => `${x.label}: rho ${x.spearman}, top-40 ${x.top40}/40`).join(" | "));
console.log("cap sensitivity:", nulls.capSensitivity.map((x) => `${x.label}: rho ${x.spearman}, top-40 ${x.top40}/40`).join(" | "));
console.log(`current versions only: ${currentCheck.conceptsRemoved} concepts / ${currentCheck.edgesRemoved} edges removed; rho ${currentCheck.spearman}, top-40 ${currentCheck.top40}/40`);
console.log("edge-set sensitivity:", nulls.edgeSetSensitivity.map((x) => `cap ${x.cap}: rho ${x.spearman}, top-40 ${x.top40}/40`).join(" | "));
console.log("coverage by top definitions:", JSON.stringify(summary.coverageOfArchiveByTopDefinitions));
if (endorsements) console.log("endorsements:", JSON.stringify(summary.endorsements));
console.log("\nTop 25 definitions (union cap 200):");
console.log("rank  mass    direct  dd_rank  trans  subs  authors  pr   end  concept");
for (const id of defRows.slice(0, 25)) { const p = primary.get(id), r = reach.get(id), e = endorsements?.[id];
  console.log(`${String(p.rank).padStart(4)}  ${p.mass.toFixed(2).padStart(6)}  ${String(p.dd).padStart(6)}  ${String(p.ddRank).padStart(7)}  ${String(r.transitive).padStart(5)}  ${String(r.downstreamSubs).padStart(4)}  ${String(r.downstreamAuthors).padStart(7)}  ${String(prRank.get(id)).padStart(3)}  ${String(e ? e.endorse : "-").padStart(3)}  ${id}  (${byId.get(id).title.slice(0, 45)})`); }
console.log("\nTop 15 non-definition concepts (statements imported by others):");
for (const id of rows.filter((id) => !isDef(byId.get(id).type)).slice(0, 15)) { const p = primary.get(id), r = reach.get(id);
  console.log(`${String(p.rank).padStart(4)}  ${p.mass.toFixed(2).padStart(6)}  ${String(p.dd).padStart(6)}  ${String(p.ddRank).padStart(7)}  ${String(r.transitive).padStart(5)}  ${String(r.downstreamSubs).padStart(4)}  ${String(r.downstreamAuthors).padStart(7)}  ${String(prRank.get(id)).padStart(3)}  ${byId.get(id).type.padEnd(8)} ${id}`); }
console.log("\nquiet load-bearing (top-40 by mass, dependents_rank at least 40 places lower):", quiet.length);
for (const q of summary.quietLoadBearing) console.log(`  cm ${q.rank} | dd_rank ${q.ddRank} (${q.dd} direct) | ${q.downstreamSubs} downstream subs | ${q.id}`);
console.log("\nTop 10 submissions by summed mass:");
for (const [s, v] of subRows.slice(0, 10)) console.log(`  ${v.mass.toFixed(2).padStart(7)}  ${s.padEnd(11)} ${v.concepts} concepts, ${v.endorsed} endorsed${submissions[s].supersededBy ? `, superseded by ${submissions[s].supersededBy}` : ""}  ${submissions[s].title.slice(0, 60)}`);
