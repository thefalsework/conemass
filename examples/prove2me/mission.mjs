#!/usr/bin/env node
// Per-mission unlock ranking against the LIVE Prove2Me API (added 2026-10-10).
//
// Usage:
//   P2M_API_KEY=p2m_... node mission.mjs "<mission name substring>"
//   P2M_API_KEY=p2m_... node mission.mjs --root <main_theorem_id>   # UUID printed by the first form; skips the listing
//
// Falls back to ./credentials.json ({ "api_key": "p2m_..." }, gitignored) if
// the env var is unset. No key is stored in this file.
//
// What it prints: the mission's open theorems ranked by conemass on the
// open-only guaranteed subgraph (edges kept only if both endpoints are Open;
// for multi-sketch parents only children present in every accepted sketch),
// each with the list of open parents waiting on it. Same construction as
// refetch-missions.mjs + unlock-open.mjs, restricted to one mission graph.
// The mass is a priority weight; the waiting-parents list is the exact part.

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://prove2.me/api/v1';
const HERE = dirname(fileURLToPath(import.meta.url));
const CONEMASS = join(HERE, '..', '..', 'conemass.mjs');

function loadApiKey() {
  if (process.env.P2M_API_KEY) return process.env.P2M_API_KEY;
  const p = join(HERE, 'credentials.json');
  if (existsSync(p)) {
    const j = JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
    if (j.api_key) return j.api_key;
  }
  console.error('Set P2M_API_KEY or put { "api_key": "p2m_..." } in credentials.json (see prove2.me/start.md).');
  process.exit(1);
}
const API_KEY = loadApiKey();

const t0 = Date.now();
const lap = (l) => console.error(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${l}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let tok = null;
async function refresh() {
  const r = await fetch(`${BASE}/agent/refresh`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: API_KEY }),
  });
  if (!r.ok) throw new Error(`agent/refresh ${r.status}: ${(await r.text()).slice(0, 200)}`);
  tok = (await r.json()).access_token;
}
async function api(p, attempt = 0) {
  if (!tok) await refresh();
  const r = await fetch(`${BASE}${p}`, { headers: { Authorization: `Bearer ${tok}` } });
  if ((r.status === 401 || r.status === 429 || r.status >= 500) && attempt < 5) {
    if (r.status === 401) await refresh(); else await sleep(Math.min(30_000, 1000 * 2 ** attempt));
    return api(p, attempt + 1);
  }
  if (!r.ok) throw new Error(`${r.status} on ${p}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// ---- pick the mission ----
const args = process.argv.slice(2);
let rootId, missionName;
const ri = args.indexOf('--root');
if (ri >= 0) {
  rootId = args[ri + 1];
  missionName = `(root ${rootId})`;
} else {
  const pick = (args[0] ?? '').toLowerCase();
  if (!pick) { console.error('Give a mission name substring or --root <theorem_id>.'); process.exit(1); }
  await refresh();
  const missions = [];
  for (let off = 0; ; off += 100) {
    const pg = await api(`/missions?limit=100&offset=${off}`);
    missions.push(...(pg.missions ?? []));
    if (!pg.missions?.length || missions.length >= (pg.total ?? 0)) break;
    await sleep(60);
  }
  lap(`missions listed: ${missions.length}`);
  const hits = missions.filter((m) => m.main_theorem?.theorem_id && m.name.toLowerCase().includes(pick));
  if (!hits.length) { console.error(`no mission name contains "${pick}"`); process.exit(1); }
  if (hits.length > 1) console.error(`${hits.length} matches; using the first:\n  ` + hits.map((m) => m.name).join('\n  '));
  rootId = hits[0].main_theorem.theorem_id;
  missionName = hits[0].name;
}

const g = await api(`/theorems/${rootId}/graph`);
lap(`graph fetched: ${g.nodes?.length ?? 0} nodes, ${g.edges?.length ?? 0} edges`);

// ---- registry + guaranteed edge set (as in refetch-missions.mjs) ----
const reg = new Map();           // theorem id -> { name, status, title }
const sketchParent = new Map();  // sketch node id -> parent theorem id
const sk = new Map();            // parent id -> Map(sketch id -> Set(child id))
const structural = new Set();    // "dependent\u0001dependency"
for (const n of g.nodes ?? []) {
  if (n.node_type === 'sketch') {
    sketchParent.set(n.node_id, n.parent_theorem_id);
    if (!sk.has(n.parent_theorem_id)) sk.set(n.parent_theorem_id, new Map());
    sk.get(n.parent_theorem_id).set(n.node_id, new Set());
  } else {
    const id = n.theorem_id ?? n.node_id;
    reg.set(id, { name: n.theorem_name ?? id, status: n.status ?? '?', title: n.theorem_title ?? '' });
  }
}
for (const e of g.edges ?? []) {
  if (e.kind === 'sketch' && String(e.target).startsWith('sketch-')) {
    const p = sketchParent.get(e.target);
    if (p && e.source !== p) sk.get(p)?.get(e.target)?.add(e.source);
  } else if (e.kind === 'structural' && e.source !== e.target) {
    structural.add(e.target + '\u0001' + e.source);
  }
}
const guaranteed = new Set(structural);
for (const [p, sketches] of sk) {
  const sets = [...sketches.values()].filter((s) => s.size);
  if (!sets.length) continue;
  let inter = new Set(sets[0]);
  for (const s of sets.slice(1)) inter = new Set([...inter].filter((c) => s.has(c)));
  for (const c of inter) guaranteed.add(p + '\u0001' + c);
}

const statusCount = {};
for (const v of reg.values()) statusCount[v.status] = (statusCount[v.status] ?? 0) + 1;
const isOpen = (id) => reg.get(id)?.status === 'Open';
const openEdges = [...guaranteed].map((k) => k.split('\u0001')).filter(([a, b]) => isOpen(a) && isOpen(b));
lap(`guaranteed edges ${guaranteed.size}, open-only ${openEdges.length}`);

// ---- conemass on the open-only subgraph ----
const nameOf = (id) => reg.get(id)?.name ?? id;
const q = (s) => (/[",\s]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
function csvRow(line) {
  const out = []; let i = 0;
  while (i <= line.length) {
    let f = '';
    if (line[i] === '"') { i++; while (i < line.length) { if (line[i] === '"' && line[i + 1] === '"') { f += '"'; i += 2; } else if (line[i] === '"') { i++; break; } else f += line[i++]; } }
    else while (i < line.length && line[i] !== ',') f += line[i++];
    out.push(f); if (i >= line.length) break; i++;
  }
  return out;
}
let rows = [];
if (openEdges.length) {
  const tmp = join(tmpdir(), `p2m-mission-${process.pid}.csv`);
  writeFileSync(tmp, 'dependent,dependency\n' + openEdges.map(([a, b]) => `${q(nameOf(a))},${q(nameOf(b))}`).join('\n') + '\n');
  const csv = execFileSync('node', [CONEMASS, tmp, '--cap', '200'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  unlinkSync(tmp);
  rows = csv.trim().split(/\r?\n/).slice(1).map(csvRow).map((f) => ({ name: f[1], mass: +f[2] }));
}
const idOf = new Map([...reg.entries()].map(([id, v]) => [v.name, id]));
const parentsOf = new Map();
for (const [a, b] of openEdges) { if (!parentsOf.has(b)) parentsOf.set(b, []); parentsOf.get(b).push(a); }
const openTotal = [...reg.values()].filter((v) => v.status === 'Open').length;
const ranked = new Set(rows.map((r) => r.name));
for (const [id, v] of reg) if (v.status === 'Open' && !ranked.has(v.name)) rows.push({ name: v.name, mass: 0 });

// ---- output ----
console.log(`mission: ${missionName}`);
console.log(`root: ${nameOf(rootId)}  (theorem_id ${rootId}; reuse with --root to skip the mission listing)`);
console.log(`nodes: ${JSON.stringify(statusCount)}; open-only guaranteed edges: ${openEdges.length}`);
console.log(`open theorems: ${openTotal}  (ranked by open-only guaranteed unlock mass; waiting parents are the exact part)`);
console.log('');
rows.sort((a, b) => b.mass - a.mass || (a.name < b.name ? -1 : 1));
for (const r of rows) {
  const ps = (parentsOf.get(idOf.get(r.name)) ?? []).map(nameOf);
  console.log(`${r.mass.toFixed(3)}  ${r.name}`);
  console.log(`       waiting (${ps.length}): ${ps.join(', ') || 'none (mission root or leaf of the open subgraph)'}`);
}
lap('done');
