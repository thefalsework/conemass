#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Fetch public endorse/flag counts for every registered concept page from
// the Lax community review service (ORCID-backed endorsements; see
// lax-archive/lax-website, services/reactions). Read-only, unauthenticated,
// one GET per concept, paced to stay well under the service's rate limit.
//
//   node endorsements.mjs [--delay MS]
//
// Reads out/nodes.json; writes out/endorsements.json
//   { fetchedAt, concepts: { "<concept id>": { endorse, flag } }, errors: [...] }

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i === -1 ? dflt : args[i + 1]; };
const DELAY = +flag("--delay", 250);
const SERVICE = "https://comments.laxarchive.org/reactions/v1/page?public=1&url=";

const { concepts, submissions } = JSON.parse(readFileSync("out/nodes.json", "utf8"));
const out = existsSync("out/endorsements.json") ? JSON.parse(readFileSync("out/endorsements.json", "utf8")) : { concepts: {}, submissions: {}, errors: [] };
out.concepts ??= {}; out.submissions ??= {}; out.errors = [];

// canonical page URLs per the review service: /lax-N/ for a submission, /LaxN/LaxN.Concept.html for a concept
const pageUrl = (id) => (id.startsWith("lax-") ? `https://laxarchive.org/${id}/` : `https://laxarchive.org/${id.split(".")[0]}/${id}.html`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = [...Object.keys(submissions).map((id) => ({ id, store: out.submissions })), ...concepts.map((c) => ({ id: c.id, store: out.concepts }))];
let done = 0;
for (const { id, store } of targets) {
  if (store[id]) { done++; continue; }
  const c = { id };
  const url = SERVICE + encodeURIComponent(pageUrl(c.id));
  let attempt = 0;
  for (;;) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) { out.errors.push({ id: c.id, status: res.status }); break; }
      const j = await res.json();
      store[c.id] = { endorse: j.counts?.endorse ?? 0, flag: j.counts?.flag ?? 0, flags: (j.flags ?? []).length };
      break;
    } catch (e) {
      if (++attempt > 5) { out.errors.push({ id: c.id, error: String(e) }); break; }
      await sleep(2000 * attempt);
    }
  }
  done++;
  if (done % 100 === 0) { console.error(`${done}/${targets.length}`); writeFileSync("out/endorsements.json", JSON.stringify(out, null, 1)); }
  await sleep(DELAY);
}
out.fetchedAt = new Date().toISOString();
writeFileSync("out/endorsements.json", JSON.stringify(out, null, 1));
const tally = (m) => { const v = Object.values(m); return `${v.length} pages, ${v.filter((x) => x.endorse > 0).length} with >=1 endorsement, ${v.filter((x) => x.flag > 0).length} with >=1 flag`; };
console.error(`submissions: ${tally(out.submissions)}; concepts: ${tally(out.concepts)}; ${out.errors.length} errors`);
