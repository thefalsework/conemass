// Verification gate: spot-check known declarations in mathlib_edges.csv
// and cross-check dependency sets against mathlib-const-dep (lean_scout).
import { readFileSync, readdirSync } from 'node:fs';
import { parquetReadObjects, asyncBufferFromFile } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

const TARGETS = [
  'Nat.succ_le_of_lt',
  'Finset.sum_congr',
  'Real.add_pow_le_pow_mul_pow_of_sq_le_sq',
  'List.mem_toFinset',
  'Continuous.add',
  'zsmul_eq_mul',
];

// --- pass 1: stream mathlib_edges.csv for target rows ---
const targetSet = new Set(TARGETS);
const graphDeps = new Map(TARGETS.map((t) => [t, new Set()]));
let found = 0;
{
  const { createReadStream } = await import('node:fs');
  const readline = await import('node:readline');
  const rl = readline.createInterface({ input: createReadStream('data/mathlib_edges.csv'), crlfDelay: Infinity });
  let first = true;
  for await (const line of rl) {
    if (first) { first = false; continue; }
    const c1 = line.indexOf(',');
    const src = line.slice(0, c1);
    if (targetSet.has(src)) {
      const c2 = line.indexOf(',', c1 + 1);
      graphDeps.get(src).add(line.slice(c1 + 1, c2));
      found++;
    }
  }
}
console.log('edge rows found for targets:', found);

// --- pass 2: scan const-dep parquet parts for the same names ---
const constDeps = new Map();
const parts = readdirSync('data/constdep').filter((f) => f.endsWith('.parquet'));
for (const p of parts) {
  const file = await asyncBufferFromFile(`data/constdep/${p}`);
  const rows = await parquetReadObjects({ file, columns: ['name', 'deps'], compressors });
  for (const r of rows) {
    if (targetSet.has(r.name)) constDeps.set(r.name, new Set(r.deps));
  }
}

// --- compare ---
for (const t of TARGETS) {
  const g = graphDeps.get(t) ?? new Set();
  const c = constDeps.get(t);
  if (!c) { console.log(`\n${t}: NOT FOUND in const-dep (graph deps: ${g.size})`); continue; }
  const inter = [...g].filter((x) => c.has(x));
  const gOnly = [...g].filter((x) => !c.has(x));
  const cOnly = [...c].filter((x) => !g.has(x));
  console.log(`\n${t}`);
  console.log(`  graph deps: ${g.size} | const-dep deps: ${c.size} | agree: ${inter.length}`);
  console.log(`  jaccard: ${(inter.length / new Set([...g, ...c]).size).toFixed(3)}`);
  if (gOnly.length) console.log(`  graph-only (first 6): ${gOnly.slice(0, 6).join(', ')}`);
  if (cOnly.length) console.log(`  constdep-only (first 6): ${cOnly.slice(0, 6).join(', ')}`);
}
console.log('\nsample of one graph dep set (Nat.succ_le_of_lt):', [...(graphDeps.get('Nat.succ_le_of_lt') ?? [])].join(', '));
