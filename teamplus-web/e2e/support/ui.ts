import type { Page } from '@playwright/test';

export async function dismissBottomSheetPopups(
  page: Page,
  maxAttempts = 3,
) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const closeBtn = page.getByRole('button', { name: '닫기' });

    try {
      await closeBtn.first().waitFor({ state: 'visible', timeout: 1500 });
    } catch {
      return;
    }

    await closeBtn.first().click();
    await page.waitForTimeout(500);
  }
}

export async function gotoAndStabilize(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle', { timeout: 30_000 });
  await dismissBottomSheetPopups(page);
}
