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
  // [2026-07-22] min_uptime 10s 신설 — 이하 만에 죽으면 "unstable" 로 카운트되어 max_restarts 트리거.
  //   pm2 기본 min_uptime=1s 는 Nest 부팅(~4s) 이후 발생하는 DI 크래시를 "정상 실행 후 죽음"으로
  //   오판해 unstable 카운터가 리셋 → max_restarts=10 이 절대 안 걸리는 무한 루프 발생 (실측 8,735회).
  //   min_uptime 을 부팅 시간 초과 값(10s)으로 올려 DI/import 오류가 실제로 배포 실패로 인식되게 함.
  min_uptime: 10000,
  max_restarts: 10,
  restart_delay: 3000,
  // 메모리 누수 안전망 (각 Next/Nest 앱 base 200MB 내외 → 700MB 면 명백한 leak).
  max_memory_restart: '700M',
  // TZ 고정: 시간 동작을 머신 OS 설정과 무관하게 KST 로 — 미전환 레거시 시간 코드의 전제 보존
  env: { NODE_ENV: 'production', TZ: 'Asia/Seoul' },
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
