# Exam Clock

A web app for showing exam times on a large touchscreen at the front of an exam hall.

- **Library and editor** (`index.html`): create and save displays on your laptop. Each display has its exams, planned start times, and finish times for normal time, any percentage of extra time, and rest breaks.
- **Create displays from CSV**: build many displays at once from a spreadsheet with one row per exam. There's a downloadable template, and you can preview the result and see any rows it couldn't read before anything is created.
- **Display** (`display.html`): a large 24-hour clock (hh:mm) with each exam's start and finish times. A green **Start all exams** button shows until the exams are started. Touch controls open when you press and hold the lock button: **Start now**, start adjustments, **rest break pause/resume**, **emergency pause** and an event log.

It's plain HTML, CSS and JavaScript, with no server, database or build step. Each display's setup is stored in the part of its link after the `#`, which is never sent to a server.

See **`guide.html`** for the step-by-step guide for staff (it's printable).

## Files

| File | Purpose |
| --- | --- |
| `index.html`, `js/editor.js`, `css/editor.css` | Library and editor |
| `display.html`, `js/display.js`, `css/display.css` | The exam hall screen |
| `js/core.js` | Shared timing, rounding and link logic |
| `js/csv.js` | Reading CSV files into displays |
| `guide.html` | Guide for staff |
| `sw.js` | Offline support (works only on https hosting) |

## Putting it online

The smartboard needs to open the app from a web address. Any static web hosting works. Free options:

### GitHub Pages
1. Create a free GitHub account and a new **public** repository, e.g. `exam-clock`.
2. Upload every file and folder in this directory (**Add file → Upload files**).
3. Go to **Settings → Pages**, set *Source* to **Deploy from a branch**, then choose `main` and `/ (root)`, and save.
4. After a minute your library is at `https://<your-username>.github.io/exam-clock/`.

### Netlify Drop
Drag this whole folder onto <https://app.netlify.com/drop>. You get an address like `https://something.netlify.app`.

### School website / intranet
Ask IT to put the folder on any web server. https is recommended, because offline mode needs it.

**No personal or candidate data is stored by the app.** Displays live in each browser's local storage and in the links you create. The only thing loaded from the internet is the QR code library (from cdnjs) in the editor.

## Publishing an update

After changing any file, increase the version in `sw.js` (`exam-clock-v1` → `exam-clock-v2`) so screens pick up the new version. Screens get the update the second time they load the page.

## Testing locally

From this folder, run:

```bash
python3 -m http.server 8123
```

Then open <http://localhost:8123>. Links made this way only work on that computer.

## How times are calculated

- Extra time finish = start + duration × (1 + extra %), rounded **up** to the next whole minute. For example, 1h 30m + 25% = 1h 53m.
- **Start now** sets the start to the next whole minute, so no candidate loses time.
- Rest breaks (for one finish time) and emergency pauses (for all of them) push the finish later by exactly the time paused. Overlapping pauses are only counted once.
- The clock uses the device's own time, so make sure the smartboard's time is set automatically.
