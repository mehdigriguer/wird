"""Validate theme boundaries for every *-sections.json against pinned sources. No Quran text is copied into the app."""

import csv
import hashlib
import io
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "src/data"
QURAN = json.loads((DATA / "quran.json").read_text())


def get(url):
    return subprocess.run(
        ["curl", "--fail", "--silent", "--show-error", "--location", "--max-time", "30", url],
        check=True, stdout=subprocess.PIPE,
    ).stdout


def qsu_ends(download_url, sha256, surah, verse_count):
    raw = get(download_url)
    if hashlib.sha256(raw).hexdigest() != sha256:
        raise ValueError("QSU source changed; review it before updating the pinned checksum")
    verses = {}
    for row in csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))):
        s, v, w = map(int, row["location"].split(":"))
        if s != surah:
            continue
        words = verses.setdefault(v, [])
        if w != len(words) + 1:
            raise ValueError(f"Missing or duplicate QSU word: {row['location']}")
        words.append(row)
    if sorted(verses) != list(range(1, verse_count + 1)):
        raise ValueError(f"QSU does not cover all {verse_count} verses of surah {surah}")
    # Ambiguous states (including 'both') are not treated as an approved stop.
    ends = [v for v, words in verses.items()
            if words[-1]["unit_ends"] == "yes"
            and (v == verse_count or verses[v + 1][0]["unit_begins"] == "yes")]
    if verses[1][0]["unit_begins"] != "yes":
        raise ValueError(f"QSU does not mark the beginning of surah {surah}")
    return ends


def tafsir_groups(api_base, surah, verse_count):
    groups = []
    verse = 1
    while verse <= verse_count:
        url = api_base + str(verse)
        tafsir = json.loads(get(url))["tafsir"]
        if tafsir["resource_id"] != 169:
            raise ValueError("Unexpected tafsir resource")
        keys = list(tafsir["verses"])
        numbers = sorted(int(key.split(":")[1]) for key in keys)
        if (any(not key.startswith(f"{surah}:") for key in keys)
                or numbers != list(range(verse, numbers[-1] + 1))
                or numbers[-1] > verse_count):
            raise ValueError(f"Unexpected tafsir group at {surah}:{verse}")
        groups.append({"from": verse, "to": numbers[-1], "url": url})
        verse = numbers[-1] + 1
    return groups


def main():
    targets = sorted(DATA.glob("*-sections.json"))
    if not targets:
        raise ValueError("No section files found")
    for target in targets:
        data = json.loads(target.read_text())
        surah = data["surah"]
        verse_count = len(QURAN["chapters"][surah - 1]["verses"])
        ends = qsu_ends(data["sources"]["qsu"]["downloadUrl"], data["sources"]["qsu"]["sha256"], surah, verse_count)
        if data.get("tafsirApiUnreliable"):
            # by_ayah falls back to earlier entries for this surah; boundaries were
            # verified by reading the tafsir entry texts and are kept as provided.
            groups = data["evidence"]["tafsirGroups"]
        else:
            groups = tafsir_groups(data["sources"]["tafsir"]["apiBase"], surah, verse_count)
        tafsir_ends = {group["to"] for group in groups}
        cursor = 1
        for block in data["blocks"]:
            if block["from"] != cursor or block["to"] not in ends:
                raise ValueError(f"Theme is not aligned with QSU: {block}")
            print(f"{data['id']} {block['from']}-{block['to']}")
            cursor = block["to"] + 1
        if cursor != verse_count + 1:
            raise ValueError(f"Themes do not cover all {verse_count} verses of surah {surah}")
        data["retrievedAt"] = datetime.now(timezone.utc).isoformat()
        data["method"] = (
            "Theme ends are retained only when QSU marks a whole-verse stop and restart. "
            "Inside a theme, the planner fills by length and never mixes two themes in one rakaat. "
            "This is a source-backed planning prototype, not a religious certification."
        )
        data["evidence"] = {"qsuWholeVerseEnds": ends, "tafsirGroups": groups}
        target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
