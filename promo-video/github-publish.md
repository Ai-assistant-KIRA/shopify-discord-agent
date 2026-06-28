# GitHub publish checklist

Use after `output/shopify-discord-agent-promo.mp4` is approved.

## 1. Commit the video

- Preferred path: `promo-video/output/shopify-discord-agent-promo.mp4`
- If file exceeds 25 MB, attach via **GitHub Release** instead and link from README

Optional compression:

```bash
ffmpeg -i promo-video/output/shopify-discord-agent-promo.mp4 -crf 23 -c:v libx264 -c:a aac promo-video/output/shopify-discord-agent-promo-compressed.mp4
```

## 2. README embed

Add after the Architecture section in `README.md`:

```markdown
## Demo video

https://github.com/USER/REPO/assets/ASSET_ID/shopify-discord-agent-promo.mp4

*60-second overview: Discord → n8n → Gemini → MCP → Shopify*
```

Upload via GitHub UI: drag MP4 into a README edit or issue comment to get the `assets/` URL.

## 3. Repo description

GitHub → Settings → General → Description:

> Ask your Shopify store questions in Discord. n8n + Gemini + MCP tools for inventory, orders, revenue, discounts, and more.

Add demo link in the website field or description if space allows.

## 4. Social preview

- Upload `output/promo-thumbnail.png` (1280×640 frame from Scene 1) as repository social preview, or
- Use a short GIF from the first 3 seconds

## 5. Optional thumbnail frame grab

```bash
ffmpeg -i promo-video/output/shopify-discord-agent-promo.mp4 -ss 00:00:02 -vframes 1 promo-video/output/promo-thumbnail.png
```