#!/usr/bin/env node
// Crawl the Prove2Me theorem dependency graph and emit a conemass edge list.
//
// Usage:
//   node crawl.mjs --introspect     # dump raw /graph for one mission theorem
//   node crawl.mjs                  # missions pass -> outputs, then orphan pass (resumable)
//   node crawl.mjs --skip-orphans   # missions pass only
//
// Graph semantics (verified against platform v0.10.6 on 2026-09-19):
//   /theorems/:id/graph returns { root_id, nodes[], edges[] } where
//     - nodes are node_type "theorem" (status Open/Proved/Disproved/Definition)
//       or "sketch" (an accepted reduction; carries parent_theorem_id)
//     - edge kind "sketch":   childTheorem -> sketchNode  and  sketchNode -> parentTheorem
//     - edge kind "structural": usedNode -> usingTheorem (definition/lemma usage)
//   Both are dependency -> dependent flows. conemass wants (dependent, dependency)
//   lines, so: sketch parent depends on each of the sketch's incoming children;
//   a structural edge (s -> t) means t depends on s.
//
// OR-semantics caveat: a parent may have several sketches; only one needs to
// complete. We take the union of all sketches' children, so cone mass is an
// UPPER BOUND on true unlock-mass where alternative sketches exist.
//
// State files in out/: theorems-raw.json (cached listing), state.json
// (edges + covered sets, checkpointed), edges.csv + nodes.json (rewritten at
// each checkpoint, safe to consume mid-run).

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://prove2.me/api/v1';
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const INTROSPECT = process.argv.includes('--introspect');
const SKIP_ORPHANS = process.argv.includes('--skip-orphans');
const DELAY_MS = 120;          // missions pass (serial)
const ORPHAN_WORKERS = 5;      // orphan pass concurrency, no extra delay
const CHECKPOINT_EVERY = 500;  // orphan requests between checkpoints

function loadApiKey() {
  const candidates = [
    join(HERE, 'credentials.json'),
    join(homedir(), 'prove2me_workspace', 'credentials.json'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      const j = JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
      if (j.api_key) return j.api_key;
    }
  }
  console.error('No credentials.json with an api_key found.');
  process.exit(1);
}

const API_KEY = loadApiKey();
let accessToken = null;
let tokenExpiry = 0;
let refreshing = null;

async function refreshToken() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const r = await fetch(`${BASE}/agent/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: API_KEY }),
    });
    if (!r.ok) {
      console.error(`agent/refresh failed: ${r.status} ${await r.text()}`);
      process.exit(1);
    }
    const j = await r.json();
    accessToken = j.access_token;
    tokenExpiry = (j.expires_at ?? Math.floor(Date.now() / 1000) + 3600) * 1000;
    refreshing = null;
  })();
  return refreshing;
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function api(path, attempt = 0) {
  if (!accessToken || Date.now() > tokenExpiry - 60_000) await refreshToken();
  let r;
  try {
    r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  } catch (e) {
    if (attempt < 5) { await sleep(Math.min(30_000, 1000 * 2 ** attempt)); return api(path, attempt + 1); }
    throw e;
  }
  if (r.status === 401 && attempt < 2) {
    await refreshToken();
    return api(path, attempt + 1);
  }
  if ((r.status === 429 || r.status >= 500) && attempt < 5) {
    const wait = Math.min(30_000, 1000 * 2 ** attempt);
    await sleep(wait);
    return api(path, attempt + 1);
  }
  if (!r.ok) throw new Error(`${r.status} on ${path}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function pageAll(pathBase, key, limit = 200) {
  const all = [];
  let offset = 0;
  for (;;) {
    const page = await api(`${pathBase}limit=${limit}&offset=${offset}`);
    const rows = page[key] ?? [];
    all.push(...rows);
    offset += rows.length;
    if (rows.length === 0 || offset >= (page.total ?? 0)) break;
    if (offset % 5000 < limit) console.error(`  listed ${offset}/${page.total}`);
    await sleep(60);
  }
  return all;
}

// ---- state ----
const reg = new Map();     // id -> { name, status, title }
const edges = new Set();   // "dependentId\u0001dependencyId"
const covered = new Set(); // theorem ids seen inside any walked tree
const walked = new Set();  // ids whose /graph we already fetched (incl. empty results)

function saveState() {
  writeFileSync(join(OUT, 'state.json'), JSON.stringify({
    edges: [...edges], covered: [...covered], walked: [...walked],
    reg: [...reg.entries()],
  }));
  emitOutputs();
}

function loadState() {
  const p = join(OUT, 'state.json');
  if (!existsSync(p)) return false;
  const s = JSON.parse(readFileSync(p, 'utf8'));
  for (const e of s.edges) edges.add(e);
  for (const c of s.covered) covered.add(c);
  for (const w of s.walked ?? []) walked.add(w);
  for (const [k, v] of s.reg) reg.set(k, v);
  console.error(`resumed state: ${edges.size} edges, ${covered.size} covered, ${walked.size} walked`);
  return true;
}

function emitOutputs() {
  const nameOf = (id) => reg.get(id)?.name ?? id;
  const lines = ['dependent,dependency'];
  for (const key of [...edges].sort()) {
    const [p, c] = key.split('\u0001');
    lines.push(`${csv(nameOf(p))},${csv(nameOf(c))}`);
  }
  writeFileSync(join(OUT, 'edges.csv'), lines.join('\n') + '\n');
  const nodesOut = [...reg.entries()].map(([id, v]) => ({ id, ...v }));
  writeFileSync(join(OUT, 'nodes.json'), JSON.stringify(nodesOut, null, 1));
}

function ingestGraph(g) {
  let added = 0;
  const sketchParent = new Map();
  for (const n of g.nodes ?? []) {
    if (n.node_type === 'sketch') {
      sketchParent.set(n.node_id, n.parent_theorem_id);
    } else {
      const id = n.theorem_id ?? n.node_id;
      covered.add(id);
      if (!reg.has(id)) reg.set(id, { name: n.theorem_name ?? id, status: n.status ?? '?', title: n.theorem_title ?? '' });
    }
  }
  const addEdge = (dependent, dependency) => {
    if (!dependent || !dependency || dependent === dependency) return;
    const k = dependent + '\u0001' + dependency;
    if (!edges.has(k)) { edges.add(k); added++; }
  };
  for (const e of g.edges ?? []) {
    if (e.kind === 'sketch') {
      if (String(e.target).startsWith('sketch-')) {
        addEdge(sketchParent.get(e.target), e.source);
      }
    } else if (e.kind === 'structural') {
      addEdge(e.target, e.source);
    }
  }
  return added;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  await refreshToken();

  if (INTROSPECT) {
    const missions = await api('/missions?limit=5&offset=0');
    const m = (missions.missions ?? []).find((x) => x.main_theorem?.theorem_id);
    const tid = m.main_theorem.theorem_id;
    const j = await api(`/theorems/${tid}/graph`);
    writeFileSync(join(OUT, 'introspect-graph.json'), JSON.stringify(j, null, 2));
    console.error(`wrote out/introspect-graph.json for mission "${m.name}"`);
    return;
  }

  const resumed = loadState();

  // ---- 1. All theorems (cached listing) ----
  const cachePath = join(OUT, 'theorems-raw.json');
  let theorems;
  if (existsSync(cachePath) && Date.now() - statSync(cachePath).mtimeMs < 24 * 3600 * 1000) {
    theorems = JSON.parse(readFileSync(cachePath, 'utf8'));
    console.error(`theorem listing from cache: ${theorems.length}`);
  } else {
    console.error('Listing all theorems...');
    theorems = await pageAll('/theorems?sort=newest&', 'theorems', 200);
    writeFileSync(cachePath, JSON.stringify(theorems));
    console.error(`total theorems: ${theorems.length}`);
  }
  for (const t of theorems) {
    if (!reg.has(t.theorem_id)) reg.set(t.theorem_id, { name: t.theorem_name, status: t.status, title: t.theorem_title ?? '' });
  }

  // ---- 2. Missions pass (serial, polite) ----
  if (!resumed) {
    console.error('Listing missions...');
    const missions = await pageAll('/missions?', 'missions', 100);
    const roots = missions.filter((m) => m.main_theorem?.theorem_id);
    console.error(`missions with main theorem: ${roots.length}`);
    let i = 0;
    for (const m of roots) {
      i++;
      const tid = m.main_theorem.theorem_id;
      try {
        const g = await api(`/theorems/${tid}/graph`);
        walked.add(tid);
        const added = ingestGraph(g);
        console.error(`  [${i}/${roots.length}] ${m.name}: +${added} edges (total ${edges.size})`);
      } catch (e) {
        console.error(`  [${i}/${roots.length}] ${m.name}: ${e.message}`);
      }
      await sleep(DELAY_MS);
    }
    saveState();
    console.error(`missions pass complete: ${edges.size} edges, ${covered.size} covered. Outputs written.`);
  }

  if (SKIP_ORPHANS) { console.error('skipping orphan pass (--skip-orphans)'); return; }

  // ---- 3. Orphan pass (concurrent, checkpointed, resumable) ----
  const queue = theorems.map((t) => t.theorem_id).filter((id) => !covered.has(id) && !walked.has(id));
  console.error(`orphan pass: ${queue.length} theorems to walk (${ORPHAN_WORKERS} workers)`);
  let done = 0, found = 0, qi = 0;
  async function worker() {
    for (;;) {
      const id = queue[qi++];
      if (!id) return;
      if (covered.has(id) || walked.has(id)) { done++; continue; }
      try {
        const g = await api(`/theorems/${id}/graph`);
        walked.add(id);
        const added = ingestGraph(g);
        if (added > 0) found += added;
      } catch (e) {
        walked.add(id);
      }
      done++;
      if (done % CHECKPOINT_EVERY === 0) {
        saveState();
        console.error(`  orphans: ${done}/${queue.length} walked, +${found} edges this pass (total ${edges.size})`);
      }
    }
  }
  await Promise.all(Array.from({ length: ORPHAN_WORKERS }, worker));
  saveState();
  console.error(`orphan pass complete: ${edges.size} edges total, ${reg.size} nodes.`);
}

function csv(s) {
  return /[",\s]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

main().catch((e) => { console.error(e); process.exit(1); });
