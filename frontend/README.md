# GunWaree frontend

Plain HTML, CSS and JavaScript. No build step.

## Run it

The site talks to the team's backend on Railway (`https://gunwaree-production.up.railway.app`, set in `js/api.js`).
That backend allows requests only from `http://127.0.0.1:5500` and `http://localhost:5500` (CORS), so:

1. Serve this folder on **port 5500** with VS Code Live Server (right-click `index.html`, *Open with Live Server*).
   Opening the files by double-clicking them will not reach the backend.
2. Open `http://127.0.0.1:5500/index.html` and press Enter.

A public copy of the site (for example on Vercel) needs its exact origin added to `allow_origins` in
`backend/main.py`, and it must be served over HTTPS.

### Using a backend on this machine instead

1. Change `GW.BASE_URL` in `js/api.js` to `'http://127.0.0.1:8000'`.
2. Start the backend (from the repo root, see the main README):

   ```bash
   cd backend
   uvicorn main:app --reload
   ```

   On Windows, set UTF-8 first or the server crashes when it prints Thai text:

   ```powershell
   $env:PYTHONUTF8 = "1"
   ```


The header on Home says **Live data** when the backend answers. If it cannot reach the backend,
Home shows the snapshots in `sample/` and says **Sample data**; it retries every 15 seconds and
switches to live data on its own once the backend is up.

## Where things live

| File | What it does |
| --- | --- |
| `index.html`, `js/intro.js`, `css/intro.css` | Intro: rain on glass over a blue sky, glass title, Enter warp |
| `home.html`, `js/home.js`, `css/app.css` | Home tab: flood overview from the backend |
| `js/api.js` | `BASE_URL` (change it here when the backend is deployed), requests, session |
| `js/lang.js` | Thai / English switch and all page text |
| `js/near.js` | "Conditions near you" dialog on Home (location stays in the browser) |
| `reports.html`, `js/reports.js` | Rescue reports: send a report (with an optional map pin) and follow its status |
| `dams.html`, `js/dams.js` | Levels > Dam levels: map, selected dam, watchlist |
| `water.html`, `js/water.js` | Levels > Water levels: river and canal gauges and road flood points on a map, with a list |
| `risk.html`, `js/risk.js` | Risk prediction: the level from rule B2 for Ayutthaya, a 3D model of the river, how the rule decides, past floods |
| `admin.html`, `admin-alerts.html`, `admin-reports.html`, `admin-hardware.html`, `js/admin/*.js`, `css/admin.css` | Admin pages: Dashboard, Alert queue, Rescue reports, Hardware control |
| `js/maps.js` | The real maps (OpenFreeMap, drawn with MapLibre GL 4.7.1 from cdnjs) |
| `js/notice.js` | The "some readings may be missing" note, shown on every visit until it is turned off |
| `js/shell.js` | Shared by the app pages: collapsible sidebar, account menu, Levels menu, alert bell (`GET /alerts`), page-change ripple, formatting |
| `js/sky.js` | Blue-sky video and falling rain behind the app pages |
| `sample/*.json` | Offline snapshots of the public endpoints |

The sidebar, top bar and tab bar of `home.html`, `risk.html`, `reports.html`, `dams.html` and `water.html` are the same
markup on every page. Change them in all five (and the top bar on the four admin pages).

## Sidebar and page changes

The sidebar collapses to icons with the button at its top and expands again; the choice is remembered on this
device (`localStorage` `gw_sidebar`). Collapsed, the items show tooltips and Levels opens as a flyout. On small
screens the sidebar becomes the bottom tab bar, and Levels opens a sheet with Dam levels and Water levels.

Moving between pages uses the browser's View Transitions (Chrome and Edge 126 or later, Safari 18.2 or later; other
browsers just load the page): the sky, sidebar and top bar stay put, the highlight glides to the new item, the old
page sinks back and the new one is revealed as a ripple from the item that was clicked. Rescue reports opts out and
appears at once. Clicking the page you are already on never reloads it. The maps are built only after the
transition has finished, so it does not stutter. Everything animated is switched off with "reduce motion".

## Endpoints used on Home

`GET /risk` (5 min), `GET /districts/latest`, `GET /stations/latest?kind=river|canal|rain` (60 s),
`GET /dams/latest` (30 min), `GET /alerts` (30 s, public).
The "Conditions near you" dialog adds `GET /stations/latest?kind=road` (when opened, at most once a minute)
and reuses everything else the page has already loaded, so it never calls `/risk` again.

## Rescue reports

`reports.html#new` sends `POST /incidents` (description required, address or map pin required, phone optional;
`lat` and `lon` go together as numbers). `reports.html#mine` shows `GET /incidents/mine`, polled every 30 s.
Both need a member (client) account: guests see Log in / Sign up, admins see that admin accounts cannot report.
Logging in from this page, or being sent to log in by an expired token, comes back to the same view
(`login.html?next=reports.html#mine`; only page names of this site are accepted as `next`).
Statuses show as Received (`new`), In progress (`in_progress`) and Completed (`resolved`); report numbers
show as `GW-0001` from the backend `id`. Without internet the map hides and the address field still works.
The list is polled every 30 s but only redrawn when a report actually changes.

## Dam levels

`dams.html` uses `GET /dams/latest` (on load, then every 30 min; sample fallback `sample/dams.json`). Status is the
ThaiWater storage scale worked out from `pct`: up to 30% critically low, 30 to 50% low, 50 to 80% moderate,
80 to 100% high, over 100% over capacity. The Chao Phraya dam reports flow only: `outflow` (million m³/day,
from station C.13) is also shown in m³/s. Each marker on the map fills with its reservoir's stored water;
selecting a dam flies there and tilts the map in 3D.

## Water levels

`water.html` uses `GET /stations/latest?kind=river`, `kind=canal` and `kind=road` (every 60 s; sample files when the
backend cannot be reached) and `kind=canal&scope=bangkok_test` for the team's ESP32 sensor, shown only when it
reports. Status, worst first: overflowing (river or canal at or over the bank; road 30 cm or deeper), critical
(at or over `crit`; road over 10 cm), watch (at or over `warn`; road 5 to 10 cm), normal, and no recent report
(no value or older than 6 hours). `warn` and `crit` are the Bangkok Drainage Office levels that come with the
canal gauges.

## Risk prediction

`risk.html` uses `GET /risk` (every 5 min, like Home: each call stores a row in `predictions`; 503 means no Ayutthaya
reading in the last 3 hours and shows "No data to assess yet"), `GET /stations/latest?kind=river` (every 60 s) for the
Ayutthaya reading and bank plus Nakhon Sawan and Bangkok Bridge as context, and `GET /admin/predictions` for admins only.
Sample fallbacks: `sample/risk.json`, `sample/stations-river.json`.

The level follows `rule_b2` in `backend/risk.py`: Critical at or over the bank (5.06 m), Warning above the watch line
(bank − 0.30 m) and higher than 6 hours earlier, Watch above the watch line otherwise, Normal at or below it. `/risk` does
not return the reading or the 6-hour change, so the page takes only the level from it and says so; `risk_percent` is not
shown because it is the level as a number, not a probability. The "past floods" lead times are copied from the 2020 to 2025
evaluation in `docs/plan.md` (`EVENTS` in `js/risk.js`); update them there if the evaluation is rerun.

The river model is CSS 3D (no WebGL): paper layers of the channel's cross-section, water filling it to the reading and
glass sheets at the watch line and the bank. It sways on its own, turns with the pointer (or a sideways drag) and its
layers spread apart under the pointer. Everything animated is switched off with "reduce motion".

## Admin pages

Admin accounts get four pages of their own, in the same shell as the rest of the site, and nothing else in the menu
(no client pages, no Emergency 1669): `admin.html` (Dashboard), `admin-alerts.html` (Alert queue),
`admin-reports.html` (Rescue reports) and `admin-hardware.html` (Hardware control).

Who sees what is decided in each page's `<head>`, before anything is drawn: an admin who opens a client page goes to
`admin.html`; a guest who opens an admin page goes to log in and comes back; a member goes to Home. The scripts check
again (`js/admin/core.js`, and `js/shell.js` when someone signs in or out in another tab). Admins land on the Dashboard
after logging in (`GW.ROUTES.admin`). Admin accounts come from `ADMIN_USERNAME` / `ADMIN_PASSWORD` on the server;
nobody can sign up as one. The admin pages use the shared shell markup, so a change to the sidebar or top bar has to be
made on them too (their menu is the four admin items).

| Page | Reads | Writes |
| --- | --- | --- |
| Dashboard | `/risk` (5 min), `/stations/latest?kind=river` (60 s), `/stations/history?kind=river&code=39&hours=24` (5 min), `/stations/latest?kind=rain`, `/dams/latest`, `/admin/affected-areas` (60 s) | none |
| Alert queue | `/admin/alerts` (20 s), `/alerts` for `sent_at` | `POST /admin/alerts` (saved as pending), `POST /admin/alerts/{id}/send` |
| Rescue reports | `/admin/incidents` (30 s) | `PATCH /admin/incidents/{id}` status |
| Hardware control | `/admin/pump-status?region=bangkok_test` (2 s), `/stations/latest?kind=canal&scope=bangkok_test` (5 s) | `POST /admin/pump-commands` on / off |

The menu badges (alerts waiting, new reports, pump running) refresh every 30 s on every admin page. What the backend
cannot do is not faked: alerts have no "hold" state (Hold keeps one pending), no district or audience (a sent alert goes
to everyone), reports have three statuses (Received, In progress, Completed) and no district, the rig has one sensor and
one pump, the server keeps only the latest pump command, and there is no water-level forecast. The Dashboard chart needs
`GET /stations/history` (added 16 Oct); an older backend answers 404 and the chart says the backend needs updating.

## Reading without interruptions

Every time Dam levels or Water levels opens, a short note in the middle of the screen explains that some
readings may be missing (with an apology). It keeps appearing until the visitor ticks "Do not show this again on
this device" (`localStorage` `gw_data_notice_v2` = `off`; delete it to see the note again). While the
pointer is over the map, details, tiles, list or table (or keyboard focus is inside them), the automatic refresh
waits and a "Updates paused while you read" chip shows; the missed refresh runs half a second after the reader
moves away. Code: `js/notice.js`, `GW.hold` in `js/shell.js`, `[data-hold]` on the sections.

## Maps

Dam levels, Water levels and the rescue pin use [OpenFreeMap](https://openfreemap.org) (Positron style; free,
no API key, no watermark, OpenStreetMap data). The credit shows on the map and in the footer. The map style itself
logs a few "Expected value to be of type number, but found null" warnings at city zoom; they are harmless.

## Conditions near you

The button on the Home hero asks for the visitor's location only when pressed. The dialog shows the
nearest three road flood gauges, that district's road-flooding level, the nearest canal or river gauge
against its bank, the nearest rain gauge, the Ayutthaya level (northern runoff, not the visitor's spot)
and the latest sent alert, each with its distance and time. Nothing within 15 km means outside Bangkok.
If location is refused, unavailable or slow (10 s), the visitor can pick a district instead, or use the
labelled sample location (Pathum Wan). The location is never sent or stored. Browsers share location
only on HTTPS pages or `localhost` / `127.0.0.1`.

## Media

Sky video: Miguel Á. Padriñán on Pexels. Bangkok photo: Pexels. Both under the Pexels license.
