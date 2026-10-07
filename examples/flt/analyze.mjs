// Unlock mass on the FLT blueprint: conemass over the subgraph induced on
// OPEN (not yet proved) nodes. A proved dependency transmits no blocking
// under the blueprint's AND-semantics (a node is provable once every
// \uses target is done), so it is removed before cones are formed.
//
// Nulls: direct open dependents, transitive open dependents (blocked
// descendants), PageRank on the open-only graph. Also conemass on the
// full graph for reference, and a "ready" flag (open, not \notready,
// every dependency proved) marking what can be attacked now.
//
// Reads out/nodes.json, out/edges.csv (from extract.mjs). Writes
// out/ranking-unlock.csv, out/nulls.json, out/summary.json.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const CONEMASS = join(HERE, '..', '..', 'conemass.mjs');

function csvRow(line) {
  const out = []; let i = 0;
  while (i <= line.length) {
    let f = '';
    if (line[i] === '"') { i++; while (i < line.length) { if (line[i] === '"' && line[i + 1] === '"') { f += '"'; i += 2; } else if (line[i] === '"') { i++; break; } else f += line[i++]; } }
    else while (i < line.length && line[i] !== ',') f += line[i++];
    out.push(f); if (i >= line.length) break; i++;
  }
  return out;
}
const q = (s) => (/[",\n]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s));

const nodes = JSON.parse(readFileSync(join(OUT, 'nodes.json'), 'utf8'));
const byId = new Map(nodes.map((n) => [n.id, n]));
const edges = readFileSync(join(OUT, 'edges.csv'), 'utf8').trim().split(/\r?\n/).slice(1).map(csvRow);
const open = new Set(nodes.filter((n) => !n.proved).map((n) => n.id));
const openEdges = edges.filter(([a, b]) => open.has(a) && open.has(b));

function runConemass(edgeList, tag) {
  const tmp = join(OUT, `.tmp-${tag}.csv`);
  writeFileSync(tmp, 'dependent,dependency\n' + edgeList.map((e) => e.map(q).join(',')).join('\n') + '\n');
  const csv = execFileSync('node', [CONEMASS, tmp, '--cap', '200'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  unlinkSync(tmp);
  const mass = new Map();
  for (const l of csv.trim().split('\n').slice(1)) { const f = csvRow(l); mass.set(f[1], +f[2]); }
  return mass;
}
const unlock = runConemass(openEdges, 'open');
const fullMass = runConemass(edges, 'full');

// reach on the open-only graph
const openDependents = new Map([...open].map((x) => [x, []]));
const openDeps = new Map([...open].map((x) => [x, []]));
for (const [a, b] of openEdges) { openDependents.get(b).push(a); openDeps.get(a).push(b); }
const transitive = (start, adj) => { const seen = new Set(); const st = [start]; while (st.length) { const v = st.pop(); for (const w of adj.get(v)) if (!seen.has(w)) { seen.add(w); st.push(w); } } return seen; };

// ready: open, not flagged notready, every dependency (any status) proved
const allDeps = new Map(nodes.map((n) => [n.id, []]));
for (const [a, b] of edges) allDeps.get(a).push(b);
const ready = (id) => { const n = byId.get(id); return !n.proved && !n.notready && allDeps.get(id).every((d) => byId.get(d).proved); };

// PageRank on open-only graph (dependent -> dependency orientation, same as conemass)
function pagerank(edgeList) {
  const names = [], idx = new Map(); const id = (nm) => { let i = idx.get(nm); if (i === undefined) { i = names.length; idx.set(nm, i); names.push(nm); } return i; };
  const es = edgeList.map(([a, b]) => [id(a), id(b)]); const n = names.length; if (!n) return new Map();
  const outDeg = new Int32Array(n); for (const [a] of es) outDeg[a]++;
  let pr = new Float64Array(n).fill(1 / n);
  for (let it = 0; it < 200; it++) {
    const next = new Float64Array(n); let dangling = 0;
    for (let i = 0; i < n; i++) if (outDeg[i] === 0) dangling += pr[i];
    next.fill(0.15 / n + (0.85 * dangling) / n);
    for (const [a, b] of es) next[b] += (0.85 * pr[a]) / outDeg[a];
    let diff = 0; for (let i = 0; i < n; i++) diff += Math.abs(next[i] - pr[i]);
    pr = next; if (diff < 1e-12) break;
  }
  return new Map(names.map((nm, i) => [nm, pr[i]]));
}
const pr = pagerank(openEdges);

// open-cone size per open node (its own remaining blockers); a dependent
// whose open cone is exactly {x} closes the moment x does
const openConeSize = new Map([...open].map((x) => [x, transitive(x, openDeps).size]));
const rows = [...open].map((id) => {
  const n = byId.get(id);
  const blocked = transitive(id, openDependents);
  const blockedSubs = new Set([...blocked].map((x) => byId.get(x).chapter));
  const soleBlocked = [...blocked].filter((x) => openConeSize.get(x) === 1).length;
  return {
    id, type: n.type, chapter: n.chapter, stated: n.stated, notready: n.notready, ready: ready(id),
    unlock: unlock.get(id) ?? 0, fullMass: fullMass.get(id) ?? 0,
    directOpenDependents: openDependents.get(id).length, blockedDescendants: blocked.size, soleBlocked,
    blockedChapters: blockedSubs.size, openDeps: openDeps.get(id).length, openCone: openConeSize.get(id),
    pr: pr.get(id) ?? 0, lean: n.lean.join(' '), title: n.title,
  };
});
const sortBy = (k) => [...rows].sort((a, b) => b[k] - a[k] || (a.id < b.id ? -1 : 1));
const byUnlock = sortBy('unlock'), byDirect = sortBy('directOpenDependents'), byBlocked = sortBy('blockedDescendants'), byPR = sortBy('pr'), byFull = sortBy('fullMass');
byUnlock.forEach((r, i) => (r.rank = i + 1));
const rankMap = (arr) => new Map(arr.map((r, i) => [r.id, i + 1]));
const rDirect = rankMap(byDirect), rBlocked = rankMap(byBlocked), rPR = rankMap(byPR), rFull = rankMap(byFull);
const spearman = (ra, rb) => { const n = rows.length; let d2 = 0; for (const r of rows) d2 += (ra.get(r.id) - rb.get(r.id)) ** 2; return 1 - (6 * d2) / (n * (n * n - 1)); };
const rUnlock = rankMap(byUnlock);
const overlap = (a, b, N) => { const s = new Set(a.slice(0, N).map((r) => r.id)); return b.slice(0, N).filter((r) => s.has(r.id)).length; };
const nulls = {};
for (const [name, arr, rm] of [['direct open dependents', byDirect, rDirect], ['blocked descendants', byBlocked, rBlocked], ['PageRank open-only', byPR, rPR], ['conemass full graph', byFull, rFull]])
  nulls[name] = { spearman: +spearman(rUnlock, rm).toFixed(4), top10: overlap(byUnlock, arr, 10), top20: overlap(byUnlock, arr, 20) };

const header = 'unlock_rank,id,type,chapter,stated,notready,ready,unlock_mass,sole_blocked,direct_open_dependents,direct_rank,blocked_descendants,blocked_rank,blocked_chapters,open_dependencies,open_cone,pagerank_rank,full_graph_mass,full_graph_rank,lean,title';
writeFileSync(join(OUT, 'ranking-unlock.csv'), header + '\n' + byUnlock.map((r) => [r.rank, r.id, r.type, r.chapter, r.stated ? 1 : 0, r.notready ? 1 : 0, r.ready ? 1 : 0, r.unlock.toFixed(4), r.soleBlocked, r.directOpenDependents, rDirect.get(r.id), r.blockedDescendants, rBlocked.get(r.id), r.blockedChapters, r.openDeps, r.openCone, rPR.get(r.id), r.fullMass.toFixed(4), rFull.get(r.id), r.lean, r.title].map(q).join(',')).join('\n') + '\n');
writeFileSync(join(OUT, 'nulls.json'), JSON.stringify(nulls, null, 1));

const summary = {
  nodes: nodes.length, open: open.size, proved: nodes.length - open.size, edges: edges.length, openOnlyEdges: openEdges.length,
  openIsolated: rows.filter((r) => r.unlock === 0 && r.directOpenDependents === 0 && r.openDeps === 0).length,
  openWithZeroUnlock: rows.filter((r) => r.unlock === 0).length,
  readyOpen: rows.filter((r) => r.ready).length, notreadyOpen: rows.filter((r) => r.notready).length,
  maxBlockedDescendants: Math.max(...rows.map((r) => r.blockedDescendants)),
  readyWithSoleBlocked: rows.filter((r) => r.ready && r.soleBlocked > 0).length,
  readyWithUnlockGe1: rows.filter((r) => r.ready && r.unlock >= 1).length,
  largestOpenCone: (() => { const r = [...rows].sort((a, b) => b.openCone - a.openCone)[0]; return { id: r.id, openCone: r.openCone }; })(),
  byChapter: (() => { const c = {}; for (const r of rows) { c[r.chapter] = c[r.chapter] || { open: 0, ready: 0, notready: 0, unlockSum: 0 }; c[r.chapter].open++; if (r.ready) c[r.chapter].ready++; if (r.notready) c[r.chapter].notready++; c[r.chapter].unlockSum = +(c[r.chapter].unlockSum + r.unlock).toFixed(3); } return c; })(),
  depthOpen: (() => { const memo = new Map(); const d = (x) => { if (memo.has(x)) return memo.get(x); memo.set(x, 0); const v = 1 + Math.max(0, ...openDeps.get(x).map(d)); memo.set(x, v); return v; }; return Math.max(...[...open].map(d)); })(),
  nulls,
};
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));

const fmt = (r) => `${String(r.rank).padStart(3)} ${r.unlock.toFixed(3).padStart(7)} sole ${r.soleBlocked} dir ${String(r.directOpenDependents).padStart(2)} (#${String(rDirect.get(r.id)).padStart(3)}) blk ${String(r.blockedDescendants).padStart(3)} (#${String(rBlocked.get(r.id)).padStart(3)}) cone ${String(r.openCone).padStart(2)} ${r.ready ? 'READY' : r.notready ? 'notready' : r.stated ? 'stated' : '     '} ${r.type.padEnd(10)} ${r.chapter.padEnd(28)} ${r.id}`;
console.log('\nTop 25 open nodes by unlock mass');
byUnlock.slice(0, 25).forEach((r) => console.log(fmt(r)));
console.log('\nTop 15 READY nodes by unlock mass (attackable now)');
byUnlock.filter((r) => r.ready).slice(0, 15).forEach((r) => console.log(fmt(r)));
console.log('\nTop 10 by blocked descendants');
byBlocked.slice(0, 10).forEach((r) => console.log(fmt(r)));
