/**
 * barcode-detector/pure 타입 선언
 *
 * @yudiel/react-qr-scanner 가 내부적으로 의존하는 barcode-detector 폴리필.
 * 본 패키지는 transitive dependency 로만 존재하며 직접 type 노출이 없어
 * 사용 시점(qr-scan/page.tsx) 컴파일 에러를 회피하기 위한 최소 선언.
 *
 * 정식 타입은 https://github.com/Sec-ant/barcode-detector 참조.
 */
declare module 'barcode-detector/pure' {
  /**
   * zxing-wasm 모듈 경로/리소스 로드 동작을 오버라이드.
   * locateFile: WASM/asset 의 실제 fetch URL 반환.
   */
  export function setZXingModuleOverrides(overrides: {
    locateFile?: (path: string, prefix: string) => string;
  }): void;
}
