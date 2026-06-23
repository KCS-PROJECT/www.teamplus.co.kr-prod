-- Phase 4B: clubs -> teams rename migration
-- 2026-04-29
-- IMPORTANT: RENAME only. NO DROP, NO ADD. Data is preserved.
--
-- NOTE on PostgreSQL PK rename behavior:
--   ALTER INDEX ... RENAME also renames the associated PK constraint automatically.
--   Therefore, PK constraints must NOT be renamed via ALTER TABLE RENAME CONSTRAINT
--   (they are handled implicitly by Section 5-1 index rename).
--   Only FK and NOT NULL constraints need explicit ALTER TABLE RENAME CONSTRAINT.

-- ============================================================
-- Section 1: 8개 테이블 RENAME
-- ============================================================
ALTER TABLE "icehockey"."clubs"                    RENAME TO "teams";
ALTER TABLE "icehockey"."club_members"             RENAME TO "team_members";
ALTER TABLE "icehockey"."club_posts"               RENAME TO "team_posts";
ALTER TABLE "icehockey"."club_post_comments"       RENAME TO "team_post_comments";
ALTER TABLE "icehockey"."club_post_likes"          RENAME TO "team_post_likes";
ALTER TABLE "icehockey"."club_post_attachments"    RENAME TO "team_post_attachments";
ALTER TABLE "icehockey"."club_events"              RENAME TO "team_events";
ALTER TABLE "icehockey"."club_event_registrations" RENAME TO "team_event_registrations";

-- ============================================================
-- Section 2: teams 본체 컬럼 rename
-- club_code -> team_code, club_name -> name
-- ============================================================
ALTER TABLE "icehockey"."teams" RENAME COLUMN "club_code" TO "team_code";
ALTER TABLE "icehockey"."teams" RENAME COLUMN "club_name" TO "name";

-- ============================================================
-- Section 3: rename된 자식 테이블의 club_id -> team_id
-- (post_comments / post_likes / post_attachments / event_registrations 는
--  post_id / event_id 만 보유하므로 변경 불필요)
-- ============================================================
ALTER TABLE "icehockey"."team_members" RENAME COLUMN "club_id" TO "team_id";
ALTER TABLE "icehockey"."team_posts"   RENAME COLUMN "club_id" TO "team_id";
ALTER TABLE "icehockey"."team_events"  RENAME COLUMN "club_id" TO "team_id";

-- ============================================================
-- Section 4: 외부 테이블 club_id -> team_id
-- NOTE: hockey_matches 의 home_club_id / away_club_id 는 보존 (레거시)
-- ============================================================
ALTER TABLE "icehockey"."academy_promotions"     RENAME COLUMN "club_id" TO "team_id";
ALTER TABLE "icehockey"."camps"                  RENAME COLUMN "club_id" TO "team_id";
ALTER TABLE "icehockey"."chat_rooms"             RENAME COLUMN "club_id" TO "team_id";
ALTER TABLE "icehockey"."class_diaries"          RENAME COLUMN "club_id" TO "team_id";
ALTER TABLE "icehockey"."classes"                RENAME COLUMN "club_id" TO "team_id";
ALTER TABLE "icehockey"."coach_profiles"         RENAME COLUMN "club_id" TO "team_id";
ALTER TABLE "icehockey"."daily_metrics"          RENAME COLUMN "club_id" TO "team_id";
ALTER TABLE "icehockey"."equipment_checklists"   RENAME COLUMN "club_id" TO "team_id";
ALTER TABLE "icehockey"."galleries"              RENAME COLUMN "club_id" TO "team_id";
ALTER TABLE "icehockey"."game_expenses"          RENAME COLUMN "club_id" TO "team_id";
ALTER TABLE "icehockey"."leagues"                RENAME COLUMN "club_id" TO "team_id";
ALTER TABLE "icehockey"."lesson_packages"        RENAME COLUMN "club_id" TO "team_id";
ALTER TABLE "icehockey"."overseas_trips"         RENAME COLUMN "club_id" TO "team_id";
ALTER TABLE "icehockey"."settlements"            RENAME COLUMN "club_id" TO "team_id";
ALTER TABLE "icehockey"."sticker_boards"         RENAME COLUMN "club_id" TO "team_id";
ALTER TABLE "icehockey"."tournaments"            RENAME COLUMN "club_id" TO "team_id";
ALTER TABLE "icehockey"."training_sessions"      RENAME COLUMN "club_id" TO "team_id";
ALTER TABLE "icehockey"."venue_bookings"         RENAME COLUMN "club_id" TO "team_id";
ALTER TABLE "icehockey"."venue_rental_contracts" RENAME COLUMN "club_id" TO "team_id";
ALTER TABLE "icehockey"."venue_rental_schedules" RENAME COLUMN "club_id" TO "team_id";
ALTER TABLE "icehockey"."venues"                 RENAME COLUMN "club_id" TO "team_id";
ALTER TABLE "icehockey"."videos"                 RENAME COLUMN "club_id" TO "team_id";
ALTER TABLE "icehockey"."work_schedules"         RENAME COLUMN "club_id" TO "team_id";

-- Section 4b: system_notices.target_club_id -> target_team_id
ALTER TABLE "icehockey"."system_notices" RENAME COLUMN "target_club_id" TO "target_team_id";

-- ============================================================
-- Section 5-1: 인덱스 이름 rename
-- PK 인덱스 rename 시 PK 제약조건 이름도 자동 변경됨 (PostgreSQL 동작)
-- ============================================================

-- teams (구 clubs) 본체 인덱스
ALTER INDEX "icehockey"."clubs_pkey"           RENAME TO "teams_pkey";
ALTER INDEX "icehockey"."clubs_club_code_key"  RENAME TO "teams_team_code_key";
ALTER INDEX "icehockey"."clubs_coach_id_idx"   RENAME TO "teams_coach_id_idx";
ALTER INDEX "icehockey"."clubs_is_active_idx"  RENAME TO "teams_is_active_idx";
ALTER INDEX "icehockey"."clubs_created_at_idx" RENAME TO "teams_created_at_idx";

-- team_members (구 club_members) 인덱스
ALTER INDEX "icehockey"."club_members_pkey"                          RENAME TO "team_members_pkey";
ALTER INDEX "icehockey"."club_members_club_id_idx"                   RENAME TO "team_members_team_id_idx";
ALTER INDEX "icehockey"."club_members_club_id_approval_status_idx"   RENAME TO "team_members_team_id_approval_status_idx";
ALTER INDEX "icehockey"."club_members_user_id_club_id_key"           RENAME TO "team_members_user_id_team_id_key";
ALTER INDEX "icehockey"."club_members_approval_status_idx"           RENAME TO "team_members_approval_status_idx";
ALTER INDEX "icehockey"."club_members_approval_status_joined_at_idx" RENAME TO "team_members_approval_status_joined_at_idx";
ALTER INDEX "icehockey"."club_members_joined_at_idx"                 RENAME TO "team_members_joined_at_idx";
ALTER INDEX "icehockey"."club_members_user_id_approval_status_idx"   RENAME TO "team_members_user_id_approval_status_idx";

-- team_posts (구 club_posts) 인덱스
ALTER INDEX "icehockey"."club_posts_pkey"                            RENAME TO "team_posts_pkey";
ALTER INDEX "icehockey"."club_posts_club_id_idx"                     RENAME TO "team_posts_team_id_idx";
ALTER INDEX "icehockey"."club_posts_club_id_is_pinned_created_at_idx" RENAME TO "team_posts_team_id_is_pinned_created_at_idx";
ALTER INDEX "icehockey"."club_posts_author_id_idx"                   RENAME TO "team_posts_author_id_idx";
ALTER INDEX "icehockey"."club_posts_is_active_idx"                   RENAME TO "team_posts_is_active_idx";
ALTER INDEX "icehockey"."club_posts_post_type_idx"                   RENAME TO "team_posts_post_type_idx";

-- team_post_comments (구 club_post_comments) 인덱스
ALTER INDEX "icehockey"."club_post_comments_pkey"          RENAME TO "team_post_comments_pkey";
ALTER INDEX "icehockey"."club_post_comments_post_id_idx"   RENAME TO "team_post_comments_post_id_idx";
ALTER INDEX "icehockey"."club_post_comments_author_id_idx" RENAME TO "team_post_comments_author_id_idx";

-- team_post_likes (구 club_post_likes) 인덱스
ALTER INDEX "icehockey"."club_post_likes_pkey"                RENAME TO "team_post_likes_pkey";
ALTER INDEX "icehockey"."club_post_likes_post_id_idx"         RENAME TO "team_post_likes_post_id_idx";
ALTER INDEX "icehockey"."club_post_likes_post_id_user_id_key" RENAME TO "team_post_likes_post_id_user_id_key";
ALTER INDEX "icehockey"."club_post_likes_user_id_idx"         RENAME TO "team_post_likes_user_id_idx";

-- team_post_attachments (구 club_post_attachments) 인덱스
ALTER INDEX "icehockey"."club_post_attachments_pkey"        RENAME TO "team_post_attachments_pkey";
ALTER INDEX "icehockey"."club_post_attachments_post_id_idx" RENAME TO "team_post_attachments_post_id_idx";

-- team_events (구 club_events) 인덱스
ALTER INDEX "icehockey"."club_events_pkey"           RENAME TO "team_events_pkey";
ALTER INDEX "icehockey"."club_events_club_id_idx"    RENAME TO "team_events_team_id_idx";
ALTER INDEX "icehockey"."club_events_end_at_idx"     RENAME TO "team_events_end_at_idx";
ALTER INDEX "icehockey"."club_events_event_type_idx" RENAME TO "team_events_event_type_idx";
ALTER INDEX "icehockey"."club_events_start_at_idx"   RENAME TO "team_events_start_at_idx";
ALTER INDEX "icehockey"."club_events_status_idx"     RENAME TO "team_events_status_idx";

-- team_event_registrations (구 club_event_registrations) 인덱스
ALTER INDEX "icehockey"."club_event_registrations_pkey"                   RENAME TO "team_event_registrations_pkey";
ALTER INDEX "icehockey"."club_event_registrations_event_id_idx"           RENAME TO "team_event_registrations_event_id_idx";
ALTER INDEX "icehockey"."club_event_registrations_event_id_member_id_key" RENAME TO "team_event_registrations_event_id_member_id_key";
ALTER INDEX "icehockey"."club_event_registrations_member_id_idx"          RENAME TO "team_event_registrations_member_id_idx";
ALTER INDEX "icehockey"."club_event_registrations_status_idx"             RENAME TO "team_event_registrations_status_idx";

-- 외부 테이블 club_id 관련 인덱스 rename
ALTER INDEX "icehockey"."camps_club_id_idx"                          RENAME TO "camps_team_id_idx";
ALTER INDEX "icehockey"."chat_rooms_club_id_idx"                     RENAME TO "chat_rooms_team_id_idx";
ALTER INDEX "icehockey"."class_diaries_club_id_session_date_idx"     RENAME TO "class_diaries_team_id_session_date_idx";
ALTER INDEX "icehockey"."classes_club_id_idx"                        RENAME TO "classes_team_id_idx";
ALTER INDEX "icehockey"."coach_profiles_club_id_idx"                 RENAME TO "coach_profiles_team_id_idx";
ALTER INDEX "icehockey"."daily_metrics_club_id_idx"                  RENAME TO "daily_metrics_team_id_idx";
ALTER INDEX "icehockey"."daily_metrics_club_id_metric_date_key"      RENAME TO "daily_metrics_team_id_metric_date_key";
ALTER INDEX "icehockey"."galleries_club_id_category_idx"             RENAME TO "galleries_team_id_category_idx";
ALTER INDEX "icehockey"."game_expenses_club_id_idx"                  RENAME TO "game_expenses_team_id_idx";
ALTER INDEX "icehockey"."leagues_club_id_idx"                        RENAME TO "leagues_team_id_idx";
ALTER INDEX "icehockey"."lesson_packages_club_id_idx"                RENAME TO "lesson_packages_team_id_idx";
ALTER INDEX "icehockey"."overseas_trips_club_id_idx"                 RENAME TO "overseas_trips_team_id_idx";
ALTER INDEX "icehockey"."settlements_club_id_idx"                    RENAME TO "settlements_team_id_idx";
ALTER INDEX "icehockey"."settlements_club_id_settlement_month_key"   RENAME TO "settlements_team_id_settlement_month_key";
ALTER INDEX "icehockey"."sticker_boards_club_id_idx"                 RENAME TO "sticker_boards_team_id_idx";
ALTER INDEX "icehockey"."system_notices_target_club_id_idx"          RENAME TO "system_notices_target_team_id_idx";
ALTER INDEX "icehockey"."tournaments_club_id_idx"                    RENAME TO "tournaments_team_id_idx";
ALTER INDEX "icehockey"."training_sessions_club_id_session_date_idx" RENAME TO "training_sessions_team_id_session_date_idx";
ALTER INDEX "icehockey"."venue_bookings_club_id_idx"                 RENAME TO "venue_bookings_team_id_idx";
ALTER INDEX "icehockey"."venue_rental_contracts_club_id_idx"         RENAME TO "venue_rental_contracts_team_id_idx";
ALTER INDEX "icehockey"."venue_rental_schedules_club_id_idx"         RENAME TO "venue_rental_schedules_team_id_idx";
ALTER INDEX "icehockey"."venues_club_id_idx"                         RENAME TO "venues_team_id_idx";
ALTER INDEX "icehockey"."videos_club_id_idx"                         RENAME TO "videos_team_id_idx";
ALTER INDEX "icehockey"."work_schedules_club_id_schedule_date_idx"   RENAME TO "work_schedules_team_id_schedule_date_idx";

-- ============================================================
-- Section 5-2: FK / NOT NULL 제약조건 이름 rename
-- PK 제약조건은 Section 5-1 ALTER INDEX 에서 자동 처리되므로 제외
-- home_club_id / away_club_id FK 는 제외 (레거시 보존)
-- ============================================================

-- teams (구 clubs) FK + NOT NULL 제약조건
ALTER TABLE "icehockey"."teams" RENAME CONSTRAINT "clubs_coach_id_fkey"                  TO "teams_coach_id_fkey";
ALTER TABLE "icehockey"."teams" RENAME CONSTRAINT "clubs_club_code_not_null"              TO "teams_team_code_not_null";
ALTER TABLE "icehockey"."teams" RENAME CONSTRAINT "clubs_club_name_not_null"              TO "teams_name_not_null";
ALTER TABLE "icehockey"."teams" RENAME CONSTRAINT "clubs_coach_id_not_null"               TO "teams_coach_id_not_null";
ALTER TABLE "icehockey"."teams" RENAME CONSTRAINT "clubs_created_at_not_null"             TO "teams_created_at_not_null";
ALTER TABLE "icehockey"."teams" RENAME CONSTRAINT "clubs_default_billing_timing_not_null" TO "teams_default_billing_timing_not_null";
ALTER TABLE "icehockey"."teams" RENAME CONSTRAINT "clubs_id_not_null"                     TO "teams_id_not_null";
ALTER TABLE "icehockey"."teams" RENAME CONSTRAINT "clubs_is_active_not_null"              TO "teams_is_active_not_null";
ALTER TABLE "icehockey"."teams" RENAME CONSTRAINT "clubs_updated_at_not_null"             TO "teams_updated_at_not_null";

-- team_members FK + NOT NULL 제약조건
ALTER TABLE "icehockey"."team_members" RENAME CONSTRAINT "club_members_club_id_fkey"             TO "team_members_team_id_fkey";
ALTER TABLE "icehockey"."team_members" RENAME CONSTRAINT "club_members_user_id_fkey"             TO "team_members_user_id_fkey";
ALTER TABLE "icehockey"."team_members" RENAME CONSTRAINT "club_members_approval_status_not_null" TO "team_members_approval_status_not_null";
ALTER TABLE "icehockey"."team_members" RENAME CONSTRAINT "club_members_club_id_not_null"         TO "team_members_team_id_not_null";
ALTER TABLE "icehockey"."team_members" RENAME CONSTRAINT "club_members_created_at_not_null"      TO "team_members_created_at_not_null";
ALTER TABLE "icehockey"."team_members" RENAME CONSTRAINT "club_members_id_not_null"              TO "team_members_id_not_null";
ALTER TABLE "icehockey"."team_members" RENAME CONSTRAINT "club_members_joined_at_not_null"       TO "team_members_joined_at_not_null";
ALTER TABLE "icehockey"."team_members" RENAME CONSTRAINT "club_members_player_age_not_null"      TO "team_members_player_age_not_null";
ALTER TABLE "icehockey"."team_members" RENAME CONSTRAINT "club_members_player_name_not_null"     TO "team_members_player_name_not_null";
ALTER TABLE "icehockey"."team_members" RENAME CONSTRAINT "club_members_updated_at_not_null"      TO "team_members_updated_at_not_null";

-- team_posts FK + NOT NULL 제약조건
ALTER TABLE "icehockey"."team_posts" RENAME CONSTRAINT "club_posts_author_id_fkey"        TO "team_posts_author_id_fkey";
ALTER TABLE "icehockey"."team_posts" RENAME CONSTRAINT "club_posts_club_id_fkey"          TO "team_posts_team_id_fkey";
ALTER TABLE "icehockey"."team_posts" RENAME CONSTRAINT "club_posts_author_id_not_null"    TO "team_posts_author_id_not_null";
ALTER TABLE "icehockey"."team_posts" RENAME CONSTRAINT "club_posts_club_id_not_null"      TO "team_posts_team_id_not_null";
ALTER TABLE "icehockey"."team_posts" RENAME CONSTRAINT "club_posts_comment_count_not_null" TO "team_posts_comment_count_not_null";
ALTER TABLE "icehockey"."team_posts" RENAME CONSTRAINT "club_posts_content_not_null"      TO "team_posts_content_not_null";
ALTER TABLE "icehockey"."team_posts" RENAME CONSTRAINT "club_posts_created_at_not_null"   TO "team_posts_created_at_not_null";
ALTER TABLE "icehockey"."team_posts" RENAME CONSTRAINT "club_posts_id_not_null"           TO "team_posts_id_not_null";
ALTER TABLE "icehockey"."team_posts" RENAME CONSTRAINT "club_posts_is_active_not_null"    TO "team_posts_is_active_not_null";
ALTER TABLE "icehockey"."team_posts" RENAME CONSTRAINT "club_posts_is_pinned_not_null"    TO "team_posts_is_pinned_not_null";
ALTER TABLE "icehockey"."team_posts" RENAME CONSTRAINT "club_posts_like_count_not_null"   TO "team_posts_like_count_not_null";
ALTER TABLE "icehockey"."team_posts" RENAME CONSTRAINT "club_posts_post_type_not_null"    TO "team_posts_post_type_not_null";
ALTER TABLE "icehockey"."team_posts" RENAME CONSTRAINT "club_posts_title_not_null"        TO "team_posts_title_not_null";
ALTER TABLE "icehockey"."team_posts" RENAME CONSTRAINT "club_posts_updated_at_not_null"   TO "team_posts_updated_at_not_null";
ALTER TABLE "icehockey"."team_posts" RENAME CONSTRAINT "club_posts_view_count_not_null"   TO "team_posts_view_count_not_null";

-- team_post_comments FK + NOT NULL 제약조건
ALTER TABLE "icehockey"."team_post_comments" RENAME CONSTRAINT "club_post_comments_author_id_fkey"      TO "team_post_comments_author_id_fkey";
ALTER TABLE "icehockey"."team_post_comments" RENAME CONSTRAINT "club_post_comments_post_id_fkey"        TO "team_post_comments_post_id_fkey";
ALTER TABLE "icehockey"."team_post_comments" RENAME CONSTRAINT "club_post_comments_author_id_not_null"  TO "team_post_comments_author_id_not_null";
ALTER TABLE "icehockey"."team_post_comments" RENAME CONSTRAINT "club_post_comments_content_not_null"    TO "team_post_comments_content_not_null";
ALTER TABLE "icehockey"."team_post_comments" RENAME CONSTRAINT "club_post_comments_created_at_not_null" TO "team_post_comments_created_at_not_null";
ALTER TABLE "icehockey"."team_post_comments" RENAME CONSTRAINT "club_post_comments_id_not_null"         TO "team_post_comments_id_not_null";
ALTER TABLE "icehockey"."team_post_comments" RENAME CONSTRAINT "club_post_comments_post_id_not_null"    TO "team_post_comments_post_id_not_null";
ALTER TABLE "icehockey"."team_post_comments" RENAME CONSTRAINT "club_post_comments_updated_at_not_null" TO "team_post_comments_updated_at_not_null";

-- team_post_likes FK + NOT NULL 제약조건
ALTER TABLE "icehockey"."team_post_likes" RENAME CONSTRAINT "club_post_likes_post_id_fkey"       TO "team_post_likes_post_id_fkey";
ALTER TABLE "icehockey"."team_post_likes" RENAME CONSTRAINT "club_post_likes_user_id_fkey"       TO "team_post_likes_user_id_fkey";
ALTER TABLE "icehockey"."team_post_likes" RENAME CONSTRAINT "club_post_likes_created_at_not_null" TO "team_post_likes_created_at_not_null";
ALTER TABLE "icehockey"."team_post_likes" RENAME CONSTRAINT "club_post_likes_id_not_null"        TO "team_post_likes_id_not_null";
ALTER TABLE "icehockey"."team_post_likes" RENAME CONSTRAINT "club_post_likes_post_id_not_null"   TO "team_post_likes_post_id_not_null";
ALTER TABLE "icehockey"."team_post_likes" RENAME CONSTRAINT "club_post_likes_user_id_not_null"   TO "team_post_likes_user_id_not_null";

-- team_post_attachments FK + NOT NULL 제약조건
ALTER TABLE "icehockey"."team_post_attachments" RENAME CONSTRAINT "club_post_attachments_post_id_fkey"           TO "team_post_attachments_post_id_fkey";
ALTER TABLE "icehockey"."team_post_attachments" RENAME CONSTRAINT "club_post_attachments_created_at_not_null"    TO "team_post_attachments_created_at_not_null";
ALTER TABLE "icehockey"."team_post_attachments" RENAME CONSTRAINT "club_post_attachments_display_order_not_null" TO "team_post_attachments_display_order_not_null";
ALTER TABLE "icehockey"."team_post_attachments" RENAME CONSTRAINT "club_post_attachments_file_name_not_null"     TO "team_post_attachments_file_name_not_null";
ALTER TABLE "icehockey"."team_post_attachments" RENAME CONSTRAINT "club_post_attachments_file_size_not_null"     TO "team_post_attachments_file_size_not_null";
ALTER TABLE "icehockey"."team_post_attachments" RENAME CONSTRAINT "club_post_attachments_file_type_not_null"     TO "team_post_attachments_file_type_not_null";
ALTER TABLE "icehockey"."team_post_attachments" RENAME CONSTRAINT "club_post_attachments_file_url_not_null"      TO "team_post_attachments_file_url_not_null";
ALTER TABLE "icehockey"."team_post_attachments" RENAME CONSTRAINT "club_post_attachments_id_not_null"            TO "team_post_attachments_id_not_null";
ALTER TABLE "icehockey"."team_post_attachments" RENAME CONSTRAINT "club_post_attachments_post_id_not_null"       TO "team_post_attachments_post_id_not_null";

-- team_events FK + NOT NULL 제약조건
ALTER TABLE "icehockey"."team_events" RENAME CONSTRAINT "club_events_club_id_fkey"         TO "team_events_team_id_fkey";
ALTER TABLE "icehockey"."team_events" RENAME CONSTRAINT "club_events_club_id_not_null"     TO "team_events_team_id_not_null";
ALTER TABLE "icehockey"."team_events" RENAME CONSTRAINT "club_events_created_at_not_null"  TO "team_events_created_at_not_null";
ALTER TABLE "icehockey"."team_events" RENAME CONSTRAINT "club_events_end_at_not_null"      TO "team_events_end_at_not_null";
ALTER TABLE "icehockey"."team_events" RENAME CONSTRAINT "club_events_event_type_not_null"  TO "team_events_event_type_not_null";
ALTER TABLE "icehockey"."team_events" RENAME CONSTRAINT "club_events_id_not_null"          TO "team_events_id_not_null";
ALTER TABLE "icehockey"."team_events" RENAME CONSTRAINT "club_events_price_mode_not_null"  TO "team_events_price_mode_not_null";
ALTER TABLE "icehockey"."team_events" RENAME CONSTRAINT "club_events_start_at_not_null"    TO "team_events_start_at_not_null";
ALTER TABLE "icehockey"."team_events" RENAME CONSTRAINT "club_events_status_not_null"      TO "team_events_status_not_null";
ALTER TABLE "icehockey"."team_events" RENAME CONSTRAINT "club_events_title_not_null"       TO "team_events_title_not_null";
ALTER TABLE "icehockey"."team_events" RENAME CONSTRAINT "club_events_updated_at_not_null"  TO "team_events_updated_at_not_null";

-- team_event_registrations FK + NOT NULL 제약조건
ALTER TABLE "icehockey"."team_event_registrations" RENAME CONSTRAINT "club_event_registrations_event_id_fkey"       TO "team_event_registrations_event_id_fkey";
ALTER TABLE "icehockey"."team_event_registrations" RENAME CONSTRAINT "club_event_registrations_member_id_fkey"      TO "team_event_registrations_member_id_fkey";
ALTER TABLE "icehockey"."team_event_registrations" RENAME CONSTRAINT "club_event_registrations_payment_id_fkey"     TO "team_event_registrations_payment_id_fkey";
ALTER TABLE "icehockey"."team_event_registrations" RENAME CONSTRAINT "club_event_registrations_created_at_not_null" TO "team_event_registrations_created_at_not_null";
ALTER TABLE "icehockey"."team_event_registrations" RENAME CONSTRAINT "club_event_registrations_event_id_not_null"   TO "team_event_registrations_event_id_not_null";
ALTER TABLE "icehockey"."team_event_registrations" RENAME CONSTRAINT "club_event_registrations_id_not_null"         TO "team_event_registrations_id_not_null";
ALTER TABLE "icehockey"."team_event_registrations" RENAME CONSTRAINT "club_event_registrations_member_id_not_null"  TO "team_event_registrations_member_id_not_null";
ALTER TABLE "icehockey"."team_event_registrations" RENAME CONSTRAINT "club_event_registrations_paid_not_null"       TO "team_event_registrations_paid_not_null";
ALTER TABLE "icehockey"."team_event_registrations" RENAME CONSTRAINT "club_event_registrations_status_not_null"     TO "team_event_registrations_status_not_null";

-- 외부 테이블 club_id FK + NOT NULL 제약조건 rename
ALTER TABLE "icehockey"."academy_promotions"     RENAME CONSTRAINT "academy_promotions_club_id_fkey"         TO "academy_promotions_team_id_fkey";
ALTER TABLE "icehockey"."camps"                  RENAME CONSTRAINT "camps_club_id_fkey"                      TO "camps_team_id_fkey";
ALTER TABLE "icehockey"."camps"                  RENAME CONSTRAINT "camps_club_id_not_null"                  TO "camps_team_id_not_null";
ALTER TABLE "icehockey"."class_diaries"          RENAME CONSTRAINT "class_diaries_club_id_fkey"              TO "class_diaries_team_id_fkey";
ALTER TABLE "icehockey"."class_diaries"          RENAME CONSTRAINT "class_diaries_club_id_not_null"          TO "class_diaries_team_id_not_null";
ALTER TABLE "icehockey"."classes"                RENAME CONSTRAINT "classes_club_id_fkey"                    TO "classes_team_id_fkey";
ALTER TABLE "icehockey"."coach_profiles"         RENAME CONSTRAINT "coach_profiles_club_id_fkey"             TO "coach_profiles_team_id_fkey";
ALTER TABLE "icehockey"."daily_metrics"          RENAME CONSTRAINT "daily_metrics_club_id_not_null"          TO "daily_metrics_team_id_not_null";
ALTER TABLE "icehockey"."galleries"              RENAME CONSTRAINT "galleries_club_id_fkey"                  TO "galleries_team_id_fkey";
ALTER TABLE "icehockey"."game_expenses"          RENAME CONSTRAINT "game_expenses_club_id_fkey"              TO "game_expenses_team_id_fkey";
ALTER TABLE "icehockey"."game_expenses"          RENAME CONSTRAINT "game_expenses_club_id_not_null"          TO "game_expenses_team_id_not_null";
ALTER TABLE "icehockey"."leagues"                RENAME CONSTRAINT "leagues_club_id_fkey"                    TO "leagues_team_id_fkey";
ALTER TABLE "icehockey"."lesson_packages"        RENAME CONSTRAINT "lesson_packages_club_id_fkey"            TO "lesson_packages_team_id_fkey";
ALTER TABLE "icehockey"."overseas_trips"         RENAME CONSTRAINT "overseas_trips_club_id_fkey"             TO "overseas_trips_team_id_fkey";
ALTER TABLE "icehockey"."overseas_trips"         RENAME CONSTRAINT "overseas_trips_club_id_not_null"         TO "overseas_trips_team_id_not_null";
ALTER TABLE "icehockey"."settlements"            RENAME CONSTRAINT "settlements_club_id_fkey"                TO "settlements_team_id_fkey";
ALTER TABLE "icehockey"."settlements"            RENAME CONSTRAINT "settlements_club_id_not_null"            TO "settlements_team_id_not_null";
ALTER TABLE "icehockey"."sticker_boards"         RENAME CONSTRAINT "sticker_boards_club_id_fkey"             TO "sticker_boards_team_id_fkey";
ALTER TABLE "icehockey"."sticker_boards"         RENAME CONSTRAINT "sticker_boards_club_id_not_null"         TO "sticker_boards_team_id_not_null";
ALTER TABLE "icehockey"."tournaments"            RENAME CONSTRAINT "tournaments_club_id_fkey"                TO "tournaments_team_id_fkey";
ALTER TABLE "icehockey"."training_sessions"      RENAME CONSTRAINT "training_sessions_club_id_fkey"          TO "training_sessions_team_id_fkey";
ALTER TABLE "icehockey"."training_sessions"      RENAME CONSTRAINT "training_sessions_club_id_not_null"      TO "training_sessions_team_id_not_null";
ALTER TABLE "icehockey"."venue_bookings"         RENAME CONSTRAINT "venue_bookings_club_id_fkey"             TO "venue_bookings_team_id_fkey";
ALTER TABLE "icehockey"."venue_rental_contracts" RENAME CONSTRAINT "venue_rental_contracts_club_id_fkey"     TO "venue_rental_contracts_team_id_fkey";
ALTER TABLE "icehockey"."venue_rental_contracts" RENAME CONSTRAINT "venue_rental_contracts_club_id_not_null" TO "venue_rental_contracts_team_id_not_null";
ALTER TABLE "icehockey"."venue_rental_schedules" RENAME CONSTRAINT "venue_rental_schedules_club_id_fkey"     TO "venue_rental_schedules_team_id_fkey";
ALTER TABLE "icehockey"."venue_rental_schedules" RENAME CONSTRAINT "venue_rental_schedules_club_id_not_null" TO "venue_rental_schedules_team_id_not_null";
ALTER TABLE "icehockey"."venues"                 RENAME CONSTRAINT "venues_club_id_fkey"                     TO "venues_team_id_fkey";
ALTER TABLE "icehockey"."videos"                 RENAME CONSTRAINT "videos_club_id_fkey"                     TO "videos_team_id_fkey";
ALTER TABLE "icehockey"."work_schedules"         RENAME CONSTRAINT "work_schedules_club_id_fkey"             TO "work_schedules_team_id_fkey";
ALTER TABLE "icehockey"."work_schedules"         RENAME CONSTRAINT "work_schedules_club_id_not_null"         TO "work_schedules_team_id_not_null";
