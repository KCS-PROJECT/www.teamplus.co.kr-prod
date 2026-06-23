// [2026-06-23 PROD HOTFIX] Node 18 prod 부팅 시 'crypto is not defined' 회피.
//
// Node 18.19.1 에서 globalThis.crypto 가 빌드된 NestJS dist/main.js 의 일부
// 실행 경로(특히 onApplicationBootstrap / FcmGateway 등)에서 미정의로 잡힌다.
// 일부 의존성(예: node-forge, google-auth-library)이 WebCrypto 글로벌을
// 가정하므로, 메인 모듈 로드 직전에 require('crypto').webcrypto 로 보강한다.
//
// Node 19+ 에서는 typeof globalThis.crypto !== 'undefined' 가드로 no-op.
//
// 사용: node -r ./scripts/crypto-polyfill.js dist/main
//        (package.json scripts.start:prod 참고)

if (typeof globalThis.crypto === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  globalThis.crypto = require('crypto').webcrypto;
}
