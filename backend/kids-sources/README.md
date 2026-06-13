# VOIDtv KIDS sources

Drop a `.json` file in this folder for each kids-safe IA page you vouch. Each file becomes its
own row on the kids wall. voice:b: only B fills this. No year floor (your vouch is the gate).
Re-read on a 60s TTL, no restart.

## What you can paste (any of these shapes works)

1. Raw IA Advanced Search JSON. Hit a URL like
   `https://archive.org/advancedsearch.php?q=collection:(SOMETHING)&fl[]=identifier&rows=200&output=json`
   and save the whole response. The function reads `response.docs[].identifier`.

2. A simple list of identifiers:
   `{ "name": "PBS BUMPERS", "subtitle": "...", "identifiers": ["id1", "id2", "..."] }`

3. A bare array: `["id1", "id2", "id3"]`

`name`/`subtitle` are optional; without `name` the filename is used as the row title.

## Check before you trust it

`GET http://localhost:3001/api/kids-sources/check` returns, per file: how many ids resolved to
a playable video, the resolved titles (eyeball these for safety), and which ids failed. Use it
to confirm a page is actually kids-safe and playable before it sits in front of a child.

## Files starting with `_` are ignored (use for notes/drafts).
