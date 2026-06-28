const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox"],
    defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  await page.goto("http://localhost:5678", { waitUntil: "networkidle2", timeout: 60000 });

  // Open workflow directly if possible
  await page.goto(
    "http://localhost:5678/workflow/shopify-mcp-discord-agent",
    { waitUntil: "networkidle2", timeout: 60000 }
  );
  await new Promise((r) => setTimeout(r, 5000));

  const info = await page.evaluate(() => {
    const text = document.body.innerText || "";
    const issues = [...document.querySelectorAll("[class*='issue'], [class*='error'], .node-error")].map(
      (el) => el.textContent?.trim()
    );
    return {
      title: document.title,
      snippet: text.slice(0, 3000),
      issues: issues.filter(Boolean).slice(0, 20),
    };
  });

  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();