-- =============================================================
-- teamplus / IceHockey DB 전체 스키마 생성 SQL
-- schema: icehockey
-- 생성일: 2026-03-19
-- Prisma schema → prisma/schema.prisma (110개 모델, Enum 7개)
-- 이미 존재하는 오브젝트는 건너뜀 (IF NOT EXISTS / DO $$ ... END $$)
-- =============================================================

-- 스키마 생성
CREATE SCHEMA IF NOT EXISTS icehockey;
SET search_path TO icehockey;

-- =============================================================
-- 1. ENUM 타입 (7개)
-- =============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserType' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'icehockey')) THEN
    CREATE TYPE icehockey."UserType" AS ENUM ('ADMIN', 'DIRECTOR', 'COACH', 'PARENT', 'TEEN', 'CHILD');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DiscountType' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'icehockey')) THEN
    CREATE TYPE icehockey."DiscountType" AS ENUM ('FIXED', 'PERCENTAGE');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CouponTarget' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'icehockey')) THEN
    CREATE TYPE icehockey."CouponTarget" AS ENUM ('ALL', 'CATEGORY', 'PRODUCT');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PointActionType' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'icehockey')) THEN
    CREATE TYPE icehockey."PointActionType" AS ENUM ('EARN', 'USE', 'EXPIRE', 'ADJUST', 'REFUND');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ChatRoomType' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'icehockey')) THEN
    CREATE TYPE icehockey."ChatRoomType" AS ENUM ('DIRECT', 'GROUP', 'CLASS', 'CLUB', 'SUPPORT');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ChatMessageType' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'icehockey')) THEN
    CREATE TYPE icehockey."ChatMessageType" AS ENUM ('TEXT', 'IMAGE', 'FILE', 'SYSTEM', 'NOTICE');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TrainingType' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'icehockey')) THEN
    CREATE TYPE icehockey."TrainingType" AS ENUM ('LESSON', 'REGULAR_TRAINING', 'REGULAR_CLASS', 'GROUP_CLASS', 'GAME', 'FUN', 'CAMP', 'PICKUP');
  END IF;
END $$;

-- =============================================================
-- 2. 테이블 생성 (의존성 순서)
-- =============================================================

-- 2-1. users (최상위 - 다른 모든 테이블이 참조)
CREATE TABLE IF NOT EXISTS icehockey.users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  user_type icehockey."UserType" NOT NULL,
  ci TEXT UNIQUE,
  di TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  birth_date TIMESTAMPTZ,
  korean_age INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_user_type ON icehockey.users(user_type);
CREATE INDEX IF NOT EXISTS idx_users_is_verified ON icehockey.users(is_verified);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON icehockey.users(created_at);

-- 2-2. rinks
CREATE TABLE IF NOT EXISTS icehockey.rinks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT,
  phone TEXT,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2-3. clubs (coach_id → users)
CREATE TABLE IF NOT EXISTS icehockey.clubs (
  id TEXT PRIMARY KEY,
  club_code TEXT NOT NULL UNIQUE,
  club_name TEXT NOT NULL,
  coach_id TEXT NOT NULL REFERENCES icehockey.users(id),
  location TEXT,
  phone TEXT,
  default_billing_timing TEXT NOT NULL DEFAULT 'PREPAID',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2-4. parent_profiles
CREATE TABLE IF NOT EXISTS icehockey.parent_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES icehockey.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2-5. coach_profiles
CREATE TABLE IF NOT EXISTS icehockey.coach_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES icehockey.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  club_id TEXT NOT NULL REFERENCES icehockey.clubs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2-6. child_profiles
CREATE TABLE IF NOT EXISTS icehockey.child_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES icehockey.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  birth_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2-7. club_members
CREATE TABLE IF NOT EXISTS icehockey.club_members (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES icehockey.users(id) ON DELETE CASCADE,
  club_id TEXT NOT NULL REFERENCES icehockey.clubs(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  player_age INTEGER NOT NULL,
  player_level TEXT,
  approval_status TEXT NOT NULL DEFAULT 'pending',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, club_id)
);
CREATE INDEX IF NOT EXISTS idx_club_members_club_id ON icehockey.club_members(club_id);
CREATE INDEX IF NOT EXISTS idx_club_members_approval_status ON icehockey.club_members(approval_status);
CREATE INDEX IF NOT EXISTS idx_club_members_joined_at ON icehockey.club_members(joined_at);

-- 2-8. classes
CREATE TABLE IF NOT EXISTS icehockey.classes (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES icehockey.clubs(id) ON DELETE CASCADE,
  class_name TEXT NOT NULL,
  description TEXT,
  training_type TEXT,
  instructor_name TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  age_min INTEGER,
  age_max INTEGER,
  level_required TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_classes_club_id ON icehockey.classes(club_id);
CREATE INDEX IF NOT EXISTS idx_classes_is_active ON icehockey.classes(is_active);
CREATE INDEX IF NOT EXISTS idx_classes_start_time ON icehockey.classes(start_time);
CREATE INDEX IF NOT EXISTS idx_classes_instructor_name ON icehockey.classes(instructor_name);

-- 2-9. class_schedules
CREATE TABLE IF NOT EXISTS icehockey.class_schedules (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES icehockey.classes(id) ON DELETE CASCADE,
  scheduled_date TIMESTAMPTZ NOT NULL,
  is_cancelled BOOLEAN NOT NULL DEFAULT false,
  cancellation_reason TEXT,
  rsvp_deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_class_schedules_class_id ON icehockey.class_schedules(class_id);
CREATE INDEX IF NOT EXISTS idx_class_schedules_scheduled_date ON icehockey.class_schedules(scheduled_date);

-- 2-10. class_products
CREATE TABLE IF NOT EXISTS icehockey.class_products (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES icehockey.classes(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL,
  sessions_per_month INTEGER NOT NULL,
  duration_days INTEGER NOT NULL DEFAULT 30,
  fee_type TEXT NOT NULL DEFAULT 'PER_SESSION',
  billing_timing TEXT NOT NULL DEFAULT 'PREPAID',
  sessions_per_week INTEGER,
  fee_per_session DECIMAL(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_class_products_class_id ON icehockey.class_products(class_id);
CREATE INDEX IF NOT EXISTS idx_class_products_fee_type ON icehockey.class_products(fee_type);
CREATE INDEX IF NOT EXISTS idx_class_products_billing_timing ON icehockey.class_products(billing_timing);

-- 2-11. payments
CREATE TABLE IF NOT EXISTS icehockey.payments (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES icehockey.users(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES icehockey.class_products(id),
  amount INTEGER NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  tid TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON icehockey.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_number ON icehockey.payments(order_number);
CREATE INDEX IF NOT EXISTS idx_payments_payment_status ON icehockey.payments(payment_status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON icehockey.payments(created_at);

-- 2-12. member_credits
CREATE TABLE IF NOT EXISTS icehockey.member_credits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES icehockey.users(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES icehockey.club_members(id) ON DELETE CASCADE,
  total_credits INTEGER NOT NULL,
  used_credits INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  issued_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payment_id TEXT REFERENCES icehockey.payments(id)
);
CREATE INDEX IF NOT EXISTS idx_member_credits_user_id ON icehockey.member_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_member_credits_member_id ON icehockey.member_credits(member_id);
CREATE INDEX IF NOT EXISTS idx_member_credits_expires_at ON icehockey.member_credits(expires_at);

-- 2-13. refund_logs
CREATE TABLE IF NOT EXISTS icehockey.refund_logs (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES icehockey.payments(id) ON DELETE CASCADE,
  refund_amount INTEGER NOT NULL,
  refund_reason TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refund_logs_payment_id ON icehockey.refund_logs(payment_id);

-- 2-14. class_attendances
CREATE TABLE IF NOT EXISTS icehockey.class_attendances (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES icehockey.class_schedules(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES icehockey.users(id) ON DELETE CASCADE,
  attendance_status TEXT NOT NULL DEFAULT 'absent',
  checked_in_at TIMESTAMPTZ,
  credit_deducted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (schedule_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_class_attendances_schedule_id ON icehockey.class_attendances(schedule_id);
CREATE INDEX IF NOT EXISTS idx_class_attendances_member_id ON icehockey.class_attendances(member_id);
CREATE INDEX IF NOT EXISTS idx_class_attendances_created_at ON icehockey.class_attendances(created_at);
CREATE INDEX IF NOT EXISTS idx_class_attendances_member_id_created_at ON icehockey.class_attendances(member_id, created_at);

-- 2-15. notification_templates
CREATE TABLE IF NOT EXISTS icehockey.notification_templates (
  id TEXT PRIMARY KEY,
  template_code TEXT NOT NULL UNIQUE,
  template_name TEXT NOT NULL,
  content TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'alimtalk',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notification_templates_template_code ON icehockey.notification_templates(template_code);
CREATE INDEX IF NOT EXISTS idx_notification_templates_channel ON icehockey.notification_templates(channel);
CREATE INDEX IF NOT EXISTS idx_notification_templates_is_active ON icehockey.notification_templates(is_active);

-- 2-16. notifications
CREATE TABLE IF NOT EXISTS icehockey.notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES icehockey.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  template_id TEXT REFERENCES icehockey.notification_templates(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON icehockey.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON icehockey.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON icehockey.notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_notification_type ON icehockey.notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_is_read ON icehockey.notifications(user_id, is_read);

-- 2-17. alimtalk_logs
CREATE TABLE IF NOT EXISTS icehockey.alimtalk_logs (
  id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL UNIQUE REFERENCES icehockey.notifications(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  template_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  response_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alimtalk_logs_status ON icehockey.alimtalk_logs(status);
CREATE INDEX IF NOT EXISTS idx_alimtalk_logs_created_at ON icehockey.alimtalk_logs(created_at);

-- 2-18. audit_logs
CREATE TABLE IF NOT EXISTS icehockey.audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES icehockey.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON icehockey.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON icehockey.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON icehockey.audit_logs(created_at);

-- 2-19. shop_categories
CREATE TABLE IF NOT EXISTS icehockey.shop_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  parent_id TEXT REFERENCES icehockey.shop_categories(id) ON DELETE SET NULL,
  level INTEGER NOT NULL,
  path TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_categories_parent_id ON icehockey.shop_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_shop_categories_level ON icehockey.shop_categories(level);
CREATE INDEX IF NOT EXISTS idx_shop_categories_is_active ON icehockey.shop_categories(is_active);
CREATE INDEX IF NOT EXISTS idx_shop_categories_display_order ON icehockey.shop_categories(display_order);

-- 2-20. shop_products
CREATE TABLE IF NOT EXISTS icehockey.shop_products (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES icehockey.shop_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  price INTEGER NOT NULL,
  sale_price INTEGER,
  cost_price INTEGER,
  stock INTEGER NOT NULL DEFAULT 0,
  min_order_qty INTEGER NOT NULL DEFAULT 1,
  max_order_qty INTEGER,
  brand TEXT,
  manufacturer TEXT,
  origin TEXT,
  weight INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_new BOOLEAN NOT NULL DEFAULT false,
  view_count INTEGER NOT NULL DEFAULT 0,
  sales_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_products_category_id ON icehockey.shop_products(category_id);
CREATE INDEX IF NOT EXISTS idx_shop_products_is_active ON icehockey.shop_products(is_active);
CREATE INDEX IF NOT EXISTS idx_shop_products_is_featured ON icehockey.shop_products(is_featured);
CREATE INDEX IF NOT EXISTS idx_shop_products_is_new ON icehockey.shop_products(is_new);
CREATE INDEX IF NOT EXISTS idx_shop_products_created_at ON icehockey.shop_products(created_at);
CREATE INDEX IF NOT EXISTS idx_shop_products_sales_count ON icehockey.shop_products(sales_count);
CREATE INDEX IF NOT EXISTS idx_shop_products_price ON icehockey.shop_products(price);

-- 2-21. shop_product_images
CREATE TABLE IF NOT EXISTS icehockey.shop_product_images (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES icehockey.shop_products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  alt_text TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_main BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_product_images_product_id ON icehockey.shop_product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_shop_product_images_is_main ON icehockey.shop_product_images(is_main);

-- 2-22. shop_product_options
CREATE TABLE IF NOT EXISTS icehockey.shop_product_options (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES icehockey.shop_products(id) ON DELETE CASCADE,
  option_name TEXT NOT NULL,
  option_value TEXT NOT NULL,
  additional_price INTEGER NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_product_options_product_id ON icehockey.shop_product_options(product_id);
CREATE INDEX IF NOT EXISTS idx_shop_product_options_option_name ON icehockey.shop_product_options(option_name);

-- 2-23. shop_shipping_companies
CREATE TABLE IF NOT EXISTS icehockey.shop_shipping_companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  tracking_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_shipping_companies_is_active ON icehockey.shop_shipping_companies(is_active);

-- 2-24. shop_shippings
CREATE TABLE IF NOT EXISTS icehockey.shop_shippings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES icehockey.shop_shipping_companies(id),
  tracking_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'preparing',
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_shippings_company_id ON icehockey.shop_shippings(company_id);
CREATE INDEX IF NOT EXISTS idx_shop_shippings_tracking_number ON icehockey.shop_shippings(tracking_number);
CREATE INDEX IF NOT EXISTS idx_shop_shippings_status ON icehockey.shop_shippings(status);

-- 2-25. shop_orders
CREATE TABLE IF NOT EXISTS icehockey.shop_orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES icehockey.users(id) ON DELETE CASCADE,
  order_status TEXT NOT NULL DEFAULT 'pending',
  total_amount INTEGER NOT NULL,
  discount_amount INTEGER NOT NULL DEFAULT 0,
  shipping_fee INTEGER NOT NULL DEFAULT 0,
  payment_amount INTEGER NOT NULL,
  payment_method TEXT,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  tid TEXT,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  address TEXT NOT NULL,
  address_detail TEXT,
  delivery_memo TEXT,
  shipping_id TEXT REFERENCES icehockey.shop_shippings(id),
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_orders_user_id ON icehockey.shop_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_shop_orders_order_number ON icehockey.shop_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_shop_orders_order_status ON icehockey.shop_orders(order_status);
CREATE INDEX IF NOT EXISTS idx_shop_orders_payment_status ON icehockey.shop_orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_shop_orders_created_at ON icehockey.shop_orders(created_at);

-- 2-26. shop_order_items
CREATE TABLE IF NOT EXISTS icehockey.shop_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES icehockey.shop_orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES icehockey.shop_products(id),
  option_id TEXT REFERENCES icehockey.shop_product_options(id),
  product_name TEXT NOT NULL,
  option_name TEXT,
  option_value TEXT,
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  total_price INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_order_items_order_id ON icehockey.shop_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_shop_order_items_product_id ON icehockey.shop_order_items(product_id);

-- 2-27. shipping_policies
CREATE TABLE IF NOT EXISTS icehockey.shipping_policies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'standard',
  shipping_fee INTEGER NOT NULL,
  free_shipping_threshold INTEGER,
  additional_fee INTEGER NOT NULL DEFAULT 0,
  estimated_days TEXT,
  regions TEXT,
  surcharge INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shipping_policies_type ON icehockey.shipping_policies(type);
CREATE INDEX IF NOT EXISTS idx_shipping_policies_is_active ON icehockey.shipping_policies(is_active);
CREATE INDEX IF NOT EXISTS idx_shipping_policies_is_default ON icehockey.shipping_policies(is_default);

-- 2-28. class_registrations
CREATE TABLE IF NOT EXISTS icehockey.class_registrations (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES icehockey.classes(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES icehockey.club_members(id) ON DELETE CASCADE,
  registration_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (class_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_class_registrations_class_id ON icehockey.class_registrations(class_id);
CREATE INDEX IF NOT EXISTS idx_class_registrations_member_id ON icehockey.class_registrations(member_id);
CREATE INDEX IF NOT EXISTS idx_class_registrations_status ON icehockey.class_registrations(status);

-- 2-29. waitlists
CREATE TABLE IF NOT EXISTS icehockey.waitlists (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES icehockey.classes(id) ON DELETE CASCADE,
  schedule_id TEXT,
  user_id TEXT NOT NULL REFERENCES icehockey.users(id) ON DELETE CASCADE,
  child_id TEXT REFERENCES icehockey.users(id),
  position INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'WAITING',
  notified_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (class_id, user_id, child_id)
);
CREATE INDEX IF NOT EXISTS idx_waitlists_class_id_status ON icehockey.waitlists(class_id, status);
CREATE INDEX IF NOT EXISTS idx_waitlists_user_id ON icehockey.waitlists(user_id);
CREATE INDEX IF NOT EXISTS idx_waitlists_position ON icehockey.waitlists(position);

-- 2-30. credit_transactions
CREATE TABLE IF NOT EXISTS icehockey.credit_transactions (
  id TEXT PRIMARY KEY,
  member_credit_id TEXT NOT NULL REFERENCES icehockey.member_credits(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  schedule_id TEXT,
  refund_id TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_member_credit_id ON icehockey.credit_transactions(member_credit_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON icehockey.credit_transactions(type);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON icehockey.credit_transactions(created_at);

-- 2-31. system_notices
CREATE TABLE IF NOT EXISTS icehockey.system_notices (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  target_type TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  expires_at TIMESTAMPTZ,
  start_at TIMESTAMPTZ,
  display_locations_json JSONB NOT NULL DEFAULT '[]',
  target_birth_year_from INTEGER,
  target_birth_year_to INTEGER,
  target_club_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_system_notices_is_active ON icehockey.system_notices(is_active);
CREATE INDEX IF NOT EXISTS idx_system_notices_priority ON icehockey.system_notices(priority);
CREATE INDEX IF NOT EXISTS idx_system_notices_created_at ON icehockey.system_notices(created_at);
CREATE INDEX IF NOT EXISTS idx_system_notices_is_active_start_at ON icehockey.system_notices(is_active, start_at);
CREATE INDEX IF NOT EXISTS idx_system_notices_target_club_id ON icehockey.system_notices(target_club_id);

-- 2-32. academy_promotions
CREATE TABLE IF NOT EXISTS icehockey.academy_promotions (
  id TEXT PRIMARY KEY,
  coach_id TEXT NOT NULL REFERENCES icehockey.users(id),
  club_id TEXT REFERENCES icehockey.clubs(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  lesson_type TEXT NOT NULL,
  schedule_info TEXT,
  price_info TEXT,
  capacity INTEGER,
  venue_info TEXT,
  contact_phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_academy_promotions_is_active_created_at ON icehockey.academy_promotions(is_active, created_at);
CREATE INDEX IF NOT EXISTS idx_academy_promotions_coach_id ON icehockey.academy_promotions(coach_id);
CREATE INDEX IF NOT EXISTS idx_academy_promotions_lesson_type ON icehockey.academy_promotions(lesson_type);

-- 2-33. club_invites
CREATE TABLE IF NOT EXISTS icehockey.club_invites (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES icehockey.clubs(id) ON DELETE CASCADE,
  invite_code TEXT NOT NULL UNIQUE,
  invite_type TEXT NOT NULL DEFAULT 'code',
  expires_at TIMESTAMPTZ,
  usage_limit INTEGER,
  current_usage INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_club_invites_club_id ON icehockey.club_invites(club_id);
CREATE INDEX IF NOT EXISTS idx_club_invites_invite_code ON icehockey.club_invites(invite_code);
CREATE INDEX IF NOT EXISTS idx_club_invites_is_active ON icehockey.club_invites(is_active);

-- 2-34. user_notification_preferences
CREATE TABLE IF NOT EXISTS icehockey.user_notification_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES icehockey.users(id) ON DELETE CASCADE,
  push_enabled BOOLEAN NOT NULL DEFAULT true,
  sms_enabled BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  quiet_hours_start TEXT,
  quiet_hours_end TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2-35. payment_webhooks
CREATE TABLE IF NOT EXISTS icehockey.payment_webhooks (
  id TEXT PRIMARY KEY,
  payment_id TEXT,
  webhook_type TEXT NOT NULL,
  webhook_payload JSONB NOT NULL,
  signature TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_payment_id ON icehockey.payment_webhooks(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_webhook_type ON icehockey.payment_webhooks(webhook_type);
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_processed_at ON icehockey.payment_webhooks(processed_at);

-- 2-36. identity_verifications
CREATE TABLE IF NOT EXISTS icehockey.identity_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES icehockey.users(id) ON DELETE SET NULL,
  request_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  ci TEXT,
  di TEXT,
  verified_name TEXT,
  verified_phone TEXT,
  verified_birth TEXT,
  verified_gender TEXT,
  purpose TEXT NOT NULL,
  return_url TEXT,
  client_ip TEXT,
  user_agent TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  error_code TEXT,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_identity_verifications_user_id ON icehockey.identity_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_identity_verifications_request_id ON icehockey.identity_verifications(request_id);
CREATE INDEX IF NOT EXISTS idx_identity_verifications_provider ON icehockey.identity_verifications(provider);
CREATE INDEX IF NOT EXISTS idx_identity_verifications_status ON icehockey.identity_verifications(status);
CREATE INDEX IF NOT EXISTS idx_identity_verifications_purpose ON icehockey.identity_verifications(purpose);
CREATE INDEX IF NOT EXISTS idx_identity_verifications_requested_at ON icehockey.identity_verifications(requested_at);
CREATE INDEX IF NOT EXISTS idx_identity_verifications_expires_at ON icehockey.identity_verifications(expires_at);

-- 2-37. identity_webhook_logs
CREATE TABLE IF NOT EXISTS icehockey.identity_webhook_logs (
  id TEXT PRIMARY KEY,
  identity_verification_id TEXT NOT NULL REFERENCES icehockey.identity_verifications(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  webhook_type TEXT NOT NULL,
  webhook_payload JSONB NOT NULL,
  signature TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  http_status INTEGER,
  error_message TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_identity_webhook_logs_identity_verification_id ON icehockey.identity_webhook_logs(identity_verification_id);
CREATE INDEX IF NOT EXISTS idx_identity_webhook_logs_provider ON icehockey.identity_webhook_logs(provider);
CREATE INDEX IF NOT EXISTS idx_identity_webhook_logs_webhook_type ON icehockey.identity_webhook_logs(webhook_type);
CREATE INDEX IF NOT EXISTS idx_identity_webhook_logs_processed_at ON icehockey.identity_webhook_logs(processed_at);

-- 2-38. app_menus
CREATE TABLE IF NOT EXISTS icehockey.app_menus (
  id TEXT PRIMARY KEY,
  user_type icehockey."UserType" NOT NULL,
  label TEXT NOT NULL,
  icon TEXT NOT NULL,
  href TEXT NOT NULL,
  parent_id TEXT REFERENCES icehockey.app_menus(id) ON DELETE SET NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_menus_user_type ON icehockey.app_menus(user_type);
CREATE INDEX IF NOT EXISTS idx_app_menus_is_active ON icehockey.app_menus(is_active);
CREATE INDEX IF NOT EXISTS idx_app_menus_parent_id ON icehockey.app_menus(parent_id);

-- 2-39. parent_children
CREATE TABLE IF NOT EXISTS icehockey.parent_children (
  id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL REFERENCES icehockey.users(id) ON DELETE CASCADE,
  child_id TEXT NOT NULL REFERENCES icehockey.users(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT 'parent',
  is_primary BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (parent_id, child_id)
);
CREATE INDEX IF NOT EXISTS idx_parent_children_parent_id ON icehockey.parent_children(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_children_child_id ON icehockey.parent_children(child_id);
CREATE INDEX IF NOT EXISTS idx_parent_children_is_primary ON icehockey.parent_children(is_primary);

-- 2-40. enrollments
CREATE TABLE IF NOT EXISTS icehockey.enrollments (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES icehockey.users(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES icehockey.classes(id) ON DELETE CASCADE,
  class_product_id TEXT REFERENCES icehockey.class_products(id) ON DELETE SET NULL,
  requested_by TEXT NOT NULL REFERENCES icehockey.users(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL DEFAULT 'parent_direct',
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by TEXT REFERENCES icehockey.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  payment_id TEXT REFERENCES icehockey.payments(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_enrollments_child_id ON icehockey.enrollments(child_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_class_id ON icehockey.enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_requested_by ON icehockey.enrollments(requested_by);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON icehockey.enrollments(status);
CREATE INDEX IF NOT EXISTS idx_enrollments_request_type ON icehockey.enrollments(request_type);
CREATE INDEX IF NOT EXISTS idx_enrollments_expires_at ON icehockey.enrollments(expires_at);

-- 2-41. attendance_qr_codes
CREATE TABLE IF NOT EXISTS icehockey.attendance_qr_codes (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES icehockey.class_schedules(id) ON DELETE CASCADE,
  generated_by TEXT NOT NULL REFERENCES icehockey.users(id) ON DELETE CASCADE,
  qr_data TEXT NOT NULL UNIQUE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  scanned_at TIMESTAMPTZ,
  scanned_by TEXT REFERENCES icehockey.users(id)
);
CREATE INDEX IF NOT EXISTS idx_attendance_qr_codes_schedule_id ON icehockey.attendance_qr_codes(schedule_id);
CREATE INDEX IF NOT EXISTS idx_attendance_qr_codes_generated_by ON icehockey.attendance_qr_codes(generated_by);
CREATE INDEX IF NOT EXISTS idx_attendance_qr_codes_qr_data ON icehockey.attendance_qr_codes(qr_data);
CREATE INDEX IF NOT EXISTS idx_attendance_qr_codes_expires_at ON icehockey.attendance_qr_codes(expires_at);

-- 2-42. daily_metrics
CREATE TABLE IF NOT EXISTS icehockey.daily_metrics (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL,
  metric_date DATE NOT NULL,
  active_members INTEGER NOT NULL DEFAULT 0,
  new_members INTEGER NOT NULL DEFAULT 0,
  classes_held INTEGER NOT NULL DEFAULT 0,
  total_attendees INTEGER NOT NULL DEFAULT 0,
  attendance_rate INTEGER NOT NULL DEFAULT 0,
  total_revenue INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (club_id, metric_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_club_id ON icehockey.daily_metrics(club_id);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_metric_date ON icehockey.daily_metrics(metric_date);

-- 2-43. club_posts
CREATE TABLE IF NOT EXISTS icehockey.club_posts (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES icehockey.clubs(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES icehockey.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  post_type TEXT NOT NULL DEFAULT 'announcement',
  target_level TEXT,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_club_posts_club_id ON icehockey.club_posts(club_id);
CREATE INDEX IF NOT EXISTS idx_club_posts_author_id ON icehockey.club_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_club_posts_post_type ON icehockey.club_posts(post_type);
CREATE INDEX IF NOT EXISTS idx_club_posts_is_active ON icehockey.club_posts(is_active);

-- 2-44. club_post_comments
CREATE TABLE IF NOT EXISTS icehockey.club_post_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES icehockey.club_posts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES icehockey.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_club_post_comments_post_id ON icehockey.club_post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_club_post_comments_author_id ON icehockey.club_post_comments(author_id);

-- 2-45. club_post_likes
CREATE TABLE IF NOT EXISTS icehockey.club_post_likes (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES icehockey.club_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES icehockey.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_club_post_likes_post_id ON icehockey.club_post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_club_post_likes_user_id ON icehockey.club_post_likes(user_id);

-- 2-46. club_post_attachments
CREATE TABLE IF NOT EXISTS icehockey.club_post_attachments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES icehockey.club_posts(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_club_post_attachments_post_id ON icehockey.club_post_attachments(post_id);

-- 2-47. club_events
CREATE TABLE IF NOT EXISTS icehockey.club_events (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES icehockey.clubs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL,
  target_level TEXT,
  capacity INTEGER,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  price_mode TEXT NOT NULL DEFAULT 'payment',
  price_amount INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_club_events_club_id ON icehockey.club_events(club_id);
CREATE INDEX IF NOT EXISTS idx_club_events_event_type ON icehockey.club_events(event_type);
CREATE INDEX IF NOT EXISTS idx_club_events_status ON icehockey.club_events(status);
CREATE INDEX IF NOT EXISTS idx_club_events_start_at ON icehockey.club_events(start_at);
CREATE INDEX IF NOT EXISTS idx_club_events_end_at ON icehockey.club_events(end_at);

-- 2-48. club_event_registrations
CREATE TABLE IF NOT EXISTS icehockey.club_event_registrations (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES icehockey.club_events(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES icehockey.club_members(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  paid BOOLEAN NOT NULL DEFAULT false,
  payment_id TEXT REFERENCES icehockey.payments(id),
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_club_event_registrations_event_id ON icehockey.club_event_registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_club_event_registrations_member_id ON icehockey.club_event_registrations(member_id);
CREATE INDEX IF NOT EXISTS idx_club_event_registrations_status ON icehockey.club_event_registrations(status);

-- 2-49. tournaments
CREATE TABLE IF NOT EXISTS icehockey.tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  club_id TEXT REFERENCES icehockey.clubs(id),
  rink_id TEXT REFERENCES icehockey.rinks(id),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  eligible_birth_year_from INTEGER,
  eligible_birth_year_to INTEGER,
  fee_per_game DECIMAL(10,2),
  total_games INTEGER,
  fee_type TEXT,
  max_participants INTEGER,
  registration_deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tournaments_club_id ON icehockey.tournaments(club_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_rink_id ON icehockey.tournaments(rink_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_start_date ON icehockey.tournaments(start_date);

-- 2-50. tournament_registrations
CREATE TABLE IF NOT EXISTS icehockey.tournament_registrations (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES icehockey.tournaments(id),
  user_id TEXT NOT NULL REFERENCES icehockey.users(id),
  child_id TEXT REFERENCES icehockey.users(id),
  games_count INTEGER NOT NULL,
  calculated_fee DECIMAL(10,2) NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'PENDING',
  payment_id TEXT REFERENCES icehockey.payments(id),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id, user_id, child_id)
);
CREATE INDEX IF NOT EXISTS idx_tournament_registrations_tournament_id_payment_status ON icehockey.tournament_registrations(tournament_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_tournament_registrations_user_id ON icehockey.tournament_registrations(user_id);

-- 2-51. venues
CREATE TABLE IF NOT EXISTS icehockey.venues (
  id TEXT PRIMARY KEY,
  club_id TEXT REFERENCES icehockey.clubs(id),
  name TEXT NOT NULL,
  address TEXT,
  address_detail TEXT,
  city TEXT,
  zip_code TEXT,
  phone TEXT,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  capacity INTEGER,
  rink_size TEXT,
  amenities JSONB,
  operating_hours JSONB,
  status TEXT NOT NULL DEFAULT 'active',
  image_url TEXT,
  hourly_rate INTEGER,
  manager_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_venues_club_id ON icehockey.venues(club_id);
CREATE INDEX IF NOT EXISTS idx_venues_status ON icehockey.venues(status);
CREATE INDEX IF NOT EXISTS idx_venues_city ON icehockey.venues(city);

-- 2-52. hockey_matches
CREATE TABLE IF NOT EXISTS icehockey.hockey_matches (
  id TEXT PRIMARY KEY,
  tournament_id TEXT REFERENCES icehockey.tournaments(id),
  rink_id TEXT REFERENCES icehockey.rinks(id),
  venue_id TEXT REFERENCES icehockey.venues(id),
  home_club_id TEXT REFERENCES icehockey.clubs(id),
  away_club_id TEXT REFERENCES icehockey.clubs(id),
  home_team_id TEXT,
  away_team_id TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  home_score INTEGER NOT NULL DEFAULT 0,
  away_score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'scheduled',
  current_period INTEGER,
  round TEXT,
  match_order INTEGER,
  referee_main TEXT,
  referee_lines TEXT,
  game_sheet JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hockey_matches_tournament_id ON icehockey.hockey_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_hockey_matches_rink_id ON icehockey.hockey_matches(rink_id);
CREATE INDEX IF NOT EXISTS idx_hockey_matches_venue_id ON icehockey.hockey_matches(venue_id);
CREATE INDEX IF NOT EXISTS idx_hockey_matches_scheduled_at ON icehockey.hockey_matches(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_hockey_matches_status ON icehockey.hockey_matches(status);

-- 2-53. teams
CREATE TABLE IF NOT EXISTS icehockey.teams (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES icehockey.clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  short_name TEXT,
  logo_url TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  division TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_teams_club_id ON icehockey.teams(club_id);
CREATE INDEX IF NOT EXISTS idx_teams_division ON icehockey.teams(division);
CREATE INDEX IF NOT EXISTS idx_teams_is_active ON icehockey.teams(is_active);

-- FK 추가: hockey_matches.home_team_id, away_team_id → teams
ALTER TABLE icehockey.hockey_matches
  ADD COLUMN IF NOT EXISTS home_team_id_fk TEXT REFERENCES icehockey.teams(id);
ALTER TABLE icehockey.hockey_matches
  ADD COLUMN IF NOT EXISTS away_team_id_fk TEXT REFERENCES icehockey.teams(id);

-- 2-54. team_rosters
CREATE TABLE IF NOT EXISTS icehockey.team_rosters (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES icehockey.teams(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES icehockey.club_members(id) ON DELETE CASCADE,
  position TEXT,
  jersey_number INTEGER,
  is_captain BOOLEAN NOT NULL DEFAULT false,
  is_alt_captain BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  UNIQUE (team_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_team_rosters_team_id ON icehockey.team_rosters(team_id);
CREATE INDEX IF NOT EXISTS idx_team_rosters_member_id ON icehockey.team_rosters(member_id);
CREATE INDEX IF NOT EXISTS idx_team_rosters_position ON icehockey.team_rosters(position);
CREATE INDEX IF NOT EXISTS idx_team_rosters_status ON icehockey.team_rosters(status);

-- 2-55. match_periods
CREATE TABLE IF NOT EXISTS icehockey.match_periods (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES icehockey.hockey_matches(id) ON DELETE CASCADE,
  period_number INTEGER NOT NULL,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  home_score INTEGER NOT NULL DEFAULT 0,
  away_score INTEGER NOT NULL DEFAULT 0,
  home_penalty_minutes INTEGER NOT NULL DEFAULT 0,
  away_penalty_minutes INTEGER NOT NULL DEFAULT 0,
  UNIQUE (match_id, period_number)
);
CREATE INDEX IF NOT EXISTS idx_match_periods_match_id ON icehockey.match_periods(match_id);

-- 2-56. match_events
CREATE TABLE IF NOT EXISTS icehockey.match_events (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES icehockey.hockey_matches(id) ON DELETE CASCADE,
  period_number INTEGER NOT NULL,
  event_time TEXT NOT NULL,
  event_type TEXT NOT NULL,
  team_id TEXT,
  player_id TEXT REFERENCES icehockey.team_rosters(id),
  assist_player1_id TEXT REFERENCES icehockey.team_rosters(id),
  assist_player2_id TEXT REFERENCES icehockey.team_rosters(id),
  penalty_type TEXT,
  penalty_minutes INTEGER,
  description TEXT,
  is_game_winner BOOLEAN NOT NULL DEFAULT false,
  is_power_play BOOLEAN NOT NULL DEFAULT false,
  is_short_handed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_match_events_match_id ON icehockey.match_events(match_id);
CREATE INDEX IF NOT EXISTS idx_match_events_event_type ON icehockey.match_events(event_type);
CREATE INDEX IF NOT EXISTS idx_match_events_period_number ON icehockey.match_events(period_number);
CREATE INDEX IF NOT EXISTS idx_match_events_player_id ON icehockey.match_events(player_id);

-- 2-57. settlements
CREATE TABLE IF NOT EXISTS icehockey.settlements (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES icehockey.clubs(id) ON DELETE CASCADE,
  settlement_month TEXT NOT NULL,
  total_revenue INTEGER NOT NULL DEFAULT 0,
  platform_fee INTEGER NOT NULL DEFAULT 0,
  payment_fee INTEGER NOT NULL DEFAULT 0,
  refund_amount INTEGER NOT NULL DEFAULT 0,
  net_amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  bank_name TEXT,
  bank_account TEXT,
  account_holder TEXT,
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  approved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (club_id, settlement_month)
);
CREATE INDEX IF NOT EXISTS idx_settlements_club_id ON icehockey.settlements(club_id);
CREATE INDEX IF NOT EXISTS idx_settlements_settlement_month ON icehockey.settlements(settlement_month);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON icehockey.settlements(status);

-- 2-58. settlement_transactions
CREATE TABLE IF NOT EXISTS icehockey.settlement_transactions (
  id TEXT PRIMARY KEY,
  settlement_id TEXT NOT NULL REFERENCES icehockey.settlements(id) ON DELETE CASCADE,
  payment_id TEXT,
  transaction_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  description TEXT,
  transaction_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_settlement_transactions_settlement_id ON icehockey.settlement_transactions(settlement_id);
CREATE INDEX IF NOT EXISTS idx_settlement_transactions_payment_id ON icehockey.settlement_transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_settlement_transactions_transaction_type ON icehockey.settlement_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_settlement_transactions_transaction_date ON icehockey.settlement_transactions(transaction_date);

-- 2-59. skill_evaluations
CREATE TABLE IF NOT EXISTS icehockey.skill_evaluations (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES icehockey.club_members(id) ON DELETE CASCADE,
  coach_id TEXT NOT NULL REFERENCES icehockey.users(id),
  class_id TEXT,
  evaluation_date TIMESTAMPTZ NOT NULL,
  overall_score INTEGER NOT NULL,
  coach_comment TEXT,
  improvement_areas TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_skill_evaluations_member_id ON icehockey.skill_evaluations(member_id);
CREATE INDEX IF NOT EXISTS idx_skill_evaluations_coach_id ON icehockey.skill_evaluations(coach_id);
CREATE INDEX IF NOT EXISTS idx_skill_evaluations_class_id ON icehockey.skill_evaluations(class_id);
CREATE INDEX IF NOT EXISTS idx_skill_evaluations_evaluation_date ON icehockey.skill_evaluations(evaluation_date);
CREATE INDEX IF NOT EXISTS idx_skill_evaluations_status ON icehockey.skill_evaluations(status);

-- 2-60. skill_dimensions
CREATE TABLE IF NOT EXISTS icehockey.skill_dimensions (
  id TEXT PRIMARY KEY,
  evaluation_id TEXT NOT NULL REFERENCES icehockey.skill_evaluations(id) ON DELETE CASCADE,
  dimension_name TEXT NOT NULL,
  score INTEGER NOT NULL,
  comment TEXT,
  previous_score INTEGER,
  improvement INTEGER
);
CREATE INDEX IF NOT EXISTS idx_skill_dimensions_evaluation_id ON icehockey.skill_dimensions(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_skill_dimensions_dimension_name ON icehockey.skill_dimensions(dimension_name);

-- 2-61. badges
CREATE TABLE IF NOT EXISTS icehockey.badges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon_url TEXT,
  category TEXT NOT NULL,
  rarity TEXT NOT NULL DEFAULT 'common',
  criteria JSONB,
  point_value INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_badges_category ON icehockey.badges(category);
CREATE INDEX IF NOT EXISTS idx_badges_rarity ON icehockey.badges(rarity);
CREATE INDEX IF NOT EXISTS idx_badges_is_active ON icehockey.badges(is_active);

-- 2-62. child_badges
CREATE TABLE IF NOT EXISTS icehockey.child_badges (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES icehockey.users(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL REFERENCES icehockey.badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  earned_reason TEXT,
  is_displayed BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (child_id, badge_id)
);
CREATE INDEX IF NOT EXISTS idx_child_badges_child_id ON icehockey.child_badges(child_id);
CREATE INDEX IF NOT EXISTS idx_child_badges_badge_id ON icehockey.child_badges(badge_id);
CREATE INDEX IF NOT EXISTS idx_child_badges_is_displayed ON icehockey.child_badges(is_displayed);

-- 2-63. shop_wishlists
CREATE TABLE IF NOT EXISTS icehockey.shop_wishlists (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES icehockey.users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES icehockey.shop_products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_shop_wishlists_user_id ON icehockey.shop_wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_shop_wishlists_product_id ON icehockey.shop_wishlists(product_id);

-- 2-64. shop_reviews
CREATE TABLE IF NOT EXISTS icehockey.shop_reviews (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES icehockey.users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES icehockey.shop_products(id) ON DELETE CASCADE,
  order_id TEXT,
  rating INTEGER NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  images JSONB NOT NULL DEFAULT '[]',
  is_verified BOOLEAN NOT NULL DEFAULT false,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  helpful_count INTEGER NOT NULL DEFAULT 0,
  admin_reply TEXT,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_reviews_user_id ON icehockey.shop_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_shop_reviews_product_id ON icehockey.shop_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_shop_reviews_rating ON icehockey.shop_reviews(rating);
CREATE INDEX IF NOT EXISTS idx_shop_reviews_is_visible ON icehockey.shop_reviews(is_visible);
CREATE INDEX IF NOT EXISTS idx_shop_reviews_created_at ON icehockey.shop_reviews(created_at);

-- 2-65. class_reviews
CREATE TABLE IF NOT EXISTS icehockey.class_reviews (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES icehockey.users(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES icehockey.classes(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL,
  content TEXT,
  images JSONB NOT NULL DEFAULT '[]',
  is_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, class_id)
);
CREATE INDEX IF NOT EXISTS idx_class_reviews_class_id ON icehockey.class_reviews(class_id);
CREATE INDEX IF NOT EXISTS idx_class_reviews_user_id ON icehockey.class_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_class_reviews_rating ON icehockey.class_reviews(rating);
CREATE INDEX IF NOT EXISTS idx_class_reviews_created_at ON icehockey.class_reviews(created_at);

-- 2-66. coupons
CREATE TABLE IF NOT EXISTS icehockey.coupons (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  discount_type icehockey."DiscountType" NOT NULL,
  discount_value INTEGER NOT NULL,
  min_order_amount INTEGER,
  max_discount_amount INTEGER,
  usage_limit INTEGER,
  usage_per_user INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  target_type icehockey."CouponTarget" NOT NULL DEFAULT 'ALL',
  target_ids JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON icehockey.coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_is_active ON icehockey.coupons(is_active);
CREATE INDEX IF NOT EXISTS idx_coupons_start_date_end_date ON icehockey.coupons(start_date, end_date);

-- 2-67. user_coupons
CREATE TABLE IF NOT EXISTS icehockey.user_coupons (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES icehockey.users(id) ON DELETE CASCADE,
  coupon_id TEXT NOT NULL REFERENCES icehockey.coupons(id) ON DELETE CASCADE,
  is_used BOOLEAN NOT NULL DEFAULT false,
  used_at TIMESTAMPTZ,
  order_id TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, coupon_id)
);
CREATE INDEX IF NOT EXISTS idx_user_coupons_user_id ON icehockey.user_coupons(user_id);
CREATE INDEX IF NOT EXISTS idx_user_coupons_coupon_id ON icehockey.user_coupons(coupon_id);
CREATE INDEX IF NOT EXISTS idx_user_coupons_is_used ON icehockey.user_coupons(is_used);

-- 2-68. member_levels
CREATE TABLE IF NOT EXISTS icehockey.member_levels (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES icehockey.users(id) ON DELETE CASCADE,
  level INTEGER NOT NULL DEFAULT 1,
  level_name TEXT NOT NULL DEFAULT 'Bronze',
  total_points INTEGER NOT NULL DEFAULT 0,
  current_points INTEGER NOT NULL DEFAULT 0,
  points_to_next INTEGER NOT NULL DEFAULT 1000,
  benefits JSONB NOT NULL DEFAULT '{}',
  level_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_member_levels_level ON icehockey.member_levels(level);

-- 2-69. point_transactions
CREATE TABLE IF NOT EXISTS icehockey.point_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES icehockey.users(id) ON DELETE CASCADE,
  type icehockey."PointActionType" NOT NULL,
  amount INTEGER NOT NULL,
  balance INTEGER NOT NULL,
  description TEXT,
  reference_id TEXT,
  reference_type TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_point_transactions_user_id ON icehockey.point_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_point_transactions_type ON icehockey.point_transactions(type);
CREATE INDEX IF NOT EXISTS idx_point_transactions_created_at ON icehockey.point_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_point_transactions_expires_at ON icehockey.point_transactions(expires_at);

-- 2-70. chat_rooms
CREATE TABLE IF NOT EXISTS icehockey.chat_rooms (
  id TEXT PRIMARY KEY,
  name TEXT,
  type icehockey."ChatRoomType" NOT NULL DEFAULT 'DIRECT',
  club_id TEXT,
  class_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_club_id ON icehockey.chat_rooms(club_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_class_id ON icehockey.chat_rooms(class_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_type ON icehockey.chat_rooms(type);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_is_active ON icehockey.chat_rooms(is_active);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_last_message_at ON icehockey.chat_rooms(last_message_at);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_created_at ON icehockey.chat_rooms(created_at);

-- 2-71. chat_room_members
CREATE TABLE IF NOT EXISTS icehockey.chat_room_members (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES icehockey.chat_rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES icehockey.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  nickname TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_muted BOOLEAN NOT NULL DEFAULT false,
  last_read_at TIMESTAMPTZ,
  unread_count INTEGER NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  UNIQUE (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_room_members_room_id ON icehockey.chat_room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_chat_room_members_user_id ON icehockey.chat_room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_room_members_is_active ON icehockey.chat_room_members(is_active);

-- 2-72. chat_messages
CREATE TABLE IF NOT EXISTS icehockey.chat_messages (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES icehockey.chat_rooms(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES icehockey.users(id) ON DELETE CASCADE,
  receiver_id TEXT REFERENCES icehockey.users(id) ON DELETE SET NULL,
  type icehockey."ChatMessageType" NOT NULL DEFAULT 'TEXT',
  content TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]',
  is_edited BOOLEAN NOT NULL DEFAULT false,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  read_by JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id ON icehockey.chat_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON icehockey.chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_receiver_id ON icehockey.chat_messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON icehockey.chat_messages(created_at);

-- 2-73. app_premium_events
CREATE TABLE IF NOT EXISTS icehockey.app_premium_events (
  id TEXT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  subtitle VARCHAR(200),
  description TEXT NOT NULL,
  event_date TIMESTAMPTZ NOT NULL,
  venue_name VARCHAR(200) NOT NULL,
  venue_address VARCHAR(400),
  benefits_json JSONB NOT NULL,
  cta_label VARCHAR(100) NOT NULL DEFAULT '이벤트 신청하기',
  cta_url TEXT,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_id TEXT,
  updated_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_premium_events_is_active_sort_order ON icehockey.app_premium_events(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_app_premium_events_is_active_event_date ON icehockey.app_premium_events(is_active, event_date);

-- 2-74. app_banners
CREATE TABLE IF NOT EXISTS icehockey.app_banners (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  image_url TEXT NOT NULL,
  link_url TEXT,
  link_type TEXT NOT NULL DEFAULT 'none',
  target_role TEXT,
  target_roles_json JSONB NOT NULL DEFAULT '[]',
  display_locations_json JSONB NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_banners_is_active ON icehockey.app_banners(is_active);
CREATE INDEX IF NOT EXISTS idx_app_banners_sort_order ON icehockey.app_banners(sort_order);
CREATE INDEX IF NOT EXISTS idx_app_banners_is_active_sort_order ON icehockey.app_banners(is_active, sort_order);

-- 2-75. app_versions
CREATE TABLE IF NOT EXISTS icehockey.app_versions (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  version TEXT NOT NULL,
  min_version TEXT NOT NULL,
  force_update BOOLEAN NOT NULL DEFAULT false,
  release_notes TEXT,
  store_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform, version)
);
CREATE INDEX IF NOT EXISTS idx_app_versions_platform_is_active ON icehockey.app_versions(platform, is_active);

-- 2-76. app_faqs
CREATE TABLE IF NOT EXISTS icehockey.app_faqs (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_faqs_category_is_active ON icehockey.app_faqs(category, is_active);
CREATE INDEX IF NOT EXISTS idx_app_faqs_sort_order ON icehockey.app_faqs(sort_order);
CREATE INDEX IF NOT EXISTS idx_app_faqs_category_is_active_sort_order ON icehockey.app_faqs(category, is_active, sort_order);

-- 2-77. app_feedbacks
CREATE TABLE IF NOT EXISTS icehockey.app_feedbacks (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES icehockey.users(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  rating INTEGER,
  app_version TEXT,
  platform TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_feedbacks_status ON icehockey.app_feedbacks(status);
CREATE INDEX IF NOT EXISTS idx_app_feedbacks_category ON icehockey.app_feedbacks(category);
CREATE INDEX IF NOT EXISTS idx_app_feedbacks_created_at ON icehockey.app_feedbacks(created_at);
CREATE INDEX IF NOT EXISTS idx_app_feedbacks_status_created_at ON icehockey.app_feedbacks(status, created_at);
CREATE INDEX IF NOT EXISTS idx_app_feedbacks_user_id_created_at ON icehockey.app_feedbacks(user_id, created_at);

-- 2-78. app_terms
CREATE TABLE IF NOT EXISTS icehockey.app_terms (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  version TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_terms_type_is_active ON icehockey.app_terms(type, is_active);
CREATE INDEX IF NOT EXISTS idx_app_terms_published_at ON icehockey.app_terms(published_at);

-- 2-79. user_devices
CREATE TABLE IF NOT EXISTS icehockey.user_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES icehockey.users(id) ON DELETE CASCADE,
  fcm_token VARCHAR(512) NOT NULL,
  platform TEXT NOT NULL,
  device_model TEXT,
  os_version TEXT,
  app_version TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, fcm_token)
);
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id_is_active ON icehockey.user_devices(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_devices_fcm_token ON icehockey.user_devices(fcm_token);

-- 2-80. pickup_matches
CREATE TABLE IF NOT EXISTS icehockey.pickup_matches (
  id TEXT PRIMARY KEY,
  manager_id TEXT NOT NULL REFERENCES icehockey.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  rink_name TEXT NOT NULL,
  rink_address TEXT,
  rink_venue_info TEXT,
  price INTEGER NOT NULL,
  level TEXT NOT NULL,
  level_code TEXT,
  gender TEXT NOT NULL DEFAULT '혼성',
  max_participants INTEGER NOT NULL,
  home_team_name TEXT,
  away_team_name TEXT,
  rules JSONB NOT NULL DEFAULT '[]',
  description TEXT,
  status TEXT NOT NULL DEFAULT 'recruiting',
  is_featured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pickup_matches_manager_id ON icehockey.pickup_matches(manager_id);
CREATE INDEX IF NOT EXISTS idx_pickup_matches_scheduled_at ON icehockey.pickup_matches(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_pickup_matches_status ON icehockey.pickup_matches(status);
CREATE INDEX IF NOT EXISTS idx_pickup_matches_level ON icehockey.pickup_matches(level);
CREATE INDEX IF NOT EXISTS idx_pickup_matches_gender ON icehockey.pickup_matches(gender);

-- 2-81. app_settings
CREATE TABLE IF NOT EXISTS icehockey.app_settings (
  id TEXT PRIMARY KEY,
  app_name TEXT NOT NULL DEFAULT 'teamplus',
  app_version TEXT NOT NULL DEFAULT '1.0.0',
  api_url TEXT NOT NULL DEFAULT 'http://localhost:5003',
  support_email TEXT NOT NULL DEFAULT 'admin@teamplus.com',
  support_phone TEXT,
  maintenance_mode BOOLEAN NOT NULL DEFAULT false,
  maintenance_message TEXT,
  debug_mode BOOLEAN NOT NULL DEFAULT false,
  max_upload_size INTEGER NOT NULL DEFAULT 10,
  session_timeout INTEGER NOT NULL DEFAULT 60,
  minimum_app_version_ios TEXT NOT NULL DEFAULT '1.0.0',
  minimum_app_version_and TEXT NOT NULL DEFAULT '1.0.0',
  force_update_message TEXT,
  signup_enabled BOOLEAN NOT NULL DEFAULT true,
  social_login_enabled BOOLEAN NOT NULL DEFAULT true,
  max_login_attempts INTEGER NOT NULL DEFAULT 5,
  credit_expire_days INTEGER NOT NULL DEFAULT 90,
  qr_expire_minutes INTEGER NOT NULL DEFAULT 5,
  terms_version TEXT NOT NULL DEFAULT '1.0',
  privacy_version TEXT NOT NULL DEFAULT '1.0',
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2-82. pickup_match_applicants
CREATE TABLE IF NOT EXISTS icehockey.pickup_match_applicants (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES icehockey.pickup_matches(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES icehockey.users(id) ON DELETE CASCADE,
  position TEXT,
  level TEXT,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (match_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_pickup_match_applicants_match_id ON icehockey.pickup_match_applicants(match_id);
CREATE INDEX IF NOT EXISTS idx_pickup_match_applicants_user_id ON icehockey.pickup_match_applicants(user_id);
CREATE INDEX IF NOT EXISTS idx_pickup_match_applicants_status ON icehockey.pickup_match_applicants(status);
CREATE INDEX IF NOT EXISTS idx_pickup_match_applicants_payment_status ON icehockey.pickup_match_applicants(payment_status);

-- 2-83. player_class_histories
CREATE TABLE IF NOT EXISTS icehockey.player_class_histories (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES icehockey.club_members(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES icehockey.classes(id) ON DELETE CASCADE,
  enrollment_id TEXT UNIQUE REFERENCES icehockey.enrollments(id) ON DELETE SET NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  total_sessions INTEGER NOT NULL DEFAULT 0,
  attended_sessions INTEGER NOT NULL DEFAULT 0,
  attendance_rate INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  coach_comment TEXT,
  final_score INTEGER,
  certificate_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (member_id, class_id)
);
CREATE INDEX IF NOT EXISTS idx_player_class_histories_member_id ON icehockey.player_class_histories(member_id);
CREATE INDEX IF NOT EXISTS idx_player_class_histories_class_id ON icehockey.player_class_histories(class_id);
CREATE INDEX IF NOT EXISTS idx_player_class_histories_status ON icehockey.player_class_histories(status);
CREATE INDEX IF NOT EXISTS idx_player_class_histories_start_date ON icehockey.player_class_histories(start_date);
CREATE INDEX IF NOT EXISTS idx_player_class_histories_member_id_status ON icehockey.player_class_histories(member_id, status);

-- 2-84. player_awards
CREATE TABLE IF NOT EXISTS icehockey.player_awards (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES icehockey.club_members(id) ON DELETE CASCADE,
  award_name TEXT NOT NULL,
  award_type TEXT NOT NULL,
  description TEXT,
  awarded_at TIMESTAMPTZ NOT NULL,
  tournament_id TEXT REFERENCES icehockey.tournaments(id) ON DELETE SET NULL,
  match_id TEXT REFERENCES icehockey.hockey_matches(id) ON DELETE SET NULL,
  season TEXT,
  awarded_by TEXT,
  certificate_url TEXT,
  image_url TEXT,
  is_displayed BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_player_awards_member_id ON icehockey.player_awards(member_id);
CREATE INDEX IF NOT EXISTS idx_player_awards_award_type ON icehockey.player_awards(award_type);
CREATE INDEX IF NOT EXISTS idx_player_awards_awarded_at ON icehockey.player_awards(awarded_at);
CREATE INDEX IF NOT EXISTS idx_player_awards_tournament_id ON icehockey.player_awards(tournament_id);
CREATE INDEX IF NOT EXISTS idx_player_awards_season ON icehockey.player_awards(season);
CREATE INDEX IF NOT EXISTS idx_player_awards_is_displayed ON icehockey.player_awards(is_displayed);
CREATE INDEX IF NOT EXISTS idx_player_awards_member_id_is_displayed ON icehockey.player_awards(member_id, is_displayed);

-- 2-85. team_awards
CREATE TABLE IF NOT EXISTS icehockey.team_awards (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES icehockey.teams(id) ON DELETE CASCADE,
  award_name TEXT NOT NULL,
  award_type TEXT NOT NULL,
  description TEXT,
  awarded_at TIMESTAMPTZ NOT NULL,
  tournament_id TEXT REFERENCES icehockey.tournaments(id) ON DELETE SET NULL,
  season TEXT,
  awarded_by TEXT,
  certificate_url TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_team_awards_team_id ON icehockey.team_awards(team_id);
CREATE INDEX IF NOT EXISTS idx_team_awards_award_type ON icehockey.team_awards(award_type);
CREATE INDEX IF NOT EXISTS idx_team_awards_awarded_at ON icehockey.team_awards(awarded_at);
CREATE INDEX IF NOT EXISTS idx_team_awards_tournament_id ON icehockey.team_awards(tournament_id);
CREATE INDEX IF NOT EXISTS idx_team_awards_season ON icehockey.team_awards(season);

-- 2-86. player_careers
CREATE TABLE IF NOT EXISTS icehockey.player_careers (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES icehockey.club_members(id) ON DELETE CASCADE,
  team_name TEXT NOT NULL,
  position TEXT,
  jersey_number INTEGER,
  league_name TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  is_current BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_player_careers_member_id ON icehockey.player_careers(member_id);
CREATE INDEX IF NOT EXISTS idx_player_careers_is_current ON icehockey.player_careers(is_current);
CREATE INDEX IF NOT EXISTS idx_player_careers_start_date ON icehockey.player_careers(start_date);
CREATE INDEX IF NOT EXISTS idx_player_careers_member_id_is_current ON icehockey.player_careers(member_id, is_current);

-- 2-87. staff_careers
CREATE TABLE IF NOT EXISTS icehockey.staff_careers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES icehockey.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  organization_name TEXT NOT NULL,
  league_name TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  is_current BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  certifications TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_staff_careers_user_id ON icehockey.staff_careers(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_careers_role ON icehockey.staff_careers(role);
CREATE INDEX IF NOT EXISTS idx_staff_careers_is_current ON icehockey.staff_careers(is_current);
CREATE INDEX IF NOT EXISTS idx_staff_careers_start_date ON icehockey.staff_careers(start_date);
CREATE INDEX IF NOT EXISTS idx_staff_careers_user_id_is_current ON icehockey.staff_careers(user_id, is_current);

-- 2-88. push_notification_logs
CREATE TABLE IF NOT EXISTS icehockey.push_notification_logs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_value TEXT,
  sent_by TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_notification_logs_target_type ON icehockey.push_notification_logs(target_type);
CREATE INDEX IF NOT EXISTS idx_push_notification_logs_status ON icehockey.push_notification_logs(status);
CREATE INDEX IF NOT EXISTS idx_push_notification_logs_sent_by ON icehockey.push_notification_logs(sent_by);
CREATE INDEX IF NOT EXISTS idx_push_notification_logs_sent_at ON icehockey.push_notification_logs(sent_at);

-- 2-89. venue_time_slots
CREATE TABLE IF NOT EXISTS icehockey.venue_time_slots (
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES icehockey.venues(id),
  date DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  slot_type TEXT NOT NULL DEFAULT 'open',
  status TEXT NOT NULL DEFAULT 'available',
  price DECIMAL(10,2),
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (venue_id, date, start_time)
);
CREATE INDEX IF NOT EXISTS idx_venue_time_slots_venue_id ON icehockey.venue_time_slots(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_time_slots_date ON icehockey.venue_time_slots(date);
CREATE INDEX IF NOT EXISTS idx_venue_time_slots_status ON icehockey.venue_time_slots(status);

-- 2-90. venue_rental_contracts
CREATE TABLE IF NOT EXISTS icehockey.venue_rental_contracts (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES icehockey.clubs(id),
  venue_id TEXT NOT NULL REFERENCES icehockey.venues(id),
  title TEXT NOT NULL,
  contract_type TEXT NOT NULL DEFAULT 'monthly',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  monthly_fee DECIMAL(10,2),
  total_amount DECIMAL(10,2),
  deposit_amount DECIMAL(10,2),
  status TEXT NOT NULL DEFAULT 'draft',
  signed_at TIMESTAMPTZ,
  memo TEXT,
  created_by_id TEXT NOT NULL REFERENCES icehockey.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_venue_rental_contracts_club_id ON icehockey.venue_rental_contracts(club_id);
CREATE INDEX IF NOT EXISTS idx_venue_rental_contracts_venue_id ON icehockey.venue_rental_contracts(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_rental_contracts_status ON icehockey.venue_rental_contracts(status);

-- 2-91. venue_rental_schedules
CREATE TABLE IF NOT EXISTS icehockey.venue_rental_schedules (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES icehockey.venue_rental_contracts(id),
  venue_id TEXT NOT NULL REFERENCES icehockey.venues(id),
  club_id TEXT NOT NULL REFERENCES icehockey.clubs(id),
  title TEXT NOT NULL,
  training_type icehockey."TrainingType" NOT NULL DEFAULT 'REGULAR_TRAINING',
  day_of_week INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  price_per_session DECIMAL(10,2),
  color_code TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_venue_rental_schedules_contract_id ON icehockey.venue_rental_schedules(contract_id);
CREATE INDEX IF NOT EXISTS idx_venue_rental_schedules_venue_id ON icehockey.venue_rental_schedules(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_rental_schedules_club_id ON icehockey.venue_rental_schedules(club_id);
CREATE INDEX IF NOT EXISTS idx_venue_rental_schedules_day_of_week ON icehockey.venue_rental_schedules(day_of_week);

-- 2-92. venue_bookings
CREATE TABLE IF NOT EXISTS icehockey.venue_bookings (
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES icehockey.venues(id),
  time_slot_id TEXT REFERENCES icehockey.venue_time_slots(id),
  club_id TEXT REFERENCES icehockey.clubs(id),
  contract_id TEXT REFERENCES icehockey.venue_rental_contracts(id),
  schedule_id TEXT REFERENCES icehockey.venue_rental_schedules(id),
  booked_by_id TEXT NOT NULL REFERENCES icehockey.users(id),
  date DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  purpose TEXT,
  total_price DECIMAL(10,2),
  status TEXT NOT NULL DEFAULT 'pending',
  cancel_reason TEXT,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_venue_bookings_venue_id ON icehockey.venue_bookings(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_bookings_club_id ON icehockey.venue_bookings(club_id);
CREATE INDEX IF NOT EXISTS idx_venue_bookings_contract_id ON icehockey.venue_bookings(contract_id);
CREATE INDEX IF NOT EXISTS idx_venue_bookings_schedule_id ON icehockey.venue_bookings(schedule_id);
CREATE INDEX IF NOT EXISTS idx_venue_bookings_booked_by_id ON icehockey.venue_bookings(booked_by_id);
CREATE INDEX IF NOT EXISTS idx_venue_bookings_date ON icehockey.venue_bookings(date);
CREATE INDEX IF NOT EXISTS idx_venue_bookings_status ON icehockey.venue_bookings(status);

-- 2-93. venue_holidays
CREATE TABLE IF NOT EXISTS icehockey.venue_holidays (
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES icehockey.venues(id),
  date DATE NOT NULL,
  reason TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'holiday',
  is_all_day BOOLEAN NOT NULL DEFAULT true,
  start_time TEXT,
  end_time TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (venue_id, date)
);
CREATE INDEX IF NOT EXISTS idx_venue_holidays_venue_id ON icehockey.venue_holidays(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_holidays_date ON icehockey.venue_holidays(date);

-- 2-94. camps
CREATE TABLE IF NOT EXISTS icehockey.camps (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES icehockey.clubs(id),
  name TEXT NOT NULL,
  description TEXT,
  venue_id TEXT REFERENCES icehockey.venues(id),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  max_capacity INTEGER,
  price DECIMAL(10,2),
  accommodation TEXT,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_camps_club_id ON icehockey.camps(club_id);
CREATE INDEX IF NOT EXISTS idx_camps_start_date ON icehockey.camps(start_date);
CREATE INDEX IF NOT EXISTS idx_camps_status ON icehockey.camps(status);

-- 2-95. camp_registrations
CREATE TABLE IF NOT EXISTS icehockey.camp_registrations (
  id TEXT PRIMARY KEY,
  camp_id TEXT NOT NULL REFERENCES icehockey.camps(id),
  member_id TEXT NOT NULL REFERENCES icehockey.club_members(id),
  status TEXT NOT NULL DEFAULT 'pending',
  paid_amount DECIMAL(10,2),
  payment_id TEXT,
  memo TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  UNIQUE (camp_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_camp_registrations_camp_id ON icehockey.camp_registrations(camp_id);
CREATE INDEX IF NOT EXISTS idx_camp_registrations_member_id ON icehockey.camp_registrations(member_id);
CREATE INDEX IF NOT EXISTS idx_camp_registrations_status ON icehockey.camp_registrations(status);

-- 2-96. lesson_packages
CREATE TABLE IF NOT EXISTS icehockey.lesson_packages (
  id TEXT PRIMARY KEY,
  club_id TEXT REFERENCES icehockey.clubs(id),
  name TEXT NOT NULL,
  description TEXT,
  training_type TEXT NOT NULL,
  venue_id TEXT REFERENCES icehockey.venues(id),
  total_sessions INTEGER NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  day_of_week TEXT,
  start_time TEXT,
  end_time TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  session_dates JSONB,
  max_capacity INTEGER,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lesson_packages_club_id ON icehockey.lesson_packages(club_id);
CREATE INDEX IF NOT EXISTS idx_lesson_packages_status ON icehockey.lesson_packages(status);
CREATE INDEX IF NOT EXISTS idx_lesson_packages_training_type ON icehockey.lesson_packages(training_type);

-- 2-97. lesson_package_enrollments
CREATE TABLE IF NOT EXISTS icehockey.lesson_package_enrollments (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL REFERENCES icehockey.lesson_packages(id),
  member_id TEXT NOT NULL REFERENCES icehockey.club_members(id),
  status TEXT NOT NULL DEFAULT 'enrolled',
  attended_count INTEGER NOT NULL DEFAULT 0,
  paid_amount DECIMAL(10,2),
  payment_id TEXT,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (package_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_lesson_package_enrollments_package_id ON icehockey.lesson_package_enrollments(package_id);
CREATE INDEX IF NOT EXISTS idx_lesson_package_enrollments_member_id ON icehockey.lesson_package_enrollments(member_id);
CREATE INDEX IF NOT EXISTS idx_lesson_package_enrollments_status ON icehockey.lesson_package_enrollments(status);

-- 2-98. game_expenses
CREATE TABLE IF NOT EXISTS icehockey.game_expenses (
  id TEXT PRIMARY KEY,
  match_id TEXT REFERENCES icehockey.hockey_matches(id),
  tournament_id TEXT REFERENCES icehockey.tournaments(id),
  club_id TEXT NOT NULL REFERENCES icehockey.clubs(id),
  category TEXT NOT NULL,
  description TEXT,
  amount DECIMAL(10,2) NOT NULL,
  paid_by_id TEXT,
  receipt_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_game_expenses_match_id ON icehockey.game_expenses(match_id);
CREATE INDEX IF NOT EXISTS idx_game_expenses_tournament_id ON icehockey.game_expenses(tournament_id);
CREATE INDEX IF NOT EXISTS idx_game_expenses_club_id ON icehockey.game_expenses(club_id);
CREATE INDEX IF NOT EXISTS idx_game_expenses_category ON icehockey.game_expenses(category);
CREATE INDEX IF NOT EXISTS idx_game_expenses_status ON icehockey.game_expenses(status);

-- 2-99. common_code_groups
CREATE TABLE IF NOT EXISTS icehockey.common_code_groups (
  id TEXT PRIMARY KEY,
  group_code TEXT NOT NULL UNIQUE,
  group_name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by_id TEXT NOT NULL REFERENCES icehockey.users(id),
  updated_by_id TEXT REFERENCES icehockey.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_common_code_groups_is_active ON icehockey.common_code_groups(is_active);
CREATE INDEX IF NOT EXISTS idx_common_code_groups_sort_order ON icehockey.common_code_groups(sort_order);

-- 2-100. common_codes
CREATE TABLE IF NOT EXISTS icehockey.common_codes (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES icehockey.common_code_groups(id),
  parent_id TEXT REFERENCES icehockey.common_codes(id),
  level INTEGER NOT NULL DEFAULT 1,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  value1 TEXT,
  value2 TEXT,
  value3 TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by_id TEXT NOT NULL REFERENCES icehockey.users(id),
  updated_by_id TEXT REFERENCES icehockey.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, code)
);
CREATE INDEX IF NOT EXISTS idx_common_codes_group_id ON icehockey.common_codes(group_id);
CREATE INDEX IF NOT EXISTS idx_common_codes_parent_id ON icehockey.common_codes(parent_id);
CREATE INDEX IF NOT EXISTS idx_common_codes_level ON icehockey.common_codes(level);
CREATE INDEX IF NOT EXISTS idx_common_codes_is_active ON icehockey.common_codes(is_active);
CREATE INDEX IF NOT EXISTS idx_common_codes_sort_order ON icehockey.common_codes(sort_order);

-- 2-101. class_rsvps
CREATE TABLE IF NOT EXISTS icehockey.class_rsvps (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES icehockey.class_schedules(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES icehockey.users(id) ON DELETE CASCADE,
  child_id TEXT REFERENCES icehockey.users(id),
  status TEXT NOT NULL DEFAULT 'PENDING',
  responded_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (schedule_id, user_id, child_id)
);
CREATE INDEX IF NOT EXISTS idx_class_rsvps_schedule_id_status ON icehockey.class_rsvps(schedule_id, status);
CREATE INDEX IF NOT EXISTS idx_class_rsvps_user_id ON icehockey.class_rsvps(user_id);
CREATE INDEX IF NOT EXISTS idx_class_rsvps_status ON icehockey.class_rsvps(status);

-- 2-102. overseas_trips
CREATE TABLE IF NOT EXISTS icehockey.overseas_trips (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES icehockey.clubs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  registration_deadline TIMESTAMPTZ NOT NULL,
  max_participants INTEGER NOT NULL,
  age_group TEXT,
  estimated_cost DECIMAL(10,2) DEFAULT 0,
  deposit_amount DECIMAL(10,2) DEFAULT 0,
  deposit_deadline TIMESTAMPTZ,
  flight_info TEXT,
  hotel_info TEXT,
  transport_info TEXT,
  itinerary TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  contact_phone TEXT,
  contact_email TEXT,
  created_by_id TEXT NOT NULL REFERENCES icehockey.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_overseas_trips_club_id ON icehockey.overseas_trips(club_id);
CREATE INDEX IF NOT EXISTS idx_overseas_trips_status ON icehockey.overseas_trips(status);
CREATE INDEX IF NOT EXISTS idx_overseas_trips_start_date ON icehockey.overseas_trips(start_date);
CREATE INDEX IF NOT EXISTS idx_overseas_trips_registration_deadline ON icehockey.overseas_trips(registration_deadline);

-- 2-103. overseas_trip_registrations
CREATE TABLE IF NOT EXISTS icehockey.overseas_trip_registrations (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES icehockey.overseas_trips(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES icehockey.club_members(id) ON DELETE CASCADE,
  child_id TEXT REFERENCES icehockey.users(id),
  parent_id TEXT NOT NULL REFERENCES icehockey.users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  deposit_paid_at TIMESTAMPTZ,
  deposit_amount DECIMAL(10,2),
  passport_verified BOOLEAN NOT NULL DEFAULT false,
  passport_expiry_date TIMESTAMPTZ,
  special_requirements TEXT,
  emergency_contact TEXT,
  emergency_phone TEXT,
  cancel_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trip_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_overseas_trip_registrations_trip_id ON icehockey.overseas_trip_registrations(trip_id);
CREATE INDEX IF NOT EXISTS idx_overseas_trip_registrations_member_id ON icehockey.overseas_trip_registrations(member_id);
CREATE INDEX IF NOT EXISTS idx_overseas_trip_registrations_status ON icehockey.overseas_trip_registrations(status);

-- 2-104. leagues
CREATE TABLE IF NOT EXISTS icehockey.leagues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  season TEXT NOT NULL,
  year INTEGER NOT NULL,
  description TEXT,
  age_group TEXT,
  region TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  club_id TEXT REFERENCES icehockey.clubs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leagues_season ON icehockey.leagues(season);
CREATE INDEX IF NOT EXISTS idx_leagues_age_group ON icehockey.leagues(age_group);
CREATE INDEX IF NOT EXISTS idx_leagues_status ON icehockey.leagues(status);
CREATE INDEX IF NOT EXISTS idx_leagues_club_id ON icehockey.leagues(club_id);

-- 2-105. divisions
CREATE TABLE IF NOT EXISTS icehockey.divisions (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES icehockey.leagues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  max_teams INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_divisions_league_id ON icehockey.divisions(league_id);
CREATE INDEX IF NOT EXISTS idx_divisions_level ON icehockey.divisions(level);
CREATE INDEX IF NOT EXISTS idx_divisions_sort_order ON icehockey.divisions(sort_order);

-- 2-106. team_divisions
CREATE TABLE IF NOT EXISTS icehockey.team_divisions (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES icehockey.teams(id) ON DELETE CASCADE,
  division_id TEXT NOT NULL REFERENCES icehockey.divisions(id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'active',
  seed INTEGER,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  UNIQUE (team_id, division_id, season)
);
CREATE INDEX IF NOT EXISTS idx_team_divisions_division_id ON icehockey.team_divisions(division_id);
CREATE INDEX IF NOT EXISTS idx_team_divisions_season ON icehockey.team_divisions(season);
CREATE INDEX IF NOT EXISTS idx_team_divisions_status ON icehockey.team_divisions(status);

-- 2-107. tournament_matches
CREATE TABLE IF NOT EXISTS icehockey.tournament_matches (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES icehockey.tournaments(id) ON DELETE CASCADE,
  division_id TEXT REFERENCES icehockey.divisions(id),
  home_team_id TEXT NOT NULL REFERENCES icehockey.teams(id),
  away_team_id TEXT NOT NULL REFERENCES icehockey.teams(id),
  match_date TIMESTAMPTZ NOT NULL,
  start_time TEXT,
  end_time TEXT,
  venue_id TEXT REFERENCES icehockey.venues(id),
  round TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  home_score INTEGER,
  away_score INTEGER,
  period TEXT,
  referee TEXT,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament_id_match_date ON icehockey.tournament_matches(tournament_id, match_date);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_division_id ON icehockey.tournament_matches(division_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_home_team_id ON icehockey.tournament_matches(home_team_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_away_team_id ON icehockey.tournament_matches(away_team_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_venue_id ON icehockey.tournament_matches(venue_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_status ON icehockey.tournament_matches(status);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_match_date ON icehockey.tournament_matches(match_date);

-- 2-108. tms_posts
CREATE TABLE IF NOT EXISTS icehockey.tms_posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'web',
  category TEXT NOT NULL DEFAULT 'bug',
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'todo',
  author_name TEXT NOT NULL,
  author_email TEXT,
  assignee TEXT,
  due_date DATE,
  view_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tms_posts_platform ON icehockey.tms_posts(platform);
CREATE INDEX IF NOT EXISTS idx_tms_posts_category ON icehockey.tms_posts(category);
CREATE INDEX IF NOT EXISTS idx_tms_posts_status ON icehockey.tms_posts(status);
CREATE INDEX IF NOT EXISTS idx_tms_posts_priority ON icehockey.tms_posts(priority);
CREATE INDEX IF NOT EXISTS idx_tms_posts_is_active ON icehockey.tms_posts(is_active);
CREATE INDEX IF NOT EXISTS idx_tms_posts_created_at ON icehockey.tms_posts(created_at);

-- 2-109. tms_attachments
CREATE TABLE IF NOT EXISTS icehockey.tms_attachments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES icehockey.tms_posts(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tms_attachments_post_id ON icehockey.tms_attachments(post_id);

-- 2-110. tms_comments
CREATE TABLE IF NOT EXISTS icehockey.tms_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES icehockey.tms_posts(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tms_comments_post_id ON icehockey.tms_comments(post_id);

-- =============================================================
-- 3. 최종 검증 쿼리
-- =============================================================

SELECT
  'ENUM COUNT' AS check_type,
  COUNT(*) AS cnt
FROM pg_type t
JOIN pg_namespace n ON t.typnamespace = n.oid
WHERE n.nspname = 'icehockey'
  AND t.typtype = 'e'

UNION ALL

SELECT
  'TABLE COUNT' AS check_type,
  COUNT(*) AS cnt
FROM information_schema.tables
WHERE table_schema = 'icehockey'
  AND table_type = 'BASE TABLE';
