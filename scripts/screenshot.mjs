import { chromium } from "playwright";
import fs from "fs";

const SITES = [
  { name: "intramagazine", url: "https://intramagazine.com/", out: "docs/intramagazine.jpg" },
  { name: "issueday",      url: "https://xn--2n1b69z8udca.com/", out: "docs/issueday.jpg" },
  { name: "kpoppst",       url: "https://kppost.com/", out: "docs/kpoppst.jpg" },
];

// 공통 옵션 (캡쳐 비율)
const VIEWPORT = { width: 900, height: 900 };
const SCALE = 1;

// docs 폴더 없으면 생성
if (!fs.existsSync("docs")) fs.mkdirSync("docs", { recursive: true });

async function capture(page, site) {
  console.log(`\n[${site.name}] goto: ${site.url}`);

  await page.setViewportSize(VIEWPORT);
await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);


  // 로딩 안정화 (폰트/이미지 늦게 뜨는 사이트 대비)
  await page.waitForTimeout(1500);

  // 메인 첫 화면만 캡처 (fullPage: false)
   await page.screenshot({
    path: site.out,
    fullPage: true,
    type: "jpeg",
    quality: 72, // 용량 줄이기(추천)
  });

  console.log(`[${site.name}] saved: ${site.out}`);
}

(async () => {
  const browser = await chromium.launch({
    args: ["--no-sandbox"],
  });

  const context = await browser.newContext({
    deviceScaleFactor: SCALE,
  });

  const page = await context.newPage();

  for (const site of SITES) {
    try {
      await capture(page, site);
    } catch (e) {
      console.error(`[${site.name}] FAILED:`, e?.message || e);
      // 한 사이트 실패해도 다음 사이트 계속 진행
    }
  }

  await browser.close();

  // 결과 파일 존재 체크
  const missing = SITES.filter(s => !fs.existsSync(s.out)).map(s => s.out);
  if (missing.length) {
    console.error("Missing screenshots:", missing);
    process.exit(2);
  }
})();
