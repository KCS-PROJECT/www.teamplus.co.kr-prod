/**
 * API Lifecycle 공통 타입
 *
 * 요청 컨텍스트는 req 객체에 attach되어 Controller/Service에서도 접근 가능.
 */

export const REQUEST_CONTEXT_KEY = "apiLifecycleContext";

export type ClientPlatform =
  | "web"
  | "admin"
  | "ios"
  | "android"
  | "flutter"
  | "unknown";

export interface ApiLifecycleContext {
  /** 서버 또는 클라이언트가 발급한 trace ID */
  requestId: string;
  /** 요청 클라이언트 플랫폼 */
  platform: ClientPlatform;
  /** 클라이언트 버전 (미전달 시 'unknown') */
  clientVersion: string;
  /** 요청 수신 시각 (Date.now()) */
  startAt: number;
  /** 인증된 사용자 ID — JwtStrategy 이후에만 채워짐 */
  userId?: string;
  /** 인증된 사용자 역할 */
  userRole?: string;
  /** 요청 device ID (클라이언트가 전달한 경우) */
  deviceId?: string;
  /** 호출자 IP — X-Forwarded-For 우선, fallback req.ip/socket.remoteAddress */
  clientIp?: string;
  /**
   * 호출 발생 화면/컴포넌트 식별자 (v8.7 신규).
   * 클라이언트가 보낸 `X-View-Id` 헤더 echo. 프로젝트 루트 기준 파일 경로 형식.
   * 예: 'teamplus-web/src/components/classes/PackageEditSheet.tsx'
   */
  viewId?: string;
}
