#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Extract the concept dependency graph of the Lax archive from a local
// clone of lax-archive/lax-database.
//
//   node extract.mjs [--db PATH]
//
// --db defaults to ~/.lax/lax-database (what `lax doctor` maintains); any
// clone of https://github.com/lax-archive/lax-database works.
//
// Scope: registered submissions only — the immutable, citable archive.
// Drafts, init stubs, and tombstones are excluded (drafts are "not usable
// as a dependency" per the Lax spec, and can be overwritten or deleted).
// Mathlib imports are outside the archive and are not nodes.
//
// Node = concept (a Lean module pairing prose with a statement or
// definition; the unit a reviewer endorses). Two edge sets, both
// oriented dependent -> dependency as conemass expects:
//
//   edges-concepts.csv  concept A imports concept B
//   edges-union.csv     the above, plus: a proof of a statement in A
//                       assumes a statement in B  (A -> B). Assumptions
//                       are the pipeline-computed `#print axioms` set
//                       recorded in build-output.json, not author claims.
//
// Outputs in out/: snapshot.json, nodes.json, edges-concepts.csv,
// edges-union.csv.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i === -1 ? dflt : args[i + 1]; };
const DB = flag("--db", join(homedir(), ".lax", "lax-database"));
if (!existsSync(DB)) { console.error(`no database at ${DB} (clone lax-archive/lax-database or run \`lax doctor\`)`); process.exit(1); }
mkdirSync("out", { recursive: true });

let commit = null, commitDate = null;
try {
  commit = execSync("git rev-parse HEAD", { cwd: DB }).toString().trim();
  commitDate = execSync("git log -1 --format=%cI", { cwd: DB }).toString().trim();
} catch { /* not a git checkout; fine */ }

const states = {};
const subs = new Map();      // id -> { title, authors, createdAt, env }
const concepts = new Map();  // concept id -> node record
const stmtConcept = new Map(); // statement id -> concept id
const proofs = [];
for (const d of readdirSync(DB).filter((x) => x.startsWith("lax-")).sort()) {
  const rp = join(DB, d, "record.json"), bp = join(DB, d, "build-output.json");
  if (!existsSync(rp) || !existsSync(bp)) continue;
  const rec = JSON.parse(readFileSync(rp, "utf8"));
  states[rec.state] = (states[rec.state] || 0) + 1;
  if (rec.state !== "registered") continue;
  const bo = JSON.parse(readFileSync(bp, "utf8"));
  const m = bo.inputs?.manifest ?? {};
  subs.set(d, {
    title: m.title ?? "", authors: (m.authors ?? []).map((a) => a.name), createdAt: rec.createdAt,
    env: `${m.leanVersion ?? ""}/${(m.mathlibVersion ?? "").slice(0, 12)}`,
    supersedes: m.supersedes ?? null, supersededBy: null,
  });
  for (const c of bo.concepts ?? []) {
    concepts.set(c.id, {
      id: c.id, submission: d, type: c.type, title: c.title, statements: (c.statements ?? []).map((s) => s.id),
      imports: c.imports ?? [], mathlibImports: (c.mathlibImports ?? []).length,
    });
    for (const s of c.statements ?? []) stmtConcept.set(s.id, c.id);
  }
  for (const p of bo.proofs ?? []) proofs.push({ id: p.id, submission: d, conclusion: p.conclusion, assumptions: p.assumptions ?? [] });
}

// version chains: a registered successor's `supersedes` claim is binding (spec, "Successors")
let superseded = 0;
for (const [id, s] of subs) if (s.supersedes && subs.has(s.supersedes)) { subs.get(s.supersedes).supersededBy = id; superseded++; }

// edge set 1: concept imports
const importEdges = new Set();
let importDangling = 0;
for (const c of concepts.values()) for (const i of c.imports) {
  if (!concepts.has(i)) { importDangling++; continue; } // import of a non-registered concept: should not happen in registered scope
  if (i !== c.id) importEdges.add(`${c.id},${i}`);
}
// edge set 2: union with proof assumptions lifted to concept level
const unionEdges = new Set(importEdges);
let assumptionEdges = 0, assumptionDangling = 0;
for (const p of proofs) {
  const a = stmtConcept.get(p.conclusion);
  if (!a) { assumptionDangling++; continue; }
  for (const s of p.assumptions) {
    const b = stmtConcept.get(s);
    if (!b) { assumptionDangling++; continue; }
    if (a === b) continue;
    const k = `${a},${b}`;
    if (!unionEdges.has(k)) { unionEdges.add(k); assumptionEdges++; }
  }
}

const header = "dependent,dependency\n";
writeFileSync("out/edges-concepts.csv", header + [...importEdges].sort().join("\n") + "\n");
writeFileSync("out/edges-union.csv", header + [...unionEdges].sort().join("\n") + "\n");
writeFileSync("out/nodes.json", JSON.stringify({ submissions: Object.fromEntries(subs), concepts: [...concepts.values()] }, null, 1));
const snapshot = {
  database: "https://github.com/lax-archive/lax-database", commit, commitDate, extractedAt: new Date().toISOString(),
  recordsByState: states, registeredSubmissions: subs.size, supersededRegistered: superseded, concepts: concepts.size,
  statements: stmtConcept.size, proofs: proofs.length,
  edges: { concepts: importEdges.size, union: unionEdges.size, assumptionOnly: assumptionEdges },
  dangling: { imports: importDangling, assumptions: assumptionDangling },
};
writeFileSync("out/snapshot.json", JSON.stringify(snapshot, null, 2));
console.log(JSON.stringify(snapshot, null, 2));
