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

function withNoRocket(url) {
  const u = new URL(url);
  if (!u.searchParams.has("nowprocket")) u.searchParams.set("nowprocket", "1");
  return u.toString();
}

async function capture(page, site) {
  console.log(`\n[${site.name}] goto: ${site.url}`);

  await page.setViewportSize(VIEWPORT);

  const targetUrl = withNoRocket(site.url);

  await page.goto(targetUrl, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(1500);

  try { await page.mouse.move(10, 10); } catch (e) {}
  try { await page.mouse.wheel(0, 300); } catch (e) {}
  await page.waitForTimeout(500);

  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const applyLazyAttrs = () => {
      const imgs = Array.from(document.querySelectorAll("img"));
      for (const img of imgs) {
        try { img.loading = "eager"; } catch (e) {}

        const getAttr = (n) => img.getAttribute(n);
        const setAttr = (n, v) => { try { img.setAttribute(n, v); } catch (e) {} };

        const lazySrc =
          (img.dataset && (img.dataset.lazySrc || img.dataset.src || img.dataset.original || img.dataset.url)) ||
          getAttr("data-lazy-src") ||
          getAttr("data-src") ||
          getAttr("data-original") ||
          getAttr("data-url");

        const lazySrcset =
          (img.dataset && (img.dataset.lazySrcset || img.dataset.srcset)) ||
          getAttr("data-lazy-srcset") ||
          getAttr("data-srcset");

        const lazySizes =
          (img.dataset && (img.dataset.sizes)) ||
          getAttr("data-sizes");

        const curSrc = getAttr("src") || "";
        if (lazySrc && (!curSrc || curSrc.startsWith("data:"))) {
          setAttr("src", lazySrc);
        }

        if (lazySrcset && !getAttr("srcset")) {
          setAttr("srcset", lazySrcset);
        }

        if (lazySizes && !getAttr("sizes")) {
          setAttr("sizes", lazySizes);
        }

        try { img.classList.remove("lazyload"); } catch (e) {}
        try { img.classList.add("lazyloaded"); } catch (e) {}
      }

      const sources = Array.from(document.querySelectorAll("source"));
      for (const s of sources) {
        const ds = s.dataset || {};
        const u =
          ds.srcset ||
          ds.src ||
          s.getAttribute("data-srcset") ||
          s.getAttribute("data-src");
        if (u) {
          try { s.setAttribute("srcset", u); } catch (e) {}
        }
      }

      const bgEls = Array.from(document.querySelectorAll("[data-bg],[data-background],[data-background-image],[data-src]"));
      for (const el of bgEls) {
        const ds = el.dataset || {};
        const u =
          ds.bg ||
          ds.background ||
          ds.backgroundImage ||
          ds.src ||
          el.getAttribute("data-bg") ||
          el.getAttribute("data-background") ||
          el.getAttribute("data-background-image") ||
          el.getAttribute("data-src");
        if (u) {
          const style = getComputedStyle(el);
          if (!style.backgroundImage || style.backgroundImage === "none") {
            try { el.style.backgroundImage = `url("${u}")`; } catch (e) {}
          }
        }
      }

      try { window.dispatchEvent(new Event("scroll")); } catch (e) {}
      try { window.dispatchEvent(new Event("resize")); } catch (e) {}
    };

    applyLazyAttrs();

    let lastH = 0;
    let stable = 0;
    for (let i = 0; i < 30; i++) {
      window.scrollTo(0, document.body.scrollHeight);
      applyLazyAttrs();
      await sleep(900);

      const h = document.body.scrollHeight || 0;
      if (Math.abs(h - lastH) < 5) stable += 1;
      else stable = 0;
      lastH = h;

      if (stable >= 3) break;
    }

    const step = Math.floor(window.innerHeight * 0.85);
    for (let y = 0; y < (document.body.scrollHeight || 0) + step; y += step) {
      window.scrollTo(0, y);
      applyLazyAttrs();
      await sleep(450);
    }

    window.scrollTo(0, 0);
    applyLazyAttrs();
    await sleep(700);

    const imgs2 = Array.from(document.images || []);
    await Promise.all(
      imgs2.map(async (img) => {
        try { img.loading = "eager"; } catch (e) {}
        if (img.decode) {
          try { await img.decode(); } catch (e) {}
        }
        if (img.complete && img.naturalWidth > 0) return;

        await Promise.race([
          new Promise((res) => img.addEventListener("load", res, { once: true })),
          new Promise((res) => img.addEventListener("error", res, { once: true })),
          sleep(10000),
        ]);

        if (img.decode) {
          try { await img.decode(); } catch (e) {}
        }
      })
    );
  });

  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(700);

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
