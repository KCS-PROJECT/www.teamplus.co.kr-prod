# TEAMPLUS Backend 에러 문서

> **프로젝트**: teamplus-backend (NestJS 10)
> **최종 업데이트**: 2026-05-14 (실측 SOT 동기화)
> **총 이슈**: 40개

---

## 📊 이슈 현황

| 심각도                    | 개수 | 상태                            |
| ------------------------- | ---- | ------------------------------- |
| 🔴 Critical               | 3    | ⬜ 미해결                       |
| 🟠 High                   | 11   | 6 ✅ 해결 (2026-03-07 보안감사) |
| 🟡 Medium                 | 4    | ⬜ 미해결                       |
| 🟢 Low                    | 2    | ⬜ 미해결                       |
| 📋 신규/기타 (BE-022~037) | 17   | 개별 문서 참조                  |

> **⚠️ 카운트 불일치 주의**: 본 요약 표는 최초 감사 기준이며, 실제 문서에는 BE-001~037까지 총 37개 이슈가 기재되어 있음. 중복 번호가 있는 기존 섹션은 차기 정리 시 재번호 필요.

---

---

        [BE] 작성 2026.04.22. — 세션 끊김 재발 방지 (WEB-050/051 후속)

---

### BE-036: Refresh Token Rotation 시 in-flight 요청이 reuse로 오탐 — Grace Window 도입

| 항목     | 내용                                                                                                                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **파일** | `src/auth/auth.service.ts` (`storeRefreshToken`, `validateRefreshTokenSafe`)                                                                                                                                            |
| **문제** | Rotation 방식에서 "storedToken !== 요청토큰" 시 즉시 `reuse` 판정 후 `revokeRefreshToken(userId)` 호출하여 전체 세션 revoke. **정상 다중 탭·네트워크 재시도·로그인 직후 in-flight refresh 경합**이 모두 reuse로 오탐됨. |
| **영향** | 로그인 직후 세션 끊김 · 다중 탭 사용 시 강제 로그아웃 · 모바일 네트워크 jitter 시 전체 세션 무효화.                                                                                                                     |
| **상태** | ✅ 해결됨 (2026-04-22)                                                                                                                                                                                                  |

**Causal Chain (로그인 직후 끊김)**:

```
AuthProvider loadUser → POST /auth/refresh [RT_old] (in-flight)
사용자: 로그인 버튼 → POST /auth/login → RT_new 발급, Redis 덮어쓰기
loadUser refresh 뒤늦게 서버 도착
  → Redis 조회: 현재=RT_new, 요청=RT_old → "reuse!" 판정
  → revokeRefreshToken(userId) → Redis에서 RT_new까지 삭제
  → 방금 발급한 세션 말살 → 대시보드 진입 후 첫 API 호출 시 401
```

**원인**:

- `storeRefreshToken`이 Redis에 단일 문자열만 저장 → 직전 토큰 추적 불가.
- auth0·Supabase·Firebase 등 업계 표준 인증 서비스는 모두 **Grace Window(leeway)**를 내장하지만, TEAMPLUS의 DIY 구현에서는 누락되었음.

**해결 (Rotation + Grace Window)**:

Redis 저장 구조를 object로 확장:

```typescript
interface RefreshTokenRecord {
  current: string; // 최신 RT
  previous?: string; // 직전 RT (grace window 유효)
  rotatedAt: number; // 최신 rotation 시각 (epoch ms)
}
const REFRESH_GRACE_MS = 10_000; // auth0 default 수준 (10초)
```

검증 로직 변경:

```typescript
// 1. Redis missing → 재로그인 요구 (운영 도구: 관리자 Redis 청소로 강제 로그아웃 보존)
// 2. current 일치 → valid
// 3. previous 일치 + 경과 < GRACE_MS → valid (in-flight 경합 허용)
// 4. 그 외 → reuse (진짜 탈취 탐지)
```

**보안 영향**:

- 탈취된 RT가 rotation 후 10초 이내 사용될 확률은 매우 낮음 → 실질적 보안 저하 없음.
- 10초 밖의 previous 재사용은 여전히 reuse로 탐지 → token family revoke.
- Redis missing 거부 정책은 **그대로 유지** → 관리자 강제 로그아웃 도구 보존.

**Backward Compatibility**:

- 기존 string 형태로 저장된 refresh token은 `typeof stored === "string"` 분기에서 current 일치 검증만 수행 (grace 불가). 다음 rotation 시 자동으로 object 형태로 마이그레이션됨.

| **예방 가이드** | Refresh Token Rotation을 구현할 때는 반드시 **Grace Window(leeway)**를 함께 도입한다. 10초가 auth0 default 수준의 보수적 값이며, 정상 경합과 탈취 공격을 구분하기에 충분하다. |

---

## 🔴 Critical Issues

### BE-001: ESLint 설정 오류

| 항목     | 내용                                                |
| -------- | --------------------------------------------------- |
| **파일** | `tsconfig.json`, `.eslintrc.js`                     |
| **문제** | 31개 테스트 파일이 tsconfig include에 포함되지 않음 |
| **영향** | ESLint 오류로 CI/CD 파이프라인 실패                 |
| **상태** | ⬜ 미해결                                           |

**에러 메시지**:

```
Parsing error: ESLint was configured to run...
but that TSConfig does not include this file
```

**해결 방안**:

```json
// tsconfig.json
{
  "include": [
    "src/**/*",
    "test/**/*" // 테스트 디렉토리 추가
  ],
  "exclude": ["node_modules", "dist"]
}
```

또는 별도 `tsconfig.test.json` 생성:

```json
{
  "extends": "./tsconfig.json",
  "include": ["test/**/*"],
  "compilerOptions": {
    "types": ["jest", "node"]
  }
}
```

---

### BE-002: 테스트 실패

| 항목     | 내용                                     |
| -------- | ---------------------------------------- |
| **파일** | `test/` 디렉토리 전체                    |
| **문제** | 21개 테스트 실패, 3개 테스트 스위트 오류 |
| **영향** | 코드 품질 검증 불가, CI 파이프라인 차단  |
| **상태** | ⬜ 미해결                                |

**주요 실패 원인**:

1. `encryptCredentials` 함수 export 누락
2. `supertest` import 오류
3. Mock 설정 불완전

**해결 방안**:

```typescript
// src/lib/crypto.ts - export 추가
export { encryptCredentials, decryptCredentials };

// test/auth.e2e-spec.ts - import 수정
import request from "supertest";
// 또는
const request = require("supertest");

// jest.setup.ts - Mock 설정
jest.mock("./src/lib/crypto", () => ({
  encryptCredentials: jest.fn().mockResolvedValue({
    encryptedData: "mock",
    iv: "mock",
    authTag: "mock",
  }),
}));
```

---

### BE-003: 보안 취약점 (Dependencies)

| 항목     | 내용                   |
| -------- | ---------------------- |
| **도구** | `npm audit`            |
| **문제** | 7개 의존성 취약점 발견 |
| **영향** | 잠재적 보안 위험       |
| **상태** | ⬜ 미해결              |

**취약점 목록**:

```
┌───────────────┬──────────────────────────────┐
│ Severity      │ Count                        │
├───────────────┼──────────────────────────────┤
│ moderate      │ 4                            │
│ high          │ 2                            │
│ critical      │ 1                            │
└───────────────┴──────────────────────────────┘
```

**해결 방안**:

```bash
# 자동 수정 가능한 취약점 수정
npm audit fix

# 메이저 버전 업데이트 필요 시
npm audit fix --force

# 수동 업데이트 필요 시
npm update <package-name>
```

---

## 🟠 High Priority Issues

### BE-004: TypeScript any 타입 남용

| 항목     | 내용                                 |
| -------- | ------------------------------------ |
| **파일** | 전체 코드베이스                      |
| **개수** | 181개 `any` 타입 사용                |
| **영향** | 타입 안전성 저하, 런타임 오류 가능성 |
| **상태** | ⬜ 미해결                            |

**해결 방안**:

```typescript
// tsconfig.json - strict 모드 활성화
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true
  }
}

// any 대신 적절한 타입 사용
// Before
function processData(data: any): any { ... }

// After
interface ProcessedData {
  result: string;
  status: 'success' | 'error';
}

function processData(data: unknown): ProcessedData { ... }
```

---

### BE-005: CSP 헤더 취약

| 항목     | 내용                                                               |
| -------- | ------------------------------------------------------------------ |
| **파일** | `src/main.ts` 또는 Helmet 설정                                     |
| **문제** | Content-Security-Policy 헤더에 `unsafe-inline`, `unsafe-eval` 포함 |
| **영향** | XSS 공격에 취약                                                    |
| **상태** | ⬜ 미해결                                                          |

**현재 설정**:

```typescript
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // 취약
      },
    },
  }),
);
```

**해결 방안**:

```typescript
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"], // unsafe 제거
        styleSrc: ["'self'", "'unsafe-inline'"], // 스타일만 허용
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", process.env.API_URL],
      },
    },
  }),
);
```

---

### BE-006: 에러 핸들링 미흡

| 항목     | 내용                                         |
| -------- | -------------------------------------------- |
| **파일** | controllers/, services/                      |
| **문제** | 일관된 에러 핸들링 패턴 없음                 |
| **영향** | 에러 추적 어려움, 클라이언트에 불명확한 응답 |
| **상태** | ⬜ 미해결                                    |

**해결 방안**:

```typescript
// src/filters/http-exception.filter.ts
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.message
        : "Internal server error";

    this.logger.error(`${request.method} ${request.url}`, {
      status,
      message,
      stack: exception instanceof Error ? exception.stack : undefined,
    });

    response.status(status).json({
      success: false,
      error: {
        code: `ERR_${status}`,
        message,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
```

---

### BE-007: 로깅 구조화 미흡

| 항목     | 내용                                 |
| -------- | ------------------------------------ |
| **파일** | 전체                                 |
| **문제** | 로깅이 일관되지 않고 구조화되지 않음 |
| **영향** | 프로덕션 디버깅 어려움               |
| **상태** | ⬜ 미해결                            |

**해결 방안**:

```typescript
// src/common/logger.service.ts
import { Injectable, LoggerService } from "@nestjs/common";
import * as winston from "winston";

@Injectable()
export class AppLogger implements LoggerService {
  private logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: process.env.NODE_ENV === "production" ? "info" : "debug",
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({
          filename: "logs/error.log",
          level: "error",
        }),
        new winston.transports.File({ filename: "logs/combined.log" }),
      ],
    });
  }

  log(message: string, context?: Record<string, unknown>) {
    this.logger.info(message, { context });
  }

  error(message: string, trace?: string, context?: Record<string, unknown>) {
    this.logger.error(message, { trace, context });
  }
}
```

---

### BE-008: 데이터베이스 연결 풀 설정

| 항목     | 내용                                 |
| -------- | ------------------------------------ |
| **파일** | `prisma/schema.prisma`, DB 설정      |
| **문제** | 연결 풀 크기 및 타임아웃 최적화 필요 |
| **영향** | 고부하 시 DB 연결 부족               |
| **상태** | ⬜ 미해결                            |

---

## 🟡 Medium Priority Issues

### BE-009: API 문서화 불완전

| 항목     | 내용                                      |
| -------- | ----------------------------------------- |
| **파일** | controllers/                              |
| **문제** | Swagger 데코레이터 누락된 엔드포인트 존재 |
| **영향** | API 문서 불완전                           |
| **상태** | ⬜ 미해결                                 |

**해결 방안**:

```typescript
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  @Post('login')
  @ApiOperation({ summary: '로그인' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  @ApiResponse({ status: 401, description: '인증 실패' })
  async login(@Body() dto: LoginDto) { ... }
}
```

---

### BE-010: Rate Limiting 세분화

| 항목     | 내용                                |
| -------- | ----------------------------------- |
| **파일** | Rate Limiter 설정                   |
| **문제** | 엔드포인트별 Rate Limit 차별화 필요 |
| **영향** | 민감한 엔드포인트 보호 미흡         |
| **상태** | ⬜ 미해결                           |

---

### BE-011: 캐싱 전략

| 항목     | 내용                       |
| -------- | -------------------------- |
| **파일** | services/                  |
| **문제** | Redis 캐싱 활용도 낮음     |
| **영향** | 반복 쿼리로 인한 성능 저하 |
| **상태** | ⬜ 미해결                  |

---

### BE-012: 입력 검증 강화

| 항목     | 내용                                         |
| -------- | -------------------------------------------- |
| **파일** | DTOs                                         |
| **문제** | 일부 DTO에 class-validator 데코레이터 미적용 |
| **영향** | 잘못된 입력 허용 가능                        |
| **상태** | ⬜ 미해결                                    |

---

## 🟢 Low Priority Issues

### BE-013: 코드 중복

| 항목     | 내용                               |
| -------- | ---------------------------------- |
| **파일** | services/                          |
| **문제** | 유사한 로직이 여러 서비스에 중복됨 |
| **영향** | 유지보수성 저하                    |
| **상태** | ⬜ 미해결                          |

---

### BE-014: 주석 및 문서화

| 항목     | 내용             |
| -------- | ---------------- |
| **파일** | 전체             |
| **문제** | JSDoc 주석 부족  |
| **영향** | 코드 이해도 저하 |
| **상태** | ⬜ 미해결        |

---

---

        backend 작성 2026.01.19. 22:30:00

---

### BE-015: AuditLog Foreign Key 제약 위반 (로그인 실패 시)

| 항목     | 내용                                                         |
| -------- | ------------------------------------------------------------ |
| **파일** | `src/auth/services/audit.service.ts`, `prisma/schema.prisma` |
| **문제** | 로그인 실패 시 AuditLog 생성할 때 userId 외래키 제약 위반    |
| **영향** | 인증되지 않은 사용자의 보안 이벤트 로깅 불가                 |
| **상태** | ✅ 해결됨                                                    |

**에러 메시지**:

```
PrismaClientKnownRequestError:
Invalid `this.prisma.auditLog.create()` invocation
Foreign key constraint violated: `user_id`
```

**원인 분석**:

- AuditLog 모델의 `userId`가 User 테이블과 필수 외래키 관계로 설정됨
- 로그인 실패 시 userId가 없거나 "unknown" 문자열인데, 이 값이 User 테이블에 존재하지 않음
- Prisma가 외래키 제약 조건을 검증하여 에러 발생

**🔴 잘못된 코드 예시**:

```typescript
// prisma/schema.prisma - userId가 필수(NOT NULL)
model AuditLog {
  id        String   @id @default(cuid())
  userId    String   @map("user_id")  // 필수 필드
  // ...
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

// audit.service.ts - "unknown" 문자열 사용
await this.prisma.auditLog.create({
  data: {
    userId: event.userId || "unknown",  // User 테이블에 없는 값
    // ...
  },
});
```

**🟢 올바른 코드 예시**:

```typescript
// prisma/schema.prisma - userId를 nullable로 변경
model AuditLog {
  id        String   @id @default(cuid())
  userId    String?  @map("user_id")  // nullable
  // ...
  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)
}

// audit.service.ts - null 사용
const validUserId = event.userId && event.userId !== "unknown"
  ? event.userId
  : null;

await this.prisma.auditLog.create({
  data: {
    userId: validUserId,  // null 허용
    // ...
  },
});
```

**📌 예방 가이드라인**:

1. 인증 전 이벤트를 로깅하는 테이블은 userId를 nullable로 설계
2. 외래키 제약이 있는 필드에 임의 문자열 사용 금지
3. 보안 감사 로그는 인증 실패 시도도 추적해야 하므로 userId optional 필수
4. onDelete: SetNull 사용으로 사용자 삭제 시에도 로그 보존

---

---

        backend 작성 2026.01.26. 15:30:00

---

### BE-016: Prisma Client 스키마 동기화 오류

| 항목     | 내용                                                       |
| -------- | ---------------------------------------------------------- |
| **파일** | `src/admin/admin.service.ts`, `src/menus/menus.service.ts` |
| **문제** | Prisma 스키마에 정의된 모델이 TypeScript에서 인식되지 않음 |
| **영향** | 빌드 실패, 20개 이상의 TypeScript 에러                     |
| **상태** | ✅ 해결됨                                                  |

**에러 메시지**:

```
error TS2339: Property 'memberLevel' does not exist on type 'PrismaService'.
error TS2339: Property 'pointTransaction' does not exist on type 'PrismaService'.
error TS2339: Property 'appMenu' does not exist on type 'PrismaService'.
error TS2353: Object literal may only specify known properties, and 'memberLevel' does not exist in type 'UserInclude<DefaultArgs>'.
```

**원인 분석**:

- Prisma 스키마(`schema.prisma`)에 `MemberLevel`, `PointTransaction`, `AppMenu` 모델이 정의되어 있음
- 하지만 `npx prisma generate`를 실행하지 않아 Prisma Client가 최신 스키마와 동기화되지 않음
- TypeScript가 생성된 타입 정의를 참조하므로, 구버전 클라이언트에는 해당 모델이 없음

**🔴 잘못된 상황**:

```bash
# schema.prisma 수정 후 generate 누락
git pull  # 새로운 모델이 추가된 스키마
npm run build  # 에러 발생!
```

**🟢 올바른 해결 방법**:

```bash
# Prisma Client 재생성
cd teamplus-backend
npx prisma generate

# 또는 마이그레이션과 함께 실행
npx prisma migrate dev
```

**📌 예방 가이드라인**:

1. `schema.prisma` 수정 후 **반드시** `npx prisma generate` 실행
2. `package.json`에 postinstall 스크립트 추가:
   ```json
   {
     "scripts": {
       "postinstall": "prisma generate"
     }
   }
   ```
3. CI/CD 파이프라인에 `prisma generate` 단계 포함
4. 팀원이 스키마 변경 시 PR 설명에 "prisma generate 필요" 명시

---

---

        backend 작성 2026.03.05. 14:30:00

---

### BE-017: 결제 웹훅 JWT 가드로 인한 401 차단

| 항목     | 내용                                                                                      |
| -------- | ----------------------------------------------------------------------------------------- |
| **파일** | `src/payments/payments.controller.ts`                                                     |
| **문제** | `POST /payments/webhook` 엔드포인트에 `JwtAuthGuard`가 적용되어 KG이니시스 웹훅 콜백 차단 |
| **영향** | 결제 완료 처리 전체 불가 (P0 Critical)                                                    |
| **상태** | ✅ 해결됨 (2026-03-05)                                                                    |

**에러 메시지**:

```
HTTP 401 Unauthorized
{"statusCode":401,"message":"Unauthorized"}
```

**원인 분석**:

- KG이니시스 웹훅은 외부 서버에서 호출되므로 JWT Bearer 토큰이 없음
- `@UseGuards(JwtAuthGuard)` 또는 클래스 레벨 가드가 웹훅 엔드포인트도 보호
- 결과적으로 결제 완료 콜백이 401로 차단되어 결제 상태 업데이트 불가

**🔴 잘못된 코드 예시**:

```typescript
@Controller('api/v1/payments')
@UseGuards(JwtAuthGuard)  // ❌ 클래스 레벨에서 모든 라우트에 JWT 가드 적용
export class PaymentsController {
  @Post('webhook')  // KG이니시스 외부 서버 호출 → JWT 없음 → 401
  async handleWebhook(@Body() body: any) { ... }
}
```

**🟢 올바른 코드 예시**:

```typescript
@Controller("api/v1/payments")
export class PaymentsController {
  @Post("webhook")
  @Public() // ✅ 웹훅 엔드포인트는 Public 처리
  async handleWebhook(@Body() body: any) {
    // ✅ JWT 대신 웹훅 서명(X-Inicis-Signature) 검증으로 보안 유지
    await this.paymentsService.verifyWebhookSignature(body);
    return this.paymentsService.processWebhook(body);
  }
}
```

**📌 예방 가이드라인**:

1. 외부 서비스 콜백(PG, OAuth, 알림 등)은 반드시 `@Public()` 처리
2. Public 엔드포인트는 서명(Signature) 또는 시크릿 키로 인증
3. 컨트롤러 클래스 레벨 가드 사용 시 예외 처리 필요 엔드포인트 확인

---

### BE-018: $transaction 미사용으로 인한 출석 체크인 데이터 불일치

| 항목     | 내용                                                                                     |
| -------- | ---------------------------------------------------------------------------------------- |
| **파일** | `src/attendance/attendance.service.ts`                                                   |
| **문제** | QR 출석 체크인 시 출석 기록과 크레딧 차감이 별도 트랜잭션으로 처리되어 원자성 보장 안 됨 |
| **영향** | 출석은 기록됐으나 크레딧 미차감, 또는 크레딧은 차감됐으나 출석 미기록 상태 발생 가능     |
| **상태** | ✅ 해결됨 (2026-03-05)                                                                   |

**원인 분석**:

- `checkIn()` 메서드가 `attendance.create()`와 `memberCredit.update()` 를 순차 실행
- 첫 번째 쿼리 성공 후 두 번째 쿼리 실패 시 롤백 불가

**🔴 잘못된 코드 예시**:

```typescript
async checkIn(dto: CheckInDto) {
  const attendance = await this.prisma.classAttendance.create({...}); // ❌ 독립 트랜잭션
  const credit = await this.prisma.memberCredit.update({...});         // ❌ 첫 번째 성공 후 실패 가능
  return attendance;
}
```

**🟢 올바른 코드 예시**:

```typescript
async checkIn(dto: CheckInDto) {
  return this.prisma.$transaction(async (tx) => {  // ✅ 원자적 트랜잭션
    const attendance = await tx.classAttendance.create({...});
    await tx.memberCredit.update({...});
    await tx.creditTransaction.create({...});
    return attendance;
  });
}
```

**📌 예방 가이드라인**:

1. 2개 이상의 DB 작업이 연관된 경우 반드시 `$transaction` 사용
2. 크레딧 차감/환불, 결제 처리, 출석 기록 등 금전 관련 작업 전체 `$transaction` 필수
3. 인터랙티브 트랜잭션 (`$transaction(async (tx) => {...})`) 권장

---

### BE-019: Prisma Shadow Database 오류 (migrate dev 실패)

| 항목     | 내용                                                             |
| -------- | ---------------------------------------------------------------- |
| **파일** | `prisma/schema.prisma`, `.env`                                   |
| **문제** | `prisma migrate dev` 실행 시 shadow database 생성 권한 없음 오류 |
| **영향** | 로컬 개발 환경에서 마이그레이션 실행 불가                        |
| **상태** | ⬜ 미해결 (배포 환경에서 migrate deploy 사용 권장)               |

**에러 메시지**:

```
Error: P3014
Prisma Migrate could not create the shadow database.
Please make sure the database user has permission to create databases.
```

**원인 분석**:

- PostgreSQL에서 shadow DB 생성을 위해 `CREATE DATABASE` 권한 필요
- 개발 DB 유저에게 해당 권한이 없거나 shadowDatabaseUrl 미설정

**🟢 올바른 해결 방법**:

```bash
# 방법 1: shadowDatabaseUrl 별도 설정 (.env)
DATABASE_URL="postgresql://user:pass@localhost:55432/teamplus"
SHADOW_DATABASE_URL="postgresql://user:pass@localhost:55432/teamplus_shadow"

# prisma/schema.prisma
datasource db {
  provider          = "postgresql"
  url               = env("DATABASE_URL")
  shadowDatabaseUrl = env("SHADOW_DATABASE_URL")
}

# 방법 2: 배포 환경에서는 migrate deploy 사용 (shadow DB 불필요)
npx prisma migrate deploy
```

**📌 예방 가이드라인**:

1. 로컬 PostgreSQL: `shadowDatabaseUrl` 환경 변수 설정
2. CI/CD: `prisma migrate dev` 대신 `prisma migrate deploy` 사용
3. DB 유저 권한 부족 시 DBA에게 `CREATE DATABASE` 권한 요청

---

### BE-020: Bull Queue 인메모리 처리로 알림 소실

| 항목     | 내용                                                                                  |
| -------- | ------------------------------------------------------------------------------------- |
| **파일** | `src/notifications/notifications.service.ts`                                          |
| **문제** | Alimtalk/푸시 알림 큐가 Bull Queue + Redis 영속화 미적용으로 서버 재시작 시 알림 소실 |
| **영향** | 서버 재시작/배포 시 큐에 쌓인 미발송 알림 전체 유실                                   |
| **상태** | ⬜ 미해결 (Task #9 - Bull Queue Redis 영속화 구현 예정)                               |

**원인 분석**:

- 현재 알림 큐가 인메모리 방식 또는 Bull Queue의 Redis 연결 없이 구현됨
- Bull Queue는 Redis 백엔드가 없으면 프로세스 종료 시 모든 작업 소실

**🟢 올바른 구현 방향**:

```typescript
// notifications.module.ts
import { BullModule } from "@nestjs/bull";

@Module({
  imports: [
    BullModule.registerQueue({
      name: "notifications",
      redis: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT),
        // ✅ Redis에 영속화 → 서버 재시작 시에도 작업 유지
      },
    }),
  ],
})
export class NotificationsModule {}
```

**📌 예방 가이드라인**:

1. 프로덕션 환경 알림/이메일 큐는 반드시 Redis 백엔드 사용
2. Bull Queue: `defaultJobOptions.removeOnComplete: false` 설정으로 처리 이력 보존
3. 3회 재시도(retry) + 실패 Dead Letter Queue 설정 필수
4. 큐 모니터링: `bull-board` 또는 Bull Arena 대시보드 도입 권장

---

---

        [BACKEND] 작성 2026.03.05. 19:00:00

---

### BE-021: ChatRoomAccessDenied — 채팅방 멤버가 아닌 사용자 접근

| 항목     | 내용                                                                     |
| -------- | ------------------------------------------------------------------------ |
| **모듈** | `src/websocket/chat.service.ts`                                          |
| **문제** | 채팅방 멤버가 아닌 사용자가 `GET /chat/rooms/:roomId` 접근 시 403 미처리 |
| **영향** | 무단 채팅 내용 열람 가능성                                               |
| **상태** | ✅ 방어 코드 적용 (Task #44)                                             |

**에러 메시지**:

```json
{ "statusCode": 403, "message": "채팅방에 접근할 권한이 없습니다." }
```

**원인 분석**:

- 채팅방 조회 전 `ChatRoomMember` 테이블에서 사용자 참여 여부 미확인

**🟢 올바른 코드**:

```typescript
// chat.service.ts
async getRoomById(roomId: string, userId: string) {
  const member = await this.prisma.chatRoomMember.findFirst({
    where: { roomId, userId },
  });
  if (!member) throw new ForbiddenException('채팅방에 접근할 권한이 없습니다.');
  return this.prisma.chatRoom.findUnique({ where: { id: roomId } });
}
```

**📌 예방 가이드라인**:

- 채팅방 관련 모든 엔드포인트에 `ChatRoomMember` 존재 여부 검증 필수

---

### BE-022: ChatRoomNotFound — 존재하지 않는 채팅방 접근

| 항목     | 내용                                                             |
| -------- | ---------------------------------------------------------------- |
| **모듈** | `src/websocket/chat.service.ts`                                  |
| **문제** | 삭제되었거나 존재하지 않는 `roomId` 접근 시 null 반환 → 500 에러 |
| **영향** | Unhandled null → NestJS 기본 500 응답                            |
| **상태** | ✅ 방어 코드 적용 (Task #44)                                     |

**에러 메시지**:

```json
{ "statusCode": 404, "message": "채팅방을 찾을 수 없습니다." }
```

**🟢 올바른 코드**:

```typescript
const room = await this.prisma.chatRoom.findUnique({ where: { id: roomId } });
if (!room) throw new NotFoundException("채팅방을 찾을 수 없습니다.");
```

**📌 예방 가이드라인**:

- 모든 단건 조회(`findUnique`) 후 null 체크 + `NotFoundException` 처리 필수

---

### BE-023: ChatRoomLeaveError — 마지막 멤버 나가기 시 채팅방 잔존

| 항목     | 내용                                                             |
| -------- | ---------------------------------------------------------------- |
| **모듈** | `src/websocket/chat.service.ts`                                  |
| **문제** | 채팅방 마지막 멤버 나가기 후 빈 채팅방이 DB에 잔존 (고아 레코드) |
| **영향** | DB 고아 레코드 누적 — 쿼리 성능 저하                             |
| **상태** | ⬜ soft delete 적용 권장                                         |

**원인 분석**:

- `ChatRoomMember` 삭제 후 잔여 멤버 수 확인 없이 채팅방 방치

**🟢 권장 처리 방식**:

```typescript
async leaveRoom(roomId: string, userId: string) {
  await this.prisma.chatRoomMember.delete({ where: { roomId_userId: { roomId, userId } } });
  const remaining = await this.prisma.chatRoomMember.count({ where: { roomId } });
  if (remaining === 0) {
    await this.prisma.chatRoom.update({ where: { id: roomId }, data: { deletedAt: new Date() } });
  }
}
```

**📌 예방 가이드라인**:

- 멤버 삭제 후 잔여 인원 확인 → 0이면 채팅방 soft delete 처리
- `ChatRoom.deletedAt` 컬럼 추가 + 모든 조회에 `where: { deletedAt: null }` 적용

---

### BE-024: SearchQueryTooShort — 검색어 최소 길이 미달

| 항목     | 내용                                                   |
| -------- | ------------------------------------------------------ |
| **모듈** | `src/search/search.controller.ts`                      |
| **문제** | `q` 파라미터 1자 이하 전달 시 전체 테이블 풀 스캔 유발 |
| **영향** | 과도한 DB 부하 → 서비스 성능 저하                      |
| **상태** | ✅ DTO validation 적용 (Task #27)                      |

**에러 메시지**:

```json
{ "statusCode": 400, "message": "검색어는 최소 2자 이상 입력해주세요." }
```

**🟢 올바른 코드**:

```typescript
// search.dto.ts
export class SearchQueryDto {
  @IsString()
  @MinLength(2, { message: "검색어는 최소 2자 이상 입력해주세요." })
  q: string;
}
```

**📌 예방 가이드라인**:

- 검색 API 진입 전 반드시 `@MinLength(2)` + `@IsNotEmpty()` 적용
- 짧은 검색어는 인덱스 효과 없음 → 최소 2자 규칙 전체 일관 적용

---

### BE-025: SearchTypeInvalid — 허용되지 않은 검색 타입 파라미터

| 항목     | 내용                                                                     |
| -------- | ------------------------------------------------------------------------ |
| **모듈** | `src/search/search.controller.ts`                                        |
| **문제** | `type` 파라미터에 허용 범위 외 값 전달 시 예상치 못한 쿼리 실행 또는 500 |
| **영향** | 잘못된 타입으로 쿼리 → 빈 결과 혼동 또는 500                             |
| **상태** | ✅ DTO validation 적용 (Task #27)                                        |

**에러 메시지**:

```json
{
  "statusCode": 400,
  "message": "type은 all, member, class, club, team 중 하나여야 합니다."
}
```

**🟢 올바른 코드**:

```typescript
export class SearchQueryDto {
  @IsOptional()
  @IsIn(["all", "member", "class", "club", "team"])
  type?: string = "all";
}
```

**📌 예방 가이드라인**:

- Enum성 파라미터는 반드시 `@IsIn()` 또는 `@IsEnum()` 데코레이터로 검증

---

### BE-026: ReviewDuplicate — 동일 수업 중복 리뷰 작성

| 항목     | 내용                                                               |
| -------- | ------------------------------------------------------------------ |
| **모듈** | `src/reviews/reviews.service.ts`                                   |
| **문제** | 동일 사용자가 같은 수업에 리뷰를 두 번 이상 작성 시 중복 생성 허용 |
| **영향** | 왜곡된 코치 평점 집계                                              |
| **상태** | ✅ unique 제약 + 서비스 검증 적용 (Task #24)                       |

**에러 메시지**:

```json
{ "statusCode": 409, "message": "이미 해당 수업에 리뷰를 작성하셨습니다." }
```

**🟢 올바른 코드**:

```typescript
const existing = await this.prisma.classReview.findFirst({
  where: { classId: dto.classId, userId },
});
if (existing)
  throw new ConflictException("이미 해당 수업에 리뷰를 작성하셨습니다.");
```

**Prisma Schema**:

```prisma
model ClassReview {
  @@unique([classId, userId])  // ✅ DB 레벨 중복 방지
}
```

**📌 예방 가이드라인**:

- 서비스 레벨 중복 확인 + Prisma schema `@@unique([classId, userId])` 이중 방어

---

### BE-027: ReviewNotAuthor — 본인이 작성하지 않은 리뷰 수정/삭제 시도

| 항목     | 내용                                                   |
| -------- | ------------------------------------------------------ |
| **모듈** | `src/reviews/reviews.service.ts`                       |
| **문제** | 다른 사용자가 작성한 리뷰를 수정하거나 삭제하려는 시도 |
| **영향** | 무단 리뷰 수정/삭제 — 데이터 무결성 침해               |
| **상태** | ✅ 소유자 검증 적용 (Task #24)                         |

**에러 메시지**:

```json
{
  "statusCode": 403,
  "message": "본인이 작성한 리뷰만 수정/삭제할 수 있습니다."
}
```

**🟢 올바른 코드**:

```typescript
const review = await this.prisma.classReview.findUnique({
  where: { id: reviewId },
});
if (!review) throw new NotFoundException("리뷰를 찾을 수 없습니다.");
if (review.userId !== userId) {
  throw new ForbiddenException("본인이 작성한 리뷰만 수정/삭제할 수 있습니다.");
}
```

**📌 예방 가이드라인**:

- 리뷰 수정/삭제 전 반드시 `review.userId === requestUserId` 검증
- ADMIN 역할 예외 허용 필요 시 `@Roles(Role.ADMIN)` 가드와 조합

---

### BE-028: MatchFull — 픽업 매치 최대 참가자 초과

| 항목     | 내용                                                            |
| -------- | --------------------------------------------------------------- |
| **모듈** | `src/pickup-match/pickup-match.service.ts` (Task #41 구현 예정) |
| **문제** | 정원이 가득 찬 매치에 추가 참가 신청 허용                       |
| **영향** | 정원 초과 → 경기 진행 혼란                                      |
| **상태** | ⏳ Task #41 구현 시 적용 예정                                   |

**에러 메시지**:

```json
{ "statusCode": 409, "message": "해당 매치의 참가 정원이 마감되었습니다." }
```

**🟢 올바른 코드**:

```typescript
const match = await this.prisma.pickupMatch.findUnique({
  where: { id: matchId },
  include: { _count: { select: { applicants: true } } },
});
if (match._count.applicants >= match.maxParticipants) {
  throw new ConflictException("해당 매치의 참가 정원이 마감되었습니다.");
}
```

**📌 예방 가이드라인**:

- `$transaction` 내에서 참가 인원 확인 + 신청 처리 원자적 실행 (Race Condition 방지)

---

### BE-029: AlreadyJoined — 픽업 매치 중복 참가 신청

| 항목     | 내용                                                                     |
| -------- | ------------------------------------------------------------------------ |
| **모듈** | `src/pickup-match/pickup-match.service.ts` (Task #41 구현 예정)          |
| **문제** | 동일 사용자가 같은 매치에 두 번 신청 시 중복 `PickupMatchApplicant` 생성 |
| **영향** | 잘못된 참가자 수 집계                                                    |
| **상태** | ⏳ Task #41 구현 시 적용 예정                                            |

**에러 메시지**:

```json
{ "statusCode": 409, "message": "이미 참가 신청한 매치입니다." }
```

**🟢 올바른 코드**:

```typescript
const existing = await this.prisma.pickupMatchApplicant.findFirst({
  where: { matchId, userId },
});
if (existing) throw new ConflictException("이미 참가 신청한 매치입니다.");
```

**📌 예방 가이드라인**:

- `PickupMatchApplicant` 스키마에 `@@unique([matchId, userId])` 제약 추가

---

### BE-030: MatchNotRecruiting — 모집 종료/취소된 매치 참가 신청

| 항목     | 내용                                                            |
| -------- | --------------------------------------------------------------- |
| **모듈** | `src/pickup-match/pickup-match.service.ts` (Task #41 구현 예정) |
| **문제** | 상태가 `FULL`, `CANCELLED`, `COMPLETED`인 매치에 참가 신청 허용 |
| **영향** | 잘못된 상태의 매치에 참가 레코드 생성                           |
| **상태** | ⏳ Task #41 구현 시 적용 예정                                   |

**에러 메시지**:

```json
{ "statusCode": 400, "message": "현재 참가 신청이 불가능한 매치입니다." }
```

**🟢 올바른 코드**:

```typescript
if (match.status !== "OPEN") {
  throw new BadRequestException("현재 참가 신청이 불가능한 매치입니다.");
}
```

**📌 예방 가이드라인**:

- 참가 신청 허용 상태: `OPEN`만 허용
- `FULL`, `CANCELLED`, `COMPLETED` 상태에서 모두 차단

---

---

        [BACKEND] 작성 2026.03.05. 13:45:55

---

### BE-031: AuthLogin429FalsePositive — Redis Throttler TTL 단위 불일치로 로그인 429 오탐

| 항목     | 내용                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| **모듈** | `src/redis/redis-throttler.storage.ts`                                                                     |
| **문제** | Nest Throttler `ttl`(밀리초)를 Redis `EXPIRE`(초)로 그대로 저장해 1분 제한이 60000초(약 16.7시간)로 오동작 |
| **영향** | `/api/v1/auth/login`에서 정상 사용자도 장시간 429(Too Many Requests) 발생                                  |
| **상태** | ✅ 수정 완료 (TTL 단위 변환 + legacy 키 보정)                                                              |

**에러 메시지**:

```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests"
}
```

**원인 분석**:

- `@nestjs/throttler`의 `ttl` 값은 ms 단위로 전달됨 (`60000`)
- Redis `expire(key, ttl)`는 초 단위 입력을 기대함
- 기존 코드가 `expire(key, 60000)`을 호출해 60000초 TTL이 저장됨
- 한 번 제한에 걸리면 `X-RateLimit-Reset`이 수만 초로 내려가 로그인이 장시간 차단됨

**🔴 잘못된 코드**:

```typescript
// redis-throttler.storage.ts
if (totalHits === 1) {
  await this.redisService.expire(redisKey, ttl); // ttl=60000(ms) -> Redis는 60000초로 해석
}
```

**🟢 올바른 코드**:

```typescript
const ttlInSeconds = Math.max(1, Math.ceil(ttl / 1000));

if (totalHits === 1) {
  await this.redisService.expire(redisKey, ttlInSeconds);
}

let timeToExpire = await this.redisService.ttl(redisKey);
if (timeToExpire > ttlInSeconds * 2) {
  await this.redisService.expire(redisKey, ttlInSeconds); // legacy oversized TTL 보정
  timeToExpire = ttlInSeconds;
}
```

**📌 예방 가이드라인**:

1. Throttler/Cache TTL 단위(ms/s) 경계를 코드 주석으로 명시
2. Redis 만료 API는 `expire`(초) vs `pexpire`(밀리초) 사용 규칙 통일
3. 레이트리밋 저장소에 단위 변환 회귀 테스트 추가 (`redis-throttler.storage.spec.ts`)
4. 배포 후 `ratelimit:*` 키의 TTL 이상치 모니터링(예: 3600초 초과 알림)

---

---

        [BACKEND] 작성 2026.03.05. 13:55:40

---

### BE-032: ModulePrismaImportMissing — PrismaModule 누락으로 Nest DI 실패

| 항목     | 내용                                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------------------- |
| **모듈** | `src/pickup-matches/pickup-matches.module.ts`, `src/app-management/app-management.module.ts`                           |
| **문제** | `PickupMatchesService`, `AppManagementService`가 `PrismaService`를 주입받지만 모듈의 `imports`에 `PrismaModule`이 없음 |
| **영향** | 서버 부팅 시 DI 오류 발생, API 전체 기동 실패                                                                          |
| **상태** | ✅ 수정 완료 (`imports: [PrismaModule]` 적용)                                                                          |

**에러 메시지**:

```text
Nest can't resolve dependencies of the PickupMatchesService (?).
Please make sure that the argument PrismaService at index [0] is available in the PickupMatchesModule context.
```

**원인 분석**:

- NestJS는 모듈 스코프 내 provider만 DI 가능
- `PrismaService`는 `PrismaModule`에서 export 되지만, 해당 feature module에서 import 하지 않아 주입 실패

**🔴 잘못된 코드**:

```typescript
@Module({
  controllers: [PickupMatchesController],
  providers: [PickupMatchesService],
})
export class PickupMatchesModule {}
```

**🟢 올바른 코드**:

```typescript
import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [PickupMatchesController],
  providers: [PickupMatchesService],
})
export class PickupMatchesModule {}
```

**📌 예방 가이드라인**:

1. `constructor(private prisma: PrismaService)`를 사용하는 서비스가 있으면 모듈 `imports`에 `PrismaModule` 포함 여부를 체크리스트로 검증
2. 신규 모듈 생성 시 템플릿에 `PrismaModule` 포함 여부를 명시
3. 서버 기동 CI 단계에서 Nest 부트스트랩 실패 로그(`can't resolve dependencies`)를 실패 기준으로 강제

---

## 보안 감사 이슈 (2026-03-07)

---

        [Backend] 작성 2026.03.07. 기준 보안 감사 결과

---

### BE-SEC-001: 웹훅 서명 검증 Optional 처리 (High - 수정 완료)

| 항목     | 내용                                                                          |
| -------- | ----------------------------------------------------------------------------- |
| **파일** | `src/payments/payments.service.ts`                                            |
| **문제** | `signature` 파라미터가 없을 경우 서명 검증을 건너뜀 (`if (signature)` 조건부) |
| **영향** | 서명 없는 위조 웹훅으로 결제 상태 조작 가능 (결제 금액 변조 우회 가능)        |
| **상태** | ✅ 수정 완료                                                                  |

**수정 전 (잘못된 코드)**:

```typescript
if (signature) {
  const isValidSignature = this.kgInicisGateway.verifyWebhookSignature(...);
  if (!isValidSignature) throw new BadRequestException(...);
}
// signature 없으면 검증 없이 통과
```

**수정 후 (올바른 코드)**:

```typescript
if (!signature) {
  throw new BadRequestException("웹훅 서명이 누락되었습니다.");
}
const isValidSignature = this.kgInicisGateway.verifyWebhookSignature(...);
if (!isValidSignature) throw new BadRequestException(...);
```

**예방 가이드**:

- 외부 webhook 처리 시 서명 검증을 Optional이 아닌 필수로 처리
- 서명 없는 webhook은 무조건 400 거부

---

### BE-SEC-002: orderNumber에 userId 일부 노출 (High - 수정 완료)

| 항목     | 내용                                                                               |
| -------- | ---------------------------------------------------------------------------------- |
| **파일** | `src/payments/payments.service.ts`                                                 |
| **문제** | `ORD-${Date.now()}-${userId.substring(0, 8)}` — orderNumber에 userId 앞 8자리 포함 |
| **영향** | 주문번호를 통해 사용자 UUID 일부 유출, 사용자 열거 공격 용이                       |
| **상태** | ✅ 수정 완료                                                                       |

**수정 전**:

```typescript
const orderNumber = `ORD-${Date.now()}-${userId.substring(0, 8)}`;
```

**수정 후**:

```typescript
const randomSuffix = uuidv4().replace(/-/g, "").substring(0, 12);
const orderNumber = `ORD-${Date.now()}-${randomSuffix}`;
```

---

### BE-SEC-003: check-email / check-phone Rate Limit 미적용 (High - 수정 완료)

| 항목     | 내용                                                               |
| -------- | ------------------------------------------------------------------ |
| **파일** | `src/auth/auth.controller.ts`                                      |
| **문제** | `@SkipThrottle()` 적용으로 사용자 열거(User Enumeration) 공격 허용 |
| **영향** | 공격자가 대량 요청으로 등록된 이메일/전화번호 목록 수집 가능       |
| **상태** | ✅ 수정 완료                                                       |

**수정 후**: `@Throttle({ default: { limit: 30, ttl: 60000 } })` 적용

---

### BE-SEC-004: SMS OTP console.log 노출 (High - 수정 완료)

| 항목     | 내용                                                                           |
| -------- | ------------------------------------------------------------------------------ |
| **파일** | `src/sms/sms.service.ts`                                                       |
| **문제** | 개발 환경에서 OTP 코드 전체를 console.log로 출력 (로그 수집 시 민감 정보 노출) |
| **영향** | 로그 집계 시스템(ELK, Datadog 등)에 OTP 평문 노출                              |
| **상태** | ✅ 수정 완료                                                                   |

**수정 후**: 마스킹 처리 (`OTP: 12****`) + 구조화 logger 사용

---

### BE-SEC-005: payment.config.ts 하드코딩 폴백 키 (High - 수정 완료)

| 항목     | 내용                                                                  |
| -------- | --------------------------------------------------------------------- |
| **파일** | `src/config/payment.config.ts`                                        |
| **문제** | `INICIS_MERCHANT_KEY`, `INICIS_SIGNATURE_KEY`에 하드코딩 폴백 값 존재 |
| **영향** | 프로덕션 환경변수 미설정 시 취약한 기본값으로 결제 처리               |
| **상태** | ✅ 수정 완료                                                          |

**수정 후**: 프로덕션 환경에서 필수 변수 누락 시 서버 시작 즉시 중단하는 검증 로직 추가

---

### BE-SEC-006: main.ts 내부 IP 주소 하드코딩 노출 (Medium - 수정 완료)

| 항목     | 내용                                                                         |
| -------- | ---------------------------------------------------------------------------- |
| **파일** | `src/main.ts`                                                                |
| **문제** | `192.168.0.105`, `211.236.162.105` 실서버 IP가 코드에 하드코딩되어 로그 출력 |
| **영향** | 소스코드 노출 시 내부 네트워크 구성 파악 가능                                |
| **상태** | ✅ 수정 완료                                                                 |

---

### BE-SEC-007: WebSocket CORS `origin: "*"` 설정 (High - 이미 수정됨)

| 항목          | 내용                                                       |
| ------------- | ---------------------------------------------------------- |
| **파일**      | `src/websocket/notifications.gateway.ts`                   |
| **문제**      | CLAUDE.md에서 `cors: {origin: "*"}` 위험으로 기록된 이슈   |
| **현재 상태** | `CORS_ORIGINS` 환경변수 기반 화이트리스트로 이미 수정 완료 |
| **상태**      | ✅ 이미 해결됨                                             |

---

### BE-SEC-008: 웹훅 서명 비활성화 옵션 존재 (Medium - 권고)

| 항목     | 내용                                                                    |
| -------- | ----------------------------------------------------------------------- |
| **파일** | `src/config/payment.config.ts`, `src/payments/kg-inicis.gateway.ts`     |
| **문제** | `INICIS_VERIFY_SIGNATURE=false` 환경변수로 서명 검증 완전 비활성화 가능 |
| **영향** | 운영 실수로 프로덕션 서명 검증 비활성화 시 결제 위조 공격 허용          |
| **권고** | 프로덕션에서는 `INICIS_VERIFY_SIGNATURE` 비활성화 차단 로직 추가 권장   |
| **상태** | ⬜ 미해결 (권고)                                                        |

```typescript
// 권장 추가 로직 (kg-inicis.gateway.ts)
verifyWebhookSignature(...): boolean {
  if (!this.config.webhook.verifySignature && isProduction) {
    throw new Error("프로덕션 환경에서 웹훅 서명 검증을 비활성화할 수 없습니다.");
  }
  ...
}
```

---

---

        [Backend] Written 2026.03.09. 09:25:00

---

## BE-033: Prisma Client 미재생성으로 인한 shippingPolicy 프로퍼티 누락

### Error Message

```
src/shop/shop.service.ts:970:39 - error TS2339: Property 'shippingPolicy' does not exist on type 'PrismaService'.
src/shop/shop.service.ts:988:40 - error TS2339: Property 'shippingPolicy' does not exist on type 'PrismaService'.
src/shop/shop.service.ts:1002:23 - error TS2339: Property 'shippingPolicy' does not exist on type 'PrismaService'.
```

### Cause Analysis

`schema.prisma`에 `ShippingPolicy` 모델이 추가됐지만 `npx prisma generate`를 실행하지 않아 Prisma Client가 구 버전 상태로 남아 있는 경우 발생. `git pull` 후 스키마가 변경된 경우 반드시 클라이언트를 재생성해야 함.

### Incorrect Code

```typescript
// schema.prisma에 ShippingPolicy 모델은 있지만
// prisma generate 미실행 → PrismaService에 shippingPolicy 없음
const updated = await this.prisma.shippingPolicy.update({ ... }); // TS2339
```

### Correct Code

```bash
# 해결 방법: Prisma 클라이언트 재생성
cd teamplus-backend
npx prisma generate
```

### Prevention Guide

- `git pull` 후 `prisma/schema.prisma`가 변경된 경우 반드시 `npx prisma generate` 실행
- 새 모델 추가 시 마이그레이션과 클라이언트 재생성을 함께 처리: `npm run db:migrate`

---

---

        [Backend] 작성 2026.03.26. 10:00:00

---

### BE-034: PostgreSQL Enum 값 추가 시 마이그레이션 오류

| 항목     | 내용                                                                                                     |
| -------- | -------------------------------------------------------------------------------------------------------- |
| **파일** | `prisma/schema.prisma`, `prisma/migrations/`                                                             |
| **문제** | PostgreSQL에서 기존 Enum에 새 값을 추가할 때 `ALTER TYPE ... ADD VALUE`가 트랜잭션 내에서 실패할 수 있음 |
| **영향** | 마이그레이션 실패, 스키마 동기화 불가                                                                    |
| **상태** | ⬜ 주의 필요                                                                                             |

**에러 메시지**:

```
ERROR: unsafe use of new value "NEW_VALUE" of enum type "EnumName"
HINT: New enum values must be committed before they can be used.
```

**해결 방안**:

```sql
-- 1. 별도 마이그레이션에서 enum 값 추가 (트랜잭션 외부)
ALTER TYPE "EnumName" ADD VALUE 'NEW_VALUE';

-- 2. 또는 Prisma에서 --create-only 후 수동 편집
-- npx prisma migrate dev --create-only
-- migration.sql을 수동으로 수정 후 적용
```

### Prevention Guide

- Prisma 모델 111개, 7개 Enum 관리 중 (2026-03-26 기준)
- Enum 값 추가 시 별도 마이그레이션으로 분리
- `npx prisma migrate dev --create-only`로 SQL 확인 후 적용
- PostgreSQL 16 환경에서 테스트 필수 (MariaDB 아님!)

---

---

        [Backend] 작성 2026.04.05. 20:55:00

---

### BE-035: DevTestAccountDrift — 개발 환경 테스트 계정 드리프트로 `/api/v1/auth/login` 401 발생

| 항목     | 내용                                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------------------- |
| **파일** | `src/auth/auth.service.ts`, `src/auth/services/development-test-auth.service.ts`, `prisma/seed.ts`                     |
| **문제** | 개발 DB에서 기본 테스트 계정이 누락되거나 비밀번호 해시가 달라지면 암호화 복호화는 성공해도 로그인 단계에서 401이 발생 |
| **영향** | `director@teamplus.com`, `coach@teamplus.com` 등 기본 테스트 계정 로그인 불가                                          |
| **상태** | ✅ 해결됨                                                                                                              |

**에러 메시지**:

```http
POST /api/v1/auth/login
401 Unauthorized

{
  "success": false,
  "statusCode": 401,
  "message": "Unauthorized"
}
```

**원인 분석**:

- Web이 전송한 AES-GCM payload는 정상 복호화되지만, `AuthService.login()`에서 사용자 조회 또는 bcrypt 검증이 실패함
- 원인은 대체로 두 가지였음
- 개발 DB에 시드 테스트 계정이 없음
- 테스트 계정은 있으나 현재 저장된 `passwordHash`가 기본 비밀번호 `Test1234!`와 일치하지 않음
- 기존 구조는 `prisma/seed.ts`를 한 번 실행했다는 가정에 의존하고 있어서, 공유 개발 DB가 drift 되면 로그인만 401로 반복됨

**🔴 잘못된 코드 예시**:

```typescript
async login(loginDto: LoginDto) {
  const { email, password } = loginDto;

  const user = await this.prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new UnauthorizedException(
      "이메일 또는 비밀번호가 일치하지 않습니다.",
    );
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new UnauthorizedException(
      "이메일 또는 비밀번호가 일치하지 않습니다.",
    );
  }
}
```

**🟢 올바른 코드 예시**:

```typescript
async login(loginDto: LoginDto) {
  const { email, password } = loginDto;

  await this.developmentTestAuthService.ensureFixturesForLogin(
    email,
    password,
    this.SALT_ROUNDS,
  );

  const user = await this.prisma.user.findUnique({
    where: { email },
  });

  const isPasswordValid = user
    ? await bcrypt.compare(password, user.passwordHash)
    : false;

  if (!user || !isPasswordValid) {
    throw new UnauthorizedException(
      "이메일 또는 비밀번호가 일치하지 않습니다.",
    );
  }
}
```

**📌 예방 가이드라인**:

- 개발 환경 기본 계정은 `prisma/seed.ts`만 믿지 말고, 로그인 경로에서 최소한의 self-healing 레이어를 둡니다.
- 운영 환경에서는 테스트 계정 자동 생성/보정 로직이 절대 동작하지 않도록 `NODE_ENV !== "production"`으로 제한합니다.
- 기본 테스트 계정 비밀번호를 바꿀 경우 Web 암호화 테스트 계정 안내와 시드 정의를 동시에 갱신합니다.
- 공유 개발 DB를 쓰는 경우 `director@teamplus.com`, `coach@teamplus.com` 같은 핵심 계정은 정기적으로 동기화 여부를 확인합니다.

---

---

        [Backend] 작성 2026.04.05. 21:05:00

---

### BE-036: LoginErrorMaskedAs401 — `auth.controller`가 인증/DB 예외를 모두 401로 덮어씀

| 항목     | 내용                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **파일** | `src/auth/auth.controller.ts`                                                                                                         |
| **문제** | 로그인 컨트롤러가 복호화 예외뿐 아니라 `AuthService.login()`에서 발생한 `HttpException`까지 모두 `UnauthorizedException`으로 재변환함 |
| **영향** | 실제로는 429 계정 잠금, 500 서버 오류, 409 데이터 오류여도 클라이언트에는 항상 401 Unauthorized로만 보임                              |
| **상태** | ✅ 해결됨                                                                                                                             |

**에러 메시지**:

```http
POST /api/v1/auth/login
401 Unauthorized

{
  "success": false,
  "statusCode": 401,
  "message": "Unauthorized"
}
```

**원인 분석**:

- `auth.controller.ts`의 `login()` 메서드가 복호화와 실제 인증 로직 전체를 하나의 `try/catch`로 감싸고 있었음
- `AuthService.login()`에서 발생한 `HttpException`도 `UnauthorizedException`이 아니면 모두 다시 401로 변환됨
- 그 결과 실제 장애 원인이 숨겨져, 디버깅 시 "복호화 문제인지, 계정 잠금인지, DB 오류인지" 구분이 불가능했음

**🔴 잘못된 코드 예시**:

```typescript
try {
  const decryptedJson = await this.cryptoService.decryptCredentialsWithAudit(
    encryptedDto,
    req,
  );
  const { email, password } = JSON.parse(decryptedJson);

  return this.authService.login({ email, password } as LoginDto);
} catch (error) {
  if (error instanceof UnauthorizedException) {
    throw error;
  }

  throw new UnauthorizedException("이메일 또는 비밀번호가 올바르지 않습니다.");
}
```

**🟢 올바른 코드 예시**:

```typescript
let email: string | undefined;
let password: string | undefined;

try {
  const decryptedJson = await this.cryptoService.decryptCredentialsWithAudit(
    encryptedDto,
    req,
  );
  const parsed = JSON.parse(decryptedJson);
  email = parsed.email;
  password = parsed.password;
} catch (error) {
  throw new UnauthorizedException("이메일 또는 비밀번호가 올바르지 않습니다.");
}

return this.authService.login({ email, password } as LoginDto);
```

**📌 예방 가이드라인**:

- 컨트롤러에서는 복호화/파싱 실패와 실제 인증 실패를 같은 `catch`로 처리하지 않습니다.
- 서비스에서 던진 `HttpException`은 재포장하지 말고 그대로 전달해 실제 상태코드와 원인을 유지합니다.
- 인증 경로에서 보안상 마스킹이 필요한 구간은 "복호화 실패"까지만 제한하고, 이후 비즈니스 예외는 표준 예외 필터에 맡깁니다.

---

## 📝 변경 이력

| 날짜       | 버전   | 변경 내용                                                                                         |
| ---------- | ------ | ------------------------------------------------------------------------------------------------- |
| 2026-04-15 | 1.12.0 | BE-037 추가 (`app_banners` 테이블 누락으로 AppManagementService 부팅 실패)                        |
| 2026-04-05 | 1.11.0 | BE-036 추가 (auth.controller가 로그인 예외를 모두 401로 마스킹하던 문제 수정)                     |
| 2026-04-05 | 1.10.0 | BE-035 추가 (개발 DB 테스트 계정 드리프트로 auth/login 401 발생, 개발용 self-healing 동기화 적용) |
| 2026-03-26 | 1.9.0  | BE-034 추가 (PostgreSQL Enum 값 추가 시 마이그레이션 오류 주의)                                   |
| 2026-03-09 | 1.8.0  | BE-033 추가 (git pull 후 Prisma Client 미재생성 - shippingPolicy TS2339)                          |
| 2026-03-07 | 1.7.0  | BE-SEC-001~008 보안 감사 이슈 6개 수정, 2개 권고                                                  |
| 2026-03-05 | 1.6.0  | BE-032 추가 (PickupMatches/AppManagement PrismaModule 누락 DI 오류 수정)                          |
| 2026-03-05 | 1.5.0  | BE-031 추가 (auth/login 429 오탐 - TTL ms/s 단위 불일치 수정)                                     |
| 2026-04-13 | 1.5.0  | BE-031 Venue P2022 스키마-DB 불일치 추가 (해결)                                                   |
| 2026-03-05 | 1.4.0  | BE-021~030 추가 (Chat 3건, Search 2건, Reviews 2건, PickupMatch 3건)                              |
| 2026-03-05 | 1.3.0  | BE-017~020 추가 (webhook 401, $transaction 누락, shadow DB, Bull Queue)                           |
| 2026-01-26 | 1.2.0  | BE-016 Prisma Client 스키마 동기화 오류 추가 및 해결                                              |
| 2026-01-19 | 1.1.0  | BE-015 AuditLog FK 제약 위반 에러 추가 및 해결                                                    |
| 2026-01-19 | 1.0.0  | 초기 문서 작성                                                                                    |

---

### BE-031: Venue API P2022 스키마-DB 불일치 (description 컬럼 누락)

| 항목     | 내용                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **파일** | `venues.service.ts`, `prisma/schema.prisma`, `prisma/migrations/20260412010000_add_venue_description/`                               |
| **위치** | `GET /api/v1/venues` (getPublicVenues)                                                                                               |
| **문제** | Prisma 스키마에 `description` 필드가 추가되었으나 마이그레이션이 `applied_steps_count=0`으로 기록되어 실제 DB에 컬럼이 생성되지 않음 |
| **영향** | `/venue-manage/` 페이지에서 "데이터베이스 오류가 발생했습니다" 표시, 구장 관련 모든 API 500 에러                                     |
| **상태** | ✅ 해결 (2026-04-13)                                                                                                                 |
| **작성** | backend 작성 2026.04.13. 23:12:22                                                                                                    |

**에러 메시지**:

```json
{
  "success": false,
  "statusCode": 500,
  "message": "데이터베이스 오류가 발생했습니다.",
  "errorCode": "DB_ERROR_P2022"
}
```

**원인 분석**:

- `prisma migrate resolve --applied`로 마이그레이션을 적용 표시했으나 실제 SQL이 실행되지 않음
- `_prisma_migrations` 테이블에 `applied_steps_count=0`으로 기록
- `VENUE_PUBLIC_SELECT`에서 `description: true`를 포함하여 존재하지 않는 컬럼 SELECT 시도 → P2022 발생

**잘못된 상태**:

```sql
-- _prisma_migrations 레코드
migration_name: '20260412010000_add_venue_description'
finished_at: '2026-04-13T08:28:52.283Z'
applied_steps_count: 0  -- SQL 미실행!
```

**수정 내용**:

```sql
-- 수동 DDL 적용
ALTER TABLE "icehockey"."venues" ADD COLUMN IF NOT EXISTS "description" TEXT;
```

**추가 개선** — `AllExceptionsFilter`에 P2022 전용 처리 추가:

```typescript
case "P2022": {
  const column = (error.meta?.column as string) || "필드";
  this.logger.error(`[P2022] 스키마-DB 불일치: 컬럼 '${column}'이 DB에 존재하지 않습니다.`);
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: "데이터베이스 스키마가 동기화되지 않았습니다. 관리자에게 문의하세요.",
    errorCode: "DB_SCHEMA_MISMATCH",
  };
}
```

**예방 가이드**:

1. `prisma migrate resolve --applied` 사용 후 반드시 `SELECT column_name FROM information_schema.columns WHERE table_name='대상테이블'`로 컬럼 존재 검증
2. `applied_steps_count=0`인 마이그레이션은 SQL이 실행되지 않았으므로 수동 DDL 필요
3. 새 컬럼 추가 시 `IF NOT EXISTS` 안전 절 사용 권장

---

### BE-037: AppManagementService P2021 - `app_banners` 테이블 누락으로 부팅 실패

| 항목     | 내용                                                                                                                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **파일** | `src/app-management/app-management.service.ts`, `prisma/migrations/20260305041115_add_app_management_models/`                                               |
| **위치** | `AppManagementService.onModuleInit()`                                                                                                                       |
| **문제** | 앱 시작 시 `this.prisma.appBanner.findMany()`를 즉시 호출하는데, 현재 DB에 `icehockey.app_banners`가 없어 Prisma `P2021`이 발생하며 Nest 부팅 전체가 중단됨 |
| **영향** | 앱 관리/메인 팝업 기능을 쓰지 않는 환경에서도 백엔드 서버가 시작되지 않음                                                                                   |
| **상태** | ✅ 해결 (2026-04-15)                                                                                                                                        |
| **작성** | backend 작성 2026.04.15. 23:59:00                                                                                                                           |

**에러 메시지**:

```text
PrismaClientKnownRequestError:
The table `icehockey.app_banners` does not exist in the current database.
code: 'P2021'
```

**원인 분석**:

- `AppBanner` 모델과 코드 참조는 존재하지만, 실제 PostgreSQL 스키마에는 `app_banners` 테이블이 없음
- `onModuleInit()`가 초기 데이터 보정 로직을 무조건 실행하면서, 선택 기능 테이블 누락이 서버 전체 부팅 실패로 전파됨
- `20260305041115_add_app_management_models` 마이그레이션은 MySQL 문법 기반이라 PostgreSQL 운영 DB 적용 이력과 불일치했을 가능성이 큼

**잘못된 코드**:

```typescript
async onModuleInit() {
  const banners = await this.prisma.appBanner.findMany({
    select: { id: true, targetRolesJson: true },
  });

  await Promise.all(/* ... */);
}
```

**올바른 코드**:

```typescript
async onModuleInit() {
  try {
    const banners = await this.prisma.appBanner.findMany({
      select: { id: true, targetRolesJson: true },
    });

    await Promise.all(/* ... */);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2021"
    ) {
      this.logger.warn(
        "Skipping AppBanner startup backfill because `app_banners` does not exist in the current database.",
      );
      return;
    }

    throw error;
  }
}
```

**추가 조치**:

```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'icehockey'
  AND table_name = 'app_banners';
```

```text
테이블이 없으면 PostgreSQL 기준 DDL 또는 검증된 마이그레이션으로 `app_banners`를 생성해야 합니다.
기존 `migration.sql`은 MySQL 문법이므로 그대로 실행하지 말고 PostgreSQL용으로 변환한 뒤 적용합니다.
```

**예방 가이드**:

1. `onModuleInit()`에서는 선택 기능용 테이블 조회 실패가 서버 전체 부팅 실패로 이어지지 않도록 `P2021`을 격리 처리
2. Prisma 스키마 추가 후 `_prisma_migrations`뿐 아니라 `information_schema.tables`로 실제 테이블 존재까지 검증
3. MySQL → PostgreSQL 전환 구간의 레거시 마이그레이션은 문법 호환성을 반드시 점검
4. 부팅 시점 데이터 보정 로직은 필수 테이블과 선택 기능 테이블을 구분해 실패 범위를 제한

---

## BE-034: chldiv 분기 로그인 — 허용되지 않은 UserType 으로 잘못된 화면 접근

> **backend 작성 2026.04.20. 16:45:00**

### Error Message

```text
UnauthorizedException (401)
message: "해당 화면에서는 로그인할 수 없는 계정입니다."
```

### 발생 조건

- APP 전용 엔드포인트(`POST /api/v1/auth/login`, `/login/dev`) 에 SYSTEM/OPER 계정 로그인 시도
- ADM 전용 엔드포인트(`POST /api/v1/auth/admin/login`) 에 ADMIN/PARENT/COACH/DIRECTOR/TEEN/CHILD/ACADEMY_DIRECTOR 계정 로그인 시도

### 원인

- v8.5+ 에서 로그인 엔드포인트가 `chldiv=APP` / `chldiv=ADM` 으로 분기됨
- `src/auth/constants/chldiv.constants.ts` 의 `CHLDIV_ALLOWED_USER_TYPES` 매트릭스 기준으로 서버가 userType 가드
- 이메일/비밀번호가 정확해도 화면-역할 매트릭스에 어긋나면 차단

### 허용 매트릭스

| chldiv | 엔드포인트                                                     | 허용 UserType                                                       |
| ------ | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| APP    | `/auth/login`, `/auth/login/dev`                               | PARENT · COACH · CHILD · DIRECTOR · TEEN · ADMIN · ACADEMY_DIRECTOR |
| ADM    | `/auth/admin/login` (암호화 전용 · 평문 dev 엔드포인트 미제공) | SYSTEM · OPER                                                       |

### 잘못된 코드 (X)

```ts
// teamplus-admin 에서 일반 /auth/login 호출 — SYSTEM/OPER 계정이라 401 반환
await api.post("/auth/login", encryptedPayload);
```

### 올바른 코드 (O)

```ts
// teamplus-admin: ADM 전용 엔드포인트 사용
await api.post("/auth/admin/login", encryptedPayload);

// teamplus-web / teamplus-app / tbot: APP 전용 유지
await api.post("/auth/login", encryptedPayload);
```

### 예방 가이드

1. **프런트 호출 규약**: teamplus-admin → `/auth/admin/login` · teamplus-web + teamplus-app + tbot → `/auth/login`
2. **chldiv 는 서버 상수**: 엔드포인트 경로로만 결정 · 클라이언트 페이로드/헤더로 전달 금지 (조작 방지)
3. **계정 역할 매핑**: `system@teamplus.com` / `oper@teamplus.com` 은 ADM 전용. `admin@teamplus.com` (레거시) 는 APP 호환
4. **AuditLog 자동 기록**: chldiv mismatch 는 `auth:login` 리소스에 `action: "login_failed"` + `reason: "chldiv_mismatch"` 로 자동 저장
5. **보안 메시지**: 응답은 항상 "해당 화면에서는 로그인할 수 없는 계정입니다." — 계정 존재/역할 힌트 금지 (보안)

### 관련 파일

- `src/auth/constants/chldiv.constants.ts` — 허용 매트릭스 + `isUserTypeAllowedForChldiv` / `isAdminRole`
- `src/auth/auth.service.ts` Step 3.5 — 가드 로직
- `src/auth/auth.controller.ts` `handleEncryptedLogin` / `handleDevLogin` — chldiv 주입
- `teamplus-admin/src/services/auth.service.ts` — `/auth/admin/login` 호출
- `prisma/schema.prisma` UserType enum — SYSTEM, OPER 추가
- `prisma/migrations/20260420000000_add_system_oper_user_types/migration.sql` — enum ADD VALUE
- `prisma/migrations/20260420000100_migrate_system_oper_seed_users/migration.sql` — seed 계정 userType UPDATE

### 운영 배포 체크리스트

1. `npx prisma migrate deploy` (2개 마이그레이션 순차 실행)
2. `npm run db:seed` (admin@/oper@/system@ 3계정 upsert)
3. teamplus-admin 재배포 — `/auth/login` → `/auth/admin/login` 호출 전환 확인
4. **tbot 영향 없음** — tbot/index.html 은 현재 admin 창도 `/auth/login` 경유. `UserType=ADMIN` 계정(admin@teamplus.com) 은 APP 허용 매트릭스에 포함되어 기존 흐름 유지. **ADM 전용 dev 엔드포인트는 의도적으로 제공하지 않음** (관리자 평문 로그인 금지). SYSTEM/OPER 는 admin UI(:5002) 에서 암호화 플로우로만 로그인

### 후속 RBAC 개선 (본 PR 밖)

- `videos/videos.controller.ts:401` · `community/community.controller.ts` 2곳 · `reviews/reviews.controller.ts:168` · `enrollments/enrollments.service.ts:795` · `academy-promotions/academy-promotions.service.ts:231` · `teams/teams.service.ts` 3곳 — `userType === "ADMIN"` 체크를 `isAdminRole()` 헬퍼로 단계 전환

---

## BE-035: PostgreSQL 연결 슬롯 고갈 (SUPERUSER reserved) 재발

**backend 작성 2026-04-22. HH:MM:SS**

| 항목       | 내용                                                                           |
| ---------- | ------------------------------------------------------------------------------ |
| **파일**   | `teamplus-backend/.env.local` DATABASE_URL · `src/prisma/prisma.service.ts`    |
| **심각도** | 🔴 Critical (부팅 불가)                                                        |
| **상태**   | ✅ 해결 (connection_limit 10→5 재하향 · MAX_RETRIES 5→8 · pool_timeout 20→30s) |

### 오류 메시지

```
Too many database connections opened:
  FATAL: remaining connection slots are reserved for roles with the SUPERUSER attribute
[Nest] PrismaService ⚠️ Database connection attempt 5/5 failed
[Nest] PrismaService ❌ Failed to connect to database after 5 attempts
[Nest] Bootstrap ❌ Failed to start application: PrismaClientInitializationError
```

### 원인

1. 원격 PostgreSQL(`211.236.174.115:55432`)의 `max_connections - superuser_reserved_connections` 슬롯이 공유 개발 환경에서 고갈
2. Cycle 9(2026-04-21)에서 `connection_limit=10`으로 하향 후에도 **다른 팀원 프로세스 · 좀비 연결** 때문에 재발
3. PrismaService `MAX_RETRIES=5 · RETRY_DELAY_MS=3000`(총 최대 45초 대기)으로는 공유 DB 회복 시간 부족
4. `pool_timeout=20s`가 경합 반복 시 여전히 타임아웃

### 잘못된 구성 (X)

```bash
# .env.local (이전)
DATABASE_URL=...?connection_limit=10&pool_timeout=20&...
```

```typescript
// prisma.service.ts (이전)
private readonly MAX_RETRIES = 5;
private readonly RETRY_DELAY_MS = 3000;  // 총 45초
```

### 올바른 구성 (O)

```bash
# .env.local (2026-04-22)
DATABASE_URL=postgresql://user:P%40ssw0rd@211.236.174.115:55432/IceHockey?schema=icehockey&connection_limit=5&connect_timeout=10&pool_timeout=30&socket_timeout=15&statement_cache_size=100
```

```typescript
// prisma.service.ts
private readonly MAX_RETRIES = 8;        // 5→8
private readonly RETRY_DELAY_MS = 5000;  // 3s→5s (총 최대 180초)
```

### 예방 가이드

1. **공유 DB 원칙**: `connection_limit`을 보수적으로 설정 (5). NestJS + Prisma는 트랜잭션이 아닌 일반 쿼리는 단일 연결로 충분
2. **pool_timeout ≥ 30s**: 경합 반복 시 즉시 타임아웃보다 대기 흡수가 유리
3. **PrismaService 재시도**: MAX_RETRIES 8 · DELAY 5s (선형 증가) = 최대 3분 대기 → 다른 개발자 세션 종료 시간 확보
4. **좀비 프로세스 정리**: `ps aux | grep -E "nest|ts-node" | grep -v grep` + `lsof -i :5003`으로 이전 세션 잔류 프로세스 종료
5. **DB 연결 확인**: 원격 DB는 `PGPASSWORD=... psql -h ... -c "SELECT count(*) FROM pg_stat_activity;"`로 실제 점유 수 체크(권한 있는 경우)
6. **영구 대안 (인프라)**: pgbouncer 도입으로 연결 pooling을 Prisma 밖에서 처리하면 프로세스 N개 \* connection_limit 문제 해소
7. **부팅 실패 시 로그 관찰**: `[PrismaService] ⚠️ Database connection attempt X/8 failed` — 5회차부터는 다른 프로세스 문제 의심

### 관련 파일

- `teamplus-backend/.env.local:7` — DATABASE_URL query 파라미터
- `teamplus-backend/src/prisma/prisma.service.ts:15-16` — MAX_RETRIES · RETRY_DELAY_MS
- `teamplus-backend/CLAUDE.md` v2.2 — 자주 발생 문제 테이블 (DB 연결 실패 항목)

### 재발 시 진단 순서

1. `lsof -iTCP -sTCP:LISTEN -P | grep 5003` — 기존 백엔드 프로세스 탐지 → `kill <pid>`
2. `ps aux | grep -iE "teamplus-backend|ts-node|nest" | grep -v grep` — 좀비 Node 탐지
3. `nc -zv 211.236.174.115 55432` — DB 네트워크 도달성 확인
4. DB 권한 있을 시 `pg_stat_activity` 로 idle 세션 60초 이상 누적 여부 확인
5. 재시작: `cd teamplus-backend && npm run start:dev`

---

## BE-038: ChildrenList — ChildProfile 누락 자녀 1건 때문에 자녀 목록 전체 조회 실패

**발생일**: 2026-04-29
**심각도**: 🟡 Medium (학부모 페이지 자녀 카드/대시보드 일부 화면 빈 응답)
**환경**: development (production 영향 가능)

### 증상

`GET /api/v1/children` 호출 시 학부모에게 등록된 자녀 중 단 한 명이라도 `ChildProfile` 레코드가 누락되어 있으면 **자녀 목록 전체가 404 NotFoundException** 으로 응답됨. 정상 자녀 데이터까지 함께 반환 실패.

```log
[Nest] WARN [AllExceptionsFilter] [404] 자녀 프로필 정보가 없습니다.
{"method":"GET","url":"/api/v1/children", ...}
ERROR: HTTP request failed
  path: "/api/v1/children"
  userId: "cmoib0ihx0012yhh7girxofsz"
  error.name: "NotFoundException"
  error.message: "자녀 프로필 정보가 없습니다."
  stack: ChildrenService.mapParentChildToResponse (line 513)
         → ChildrenService.getMyChildren (line 218 in Array.map)
```

### 근본 원인

`ChildrenService.getMyChildren` (`teamplus-backend/src/children/children.service.ts:230`) 의 `.map()` 콜백 내부에서 `mapParentChildToResponse` 가 `child.childProfile` 누락 시 `NotFoundException` 을 throw한다.

```ts
// 문제 코드 (수정 전)
return parentChildren.map((pc) => this.mapParentChildToResponse(pc));
// → 한 명의 자녀라도 profile 누락 시 전체 map 중단 → 404 응답
```

`mapParentChildToResponse` (line 624):

```ts
const profile = child.childProfile;
if (!profile) {
  throw new NotFoundException("자녀 프로필 정보가 없습니다.");
}
```

**원칙 위반**: 단건 누락이 전체 컬렉션 조회 실패로 전이 — REST API 목록 조회의 견고성 원칙 위반.

- 단건 조회 `getChild()` 에서 throw 는 합당 (명시적 자녀 ID 요청 → 데이터 없음)
- 목록 조회 `getMyChildren()` 에서는 누락 항목을 스킵하고 정상 데이터를 반환해야 함

### 데이터 누락 시나리오

`ChildProfile` 이 누락되는 경우:

1. 마이그레이션 스크립트 중단 (User 만 생성 후 ChildProfile 미생성)
2. 시드 데이터 부분 적용
3. 과거 회원가입 흐름의 트랜잭션 누락 (이미 수정되었으나 잔존 데이터)
4. 수동 DB 조작

### 해결 방법

`getMyChildren` 의 `.map()` 직전에 `.filter()` 로 ChildProfile 누락 자녀를 스킵하면서 `logger.warn` 으로 가시화:

```ts
// 수정 후
return parentChildren
  .filter((pc) => {
    if (!pc.child.childProfile) {
      this.logger.warn(
        `자녀 프로필 누락으로 목록에서 제외: childId=${pc.child.id}, parentId=${parentId}`,
      );
      return false;
    }
    return true;
  })
  .map((pc) => this.mapParentChildToResponse(pc));
```

**유지 정책**:

- 목록 조회 `getMyChildren()` — partial 허용, 누락 항목 로그 후 스킵
- 단건 조회 `getChild()` — `NotFoundException` 그대로 유지 (호출자가 명시한 자녀 ID 데이터 없음)
- `mapToChildResponse(childId)` — 신규 생성된 자녀 변환에서는 throw 유지 (생성 직후 null 이면 시스템 버그)

### 후속 조치 권장

- DB 점검: `SELECT u.id, u."firstName", u."lastName", u."userType" FROM "User" u LEFT JOIN "ChildProfile" cp ON cp."userId" = u.id WHERE u."userType" IN ('CHILD', 'TEEN') AND cp.id IS NULL;` — 프로필 누락 자녀 식별 후 백필 또는 정리
- 회원가입 트랜잭션 검증: `addChild` 메서드 `tx.childProfile.create` 가 실패 시 자녀 User 도 롤백되는지 재확인 (검증 결과 `addChild` 흐름은 견고함, 트랜잭션 원자성 보장)
- 모니터링: `자녀 프로필 누락으로 목록에서 제외` WARN 로그가 production 에서 반복 발생하면 데이터 정합성 이슈로 격상

### ⚠️ 잠재 근본 원인 — `auth.register()` 분기 누락

`auth.service.ts:201-277` 의 `register()` 메서드는 `userType` 별 프로필 자동 생성을 분기 처리하지만 **`CHILD`/`TEEN` 분기가 누락**되어 있다:

| userType         | 프로필 자동 생성                             |
| ---------------- | -------------------------------------------- |
| PARENT           | `parentProfile.create` ✅                    |
| COACH            | `coachProfile.create` ✅                     |
| DIRECTOR         | `coachProfile.create` (+ Club·ClubMember) ✅ |
| ACADEMY_DIRECTOR | `academy.create` ✅                          |
| **CHILD / TEEN** | **❌ 누락**                                  |

정상 흐름은 학부모가 `ChildrenService.addChild()` 로 자녀를 등록할 때 ChildProfile 까지 트랜잭션 안에서 생성됨. 그러나 만약 어떤 경로로든 `POST /api/v1/auth/register { userType: "CHILD" }` 또는 `signup` API 가 직접 호출되면 ChildProfile 이 생성되지 않은 채 자녀 User 만 생성됨. 이후 `ParentChild` 관계가 별도로 만들어지면 BE-038 의 트리거 조건 (`childProfile=null`) 이 정확히 형성됨.

**선택지** (정책 결정 필요):

- (A) 정책: `auth.register()` 가 `CHILD`/`TEEN` 을 거부하여 `ChildrenService.addChild()` 만 자녀 생성 경로로 강제. 가장 명확한 invariant.
- (B) 방어: `auth.register()` 의 분기에 `CHILD`/`TEEN` 추가 — birthDate 있을 때 `tx.childProfile.create` 실행. 호환성 보존. **← 적용됨 (2026-04-29)**
- (C) 모니터링만: 현재 BE-038 fix 로 목록 조회는 견고. 회원가입 경로 다음 점검 시 함께 처리.

### 적용된 근본 차단 (2026-04-29)

**(B) 방어적 보강** 채택:

- `auth.service.ts` 선검증: `CHILD`/`TEEN` 가입 시 `birthDate` 누락 → `BadRequestException("자녀(아동/청소년) 회원가입에는 생년월일이 필요합니다.")`
- `auth.service.ts` 트랜잭션 분기: `resolvedUserType === CHILD || TEEN` 이면 `tx.childProfile.create({ data: { userId: newUser.id, birthDate: new Date(birthDate) } })` 실행
- 권장 자녀 등록 경로는 여전히 `ChildrenService.addChild()` (학부모 경유) — 본 분기는 backstop 방어

### 기존 데이터 백필

`teamplus-backend/prisma/backfill-childprofile-be038.sql` 작성됨. 5단계 구성:

1. **STEP 1** 진단: 누락 자녀 식별 (READ-ONLY)
2. **STEP 2** 통계: userType 별 누락/백필가능 카운트
3. **STEP 3** 백필: BEGIN..COMMIT 안에서 `INSERT ... ON CONFLICT (user_id) DO NOTHING` (멱등)
4. **STEP 4** 검증: 백필 후 누락 0건 확인
5. **STEP 5** birthDate 누락 자녀 식별 — 별도 운영 정책 필요 (UX 회수 / WITHDRAWN / 기본값)

운영 DB 적용 절차:

```bash
# 1. 백업
pg_dump -h <host> -U <user> -d teamplus > backup_be038_$(date +%Y%m%d).sql

# 2. 진단 (STEP 1, 2 실행)
psql -h <host> -U <user> -d teamplus -f teamplus-backend/prisma/backfill-childprofile-be038.sql

# 3. 결과 검토 후 STEP 3 의 BEGIN..COMMIT 블록 주석 해제하여 재실행
# 4. STEP 4 로 검증
```

### Dev DB 백필 실행 결과 (2026-04-29)

`211.236.174.115:55432/IceHockey-new` (icehockey schema) 에 직접 적용:

| 항목                                               | 값                                                |
| -------------------------------------------------- | ------------------------------------------------- |
| 누락 자녀 (백필 전)                                | TEEN 20명 (CHILD 0명)                             |
| birthDate 누락                                     | 0명 (모두 BACKFILL_READY)                         |
| INSERT 건수                                        | 20                                                |
| 백필 후 누락                                       | 0건                                               |
| 전체 ParentChild ↔ ChildProfile 정합성             | 25/25 ✅                                          |
| 에러 발생 학부모(`cmoib0ihx0012yhh7girxofsz`) 자녀 | 학생박(TEEN, 2018-06-15) → ChildProfile 백필 완료 |

### 시드 스크립트 재발 방지 (2026-04-29)

근본 누락 위치: `prisma/seeds/run-team-data.ts:333-348` 의 학생 생성 블록에 ChildProfile 생성이 없었음. 동일 fix 적용:

```ts
// 학생 User.create 직후 추가
await prisma.childProfile.create({
  data: {
    userId: student.id,
    birthDate: studentBirthDate,
    currentLevel: 1,
    levelLabel: "입문",
    progressPercent: 0,
  },
});
```

다음 시드 재실행(`npm run db:seed` 또는 `prisma/seeds/run-team-data.ts`) 시 동일 누락이 다시 만들어지지 않음. `prisma/mock-seed.ts` 는 이미 `[...teens, ...children]` 묶어서 ChildProfile 생성하고 있어 정상.

### 관련 파일

- `teamplus-backend/src/children/children.service.ts:230` — `getMyChildren()` 수정 적용
- `teamplus-backend/src/children/children.service.ts:624` — `mapParentChildToResponse()` (변경 없음, 단건 조회용 throw 유지)
- `teamplus-web/src/components/parent/ChildrenSwipeCards.tsx` — 학부모 대시보드 자녀 카드 (404 발생 시 빈 슬롯 처리)

### 재발 방지

- 다른 목록 조회 API 도 동일 패턴 점검: `getMyChildren` 외에 `.map(item => throwIfMissing(item))` 형태가 있는지 grep
- ESLint 룰 추가 검토: `Array.prototype.map` 콜백에서 throw 발생 시 lint 경고 (선택)

---

### BE-038: TeamLogoUpload403 — `team_logo` refType 권한 모델 구버전(coachId 단일 필드)으로 정당한 매니저 차단 + DIRECTOR 무조건 통과 결함

**증상** (2026-05-23 사용자 보고)

`/team/[id]/edit` 페이지에서 팀 로고 업로드 시 다음과 같이 403 응답:

```
Console UploadNetworkError
이 팀의 로고를 업로드할 권한이 없습니다.
src/services/upload.service.ts (347:18) @ xhr.onload
```

프론트 `team/[id]/page.tsx` 의 `isTeamManagerOf(user, team)` 가드는 통과하여 수정 페이지에 진입했음에도, 실제 업로드 요청은 백엔드가 차단.

**원인**

`FilesService.validateUploadPermission` (`teamplus-backend/src/files/files.service.ts:665~684`) 의 `team_logo` 케이스가 구버전 권한 모델을 사용:

```typescript
const canManage =
  team.coachId === userId ||
  userType === "DIRECTOR" ||
  userType === "ACADEMY_DIRECTOR";
```

- `team.coachId` 는 legacy 단일 owner 필드. 현재 권한 모델은 `TeamMember(roleInTeam ∈ [HEAD_COACH, COACH, MANAGER], approvalStatus='approved', leftAt=null)` 다대다 매핑.
- `DIRECTOR` / `ACADEMY_DIRECTOR` userType 만 보고 무조건 통과시키면 본인이 매니저가 아닌 다른 팀의 로고도 업로드 가능해지는 **보안 결함**.
- 결과적으로:
  1. COACH 사용자가 매니저로 승인된 팀이지만 legacy `coachId` 매핑이 비어있으면 차단
  2. DIRECTOR 가 자신과 무관한 팀의 로고도 변경 가능

**해결** (2026-05-23 적용)

**Iteration 1 — 인라인 3경로 OR 검증** (기능적으로 정확하나 SoT 분기):

```typescript
case "team_logo": {
  const team = await this.prisma.team.findUnique({ where: { id: refId }, select: { coachId: true } });
  if (!team) throw new NotFoundException("팀을 찾을 수 없습니다.");
  if (team.coachId === userId) break;  // 1) owner
  const managerMembership = await this.prisma.teamMember.findFirst({
    where: { userId, teamId: refId, approvalStatus: "approved", leftAt: null,
             roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] } },
    select: { id: true },
  });
  if (managerMembership) break;  // 2) TeamMember
  throw new ForbiddenException("이 팀의 로고를 업로드할 권한이 없습니다.");
}
```

**Iteration 2 — SoT 단일화** (사용자 재보고 2026-05-23, 동일 에러 재현):

원인 추가 분석: 사용자 환경에서 backend 가 `node dist/main` 으로 실행 중(watch 모드 아님)이라 Iteration 1 수정이 메모리에 미반영. 추가로 SoT 분기 위험을 영구 차단하기 위해 `TeamsService.assertTeamManagerPermission` 직접 호출로 리팩토링.

```typescript
case "team_logo": {
  const team = await this.prisma.team.findUnique({
    where: { id: refId },
    select: { id: true },
  });
  if (!team) throw new NotFoundException("팀을 찾을 수 없습니다.");
  await this.teamsService.assertTeamManagerPermission(
    userId,
    refId,
    "이 팀의 로고를 업로드할 권한이 없습니다.",
  );
  break;
}
```

부수 변경:
- `FilesModule.imports` 에 `TeamsModule` 추가 (TeamsModule 은 FilesModule 을 import 하지 않음 — 순환 없음)
- `FilesService.constructor` 에 `TeamsService` DI 주입

이로써 `resolveCallerApprovalStatus`(프론트 `isTeamManagerOf` 합성용) ↔ `assertTeamManagerPermission`(권한 검증) ↔ `validateUploadPermission`(업로드 권한) 의 3개 권한 진입점이 **단일 함수(`assertTeamManagerPermission`)** 로 통일됨. 미래 권한 모델 변경 시 자동 정합.

ADMIN userType 은 `validateUploadPermission` 진입 직후(line 663) 이미 통과 처리됨 — 별도 분기 불필요.

### ⚠️ 배포 운영 주의 — Iteration 2 적용 조건

본 수정이 효력을 발휘하려면 backend dist 재빌드 + 프로세스 재시작 필수:

```bash
cd teamplus-backend
npm run build                 # src/files/files.service.ts → dist/files/files.service.js
# (PM2 환경)
pm2 restart teamplus-api
# (수동 실행 환경 — PID 확인 후 종료 → 재기동)
# kill <pid> && node dist/main
```

watch 모드(`npm run start:dev`)면 src 저장 즉시 반영 — 별도 조치 불필요.

### 영향 범위

- `teamplus-backend/src/files/files.service.ts` — `validateUploadPermission` `team_logo` 케이스를 `TeamsService.assertTeamManagerPermission` 위임으로 변경
- `teamplus-backend/src/files/files.module.ts` — `TeamsModule` import 추가
- `teamplus-web/src/app/(common)/team/[id]/edit/page.tsx` — UI 진입 가드 변경 없음(이미 `isTeamManagerOf` 기반)
- `teamplus-web/src/components/shared/AvatarUploader.tsx` · `Uploader.tsx` — 변경 없음

### 재발 방지

- 신규 `refType` 추가 시 권한 모델을 **반드시 `TeamsService.assertTeamManagerPermission` (또는 도메인별 동일 SoT 함수) 호출로 통일** — 인라인 권한 체크 금지
- legacy 단일 `coachId` 필드 사용처 grep 점검: `grep -rn "team.coachId === userId" teamplus-backend/src` — 발견 시 동일 위임 패턴 적용
- 권한 변경 시 프론트 (`/team-roles.ts`)과 백엔드의 정합성을 동시 점검
- **운영 배포 시 src 변경만으로 끝내지 말고 dist 재빌드 + 프로세스 재시작 필수** — Iteration 1 미반영 사례

### 관련 파일

- `teamplus-backend/src/files/files.service.ts:665` — `validateUploadPermission.team_logo` 케이스
- `teamplus-backend/src/files/files.module.ts` — `TeamsModule` import
- `teamplus-backend/src/teams/teams.service.ts:305` — `assertTeamManagerPermission` SoT
- `teamplus-backend/src/teams/teams.service.ts:600` — `resolveCallerApprovalStatus` (myApprovalStatus 합성)
- `teamplus-web/src/lib/team-roles.ts` — `isTeamManagerOf` (프론트 SoT)
- `teamplus-web/src/app/(common)/team/[id]/edit/page.tsx` — 업로더 호출 (`refType="team_logo"`)

---

## 🔗 관련 링크

---

### BE-039: FilenameTokenAppFalsePositive — `.app` 다의어가 토큰 검사에서 false positive 차단

**증상** (2026-05-23 사용자 보고)

팀 로고 등 이미지 업로드 시 다음 에러로 차단:

```
[Uploader] uploadEntry failed UploadNetworkError: 보안상 파일명에 ".app" 토큰이 포함될 수 없습니다.
  at xhr.onload (upload.service.ts:347:18)
```

파일이 정상 이미지(`.png`/`.jpg` 등)임에도 파일명 중간에 "app" 단어(예: `team.app.png`, `MyApp_logo.jpg`, `appicon-512.png`)가 있으면 무조건 차단.

**원인**

`FilesService.assertFile` (`teamplus-backend/src/files/files.service.ts:817~826`) 의 이중 확장자 위장 차단 로직이 파일명을 `[.\s_\-()[\]{}]+` 로 분리 후 모든 토큰을 `DANGEROUS_EXTENSIONS` 와 매칭:

```typescript
const tokens = file.originalname
  .toLowerCase()
  .split(/[.\s_\-()[\]{}]+/)
  .filter(Boolean);
const dangerousToken = tokens.find((t) => DANGEROUS_EXTENSIONS.includes(t));
if (dangerousToken) throw new BadRequestException(...);
```

- `DANGEROUS_EXTENSIONS` 에 `"app"` 포함 → "App"이 흔한 영어 단어(MyApp, HockeyApp, AppIcon 등)임에도 강제 차단
- 토큰이 파일명의 **어느 위치**에 있든 매칭 → 마지막 확장자가 아닌 중간 단어도 차단되는 과도한 검사
- 결과적으로 정상 이미지 업로드가 광범위하게 차단됨

**해결** (2026-05-23 적용)

두 가지 변경 동시 적용:

1) `DANGEROUS_EXTENSIONS` 에서 `"app"` 제거 — 다의어 false positive 큼. `.app` 마지막 확장자 자체는 카테고리별 `extHints` 화이트리스트(`IMAGE`/`AVATAR`/`DOCUMENT` 등)가 이미 차단하므로 블랙리스트에서 빼도 보안 손상 없음:

```typescript
const DANGEROUS_EXTENSIONS: readonly string[] = [
  "exe", "bat", "cmd", "com", "msi", "dmg",
  // "app", ← 제거 (다의어, extHints 가 마지막 확장자 차단)
  "apk", "ipa", "deb", "rpm",
  ...
];
```

2) 토큰 검사를 **마지막 확장자 직전 토큰만** 검사하도록 정교화 — 이중 확장자 위장(`shell.php.jpg`) 패턴만 차단:

```typescript
const parts = file.originalname.toLowerCase().split(".");
if (parts.length >= 3) {
  const beforeExt = parts[parts.length - 2];
  if (DANGEROUS_EXTENSIONS.includes(beforeExt)) {
    throw new BadRequestException(
      `보안상 이중 확장자 위장(.${beforeExt}.${ext}) 은 허용되지 않습니다.`,
    );
  }
}
```

### 검증 매트릭스

| 파일명 | Before | After |
|---|---|---|
| `team.app.png` | ❌ 차단 (오탐) | ✅ 통과 |
| `MyApp_logo.jpg` | ❌ 차단 (오탐) | ✅ 통과 |
| `appicon-512.png` | ❌ 차단 (오탐) | ✅ 통과 |
| `shell.php.jpg` (위장) | ✅ 차단 | ✅ 차단 |
| `malware.exe.png` (위장) | ✅ 차단 | ✅ 차단 |
| `script.bat.jpg` (위장) | ✅ 차단 | ✅ 차단 |
| `image.app` (마지막 확장자) | ✅ 차단 (extHints) | ✅ 차단 (extHints) |

### 영향 범위

- `teamplus-backend/src/files/files.service.ts` — `DANGEROUS_EXTENSIONS` 에서 `"app"` 제거 + 토큰 검사를 마지막 확장자 직전 토큰만 검사하도록 정교화
- `teamplus-web/src/services/upload.service.ts` — 클라이언트는 변경 없음 (서버 응답 메시지 그대로 표시)

### 재발 방지

- 블랙리스트 토큰 추가 시 **다의어 여부**를 반드시 검토. 의심되면 카테고리별 `extHints` 화이트리스트로만 차단하고 토큰 검사에서는 제외
- 토큰 검사 자체는 마지막 확장자 직전(이중 확장자 위장)만으로 제한 — 파일명 중간 단어는 보안 위협 아님
- Web/Admin 의 `DANGEROUS_EXTENSIONS` 도 동일 정책으로 동기화 필요 (별도 작업)

### 관련 파일

- `teamplus-backend/src/files/files.service.ts:118` — `DANGEROUS_EXTENSIONS` 정의
- `teamplus-backend/src/files/files.service.ts:817` — `assertFile` 의 이중 확장자 위장 검사

---

### BE-040: FileContentBasedDenyList — 이름·MIME 위장 봉인용 magic bytes DENY 리스트 신설

**배경** (2026-05-23 사용자 직접 지시)

> "파일형태, 타입을 구분해서 맞으면 파일의 형태를 분석해서 설정값하고 동일하면 막는거지."

이름·확장자·선언된 MIME 모두 클라이언트 위조 가능 → **실제 파일 내용(magic bytes)** 기반 차단이 진짜 보안. 기존 구현은 **ALLOW 리스트**(MAGIC_BYTES) 만 있어서 declaredMime이 ALLOW 리스트에 없는 경우 통과되는 사각 지대 존재.

**해결** (2026-05-23 적용)

`DANGEROUS_SIGNATURES` DENY 리스트 신설 + `assertNotDangerousSignature(buffer)` 검사 함수 추가. uploadOne / uploadMany 3개 진입점 모두에 `assertFile` 직후 호출.

**검출 대상 (실행 가능 형식)**:

| 형식 | Magic Bytes | 차단 이유 |
|---|---|---|
| Mach-O 32/64 LE/BE | `0xfeed face/cafe` / `0xcefa edfe`(역순) | macOS `.app` 번들 내부, iOS `.ipa` 실행파일 |
| Mach-O Universal Binary | `0xcafe babe` / `0xcafe babf` | multi-arch Fat Binary (Java class 와 동일 — 둘 다 차단 대상) |
| PE Executable | `0x4d5a` (MZ) | Windows `.exe`/`.dll`/`.scr` |
| ELF Executable | `0x7f454c46` (\\x7fELF) | Linux/Android `.so`, `.deb` 내부 |
| Android DEX | `0x6465780a` (dex\\n) | Dalvik Executable |

**구현 위치**:

- `teamplus-backend/src/files/files.service.ts:242` — `DANGEROUS_SIGNATURES` 상수 (Mach-O 6변종 + PE + ELF + DEX)
- `teamplus-backend/src/files/files.service.ts:854` — `assertNotDangerousSignature(buffer)` private 함수
- `assertFile` 직후 → `assertMagicBytes` 직전 호출 (line 352·455·543)

**검증 매트릭스**:

| 시나리오 | 결과 |
|---|---|
| 정상 PNG (`splash.png`) | ✅ 통과 (어떤 DENY 시그니처와도 일치 안 함) |
| `team.app.png` (정상 PNG, 이름에 .app 토큰) | ✅ 통과 (이름 무관 · 실제 내용이 PNG) |
| 위장 Mach-O (`.png` 로 이름만 바꿈) | ❌ 차단 ("Mach-O 64-bit 형식 파일은 업로드할 수 없습니다") |
| 위장 PE (`.jpg` 로 이름만 바꿈, MIME=image/jpeg) | ❌ 차단 ("PE Executable 형식 파일은…") |
| 위장 ELF (Linux .so 를 image MIME 으로) | ❌ 차단 |
| 진짜 `.app` 마지막 확장자 | ❌ 차단 (extHints 화이트리스트 + DENY 시그니처 이중) |

### 영향 범위

- `teamplus-backend/src/files/files.service.ts` — `DANGEROUS_SIGNATURES` 상수 + `assertNotDangerousSignature` + 3개 호출처
- `teamplus-web/src/services/upload.service.ts` · `teamplus-admin/src/services/upload.service.ts` — 변경 없음 (클라이언트 사전 검증은 메타데이터만)

### 보안 모델 — 4중 방어선

```
[1] 메타데이터 (assertFile) — 사이즈/확장자/MIME 화이트리스트 (false-positive 정교화 BE-039)
       ↓
[2] DENY 시그니처 (assertNotDangerousSignature) — Mach-O/PE/ELF/DEX 강제 차단 (BE-040 신규)
       ↓
[3] ALLOW 시그니처 (assertMagicBytes) — 선언 MIME 과 실제 바이트 일치 확인
       ↓
[4] 권한 (validateUploadPermission) — refType 별 RBAC (BE-038 SoT 단일화)
```

### 재발 방지

- 신규 위협 형식 발견 시 `DANGEROUS_SIGNATURES` 에 magic bytes 추가만으로 즉시 차단
- `file-type` npm 패키지 도입 검토 (100+ MIME 자동 감지 · 현재는 수동 9 ALLOW + 6 DENY)
- 압축 파일 내부 재귀 검사는 별도 SPEC (zip/docx/xlsx 내부 매크로 차단)

### 관련 파일

- `teamplus-backend/src/files/files.service.ts:204` — `MAGIC_BYTES` ALLOW 리스트
- `teamplus-backend/src/files/files.service.ts:242` — `DANGEROUS_SIGNATURES` DENY 리스트 (신규)
- `teamplus-backend/src/files/files.service.ts:854` — `assertNotDangerousSignature` (신규)
- `teamplus-backend/src/files/files.service.ts:880` — `assertMagicBytes`

---------------------------------------------------------------
        [Backend] Written 2026.06.18. 13:57:12
---

## BE-041: contact_inquiries 테이블 미적용으로 상담신청 API 500 (프로덕션 마이그레이션 누락)

> ✅ **해결 (2026-06-18)** — 운영 도메인(`teamplusadmin.icetimes.co.kr`) 백엔드 DB = `211.236.174.115:55432` (db `IceHockey`, schema `icehockey`). 해당 DB에 `manual-migrations/20260618_add_contact_inquiries.sql` 을 직접 적용(`SET search_path TO icehockey` + 멱등 SQL) → `contact_inquiries` 테이블 + `ContactInquiryStatus` enum + 인덱스 3개 생성. 서비스 `findAll`/`getStats` 쿼리 직접 실행 검증(0건 정상). 라이브 엔드포인트 500 → 401(인증요구)로 회복. 백엔드 재시작 불필요. (DEV 도 동일 DB라 함께 해소.)

### Error Message

```
GET https://teamplusadmin.icetimes.co.kr/api/v1/contact-inquiries?page=1&pageSize=20 500 (Internal Server Error)
GET https://teamplusadmin.icetimes.co.kr/api/v1/contact-inquiries/stats 500 (Internal Server Error)
[Admin API] ✗ GET /contact-inquiries 500  데이터베이스 오류가 발생했습니다.
[ContactInquiry Service] 목록 조회 실패 / 통계 조회 실패: AxiosError 500
```

### Cause Analysis

- `ContactInquiry` 모델(`contact_inquiries` 테이블 + `ContactInquiryStatus` enum)이 **프로덕션 DB에 존재하지 않음**.
- 생성 SQL `prisma/manual-migrations/20260618_add_contact_inquiries.sql` 은 작성돼 있으나, `manual-migrations/` 는 `prisma migrate deploy` 자동 적용 대상이 아닌 **수동 적용 폴더**.
- 루트 `Jenkinsfile` 배포는 `prisma generate` + `db:seed` 만 실행하고 **마이그레이션을 적용하지 않음** → 스키마 변경은 ops 수동 적용. 이번 SQL이 프로덕션에 미적용되어 테이블 부재.
- 서비스 `findAll`/`getStats` 가 부재 테이블을 쿼리 → Prisma 에러 → `AllExceptionsFilter` 가 500 "데이터베이스 오류가 발생했습니다." 로 매핑.
- 부수 영향: 랜딩 `/api/contact` 공개 제출(create)도 동일 테이블 → 상담 신청 저장 자체가 실패.

### Incorrect State (코드 아님 — DB 상태)

프로덕션 DB에 `contact_inquiries` 테이블 / `ContactInquiryStatus` enum 부재. 서비스·모델·SQL 코드는 모두 정상.

### Correct Fix — 프로덕션 DB에 마이그레이션 적용 (멱등 · 재실행 안전)

```bash
# 프로덕션 백엔드 디렉토리에서 prod DATABASE_URL 환경으로 실행
npx prisma db execute \
  --file prisma/manual-migrations/20260618_add_contact_inquiries.sql \
  --schema prisma/schema.prisma

# 또는 psql 직접
psql "$PROD_DATABASE_URL" -f prisma/manual-migrations/20260618_add_contact_inquiries.sql
```

적용 후 백엔드 재시작 불필요(Prisma Client 가 이미 모델 인지). 동일 누락 가능성 있는 DEV DB(`211.236.162.115:55432`)도 점검·적용.

### Prevention Guide

- 신규 모델 추가 시 manual-migrations SQL 작성 + **모든 환경(dev/prod) 수동 적용**을 배포 체크리스트에 포함.
- 배포 후 신규 엔드포인트 스모크 테스트(`GET /contact-inquiries/stats` → 200) 로 누락 조기 감지.
- (개선안) Jenkins 배포에 manual-migrations 적용 단계 또는 `db:migrate:prod` 추가 검토 — 현재 CI 는 마이그레이션 미적용.

### 관련 파일

- `teamplus-backend/prisma/manual-migrations/20260618_add_contact_inquiries.sql` — 적용 대상 SQL(멱등)
- `teamplus-backend/prisma/schema.prisma` — `model ContactInquiry` + `enum ContactInquiryStatus`
- `teamplus-backend/src/contact-inquiries/contact-inquiries.service.ts:78,119` — `findAll`/`getStats` (코드 정상)
- `teamplus-admin/src/services/contact-inquiry.service.ts` — 호출 측 (정상)

---

        [Backend] 작성 2026.07.18. 19:36:21

---

## BE-042: prod 백엔드 빌드 실패 — resolveManageableTeamIds 메서드 동기화 유실 (TS2339)

### Error Message

```
src/payments/settlement/settlement-summary.service.ts:207:35 - error TS2339:
Property 'resolveManageableTeamIds' does not exist on type 'ResourceAccessService'.
```

### Cause Analysis

`settlement/` 디렉토리는 **prod 저장소 고유물**인데, prod의 `resource-access.service.ts`에만 존재하던 `resolveManageableTeamIds` 메서드(커밋 `2e4e4a7 정산 API 추가`에서 도입)가 커밋 `1fa81c5 앱배포대응1`에서 **dev 버전 파일로 통째로 덮어쓰기되며 유실**됨. dev에는 settlement가 없어 dev 쪽 파일에는 이 메서드가 원래 없었고, dev→prod 파일 동기화가 prod 고유 확장을 지워버린 전형적 부분 동기화 드리프트. ([prod-sync-drift-playbook] "settlement 디렉토리는 prod 고유물" 경고 사례)

### Incorrect Code

```typescript
// prod resource-access.service.ts (1fa81c5 이후) — 메서드 부재
export class ResourceAccessService {
  async assertTeamManager(teamId, requester) { ... }
  // resolveManageableTeamIds 삭제됨 ← settlement-summary.service.ts:207이 호출
}
```

### Correct Code

```typescript
/** 요청자가 관리자로서 관리하는 팀 ID 집합 — assertTeamManager와 동일 정책 */
async resolveManageableTeamIds(requester: JwtUserPayload): Promise<string[]> {
  if (!TEAM_DOMAIN_USER_TYPES.includes(requester.userType)) return [];
  const [ownedTeams, managerMemberships] = await Promise.all([
    this.prisma.team.findMany({ where: { coachId: requester.id }, select: { id: true } }),
    this.prisma.teamMember.findMany({
      where: { userId: requester.id, approvalStatus: "approved", leftAt: null,
               roleInTeam: { in: TEAM_MANAGER_ROLES } },
      select: { teamId: true },
    }),
  ]);
  const set = new Set<string>();
  for (const t of ownedTeams) set.add(t.id);
  for (const m of managerMemberships) if (m.teamId) set.add(m.teamId);
  return Array.from(set);
}
```

git 이력 원본(`2e4e4a7`)과 1:1 일치 복원 후 **dev·prod 양쪽에 동일 반영** — dev에도 메서드를 넣어 파일을 동일화해야 다음 dev→prod 동기화에서 재유실되지 않음 (dev에서는 미사용이지만 무해).

### Prevention Guide

- **prod 고유 확장이 있는 파일**(resource-access.service.ts · bridge-security.ts 등)을 dev→prod 동기화할 때는 덮어쓰기 전 `git log -S`로 prod 고유 심볼 유무 확인.
- 근본 대책: prod 고유 메서드를 dev 파일에도 역백포트해 **두 저장소 파일을 동일하게 유지** (이번에 적용).
- prod 반영 전 prod 클론에서 `npm run build` 로컬 실행이 안 되면 최소한 `git grep <메서드명>`으로 호출부/정의부 쌍 확인.

### 관련 파일

- `teamplus-backend/src/common/access/resource-access.service.ts` — 메서드 복원 (dev·prod 동일)
- `teamplus-backend/src/payments/settlement/settlement-summary.service.ts:207` — 호출부 (prod 고유)

---

## BE-043: CORS 미등록 origin preflight가 500으로 응답 — `OPTIONS /api/v1/app/settings` [500] (2026-07-27)

### Error Message

```
07. 26. 오전 02:35:34    ERROR    /api/v1/app/settings    [500] 서버 오류가 발생했습니다.
```

admin 시스템로그(= `user_activity_logs` platform='backend' · action='SERVER_ERROR') 화면에 표시.
PROD DB 실측: 총 10건, **전부 method=OPTIONS** (GET 아님), 2026-07-25 02:25 ~ 07-26 02:35 심야에만 발생.

### Cause Analysis

1. `main.ts` CORS origin 콜백이 프로덕션에서 미등록 origin에 대해 `callback(new Error(...))`를 던짐.
2. Express cors 미들웨어는 이 Error를 에러 미들웨어로 전달 → **preflight(OPTIONS)가 500으로 응답**되고 AllExceptionsFilter가 "[500] 서버 오류가 발생했습니다."로 시스템로그 기록.
3. 심야에 Origin 헤더를 단 외부 클라이언트(봇/모니터링 추정)의 preflight가 유입될 때마다 5xx 소음 발생. 실제 서비스 장애는 아님(정상 도메인은 same-origin 이라 preflight 미발생).
4. 부수: `prodOrigins`가 구 도메인 `*.teamplus.com`만 등록 — 실 운영 도메인(`*.icetimes.co.kr`)은 서버 `CORS_ORIGIN` env에만 의존하고 있었음.

### Incorrect Code

```typescript
// main.ts — 프로덕션 차단 분기
logger.error(`[CORS] Blocked origin ${origin}`);
callback(new Error(`Origin ${origin} not allowed by CORS`)); // → OPTIONS 500
```

### Correct Code

```typescript
logger.error(`[CORS] Blocked origin ${origin}`);
callback(null, false); // CORS 헤더 없는 정상 응답 → 브라우저가 차단, 서버 5xx 없음
```

+ `prodOrigins`에 `"https://*.icetimes.co.kr"` 와일드카드 추가 (기존 `matchesWildcard` 지원).

### Prevention Guide

- CORS origin 콜백에서 차단은 **항상 `callback(null, false)`** — `callback(Error)`는 preflight를 5xx로 만들어 모니터링을 오염시킨다.
- 시스템로그의 SERVER_ERROR는 `metadata->>'method'`를 반드시 확인 — OPTIONS 500은 엔드포인트 코드가 아니라 CORS/미들웨어 계층 문제다.
- 운영 도메인 변경 시 `prodOrigins` 코드 목록도 함께 갱신 (env 단독 의존 금지).

### 검증

```bash
# 배포 후 (혹은 NODE_ENV=production 로컬):
curl -i -X OPTIONS https://teamplusweb.icetimes.co.kr/api/v1/app/settings \
  -H "Origin: https://evil.example.com" -H "Access-Control-Request-Method: GET"
# → 5xx 아님(2xx, ACAO 헤더 없음) 확인. 익일 시스템로그에 OPTIONS 500 재발 없음 확인.
```

### 관련 파일

- `teamplus-backend/src/main.ts` — CORS origin 콜백 (차단 분기 + prodOrigins)
- `teamplus-backend/src/common/filters/http-exception.filter.ts` — 5xx 시스템로그 기록 경로 (수정 없음)

---

## BE-044: pg_advisory_xact_lock `$queryRaw` P2010 — void 컬럼 역직렬화 실패 [500] (2026-07-29)

### Error Message

```
PrismaClientKnownRequestError: Invalid `prisma.$queryRaw()` invocation:
Raw query failed. Code: `N/A`. Message: `Failed to deserialize column of type 'void'.
If you're using $queryRaw and this column is explicitly marked as `Unsupported` in your
Prisma schema, try casting this column to any supported Prisma type such as `String`.`
errorCode: "DB_ERROR_P2010"
```

`PUT /api/v1/classes/{id}/products/bulk` 등 advisory lock 을 선두에서 획득하는 모든 트랜잭션(상품 bulk/수정 · 출석 기록 · 정산 확정 · 좌석 선점)이 500.

### Cause Analysis

1. `class-locks.util.ts` 의 `acquireAdvisoryLock` 이 `` tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))` `` 호출.
2. `pg_advisory_xact_lock` 은 **void 반환** — Prisma 는 결과 컬럼을 역직렬화하려다 void 타입에서 P2010 으로 실패한다. lock 자체는 걸리지만 호출이 throw 되어 트랜잭션 전체가 롤백.
3. **unit spec 은 `$queryRaw` 를 mock 하므로 통과** — 실 PostgreSQL 에서만 발현. 하네스·Codex 검토를 모두 통과한 뒤 화면 실사용에서 발견됐다.

### Incorrect Code

```typescript
await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
```

### Correct Code

```typescript
// void → text 캐스팅으로 역직렬화 가능한 컬럼으로 변환 (반환값은 "" — 사용 안 함)
await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`;
```

### Prevention Guide

- `$queryRaw` 로 void 반환 함수(`pg_advisory_*`, `pg_sleep` 등)를 호출할 때는 **항상 `::text` 캐스팅**.
- raw SQL 신규 도입 시 unit spec(mock)만으로 검증 종료 금지 — **실 DB 1회 실행 확인 필수** (mock 은 쿼리 문자열의 유효성을 전혀 검증하지 못한다).

### 검증

실 DEV DB에서 `$transaction` 내 sales/postpaid 두 lock 획득 스크립트 실행 → `[{"pg_advisory_xact_lock":""}]` 정상 반환 확인 (2026-07-29).

### 관련 파일

- `teamplus-backend/src/classes/utils/class-locks.util.ts` — `acquireAdvisoryLock` (dev·prod 양쪽 수정 완료)

---

**Last Updated**: 2026-07-29 (BE-044 advisory lock void 역직렬화 P2010 — `::text` 캐스팅, mock spec 사각 교훈) · 2026-07-27 (BE-043 CORS 미등록 origin preflight 500 — `callback(new Error)` → `callback(null,false)` 전환 + prodOrigins에 `*.icetimes.co.kr` 추가. OPTIONS 500 10건의 원인 제거) · 2026-07-18 (BE-042 resolveManageableTeamIds 동기화 유실 — settlement는 prod 고유물인데 dev 파일 덮어쓰기로 prod 고유 메서드 삭제 → TS2339 빌드 실패. git 이력 원본 복원 + dev 역백포트로 파일 동일화) · 2026-06-18 (BE-041 contact_inquiries 프로덕션 마이그레이션 누락 — 상담신청 list/stats 500 "데이터베이스 오류". manual-migrations SQL 미적용이 원인, 코드 정상. prod DB 에 `prisma db execute` 적용 필요) · 2026-05-23 (BE-040 FileContentBasedDenyList 신규 — Mach-O/PE/ELF/DEX 등 실행 가능 시그니처 magic bytes DENY 리스트 신설, 이름·MIME 위장 봉인. BE-039 토큰 정교화와 함께 4중 방어선 완성)

- [Error 인덱스](../)
- [Web 에러](../web/web-errors.md)
- [App 에러](../app/app-errors.md)
- [Admin 에러](../admin/admin-errors.md)


---

**SOT v9.4 동기화 확인 (2026-05-23)** — 본 문서는 현재 실측 환경에서 유효: Backend **72 module·152 model·81 controller·773 routes** / Web **245 pages·71 hooks·352 컴포넌트·MESSAGES 200** / Admin **86 pages·38 컴포넌트** / App **211 dart·29 features·16 Bridge** / **Home 13 pages 신규 인지**. 디자인 위반 0 유지(헤더 blur 예외 1건).
