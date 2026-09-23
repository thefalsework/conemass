// Join conemass ranking with MathlibGraph precomputed metrics; run
// registered nulls (PageRank primary, in_degree, dag_layer) and apply
// the registered flat-result verdicts F1-F3 from REGISTRATION.md.
import { readFileSync, writeFileSync } from 'node:fs';

// --- simple CSV line parser (handles quoted fields) ---
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
      out.push(s);
      i = j + 1;
    } else {
      let j = line.indexOf(',', i);
      if (j === -1) j = line.length;
      out.push(line.slice(i, j));
      i = j + 1;
    }
    if (i > line.length) break;
  }
  return out;
}

// --- load metrics ---
const met = new Map();
{
  const txt = readFileSync('data/decl-metrics.csv', 'utf8');
  const lines = txt.split('\n');
  const hdr = parseLine(lines[0].trim());
  const col = Object.fromEntries(hdr.map((h, i) => [h, i]));
  for (let li = 1; li < lines.length; li++) {
    const line = lines[li];
    if (!line || !line.trim()) continue;
    const f = parseLine(line.replace(/\r$/, ''));
    const name = f[col.name];
    met.set(name, {
      kind: f[col.kind],
      module: f[col.module],
      in_degree: +f[col.in_degree],
      pagerank: +f[col.pagerank],
      dag_layer: +f[col.dag_layer],
      is_instance: f[col.is_instance] === 'True',
      to_additive_pair: f[col.to_additive_pair],
    });
  }
}
console.log('metrics rows:', met.size);

// --- load conemass ranking ---
const rows = [];
{
  const txt = readFileSync('out-ranking.csv', 'utf8');
  const lines = txt.split('\n');
  for (let li = 1; li < lines.length; li++) {
    const line = lines[li].trim();
    if (!line) continue;
    const f = line.split(',');
    rows.push({ rank: +f[0], name: f[1], mass: +f[2], dd: +f[3], ddRank: +f[4] });
  }
}
console.log('conemass rows:', rows.length);

// --- common nodes ---
const common = rows.filter((r) => met.has(r.name));
console.log('common with metrics:', common.length, `(missing metadata: ${rows.length - common.length})`);

// --- Spearman over common nodes ---
function spearman(pairs) {
  const nn = pairs.length;
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
  const ra = rk(pairs.map((p) => p[0]));
  const rb = rk(pairs.map((p) => p[1]));
  let sa = 0, sb = 0;
  for (let i = 0; i < nn; i++) { sa += ra[i]; sb += rb[i]; }
  const ma = sa / nn, mb = sb / nn;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < nn; i++) {
    const xa = ra[i] - ma, xb = rb[i] - mb;
    num += xa * xb; da += xa * xa; db += xb * xb;
  }
  return num / Math.sqrt(da * db);
}

const massArr = common.map((r) => r.mass);
const prArr = common.map((r) => met.get(r.name).pagerank);
const inArr = common.map((r) => met.get(r.name).in_degree);
const dlArr = common.map((r) => met.get(r.name).dag_layer);

const sPR = spearman(common.map((r, i) => [massArr[i], prArr[i]]));
const sIN = spearman(common.map((r, i) => [massArr[i], inArr[i]]));
const sDL = spearman(common.map((r, i) => [massArr[i], dlArr[i]]));

// --- top-40 overlaps (on common set, by each metric) ---
const topN = (arr, key, N = 40) =>
  new Set([...arr].sort((a, b) => key(b) - key(a)).slice(0, N).map((r) => r.name));
const t40mass = topN(common, (r) => r.mass);
const t40pr = topN(common, (r) => met.get(r.name).pagerank);
const t40in = topN(common, (r) => met.get(r.name).in_degree);
const ovPR = [...t40mass].filter((x) => t40pr.has(x)).length;
const ovIN = [...t40mass].filter((x) => t40in.has(x)).length;

console.log('\n=== Nulls (all common nodes) ===');
console.log(`Spearman conemass vs pagerank:  ${sPR.toFixed(4)}   top-40 overlap: ${ovPR}/40`);
console.log(`Spearman conemass vs in_degree: ${sIN.toFixed(4)}   top-40 overlap: ${ovIN}/40`);
console.log(`Spearman conemass vs dag_layer: ${sDL.toFixed(4)}`);

// --- registered verdicts ---
const head40 = common.slice(0, 40);
const foundational = head40.filter((r) => {
  const m = met.get(r.name);
  return m.dag_layer >= 0 && m.dag_layer <= 5 || !m.module || m.module === '';
}).length;
const instances = head40.filter((r) => met.get(r.name).is_instance).length;
console.log('\n=== Registered verdicts ===');
console.log(`F1 re-expression: overlap PR ${ovPR}/40, in_degree ${ovIN}/40 (kill if >=30)`);
console.log(`F2 foundational saturation: ${foundational}/40 head rows with dag_layer<=5 or core module (kill if >=30)`);
console.log(`F3 instance flooding: ${instances}/40 head rows are typeclass instances`);

// --- head table with quiet profile ---
console.log('\n=== conemass top 40 (common set) ===');
console.log('rank | name | mass | in_deg | dd_rank | pr_rank | dag_layer | kind | inst');
// pagerank rank over common
const prSorted = [...common].sort((a, b) => met.get(b.name).pagerank - met.get(a.name).pagerank);
const prRank = new Map(prSorted.map((r, i) => [r.name, i + 1]));
for (const r of head40) {
  const m = met.get(r.name);
  console.log(`${r.rank} | ${r.name} | ${r.mass.toFixed(1)} | ${m.in_degree} | ${r.ddRank} | ${prRank.get(r.name)} | ${m.dag_layer} | ${m.kind} | ${m.is_instance ? 'INST' : ''}`);
}

// --- head with instances stripped (F3 companion view) ---
console.log('\n=== top 40 excluding instances ===');
let shown = 0;
for (const r of common) {
  if (met.get(r.name).is_instance) continue;
  const m = met.get(r.name);
  console.log(`${r.rank} | ${r.name} | ${r.mass.toFixed(1)} | in_deg ${m.in_degree} | dd_rank ${r.ddRank} | pr_rank ${prRank.get(r.name)} | layer ${m.dag_layer} | ${m.kind}`);
  if (++shown >= 40) break;
}

// --- divergence: top conemass rows ranked much lower by pagerank/in-degree ---
console.log('\n=== quiet profile: conemass top-200 rows with dd_rank/conemass_rank >= 20 ===');
shown = 0;
for (const r of common.slice(0, 200)) {
  if (r.ddRank / r.rank >= 20) {
    const m = met.get(r.name);
    console.log(`cm ${r.rank} vs dd ${r.ddRank} vs pr ${prRank.get(r.name)} | ${r.name} | in_deg ${m.in_degree} | layer ${m.dag_layer} | ${m.kind}${m.is_instance ? ' INST' : ''}`);
    shown++;
  }
}
if (!shown) console.log('(none)');

writeFileSync('out-analysis.json', JSON.stringify({
  spearman: { pagerank: sPR, in_degree: sIN, dag_layer: sDL },
  top40_overlap: { pagerank: ovPR, in_degree: ovIN },
  verdicts: { F2_foundational_head: foundational, F3_instances_head: instances },
}, null, 2));
console.log('\nwrote out-analysis.json');
