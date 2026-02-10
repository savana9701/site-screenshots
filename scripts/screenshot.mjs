import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import sharp from "sharp";

const SITES = [
  { name: "intramagazine", url: "https://intramagazine.com/", out: "docs/intramagazine.webp" },
  { name: "issueday",      url: "https://xn--2n1b69z8udca.com/", out: "docs/issueday.webp" },
  { name: "kpoppst",       url: "https://kppost.com/", out: "docs/kpoppst.webp" },
];

// 공통 옵션
const VIEWPORT = { width: 900, height: 900 };
const SCALE = 1;

// 변환 옵션 (여기만 조절하면 됨)
const OUT_WIDTH = 900;      //  webp 가로폭
const WEBP_QUALITY = 72;    // 60~80 사이 추천

if (!fs.existsSync("docs")) fs.mkdirSync("docs", { recursive: true });

async function capture(page, site) {
  console.log(`\n[${site.name}] goto: ${site.url}`);

  await page.setViewportSize(VIEWPORT);
  await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 60000 });

  // 로딩 안정화
  await page.waitForTimeout(2500);

  // 임시 png 경로
  const tmpPng = site.out.replace(/\.webp$/i, ".tmp.png");

  // 1) fullPage png 캡쳐
  await page.screenshot({
    path: tmpPng,
    fullPage: true,
    type: "png",
  });

  // 2) sharp로 리사이즈 + webp 변환
  // - height는 자동 비율 유지(안 넣는 게 좋음)
  await sharp(tmpPng)
    .resize({ width: OUT_WIDTH, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toFile(site.out);

  // 3) 임시파일 삭제
  fs.unlinkSync(tmpPng);

  console.log(`[${site.name}] saved: ${site.out}`);
}

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });

  const context = await browser.newContext({
    deviceScaleFactor: SCALE,
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
