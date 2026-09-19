#!/usr/bin/env node
// Re-fetch the 280 mission graphs, saving raw JSON per mission to out/graphs/,
// then build TWO edge lists from the same data:
//   out/edges-union.csv — parent depends on the UNION of all accepted sketches'
//                         children (optimistic unlock-mass, upper bracket)
//   out/edges-guaranteed.csv — for multi-sketch parents, only children present
//                         in EVERY accepted sketch (guaranteed unlock-mass,
//                         lower bracket). Structural edges kept in both.
// Also writes out/nodes-missions.json (id -> name/status/title, mission corpus
// only) and reports the multi-sketch parent count.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://prove2.me/api/v1';
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const GRAPHS = join(OUT, 'graphs');

const API_KEY = JSON.parse(readFileSync(join(HERE, 'credentials.json'), 'utf8').replace(/^\uFEFF/, '')).api_key;
let accessToken = null, tokenExpiry = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function refreshToken() {
  const r = await fetch(`${BASE}/agent/refresh`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: API_KEY }),
  });
  if (!r.ok) { console.error(`refresh failed: ${r.status}`); process.exit(1); }
  const j = await r.json();
  accessToken = j.access_token;
  tokenExpiry = (j.expires_at ?? Math.floor(Date.now() / 1000) + 3600) * 1000;
}

async function api(path, attempt = 0) {
  if (!accessToken || Date.now() > tokenExpiry - 60_000) await refreshToken();
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if ((r.status === 401 || r.status === 429 || r.status >= 500) && attempt < 5) {
    if (r.status === 401) await refreshToken(); else await sleep(Math.min(30_000, 1000 * 2 ** attempt));
    return api(path, attempt + 1);
  }
  if (!r.ok) throw new Error(`${r.status} on ${path}`);
  return r.json();
}

async function main() {
  mkdirSync(GRAPHS, { recursive: true });
  await refreshToken();

  // mission roots
  const missions = [];
  for (let offset = 0; ; offset += 100) {
    const page = await api(`/missions?limit=100&offset=${offset}`);
    missions.push(...(page.missions ?? []));
    if (missions.length >= (page.total ?? 0) || (page.missions ?? []).length === 0) break;
    await sleep(80);
  }
  const roots = missions.filter((m) => m.main_theorem?.theorem_id);
  console.error(`missions with main theorem: ${roots.length}`);

  // fetch graphs (cache on disk)
  const graphs = [];
  let i = 0;
  for (const m of roots) {
    i++;
    const tid = m.main_theorem.theorem_id;
    const f = join(GRAPHS, `${tid}.json`);
    let g;
    if (existsSync(f)) {
      g = JSON.parse(readFileSync(f, 'utf8'));
    } else {
      try {
        g = await api(`/theorems/${tid}/graph`);
        writeFileSync(f, JSON.stringify(g));
      } catch (e) {
        console.error(`  [${i}/${roots.length}] ${m.name}: ${e.message}`);
        continue;
      }
      await sleep(100);
    }
    graphs.push({ mission: m.name, g });
    if (i % 40 === 0) console.error(`  fetched ${i}/${roots.length}`);
  }

  // ---- build node registry and per-parent sketch children ----
  const reg = new Map(); // id -> {name,status,title}
  const sketchChildren = new Map(); // parentTheoremId -> Map(sketchNodeId -> Set(childId))
  const structural = new Set(); // "dependent\u0001dependency"

  for (const { g } of graphs) {
    const sketchParent = new Map();
    for (const n of g.nodes ?? []) {
      if (n.node_type === 'sketch') {
        sketchParent.set(n.node_id, n.parent_theorem_id);
        if (!sketchChildren.has(n.parent_theorem_id)) sketchChildren.set(n.parent_theorem_id, new Map());
        const m = sketchChildren.get(n.parent_theorem_id);
        if (!m.has(n.node_id)) m.set(n.node_id, new Set());
      } else {
        const id = n.theorem_id ?? n.node_id;
        if (!reg.has(id)) reg.set(id, { name: n.theorem_name ?? id, status: n.status ?? '?', title: n.theorem_title ?? '' });
      }
    }
    for (const e of g.edges ?? []) {
      if (e.kind === 'sketch' && String(e.target).startsWith('sketch-')) {
        const parent = sketchParent.get(e.target);
        if (parent && e.source !== parent) sketchChildren.get(parent)?.get(e.target)?.add(e.source);
      } else if (e.kind === 'structural') {
        if (e.source !== e.target) structural.add(e.target + '\u0001' + e.source);
      }
    }
  }

  // ---- union and guaranteed (intersection) edge sets ----
  const union = new Set(structural);
  const guaranteed = new Set(structural);
  let multiSketch = 0;
  for (const [parent, sketches] of sketchChildren) {
    const sets = [...sketches.values()].filter((s) => s.size > 0);
    if (sets.length === 0) continue;
    if (sets.length > 1) multiSketch++;
    const u = new Set();
    for (const s of sets) for (const c of s) u.add(c);
    let inter = new Set(sets[0]);
    for (const s of sets.slice(1)) inter = new Set([...inter].filter((c) => s.has(c)));
    for (const c of u) union.add(parent + '\u0001' + c);
    for (const c of inter) guaranteed.add(parent + '\u0001' + c);
  }

  console.error(`parents with >=1 sketch: ${sketchChildren.size}; multi-sketch parents: ${multiSketch}`);
  console.error(`union edges: ${union.size}; guaranteed edges: ${guaranteed.size}; structural: ${structural.size}`);

  const nameOf = (id) => reg.get(id)?.name ?? id;
  const emit = (set, file) => {
    const lines = ['dependent,dependency'];
    for (const key of [...set].sort()) {
      const [p, c] = key.split('\u0001');
      lines.push(`${nameOf(p)},${nameOf(c)}`);
    }
    writeFileSync(join(OUT, file), lines.join('\n') + '\n');
  };
  emit(union, 'edges-union.csv');
  emit(guaranteed, 'edges-guaranteed.csv');
  writeFileSync(join(OUT, 'nodes-missions.json'), JSON.stringify([...reg.entries()].map(([id, v]) => ({ id, ...v })), null, 1));
  console.error('wrote edges-union.csv, edges-guaranteed.csv, nodes-missions.json');
}

main().catch((e) => { console.error(e); process.exit(1); });
