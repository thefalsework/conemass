#!/usr/bin/env python3
"""Module-level dependency graph of Kubernetes v1.31.0 (2024-08-13).

deps.dev has no resolved graph for k8s.io/kubernetes (replace directives and
vendoring), so build it from the release itself: vendor/modules.txt lists the
resolved module set; each module's go.mod (from proxy.golang.org, or from the
kubernetes tree for the staging modules replaced with ./staging/src/...) gives
its requires. Edges are kept only between modules in the resolved set, so the
graph is the one the release actually built with. Output: edge list.
"""
import concurrent.futures as cf
import re
import sys
import urllib.parse
import urllib.request

TAG = "v1.31.0"
RAW = f"https://raw.githubusercontent.com/kubernetes/kubernetes/{TAG}/"


def get(url):
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            return r.read().decode("utf-8", "replace")
    except Exception as e:
        return None


def escape(mod):  # Go module proxy case-encoding: upper-case letters -> !lower
    return re.sub(r"[A-Z]", lambda m: "!" + m.group(0).lower(), mod)


def requires(gomod):
    out = []
    block = False
    for line in gomod.splitlines():
        s = line.split("//")[0].strip()
        if s.startswith("require ("):
            block = True
            continue
        if block and s == ")":
            block = False
            continue
        m = re.match(r"(?:require\s+)?(\S+)\s+v\S+", s) if (block or s.startswith("require ")) else None
        if m:
            out.append(m.group(1))
    return out


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    mods = {}  # module -> (version, replacement or None)
    for line in get(RAW + "vendor/modules.txt").splitlines():
        if not line.startswith("# "):
            continue
        parts = line[2:].split()
        if len(parts) >= 2 and parts[1].startswith("v"):
            repl = parts[3] if len(parts) >= 4 and parts[2] == "=>" else None
            mods[parts[0]] = (parts[1], repl)
        elif len(parts) >= 3 and parts[1] == "=>":  # "# k8s.io/api => ./staging/src/k8s.io/api"
            mods[parts[0]] = (None, parts[2])
    mods["k8s.io/kubernetes"] = (TAG, ".")
    print(f"{len(mods)} modules in the resolved set", file=sys.stderr)

    def gomod_for(mod):
        ver, repl = mods[mod]
        if repl and repl.startswith("."):
            return mod, get(RAW + ("go.mod" if repl == "." else repl.lstrip("./") + "/go.mod"))
        if repl and not repl.startswith("."):  # replaced by another module
            return mod, None
        return mod, get(f"https://proxy.golang.org/{escape(mod)}/@v/{ver}.mod")

    edges, missing = set(), []
    with cf.ThreadPoolExecutor(16) as ex:
        for mod, text in ex.map(gomod_for, list(mods)):
            if text is None:
                missing.append(mod)
                continue
            for dep in requires(text):
                if dep in mods and dep != mod:
                    edges.add((mod, dep))
    path = f"{out_dir}/kubernetes-edges.csv"
    with open(path, "w", encoding="utf-8") as f:
        f.write("dependent,dependency\n" + "\n".join(f"{a},{b}" for a, b in sorted(edges)) + "\n")
    print(f"kubernetes: {len(mods)} modules, {len(edges)} edges -> {path}; go.mod unavailable for {len(missing)}: {missing[:8]}")


if __name__ == "__main__":
    main()
