const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();

  // 로그인
  await page.goto("http://localhost:5001/login");
  await page.waitForLoadState("networkidle");
  await page.fill('input[type="email"]', "parent@teamplus.com");
  await page.fill('input[type="password"]', "Test1234!");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);

  // 설정 페이지로 이동
  await page.goto("http://localhost:5001/settings");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);

  // 햄버거 버튼 클릭
  await page.click('button[aria-label="전체 메뉴 열기"]');
  await page.waitForTimeout(500);

  // 메뉴 아이템들 가져오기
  const menuButtons = await page.$$('aside[role="dialog"] nav ul li button');
  console.log("메뉴 버튼 개수:", menuButtons.length);

  // 각 버튼의 텍스트 확인
  console.log("\n=== 메뉴 아이템 목록 ===");
  for (let i = 0; i < Math.min(menuButtons.length, 15); i++) {
    const text = await menuButtons[i].textContent();
    console.log(i + 1 + ". " + text.trim());
  }

  // 첫 번째 메뉴 클릭 테스트 (홈)
  console.log("\n=== 메뉴 클릭 테스트 ===");

  // 홈 클릭
  await page.goto("http://localhost:5001/settings");
  await page.waitForLoadState("networkidle");
  await page.click('button[aria-label="전체 메뉴 열기"]');
  await page.waitForTimeout(500);

  const homeBtn = await page.$(
    'aside[role="dialog"] nav ul li button >> nth=0',
  );
  if (homeBtn) {
    await homeBtn.click();
    await page.waitForTimeout(500);
    console.log("홈 클릭 후 URL:", page.url());
    await page.screenshot({ path: "/tmp/after-home-click.png" });
  }

  // 수업 클릭
  await page.goto("http://localhost:5001/settings");
  await page.waitForLoadState("networkidle");
  await page.click('button[aria-label="전체 메뉴 열기"]');
  await page.waitForTimeout(500);

  const classBtn = await page.$(
    'aside[role="dialog"] nav ul li button >> nth=1',
  );
  if (classBtn) {
    await classBtn.click();
    await page.waitForTimeout(500);
    console.log("수업 클릭 후 URL:", page.url());
    await page.screenshot({ path: "/tmp/after-class-click.png" });
  }

  // FAQ 클릭 (스크롤 필요)
  await page.goto("http://localhost:5001/settings");
  await page.waitForLoadState("networkidle");
  await page.click('button[aria-label="전체 메뉴 열기"]');
  await page.waitForTimeout(500);

  // 메뉴 스크롤
  const nav = await page.$('aside[role="dialog"] nav');
  if (nav) {
    await nav.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: "/tmp/menu-scrolled.png" });

  // FAQ 버튼 찾기
  const faqBtn = await page.$(
    'aside[role="dialog"] nav button:has-text("FAQ")',
  );
  if (faqBtn) {
    await faqBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await faqBtn.click();
    await page.waitForTimeout(500);
    console.log("FAQ 클릭 후 URL:", page.url());
    await page.screenshot({ path: "/tmp/after-faq-click.png" });
  } else {
    console.log("FAQ 버튼을 찾을 수 없음");
  }

  await browser.close();
})();
