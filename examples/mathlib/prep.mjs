// Stream mathlib_edges.csv -> edges.json in conemass's documented JSON
// input format: {"nodes":[names...],"edges":[[dependentIdx,dependencyIdx],...]}
// No filtering: all edges (explicit + implicit), per registration.
import { createReadStream, createWriteStream } from 'node:fs';
import readline from 'node:readline';

const names = [];
const idx = new Map();
const id = (nm) => {
  let i = idx.get(nm);
  if (i === undefined) { i = names.length; idx.set(nm, i); names.push(nm); }
  return i;
};

const out = createWriteStream('data/edges.json');
const rl = readline.createInterface({ input: createReadStream('data/mathlib_edges.csv'), crlfDelay: Infinity });
let first = true, count = 0, commaNames = 0;
const chunks = [];
let firstEdge = true;
chunks.push('{"edges":[');
for await (const line of rl) {
  if (first) { first = false; continue; }
  const c1 = line.indexOf(',');
  if (c1 === -1) continue;
  const c2 = line.indexOf(',', c1 + 1);
  const src = line.slice(0, c1);
  const tgt = line.slice(c1 + 1, c2 === -1 ? line.length : c2);
  if (!src || !tgt) continue;
  chunks.push((firstEdge ? '' : ',') + '[' + id(src) + ',' + id(tgt) + ']');
  firstEdge = false;
  count++;
  if (chunks.length > 20000) { out.write(chunks.join('')); chunks.length = 0; }
}
chunks.push('],"nodes":');
out.write(chunks.join(''));
for (const nm of names) if (nm.includes(',')) commaNames++;
out.write(JSON.stringify(names));
out.write('}');
await new Promise((res) => out.end(res));
console.log(`edges: ${count}, nodes: ${names.length}, names containing commas: ${commaNames}`);
