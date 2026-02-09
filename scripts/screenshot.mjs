import { chromium } from "playwright";
import fs from "fs";

const URL = process.env.TARGET_URL;
const OUT = process.env.OUT_PATH || "docs/shot.jpg";

if (!URL) {
  console.error("TARGET_URL is required");
  process.exit(1);
}

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage({
    viewport: { width: 1400, height: 900 },
    deviceScaleFactor: 2,
  });

  await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);

  // 메인 첫 화면만 캡처 (fullPage: false)
  await page.screenshot({ path: OUT, fullPage: false, type: "jpeg", quality: 82 });

  await browser.close();

  if (!fs.existsSync(OUT)) process.exit(2);
  console.log("Saved:", OUT);
})();
