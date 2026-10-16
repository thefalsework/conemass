#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// conemass — rank a dependency graph by concentration of reach.
//
//   conemass(x) = sum over packages u whose truncated dependency cone
//                 contains x of 1/|cone(u)|
//
// "Count every toolchain you are part of, weighting each by the
// reciprocal of its size." High conemass + low direct-dependent count
// is the quiet load-bearing profile (liblzma, unicode-ident).
// Background and validation: paper/quiet-criticality.md in this repo.
// (The metric was derived under the name ORACLE, harmonic
// cone-membership mass, in the registered studies of 2026-09-01/02;
// conemass is its public name.)
//
// Self-contained: no dependencies, single file. Handles cycles via SCC
// condensation (members of a cycle share a score).
//
// Deterministic: cones are truncated at --cap, and traversal order is
// fixed by sorting adjacency by package name before the BFS, so the
// same graph produces byte-identical output regardless of how the
// input file happens to be ordered.
//
// USAGE
//   node conemass.mjs <input> [--cap N] [--top N] [--out FILE]
//
//   <input>  dependency graph, one of:
//            - Cargo.lock: parsed directly ("node conemass.mjs
//              Cargo.lock --top 50" works on any Rust project).
//              Both dependency entry forms resolve ("serde" and
//              "serde 1.0.188"). Versions are COLLAPSED to package
//              names: a crate present at two versions is one node
//              whose dependency set is the union — consistent with
//              the package-level Debian and crates.io rankings
//              published alongside this tool;
//            - CycloneDX SBOM (.json with "bomFormat":"CycloneDX"): the
//              dependencies[] section is the edge list; each bom-ref is
//              mapped to its purl with version, qualifiers and subpath
//              stripped (pkg:npm/%40scope/name), falling back to
//              group/name. Nested components are included;
//            - SPDX SBOM (.json with "spdxVersion"): DEPENDS_ON and
//              DEPENDENCY_OF relationships (the latter reversed); packages
//              named by purl external ref if present, else by name;
//            - Graphviz .dot (e.g. `nix-store -q --graph <path>`): every
//              "a" -> "b" edge. nix-store writes dependency -> dependent
//              (reference -> referrer), detected by /nix/store/ paths and
//              flipped automatically; store paths are reduced to package
//              names (hash and version stripped). Other .dot producers
//              are read as dependent -> dependency; use --reverse if yours
//              points the other way;
//            - .json: {"nodes":[names...],"edges":[[depIdx,depIdx]...]}
//              (edges as [dependent, dependency] index pairs), or a
//              plain JSON array of [dependent, dependency] name pairs;
//            - anything else: text edge list, one "dependent,dependency"
//              per line (comma, tab, or space separated; a first line
//              containing "depend" is treated as a header and skipped).
//            Several inputs can be given; their edges are unioned, which
//            is how SBOMs from many containers become one graph. Node
//            names must agree across inputs (purls do).
//   --cap N  cone truncation (default 200; rankings are insensitive
//            50..800 on tested corpora).
//   --top N  emit only the top N rows (default: all).
//   --out F  write CSV to file F (default: stdout).
//   --reverse  flip every edge (input is dependency -> dependent).
//   --keep-versions  do not strip versions from purls / store paths.
//
// OUTPUT CSV columns:
//   conemass_rank, name, conemass, direct_dependents, dependents_rank
// Sorted by conemass_rank. The interesting rows for supply-chain triage
// are those where conemass_rank << dependents_rank.

import { readFileSync, writeFileSync } from "node:fs";

// ---- args ----
const args = process.argv.slice(2);
if (!args.length || args.includes("--help") || args.includes("-h")) {
  console.error("usage: node conemass.mjs <input>... [--cap N] [--top N] [--out FILE] [--reverse] [--keep-versions]\n" +
    "inputs: Cargo.lock | CycloneDX .json | SPDX .json | Graphviz .dot (nix-store -q --graph) | {nodes,edges} .json | edge-list text");
  process.exit(args.length ? 0 : 1);
}
const flag = (name, dflt) => {
  const i = args.indexOf(name);
  return i === -1 ? dflt : args[i + 1];
};
const CAP = +flag("--cap", 200);
const TOP = +flag("--top", 0);
const OUT = flag("--out", null);
const REVERSE = args.includes("--reverse");
const KEEP_VERSIONS = args.includes("--keep-versions");
const VALUED = new Set(["--cap", "--top", "--out"]);
const inputs = args.filter((a, i) => !a.startsWith("--") && !VALUED.has(args[i - 1]));
if (!inputs.length) { console.error("no input file given"); process.exit(1); }

// ---- load edges as name pairs ----
let names = [], edges = []; // edges: [dependentIdx, dependencyIdx]
const idx = new Map();
const id = (nm) => {
  let i = idx.get(nm);
  if (i === undefined) { i = names.length; idx.set(nm, i); names.push(nm); }
  return i;
};

// purl -> package identity: drop @version, ?qualifiers, #subpath
const purlName = (p) => {
  if (KEEP_VERSIONS) return p;
  let s = p.split("#")[0].split("?")[0];
  const at = s.lastIndexOf("@");
  if (at > "pkg:".length && !s.slice(at + 1).includes("/")) s = s.slice(0, at);
  return s;
};
// /nix/store/<hash>-name-1.2.3 -> name (Nix's own name/version split:
// the version starts at the first "-" followed by a digit)
const nixName = (p) => {
  const base = p.replace(/^.*\/nix\/store\//, "");
  const m = base.match(/^[a-z0-9]{32}-(.+)$/);
  const full = m ? m[1] : base;
  if (KEEP_VERSIONS) return full;
  const v = full.search(/-[0-9]/);
  return v > 0 ? full.slice(0, v) : full;
};

for (const input of inputs) {
const text = readFileSync(input, "utf8");
const isJson = input.endsWith(".json") || /^\s*\{/.test(text);
const isCargoLock = /(^|[\\/])Cargo\.lock$/.test(input) ||
  (!isJson && /^\[\[package\]\]/m.test(text));
const isDot = /\.(dot|gv)$/.test(input) || (!isJson && /^\s*(strict\s+)?di?graph\b/.test(text));
if (isCargoLock) {
  // Cargo.lock: [[package]] blocks with name = "..." followed by an
  // optional dependencies = [ "name", "name version", ... ] array.
  let cur = null, inDeps = false;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line === "[[package]]") { cur = null; inDeps = false; continue; }
    if (inDeps) {
      if (line.startsWith("]")) { inDeps = false; continue; }
      const dep = line.match(/^"([^" ]+)/);
      if (dep && cur !== null) edges.push([cur, id(dep[1])]);
      continue;
    }
    const nm = line.match(/^name = "([^"]+)"/);
    if (nm) { cur = id(nm[1]); continue; }
    if (line.startsWith("dependencies = [") && !line.includes("]")) inDeps = true;
  }
} else if (isDot) {
  // Graphviz: every `"a" -> "b"` (quotes optional). nix-store -q --graph
  // writes reference -> referrer, i.e. dependency -> dependent.
  const nix = /\/nix\/store\//.test(text) || /^[a-z0-9]{32}-/m.test(text);
  const edgeRe = /("([^"]*)"|([\w./:@+-]+))\s*->\s*("([^"]*)"|([\w./:@+-]+))/g;
  let m;
  while ((m = edgeRe.exec(text))) {
    let a = m[2] ?? m[3], b = m[5] ?? m[6];
    if (nix) { a = nixName(a); b = nixName(b); edges.push([id(b), id(a)]); }
    else edges.push([id(a), id(b)]);
  }
} else if (isJson) {
  const raw = JSON.parse(text);
  if (Array.isArray(raw)) {
    for (const [a, b] of raw) edges.push([id(String(a)), id(String(b))]);
  } else if (raw.bomFormat === "CycloneDX") {
    // bom-ref -> package identity, over metadata.component and all
    // components including nested ones
    const ref2name = new Map();
    const visit = (c) => {
      if (!c || typeof c !== "object") return;
      const nm = c.purl ? purlName(c.purl)
        : (c.group ? c.group + "/" : "") + (c.name ?? c["bom-ref"] ?? "?");
      if (c["bom-ref"]) ref2name.set(c["bom-ref"], nm);
      for (const sub of c.components ?? []) visit(sub);
    };
    visit(raw.metadata?.component);
    for (const c of raw.components ?? []) visit(c);
    const nameOf = (ref) => ref2name.get(ref) ?? (ref.startsWith("pkg:") ? purlName(ref) : ref);
    for (const d of raw.dependencies ?? []) {
      const a = id(nameOf(d.ref));
      for (const dep of d.dependsOn ?? []) edges.push([a, id(nameOf(dep))]);
    }
  } else if (raw.spdxVersion || raw.SPDXID) {
    const id2name = new Map();
    for (const p of raw.packages ?? []) {
      const purl = (p.externalRefs ?? []).find((r) => r.referenceType === "purl")?.referenceLocator;
      id2name.set(p.SPDXID, purl ? purlName(purl) : String(p.name ?? p.SPDXID));
    }
    const nameOf = (s) => id2name.get(s) ?? s;
    for (const r of raw.relationships ?? []) {
      const t = r.relationshipType;
      if (t === "DEPENDS_ON") edges.push([id(nameOf(r.spdxElementId)), id(nameOf(r.relatedSpdxElement))]);
      else if (t === "DEPENDENCY_OF") edges.push([id(nameOf(r.relatedSpdxElement)), id(nameOf(r.spdxElementId))]);
    }
  } else {
    const local = raw.nodes.map((nm) => id(String(nm)));
    for (const [a, b] of raw.edges) edges.push([local[a], local[b]]);
  }
} else {
  const lines = text.split("\n");
  let start = 0;
  if (lines[0] && /depend/i.test(lines[0])) start = 1;
  for (let li = start; li < lines.length; li++) {
    const line = lines[li].trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/[,\t ]+/);
    if (parts.length < 2) continue;
    edges.push([id(parts[0]), id(parts[1])]);
  }
}
} // for each input
if (REVERSE) edges = edges.map(([a, b]) => [b, a]);
const n = names.length;
if (!n) { console.error("no nodes parsed"); process.exit(1); }

// dedupe edges, drop self-loops
{
  const seen = new Set();
  const clean = [];
  for (const [a, b] of edges) {
    if (a === b) continue;
    // string key: numeric packing (a * 2^32 + b) silently collides past
    // ~2M nodes (2^53 limit), which npm-scale graphs would hit
    const k = a + ":" + b;
    if (seen.has(k)) continue;
    seen.add(k);
    clean.push([a, b]);
  }
  edges = clean;
}

// package-level direct dependents
const directDeps = new Int32Array(n);
for (const [, b] of edges) directDeps[b]++;

// adjacency (dependency direction: node -> its dependencies)
const depHead = new Int32Array(n).fill(-1);
const depNext = new Int32Array(edges.length);
const depTo = new Int32Array(edges.length);
edges.forEach(([a, b], e) => { depTo[e] = b; depNext[e] = depHead[a]; depHead[a] = e; });

// ---- iterative Tarjan SCC ----
const comp = new Int32Array(n).fill(-1);
{
  const index = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const onStack = new Uint8Array(n);
  const stack = [];
  let counter = 0, nComp = 0;
  const frameNode = [], frameEdge = [];
  for (let s = 0; s < n; s++) {
    if (index[s] !== -1) continue;
    frameNode.push(s); frameEdge.push(depHead[s]);
    index[s] = low[s] = counter++; stack.push(s); onStack[s] = 1;
    while (frameNode.length) {
      const v = frameNode[frameNode.length - 1];
      let e = frameEdge[frameNode.length - 1];
      let advanced = false;
      while (e !== -1) {
        const w = depTo[e];
        e = depNext[e];
        if (index[w] === -1) {
          frameEdge[frameNode.length - 1] = e;
          frameNode.push(w); frameEdge.push(depHead[w]);
          index[w] = low[w] = counter++; stack.push(w); onStack[w] = 1;
          advanced = true;
          break;
        } else if (onStack[w]) {
          if (index[w] < low[v]) low[v] = index[w];
        }
      }
      if (advanced) continue;
      frameNode.pop(); frameEdge.pop();
      if (low[v] === index[v]) {
        for (;;) {
          const w = stack.pop(); onStack[w] = 0; comp[w] = nComp;
          if (w === v) break;
        }
        nComp++;
      }
      if (frameNode.length) {
        const p = frameNode[frameNode.length - 1];
        if (low[v] < low[p]) low[p] = low[v];
      }
    }
  }
  var NC = nComp;
}

// canonicalize component ids (sorted by lexicographically minimal
// member name): Tarjan's numbering depends on edge order in the input,
// and it sets the float accumulation order below — without this,
// last-ulp summation noise makes tie groups split differently across
// reorderings of the same graph
{
  const repName = new Array(NC);
  for (let i = 0; i < n; i++) {
    const c = comp[i];
    if (repName[c] === undefined || names[i] < repName[c]) repName[c] = names[i];
  }
  const perm = Array.from({ length: NC }, (_, c) => c)
    .sort((x, y) => (repName[x] < repName[y] ? -1 : 1));
  const newId = new Int32Array(NC);
  perm.forEach((old, ni) => { newId[old] = ni; });
  for (let i = 0; i < n; i++) comp[i] = newId[comp[i]];
}

// condensation adjacency (component -> component dependencies, unique)
const cDeps = Array.from({ length: NC }, () => []);
{
  const seen = new Set();
  for (const [a, b] of edges) {
    const ca = comp[a], cb = comp[b];
    if (ca === cb) continue;
    const k = ca + ":" + cb;
    if (seen.has(k)) continue;
    seen.add(k);
    cDeps[ca].push(cb);
  }
}

// sort adjacency (ids are canonical, so this is by representative
// name) so that cone truncation at the cap boundary does not depend on
// the order edges appeared in the input file
for (const list of cDeps) list.sort((x, y) => x - y);

// ---- conemass over the condensation ----
const orc = new Float64Array(NC);
{
  const seen = new Int32Array(NC).fill(-1);
  for (let u = 0; u < NC; u++) {
    const cone = [];
    seen[u] = u;
    const q = [u];
    let qi = 0;
    while (qi < q.length && cone.length < CAP) {
      const v = q[qi++];
      for (const w of cDeps[v]) {
        if (seen[w] === u) continue;
        seen[w] = u;
        cone.push(w);
        // intentional: cone is full, remaining neighbors of v are
        // dropped (this is the truncation; adjacency is pre-sorted
        // above so the drop is deterministic)
        if (cone.length >= CAP) break;
        q.push(w);
      }
    }
    if (!cone.length) continue;
    const credit = 1 / cone.length;
    for (const x of cone) orc[x] += credit;
  }
}

// ---- ranks and output ----
const conemassOf = (i) => orc[comp[i]];
const rankOf = (valOf) => {
  const order = Array.from({ length: n }, (_, i) => i)
    .sort((a, b) => valOf(b) - valOf(a) || (names[a] < names[b] ? -1 : 1));
  const ranks = new Int32Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && valOf(order[j + 1]) === valOf(order[i])) j++;
    for (let k = i; k <= j; k++) ranks[order[k]] = i + 1; // min rank for ties
    i = j + 1;
  }
  return { order, ranks };
};
const { order, ranks: rOr } = rankOf(conemassOf);
const { ranks: rDeg } = rankOf((i) => directDeps[i]);

const limit = TOP > 0 ? Math.min(TOP, n) : n;
const rows = ["conemass_rank,name,conemass,direct_dependents,dependents_rank"];
for (let k = 0; k < limit; k++) {
  const i = order[k];
  rows.push(`${rOr[i]},${names[i]},${conemassOf(i).toFixed(4)},${directDeps[i]},${rDeg[i]}`);
}
const csv = rows.join("\n") + "\n";
if (OUT) { writeFileSync(OUT, csv); console.error(`wrote ${OUT} (${limit} rows of ${n} nodes, cap ${CAP})`); }
else process.stdout.write(csv);
