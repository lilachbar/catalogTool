import { chromium } from "playwright";

const VIEWPORT = { width: 1920, height: 1080 };
const URL = "http://127.0.0.1:8080/";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT });

  await page.addInitScript(() => {
    localStorage.setItem("catalogTool.chatPanelWidthLayoutVersion", "4");
    localStorage.removeItem("catalogTool.chatPanelWidth");
    localStorage.removeItem("catalogTool.chatPanelWidthCustomized");
  });

  const response = await page.goto(URL, { waitUntil: "networkidle", timeout: 20000 });
  if (!response || response.status() >= 400) {
    throw new Error(`Page failed to load: ${response?.status()}`);
  }

  await page.waitForTimeout(1500);

  const chatToggle = page.locator("#chatToggleBtn");
  if (await chatToggle.isVisible()) {
    await chatToggle.click();
    await page.waitForTimeout(800);
  }

  const metrics = await page.evaluate(() => {
    const shell = document.getElementById("appShell");
    const sidebar = document.querySelector(".env-sidebar");
    const main = document.querySelector(".app-main");
    const hero = document.querySelector(".workflow-page-hero");
    const chat = document.querySelector("aside.chat-panel:not(.chat-panel-popup):not(.chat-panel-hidden)");
    const layout = window.catalogToolLayoutCouple;

    const rect = (el) => (el ? el.getBoundingClientRect() : null);
    const shellRect = rect(shell);
    const sidebarRect = rect(sidebar);
    const mainRect = rect(main);
    const heroRect = rect(hero);
    const chatRect = rect(chat);

    const vw = window.innerWidth;
    const leftGap = sidebarRect && mainRect ? mainRect.left - sidebarRect.right : null;
    const rightGap = heroRect && chatRect ? chatRect.left - heroRect.right : null;
    const chatWidth = chatRect?.width ?? null;
    const expectedDefault = layout ? layout.computeDefaultChatWidth(vw) : Math.round(vw * 0.2);

    const styles = getComputedStyle(document.documentElement);
    const columnGap = styles.getPropertyValue("--app-column-gap").trim();
    const cssChatWidth = Number.parseFloat(styles.getPropertyValue("--chat-panel-width"));

    return {
      vw,
      columnGap,
      cssChatWidth,
      expectedDefault,
      chatWidth,
      leftGap,
      rightGap,
      leftGapPct: leftGap != null ? (leftGap / vw) * 100 : null,
      rightGapPct: rightGap != null ? (rightGap / vw) * 100 : null,
      chatWidthPct: chatWidth != null ? (chatWidth / vw) * 100 : null,
      hasChat: Boolean(chat),
      isDocked: document.body.classList.contains("is-chat-docked"),
    };
  });

  console.log(JSON.stringify(metrics, null, 2));

  const failures = [];
  if (!metrics.hasChat) {
    failures.push("chat panel not visible");
  }
  if (metrics.expectedDefault && metrics.chatWidth) {
    if (Math.abs(metrics.chatWidth - metrics.expectedDefault) > 8) {
      failures.push(`chat width ${metrics.chatWidth}px != expected ~${metrics.expectedDefault}px (20%)`);
    }
  }
  if (metrics.leftGapPct != null && metrics.rightGapPct != null) {
    if (Math.abs(metrics.leftGapPct - metrics.rightGapPct) > 1.5) {
      failures.push(`gap mismatch: left ${metrics.leftGapPct.toFixed(2)}% vs right ${metrics.rightGapPct.toFixed(2)}%`);
    }
    if (Math.abs(metrics.leftGapPct - 4) > 1.5) {
      failures.push(`left gap ${metrics.leftGapPct.toFixed(2)}% is not ~4%`);
    }
  }

  // Resize drag simulation
  if (metrics.hasChat) {
    const before = metrics.chatWidth;
    const chatBox = await page.locator("aside.chat-panel:not(.chat-panel-popup)").boundingBox();
    if (chatBox) {
      const startX = chatBox.x + 4;
      const startY = chatBox.y + 120;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX - 80, startY, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(200);
      const afterWidth = await page.evaluate(() => {
        const chat = document.querySelector("aside.chat-panel:not(.chat-panel-popup):not(.chat-panel-hidden)");
        return chat?.getBoundingClientRect().width ?? null;
      });
      if (before != null && afterWidth != null && Math.abs(afterWidth - before) < 20) {
        failures.push(`resize drag did not change width (${before} -> ${afterWidth})`);
      } else {
        console.log(`resize ok: ${before} -> ${afterWidth}`);
      }
    }
  }

  await browser.close();

  if (failures.length) {
    console.error("FAILURES:\n- " + failures.join("\n- "));
    process.exit(1);
  }
  console.log("All layout checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
