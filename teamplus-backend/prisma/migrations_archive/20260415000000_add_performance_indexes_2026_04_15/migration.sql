-- P0 복합 인덱스 7건 추가 (2026-04-15)
-- 성능 분석 결과 식별된 핫패스 쿼리 최적화

-- 1. MemberCredit: QR 체크인 핫패스 (유효 크레딧 조회)
--    WHERE member_id = ? AND expires_at > NOW()
CREATE INDEX IF NOT EXISTS "member_credits_member_id_expires_at_idx"
  ON "icehockey"."member_credits" ("member_id", "expires_at");

-- 2. CoachProfile: clubs 서비스 11회 호출 최적화
--    WHERE club_id = ?
CREATE INDEX IF NOT EXISTS "coach_profiles_club_id_idx"
  ON "icehockey"."coach_profiles" ("club_id");

-- 3. Club: search 페이지네이션 최적화
--    ORDER BY created_at DESC LIMIT ? OFFSET ?
CREATE INDEX IF NOT EXISTS "clubs_created_at_idx"
  ON "icehockey"."clubs" ("created_at");

-- 4. Club: 클럽-코치 FK 조회 최적화
--    WHERE coach_id = ?
CREATE INDEX IF NOT EXISTS "clubs_coach_id_idx"
  ON "icehockey"."clubs" ("coach_id");

-- 5. ClassSchedule: 정산/통계 핫패스
--    WHERE class_id = ? AND scheduled_date BETWEEN ? AND ? AND is_cancelled = false
CREATE INDEX IF NOT EXISTS "class_schedules_class_id_scheduled_date_is_cancelled_idx"
  ON "icehockey"."class_schedules" ("class_id", "scheduled_date", "is_cancelled");

-- 6. Enrollment: 72h 만료 스케줄러 최적화
--    WHERE status = 'pending_approval' AND requested_at < NOW() - INTERVAL '72h'
CREATE INDEX IF NOT EXISTS "enrollments_status_requested_at_idx"
  ON "icehockey"."enrollments" ("status", "requested_at");

-- 7. ChatMessage: 메시지 페이징 최적화
--    WHERE room_id = ? AND is_deleted = false ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS "chat_messages_room_id_is_deleted_created_at_idx"
  ON "icehockey"."chat_messages" ("room_id", "is_deleted", "created_at");

-- 8. ClubPost: 게시판 정렬 최적화
--    WHERE club_id = ? ORDER BY is_pinned DESC, created_at DESC
CREATE INDEX IF NOT EXISTS "club_posts_club_id_is_pinned_created_at_idx"
  ON "icehockey"."club_posts" ("club_id", "is_pinned", "created_at");
