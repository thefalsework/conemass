"""Build the PyPI population graph for OpenRefactory's Alpha-Omega scans.

Input: ../openrefactory-all-projects.csv (the public results sheet).
For every distinct GitHub repository with Language == Python:

  1. map repo -> PyPI package(s) via deps.dev projects:packageversions.
     Many repos are claimed by typosquats with unverified metadata, so a
     candidate is kept if (a) it carries a PyPI publish attestation, or
     (b) its normalized name equals the repo name (with python-/py
     prefix variants), or (c) neither applies to any candidate and it is
     the candidate with the most dependents (>= 1) on deps.dev;
  2. pick one version per package: the audited version if it is on
     PyPI, else the latest version published on or before the latest
     audit date for that repo;
  3. fetch deps.dev's resolved dependency graph for that version and
     union the edges (names only; versions collapse as in conemass).

Outputs (this directory):
  repo-packages.csv   repo, package, version, published_at, audit_date, how
  pypi-edges.csv      dependent,dependency  (union of resolved graphs)
  unmapped.csv        repos with no acceptable PyPI package
Every HTTP response is cached under cache/ (gitignored), so reruns are
offline. Pass --limit N to prototype on the first N repos.
"""
import csv, json, os, re, sys, time, hashlib, collections, urllib.request, urllib.parse, urllib.error
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
os.makedirs(CACHE, exist_ok=True)
API = "https://api.deps.dev"
LIMIT = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else 0


def get(path):
    """GET API+path with on-disk cache; returns parsed JSON or None on 404."""
    key = hashlib.sha1(path.encode()).hexdigest()
    fn = os.path.join(CACHE, key + ".json")
    if os.path.exists(fn):
        with open(fn, encoding="utf-8") as f:
            return json.load(f)
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(API + path, headers={"User-Agent": "conemass-alpha-omega"}), timeout=60) as r:
                data = json.loads(r.read().decode("utf-8"))
            break
        except urllib.error.HTTPError as e:
            if e.code in (400, 404):  # 400: deps.dev rejects some repo names outright
                data = None
                break
            if e.code in (429, 500, 502, 503, 504) and attempt < 5:
                time.sleep(2 ** attempt)
                continue
            raise
        except (urllib.error.URLError, TimeoutError):
            if attempt < 5:
                time.sleep(2 ** attempt)
                continue
            raise
    with open(fn, "w", encoding="utf-8") as f:
        json.dump(data, f)
    return data


def norm(s):
    return re.sub(r"[-_.]+", "-", s.strip().lower())


def name_variants(repo_name):
    n = norm(repo_name)
    v = {n}
    for pre in ("python-", "py-", "py", "pypi-"):
        if n.startswith(pre) and len(n) > len(pre):
            v.add(n[len(pre):])
    v.add("python-" + n)
    v.add("py" + n)
    if n.endswith("-python"):
        v.add(n[: -len("-python")])
    if n.endswith(".py") or n.endswith("-py"):
        v.add(n[:-3])
    return v


# ---- 1. audit rows -> repos ----
rows = list(csv.DictReader(open(os.path.join(HERE, "..", "openrefactory-all-projects.csv"), encoding="utf-8", errors="replace")))
repos = collections.OrderedDict()
for r in rows:
    if r["Language"] != "Python" or r["Repository Host"] != "github.com":
        continue
    key = (r["Organization"].strip(), r["Project Name (Alphabetical Order)"].strip())
    if not key[0] or not key[1]:
        continue
    repos.setdefault(key, []).append(r)
keys = list(repos)
if LIMIT:
    keys = keys[:LIMIT]
print(f"{len(keys)} python repos", file=sys.stderr)


def latest_audit(rs):
    return max(r["Audit End Date"] or r["Audit Start Date"] for r in rs)


# ---- 2. repo -> packages ----
def map_repo(key):
    org, name = key
    pid = urllib.parse.quote(f"github.com/{org}/{name}", safe="")
    j = get(f"/v3alpha/projects/{pid}:packageversions")
    if not j:
        return key, [], "no-project"
    cands = {}
    for v in j.get("versions", []):
        vk = v["versionKey"]
        if vk["system"] != "PYPI":
            continue
        c = cands.setdefault(vk["name"], {"attested": False})
        if v.get("relationProvenance") == "PYPI_PUBLISH_ATTESTATION":
            c["attested"] = True
    if not cands:
        return key, [], "no-pypi-candidates"
    chosen = [(n, "attested") for n, c in cands.items() if c["attested"]]
    variants = name_variants(name)
    for n in cands:
        if norm(n) in variants and all(n != x for x, _ in chosen):
            chosen.append((n, "name-match"))
    if not chosen:
        # most-depended-on candidate, if anything depends on it at all
        best, bestc = None, 0
        for n in cands:
            pk = get(f"/v3/systems/pypi/packages/{urllib.parse.quote(n, safe='')}")
            if not pk:
                continue
            dv = next((v for v in pk["versions"] if v.get("isDefault")), None)
            if not dv:
                continue
            d = get(f"/v3alpha/systems/pypi/packages/{urllib.parse.quote(n, safe='')}/versions/{urllib.parse.quote(dv['versionKey']['version'], safe='')}:dependents")
            cnt = int((d or {}).get("dependentCount", 0))
            if cnt > bestc:
                best, bestc = n, cnt
        if best:
            chosen = [(best, f"most-dependents:{bestc}")]
    if not chosen:
        return key, [], "no-acceptable-candidate"
    return key, chosen, ""


# ---- 3. version per package, 4. dependency graph ----
def fetch_pkg(args):
    key, pkg, how = args
    rs = repos[key]
    audit = latest_audit(rs)
    audited_versions = {r["Version"].strip().lstrip("v") for r in rs if r["Version"].strip()}
    pk = get(f"/v3/systems/pypi/packages/{urllib.parse.quote(pkg, safe='')}")
    if not pk:
        return key, pkg, None, "", audit, how, []
    versions = pk.get("versions", [])
    pick = next((v for v in versions if v["versionKey"]["version"] in audited_versions), None)
    if not pick:
        dated = [v for v in versions if v.get("publishedAt", "") and v["publishedAt"][:10] <= audit]
        pick = max(dated, key=lambda v: v["publishedAt"]) if dated else None
    if not pick:
        return key, pkg, None, "", audit, how, []
    ver = pick["versionKey"]["version"]
    dj = get(f"/v3/systems/pypi/packages/{urllib.parse.quote(pkg, safe='')}/versions/{urllib.parse.quote(ver, safe='')}:dependencies")
    edges = []
    if dj:
        nodes = [n["versionKey"]["name"] for n in dj.get("nodes", [])]
        for e in dj.get("edges", []):
            edges.append((nodes[e["fromNode"]], nodes[e["toNode"]]))
    return key, pkg, ver, pick.get("publishedAt", "")[:10], audit, how, edges


def safe(fn, fallback):
    def run(x):
        try:
            return fn(x)
        except Exception as e:  # one bad repo must not end the run
            print(f"error on {x}: {e}", file=sys.stderr)
            return fallback(x, e)
    return run


with ThreadPoolExecutor(max_workers=12) as ex:
    mapped = list(ex.map(safe(map_repo, lambda k, e: (k, [], f"error:{type(e).__name__}")), keys))
jobs = [(key, pkg, how) for key, chosen, _ in mapped for pkg, how in chosen]
print(f"{sum(1 for _, c, _ in mapped if c)} repos mapped to {len(jobs)} packages", file=sys.stderr)
with ThreadPoolExecutor(max_workers=12) as ex:
    fetched = list(ex.map(safe(fetch_pkg, lambda j, e: (j[0], j[1], None, "", latest_audit(repos[j[0]]), j[2], [])), jobs))

# ---- outputs ----
with open(os.path.join(HERE, "unmapped.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["repo", "reason"])
    for key, chosen, reason in mapped:
        if not chosen:
            w.writerow([f"{key[0]}/{key[1]}", reason])
with open(os.path.join(HERE, "repo-packages.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["repo", "package", "version", "published_at", "audit_date", "how"])
    for key, pkg, ver, pub, audit, how, _ in fetched:
        w.writerow([f"{key[0]}/{key[1]}", pkg, ver or "", pub, audit, how if ver else "no-version"])
edges = set()
for *_, es in fetched:
    for a, b in es:
        if a != b:
            edges.add((norm(a), norm(b)))
with open(os.path.join(HERE, "pypi-edges.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["dependent", "dependency"])
    for a, b in sorted(edges):
        w.writerow([a, b])
nodes = {a for a, _ in edges} | {b for _, b in edges}
print(f"{sum(1 for x in fetched if x[2])} packages with a version, {len(edges)} edges, {len(nodes)} nodes", file=sys.stderr)
