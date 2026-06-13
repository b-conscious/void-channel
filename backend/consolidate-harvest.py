# Consolidate link-grabber harvest files (kids-sources/links_*.json) into the network
# time-travel channels in kids-saturday.json. The GOLD in each file is its `source` page
# (the IA broadcast B visited); the scraped links are 95% site chrome and ignored.
# Repeatable: dedupes against existing blocks, archives processed files to _raw/.
import json, glob, re, shutil, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

RULES = [  # first match wins; checked against id + page title, lowercased
    ("FOX KIDS", r"fox kids|fox box|fox-kids|toonsylvania"),
    ("KIDS WB", r"kids'? ?wb|pokemon|pokémon|animaniacs|histeria|static shock|digimon"),
    ("CARTOON NETWORK", r"cartoon network|toonami|powerpuff|cartoon cartoons|cn-summer"),
    ("NICKELODEON", r"nick|ren & stimpy|ren-stimpy|spongebob|sponge bob"),
    ("PBS KIDS", r"barney|pbs"),
    ("DISNEY", r"disney|marsupilami|teamo supremo|jojo'?s circus|one saturday morning"),
    ("ABC", r"\babc\b|cow-?boys of moo mesa"),
    ("CBS", r"\bcbs\b|fat albert"),
    ("NBC", r"\bnbc\b"),
]

def classify(ident, title):
    hay = (ident + " " + title).lower()
    for name, pat in RULES:
        if re.search(pat, hay):
            return name
    return "SATURDAY MORNING"

sat = json.load(open("kids-saturday.json", encoding="utf-8"))
channels = {c["name"]: c for c in sat["channels"]}
have = {b for c in sat["channels"] for b in c["blocks"]}

added, skipped, report = 0, 0, {}
files = sorted(glob.glob("kids-sources/links_*.json"))
for f in files:
    try:
        d = json.load(open(f, encoding="utf-8"))
    except Exception as e:
        print("PARSE FAIL", f, e); continue
    m = re.search(r"/details/([^/?#]+)", d.get("source", ""))
    if not m:
        print("NO SOURCE ID", f); continue
    ident = m.group(1)
    title = re.sub(r"\s*:\s*Free Download.*$", "", d.get("title", "")).strip()
    if ident in have:
        skipped += 1
    else:
        ch = classify(ident, title)
        if ch not in channels:
            channels[ch] = {"name": ch, "blocks": []}
            sat["channels"].append(channels[ch])
        channels[ch]["blocks"].append(ident)
        have.add(ident)
        added += 1
        report.setdefault(ch, []).append((ident, title))
    shutil.move(f, "kids-sources/_raw/" + f.split("\\")[-1].split("/")[-1])

json.dump(sat, open("kids-saturday.json", "w", encoding="utf-8"), indent=2, ensure_ascii=False)
print(f"files={len(files)} added={added} dup-skipped={skipped}")
for ch, rows in report.items():
    print(f"\n== {ch} (+{len(rows)}) ==")
    for i, t in rows:
        print(" ", i[:45].ljust(47), t[:70])
print("\ntotals:", {c["name"]: len(c["blocks"]) for c in sat["channels"]})
