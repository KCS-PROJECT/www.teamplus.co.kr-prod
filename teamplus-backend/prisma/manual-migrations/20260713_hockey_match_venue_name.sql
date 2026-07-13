-- 대회 일정(경기) 장소 자유 텍스트 컬럼 추가
-- null = 대회 장소(Tournament.location > venue > rink) 폴백 표시 (참조 방식)
ALTER TABLE hockey_matches ADD COLUMN IF NOT EXISTS venue_name TEXT;
