"""Pull one OpenAlex topic as a citation graph.

  python fetch.py [--topic T10320] [--snapshot 2012] [--end 2020]

Writes nodes.csv.gz (id, year, type, title, cited_by_count,
cites_after_snapshot = OpenAlex citations in years snapshot+1..end) and
edges.csv.gz (citing,cited; both in the slice). References to works
outside the slice are dropped: the graph is the topic's internal
citation structure. Raw pages are cached under cache/ (gitignored).
"""
import csv, gzip, json, os, sys, time, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
os.makedirs(CACHE, exist_ok=True)
arg = lambda k, d: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
TOPIC = arg("--topic", "T10320")
SNAP = int(arg("--snapshot", 2012))
END = int(arg("--end", 2020))
MAILTO = "chris@thefalsework.org"
API_KEY = os.environ.get("OPENALEX_API_KEY", "")
SELECT = "id,display_name,publication_year,type,cited_by_count,counts_by_year,referenced_works"
PER_PAGE = 100
# OpenAlex (since 2026) needs a free account key for cursor paging and
# gives a keyless budget of about 1,000 list calls a day. Page-number
# paging works without a key up to 10,000 results per filter, so the
# pull is split by publication year and cached per year; a run that
# hits the budget stops cleanly and resumes next day.


def page(year, pageno):
    q = {"filter": f"primary_topic.id:{TOPIC},publication_year:{year},has_references:true",
         "per_page": str(PER_PAGE), "page": str(pageno), "select": SELECT, "mailto": MAILTO}
    if API_KEY:
        q["api_key"] = API_KEY
    url = "https://api.openalex.org/works?" + urllib.parse.urlencode(q)
    for attempt in range(6):
        try:
            with urllib.request.urlopen(url, timeout=90) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 5:
                time.sleep(5 * 2 ** attempt)
                continue
            raise
        except Exception:
            if attempt == 5:
                raise
            time.sleep(2 ** attempt)


def fetch_year(year):
    fn = os.path.join(CACHE, f"{TOPIC}-{year}.jsonl.gz")
    if os.path.exists(fn):
        with gzip.open(fn, "rt", encoding="utf-8") as f:
            return [json.loads(l) for l in f]
    out, pageno = [], 1
    while True:
        j = page(year, pageno)
        out.extend(j["results"])
        if len(j["results"]) < PER_PAGE or pageno * PER_PAGE >= min(j["meta"]["count"], 10000):
            if j["meta"]["count"] > 10000:
                print(f"  {year}: {j['meta']['count']} works, only the first 10,000 reachable without cursor paging", file=sys.stderr)
            break
        pageno += 1
    with gzip.open(fn, "wt", encoding="utf-8") as f:
        for w in out:
            f.write(json.dumps(w) + "\n")
    print(f"  {year}: {len(out)} works", file=sys.stderr)
    return out


works = []
for y in range(1940, END + 1):
    works += fetch_year(y)
ids = {w["id"] for w in works}
print(f"{len(works)} works in {TOPIC} through {END}", file=sys.stderr)

with gzip.open(os.path.join(HERE, "nodes.csv.gz"), "wt", newline="", encoding="utf-8") as f:
    w_ = csv.writer(f)
    w_.writerow(["id", "year", "type", "title", "cited_by_count", f"cites_{SNAP + 1}_{END}"])
    for w in works:
        after = sum(c["cited_by_count"] for c in w.get("counts_by_year", []) if SNAP < c["year"] <= END)
        w_.writerow([w["id"].rsplit("/", 1)[-1], w["publication_year"], w.get("type", ""),
                     (w.get("display_name") or "").replace("\n", " ")[:200], w["cited_by_count"], after])
n_edges = 0
with gzip.open(os.path.join(HERE, "edges.csv.gz"), "wt", newline="", encoding="utf-8") as f:
    w_ = csv.writer(f)
    w_.writerow(["citing", "cited"])
    for w in works:
        a = w["id"].rsplit("/", 1)[-1]
        for r in w.get("referenced_works", []):
            if r in ids and r != w["id"]:
                w_.writerow([a, r.rsplit("/", 1)[-1]])
                n_edges += 1
print(f"{n_edges} in-slice citation edges", file=sys.stderr)
