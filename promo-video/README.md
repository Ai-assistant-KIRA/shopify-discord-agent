# Promo Video — Shopify Discord Agent

60-second GitHub promo video plan and assets. Generated with **Vertex AI Veo 3.1 Fast** using the AI avatar as on-screen host.

## Folder layout

```
promo-video/
├── README.md              ← you are here
├── PLAN.md                  Full production plan
├── scenes.json              Scene manifest (dialogue + Veo prompts)
├── config.json              GCP / model / style settings
├── github-publish.md        README embed + repo description checklist
├── intermediate/            Raw clips per extend step (gitignored)
└── output/                  Final trimmed MP4 + thumbnail (gitignored until ready)
```

## Quick start (after generation script exists)

```bash
cd shopify-discord-agent
pip install google-genai
npm run promo:video
```

## Avatar inputs (repo root)

| Asset | Path |
|-------|------|
| Primary first frame | `../../whoax-avatar-images/avatar-styled.png` |
| Likeness backup | `../../whoax-avatar-images/avatar-base.png` |
| n8n reference | `../../whoax-avatar-images/09-n8n.jpg` |
| Shopify reference | `../../whoax-avatar-images/05-shopify.jpg` |

## Pipeline summary

1. Image-to-video — **8s** max initial clip from avatar
2. Extend × **8** — +7s per call → 64s raw
3. ffmpeg trim → **60.0s** final
4. Publish to GitHub (see `github-publish.md`)

## Status

| Step | Status |
|------|--------|
| Plan + scenes | Done |
| GCS bucket + avatar upload | Pending |
| `scripts/generate-promo-video.py` | Pending |
| Veo generation run | Pending |
| GitHub publish | Pending |