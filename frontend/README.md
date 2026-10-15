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
| `js/sky.js` | Blue-sky video and falling rain behind the app pages |
| `sample/*.json` | Offline snapshots of the public endpoints |

## Endpoints used on Home

`GET /risk` (5 min), `GET /districts/latest`, `GET /stations/latest?kind=river|canal|rain` (60 s),
`GET /dams/latest` (30 min), `GET /alerts` (30 s, public).
The "Conditions near you" dialog adds `GET /stations/latest?kind=road` (when opened, at most once a minute)
and reuses everything else the page has already loaded, so it never calls `/risk` again.

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
