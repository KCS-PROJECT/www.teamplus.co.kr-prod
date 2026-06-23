/**
 * Kakao JavaScript SDK 통합
 *
 * `<Script>` 태그로 SDK 가 로드된 후 (`layout.tsx` 참조), `initKakao()` 가
 * `Kakao.init(NEXT_PUBLIC_KAKAO_JS_KEY)` 를 1회 호출해 SDK 를 초기화한다.
 *
 * - 키 부재 → no-op + 1회 console.warn (CI/dev 알림용)
 * - SDK 미로드 → false 반환, 호출자가 fallback UX 처리
 * - SSR 안전: 모든 접근에 `typeof window` 가드 포함
 */
import { env } from '@/lib/env';
import { devLog, devWarn } from '@/lib/logger';

const KAKAO_TEMPLATE_CLASS = 133109;

interface KakaoShareCustom {
  templateId: number;
  templateArgs?: Record<string, string>;
}

interface KakaoLink {
  webUrl: string;
  mobileWebUrl: string;
  androidExecutionParams?: string;
  iosExecutionParams?: string;
}

interface KakaoShareDefault {
  objectType: 'feed';
  content: {
    title: string;
    description?: string;
    link: KakaoLink;
  };
  buttons?: Array<{
    title: string;
    link: KakaoLink;
  }>;
}

interface KakaoShareModule {
  sendCustom: (params: KakaoShareCustom) => void;
  sendDefault: (params: KakaoShareDefault) => void;
}

// 카카오 JS SDK 전역 타입 (공유 전용 — 소셜 로그인 제거 후 social-auth.ts에서 이관).
declare global {
  interface Window {
    Kakao?: {
      init(key: string): void;
      isInitialized(): boolean;
      Share?: KakaoShareModule;
    };
  }
}

function getKakaoShare(): KakaoShareModule | undefined {
  if (typeof window === 'undefined') return undefined;
  const kakao = (window as unknown as { Kakao?: { Share?: KakaoShareModule } }).Kakao;
  return kakao?.Share;
}

let warnedNoKey = false;

export function isKakaoKeyConfigured(): boolean {
  return env.NEXT_PUBLIC_KAKAO_JS_KEY.length > 0;
}

export function isKakaoSdkReady(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.Kakao?.isInitialized?.());
}

/**
 * 카카오 SDK 초기화. SDK 가 이미 초기화 되어 있으면 no-op.
 * 키가 없으면 한 번만 경고 후 false 반환.
 */
export function initKakao(): boolean {
  if (typeof window === 'undefined') return false;

  const key = env.NEXT_PUBLIC_KAKAO_JS_KEY;
  if (!key) {
    if (!warnedNoKey && env.isDevelopment) {
      devWarn(
        '[Kakao] NEXT_PUBLIC_KAKAO_JS_KEY 가 설정되지 않았습니다. ' +
          '카카오톡 공유 버튼이 비활성화됩니다.',
      );
      warnedNoKey = true;
    }
    return false;
  }

  const kakao = window.Kakao;
  if (!kakao) return false;

  try {
    if (!kakao.isInitialized()) {
      kakao.init(key);
    }
    return kakao.isInitialized();
  } catch (e) {
    if (env.isDevelopment) {
      devWarn('[Kakao] init 실패', e);
    }
    return false;
  }
}

function ensureSdkReady(): KakaoShareModule | null {
  if (typeof window === 'undefined') return null;
  if (!isKakaoKeyConfigured()) return null;
  if (!isKakaoSdkReady() && !initKakao()) return null;
  return getKakaoShare() ?? null;
}

/**
 * 수업 전용 커스텀 템플릿(ID: 133109)으로 카카오톡 공유.
 * 아이템 리스트: 일정 / 시간 / 장소 / 코치 / 수강료
 */
export function shareToKakaoClass(payload: {
  title: string;
  description?: string;
  path: string;
  imageUrl?: string;
  schedule?: string;
  time?: string;
  venue?: string;
  coach?: string;
  price?: string;
}): boolean {
  const share = ensureSdkReady();
  if (!share?.sendCustom) return false;

  try {
    const templateArgs: Record<string, string> = {
      title: payload.title,
      path: payload.path,
    };
    if (payload.imageUrl?.trim()) templateArgs.image = payload.imageUrl.trim();
    if (payload.description?.trim()) templateArgs.description = payload.description.trim();
    if (payload.schedule?.trim()) templateArgs.schedule = payload.schedule.trim();
    if (payload.time?.trim()) templateArgs.time = payload.time.trim();
    if (payload.venue?.trim()) templateArgs.venue = payload.venue.trim();
    if (payload.coach?.trim()) templateArgs.coach = payload.coach.trim();
    if (payload.price?.trim()) templateArgs.price = payload.price.trim();

    devLog('[Kakao] sendCustom (class) templateId:', KAKAO_TEMPLATE_CLASS, 'args:', JSON.stringify(templateArgs));
    share.sendCustom({ templateId: KAKAO_TEMPLATE_CLASS, templateArgs });
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error('[Kakao] Share.sendCustom 실패: ' + msg);
    return false;
  }
}

/**
 * 기본 Feed 템플릿으로 카카오톡 공유.
 * 별도 커스텀 템플릿 없이 title + description + 버튼으로 구성.
 */
export function shareToKakaoDefault(payload: {
  title: string;
  description?: string;
  url: string;
}): boolean {
  const share = ensureSdkReady();
  if (!share?.sendDefault) return false;

  try {
    let appPath = '/';
    try {
      const parsed = new URL(payload.url);
      appPath = parsed.pathname + parsed.search + parsed.hash;
    } catch {
      appPath = '/';
    }

    const execParams = `path=${appPath}`;
    const link: KakaoLink = {
      webUrl: payload.url,
      mobileWebUrl: payload.url,
      androidExecutionParams: execParams,
      iosExecutionParams: execParams,
    };

    const content: KakaoShareDefault['content'] = {
      title: payload.title,
      link,
    };
    if (payload.description?.trim()) {
      content.description = payload.description.trim();
    }

    devLog('[Kakao] sendDefault payload:', JSON.stringify({ content }));
    share.sendDefault({
      objectType: 'feed',
      content,
      buttons: [{
        title: '자세히 보기',
        link,
      }],
    });
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error('[Kakao] Share.sendDefault 실패: ' + msg);
    return false;
  }
}
