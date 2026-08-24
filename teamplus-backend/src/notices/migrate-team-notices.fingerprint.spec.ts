/**
 * 이관 스크립트 fingerprint — [Codex P2-R4 C01] 락 직전 변경 검출 회귀 고정.
 *
 * 계약: 이관 트랜잭션은 초기 조회 스냅샷의 행 해시를 락 획득 직후 재대조한다 —
 * "락 이전 변경은 해시 불일치로 롤백, 락 이후는 DB 가 차단". 따라서 원본의 **어떤
 * 필드가 바뀌어도 해시가 달라져야** 하며, 특히 사전검사 B(기본값 이탈 판정)가 보는
 * 서비스 전용 4필드(학년 타깃 2·displayLocations·maintenanceReason)가 빠지면 팀
 * 공지를 이탈 행으로 만드는 변경이 검출 없이 기본값 전제로 이관된다.
 */
import {
  commentFingerprint,
  noticeFingerprint,
  readFingerprint,
  type NoticeFingerprintInput,
} from "../../scripts/migrate-team-notices.fingerprint";

describe("migrate-team-notices fingerprint — 락 직전 변경 검출", () => {
  const base = (): NoticeFingerprintInput => ({
    id: "notice-1",
    title: "팀 공지",
    content: "본문",
    targetTeamId: "team-a",
    targetType: null,
    priority: 0,
    targetBirthYearFrom: null,
    targetBirthYearTo: null,
    displayLocationsJson: [],
    maintenanceReason: null,
    isActive: true,
    pinned: false,
    viewCount: 3,
    createdBy: "director-1",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    startAt: null,
    expiresAt: null,
    publishedNotifiedAt: new Date("2026-08-01T00:00:01.000Z"),
  });

  it("동일 행은 동일 해시 — 재실행 멱등의 전제", () => {
    expect(noticeFingerprint(base())).toBe(noticeFingerprint(base()));
  });

  it("[P2-R4-C01] 서비스 전용 4필드 변경도 각각 해시를 바꾼다 (이탈 행 전환 검출)", () => {
    const original = noticeFingerprint(base());
    const drifted: Array<Partial<NoticeFingerprintInput>> = [
      { targetBirthYearFrom: 2015 },
      { targetBirthYearTo: 2016 },
      { displayLocationsJson: ["home"] },
      { maintenanceReason: "점검" },
    ];
    for (const change of drifted) {
      expect(noticeFingerprint({ ...base(), ...change })).not.toBe(original);
    }
  });

  it("이관 대상 필드 변경도 해시를 바꾼다 (in-place 수정 검출)", () => {
    const original = noticeFingerprint(base());
    const drifted: Array<Partial<NoticeFingerprintInput>> = [
      { title: "수정된 제목" },
      { content: "수정된 본문" },
      { pinned: true },
      { isActive: false },
      { viewCount: 4 },
      { targetType: "maintenance" },
      { priority: 1 },
      { createdBy: null },
      { expiresAt: new Date("2026-09-01T00:00:00.000Z") },
    ];
    for (const change of drifted) {
      expect(noticeFingerprint({ ...base(), ...change })).not.toBe(original);
    }
  });

  it("읽음·댓글 행 fingerprint 도 필드 변경을 검출한다", () => {
    const read = {
      id: "read-1",
      noticeId: "notice-1",
      userId: "parent-1",
      readAt: new Date("2026-08-02T00:00:00.000Z"),
    };
    expect(readFingerprint(read)).toBe(readFingerprint({ ...read }));
    expect(
      readFingerprint({ ...read, readAt: new Date("2026-08-03T00:00:00.000Z") }),
    ).not.toBe(readFingerprint(read));

    const comment = {
      id: "comment-1",
      noticeId: "notice-1",
      userId: "parent-1",
      content: "댓글",
      createdAt: new Date("2026-08-02T00:00:00.000Z"),
      updatedAt: new Date("2026-08-02T00:00:00.000Z"),
    };
    expect(commentFingerprint(comment)).toBe(commentFingerprint({ ...comment }));
    expect(
      commentFingerprint({ ...comment, content: "수정 댓글" }),
    ).not.toBe(commentFingerprint(comment));
  });
});
