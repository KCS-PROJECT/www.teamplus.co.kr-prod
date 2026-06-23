import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { NestExpressApplication } from "@nestjs/platform-express";
import { join } from "path";
import * as fs from "fs";
import * as express from "express";
import helmet from "helmet";
import compression from "compression";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters";
import { initSentry, SentryExceptionFilter } from "./common/sentry.config";
import { LoggerService } from "./logger/logger.service";

// Bootstrap 전용 Logger — 구조화 로깅(Pino)과 통합되기 전 시작 단계 로그
const logger = new Logger("Bootstrap");

async function bootstrap() {
  // Sentry 초기화 (앱 부트스트랩 전, SENTRY_DSN 없으면 자동 건너뜀)
  initSentry();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // === 응답 압축 (gzip) ===
  // - 1KB 이상 응답만 압축 (작은 응답은 오버헤드가 더 큼)
  // - level 6: 압축률·CPU 균형 (기본값)
  // - ETag 는 express 기본값(Strong)을 Weak 로 바꿔 compression 후에도 유효화
  //   (압축된 응답의 hash 가 달라 클라이언트 304 재활용 가능성 유지)
  // 네트워크 전송량 60-80% 감소 → 1초 SLA 달성의 핵심.
  //
  // [2026-05-20 Phase 2.3] multipart/form-data 요청은 압축 제외:
  //   - 이미 바이너리(이미지/영상) 콘텐츠라 gzip 효율 거의 0
  //   - busboy/multer 파싱과 충돌 가능성 사전 차단
  //   - 업로드 응답(JSON) 은 정상 압축됨 (request 만 skip)
  app.use(
    compression({
      threshold: 1024,
      level: 6,
      filter: (req, res) => {
        if (req.headers["x-no-compression"]) return false;
        const contentType = (req.headers["content-type"] ?? "")
          .toString()
          .toLowerCase();
        if (contentType.startsWith("multipart/")) return false;
        return compression.filter(req, res);
      },
    }),
  );

  // === Body Parser 한도 ===
  // - 기본 100KB → 10MB. base64 인코딩 이미지/문서 첨부 시 413 회피.
  // - JSON 본문은 application/json 만, urlencoded 은 form data.
  // - KG이니시스 webhook 등 서명 검증이 필요한 라우트는 별도 verify 콜백으로
  //   `req.rawBody` 를 Buffer 로 보존 (HMAC raw 본문 기반 검증을 위해 필수).
  app.use(
    express.json({
      limit: "10mb",
      verify: (req, _res, buf) => {
        const url = (req as express.Request).originalUrl ?? "";
        if (
          url.includes("/payments/webhook") ||
          url.includes("/payments/toss/webhook")
        ) {
          (req as express.Request & { rawBody?: Buffer }).rawBody =
            Buffer.from(buf);
        }
      },
    }),
  );
  app.use(
    express.urlencoded({
      limit: "10mb",
      extended: true,
      verify: (req, _res, buf) => {
        const url = (req as express.Request).originalUrl ?? "";
        if (url.includes("/payments/webhook")) {
          (req as express.Request & { rawBody?: Buffer }).rawBody =
            Buffer.from(buf);
        }
      },
    }),
  );

  // === ETag (Weak) + HTTP keep-alive ===
  // - Weak ETag: compression 통과 후에도 동일 리소스를 식별, 304 응답 가능
  // - keep-alive: 기본 활성화. 타임아웃 명시로 모바일 재연결 비용 감소.
  app.set("etag", "weak");

  // === Trust proxy (X-Forwarded-For / X-Forwarded-Proto 신뢰) ===
  // ALB · Cloudflare · Nginx 등 reverse proxy 뒤에 배치될 때 req.ip 가
  // 실제 호출자 IP 를 반환하도록 1단계 프록시까지 신뢰. ApiLifecycleInterceptor
  // 의 extractClientIp() 는 헤더를 직접 파싱하지만, req.ip fallback 정확도 확보용.
  app.set("trust proxy", 1);

  const httpServer = app.getHttpServer();
  httpServer.keepAliveTimeout = 65_000; // 65s > ALB/프록시 60s 기본
  httpServer.headersTimeout = 66_000; // keepAliveTimeout + 1s (Node.js 요구사항)

  // Security Headers (Helmet.js) - Next.js 호환 설정
  // [2026-05-13 Phase E-1] HSTS + Referrer-Policy 추가.
  //   - HSTS: 프로덕션에서만 활성 (개발 환경은 localhost HTTP 사용으로 HSTS 부적합)
  //   - Referrer-Policy: 모든 환경에서 strict-origin-when-cross-origin 명시
  //   - X-Content-Type-Options: nosniff (Helmet 기본값 유지)
  const isProd = process.env.NODE_ENV === "production";
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:", "blob:"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Next.js 필요
          scriptSrcElem: ["'self'", "'unsafe-inline'"], // Next.js inline scripts
          connectSrc: ["'self'", "https:", "wss:"], // API 및 WebSocket 연결
          fontSrc: ["'self'", "data:", "https:"],
          frameSrc: ["'self'", "https:"], // 본인인증 iframe 허용
        },
      },
      crossOriginEmbedderPolicy: false, // API 서버이므로 비활성화
      crossOriginResourcePolicy: { policy: "cross-origin" }, // Admin(5002)→Backend(5003) 이미지 로드 허용
      hsts: isProd
        ? {
            maxAge: 31_536_000, // 1년
            includeSubDomains: true,
            preload: true,
          }
        : false,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    }),
  );

  // 정적 파일 서빙 (uploads 디렉토리) — UPLOAD_ROOT env 또는 cwd/uploads
  // 부팅 시 디렉토리 자동 생성 + 권한 검증 로그 (upload-paths.ts §SoT).
  const { getUploadRoot, ensureUploadDirectories } = await import(
    "./common/upload-paths"
  );
  ensureUploadDirectories();
  app.useStaticAssets(getUploadRoot(), {
    prefix: "/uploads/",
    // 저장 파일명은 hash 포함이라 사실상 immutable.
    // 브라우저는 1시간 캐시하되 must-revalidate 로 변경 시 즉시 새 URL 적용.
    // 프로필 사진처럼 자주 바뀌는 자원도 storedName 자체가 매번 다르므로 충돌 없음.
    maxAge: "1h",
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
      // 아바타·이미지·문서: 변경 시 새 URL 발급되므로 캐시 OK
      // 단 must-revalidate 강제 — 캐시 hit 도 ETag 검증 필수
      res.setHeader("Cache-Control", "public, max-age=3600, must-revalidate");
      // [2026-06-10 SECURITY] 업로드 파일 type sniff 차단 (저장형 XSS 방어 심화).
      //   업로드 단계 확장자 화이트리스트와 결합. 정적 서빙에 명시적 nosniff 부여.
      res.setHeader("X-Content-Type-Options", "nosniff");
      // HTML/스크립트성 파일은 인라인 실행 차단 — 캐시 금지 + 다운로드 강제.
      if (path.endsWith(".html") || path.endsWith(".htm")) {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Disposition", "attachment");
      }
    },
  });

  // Next.js 빌드 결과물 서빙 (WebView 콘텐츠)
  const candidateWebBuildPaths = [
    process.env.WEB_BUILD_PATH
      ? join(__dirname, "..", process.env.WEB_BUILD_PATH)
      : null,
    join(__dirname, "../..", "teamplus-web/out"),
    join(__dirname, "../..", "teamplus-app/build/web"),
    join(__dirname, "../..", "teamplus_app/web/out"),
  ].filter((path): path is string => Boolean(path));

  const webBuildPath = candidateWebBuildPaths.find((path) =>
    fs.existsSync(path),
  );

  if (webBuildPath) {
    // Next.js _next/static 파일 (캐싱 최적화 - 해시 포함 파일)
    const staticPath = join(webBuildPath, "_next/static");
    if (fs.existsSync(staticPath)) {
      app.useStaticAssets(staticPath, {
        prefix: "/_next/static/",
        maxAge: 31536000000, // 1년 캐시 (밀리초)
      });
    }

    // Next.js 정적 파일 (루트) - index.html을 "/"에서 자동 서빙
    app.useStaticAssets(webBuildPath, {
      index: "index.html", // "/" 접근 시 index.html 서빙
    });

    logger.log(`Next.js static files served from: ${webBuildPath}`);
  }

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global exception filters
  // Sentry 필터가 먼저 처리 → 5xx 에러를 Sentry에 전송
  // AllExceptionsFilter가 최종 응답 포맷팅 담당
  // v8.6 (2026-05-20): LoggerService 주입 — 404 등 라우터 미매칭 에러도 errors/{category}.log 분류 기록
  const appLogger = app.get(LoggerService);
  if (process.env.SENTRY_DSN) {
    app.useGlobalFilters(
      new SentryExceptionFilter(),
      new AllExceptionsFilter(appLogger),
    );
  } else {
    app.useGlobalFilters(new AllExceptionsFilter(appLogger));
  }

  // CORS Configuration - 환경별 보안 설정
  const isProduction = process.env.NODE_ENV === "production";

  // 개발 환경 허용 origins
  const devOrigins = [
    "http://localhost:5010", // Next.js dev server (home)
    "http://localhost:5001", // Next.js dev server (web)
    "http://localhost:5002", // Admin dev server
    "http://localhost:5003", // NestJS server
    "http://10.0.2.2:5001", // Android Emulator → Next.js dev
    "http://10.0.2.2:5003", // Android Emulator → NestJS
    "http://127.0.0.1:5010", // Alternative localhost (home)
    "http://127.0.0.1:5001", // Alternative localhost (web)
    "http://127.0.0.1:5003", // Alternative localhost (API)
    "http://192.168.0.100:5001", // 홈/LAN (Web)
    "http://192.168.0.100:5003", // 홈/LAN (API)
    "http://211.236.174.110:5001", // 홈/LAN WSL2 호스트 (Web) — APP_ENV=home
    "http://211.236.174.110:5003", // 홈/LAN WSL2 호스트 (API) — APP_ENV=home
    "http://211.236.174.115:5010", // 배포 서버 (Home)
    "http://211.236.174.115:5001", // 배포 서버 (Web)
    "http://211.236.174.115:5002", // 배포 서버 (Admin)
    "http://211.236.174.115:5003", // 배포 서버 (API)
    "http://211.236.174.86:5010", // 사내 (Home)
    "http://211.236.174.86:5001", // 사내 (Web)
    "http://211.236.174.86:5002", // 사내 (Admin)
    "http://211.236.174.90:5010", // 사내 (Home)
    "http://211.236.174.90:5001", // 사내 (Web)
    "http://211.236.174.90:5002", // 사내 (Admin)
    "http://211.236.174.91:5010", // 사내 (Home)
    "http://211.236.174.91:5001", // 사내 (Web)
    "http://211.236.174.91:5002", // 사내 (Admin)
  ];

  // 프로덕션 환경 허용 origins (HTTPS 강제)
  const prodOrigins = [
    "https://teamplus.com",
    "https://www.teamplus.com",
    "https://app.teamplus.com",
    "https://admin.teamplus.com",
    "https://api.teamplus.com",
    "https://staging.teamplus.com",
    "https://api.staging.teamplus.com",
  ];

  // 환경 변수로 추가 origins 설정 가능
  const envOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
    : [];

  // 환경에 따라 기본 origins 선택
  const allowedOrigins = isProduction
    ? [...prodOrigins, ...envOrigins]
    : [...devOrigins, ...prodOrigins, ...envOrigins];

  app.enableCors({
    origin: (origin, callback) => {
      // WebView, 모바일 앱, Postman 등 origin 없는 요청 허용
      // 주의: 프로덕션에서는 특정 조건에서만 허용
      if (!origin) {
        // 프로덕션에서는 로깅 (보안 모니터링용)
        if (isProduction && process.env.LOG_CORS_NO_ORIGIN === "true") {
          logger.log(
            `[CORS] Request without origin - allowed (WebView/Mobile)`,
          );
        }
        return callback(null, true);
      }

      // 화이트리스트에 있거나 와일드카드(개발용) 허용
      // [2026-06-23] *.<domain> 패턴 매칭 지원 (예: https://*.icetimes.co.kr → 모든 서브도메인 허용)
      const matchesWildcard = (allowed: string, origin: string): boolean => {
        // "https://*.icetimes.co.kr" → /^https:\/\/[^./]+\.icetimes\.co\.kr$/
        const m = allowed.match(/^(https?:\/\/)\*\.(.+)$/);
        if (!m) return false;
        const re = new RegExp(`^${m[1]}[^./]+\\.${m[2].replace(/\./g, "\\.")}$`);
        return re.test(origin);
      };
      const isAllowed =
        allowedOrigins.includes(origin) ||
        allowedOrigins.some((a) => matchesWildcard(a, origin)) ||
        (!isProduction && allowedOrigins.includes("*"));

      if (isAllowed) {
        callback(null, true);
      } else {
        // 개발 환경: 경고 로그 후 허용
        if (!isProduction) {
          logger.warn(`[CORS] Unknown origin ${origin} - allowing in dev mode`);
          callback(null, true);
        } else {
          // 프로덕션: 차단 및 로깅
          logger.error(`[CORS] Blocked origin ${origin}`);
          callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "X-Request-Id", // 요청 추적용
      "X-Request-ID", // 대소문자 혼용 대응
      "X-Correlation-Id", // 분산 추적용
      "X-Client-Platform", // web/admin/ios/android/flutter
      "X-Client-Version", // 클라이언트 버전
      "X-Device-Id", // 기기 식별자 (모바일)
      "Accept-Language", // 다국어 지원
      // [2026-05-14 fix] 클라이언트가 POST/PUT/PATCH 마다 자동 부착하는 헤더 — 누락 시
      //   CORS preflight 차단 → 로그인·결제 등 모든 mutation 실패. 2026-05-13 Phase B-2
      //   에서 web/admin/app 클라이언트가 일괄 부착하기 시작했으나 CORS 동기화 누락.
      "X-Idempotency-Key", // 결제·자녀 등록·출석 멱등성 키 (POST/PUT/PATCH)
      "X-FCM-Token", // Flutter app push 구독 토큰 추적
      // [2026-05-23 v8.7] 호출 발생 화면/컴포넌트 식별 — 누락 시 CORS preflight 차단 →
      //   web/app 클라이언트의 모든 요청이 "Network Error" 로 떨어짐. 회귀 차단을 위해
      //   동기화 필수. 값 예: 'teamplus-web/src/components/classes/PackageEditSheet.tsx'
      "X-View-Id",
      // [2026-05-23 v8.8] 세션 식별 헤더 — Public 라우트(JWT Guard 우회) 에서도
      //   "누가 호출했는지" 로그에서 확인 가능하도록 프론트엔드가 sessionStorage 의
      //   profile 캐시를 자동 첨부. **로깅 전용 — 백엔드는 인가에 절대 사용 금지**.
      //   CORS 동기화 누락 시 preflight 차단 → Public 호출 전체 실패.
      "X-Session-User-Id",
      "X-Session-User-Role",
      "X-Session-User-Email",
    ],
    exposedHeaders: [
      "X-Request-Id", // 클라이언트에서 요청 ID 확인 가능
      "X-Request-ID",
      "X-Response-Time", // API lifecycle 후처리에서 설정
      "X-Server-Time", // 서버 응답 시각
      "X-RateLimit-Limit", // Rate limit 정보 노출
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
    ],
    maxAge: isProduction ? 86400 : 3600, // Preflight 캐시: 프로덕션 24시간, 개발 1시간
  });

  // Swagger/OpenAPI documentation
  const config = new DocumentBuilder()
    .setTitle("TEAMPLUS API")
    .setDescription(
      "TEAMPLUS - Ice Hockey Club Management System API Documentation",
    )
    .setVersion("1.0.0")
    .addBearerAuth(
      { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      "access_token",
    )
    .addServer(
      `http://localhost:${process.env.BACKEND_PORT || 5003}`,
      "Development",
    )
    .addServer("https://api.staging.teamplus.com", "Staging")
    .addServer("https://api.teamplus.com", "Production")
    .build();

  // 프로덕션에서는 Swagger UI(/api/docs) 비활성화 — 미인증 외부에 전체 API surface(773 라우트)
  // ·DTO 스키마·내부 호스트 노출 방지(정보 노출/정찰면 차단).
  if (!isProduction) {
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document);
  }

  const port = process.env.BACKEND_PORT || 5003;
  const host = process.env.BACKEND_HOST || "0.0.0.0"; // 모든 네트워크 인터페이스에서 수신
  await app.listen(port, host);

  logger.log(`================================`);
  logger.log(`TEAMPLUS Backend is running!`);
  logger.log(`Local:   http://localhost:${port}`);
  if (!isProduction) {
    // 개발 환경에서만 API Docs 출력 (프로덕션에서 내부 IP 노출 금지)
    logger.log(`API Docs: http://localhost:${port}/api/docs`);
  }
  logger.log(`Health:  http://localhost:${port}/health`);
  logger.log(`Sentry:  ${process.env.SENTRY_DSN ? "Enabled" : "Disabled"}`);
  logger.log(`================================`);
}

bootstrap().catch((err) => {
  logger.error("Failed to start application:", err);
  process.exit(1);
});
