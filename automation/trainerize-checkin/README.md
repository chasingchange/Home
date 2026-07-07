# Trainerize Check-In Autopull

Runs automatically every Tuesday, Wednesday, and Thursday morning via GitHub
Actions (see `.github/workflows/trainerize-checkin.yml` in the repo root).
No Claude/AI involvement at runtime — it's a plain Python script on a cron.

**What it does:**
1. Reads your Google Calendar (the calendar behind Notion Calendar) for the
   day and pulls out client names from events titled like `Morgan x Tyler`
   or `Scott Grooms and Tyler Wade`.
2. Logs into Trainerize as you and scrapes each client's Missed
   workouts / Weight / Nutrition / Squat / Bicep / Bench / Lever stats.
3. Writes one row per client into your Notion **Check In** database, with
   the raw scraped facts in "Trainerize Raw Pull" and a best-effort guess at
   the category fields (Weight: On Track/Stalled/etc, lifts:
   Volume/Strength/No Change) — treat the guesses as a draft, not gospel.

## ⚠️ Before you rely on this

- **Trainerize has no self-serve API for individual trainers.** This drives
  the actual trainer web dashboard with a real login (browser automation via
  Playwright). That's inherently more fragile than an API integration — if
  Trainerize changes its UI, the scraper breaks until `src/trainerize_client.py`
  is updated. Automating your own account for your own business use is a
  normal use of a login you already have, but double check Trainerize's
  terms of service if that matters to you.
- **The selectors in `src/trainerize_client.py` are unverified placeholders.**
  I wrote this without live Trainerize credentials, so I could not confirm
  the real CSS selectors for the client search box or stat elements. You
  must calibrate this once (see Step 5 below) before the scraper will
  actually find data.
- **The category guesses are heuristics, not judgment.** "On Track" vs
  "Stalled" vs "Regressed" requires knowing the client's goal direction —
  the script only looks at the raw scraped text for simple signal words.
  Always glance at "Trainerize Raw Pull" during your review.

## One-time setup

### 1. Google Calendar access (service account)

1. Go to https://console.cloud.google.com/ → create a project (or reuse one).
2. Enable the **Google Calendar API** for that project.
3. Create a **Service Account** (IAM & Admin → Service Accounts), then create
   a JSON key for it and download it.
4. Open Google Calendar in your browser → Settings for the
   `tywadebusiness@gmail.com` calendar → **Share with specific people** →
   add the service account's email (looks like
   `xxx@yyy.iam.gserviceaccount.com`, found in the JSON key) with
   **"See all event details"** access.
5. The whole downloaded JSON file's contents become the
   `GOOGLE_SERVICE_ACCOUNT_JSON` secret (paste the raw JSON as one line).

### 2. Notion integration

1. Go to https://www.notion.so/profile/integrations → **New integration**,
   internal, in your workspace. Copy the token (`secret_...`) — this is
   `NOTION_TOKEN`.
2. Open the **Check In** database in Notion → `•••` menu → **Connections**
   → add your new integration. Do the same for the **Current Clients**
   database (inside the "Chasing Change" workspace's client roster).
3. Data source IDs (already wired into `.env.example` for this workspace):
   - `NOTION_CHECK_IN_DATA_SOURCE_ID=33ba17b3-a0bb-8059-8f83-000b5b7dd07d`
   - `NOTION_CURRENT_CLIENTS_DATA_SOURCE_ID=287a17b3-a0bb-80e7-a440-000b25d48791`

### 3. Trainerize credentials

Just your normal trainer login email/password. No special account needed,
but **use a password you're comfortable storing as a GitHub Secret.**

### 4. Add GitHub Secrets

In the repo: **Settings → Secrets and variables → Actions → New repository
secret**. Add all of:

- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `GOOGLE_CALENDAR_ID` (`tywadebusiness@gmail.com`)
- `TRAINERIZE_EMAIL`
- `TRAINERIZE_PASSWORD`
- `NOTION_TOKEN`
- `NOTION_CHECK_IN_DATA_SOURCE_ID`
- `NOTION_CURRENT_CLIENTS_DATA_SOURCE_ID`

### 5. Calibrate the Trainerize scraper (required before first real run)

Locally, with `.env` filled in from `.env.example`:

```bash
cd automation/trainerize-checkin
pip install -r requirements.txt
playwright install chromium
export $(cat .env | xargs)   # or use direnv/python-dotenv
python -m src.inspect_trainerize "SomeClientFirstName"
```

This saves screenshots + HTML dumps to `./debug/`. Open them, find the real
selectors for the login form, client search box/results, and the stat
elements on a client's profile page, then update the `SELECTORS` dict at the
top of `src/trainerize_client.py` to match. Re-run `inspect_trainerize.py`
until `04_client_profile.png` shows the right client, then update
`scrape_*`/`get_client_snapshot` if the stats live in different markup than
assumed.

### 6. Test it end to end

```bash
python -m src.main --date 2026-07-09 --force
```

Check the Notion Check In database for new rows, and Trainerize Raw Pull
text for sanity, before trusting the scheduled run.

## Runtime

GitHub Actions runs this at 12:00 UTC every Tue/Wed/Thu (7am/6am Central
depending on DST) — before your 1pm Client Review block. Trigger it manually
from the Actions tab (`workflow_dispatch`) any time to test.
