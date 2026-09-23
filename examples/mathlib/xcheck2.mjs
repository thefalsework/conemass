import { createReadStream } from 'node:fs';
import readline from 'node:readline';

const probes = ['Finset.prod_congr', 'Finset.sum_congr', 'Continuous.mul', 'Continuous.add'];
const outCount = new Map(probes.map((p) => [p, 0]));
const inCount = new Map(probes.map((p) => [p, 0]));

const rl = readline.createInterface({ input: createReadStream('data/mathlib_edges.csv'), crlfDelay: Infinity });
let first = true;
for await (const line of rl) {
  if (first) { first = false; continue; }
  const c1 = line.indexOf(',');
  const src = line.slice(0, c1);
  const c2 = line.indexOf(',', c1 + 1);
  const tgt = line.slice(c1 + 1, c2);
  if (outCount.has(src)) outCount.set(src, outCount.get(src) + 1);
  if (inCount.has(tgt)) inCount.set(tgt, inCount.get(tgt) + 1);
}
for (const p of probes) console.log(`${p}: out=${outCount.get(p)} in=${inCount.get(p)}`);
