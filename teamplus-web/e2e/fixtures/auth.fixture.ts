import { test as base, expect, type Page } from "@playwright/test";
import {
  SEED_USERS,
  type SeedUserRole,
  loginAsSeedUser,
} from "../support/auth";
import { dismissBottomSheetPopups } from "../support/ui";

/**
 * 역할별 테스트 계정 + 대시보드 리다이렉트 경로.
 * `support/auth.ts`의 SEED_USERS를 기반으로 대시보드 경로를 덧붙인 확장 버전.
 * teamplus-web/src/lib/auth-routing.ts 의 DASHBOARD_PATHS 와 동기 유지.
 */
export const TEST_ACCOUNTS: Record<
  SeedUserRole,
  { email: string; dashboard: string }
> = {
  admin: { email: SEED_USERS.admin, dashboard: "/admin" },
  director: { email: SEED_USERS.director, dashboard: "/director" },
  coach: { email: SEED_USERS.coach, dashboard: "/coach" },
  parent: { email: SEED_USERS.parent, dashboard: "/parent" },
  teen: { email: SEED_USERS.teen, dashboard: "/teen" },
  child: { email: SEED_USERS.child, dashboard: "/child" },
};

export type TestRole = SeedUserRole;

export const COMMON_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "Test1234!";

/**
 * 역할 기반 로그인 헬퍼. `support/auth.ts`의 loginAsSeedUser 를 래핑한다.
 * 대시보드 진입 후 이벤트 팝업이 있으면 자동으로 닫는다.
 */
export async function loginAs(
  page: Page,
  role: TestRole,
  options: { dismissPopups?: boolean } = {},
) {
  await loginAsSeedUser(page, role);
  if (options.dismissPopups !== false) {
    await dismissBottomSheetPopups(page);
  }
}

type AuthFixtures = {
  loginAs: (role: TestRole) => Promise<void>;
};

export const test = base.extend<AuthFixtures>({
  loginAs: async ({ page }, use) => {
    await use((role: TestRole) => loginAs(page, role));
  },
});

export { expect };
