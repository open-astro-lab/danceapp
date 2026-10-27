# Dance Class Manager

Shared web app for dance-class students and monthly fees dates.  
**Everyone who opens the app sees the same list** (data stored in this GitHub repo via Vercel).

## Deploy on Vercel (required for shared Save)

1. Import repo `open-astro-lab/danceapp` into Vercel.
2. **Settings → Environment Variables** → add:

| Name | Value |
|------|--------|
| `GITHUB_TOKEN` | A GitHub fine-grained token with **Contents: Read and write** on this repo |

3. Deploy.

App URL example: `https://danceapp.vercel.app`

### WordPress

```html
<iframe src="https://YOUR-VERCEL-URL/" width="100%" height="800" style="border:0;border-radius:12px;"></iframe>
```

## How to use

1. Open app → see **Fees due today** (same day-of-month as fees date).
2. Open a batch → **Add Student** (name + fees date).
3. Edit: tap a row. Remove: **⋯**.
4. **Advance 1 class day (all)** → next **class day** for that batch (not +1 calendar day).
5. Tap **Save** → writes to shared storage; anyone opening the app sees the update.
6. **Refresh list** on the home screen to pull the latest.

## Batches

| Batch | Class days |
|-------|------------|
| Mon · Wed · Fri | 1, 3, 5 |
| Tue · Thu · Sat | 2, 4, 6 |
| Zumba | Tue–Fri |

## Files

- `index.html` / `styles.css` / `app.js` — UI  
- `api/data.js` — Vercel API (GET/POST shared `data.json`)  
- `data.json` — shared database in the repo  
