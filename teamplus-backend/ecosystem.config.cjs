/**
 * TEAMPLUS Backend PM2 Ecosystem (v8.6, 2026-05-20)
 *
 * 사용자 요구사항 반영:
 * - 서버가 시작되면 자동으로 로그 기능 실행 (NestJS OnModuleInit이 처리)
 * - 서버가 내렸다 올라가도 자동 재시작 (autorestart: true)
 * - OS 재부팅 시 자동 시작 → 별도 `pm2 startup` + `pm2 save` 필요 (사용자 sudo 권한 필요)
 *
 * 사용:
 *   npm run build                                    # 1) 먼저 빌드
 *   pm2 start ecosystem.config.cjs                   # 2) PM2로 실행
 *   pm2 save                                         # 3) 현재 프로세스 저장
 *   pm2 startup                                      # 4) OS 부팅 자동 시작 등록 (sudo)
 *   pm2 logs teamplus-api                            # 실시간 stdout 로그
 *   pm2 restart teamplus-api                         # 재시작
 *   pm2 stop teamplus-api / pm2 delete teamplus-api  # 중지 / 삭제
 *   pm2 monit                                        # CPU/메모리 모니터
 *
 * 자동 재시작 트리거:
 *   - 프로세스 크래시 (autorestart: true)
 *   - 메모리 1GB 초과 (max_memory_restart)
 *   - 파일 변경 감지는 OFF (운영 환경 의도치 않은 재시작 방지)
 */

module.exports = {
  apps: [
    {
      // === 기본 ===
      name: "teamplus-api",
      script: "dist/main.js",
      cwd: __dirname,
      instances: 1, // 단일 인스턴스 (cluster 모드는 추후 검토)
      exec_mode: "fork", // fork (단일) — cluster 모드는 WebSocket sticky 필요

      // === 자동 재시작 (사용자 요구) ===
      autorestart: true, // 크래시 시 자동 재시작
      watch: false, // 파일 감지 OFF — 운영에서는 의도치 않은 재시작 방지
      max_memory_restart: "1G", // 메모리 1GB 초과 시 재시작
      max_restarts: 10, // 짧은 시간 내 최대 재시작 횟수
      min_uptime: "10s", // 최소 가동 시간 (이보다 짧으면 unstable 판정)
      restart_delay: 2000, // 재시작 간격 (ms)
      exp_backoff_restart_delay: 100, // 지수 backoff (혼잡 시)

      // === 환경 변수 ===
      env: {
        NODE_ENV: "development",
        BACKEND_PORT: "5003",
      },
      env_production: {
        NODE_ENV: "production",
        BACKEND_PORT: "5003",
      },

      // === PM2 자체 로그 (NestJS 로그와는 별개 — 프로세스 stdout/stderr) ===
      // NestJS의 log/YYYY/MM/DD/*.log 와 충돌하지 않도록 별도 경로
      out_file: "./log/pm2-out.log",
      error_file: "./log/pm2-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss.SSS Z",
      merge_logs: true,
      time: true,

      // === graceful shutdown ===
      kill_timeout: 5000, // SIGTERM 후 5초 대기 후 SIGKILL
      wait_ready: false, // process.send('ready') 대기 비활성 (NestJS는 send 안함)
      listen_timeout: 10000,
      shutdown_with_message: false,

      // === 헬스체크 (PM2 Plus 사용 시) ===
      // pmx 옵션은 PM2 Plus 라이선스 필요 — OSS만 사용 시 무시됨

      // === 노드 옵션 ===
      node_args: ["--enable-source-maps"],
    },
  ],
};
