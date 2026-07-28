import { test, expect } from '@playwright/test';
import { loginAs } from './fixtures/auth.fixture';
import { gotoAndStabilize } from './support/ui';

/**
 * 자녀(선수) 등록 — iOS 키보드 오탭 회귀 방지 E2E (2026-07-27)
 *
 * ── 배경 ──────────────────────────────────────────────
 * iPhone 실기기에서 키보드 개폐 점프 중 폼 영역 탭이 sticky 앱바에 착지해
 * 생년월일 달력 아이콘 탭 시 전체메뉴(GlobalMenu)가 열리던 버그의 3중 방어선 검증:
 *   1) 앱바 버튼 tabIndex=-1 (iOS form assistant 탭 순회 차단 — f512dcb1)
 *   2) 닫힌 GlobalMenu inert (숨은 드로어 버튼 포커스/활성 차단 — f512dcb1)
 *   3) 키보드 전환 탭 가드 (data-keyboard-open 중 앱바 탭 소비 — 2026-07-27 신규)
 *
 * ── 시나리오 ──────────────────────────────────────────
 * 1. 성 → 이름 순차 포커스 정상 동작
 * 2. 생년월일 달력 버튼 클릭 → DatePickerModal 표시 (전체메뉴 아님)
 * 3. 앱바 액션 버튼 전부 tabindex="-1"
 * 4. 닫힌 GlobalMenu 루트 inert + aria-hidden
 * 5. data-keyboard-open 상태에서 메뉴 버튼 클릭 → GlobalMenu 안 열림(가드) /
 *    키보드 닫힘 + 가드 창(450ms) 경과 후 클릭 → 정상 열림
 */

const ADD_PATH = '/children/add';
// GlobalMenu 포털 wrapper — DatePickerModal 도 동일 클래스를 쓰므로
// role="dialog" (DatePickerModal wrapper 전용) 를 제외해 GlobalMenu 만 선별.
const MENU_WRAPPER = '.overlay-fullscreen-wrapper:not([role="dialog"])';

test.describe('자녀 등록 — iOS 키보드 오탭 회귀 방지', () => {
  test.beforeEach(async ({ page }) => {
    // 쿠키 동의 배너(z-9000 fixed dialog)가 로그인 버튼 클릭을 가로채지 않도록
    // 페이지 로드 전에 동의 상태를 주입 (CookieConsentBanner STORAGE_KEY 형식).
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'teamplus_cookie_consent',
        JSON.stringify({
          version: '1',
          acceptedAt: new Date().toISOString(),
          categories: { necessary: true, analytics: false, marketing: false },
        }),
      );
    });
    await loginAs(page, 'parent');
    await gotoAndStabilize(page, ADD_PATH);
    await expect(page).toHaveURL(/\/children\/add/);
  });

  test('성 → 이름 순차 포커스가 정상 동작한다', async ({ page }) => {
    const lastName = page.getByRole('textbox', { name: '성' });
    const firstName = page.getByRole('textbox', { name: '이름' });

    await lastName.click();
    await expect(lastName).toBeFocused();

    await firstName.click();
    await expect(firstName).toBeFocused();
    await firstName.fill('길동');
    await expect(firstName).toHaveValue('길동');
  });

  test('생년월일 달력 버튼 클릭 시 DatePickerModal 이 열린다 (전체메뉴 아님)', async ({
    page,
  }) => {
    // 실기기 재현 절차와 동일하게 성 → 이름 포커스 선행
    await page.getByRole('textbox', { name: '성' }).click();
    await page.getByRole('textbox', { name: '이름' }).click();

    await page.getByRole('button', { name: '생년월일 선택' }).click();

    // DatePickerModal(dialog) 표시 확인
    await expect(
      page.getByRole('dialog', { name: /생년월일/ }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // 전체메뉴는 닫힌 상태 유지
    const menus = page.locator(MENU_WRAPPER);
    const count = await menus.count();
    for (let i = 0; i < count; i++) {
      await expect(menus.nth(i)).toHaveAttribute('aria-hidden', 'true');
    }
  });

  test('앱바 액션 버튼은 모두 tabindex="-1" (form assistant 순회 차단)', async ({
    page,
  }) => {
    const header = page.locator('header').first();
    const buttons = header.locator('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(buttons.nth(i)).toHaveAttribute('tabindex', '-1');
    }
  });

  test('닫힌 GlobalMenu 는 inert + aria-hidden 으로 격리된다', async ({
    page,
  }) => {
    const menus = page.locator(MENU_WRAPPER);
    const count = await menus.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(menus.nth(i)).toHaveAttribute('aria-hidden', 'true');
      // inert — React 19 boolean attribute (빈 문자열 렌더)
      const inert = await menus.nth(i).getAttribute('inert');
      expect(inert).not.toBeNull();
    }
  });

  test('키보드 전환 탭 가드 — 키보드 표시 중 메뉴 탭은 소비되고, 닫힌 뒤에는 정상 열린다', async ({
    page,
  }) => {
    const menuButton = page.getByRole('button', { name: /^메뉴/ }).first();
    const openedMenu = page.locator(`${MENU_WRAPPER}[aria-hidden="false"]`);

    // 1) 키보드 표시 상태 시뮬레이션 (native-bridge-ui 판정 SoT 속성 주입)
    await page.getByRole('textbox', { name: '성' }).click();
    await page.evaluate(() =>
      document.documentElement.setAttribute('data-keyboard-open', ''),
    );

    await menuButton.click();
    // 가드가 탭을 소비 — 전체메뉴 안 열림 + 활성 input blur
    await page.waitForTimeout(300);
    await expect(openedMenu).toHaveCount(0);

    // 2) 키보드 닫힘 + 가드 창(450ms) 경과 후 → 정상 열림
    await page.evaluate(() =>
      document.documentElement.removeAttribute('data-keyboard-open'),
    );
    await page.waitForTimeout(600);

    await menuButton.click();
    await expect(openedMenu.first()).toBeVisible({ timeout: 10_000 });
  });
});
