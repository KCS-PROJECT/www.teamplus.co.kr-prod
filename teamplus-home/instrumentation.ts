/**
 * Next.js Instrumentation (teamplus-home)
 *
 * Next.js 15.1+ instrumentation hook 으로 서버 부팅 시 1회 실행.
 * 통합 로깅 시스템(`src/lib/server-log/server-logger.ts`)을 명시 초기화하여
 * 카테고리별 로그 셸 디렉토리/파일을 즉시 생성하고 system.log 에 boot 로그 1줄 기록.
 *
 * 동일 패턴: teamplus-web/instrumentation.ts (Sentry 와 병행)
 *
 * @see src/lib/server-log/server-logger.ts initServerLogger()
 */

export async function register(): Promise<void> {
  // Edge runtime 은 fs 미지원 → Node.js runtime 일 때만 동작
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const mod = await import("./src/lib/server-log/server-logger");
    mod.initServerLogger();
    mod.serverLogger.system("info", "[boot] teamplus-home server started", {
      project: "home",
      pid: process.pid,
      nodeEnv: process.env.NODE_ENV ?? "development",
      startedAt: new Date().toISOString(),
    });
  } catch (err) {
    // 부팅 실패해도 앱 자체는 동작해야 함 — stdout 으로 폴백
    // eslint-disable-next-line no-console
    console.error("[instrumentation] server-logger init failed:", err);
  }
}
