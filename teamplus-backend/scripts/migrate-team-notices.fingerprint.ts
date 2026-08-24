/**
 * migrate-team-notices.fingerprint.ts — 이관 스크립트의 원본 행 fingerprint (순수 함수).
 *
 * 본체(migrate-team-notices.ts)는 import 시 main() 이 실행되는 구조라 spec 이 직접
 * import 할 수 없다 — 락 직전 변경 검출의 회귀 고정을 위해 해시 함수만 분리한다.
 *
 * [Codex P2-R4 C01] noticeFingerprint 는 사전검사 B(deviationReasons)가 판정하는
 * 서비스 전용 4필드(학년 타깃·displayLocations·maintenanceReason)까지 포함해야 한다 —
 * 초기 조회~락 획득 사이에 이 필드만 바뀌면(팀 공지를 이탈 행으로 만드는 변경)
 * 재대조가 놓치고 기본값 전제로 이관될 수 있다.
 */
import { createHash } from "node:crypto";

type JsonValue = unknown;

export interface NoticeFingerprintInput {
  id: string;
  title: string;
  content: string;
  targetTeamId: string | null;
  targetType: string | null;
  priority: number;
  targetBirthYearFrom: number | null;
  targetBirthYearTo: number | null;
  displayLocationsJson: JsonValue;
  maintenanceReason: string | null;
  isActive: boolean;
  pinned: boolean;
  viewCount: number;
  createdBy: string | null;
  createdAt: Date;
  startAt: Date | null;
  expiresAt: Date | null;
  publishedNotifiedAt: Date | null;
}

/** 원본 공지 행 fingerprint — 커밋 직전 "쓰기 중지" 재대조용 (in-place 수정까지 검출) */
export function noticeFingerprint(n: NoticeFingerprintInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        n.id,
        n.title,
        n.content,
        n.targetTeamId,
        n.targetType,
        n.priority,
        n.targetBirthYearFrom,
        n.targetBirthYearTo,
        JSON.stringify(n.displayLocationsJson),
        n.maintenanceReason,
        n.isActive,
        n.pinned,
        n.viewCount,
        n.createdBy,
        n.createdAt.getTime(),
        n.startAt?.getTime() ?? null,
        n.expiresAt?.getTime() ?? null,
        n.publishedNotifiedAt?.getTime() ?? null,
      ]),
    )
    .digest("hex");
}

/** 읽음 행 fingerprint — 락 이전 변경(동수 삭제/생성 포함) 재대조용 */
export function readFingerprint(r: {
  id: string;
  noticeId: string;
  userId: string;
  readAt: Date;
}): string {
  return createHash("sha256")
    .update(JSON.stringify([r.id, r.noticeId, r.userId, r.readAt.getTime()]))
    .digest("hex");
}

/** 댓글 행 fingerprint — 락 이전 변경 재대조용 */
export function commentFingerprint(c: {
  id: string;
  noticeId: string;
  userId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        c.id,
        c.noticeId,
        c.userId,
        c.content,
        c.createdAt.getTime(),
        c.updatedAt.getTime(),
      ]),
    )
    .digest("hex");
}
