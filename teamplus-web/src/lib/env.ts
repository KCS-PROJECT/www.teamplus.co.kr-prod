/**
 * 환경 변수 검증 및 타입 안전 액세스 (SoT · Single Source of Truth)
 *
 * 애플리케이션 시작 시 필수 환경 변수를 검증하고,
 * 타입 안전한 방식으로 환경 변수에 접근할 수 있도록 합니다.
 *
 * @example
 * import { env, PORTS } from '@/lib/env';
 * const apiUrl = env.NEXT_PUBLIC_API_URL;   // 소비처 표준
 * const webPort = PORTS.web;                // 포트 상수
 */

import { devLog, devError, devWarn } from '@/lib/logger';

/**
 * 프로젝트 포트 상수 (SoT).
 * 이 값이 모든 fallback · CSP · 문서의 기준이 된다.
 * 포트 변경 시 이 객체만 수정하면 fallback 전체가 동기화된다.
 */
export const PORTS = {
  backend: 5003,
  web: 5001,
  admin: 5002,
} as const;

/**
 * 환경 변수 스키마 타입
 */
interface EnvSchema {
  required: boolean;
  default: string;
  description: string;
  /** 유효성 검증 함수 */
  validate?: (value: string) => boolean;
  /** 유효하지 않은 값일 때 에러 메시지 */
  errorMessage?: string;
  /** 프로덕션에서 필수 여부 (required보다 우선) */
  requiredInProduction?: boolean;
}

/**
 * URL 형식 검증
 */
function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * 허용된 환경 값 목록
 */
const ALLOWED_ENVIRONMENTS = ['development', 'staging', 'production'] as const;
type Environment = (typeof ALLOWED_ENVIRONMENTS)[number];

// 필수 공개 환경 변수 (클라이언트에서 접근 가능)
const publicEnvSchema: Record<string, EnvSchema> = {
  NEXT_PUBLIC_API_URL: {
    required: true,
    default: `http://localhost:${PORTS.backend}`,
    description: 'Backend API URL',
    validate: isValidUrl,
    errorMessage: '유효한 URL 형식이 아닙니다',
    requiredInProduction: true,
  },
  NEXT_PUBLIC_WS_URL: {
    required: false,
    default: `http://localhost:${PORTS.backend}`,
    description: 'WebSocket 서버 URL (미설정 시 API URL 과 동일 호스트)',
    validate: isValidUrl,
    errorMessage: '유효한 URL 형식이 아닙니다',
  },
  NEXT_PUBLIC_WEB_ORIGIN: {
    required: false,
    default: `http://localhost:${PORTS.web}`,
    description: 'Web 프론트엔드 Origin (브릿지 보안 허용 목록 기본값)',
    validate: isValidUrl,
    errorMessage: '유효한 URL 형식이 아닙니다',
  },
  NEXT_PUBLIC_APP_NAME: {
    required: false,
    default: 'TEAMPLUS',
    description: 'Application name',
  },
  NEXT_PUBLIC_ENVIRONMENT: {
    required: false,
    default: 'development',
    description: 'Current environment (development, staging, production)',
    validate: (value) => ALLOWED_ENVIRONMENTS.includes(value as Environment),
    errorMessage: `허용된 값: ${ALLOWED_ENVIRONMENTS.join(', ')}`,
  },
  NEXT_PUBLIC_KAKAO_JS_KEY: {
    required: false,
    default: '',
    description: '카카오 JavaScript SDK 키 (developers.kakao.com → 내 앱 → JavaScript 키). 미설정 시 SNS 공유 시트의 카카오톡 버튼이 비활성화된다.',
  },
  NEXT_PUBLIC_IOS_APP_STORE_ID: {
    required: false,
    default: '',
    description: 'iOS App Store 숫자 ID (예: 1234567890). 미설정 시 /get-app 페이지의 iOS 버튼이 placeholder URL로 이동한다.',
  },
  NEXT_PUBLIC_ANDROID_PACKAGE_NAME: {
    required: false,
    default: 'kr.co.teamplus.app',
    description: 'Android Play Store 패키지명 (예: kr.co.teamplus.app). 앱 빌드 applicationId 와 반드시 일치해야 한다.',
  },
} as const;

// 서버 전용 환경 변수 (클라이언트에서 접근 불가)
const serverEnvSchema: Record<string, EnvSchema> = {
  JWT_SECRET: {
    required: false, // 서버에서만 사용되므로 프론트엔드에서는 선택사항
    default: '',
    description: 'JWT signing secret',
    requiredInProduction: true,
    validate: (value) => value.length >= 32,
    errorMessage: 'JWT_SECRET은 최소 32자 이상이어야 합니다',
  },
  DATABASE_URL: {
    required: false,
    default: '',
    description: 'Database connection URL',
    requiredInProduction: true,
    validate: isValidUrl,
    errorMessage: '유효한 데이터베이스 URL 형식이 아닙니다',
  },
} as const;

/**
 * 환경 변수 검증 결과
 */
/**
 * 환경 변수 값 가져오기 (향상된 검증)
 */
function getEnvValue(key: string, schema: EnvSchema): string {
  const value = process.env[key];
  const isProd = process.env.NODE_ENV === 'production';

  // 필수값 검증
  const isRequired = schema.requiredInProduction && isProd
    ? true
    : schema.required;

  if (!value) {
    if (isRequired) {
      const message = `환경 변수 ${key}가 설정되지 않았습니다.`;

      if (isProd) {
        devError(`[ENV ERROR] ${message}`);
        throw new Error(message);
      } else {
        devWarn(`[ENV WARN] ${message} 기본값 사용: ${schema.default || '(빈 값)'}`);
      }
    }
    return schema.default;
  }

  // 유효성 검증
  if (schema.validate && !schema.validate(value)) {
    const message = `환경 변수 ${key}가 유효하지 않습니다. ${schema.errorMessage || ''}`;

    if (isProd) {
      devError(`[ENV ERROR] ${message}`);
      throw new Error(message);
    } else {
      devWarn(`[ENV WARN] ${message} (현재값: ${value})`);
    }
  }

  return value;
}

/**
 * 공개 환경 변수 (클라이언트에서 접근 가능)
 */
export const env = {
  // ⚠️ Next.js 환경변수 인라인 규칙:
  //   NEXT_PUBLIC_* 는 반드시 정적 접근(process.env.NAME) 으로 참조해야 빌드 시점에
  //   클라이언트 번들로 치환된다. process.env[key] · 함수 래퍼 같은 동적 접근은
  //   클라이언트에서 undefined 가 되어 fallback 만 사용되므로 금지.
  //   fallback 값은 PORTS 상수에서 파생 — 포트 변경 시 PORTS 한 곳만 수정.

  // API URL
  NEXT_PUBLIC_API_URL:
    process.env.NEXT_PUBLIC_API_URL || `http://localhost:${PORTS.backend}`,

  // WebSocket URL (미설정 시 API URL 재사용)
  NEXT_PUBLIC_WS_URL:
    process.env.NEXT_PUBLIC_WS_URL
    || process.env.NEXT_PUBLIC_API_URL
    || `http://localhost:${PORTS.backend}`,

  // Web 프론트엔드 Origin (브릿지 보안 허용 목록 기본값)
  NEXT_PUBLIC_WEB_ORIGIN:
    process.env.NEXT_PUBLIC_WEB_ORIGIN || `http://localhost:${PORTS.web}`,

  // 앱 이름 (정적 접근)
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || 'TEAMPLUS',

  // 환경 (정적 접근 · 상세 유효성 검증은 서버사이드 validateEnv() 에서 수행)
  NEXT_PUBLIC_ENVIRONMENT: process.env.NEXT_PUBLIC_ENVIRONMENT || 'development',

  // 카카오 JS SDK 키 (SNS 공유 시트에서 사용 · 미설정 시 카카오 버튼 비활성)
  NEXT_PUBLIC_KAKAO_JS_KEY: process.env.NEXT_PUBLIC_KAKAO_JS_KEY || '',

  // App Store / Play Store — /get-app 설치 안내 페이지 · AppInstallBanner · deeplink fallback 에서 사용
  // iOS App Store 숫자 ID. 미설정 시 검색 페이지로 fallback.
  NEXT_PUBLIC_IOS_APP_STORE_ID: process.env.NEXT_PUBLIC_IOS_APP_STORE_ID || '',
  // Android Play Store 패키지명. app/build.gradle 의 applicationId 와 동일해야 한다.
  NEXT_PUBLIC_ANDROID_PACKAGE_NAME:
    process.env.NEXT_PUBLIC_ANDROID_PACKAGE_NAME || 'kr.co.teamplus.app',

  // 환경 헬퍼
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
} as const;

/**
 * 서버 전용 환경 변수 (서버 컴포넌트/API에서만 사용)
 *
 * 주의: 이 객체는 클라이언트 번들에 포함되지 않도록 해야 합니다.
 */
export const serverEnv = {
  JWT_SECRET: typeof window === 'undefined'
    ? getEnvValue('JWT_SECRET', serverEnvSchema.JWT_SECRET)
    : '',
  DATABASE_URL: typeof window === 'undefined'
    ? getEnvValue('DATABASE_URL', serverEnvSchema.DATABASE_URL)
    : '',
} as const;

/**
 * 환경 변수 검증 결과 상세
 */
interface EnvValidationReport {
  valid: boolean;
  missing: string[];
  invalid: Array<{ key: string; error: string }>;
  warnings: string[];
}

/**
 * 환경 변수 검증 함수 (향상된 버전)
 *
 * 애플리케이션 시작 시 호출하여 모든 필수 환경 변수가 설정되었는지 확인
 */
export function validateEnv(): EnvValidationReport {
  const isProd = process.env.NODE_ENV === 'production';
  const missing: string[] = [];
  const invalid: Array<{ key: string; error: string }> = [];
  const warnings: string[] = [];

  // 스키마 검증 함수
  const validateSchema = (key: string, schema: EnvSchema) => {
    const value = process.env[key];
    const isRequired = (schema.requiredInProduction && isProd) || schema.required;

    // 필수값 누락 체크
    if (isRequired && !value) {
      missing.push(key);
      return;
    }

    // 유효성 검증
    if (value && schema.validate && !schema.validate(value)) {
      invalid.push({
        key,
        error: schema.errorMessage || '유효하지 않은 값',
      });
    }

    // 프로덕션에서 기본값 사용 경고
    if (isProd && !value && schema.default) {
      warnings.push(`${key}: 기본값 사용 중 (권장하지 않음)`);
    }
  };

  // 공개 환경 변수 검증
  for (const [key, schema] of Object.entries(publicEnvSchema)) {
    validateSchema(key, schema);
  }

  // 서버 전용 환경 변수 검증 (서버 사이드에서만)
  if (typeof window === 'undefined') {
    for (const [key, schema] of Object.entries(serverEnvSchema)) {
      validateSchema(key, schema);
    }
  }

  // 결과 로깅
  if (missing.length > 0) {
    devError('[ENV ERROR] 누락된 환경 변수:', missing.join(', '));
  }
  if (invalid.length > 0) {
    devError('[ENV ERROR] 유효하지 않은 환경 변수:', invalid.map(i => `${i.key}: ${i.error}`).join(', '));
  }
  if (warnings.length > 0 && isProd) {
    devWarn('[ENV WARN]', warnings.join('; '));
  }

  return {
    valid: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
    warnings,
  };
}

/**
 * 앱 시작 시 환경 변수 검증 (프로덕션에서 실패 시 예외 발생)
 */
export function assertEnvValid(): void {
  const result = validateEnv();

  if (!result.valid && process.env.NODE_ENV === 'production') {
    const errors = [
      ...result.missing.map(k => `Missing: ${k}`),
      ...result.invalid.map(i => `Invalid: ${i.key} - ${i.error}`),
    ];
    throw new Error(`환경 변수 검증 실패:\n${errors.join('\n')}`);
  }
}

/**
 * 환경 변수 디버그 출력 (개발 환경에서만)
 */
export function debugEnv(): void {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  devLog('[ENV Debug]', {
    NEXT_PUBLIC_API_URL: env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_APP_NAME: env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_ENVIRONMENT: env.NEXT_PUBLIC_ENVIRONMENT,
    NODE_ENV: process.env.NODE_ENV,
  });
}
