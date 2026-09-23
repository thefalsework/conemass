// Out-of-family check for oracle-scanner/10-graph-anatomy.mjs (S2).
// PREDICTION, stated before running: Mathlib's mean TRUNCATED-cone
// depth (cap 200, the depth conemass actually sees) is LOW — below
// Debian's ~5, despite Mathlib being globally the deepest graph in
// the program — because dense fanout fills the 200-node cap within a
// couple of hops. If instead the truncated depth is Debian-deep
// (>= 5) while Mathlib coincides with PageRank (measured: Spearman
// 0.96), the S2 candidate takes an out-of-family hit.
//
// POSTSCRIPT (after the run): mean truncated depth 4.45, mean cone
// size 150.4/200 (75% cap saturation — fanout, not chains). Below the
// Debian median (5.19) as predicted, but inside the Debian family
// range (4.41-5.54): debian-2025 at depth 4.41 separates while
// Mathlib at 4.45 coincides. Partial pass — direction right, not
// discriminating in the 4-5 band. Full analysis in
// falsework-papers/oracle-scanner/10-graph-anatomy.mjs postscript.

import { readFileSync } from "node:fs";

const raw = JSON.parse(readFileSync("data/edges.json", "utf8"));
const n = raw.nodes.length;
const deps = Array.from({ length: n }, () => []);
for (const [s, t] of raw.edges) deps[s].push(t);

const CAP = 200;
const seen = new Int32Array(n).fill(-1);
const depth = new Int32Array(n);
let sumDepth = 0, sumSize = 0, nz = 0;
const depthHist = new Map();
for (let u = 0; u < n; u++) {
  seen[u] = u; depth[u] = 0;
  let size = 0, maxD = 0;
  const q = [u];
  let head = 0;
  while (head < q.length && size < CAP) {
    const v = q[head++];
    for (const w of deps[v]) {
      if (seen[w] === u) continue;
      seen[w] = u;
      depth[w] = depth[v] + 1;
      if (depth[w] > maxD) maxD = depth[w];
      size++;
      if (size >= CAP) break;
      q.push(w);
    }
  }
  if (size > 0) {
    nz++; sumDepth += maxD; sumSize += size;
    depthHist.set(maxD, (depthHist.get(maxD) ?? 0) + 1);
  }
}
console.log(`nodes ${n}, nonempty cones ${nz}`);
console.log(`mean truncated-cone depth (cap ${CAP}): ${(sumDepth / nz).toFixed(2)}`);
console.log(`mean truncated-cone size: ${(sumSize / nz).toFixed(1)}`);
console.log("depth histogram (depth: count):",
  [...depthHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}:${c}`).join("  "));
