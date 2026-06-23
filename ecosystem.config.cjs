/**
 * pm2 ecosystem — 4개 앱 단일 진입점.
 *
 * [2026-06-23] 재발방지 — 기존에는 Jenkinsfile/수동에서 `pm2 start npm --name <n>` 를
 *   여러 번 호출하면 같은 이름이라도 새 인스턴스가 추가되어(pm2 의 비-멱등 동작) 좀비
 *   프로세스가 누적되었다. 좀비는 같은 포트로 EADDRINUSE → 무한 재시작 루프(↺ 888회
 *   관측). 본 파일 + `pm2 startOrReload ecosystem.config.cjs` 로 전환하면 동일 이름은
 *   1회만 매핑되어 멱등 운영이 보장된다.
 *
 * 운영 명령:
 *   pm2 startOrReload  /kcs-project/www.teamplus.co.kr-prod/ecosystem.config.cjs --update-env
 *   pm2 save
 *
 * Jenkinsfile Deploy 단계가 위 명령을 호출한다.
 */

const APP_DIR = '/kcs-project/www.teamplus.co.kr-prod';

const COMMON = {
  exec_mode: 'fork',
  autorestart: true,
  // 무한 재시작 루프 차단 — 좀비/잘못된 빌드 검출 시 즉시 정지 (Jenkins/사람이 인지하도록).
  max_restarts: 10,
  restart_delay: 3000,
  // 메모리 누수 안전망 (각 Next/Nest 앱 base 200MB 내외 → 700MB 면 명백한 leak).
  max_memory_restart: '700M',
  env: { NODE_ENV: 'production' },
};

module.exports = {
  apps: [
    {
      name: 'teamplus-backend',
      cwd: `${APP_DIR}/teamplus-backend`,
      // node + crypto-polyfill preload + dist/main (= start:prod)
      script: 'dist/main.js',
      node_args: '-r ./scripts/crypto-polyfill.js',
      ...COMMON,
    },
    {
      name: 'teamplus-web',
      cwd: `${APP_DIR}/teamplus-web`,
      script: 'npm',
      args: 'run start',
      ...COMMON,
    },
    {
      name: 'teamplus-admin',
      cwd: `${APP_DIR}/teamplus-admin`,
      script: 'npm',
      args: 'run start',
      ...COMMON,
    },
    {
      name: 'teamplus-home',
      cwd: `${APP_DIR}/teamplus-home`,
      script: 'npm',
      args: 'run start',
      ...COMMON,
    },
  ],
};
