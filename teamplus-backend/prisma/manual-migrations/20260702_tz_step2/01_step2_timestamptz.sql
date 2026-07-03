-- Step 2: A group (absolute-instant) columns -> timestamptz(3)
-- Rule per column: value was stored by Prisma as UTC instant; reinterpret as UTC (no shift), preserve epoch.
-- Generated from information_schema (timestamp without time zone) filtered by schema classification (A only; B/C/@db.Date excluded).
-- One transaction per table.

SET search_path TO icehockey;

BEGIN;
ALTER TABLE icehockey."academies" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."academies" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."academy_coaches" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."academy_coaches" ALTER COLUMN "joined_at" TYPE timestamptz(3) USING "joined_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."academy_coaches" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."academy_members" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."academy_members" ALTER COLUMN "joined_at" TYPE timestamptz(3) USING "joined_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."academy_members" ALTER COLUMN "left_at" TYPE timestamptz(3) USING "left_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."academy_members" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."academy_promotions" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."academy_promotions" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."alimtalk_logs" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."alimtalk_logs" ALTER COLUMN "sent_at" TYPE timestamptz(3) USING "sent_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."alimtalk_templates" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."alimtalk_templates" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."app_banners" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."app_banners" ALTER COLUMN "end_at" TYPE timestamptz(3) USING "end_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."app_banners" ALTER COLUMN "start_at" TYPE timestamptz(3) USING "start_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."app_banners" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."app_faqs" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."app_faqs" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."app_feedbacks" ALTER COLUMN "admin_reply_at" TYPE timestamptz(3) USING "admin_reply_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."app_feedbacks" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."app_feedbacks" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."app_menus" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."app_menus" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."app_premium_events" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."app_premium_events" ALTER COLUMN "end_at" TYPE timestamptz(3) USING "end_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."app_premium_events" ALTER COLUMN "start_at" TYPE timestamptz(3) USING "start_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."app_premium_events" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."app_settings" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."app_settings" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."app_terms" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."app_terms" ALTER COLUMN "published_at" TYPE timestamptz(3) USING "published_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."app_terms" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."app_versions" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."attendance_audit_logs" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."attendance_audit_logs" ALTER COLUMN "notified_at" TYPE timestamptz(3) USING "notified_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."attendance_qr_codes" ALTER COLUMN "expires_at" TYPE timestamptz(3) USING "expires_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."attendance_qr_codes" ALTER COLUMN "generated_at" TYPE timestamptz(3) USING "generated_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."attendance_qr_codes" ALTER COLUMN "scanned_at" TYPE timestamptz(3) USING "scanned_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."audit_logs" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."badges" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."camp_registrations" ALTER COLUMN "applied_at" TYPE timestamptz(3) USING "applied_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."camp_registrations" ALTER COLUMN "responded_at" TYPE timestamptz(3) USING "responded_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."camps" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."camps" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."chat_messages" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."chat_messages" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."chat_room_members" ALTER COLUMN "joined_at" TYPE timestamptz(3) USING "joined_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."chat_room_members" ALTER COLUMN "last_read_at" TYPE timestamptz(3) USING "last_read_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."chat_room_members" ALTER COLUMN "left_at" TYPE timestamptz(3) USING "left_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."chat_rooms" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."chat_rooms" ALTER COLUMN "last_message_at" TYPE timestamptz(3) USING "last_message_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."chat_rooms" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."checklist_items" ALTER COLUMN "checked_at" TYPE timestamptz(3) USING "checked_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."checklist_items" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."child_badges" ALTER COLUMN "earned_at" TYPE timestamptz(3) USING "earned_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."child_consents" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."child_consents" ALTER COLUMN "revoked_at" TYPE timestamptz(3) USING "revoked_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."child_consents" ALTER COLUMN "signed_at" TYPE timestamptz(3) USING "signed_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."child_consents" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."child_pins" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."child_pins" ALTER COLUMN "last_verified_at" TYPE timestamptz(3) USING "last_verified_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."child_pins" ALTER COLUMN "locked_until" TYPE timestamptz(3) USING "locked_until" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."child_pins" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."child_profiles" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."child_profiles" ALTER COLUMN "last_evaluated_at" TYPE timestamptz(3) USING "last_evaluated_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."child_profiles" ALTER COLUMN "pin_verified_until" TYPE timestamptz(3) USING "pin_verified_until" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."class_attendances" ALTER COLUMN "checked_in_at" TYPE timestamptz(3) USING "checked_in_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."class_attendances" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."class_attendances" ALTER COLUMN "modified_at" TYPE timestamptz(3) USING "modified_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."class_attendances" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."class_coach_assignments" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."class_coach_assignments" ALTER COLUMN "invited_at" TYPE timestamptz(3) USING "invited_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."class_coach_assignments" ALTER COLUMN "responded_at" TYPE timestamptz(3) USING "responded_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."class_coach_assignments" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."class_day_schedules" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."class_day_schedules" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."class_diaries" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."class_diaries" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."class_products" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."class_products" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."class_registrations" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."class_registrations" ALTER COLUMN "registration_date" TYPE timestamptz(3) USING "registration_date" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."class_registrations" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."class_reviews" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."class_reviews" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."class_rsvps" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."class_rsvps" ALTER COLUMN "responded_at" TYPE timestamptz(3) USING "responded_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."class_rsvps" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."class_schedules" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."class_schedules" ALTER COLUMN "rsvp_deadline" TYPE timestamptz(3) USING "rsvp_deadline" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."class_schedules" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."class_team_visibilities" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."classes" ALTER COLUMN "approved_at" TYPE timestamptz(3) USING "approved_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."classes" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."classes" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."coach_profiles" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."common_code_groups" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."common_code_groups" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."common_codes" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."common_codes" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."consultations" ALTER COLUMN "closed_at" TYPE timestamptz(3) USING "closed_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."consultations" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."consultations" ALTER COLUMN "last_message_at" TYPE timestamptz(3) USING "last_message_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."consultations" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."contact_inquiries" ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."contact_inquiries" ALTER COLUMN "deletedAt" TYPE timestamptz(3) USING "deletedAt" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."contact_inquiries" ALTER COLUMN "updatedAt" TYPE timestamptz(3) USING "updatedAt" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."coupons" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."coupons" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."credit_transactions" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."credit_transactions" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."daily_metrics" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."daily_metrics" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."daily_view_logs" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."data_export_requests" ALTER COLUMN "expires_at" TYPE timestamptz(3) USING "expires_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."data_export_requests" ALTER COLUMN "ready_at" TYPE timestamptz(3) USING "ready_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."data_export_requests" ALTER COLUMN "requested_at" TYPE timestamptz(3) USING "requested_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."divisions" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."divisions" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."enrollments" ALTER COLUMN "approved_at" TYPE timestamptz(3) USING "approved_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."enrollments" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."enrollments" ALTER COLUMN "expires_at" TYPE timestamptz(3) USING "expires_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."enrollments" ALTER COLUMN "paid_at" TYPE timestamptz(3) USING "paid_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."enrollments" ALTER COLUMN "rejected_at" TYPE timestamptz(3) USING "rejected_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."enrollments" ALTER COLUMN "requested_at" TYPE timestamptz(3) USING "requested_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."enrollments" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."equipment_checklists" ALTER COLUMN "completed_at" TYPE timestamptz(3) USING "completed_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."equipment_checklists" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."equipment_checklists" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."equipment_inspections" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."equipment_inspections" ALTER COLUMN "inspected_at" TYPE timestamptz(3) USING "inspected_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."equipment_inspections" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."galleries" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."galleries" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."gallery_photos" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."gallery_photos" ALTER COLUMN "taken_at" TYPE timestamptz(3) USING "taken_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."gallery_photos" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."game_expenses" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."game_expenses" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."hockey_matches" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."hockey_matches" ALTER COLUMN "ended_at" TYPE timestamptz(3) USING "ended_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."hockey_matches" ALTER COLUMN "scheduled_at" TYPE timestamptz(3) USING "scheduled_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."hockey_matches" ALTER COLUMN "started_at" TYPE timestamptz(3) USING "started_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."hockey_matches" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."identity_verifications" ALTER COLUMN "expires_at" TYPE timestamptz(3) USING "expires_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."identity_verifications" ALTER COLUMN "requested_at" TYPE timestamptz(3) USING "requested_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."identity_verifications" ALTER COLUMN "verified_at" TYPE timestamptz(3) USING "verified_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."identity_webhook_logs" ALTER COLUMN "processed_at" TYPE timestamptz(3) USING "processed_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."inspection_items" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."leagues" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."leagues" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."lesson_package_enrollments" ALTER COLUMN "completed_at" TYPE timestamptz(3) USING "completed_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."lesson_package_enrollments" ALTER COLUMN "enrolled_at" TYPE timestamptz(3) USING "enrolled_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."lesson_packages" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."lesson_packages" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."liability_waivers" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."liability_waivers" ALTER COLUMN "signed_at" TYPE timestamptz(3) USING "signed_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."match_events" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."match_periods" ALTER COLUMN "ended_at" TYPE timestamptz(3) USING "ended_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."match_periods" ALTER COLUMN "started_at" TYPE timestamptz(3) USING "started_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."member_approval_logs" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."member_credits" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."member_credits" ALTER COLUMN "expires_at" TYPE timestamptz(3) USING "expires_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."member_credits" ALTER COLUMN "issued_date" TYPE timestamptz(3) USING "issued_date" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."member_credits" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."member_level_histories" ALTER COLUMN "changed_at" TYPE timestamptz(3) USING "changed_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."member_levels" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."member_levels" ALTER COLUMN "level_updated_at" TYPE timestamptz(3) USING "level_updated_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."member_levels" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."monthly_postpaid_billing_lines" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."monthly_postpaid_billing_lines" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."monthly_postpaid_billings" ALTER COLUMN "confirmed_at" TYPE timestamptz(3) USING "confirmed_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."monthly_postpaid_billings" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."monthly_postpaid_billings" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."notice_comments" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."notice_comments" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."notice_reads" ALTER COLUMN "read_at" TYPE timestamptz(3) USING "read_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."notification_templates" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."notification_templates" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."notifications" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."notifications" ALTER COLUMN "read_at" TYPE timestamptz(3) USING "read_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."overseas_trip_registrations" ALTER COLUMN "cancelled_at" TYPE timestamptz(3) USING "cancelled_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."overseas_trip_registrations" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."overseas_trip_registrations" ALTER COLUMN "deposit_paid_at" TYPE timestamptz(3) USING "deposit_paid_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."overseas_trip_registrations" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."overseas_trips" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."overseas_trips" ALTER COLUMN "deposit_deadline" TYPE timestamptz(3) USING "deposit_deadline" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."overseas_trips" ALTER COLUMN "registration_deadline" TYPE timestamptz(3) USING "registration_deadline" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."overseas_trips" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."parent_children" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."parent_children" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."parent_profiles" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."payment_receipts" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."payment_receipts" ALTER COLUMN "issued_at" TYPE timestamptz(3) USING "issued_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."payment_receipts" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."payment_webhooks" ALTER COLUMN "completed_at" TYPE timestamptz(3) USING "completed_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."payment_webhooks" ALTER COLUMN "next_retry_at" TYPE timestamptz(3) USING "next_retry_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."payment_webhooks" ALTER COLUMN "processed_at" TYPE timestamptz(3) USING "processed_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."payments" ALTER COLUMN "completed_at" TYPE timestamptz(3) USING "completed_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."payments" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."payments" ALTER COLUMN "deleted_at" TYPE timestamptz(3) USING "deleted_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."payments" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."pickup_match_applicants" ALTER COLUMN "applied_at" TYPE timestamptz(3) USING "applied_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."pickup_match_applicants" ALTER COLUMN "refunded_at" TYPE timestamptz(3) USING "refunded_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."pickup_match_applicants" ALTER COLUMN "rejected_at" TYPE timestamptz(3) USING "rejected_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."pickup_match_applicants" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."pickup_matches" ALTER COLUMN "cancelled_at" TYPE timestamptz(3) USING "cancelled_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."pickup_matches" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."pickup_matches" ALTER COLUMN "scheduled_at" TYPE timestamptz(3) USING "scheduled_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."pickup_matches" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."player_awards" ALTER COLUMN "awarded_at" TYPE timestamptz(3) USING "awarded_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."player_awards" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."player_careers" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."player_careers" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."player_class_histories" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."player_class_histories" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."player_skill_levels" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."player_skill_levels" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."point_transactions" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."point_transactions" ALTER COLUMN "expires_at" TYPE timestamptz(3) USING "expires_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."push_notification_logs" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."push_notification_logs" ALTER COLUMN "sent_at" TYPE timestamptz(3) USING "sent_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."push_notification_logs" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."refund_logs" ALTER COLUMN "processed_at" TYPE timestamptz(3) USING "processed_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."rinks" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."rinks" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."schedule_swap_requests" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."schedule_swap_requests" ALTER COLUMN "responded_at" TYPE timestamptz(3) USING "responded_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."schedule_swap_requests" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."settlement_details" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."settlement_details" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."settlement_transactions" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."settlements" ALTER COLUMN "completed_at" TYPE timestamptz(3) USING "completed_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."settlements" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."settlements" ALTER COLUMN "manager_approval_at" TYPE timestamptz(3) USING "manager_approval_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."settlements" ALTER COLUMN "scheduled_at" TYPE timestamptz(3) USING "scheduled_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."settlements" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."shipping_policies" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."shipping_policies" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."shop_cart_items" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."shop_cart_items" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."shop_carts" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."shop_carts" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."shop_categories" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."shop_categories" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."shop_order_items" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."shop_orders" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."shop_orders" ALTER COLUMN "deleted_at" TYPE timestamptz(3) USING "deleted_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."shop_orders" ALTER COLUMN "delivered_at" TYPE timestamptz(3) USING "delivered_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."shop_orders" ALTER COLUMN "shipped_at" TYPE timestamptz(3) USING "shipped_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."shop_orders" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."shop_product_images" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."shop_product_options" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."shop_products" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."shop_products" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."shop_reviews" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."shop_reviews" ALTER COLUMN "replied_at" TYPE timestamptz(3) USING "replied_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."shop_reviews" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."shop_shipping_companies" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."shop_shippings" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."shop_shippings" ALTER COLUMN "delivered_at" TYPE timestamptz(3) USING "delivered_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."shop_shippings" ALTER COLUMN "shipped_at" TYPE timestamptz(3) USING "shipped_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."shop_shippings" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."shop_wishlists" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."skill_evaluations" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."skill_evaluations" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."social_accounts" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."staff_careers" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."staff_careers" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."sticker_boards" ALTER COLUMN "completed_at" TYPE timestamptz(3) USING "completed_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."sticker_boards" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."sticker_boards" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."sticker_slots" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."sticker_slots" ALTER COLUMN "earned_at" TYPE timestamptz(3) USING "earned_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."system_notices" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."system_notices" ALTER COLUMN "expires_at" TYPE timestamptz(3) USING "expires_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."system_notices" ALTER COLUMN "start_at" TYPE timestamptz(3) USING "start_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."team_awards" ALTER COLUMN "awarded_at" TYPE timestamptz(3) USING "awarded_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."team_awards" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."team_divisions" ALTER COLUMN "registered_at" TYPE timestamptz(3) USING "registered_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."team_event_registrations" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."team_events" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."team_events" ALTER COLUMN "end_at" TYPE timestamptz(3) USING "end_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."team_events" ALTER COLUMN "start_at" TYPE timestamptz(3) USING "start_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."team_events" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."team_group_members" ALTER COLUMN "joined_at" TYPE timestamptz(3) USING "joined_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."team_group_members" ALTER COLUMN "left_at" TYPE timestamptz(3) USING "left_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."team_groups" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."team_groups" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."team_members" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."team_members" ALTER COLUMN "joined_at" TYPE timestamptz(3) USING "joined_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."team_members" ALTER COLUMN "left_at" TYPE timestamptz(3) USING "left_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."team_members" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."team_post_attachments" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."team_post_comments" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."team_post_comments" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."team_post_likes" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."team_posts" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."team_posts" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."teams" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."teams" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."tms_attachments" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."tms_comments" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."tms_posts" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."tms_posts" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."tournament_matches" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."tournament_matches" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."tournament_registrations" ALTER COLUMN "cancelled_at" TYPE timestamptz(3) USING "cancelled_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."tournament_registrations" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."tournament_registrations" ALTER COLUMN "registered_at" TYPE timestamptz(3) USING "registered_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."tournament_registrations" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."tournaments" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."tournaments" ALTER COLUMN "registration_deadline" TYPE timestamptz(3) USING "registration_deadline" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."tournaments" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."training_metrics" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."training_sessions" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."training_sessions" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."transaction_logs" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."transaction_logs" ALTER COLUMN "occurred_at" TYPE timestamptz(3) USING "occurred_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."two_factor_secrets" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."two_factor_secrets" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."uploaded_files" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."uploaded_files" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."user_activity_logs" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."user_blocks" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."user_coupons" ALTER COLUMN "issued_at" TYPE timestamptz(3) USING "issued_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."user_coupons" ALTER COLUMN "used_at" TYPE timestamptz(3) USING "used_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."user_devices" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."user_devices" ALTER COLUMN "last_seen_at" TYPE timestamptz(3) USING "last_seen_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."user_devices" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."user_notification_preferences" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."user_notification_preferences" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."user_reports" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."user_reports" ALTER COLUMN "resolved_at" TYPE timestamptz(3) USING "resolved_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."user_reports" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."users" ALTER COLUMN "agreed_at" TYPE timestamptz(3) USING "agreed_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."users" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."users" ALTER COLUMN "deleted_at" TYPE timestamptz(3) USING "deleted_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."users" ALTER COLUMN "dormant_at" TYPE timestamptz(3) USING "dormant_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."users" ALTER COLUMN "last_active_at" TYPE timestamptz(3) USING "last_active_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."users" ALTER COLUMN "last_login_at" TYPE timestamptz(3) USING "last_login_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."users" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."users" ALTER COLUMN "verified_at" TYPE timestamptz(3) USING "verified_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."users" ALTER COLUMN "withdraw_processed_at" TYPE timestamptz(3) USING "withdraw_processed_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."users" ALTER COLUMN "withdraw_requested_at" TYPE timestamptz(3) USING "withdraw_requested_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."venue_bookings" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."venue_bookings" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."venue_holidays" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."venue_holidays" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."venue_rental_contracts" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."venue_rental_contracts" ALTER COLUMN "signed_at" TYPE timestamptz(3) USING "signed_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."venue_rental_contracts" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."venue_rental_schedules" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."venue_rental_schedules" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."venue_time_slots" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."venue_time_slots" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."venues" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."venues" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."videos" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."videos" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."waitlists" ALTER COLUMN "confirmed_at" TYPE timestamptz(3) USING "confirmed_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."waitlists" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."waitlists" ALTER COLUMN "expires_at" TYPE timestamptz(3) USING "expires_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."waitlists" ALTER COLUMN "notified_at" TYPE timestamptz(3) USING "notified_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."waitlists" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."wishlists" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
COMMIT;

BEGIN;
ALTER TABLE icehockey."work_schedules" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE icehockey."work_schedules" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
COMMIT;

