import { ROLES_KEY } from "@/auth/roles.decorator";
import { NoticesController } from "./notices.controller";

/**
 * 댓글 삭제 endpoint 의 @Roles 선언 계약 고정 — P4-R1-01.
 *
 * 서비스 moderation 판정(isNoticeSystemRole)은 ADMIN/SYSTEM/OPER 3종이다.
 * 현재 RolesGuard 는 이 3종을 super-admin 으로 일괄 통과시키므로(@Roles 목록과 무관하게
 * 런타임 차단은 없지만), 선언 목록이 SoT 와 어긋나면 ① 가드의 암묵 우회가 제거되는 순간
 * 조용히 403 회귀가 생기고 ② Swagger/코드 독자가 허용 집합을 오독한다.
 * → 메타데이터 자체를 spec 으로 고정한다.
 */
describe("NoticesController — deleteComment @Roles 메타데이터", () => {
  it("시스템 역할 SoT(ADMIN/SYSTEM/OPER)를 모두 선언한다", () => {
    const roles: string[] = Reflect.getMetadata(
      ROLES_KEY,
      NoticesController.prototype.deleteComment,
    );

    expect(roles).toEqual(
      expect.arrayContaining(["ADMIN", "SYSTEM", "OPER", "DIRECTOR", "COACH"]),
    );
  });

  it("댓글 작성 가능 역할(본인 삭제 경로)도 유지된다", () => {
    const roles: string[] = Reflect.getMetadata(
      ROLES_KEY,
      NoticesController.prototype.deleteComment,
    );

    expect(roles).toEqual(
      expect.arrayContaining(["PARENT", "TEEN", "CHILD", "ACADEMY_DIRECTOR"]),
    );
  });
});
