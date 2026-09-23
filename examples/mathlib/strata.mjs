// Cap robustness (200 vs 800) + theorem stratum (Mathlib-proper theorems).
import { readFileSync } from 'node:fs';

function parseLine(line) {
  const out = [];
  let i = 0;
  while (i <= line.length) {
    if (line[i] === '"') {
      let j = i + 1, s = '';
      while (j < line.length) {
        if (line[j] === '"' && line[j + 1] === '"') { s += '"'; j += 2; }
        else if (line[j] === '"') { j++; break; }
        else { s += line[j++]; }
      }
      out.push(s); i = j + 1;
    } else {
      let j = line.indexOf(',', i);
      if (j === -1) j = line.length;
      out.push(line.slice(i, j)); i = j + 1;
    }
    if (i > line.length) break;
  }
  return out;
}

const met = new Map();
{
  const lines = readFileSync('data/decl-metrics.csv', 'utf8').split('\n');
  const col = Object.fromEntries(parseLine(lines[0].trim()).map((h, i) => [h, i]));
  for (let li = 1; li < lines.length; li++) {
    if (!lines[li] || !lines[li].trim()) continue;
    const f = parseLine(lines[li].replace(/\r$/, ''));
    met.set(f[col.name], {
      kind: f[col.kind], module: f[col.module],
      in_degree: +f[col.in_degree], pagerank: +f[col.pagerank],
      dag_layer: +f[col.dag_layer], is_instance: f[col.is_instance] === 'True',
    });
  }
}

const load = (file) => {
  const lines = readFileSync(file, 'utf8').split('\n');
  const rows = [];
  for (let li = 1; li < lines.length; li++) {
    const line = lines[li].trim();
    if (!line) continue;
    const f = line.split(',');
    rows.push({ rank: +f[0], name: f[1], mass: +f[2], dd: +f[3], ddRank: +f[4] });
  }
  return rows;
};
const r200 = load('out-ranking.csv');
const r800 = load('out-ranking-cap800.csv');

// cap robustness: top-40 overlap and head comparison
const t40a = new Set(r200.slice(0, 40).map((r) => r.name));
const t40b = new Set(r800.slice(0, 40).map((r) => r.name));
const ov = [...t40a].filter((x) => t40b.has(x)).length;
console.log(`cap 200 vs cap 800: top-40 overlap ${ov}/40`);
const rank800 = new Map(r800.map((r) => [r.name, r.rank]));
// Spearman on top-1000 of cap200 vs their cap800 ranks
{
  const sub = r200.slice(0, 1000).filter((r) => rank800.has(r.name));
  const xs = sub.map((r) => r.rank), ys = sub.map((r) => rank800.get(r.name));
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2;
  }
  console.log(`rank corr (cap200 top-1000 vs cap800): ${(num / Math.sqrt(dx * dy)).toFixed(4)}`);
}

// pagerank ranks
const common = r200.filter((r) => met.has(r.name));
const prSorted = [...common].sort((a, b) => met.get(b.name).pagerank - met.get(a.name).pagerank);
const prRank = new Map(prSorted.map((r, i) => [r.name, i + 1]));

// theorem stratum: kind=theorem, non-null module (Mathlib proper, not Lean core)
console.log('\n=== theorem stratum: top 40 Mathlib-module theorems by conemass (cap 200) ===');
console.log('cm_rank | name | mass | in_deg | dd_rank | pr_rank | layer');
let shown = 0;
const thmStratum = [];
for (const r of common) {
  const m = met.get(r.name);
  if (m.kind !== 'theorem' || !m.module) continue;
  thmStratum.push(r);
  if (shown < 40) {
    console.log(`${r.rank} | ${r.name} | ${r.mass.toFixed(1)} | ${m.in_degree} | ${r.ddRank} | ${prRank.get(r.name)} | ${m.dag_layer}`);
    shown++;
  }
}

// within the theorem stratum: divergence vs pagerank (quiet-vs-pagerank profile)
console.log('\n=== theorem stratum, top 200 by conemass, where pr_rank/cm_stratum_rank >= 5 ===');
shown = 0;
thmStratum.slice(0, 200).forEach((r, i) => {
  const strRank = i + 1;
  const pr = prRank.get(r.name);
  if (pr / r.rank >= 5) {
    const m = met.get(r.name);
    console.log(`cm ${r.rank} (stratum ${strRank}) vs pr ${pr} vs dd ${r.ddRank} | ${r.name} | in_deg ${m.in_degree}`);
    shown++;
  }
});
if (!shown) console.log('(none — pagerank finds everything conemass finds in this stratum)');
