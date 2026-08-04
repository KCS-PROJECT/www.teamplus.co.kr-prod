/**
 * classes 도메인 trainingType 값 — 학부모용 결제 수업.
 *
 * `Class.trainingType` 한 컬럼에 두 도메인이 공존한다 (schema.prisma:606-609):
 *   · classes 도메인 (소문자): regular | spot | lesson — 학부모용 결제 수업
 *   · training 도메인 (대문자): REGULAR_TRAINING | GAME | FUN | CAMP | PICKUP — 감독 내부 훈련
 *
 * ⚠️ 학부모 대상 목록·검색·탐색은 반드시 이 집합으로 필터해야 한다.
 *   누락 시 감독 내부 훈련(대문자)이 학부모 검색 결과에 섞여 나온다
 *   — 실제로 `search.service.ts` 의 통합 검색에 이 필터가 없어 노출되던 문제가 있었다(2026-08-04 수정).
 *
 * DTO 쪽 `@IsIn` 상수(create-class.dto.ts / get-classes-query.dto.ts)와 값이 같지만,
 * 그쪽은 "입력 허용 값" 이고 이쪽은 "조회 필터" 라 역할이 다르다.
 */
export const CLASSES_DOMAIN_TRAINING_TYPES = [
  "regular",
  "lesson",
  "spot",
] as const;

/** 수업 요일 — `ClassDaySchedule.dayOfWeek` 에 한글로 저장되는 SoT 값. */
export const CLASS_DAYS_OF_WEEK = [
  "월",
  "화",
  "수",
  "목",
  "금",
  "토",
  "일",
] as const;

/** 수업 대상 구분 — `Class.category`. */
export const CLASS_CATEGORIES = ["KIDS", "JUNIOR", "ADULT"] as const;

/**
 * 시간대 필터 구간 — `ClassDaySchedule.startTime`("HH:mm" 문자열) 기준.
 * PostgreSQL 문자열 비교가 사전순이라 "HH:mm" 제로패딩 형식에서 시각 순서와 일치한다.
 */
export const CLASS_TIME_SLOTS = {
  morning: { gte: "00:00", lt: "12:00" },
  afternoon: { gte: "12:00", lt: "17:00" },
  evening: { gte: "17:00", lt: "24:00" },
} as const;

export type ClassTimeSlot = keyof typeof CLASS_TIME_SLOTS;
