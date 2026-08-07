import { Prisma } from "@prisma/client";

/**
 * 공지 게시 기간(startAt/expiresAt) 판정 — **audience 열람 경로 공통 인가 조건**.
 *
 * 목록 하나만 필터하면 상세·댓글·검색·대시보드가 그대로 우회로가 되므로,
 * 사용자에게 공지를 노출하는 모든 경로가 이 조건을 공유한다.
 * 관리 목적 경로(작성자·시스템 역할·해당 팀 관리자, `/notices/admin/list`)는 의도적으로 우회한다.
 *
 * ⚠️ 게시 기간은 `@db.Timestamptz(3)` 절대시각이다. 날짜 문자열을 instant 로 만들 때는
 *    `@db.Date` 전용인 `dateOnlyToUtc` 를 쓰지 말 것(UTC 자정이라 KST 기준 9시간 어긋난다).
 */

/** 게시 기간 판정에 필요한 최소 필드. undefined/null 은 "제한 없음"으로 취급한다. */
export interface PublicationWindowFields {
  startAt?: Date | null;
  expiresAt?: Date | null;
}

/**
 * 게시 기간 조건 **조각 배열**.
 *
 * 호출부의 `where.AND` 에 spread 해서 병합한다. `{ AND: [...] }` 를 통째로 대입하면
 * 기존 AND 조건(예: 출생연도 필터)을 덮어쓰므로 이 형태를 기본 API 로 둔다.
 */
export function publicationConditions(
  now: Date = new Date(),
): Prisma.SystemNoticeWhereInput[] {
  return [
    { OR: [{ startAt: null }, { startAt: { lte: now } }] },
    { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
  ];
}

/** 다른 AND 조건이 없는 호출부용 편의 래퍼. */
export function buildPublicationWhere(
  now: Date = new Date(),
): Prisma.SystemNoticeWhereInput {
  return { AND: publicationConditions(now) };
}

/**
 * 공지 열람 팀 스코프 조건 — 검색·대시보드 등 **notices 모듈 밖** 소비자 공통.
 *
 * `서비스 공지(targetTeamId=null)` ∪ `열람 가능한 팀의 공지` 만 남긴다.
 * 열람 팀이 없으면(비로그인·무소속) 서비스 공지만 남는다.
 *
 * ⚠️ 반환값은 `OR` 를 품은 **단일 조건 객체**다. 호출부의 최상위 `OR`(예: targetType 필터)와
 *    충돌하지 않도록 반드시 `AND` 배열 안에 넣어야 한다.
 */
export function buildNoticeTeamScopeCondition(
  viewerTeamIds: string[],
): Prisma.SystemNoticeWhereInput {
  return {
    OR: [
      { targetTeamId: null },
      ...(viewerTeamIds.length > 0
        ? [{ targetTeamId: { in: viewerTeamIds } }]
        : []),
    ],
  };
}

/**
 * 단건 게시 여부 — 상세/댓글 가드용.
 * 경계 포함: `startAt === now` · `expiresAt === now` 는 게시 중으로 본다(목록 `lte`/`gte` 와 동일).
 */
export function isWithinPublicationWindow(
  notice: PublicationWindowFields,
  now: Date = new Date(),
): boolean {
  const startAt = notice.startAt ?? null;
  const expiresAt = notice.expiresAt ?? null;

  if (startAt && startAt.getTime() > now.getTime()) return false;
  if (expiresAt && expiresAt.getTime() < now.getTime()) return false;
  return true;
}
