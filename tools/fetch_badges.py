"""Download national team badges from Wikipedia into logos/.

Run by .github/workflows/fetch-badges.yml. For each line in
tools/national-teams.txt it reads the "Badge" field of the article's
infobox (falling back to the article's main image) and saves a 300px PNG.
Existing files are kept, so delete one to fetch it again.
"""
import json
import re
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


def api(**params):
    params.update(action="query", format="json", redirects=1)
    return json.loads(get("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params)))


def badge_thumb(title):
    pages = api(prop="revisions", rvprop="content", rvslots="main", titles=title)["query"]["pages"]
    text = next(iter(pages.values()))["revisions"][0]["slots"]["main"]["*"]
    m = re.search(r"^\s*\|\s*Badge\s*=\s*(?:\[\[)?(?:File:|Image:)?([^|\]\n<]+)", text, re.M | re.I)
    if not m or not m.group(1).strip():
        return None
    pages = api(prop="imageinfo", iiprop="url", iiurlwidth=300, titles="File:" + m.group(1).strip())["query"]["pages"]
    info = next(iter(pages.values())).get("imageinfo")
    return info[0].get("thumburl") if info else None


def page_image_thumb(title):
    pages = api(prop="pageimages", piprop="thumbnail", pithumbsize=300, pilicense="any", titles=title)["query"]["pages"]
    return next(iter(pages.values())).get("thumbnail", {}).get("source")


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
        thumb = badge_thumb(title) or page_image_thumb(title)
        if not thumb:
            failed.append(title)
            continue
        out.write_bytes(get(thumb))
        print(f"{team_id}: {thumb}")
        time.sleep(0.5)
    if failed:
        print("no image found for:", ", ".join(failed))
        sys.exit(1)


main()
