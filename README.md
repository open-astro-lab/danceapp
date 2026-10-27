# Dance Class Manager

Simple web app for managing dance-class students and monthly fees dates.

**Live (GitHub Pages):** enable Pages on this repo (Settings → Pages → Deploy from branch `main` / root), then open:

`https://open-astro-lab.github.io/danceapp/`

## Batches

| Batch | Class days |
|-------|------------|
| Monday · Wednesday · Friday | Mon, Wed, Fri |
| Tuesday · Thursday · Saturday | Tue, Thu, Sat |
| Zumba (Ladies) | Tue, Wed, Thu, Fri |

## Features

- **Home** — choose a batch; see **Fees due today** (same day-of-month as the stored fees date)
- **Add / Edit / Remove** students (name + fees date)
- **Save** — stores data in the browser (`localStorage`)
- **Advance 1 class day (all)** — moves every fees date to the **next class day** for that batch (not +1 calendar day). Weekend gaps are handled (e.g. Fri → Mon for MWF, Sat → Tue for TTS, Fri → Tue for Zumba)

## WordPress

1. Publish this site on GitHub Pages.
2. In WordPress, add a **Custom HTML** block or menu link to the Pages URL, or embed:

```html
<iframe src="https://open-astro-lab.github.io/danceapp/" width="100%" height="800" style="border:0;border-radius:12px;"></iframe>
```

Data is saved in the browser on the device your mother uses. Use the same browser/device for ongoing work, or export is not required for normal use.

## Tech

Static HTML + CSS + JavaScript. No server or login required.
