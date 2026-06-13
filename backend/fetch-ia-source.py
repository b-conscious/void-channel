# B's source generator: turn an IA query into a ready inbox JSON.
#   python fetch-ia-source.py "collection:kidvid"
#   python fetch-ia-source.py "title:(macgyver)" macgyver
#   python fetch-ia-source.py "creator:(PBS Kids)" pbs 300
# Writes kids-sources/ia_<name>.json in the {identifiers:[...]} format the inbox accepts.
# The file is INERT until worked (inbox never auto-serves) — check titles, then consolidate.
import io, json, re, sys, urllib.parse, urllib.request
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")  # Windows console safety

q = sys.argv[1] if len(sys.argv) > 1 else None
if not q:
    print(__doc__ or "usage: python fetch-ia-source.py <query> [name] [rows]"); sys.exit(1)
name = sys.argv[2] if len(sys.argv) > 2 else re.sub(r"[^a-z0-9]+", "-", q.lower())[:40].strip("-")
rows = int(sys.argv[3]) if len(sys.argv) > 3 else 200

url = ("https://archive.org/advancedsearch.php?q=" + urllib.parse.quote(f"({q}) AND mediatype:(movies)")
       + "&fl[]=identifier&fl[]=title&rows=" + str(rows) + "&output=json")
req = urllib.request.Request(url, headers={"User-Agent": "VoidChannel/0.3 source-gen"})
d = json.load(urllib.request.urlopen(req, timeout=30))
docs = d.get("response", {}).get("docs", [])
out = {
    "_query": q,
    "_titles": {doc["identifier"]: str(doc.get("title", ""))[:80] for doc in docs[:500]},
    "identifiers": [doc["identifier"] for doc in docs],
}
path = f"kids-sources/ia_{name}.json"
json.dump(out, open(path, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print(f"{path}: {len(out['identifiers'])} identifiers (inert until worked)")
for ident, t in list(out["_titles"].items())[:10]:
    print("  ", ident[:40].ljust(42), t[:60])
