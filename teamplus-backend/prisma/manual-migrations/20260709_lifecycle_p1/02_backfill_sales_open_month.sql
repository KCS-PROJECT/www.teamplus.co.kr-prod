-- [Lifecycle v4.1 P1] sales_open_month 전환 백필 (§9.3 — 배포 필수 선행, 1회성)
-- 규칙: 잔여(비취소·오늘 KST 이후) 일정이 있으면 그 가장 이른 달 → 현행 "판매 중" 그대로 편입.
--       잔여가 없으면 마지막 일정의 달 → 파생 판정상 "일정 등록 대기" (훈련 끝난 수업의 올바른 상태).
--       일정이 0개인 수업은 NULL 유지 — 파생식의 "일정 없음 → 대기" 분기가 처리.
-- scheduled_date 는 @db.Date(UTC 자정 = KST 달력일)이므로 KST 오늘 날짜와 직접 비교.

UPDATE classes c
SET sales_open_month = sub.m
FROM (
  SELECT
    class_id,
    COALESCE(
      date_trunc('month', MIN(scheduled_date) FILTER (
        WHERE scheduled_date >= (now() AT TIME ZONE 'Asia/Seoul')::date
      ))::date,
      date_trunc('month', MAX(scheduled_date))::date
    ) AS m
  FROM class_schedules
  WHERE is_cancelled = false
  GROUP BY class_id
) sub
WHERE sub.class_id = c.id
  AND c.sales_open_month IS NULL;
