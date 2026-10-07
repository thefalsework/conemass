// Parse the FLT blueprint (leanblueprint LaTeX) into a dependency graph
// with per-node status.
//
// Input: a clone of github.com/ImperialCollegeLondon/FLT (path via FLT_DIR,
// default C:/dev/FLT or ~/FLT). Only chapters \input'd by content.tex are
// read, so retired chapters (ch03freyold) are excluded as they are from the
// rendered blueprint.
//
// Node = a labelled statement environment (theorem, lemma, proposition,
// corollary, definition). Edge = node -> each label in its \uses{...}
// (statement and proof), direction dependent -> dependency.
//
// Status, following leanblueprint's conventions:
//   stated  : \leanok or \mathlibok in the statement environment
//   proved  : \leanok or \mathlibok in the proof environment (definitions:
//             stated, and proof ok if a proof environment is present).
//             \mathlibok marks material already upstreamed to Mathlib
//             (the whole Frobenius chapter at this snapshot).
//   notready: \notready anywhere on the node
//   open    : not proved
//
// Output: out/nodes.json, out/edges.csv, out/snapshot.json
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
mkdirSync(OUT, { recursive: true });
const FLT = process.env.FLT_DIR || (existsSync('C:/dev/FLT') ? 'C:/dev/FLT' : join(homedir(), 'FLT'));
const SRC = join(FLT, 'blueprint', 'src');

const commit = execFileSync('git', ['-C', FLT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const commitDate = execFileSync('git', ['-C', FLT, 'log', '-1', '--format=%cI'], { encoding: 'utf8' }).trim();

const content = readFileSync(join(SRC, 'content.tex'), 'utf8');
const chapters = [];
for (const line of content.split(/\r?\n/)) {
  const m = line.match(/^\s*\\input\{([^}]+)\}/);
  if (m) chapters.push(m[1].endsWith('.tex') ? m[1] : m[1] + '.tex');
}

const STMT = ['theorem', 'lemma', 'proposition', 'corollary', 'definition'];
const nodes = [];
const edges = [];
const seen = new Map();
const aliases = new Map();

function stripComments(tex) {
  return tex.split(/\r?\n/).map((l) => l.replace(/(^|[^\\])%.*$/, '$1')).join('\n');
}
function usesOf(body) {
  const out = [];
  for (const m of body.matchAll(/\\uses\{([^}]*)\}/g))
    for (const x of m[1].split(',')) { const t = x.trim(); if (t) out.push(t); }
  return out;
}

for (const ch of chapters) {
  const tex = stripComments(readFileSync(join(SRC, ch), 'utf8'));
  const envRe = new RegExp(String.raw`\\begin\{(${STMT.join('|')}|proof)\}(?:\s*\[[^\]]*\])?([\s\S]*?)\\end\{\1\}`, 'g');
  let last = null;
  for (const m of tex.matchAll(envRe)) {
    const env = m[1], body = m[2];
    if (env === 'proof') {
      if (!last) continue;
      last.proofUses = usesOf(body);
      last.proofLeanok = /\\(leanok|mathlibok)\b/.test(body);
      last.proofNotready = /\\notready\b/.test(body);
      last.hasProof = true;
      last = null;
      continue;
    }
    // One statement in HaarCharacterProject carries two comma-separated
    // names in a single \label{}; the first is the node id, the rest are
    // aliases so \uses of either name resolves.
    const labelParts = (body.match(/\\label\{([^}]+)\}/)?.[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const label = labelParts[0] ?? null;
    for (const alias of labelParts.slice(1)) aliases.set(alias, label);
    const node = {
      id: label,
      type: env,
      chapter: ch.replace(/^chapter\//, '').replace(/\.tex$/, ''),
      lean: [...body.matchAll(/\\lean\{([^}]*)\}/g)].flatMap((x) => x[1].split(',').map((s) => s.trim()).filter(Boolean)),
      stated: /\\(leanok|mathlibok)\b/.test(body),
      mathlibok: /\\mathlibok\b/.test(body),
      notready: /\\notready\b/.test(body),
      stmtUses: usesOf(body),
      proofUses: [],
      proofLeanok: false,
      proofNotready: false,
      hasProof: false,
      title: body.replace(/\\(label|lean|uses|leanok|notready|discussion)\b(\{[^}]*\})?/g, '').replace(/\s+/g, ' ').trim().slice(0, 140),
    };
    last = node;
    if (!label) continue; // unlabelled statements cannot be referenced; not graph nodes
    if (seen.has(label)) { console.warn(`duplicate label ${label} (${ch}, first in ${seen.get(label)})`); continue; }
    seen.set(label, ch);
    nodes.push(node);
  }
}

for (const n of nodes) {
  n.notready = n.notready || n.proofNotready;
  n.proved = n.type === 'definition'
    ? n.stated && (!n.hasProof || n.proofLeanok)
    : n.proofLeanok;
  n.uses = [...new Set([...n.stmtUses, ...n.proofUses].map((d) => aliases.get(d) ?? d))].filter((d) => d !== n.id);
  for (const d of n.uses) edges.push([n.id, d]);
}

const ids = new Set(nodes.map((n) => n.id));
const dangling = edges.filter(([, d]) => !ids.has(d));
const kept = edges.filter(([, d]) => ids.has(d));
if (dangling.length) console.warn(`dangling \\uses targets (${dangling.length}):`, [...new Set(dangling.map((e) => e[1]))].join(', '));

const q = (s) => (/[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
writeFileSync(join(OUT, 'edges.csv'), 'dependent,dependency\n' + kept.map((e) => e.map(q).join(',')).join('\n') + '\n');
writeFileSync(join(OUT, 'nodes.json'), JSON.stringify(nodes, null, 1));

const byType = {};
for (const n of nodes) { byType[n.type] = byType[n.type] || { total: 0, proved: 0, stated: 0, notready: 0 }; const t = byType[n.type]; t.total++; if (n.proved) t.proved++; if (n.stated) t.stated++; if (n.notready) t.notready++; }
const snap = {
  repo: 'https://github.com/ImperialCollegeLondon/FLT', commit, commitDate,
  chapters, nodes: nodes.length, edges: kept.length, danglingEdges: dangling.length,
  proved: nodes.filter((n) => n.proved).length, open: nodes.filter((n) => !n.proved).length,
  notready: nodes.filter((n) => n.notready).length, byType,
};
writeFileSync(join(OUT, 'snapshot.json'), JSON.stringify(snap, null, 1));
console.log(JSON.stringify(snap, null, 1));
