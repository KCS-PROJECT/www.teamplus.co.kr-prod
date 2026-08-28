/**
 * 앱 설정 Redis 캐시 키·TTL.
 *
 * 값만 담는 파일로 분리한 이유: 캐시를 읽기만 하는 소비자(약관 서비스)가 서비스 파일을
 *   import 하지 않고도 키를 공유하기 위함이다. 문자열을 복사해 두면 저장 형태가 바뀌어
 *   키를 v2 로 올릴 때 한쪽만 남아, 에러 없이 캐시만 무력화된다.
 */
export const APP_SETTINGS_CACHE_KEY = "app:settings:v1";

/** 5분 (변경 빈도 낮음, 유지보수 모드도 5분 유예 허용) */
export const APP_SETTINGS_CACHE_TTL = 300;
