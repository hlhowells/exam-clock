"""Build the Alway Progress Tests pages from an Exam Clock links export.

Usage: python3 -I build.py links.csv OUT_DIR
Display names must look like  <Group>_<Day>_<Session>, e.g. Yr7_Mon_1.
"""
import csv
import html
import os
import re
import sys

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)

GROUPS = [
    ("Yr7", "year-7.html", "Year 7 Progress Tests"),
    ("Yr8", "year-8.html", "Year 8 Progress Tests"),
    ("AA", "aa.html", "AA Progress Tests"),
]
DAYS = [("Mon", "Monday"), ("Tues", "Tuesday"), ("Wed", "Wednesday")]
DAY_ALIASES = {"mon": "Mon", "tue": "Tues", "tues": "Tues", "wed": "Wed"}
TITLE = "Alway Progress Tests"

links = {}   # (group, day) -> {session: (url, date, exams)}
for row in csv.DictReader(open(src, encoding="utf-8-sig")):
    m = re.match(r"^(AA|Yr7|Yr8)_([A-Za-z]+)_(\d+)$", row["Display"].strip())
    if not m:
        print("skipped:", row["Display"])
        continue
    group, day, session = m.group(1), DAY_ALIASES.get(m.group(2).lower()), int(m.group(3))
    if not day:
        print("skipped (day):", row["Display"])
        continue
    links.setdefault((group, day), {})[session] = (row["Link"].strip(), row["Date"].strip(), row["Exams"].strip())

max_session = max(s for d in links.values() for s in d)


def exam_summary(exams):
    """'09:25 English; 09:25 Science' -> '09:25 · English, Science'"""
    parts = [p.strip() for p in exams.split(";") if p.strip()]
    times, subjects = [], []
    for p in parts:
        t, _, subj = p.partition(" ")
        if t not in times:
            times.append(t)
        subjects.append(subj)
    return " / ".join(times) + " · " + ", ".join(subjects) if parts else ""


def short_date(d):
    """'Mon, 23 Nov 2026' -> '23 Nov'"""
    m = re.search(r"(\d{1,2} [A-Za-z]{3})", d)
    return m.group(1) if m else ""


def page(title, body, back=True):
    nav = ('<a class="back" href="index.html">&larr; ' + TITLE + "</a>") if back else ""
    return f"""<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<main>
  {nav}
  <h1>{html.escape(title)}</h1>
{body}
</main>
</body>
</html>
"""


# Hub page
cards = "\n".join(
    f'    <a class="card" href="{f}"><span>{html.escape(name)}</span><span class="arrow" aria-hidden="true">&rarr;</span></a>'
    for _, f, name in GROUPS
)
open(os.path.join(out, "index.html"), "w").write(
    page(TITLE, f'  <p class="lead">Choose a year group to open its exam clocks.</p>\n  <nav class="cards">\n{cards}\n  </nav>', back=False)
)

# Year group pages
for group, fname, name in GROUPS:
    cols = []
    for day, day_name in DAYS:
        sessions = links.get((group, day), {})
        any_date = next((v[1] for v in sessions.values()), "")
        head = f'<h2>{day_name}<small>{html.escape(short_date(any_date))}</small></h2>'
        cells = []
        for s in range(1, max_session + 1):
            if s in sessions:
                url, _, exams = sessions[s]
                cells.append(
                    f'<a class="session" href="{html.escape(url, quote=True)}">'
                    f'<b>Session {s}</b><small>{html.escape(exam_summary(exams))}</small></a>'
                )
            else:
                cells.append('<div class="session empty" aria-hidden="true"></div>')
        cols.append('    <section class="day">\n      ' + head + "\n      " + "\n      ".join(cells) + "\n    </section>")
    body = '  <div class="days">\n' + "\n".join(cols) + "\n  </div>"
    open(os.path.join(out, fname), "w").write(page(name, body))
    print(fname, {d: sorted(links.get((group, d), {})) for d, _ in DAYS})
