#!/usr/bin/env node
// Full analysis over the mission-tree corpus.
//   1. conemass on edges-union.csv (upper bracket) and edges-guaranteed.csv
//      (lower bracket), joined with node status; brackets compared.
//   2. Open-theorem frontier ranking.
//   3. Definition stratum ranking (audit priority).
//   4. Nulls over the OPEN STRATUM ONLY:
//        - transitive-dependent count (the serious competitor)
//        - longest dependent-chain depth (the weak competitor)
//      Each: top-40 overlap with conemass top-40, Spearman over the stratum,
//      plus the divergence exemplars (high conemass, low null rank).
// Outputs: out/ranking-open.csv, out/ranking-definitions.csv,
//          out/nulls.json, console summary.

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const CONEMASS = join(HERE, '..', '..', 'conemass.mjs');

const nodes = JSON.parse(readFileSync(join(OUT, 'nodes-missions.json'), 'utf8'));
// Names can collide across verification environments. A name whose ids carry
// conflicting statuses is a merged row of distinct theorems; exclude it from
// both strata rather than guess.
const statusByName = new Map();
for (const n of nodes) {
  const prev = statusByName.get(n.name);
  if (prev === undefined) statusByName.set(n.name, n.status);
  else if (prev !== n.status) statusByName.set(n.name, 'Ambiguous');
}
const ambiguous = [...statusByName.entries()].filter(([, s]) => s === 'Ambiguous');
if (ambiguous.length) console.log(`status-ambiguous names excluded from strata: ${ambiguous.map(([n]) => n).join(', ')}`);
const titleByName = new Map(nodes.map((n) => [n.name, n.title]));

function runConemass(file) {
  const csv = execFileSync('node', [CONEMASS, join(OUT, file)], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const rows = new Map();
  for (const l of csv.trim().split('\n').slice(1)) {
    const m = l.match(/^(\d+),("(?:[^"]|"")*"|[^,]*),([^,]*),([^,]*),([^,]*)$/);
    if (!m) continue;
    const name = m[2].startsWith('"') ? m[2].slice(1, -1).replace(/""/g, '"') : m[2];
    rows.set(name, { rank: +m[1], mass: +m[3], deps: +m[4], depsRank: +m[5] });
  }
  return rows;
}

const unionRank = runConemass('edges-union.csv');
const guarRank = runConemass('edges-guaranteed.csv');

// ---- graph structures from union edges ----
const dependentsOf = new Map(); // dependency -> [dependents] ("who is above me")
for (const l of readFileSync(join(OUT, 'edges-union.csv'), 'utf8').trim().split('\n').slice(1)) {
  const i = l.indexOf(',');
  if (i < 0) continue;
  const dep = l.slice(0, i), dcy = l.slice(i + 1);
  if (!dependentsOf.has(dcy)) dependentsOf.set(dcy, []);
  dependentsOf.get(dcy).push(dep);
}

// transitive dependents (BFS up), and longest-chain depth (memo DFS with cycle guard)
function transCount(x) {
  const seen = new Set([x]);
  const q = [x];
  while (q.length) {
    for (const up of dependentsOf.get(q.pop()) ?? []) {
      if (!seen.has(up)) { seen.add(up); q.push(up); }
    }
  }
  return seen.size - 1;
}
const depthMemo = new Map();
const inStack = new Set();
function depth(x) {
  if (depthMemo.has(x)) return depthMemo.get(x);
  if (inStack.has(x)) return 0;
  inStack.add(x);
  let d = 0;
  for (const up of dependentsOf.get(x) ?? []) d = Math.max(d, 1 + depth(up));
  inStack.delete(x);
  depthMemo.set(x, d);
  return d;
}

// ---- open stratum ----
const open = [...unionRank.entries()]
  .filter(([name]) => statusByName.get(name) === 'Open')
  .map(([name, u]) => ({
    name, massU: u.mass, deps: u.deps,
    massG: guarRank.get(name)?.mass ?? 0,
    trans: transCount(name), depth: depth(name),
  }))
  .sort((a, b) => b.massU - a.massU);
const n = open.length;

// bracket comparison: Spearman between union and guaranteed over open stratum
function spearman(arr, keyA, keyB) {
  const rk = (key) => {
    const sorted = [...arr].sort((a, b) => b[key] - a[key]);
    const r = new Map();
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j < sorted.length && sorted[j][key] === sorted[i][key]) j++;
      const avg = (i + j + 1) / 2;
      for (let k = i; k < j; k++) r.set(sorted[k].name, avg);
      i = j;
    }
    return r;
  };
  const ra = rk(keyA), rb = rk(keyB);
  let d2 = 0;
  for (const x of arr) d2 += (ra.get(x.name) - rb.get(x.name)) ** 2;
  return 1 - (6 * d2) / (arr.length * (arr.length ** 2 - 1));
}
const topSet = (key, N) => new Set([...open].sort((a, b) => b[key] - a[key] || (a.name < b.name ? -1 : 1)).slice(0, N).map((r) => r.name));
const overlapOf = (key, N) => {
  const cm = topSet('massU', N), other = topSet(key, N);
  return [...cm].filter((x) => other.has(x)).length;
};

const N = 40;
const results = {
  open_stratum_size: n,
  bracket: {
    multi_sketch_note: 'union 8333 edges vs guaranteed 7895',
    spearman_union_vs_guaranteed: +spearman(open, 'massU', 'massG').toFixed(4),
    top40_overlap: overlapOf('massG', N),
  },
  null_transitive_dependents: {
    spearman_vs_conemass: +spearman(open, 'massU', 'trans').toFixed(4),
    top40_overlap: overlapOf('trans', N),
  },
  null_chain_depth: {
    spearman_vs_conemass: +spearman(open, 'massU', 'depth').toFixed(4),
    top40_overlap: overlapOf('depth', N),
  },
};

// divergence exemplars: in conemass top-40, low rank under transitive count
const transRank = new Map([...open].sort((a, b) => b.trans - a.trans).map((r, i) => [r.name, i + 1]));
const depthRank = new Map([...open].sort((a, b) => b.depth - a.depth).map((r, i) => [r.name, i + 1]));
const divergent = open.slice(0, N)
  .map((r) => ({ name: r.name, massU: r.massU, deps: r.deps, trans: r.trans, depth: r.depth, transRank: transRank.get(r.name), depthRank: depthRank.get(r.name) }))
  .filter((r) => r.transRank > N)
  .sort((a, b) => b.transRank - a.transRank);
results.divergent_top40_conemass_but_outside_trans_top40 = divergent;

writeFileSync(join(OUT, 'nulls.json'), JSON.stringify(results, null, 2));

// ---- emit rankings ----
const openLines = ['open_rank,name,conemass_union,conemass_guaranteed,direct_dependents,transitive_dependents,chain_depth,title'];
open.forEach((r, i) => openLines.push(
  `${i + 1},${q(r.name)},${r.massU.toFixed(4)},${r.massG.toFixed(4)},${r.deps},${r.trans},${r.depth},${q(titleByName.get(r.name) ?? '')}`));
writeFileSync(join(OUT, 'ranking-open.csv'), openLines.join('\n') + '\n');

const defs = [...unionRank.entries()]
  .filter(([name]) => statusByName.get(name) === 'Definition')
  .map(([name, u]) => ({ name, mass: u.mass, deps: u.deps }))
  .sort((a, b) => b.mass - a.mass);
const defLines = ['def_rank,name,conemass,direct_dependents,title'];
defs.forEach((r, i) => defLines.push(`${i + 1},${q(r.name)},${r.mass.toFixed(4)},${r.deps},${q(titleByName.get(r.name) ?? '')}`));
writeFileSync(join(OUT, 'ranking-definitions.csv'), defLines.join('\n') + '\n');

// ---- console summary ----
console.log(JSON.stringify(results, null, 2));
console.log(`\ndefinitions ranked: ${defs.length}`);
console.log(`\n=== Top 25 OPEN (conemass_union | guaranteed | trans-deps | depth) ===`);
for (const [i, r] of open.slice(0, 25).entries()) {
  console.log(`${String(i + 1).padStart(4)}  ${r.massU.toFixed(4).padStart(8)}  ${r.massG.toFixed(4).padStart(8)}  tr=${String(r.trans).padStart(4)} (r${transRank.get(r.name)})  d=${String(r.depth).padStart(3)} (r${depthRank.get(r.name)})  ${r.name}`);
}
console.log(`\n=== Top 20 DEFINITIONS (audit priority) ===`);
for (const [i, r] of defs.slice(0, 20).entries()) {
  console.log(`${String(i + 1).padStart(4)}  ${r.mass.toFixed(4).padStart(9)}  deps=${String(r.deps).padStart(3)}  ${r.name}`);
}

function q(s) {
  return /[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
