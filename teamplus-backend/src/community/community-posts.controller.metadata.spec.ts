import { ROLES_KEY } from "@/auth/roles.decorator";
import { CommunityPostsController } from "./community-posts.controller";

/**
 * [Codex R1 H-00] 단위 공지 API @Roles 선언 계약 고정.
 *
 * 사용자 확정: 이 기능에서 CHILD/TEEN 직접 로그인은 사용하지 않는다 —
 * 자녀 계정·등록 데이터는 보호자 수신자·자녀 이름 산출에만 쓰고,
 * 신규 단위 공지 API 의 접근 역할에서는 제외한다.
 * 선언 목록이 SoT 라 회귀(재추가)를 메타데이터 spec 으로 차단한다.
 */
describe("CommunityPostsController — @Roles 메타데이터 (CHILD/TEEN 제외 계약)", () => {
  const viewerEndpoints = [
    "getPosts",
    "getPostDetail",
    "addComment",
    "updateComment",
    "deleteComment",
  ] as const;
  const managerEndpoints = [
    "createPost",
    "getManagedPosts",
    "getManagedTargets",
    "getClassContacts",
    "updatePost",
    "deletePost",
    "getReadsSummary",
    "remindUnread",
    "addAttachment",
  ] as const;

  const rolesOf = (method: string): string[] =>
    Reflect.getMetadata(
      ROLES_KEY,
      CommunityPostsController.prototype[
        method as keyof CommunityPostsController
      ] as object,
    );

  it.each([...viewerEndpoints, ...managerEndpoints])(
    "%s — CHILD/TEEN 미포함",
    (method) => {
      const roles = rolesOf(method);
      expect(roles).toBeDefined();
      expect(roles).not.toContain("CHILD");
      expect(roles).not.toContain("TEEN");
    },
  );

  it.each([...viewerEndpoints])("%s — 보호자(PARENT) 열람 허용", (method) => {
    expect(rolesOf(method)).toContain("PARENT");
  });

  it.each([...managerEndpoints])(
    "%s — 관리 경로는 PARENT 미포함 (감독·코치·시스템 전용)",
    (method) => {
      expect(rolesOf(method)).not.toContain("PARENT");
    },
  );
});
