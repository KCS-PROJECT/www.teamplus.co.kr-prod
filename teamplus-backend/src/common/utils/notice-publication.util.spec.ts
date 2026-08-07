import {
  publicationConditions,
  buildPublicationWhere,
  isWithinPublicationWindow,
} from "./notice-publication.util";

/**
 * 게시 기간 predicate — audience 열람 경로 공통 인가 조건의 경계 검증.
 * (Phase 0 · F-EX-01 · F-EX-05)
 */
describe("notice-publication.util", () => {
  const NOW = new Date("2026-08-06T03:00:00.000Z");

  describe("isWithinPublicationWindow", () => {
    it("기간 미지정(상시 노출)은 게시 중으로 본다", () => {
      expect(isWithinPublicationWindow({}, NOW)).toBe(true);
      expect(
        isWithinPublicationWindow({ startAt: null, expiresAt: null }, NOW),
      ).toBe(true);
    });

    it("시작 전 공지(예약)는 게시 중이 아니다", () => {
      expect(
        isWithinPublicationWindow(
          { startAt: new Date("2026-08-06T03:00:00.001Z") },
          NOW,
        ),
      ).toBe(false);
    });

    it("만료된 공지는 게시 중이 아니다", () => {
      expect(
        isWithinPublicationWindow(
          { expiresAt: new Date("2026-08-06T02:59:59.999Z") },
          NOW,
        ),
      ).toBe(false);
    });

    it("기간 안이면 게시 중이다", () => {
      expect(
        isWithinPublicationWindow(
          {
            startAt: new Date("2026-08-01T00:00:00.000Z"),
            expiresAt: new Date("2026-08-31T00:00:00.000Z"),
          },
          NOW,
        ),
      ).toBe(true);
    });

    it("경계 시각(startAt === now · expiresAt === now)은 게시 중으로 본다", () => {
      // 목록 where 의 lte/gte 와 동일 시맨틱 — 상세/목록 판정이 갈리면 안 된다
      expect(isWithinPublicationWindow({ startAt: NOW }, NOW)).toBe(true);
      expect(isWithinPublicationWindow({ expiresAt: NOW }, NOW)).toBe(true);
    });

    it("시작만 지정(종료 무기한)·종료만 지정 모두 각각 판정한다", () => {
      expect(
        isWithinPublicationWindow(
          { startAt: new Date("2026-08-01T00:00:00.000Z") },
          NOW,
        ),
      ).toBe(true);
      expect(
        isWithinPublicationWindow(
          { expiresAt: new Date("2026-08-31T00:00:00.000Z") },
          NOW,
        ),
      ).toBe(true);
    });
  });

  describe("publicationConditions / buildPublicationWhere", () => {
    it("시작·종료 각각에 대해 null 허용 OR 조건 2개를 만든다", () => {
      const conditions = publicationConditions(NOW);

      expect(conditions).toHaveLength(2);
      expect(conditions[0]).toEqual({
        OR: [{ startAt: null }, { startAt: { lte: NOW } }],
      });
      expect(conditions[1]).toEqual({
        OR: [{ expiresAt: null }, { expiresAt: { gte: NOW } }],
      });
    });

    it("buildPublicationWhere 는 조각을 AND 로 감싼다", () => {
      expect(buildPublicationWhere(NOW)).toEqual({
        AND: publicationConditions(NOW),
      });
    });

    it("조각 배열 형태라 기존 AND 조건과 병합해도 덮어쓰지 않는다", () => {
      const existingAnd = [{ targetBirthYearFrom: null }];
      const merged = [...existingAnd, ...publicationConditions(NOW)];

      expect(merged).toHaveLength(3);
      expect(merged[0]).toBe(existingAnd[0]);
    });
  });
});
