// PageRank null for the Prove2Me rankings, added 2026-09-23.
//
// Prompted by a registered conemass run on the Mathlib declaration
// graph (308K nodes) that found near-coincidence with PageRank there
// (Spearman 0.96). The original REPORT.md nulls were transitive-
// dependent count and chain depth; this script adds the comparison a
// centrality-literate reader would run first. Self-contained: computes
// conemass (via the tool at the repo root) and PageRank (alpha=0.85,
// dependent -> dependency orientation, dangling mass redistributed) on
// out/edges-union.csv and reports Spearman + top-40 overlap.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONEMASS = join(HERE, '..', '..', 'conemass.mjs');
const EDGES = join(HERE, 'out', 'edges-union.csv');

const ALPHA = 0.85, ITER = 100, TOL = 1e-10;

// ---- load edges (dependent,dependency), dedupe, drop self-loops ----
const names = [];
const idx = new Map();
const id = (nm) => {
  let i = idx.get(nm);
  if (i === undefined) { i = names.length; idx.set(nm, i); names.push(nm); }
  return i;
};
const edges = [];
{
  const lines = readFileSync(EDGES, 'utf8').split('\n');
  const seen = new Set();
  let first = true;
  for (const line of lines) {
    const t = line.trim();
    if (first) { first = false; if (/depend/i.test(t)) continue; }
    if (!t) continue;
    const [a, b] = t.split(',');
    if (!a || !b || a === b) continue;
    const k = a + '\u0001' + b;
    if (seen.has(k)) continue;
    seen.add(k);
    edges.push([id(a), id(b)]);
  }
}
const n = names.length;
console.log(`nodes ${n}, edges ${edges.length}`);

// ---- PageRank ----
const outDeg = new Int32Array(n);
for (const [a] of edges) outDeg[a]++;
let pr = new Float64Array(n).fill(1 / n);
for (let it = 0; it < ITER; it++) {
  const next = new Float64Array(n);
  let dangling = 0;
  for (let i = 0; i < n; i++) if (outDeg[i] === 0) dangling += pr[i];
  next.fill((1 - ALPHA) / n + (ALPHA * dangling) / n);
  for (const [a, b] of edges) next[b] += (ALPHA * pr[a]) / outDeg[a];
  let diff = 0;
  for (let i = 0; i < n; i++) diff += Math.abs(next[i] - pr[i]);
  pr = next;
  if (diff < TOL) { console.log(`pagerank converged at iter ${it}`); break; }
}

// ---- conemass via the tool itself (cap 200, as in analyze.mjs) ----
const cm = new Map();
{
  const csv = execFileSync('node', [CONEMASS, EDGES, '--cap', '200'], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  const lines = csv.split('\n');
  for (let li = 1; li < lines.length; li++) {
    const t = lines[li].trim();
    if (!t) continue;
    const f = t.split(',');
    cm.set(f[1], { rank: +f[0], mass: +f[2], ddRank: +f[4] });
  }
}

const common = [];
for (let i = 0; i < n; i++) if (cm.has(names[i])) common.push(i);
console.log(`common nodes: ${common.length}`);

// ---- Spearman ----
function spearman(xs, ys) {
  const nn = xs.length;
  const rk = (vals) => {
    const ord = vals.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
    const r = new Float64Array(nn);
    let i = 0;
    while (i < nn) {
      let j = i;
      while (j + 1 < nn && ord[j + 1][0] === ord[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[ord[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const ra = rk(xs), rb = rk(ys);
  const m = (nn + 1) / 2;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < nn; i++) {
    const xa = ra[i] - m, xb = rb[i] - m;
    num += xa * xb; da += xa * xa; db += xb * xb;
  }
  return num / Math.sqrt(da * db);
}
const s = spearman(common.map((i) => cm.get(names[i]).mass), common.map((i) => pr[i]));
console.log(`Spearman conemass vs PageRank: ${s.toFixed(4)}`);

// ---- top-40 overlap and key rows ----
const byMass = [...common].sort((a, b) => cm.get(names[b]).mass - cm.get(names[a]).mass);
const byPR = [...common].sort((a, b) => pr[b] - pr[a]);
const t40m = new Set(byMass.slice(0, 40).map((i) => names[i]));
const t40p = new Set(byPR.slice(0, 40).map((i) => names[i]));
console.log(`top-40 overlap: ${[...t40m].filter((x) => t40p.has(x)).length}/40`);

const prRank = new Map(byPR.map((i, k) => [names[i], k + 1]));
console.log('\ntop 15 by conemass, with PageRank rank:');
for (const i of byMass.slice(0, 15)) {
  const c = cm.get(names[i]);
  console.log(`cm ${c.rank} | pr ${prRank.get(names[i])} | dd_rank ${c.ddRank} | ${names[i]}`);
}
console.log('\nconemass top-40 rows outside PageRank top-40:');
for (const i of byMass.slice(0, 40)) {
  if (!t40p.has(names[i])) {
    const c = cm.get(names[i]);
    console.log(`cm ${c.rank} | pr ${prRank.get(names[i])} | dd_rank ${c.ddRank} | ${names[i]}`);
  }
}
