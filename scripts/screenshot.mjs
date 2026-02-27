import { chromium } from "playwright";
import fs from "fs";
import sharp from "sharp";

const SITES = [
  { name: "intramagazine", url: "https://intramagazine.com/", out: "docs/intramagazine.webp" },
  { name: "issueday",      url: "https://xn--2n1b69z8udca.com/", out: "docs/issueday.webp" },
  { name: "kpoppst",       url: "https://kppost.com/", out: "docs/kpoppst.webp" },
];

const VIEWPORT = { width: 1920, height: 900 };
const SCALE = 1;

if (!fs.existsSync("docs")) fs.mkdirSync("docs", { recursive: true });

async function capture(page, site) {
  console.log(`\n[${site.name}] goto: ${site.url}`);

  await page.setViewportSize(VIEWPORT);

  await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);

  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelectorAll('img[loading="lazy"]').forEach((img) => {
      try { img.loading = "eager"; } catch (e) {}
    });

    const step = Math.floor(window.innerHeight * 0.85);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await sleep(350);
      document.querySelectorAll('img[loading="lazy"]').forEach((img) => {
        try { img.loading = "eager"; } catch (e) {}
      });
    }
    window.scrollTo(0, 0);
    await sleep(500);

    const imgs = Array.from(document.images || []);
    await Promise.all(
      imgs.map(async (img) => {
        try { img.loading = "eager"; } catch (e) {}

        if (img.complete && img.naturalWidth > 0) {
          if (img.decode) {
            try { await img.decode(); } catch (e) {}
          }
          return;
        }

        await Promise.race([
          new Promise((res) => img.addEventListener("load", res, { once: true })),
          new Promise((res) => img.addEventListener("error", res, { once: true })),
          sleep(5000),
        ]);

        if (img.decode) {
          try { await img.decode(); } catch (e) {}
        }
      })
    );
  });

  const tmp = site.out.replace(/\.webp$/i, ".png");

  try {
    await page.screenshot({
      path: tmp,
      fullPage: true,
      type: "png",
    });

    await sharp(tmp)
      .resize({ width: 900, withoutEnlargement: true })
      .webp({ quality: 70, effort: 6 })
      .toFile(site.out);

    console.log(`[${site.name}] saved: ${site.out}`);
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });

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

  // 캐시 리프레시용 버전 파일 생성 (6시간마다 바뀌게)
const version = String(Date.now()); // ms 타임스탬프
fs.writeFileSync("docs/version.json", JSON.stringify({ v: version }, null, 2));
console.log("[version] docs/version.json saved:", version);
})();
