// Corrected unlock mass: cones over OPEN theorems only. Added
// 2026-09-23, prompted by an external review of the published files.
//
// What was wrong. The published frontier (analyze.mjs ->
// out/ranking-open.csv) runs conemass on the FULL mission graph and
// then filters rows to Open status. Cones therefore still contain
// already-proved children, and credit is split over finished work —
// so "closing a theorem releases exactly its mass" (REPORT.md, first
// version) was false for the mass number. Exactness holds only for
// the enumerated parent list. Separately, "the union bracket is an
// upper bound on unlock" was false for the mass: in the published CSV
// 71 of 504 open theorems score HIGHER under the guaranteed bracket,
// because a bigger cone dilutes every member's 1/|cone| share. The
// brackets bound the EDGE SET, never the harmonic score.
//
// What this computes. The remaining-work object the spec's "unlock"
// language actually describes: the subgraph induced on Open theorems
// (an edge survives iff both endpoints are Open; proved children are
// done and transmit no blocking under Property 1's AND-semantics).
// conemass on that subgraph is the harmonic share of *remaining*
// blockage. Also reruns the PageRank null on the corrected object.
//
// Self-contained against published files: needs out/ranking-open.csv
// (for the open stratum) and out/edges-{union,guaranteed}.csv.
// Output: out/ranking-unlock-open.csv + console comparison.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const CONEMASS = join(HERE, '..', '..', 'conemass.mjs');

// minimal CSV row parser (quotes with "" escapes)
function csvRow(line) {
  const out = [];
  let i = 0;
  while (i <= line.length) {
    let field = '';
    if (line[i] === '"') {
      i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { field += '"'; i += 2; }
        else if (line[i] === '"') { i++; break; }
        else field += line[i++];
      }
    } else {
      while (i < line.length && line[i] !== ',') field += line[i++];
    }
    out.push(field);
    if (i >= line.length) break;
    i++; // skip comma
  }
  return out;
}

// ---- open stratum from the published ranking ----
const pub = readFileSync(join(OUT, 'ranking-open.csv'), 'utf8')
  .trim().split(/\r?\n/).slice(1)
  .map(csvRow)
  .map((f) => ({ oldRank: +f[0], name: f[1], massU: +f[2], massG: +f[3], title: f[7] ?? '' }));
const openSet = new Set(pub.map((r) => r.name));
console.log(`open theorems (published stratum): ${openSet.size}`);

// ---- induced open-only edges, conemass via the tool ----
function inducedMass(edgeFile) {
  const lines = readFileSync(join(OUT, edgeFile), 'utf8').trim().split(/\r?\n/).slice(1);
  const kept = lines.filter((l) => {
    const [a, b] = csvRow(l);
    return openSet.has(a) && openSet.has(b);
  });
  const tmp = join(OUT, `.tmp-open-${edgeFile}`);
  writeFileSync(tmp, 'dependent,dependency\n' + kept.join('\n') + '\n');
  const csv = execFileSync('node', [CONEMASS, tmp, '--cap', '200'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  unlinkSync(tmp);
  const mass = new Map();
  for (const l of csv.trim().split('\n').slice(1)) {
    const f = csvRow(l);
    mass.set(f[1], +f[2]);
  }
  return { mass, edges: kept.map(csvRow) };
}
const U = inducedMass('edges-union.csv');
const G = inducedMass('edges-guaranteed.csv');
console.log(`open-only edges: union ${U.edges.length}, guaranteed ${G.edges.length}`);

const rows = pub.map((r) => ({
  ...r,
  unlockU: U.mass.get(r.name) ?? 0,
  unlockG: G.mass.get(r.name) ?? 0,
}));
const byNew = [...rows].sort((a, b) => b.unlockU - a.unlockU || (a.name < b.name ? -1 : 1));
const byNewG = [...rows].sort((a, b) => b.unlockG - a.unlockG || (a.name < b.name ? -1 : 1));
const byOld = [...rows].sort((a, b) => b.massU - a.massU || (a.name < b.name ? -1 : 1));

// ---- comparisons ----
const top = (arr, N) => new Set(arr.slice(0, N).map((r) => r.name));
for (const N of [10, 40]) {
  const o = top(byOld, N), nw = top(byNew, N);
  console.log(`top-${N} overlap, published vs open-only: ${[...o].filter((x) => nw.has(x)).length}/${N}`);
}
const rankMap = (arr) => new Map(arr.map((r, i) => [r.name, i + 1]));
const ro = rankMap(byOld), rn = rankMap(byNew);
{
  let d2 = 0;
  const n = rows.length;
  for (const r of rows) d2 += (ro.get(r.name) - rn.get(r.name)) ** 2;
  console.log(`Spearman published vs open-only: ${(1 - (6 * d2) / (n * (n * n - 1))).toFixed(4)}`);
}
console.log(`published rows with guaranteed > union: ${pub.filter((r) => r.massG > r.massU + 1e-9).length}/${pub.length}`);
console.log(`open-only rows with guaranteed > union: ${rows.filter((r) => r.unlockG > r.unlockU + 1e-9).length}/${rows.length}`);
console.log(`isolated on open-only union subgraph (unlock 0): ${rows.filter((r) => r.unlockU === 0).length}`);

// The edge-set choice matters (nothing bounds anything), so report the
// guaranteed ordering alongside the union one the CSV is sorted by.
{
  const t40u = top(byNew, 40), t40g = top(byNewG, 40);
  console.log(`top-40 overlap, open-only union vs open-only guaranteed: ${[...t40u].filter((x) => t40g.has(x)).length}/40`);
  const t10u = top(byNew, 10), t10g = top(byNewG, 10);
  console.log(`top-10 overlap, open-only union vs open-only guaranteed: ${[...t10u].filter((x) => t10g.has(x)).length}/10`);
  const rg = rankMap(byNewG);
  console.log('report-named rows, rank under union / guaranteed ordering:');
  for (const nm of rows.map((r) => r.name).filter((n) =>
    /Richstein2001\.segmented_sieve_coverage|space_groups_master_classification|zeta_ne_zero_of_strip_of_six_lt_im/.test(n)))
    console.log(`  ${rn.get(nm)} / ${rg.get(nm)}  ${nm}`);
}

// ---- PageRank null on the corrected object, both edge sets ----
function pagerankNull(rawEdges, ordering, label) {
  const names = [];
  const idx = new Map();
  const id = (nm) => {
    let i = idx.get(nm);
    if (i === undefined) { i = names.length; idx.set(nm, i); names.push(nm); }
    return i;
  };
  const edges = rawEdges.map(([a, b]) => [id(a), id(b)]);
  const n = names.length;
  const outDeg = new Int32Array(n);
  for (const [a] of edges) outDeg[a]++;
  let pr = new Float64Array(n).fill(1 / n);
  for (let it = 0; it < 200; it++) {
    const next = new Float64Array(n);
    let dangling = 0;
    for (let i = 0; i < n; i++) if (outDeg[i] === 0) dangling += pr[i];
    next.fill((1 - 0.85) / n + (0.85 * dangling) / n);
    for (const [a, b] of edges) next[b] += (0.85 * pr[a]) / outDeg[a];
    let diff = 0;
    for (let i = 0; i < n; i++) diff += Math.abs(next[i] - pr[i]);
    pr = next;
    if (diff < 1e-12) break;
  }
  const prByName = new Map(names.map((nm, i) => [nm, pr[i]]));
  const inGraph = rows.filter((r) => prByName.has(r.name));
  const byPR = [...inGraph].sort((a, b) => prByName.get(b.name) - prByName.get(a.name) || (a.name < b.name ? -1 : 1));
  const t40u = top(ordering.filter((r) => prByName.has(r.name)), 40);
  const t40p = top(byPR, 40);
  console.log(`PageRank null, open-only ${label} (${inGraph.length} in-graph nodes): top-40 overlap ${[...t40u].filter((x) => t40p.has(x)).length}/40`);
}
pagerankNull(U.edges, byNew, 'union edges vs union ordering');
pagerankNull(G.edges, byNewG, 'guaranteed edges vs guaranteed ordering');

// ---- emit corrected ranking ----
const q = (s) => (/[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
const lines = ['unlock_rank,name,unlock_open_union,unlock_open_guaranteed,published_open_rank,published_conemass_union,title'];
byNew.forEach((r, i) => lines.push(
  `${i + 1},${q(r.name)},${r.unlockU.toFixed(4)},${r.unlockG.toFixed(4)},${r.oldRank},${r.massU.toFixed(4)},${q(r.title)}`));
writeFileSync(join(OUT, 'ranking-unlock-open.csv'), lines.join('\n') + '\n');
console.log(`\nwrote out/ranking-unlock-open.csv (${byNew.length} rows)`);

console.log('\ntop 15 corrected unlock (published rank in parens):');
byNew.slice(0, 15).forEach((r, i) => console.log(`  ${String(i + 1).padStart(2)}. ${r.unlockU.toFixed(4)}  (was ${ro.get(r.name)})  ${r.name}`));
