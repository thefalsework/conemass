#!/usr/bin/env python3
"""Dependency graph of the Jenkins 2.476 WAR (the release OpenRefactory
audited: "Jenkins v2.476 ... had 172 dependencies").

deps.dev's resolution of org.jenkins-ci.main:jenkins-core alone is 89
artifacts; the WAR bundles more. Jenkins publishes the WAR's bundled artifact
set in its license report (jenkins-war-2.476.license.xml: groupId,
artifactId, version, upstream URL). This script takes that set and derives
edges from each artifact's own resolved dependencies on deps.dev, keeping
only edges whose target is in the bundled set. Output: edge list, plus a
JSON map artifact -> upstream URL for matching against audit records.
"""
import concurrent.futures as cf
import json
import re
import sys
import urllib.parse
import urllib.request

LICENSE_XML = "https://repo.jenkins-ci.org/releases/org/jenkins-ci/main/jenkins-war/2.476/jenkins-war-2.476.license.xml"


def get(url):
    try:
        with urllib.request.urlopen(url, timeout=120) as r:
            return r.read().decode("utf-8", "replace")
    except Exception:
        return None


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    xml = get(LICENSE_XML)
    arts = {}
    for m in re.finditer(r"<l:dependency name='([^']*)' groupId='([^']+)' artifactId='([^']+)' version='([^']+)' url='([^']*)'", xml):
        arts[f"{m.group(2)}:{m.group(3)}"] = {"version": m.group(4), "url": m.group(5), "name": m.group(1)}
    print(f"{len(arts)} artifacts bundled in jenkins-war 2.476", file=sys.stderr)

    def deps_of(key):
        ver = arts[key]["version"]
        t = get(f"https://api.deps.dev/v3/systems/maven/packages/{urllib.parse.quote(key, safe='')}/versions/{urllib.parse.quote(ver, safe='')}:dependencies")
        if not t:
            return key, None
        g = json.loads(t)
        names = [n["versionKey"]["name"] for n in g["nodes"]]
        # direct edges only from this artifact; transitive ones come from the
        # other artifacts' own fetches, so the union is the real edge set.
        return key, {names[e["toNode"]] for e in g["edges"] if e["fromNode"] == 0}

    edges, missing = set(), []
    with cf.ThreadPoolExecutor(8) as ex:
        for key, deps in ex.map(deps_of, list(arts)):
            if deps is None:
                missing.append(key)
                continue
            for d in deps:
                if d in arts and d != key:
                    edges.add((key, d))
    path = f"{out_dir}/jenkins-war-edges.csv"
    with open(path, "w", encoding="utf-8") as f:
        f.write("dependent,dependency\n" + "\n".join(f"{a},{b}" for a, b in sorted(edges)) + "\n")
    with open(f"{out_dir}/jenkins-war-artifacts.json", "w", encoding="utf-8") as f:
        json.dump(arts, f, indent=0, sort_keys=True)
    print(f"jenkins-war: {len(arts)} artifacts, {len(edges)} edges -> {path}; deps.dev missing for {len(missing)}: {missing[:10]}")


if __name__ == "__main__":
    main()
