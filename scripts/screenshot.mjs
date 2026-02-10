import { chromium } from "playwright";
import fs from "fs";
import sharp from "sharp";

const SITES = [
  { name: "intramagazine", url: "https://intramagazine.com/", out: "docs/intramagazine.webp" },
  { name: "issueday",      url: "https://xn--2n1b69z8udca.com/", out: "docs/issueday.webp" },
  { name: "kpoppst",       url: "https://kppost.com/", out: "docs/kpoppst.webp" },
];

// PC 기준 viewport
const VIEWPORT = { width: 1920, height: 900 };
const SCALE = 1;

if (!fs.existsSync("docs")) fs.mkdirSync("docs", { recursive: true });

async function capture(page, site) {
  console.log(`\n[${site.name}] goto: ${site.url}`);

  await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);

  // fullPage PNG(원본)로 먼저 저장(중간파일)
  const tmp = site.out.replace(/\.webp$/i, ".png");

  await page.screenshot({
    path: tmp,
    fullPage: true,
    type: "png",
  });

  // webp로 변환
 await sharp(tmp)
  .resize({
    width: 900,
    withoutEnlargement: true
  })
  .webp({ quality: 70 })
  .toFile(site.out);
}

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });

  // 여기서 PC로 강제
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  for (const site of SITES) {
    try {
      await capture(page, site);
    } catch (e) {
      console.error(`[${site.name}] FAILED:`, e?.message || e);
    }
  }

  await browser.close();

  const missing = SITES.filter(s => !fs.existsSync(s.out)).map(s => s.out);
  if (missing.length) {
    console.error("Missing screenshots:", missing);
    process.exit(2);
  }
})();
