# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 프로젝트 개요

**TEAMPLUS Backend** — 아이스하키 클럽 관리 플랫폼 API 서버.

**Stack**: NestJS 10 · Prisma 5.7 · PostgreSQL 16 · Redis 7 · Bull 4 (큐) · Socket.IO 4 · TypeScript 5.3

**Port**: 5003 | **Swagger**: `localhost:5003/api/docs` | **Health**: `GET /health`

**규모** (2026-04-19 실측): **68개 .module.ts** · **72개 .controller.ts** · **92개 .service.ts** · **54개 .spec.ts** · **145 Prisma 모델** · 17 Enum · 2개 전역 인터셉터(LoggerInterceptor + **ApiLifecycleInterceptor**) · 3개 Guard · 8개 스케줄 태스크 · 2개 WebSocket 게이트웨이

---

## Quick Start

```bash
docker-compose up -d                     # PostgreSQL 16 + Redis 7
npm install
cp .env.example .env
npm run db:migrate && npm run db:seed    # 마이그레이션 + 시드
npm run start:dev                        # 포트 5003, watch 모드 (prisma:generate 자동 실행)
```

## 개발 명령어

```bash
# 개발
npm run start:dev          # watch + hot-reload (pre: prisma:generate)
npm run start:debug        # 디버그 모드 (inspector)
npm run build              # dist/ 컴파일 (pre: prisma:generate + rimraf)

# 데이터베이스
npm run db:migrate         # prisma migrate dev
npm run db:seed            # tsx prisma/seed.ts
npm run db:studio          # Prisma Studio GUI
npx prisma generate        # 스키마 변경 후 클라이언트 재생성

# 테스트
npm test                   # Jest (rootDir: src/, *.spec.ts)
npm test -- auth.spec      # 특정 파일
npm run test:cov           # 커버리지
npm run test:e2e           # E2E (test/jest-e2e.json)

# 코드 품질
npm run lint               # ESLint --fix
npm run format             # Prettier

# 업로드 진단 (v2.4 · 2026-05-23)
npm run uploads:doctor             # DB ↔ 디스크 정합성 점검 (Missing/Orphan/통계)
npm run uploads:doctor:json        # JSON 출력 (모니터링 통합용)
npm run uploads:cleanup-orphans    # 디스크 orphan 파일 자동 정리

# 배포
npm run deploy:prod        # build:all (web+backend) + pm2 restart teamplus-api
```

---

## 아키텍처

### Global Providers (app.module.ts + main.ts)

| Provider                  | 등록 위치       | 역할                                                                                                                                                                                       |
| ------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ThrottlerGuard`          | APP_GUARD       | Redis 기반 Rate Limiting, 100 req/min                                                                                                                                                      |
| `JwtAuthGuard`            | APP_GUARD       | JWT 전역 인증 (@Public()로 바이패스)                                                                                                                                                       |
| `ApiLifecycleInterceptor` | APP_INTERCEPTOR | **[신규 v8.5]** X-Request-ID 생성·X-Client-Platform/Version 파싱·X-Response-Time 주입·UserActivityService Redis 5분 throttle로 User.lastActiveAt 갱신·1초 초과 시 `[SLA_BREACH]` WARN 로그 |
| `LoggerInterceptor`       | APP_INTERCEPTOR | Pino 구조화 요청/응답 로깅 (X-Request-ID 연동)                                                                                                                                             |
| `AllExceptionsFilter`     | main.ts         | 전역 예외 처리 + Prisma 에러 매핑 + **[신규 v8.5]** 401 응답에 `errorCode: AUTH_REQUIRED` + `redirectTo: /login` 자동 주입                                                                 |
| `SentryExceptionFilter`   | main.ts         | 5xx Sentry 전송 (SENTRY_DSN 있을 때만)                                                                                                                                                     |
| `ValidationPipe`          | main.ts         | whitelist + forbidNonWhitelisted + transform                                                                                                                                               |
| `Helmet`                  | main.ts         | CSP, CORS, 보안 헤더                                                                                                                                                                       |
| `compression`             | main.ts         | **[신규 v8.5]** gzip 응답 압축 (threshold 1KB·level 6 — 대형 응답 85% 감소 실측)                                                                                                           |
| `etag: 'weak'`            | main.ts         | **[신규 v8.5]** compression 통과 후에도 유효한 Weak ETag → 304 재활용                                                                                                                      |
| HTTP keep-alive           | main.ts         | **[신규 v8.5]** keepAliveTimeout=65s, headersTimeout=66s (ALB 60s 대응)                                                                                                                    |

### 인프라 모듈 (Global)

| 모듈                   | 역할                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `prisma/`              | PrismaService (extends PrismaClient, 글로벌 싱글톤)                                                     |
| `redis/`               | RedisService + RedisThrottlerStorage                                                                    |
| `logger/`              | Pino LoggerService + LoggerInterceptor                                                                  |
| `config/`              | ConfigModule.forRoot (.env.local, .env 로드)                                                            |
| `common/interceptors/` | **[신규 v8.5]** InterceptorsModule · ApiLifecycleInterceptor · UserActivityService (Redis 5분 throttle) |

### Feature 모듈 (42개, 2026-04-11)

| 분류              | 모듈                                                                                                                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Core**          | `auth` · `users` · `clubs` · `classes` · `children`                                                                                                                                                |
| **Business**      | `attendance` · `credits` · `payments` · `enrollments` · `shop`                                                                                                                                     |
| **Communication** | `notifications` · `chat` · `websocket` · `sms` · `notices`                                                                                                                                         |
| **Content**       | `community` · `dashboard` · `menus` · `search` · `reviews` · `badges`                                                                                                                              |
| **Competition**   | `tournaments` · `pickup-matches` · `leagues` · `skill-evaluations` · `awards` · **`teams`** (신규 2026-04-11)                                                                                      |
| **Management**    | `admin` · `app-management` · `tms` · `identity` · `academy` · **`moderation`** (신규)                                                                                                              |
| **Extensions**    | `careers` · `overseas-trips` · `academy-promotions` · `waitlist` · `rsvp` · `common-codes` · `training` · `venues` · `videos` · **`common/view-counter`** (1일 1회 조회수 제한, DailyViewLog 기반) |

### 표준 모듈 패턴

```
feature/
├── feature.module.ts         # PrismaModule import 필수
├── feature.controller.ts     # @Controller('api/v1/feature')
├── feature.service.ts        # PrismaService 주입
└── dto/
    ├── create-feature.dto.ts # class-validator + @ApiProperty
    └── update-feature.dto.ts
```

```typescript
@Controller('api/v1/feature')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class FeatureController {
  @Post()
  @Roles('COACH', 'DIRECTOR')
  async create(@Request() req, @Body() dto: CreateFeatureDto) { ... }

  @Get()
  @Public()  // JWT 인증 바이패스
  async findAll() { ... }
}
```

---

## 인증/인가

**JWT**: Access 15분 + Refresh 7일 (`JWT_EXPIRATION` / `JWT_REFRESH_EXPIRATION` 환경변수) · payload 에 `jti`(세션 ID) 포함

**세션 정책 (2026-06-11 재설계)**: refresh 토큰은 **세션별 Redis 키**(`refresh:{userId}:{jti}`) 저장. 운영 = 단일 세션(활성 세션 존재 시 로그인 409 `SESSION_EXISTS` → 확인 모달 → `force` 재요청 시 기존 세션 즉시 종료 + tokenVersion +1) / 개발 = `AUTH_ALLOW_CONCURRENT_LOGIN=true` 로 중복 허용. reuse 오판 시 키 전체 삭제 금지(해당 요청만 401) · grace 60초 멱등 반환 → **상세 SoT: [AUTH_SESSION_POLICY](../docs/Architecture/AUTH_SESSION_POLICY.md)**

**Guard 체인**: `AuthGuard('jwt')` (Passport + Redis 블랙리스트) → `RolesGuard` (RBAC)

**데코레이터**: `@Public()` (JWT 바이패스) · `@Roles('ADMIN', 'COACH', ...)`

**UserType** (9개, 2026-04-20 v8.6): `SYSTEM`(ADM 전용) · `OPER`(ADM 전용) · `ADMIN` · `DIRECTOR` · **`ACADEMY_DIRECTOR`** · `COACH` · `PARENT` · `TEEN` · `CHILD`

**chldiv 로그인 분기** (2026-04-20 v8.6):

- `POST /api/v1/auth/login` — chldiv=APP (teamplus-web · teamplus-app · tbot) — 허용: PARENT/COACH/CHILD/DIRECTOR/TEEN/ADMIN/ACADEMY_DIRECTOR
- `POST /api/v1/auth/admin/login` — chldiv=ADM (teamplus-admin) — 허용: SYSTEM/OPER 만
- 가드: `src/auth/constants/chldiv.constants.ts` `CHLDIV_ALLOWED_USER_TYPES`
- 차단 응답: 401 "해당 화면에서는 로그인할 수 없는 계정입니다."

**⚠️ @Roles() 누락 컨트롤러** (2026-04-11 분석 결과, 코드 수정 필요):

- `EnrollmentsController` — 7개 엔드포인트 전체 `@Roles` 없음
- `WaitlistController` — 5개 엔드포인트 `@Roles` 없음
- `TmsController` — 전체 `@Roles` 없음
- `POST /db-migrate-temp`, `POST /db-seed-users` (app.controller.ts) — `$executeRawUnsafe` 포함 + 가드 없음, **배포 전 삭제 대상**

**보안 서비스**: `AccountLockoutService` · `CryptoService` · `AuditService` · `WithdrawCleanupService`

---

## 데이터베이스 (Prisma)

- **스키마**: `prisma/schema.prisma` — **145 모델**, 17 enum (2026-04-19 실측, `grep -c "^model " schema.prisma`). 최근 추가: `User.lastActiveAt`(API Lifecycle 활동 추적, 마이그레이션 `20260419000000_add_user_last_active_at`)
- **최근 추가 모델** (2026-04-11): `DailyViewLog` (1일 1회 조회수 제한), `UserBlock`, `UserReport`, `Team`/`TeamRoster`/`TeamDivision`/`TeamAward` 등
- **DB**: PostgreSQL 16 (Docker, MariaDB에서 마이그레이션)
- **Path alias**: `@/*` → `src/*` (tsconfig.json + jest moduleNameMapper)
- **No repository layer**: 서비스가 `PrismaService` 직접 주입

**트랜잭션 패턴** (다중 뮤테이션 필수):

```typescript
await this.prisma.$transaction(async (tx) => {
  const credit = await tx.memberCredit.create({ data: { ... } });
  await tx.creditTransaction.create({ data: { ... } });
  return credit;
});
```

**쿼리 최적화**: 항상 `select`로 필요 필드만 명시. `include`는 관계 데이터 필요시만. `findMany()` without `select` 금지.

---

## 에러 처리

`AllExceptionsFilter` (`src/common/filters/`):

| 에러 타입       | 처리                       |
| --------------- | -------------------------- |
| HttpException   | NestJS 표준, 한국어 메시지 |
| Prisma P2002    | → 409 CONFLICT             |
| Prisma P2025    | → 404 NOT_FOUND            |
| Prisma P2003    | → 400 BAD_REQUEST          |
| JWT 만료/무효   | → 401                      |
| class-validator | → 400 + 필드별 에러        |

**응답 형식**:

```json
{
  "success": false,
  "statusCode": 400,
  "timestamp": "ISO",
  "path": "/api/v1/...",
  "method": "POST",
  "message": "유효한 이메일 주소를 입력해주세요.",
  "errors": [{ "field": "email", "message": "..." }],
  "errorCode": "VALIDATION_ERROR"
}
```

**민감 데이터 마스킹**: `password`, `token`, `secret`, `cardNumber`, `cvv`, `ci`, `di` 자동 마스킹.

---

## WebSocket (Socket.IO) — 2개 게이트웨이

### 알림 게이트웨이

| 항목          | 값                                                             |
| ------------- | -------------------------------------------------------------- |
| **파일**      | `src/websocket/notifications.gateway.ts`                       |
| **Namespace** | `/notifications`                                               |
| **인증**      | JWT (handshake.auth / headers / query)                         |
| **Room**      | `user:{userId}`, `club:{clubId}`                               |
| **메서드**    | `sendToUser()`, `sendToClub()`, `sendToUsers()`, `broadcast()` |
| **구독**      | `markAsRead`, `markAllAsRead`, `getUnreadCount`                |

### 채팅 게이트웨이

| 항목          | 값                                                                   |
| ------------- | -------------------------------------------------------------------- |
| **파일**      | `src/chat/chat.gateway.ts`                                           |
| **Namespace** | `/chat`                                                              |
| **구독**      | `join_chat`, `leave_chat`, `send_message`, `typing`, `read_messages` |

---

## 스케줄 태스크 (@nestjs/schedule) — 8개

| 서비스                      | 주기                       | 역할                    |
| --------------------------- | -------------------------- | ----------------------- |
| `WebhookRetryService`       | 30초마다                   | 실패한 결제 웹훅 재시도 |
| `PostpaidSettlementService` | 매월 1일 00:00 KST         | 정산 처리               |
| `LessonConfirmationService` | 매일 18:00 KST             | 수업 확정 처리          |
| `CreditExpiryService`       | 매일 자정                  | 만료 크레딧 처리        |
| `CreditExpiryService`       | 매일 09:00                 | 만료 임박 알림          |
| `WithdrawCleanupService`    | 매일 자정                  | 탈퇴 계정 정리          |
| `ReminderScheduler`         | 매시간 + 매일 09:00 + 자정 | 수업/출석 리마인더      |
| `DailyMetricsService`       | 매일 자정                  | 대시보드 일간 지표 집계 |
| `WaitlistService`           | 15분마다                   | 대기열 자동 처리        |

---

## Bull 큐 프로세서

| 프로세서                               | 역할                                 |
| -------------------------------------- | ------------------------------------ |
| `AlimtalkProcessor` (`notifications/`) | 카카오 알림톡 비동기 발송 (Redis 큐) |

---

## 공유 유틸리티 (src/common/)

| 파일                               | 역할                                                      |
| ---------------------------------- | --------------------------------------------------------- |
| `filters/http-exception.filter.ts` | AllExceptionsFilter (Prisma 에러 매핑 포함)               |
| `sentry.config.ts`                 | Sentry 초기화 + SentryExceptionFilter (SENTRY_DSN 조건부) |
| `utils/crypto.util.ts`             | 암호화/복호화 헬퍼                                        |
| `utils/field-encryption.util.ts`   | DB 필드 레벨 암호화                                       |
| `utils/sanitize.util.ts`           | XSS 입력 살균 (sanitize-html)                             |
| `schedulers/reminder.scheduler.ts` | 수업/출석 리마인더 스케줄러                               |

---

## 정적 파일 서빙 (main.ts)

| 경로             | 역할                                            |
| ---------------- | ----------------------------------------------- |
| `/uploads/`      | 업로드된 파일 (chat, products 하위 디렉토리)    |
| `/`              | Next.js 빌드 결과물 (teamplus-web/out, 존재 시) |
| `/_next/static/` | Next.js 정적 에셋 (1년 캐시)                    |

---

## CORS 설정 (main.ts)

- **개발**: localhost:5001/5002/5003, Android 에뮬레이터(10.0.2.2), 개발 서버 IP 다수 허용. origin 없는 요청(WebView/Mobile) 허용
- **프로덕션**: `*.teamplus.com` HTTPS만 허용. 미등록 origin 차단 + 로깅
- **환경변수**: `CORS_ORIGIN`으로 추가 origin 설정 가능

---

## 주요 의존성

| 카테고리    | 패키지                                                                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NestJS**  | `@nestjs/common` 10, `platform-express`, `jwt` 11, `passport` 10, `swagger` 7, `throttler` 5, `schedule` 6, `websockets`, `platform-socket.io`, `bull` 11 |
| **DB/캐시** | `@prisma/client` 5.7, `ioredis` 5, `bull` 4                                                                                                               |
| **인증**    | `passport` 0.7, `passport-jwt` 4, `bcrypt` 6                                                                                                              |
| **보안**    | `helmet` 8, `sanitize-html` 2, `@sentry/node` 10                                                                                                          |
| **통신**    | `axios`, `socket.io` 4, `firebase-admin` 13                                                                                                               |
| **파일**    | `multer` 2, `xlsx`                                                                                                                                        |
| **유틸**    | `uuid`, `pino` + `pino-pretty`, `dotenv`, `class-validator`, `class-transformer`                                                                          |

---

## 환경 변수

```bash
BACKEND_PORT=5003
NODE_ENV=development
DATABASE_URL=postgresql://user:pass@localhost:5432/teamplus
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=...
JWT_EXPIRATION=900             # 15분 (초)
JWT_REFRESH_EXPIRATION=604800  # 7일

# KG이니시스
INICIS_MERCHANT_KEY=...
INICIS_STORE_ID=...
INICIS_SIGNATURE_KEY=...

# 카카오 알림톡
KAKAO_API_KEY=...
KAKAO_SENDER_KEY=...

# Sentry (선택, 없으면 비활성화)
SENTRY_DSN=...

# 업로드 디렉토리 루트 (UPLOAD_ROOT) — 미설정 시 cwd/uploads 사용
# 운영 권장: /var/lib/teamplus/uploads (chmod 750, owner nestjs:nestjs)
UPLOAD_ROOT=...

# 캐시 TTL (초)
CACHE_TTL_CLASS_LIST=300
CACHE_TTL_CLUB_INFO=600
CACHE_TTL_USER_PROFILE=900
CACHE_TTL_PAYMENT_IDEMPOTENCY=86400
```

---

## 테스트 계정

비밀번호 공통: `Test1234!`

| 이메일                | UserType |
| --------------------- | -------- |
| admin@teamplus.com    | ADMIN    |
| director@teamplus.com | DIRECTOR |
| coach@teamplus.com    | COACH    |
| parent@teamplus.com   | PARENT   |
| teen@teamplus.com     | TEEN     |
| child@teamplus.com    | CHILD    |

---

## 비즈니스 규칙

**크레딧**: 결제 → MemberCredit 생성 → QR 출석 시 1크레딧 차감 (CreditTransaction) → 90일 만료. 취소 시 복원.

**결제 (KG이니시스)**: `orderNumber` = UUID (멱등성 키, 24시간 Redis TTL). 서버사이드 금액 검증 필수. 카드 데이터 저장 절대 금지. 웹훅 서명 검증 필수.

**수강 신청**: 학부모 직접 (pending → paid) 또는 자녀 요청 (자녀 → 학부모 승인 → paid). 결제는 학부모만 가능.

**QR 출석**: 코치 `POST /attendance/qr-generate` (5분 유효) → 학생/부모 스캔 → `POST /attendance/check-in` → `$transaction`으로 크레딧 차감.

---

## 코드 스타일

- **ESLint**: `@typescript-eslint/recommended` + Prettier (`prettier/prettier`: warn)
- **미사용 변수**: Error (`_` prefix로 억제)
- **`any` 타입**: Warning (error 아님)
- **리턴 타입**: 불필요 (explicit-function-return-type off)
- **Strict TS**: strictNullChecks, noImplicitAny, noUnusedLocals, noUnusedParameters, noImplicitReturns, noFallthroughCasesInSwitch 모두 활성

---

## 자주 발생하는 문제

| 문제                    | 해결                                         |
| ----------------------- | -------------------------------------------- |
| Prisma client not found | `npx prisma generate`                        |
| DB 연결 실패            | Docker 확인: `docker ps \| grep postgres`    |
| 포트 5003 사용 중       | `lsof -i :5003` → 프로세스 종료              |
| Redis 연결 실패         | `docker-compose logs redis`                  |
| 스키마 동기화 오류      | `npm run db:migrate` → `npx prisma generate` |
| CORS 에러 (admin 5002)  | `main.ts` devOrigins 배열 확인               |

---

**Last Updated**: 2026-04-19 | **Version**: 2.2 (API Lifecycle v8.5 — ApiLifecycleInterceptor 전역 등록 · User.lastActiveAt 추가 · gzip compression(85% 감소) · HTTP keep-alive 65s · ETag Weak · AppSettings Redis 5m + Notifications unread 30s 캐시 · Prisma connection_limit 10→25 · AllExceptionsFilter 401 응답 표준화 · 1초 SLA 모니터링 — 68 module / 72 controller / 92 service / 145 model / 17 enum / 54 spec)
