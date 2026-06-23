import { defineConfig, devices } from '@playwright/test';

const isCI = process.env.CI === '1' || process.env.CI === 'true';
const headed = process.env.PLAYWRIGHT_HEADED === '1';
const debugMode = process.env.PLAYWRIGHT_DEBUG === '1';
const slowMo = Number(
  process.env.PLAYWRIGHT_SLOWMO ?? (debugMode ? '1500' : '0'),
);
const workers = process.env.PLAYWRIGHT_WORKERS
  ? Number(process.env.PLAYWRIGHT_WORKERS)
  : 1;

/**
 * TEAMPLUS Web E2E 테스트 설정.
 *
 * 기본값:
 * - 자동 실행 우선(headless)
 * - 실패 시 trace/screenshot/video 보존
 * - 모바일 퍼스트 뷰포트 고정
 *
 * 실행 예시:
 * - 전체 자동 실행: `npm run test:e2e`
 * - 단일 케이스: `npm run test:e2e -- e2e/auth-smoke.spec.ts`
 * - UI 모드: `npm run test:e2e:ui`
 * - 로컬 디버그: `npm run test:e2e:debug`
 * - CI 모드: `npm run test:e2e:ci`
 */
export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/support/**'],
  timeout: isCI ? 240_000 : 180_000,
  expect: {
    timeout: 15_000,
  },
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers,
  fullyParallel: false,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  outputDir: 'test-results',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    viewport: { width: 430, height: 932 },
    locale: 'ko-KR',
    headless: !headed,
    launchOptions: {
      slowMo,
      args: ['--disable-blink-features=AutomationControlled'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 430, height: 932 },
      },
    },
  ],
});
