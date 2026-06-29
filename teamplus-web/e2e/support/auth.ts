import { expect, type Page } from "@playwright/test";

export const SEED_USERS = {
  admin: "admin@teamplus.com",
  director: "director@teamplus.com",
  coach: "coach@teamplus.com",
  parent: "parent@teamplus.com",
  teen: "teen@teamplus.com",
  child: "child@teamplus.com",
} as const;

export type SeedUserRole = keyof typeof SEED_USERS;

const SEED_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "Test1234!";

export async function loginAsSeedUser(page: Page, role: SeedUserRole) {
  if (role === "teen" || role === "child") {
    throw new Error(
      "teen/child 계정은 현재 PIN 인증이 필요합니다. 공통 로그인 helper 대신 학생 전용 인증 시나리오를 사용하세요.",
    );
  }

  await page.goto("/login");
  await expect(page).toHaveURL(/\/login/);

  await page.getByPlaceholder("아이디").fill(SEED_USERS[role]);
  await page.getByPlaceholder("비밀번호").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();

  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 45_000,
  });
}
