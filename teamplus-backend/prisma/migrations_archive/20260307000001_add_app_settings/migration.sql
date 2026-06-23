-- AppSettings 싱글턴 테이블 생성
-- 앱 전체 운영 설정 (1개 레코드만 유지)
CREATE TABLE `app_settings` (
  `id` VARCHAR(191) NOT NULL,

  -- 앱 기본 정보
  `app_name` VARCHAR(191) NOT NULL DEFAULT 'teamplus',
  `app_version` VARCHAR(191) NOT NULL DEFAULT '1.0.0',
  `api_url` VARCHAR(191) NOT NULL DEFAULT 'http://localhost:5003',

  -- 고객 지원
  `support_email` VARCHAR(191) NOT NULL DEFAULT 'admin@teamplus.com',
  `support_phone` VARCHAR(191) NULL,

  -- 시스템 모드
  `maintenance_mode` BOOLEAN NOT NULL DEFAULT false,
  `maintenance_message` TEXT NULL,
  `debug_mode` BOOLEAN NOT NULL DEFAULT false,

  -- 서버 설정
  `max_upload_size` INTEGER NOT NULL DEFAULT 10,
  `session_timeout` INTEGER NOT NULL DEFAULT 60,

  -- 앱 버전 관리
  `minimum_app_version_ios` VARCHAR(191) NOT NULL DEFAULT '1.0.0',
  `minimum_app_version_and` VARCHAR(191) NOT NULL DEFAULT '1.0.0',
  `force_update_message` TEXT NULL,

  -- 회원/인증 설정
  `signup_enabled` BOOLEAN NOT NULL DEFAULT true,
  `social_login_enabled` BOOLEAN NOT NULL DEFAULT true,
  `max_login_attempts` INTEGER NOT NULL DEFAULT 5,

  -- 크레딧/QR 설정
  `credit_expire_days` INTEGER NOT NULL DEFAULT 90,
  `qr_expire_minutes` INTEGER NOT NULL DEFAULT 5,

  -- 약관 버전
  `terms_version` VARCHAR(191) NOT NULL DEFAULT '1.0',
  `privacy_version` VARCHAR(191) NOT NULL DEFAULT '1.0',

  -- 메타데이터
  `updated_by` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
