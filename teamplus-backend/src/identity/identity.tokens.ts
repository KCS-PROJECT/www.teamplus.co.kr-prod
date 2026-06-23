/**
 * IdentityModule 의 DI 토큰 모음.
 *
 * 순환 import 방지를 위해 module/service 둘 다 이 파일에서 토큰을 import.
 */

/**
 * 모든 본인인증 Gateway 인스턴스를 IdentityService 에 자동 등록하기 위한 DI 토큰.
 * useFactory 가 provider 들을 받아 배열로 만들어 주입한다 — service 의 생성자에서
 * 이 배열을 받아 registerGateway() 를 일괄 호출한다.
 *
 * 새 Gateway 추가 시 identity.module.ts 의 useFactory inject 배열에만 추가하면 됨.
 */
export const IDENTITY_GATEWAYS = "IDENTITY_GATEWAYS";
