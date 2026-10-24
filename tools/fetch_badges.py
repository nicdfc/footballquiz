"""Download national team badges from Wikipedia into logos/.

Run by .github/workflows/fetch-badges.yml. For each line in
tools/national-teams.txt it asks Wikipedia for the article's main image,
which for a national team article is the badge, and saves a 300px PNG.
Existing files are kept, so delete one to fetch it again.
"""
import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
UA = "footballquiz-badge-fetcher/1.0 (https://github.com/nicdfc/footballquiz)"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def main():
    (ROOT / "logos").mkdir(exist_ok=True)
    failed = []
    for line in (ROOT / "tools/national-teams.txt").read_text().splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        team_id, title = line.split("|", 1)
        out = ROOT / "logos" / f"{team_id}.png"
        if out.exists():
            continue
        q = urllib.parse.urlencode({
            "action": "query", "format": "json", "redirects": 1,
            "prop": "pageimages", "piprop": "thumbnail|name",
            "pithumbsize": 300, "pilicense": "any", "titles": title,
        })
        page = next(iter(json.loads(get(f"https://en.wikipedia.org/w/api.php?{q}"))["query"]["pages"].values()))
        thumb = page.get("thumbnail", {}).get("source")
        if not thumb:
            failed.append(title)
            continue
        if not thumb.split("?")[0].lower().endswith(".png"):
            print(f"note: {team_id} image is not a PNG: {thumb}")
        out.write_bytes(get(thumb))
        print(f"{team_id}: {page.get('pageimage')}")
        time.sleep(0.5)
    if failed:
        print("no image found for:", ", ".join(failed))
        sys.exit(1)


main()
