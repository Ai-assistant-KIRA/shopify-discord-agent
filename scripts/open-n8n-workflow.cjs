const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox"],
    defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  await page.goto("http://localhost:5678/workflow/shopify-mcp-discord-agent", {
    waitUntil: "networkidle2",
    timeout: 60000,
  });
  await new Promise((r) => setTimeout(r, 8000));

  const info = await page.evaluate(() => {
    const text = document.body.innerText || "";
    return {
      title: document.title,
      snippet: text.slice(0, 4000),
    };
  });

  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();