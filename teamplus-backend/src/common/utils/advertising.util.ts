/**
 * 광고성 정보 전송 공용 유틸 (정보통신망법 §50 · 시행령 §62조의3) — 단일 SoT.
 *
 * 푸시(FCM)·SMS·알림톡 3개 발송 경로가 공유한다:
 *  ① 광고성 알림 타입 목록 (MARKETING_NOTIFICATION_TYPES)
 *  ② 야간(KST 21:00~08:00) 판정 (isNightTimeKST)
 *  ③ '(광고)' 표기 + 전송자 명칭·연락처 + 무료 수신거부 방법 삽입 (decorateAdvertisingMessage)
 *
 * 경로별로 흩어져 중복 구현되던 ①②를 여기로 모았다 — 한쪽만 고쳐 법적 게이트가
 * 우회되는 사고를 막는다.
 */

/**
 * 광고성(마케팅) 알림 타입 목록 — 야간 발송 제한·수신동의 검사의 판정 기준.
 *
 * 이 목록에 해당하는 notificationType 만 §50 규제 대상이며, 정보성 메시지
 * (출석·결제 완료 등)는 제한 없이 발송된다.
 */
export const MARKETING_NOTIFICATION_TYPES = [
  "marketing",
  "promotion",
  "advertisement",
  "event_promotion",
  "academy_promotion",
  "admin_push_marketing",
] as const;

/** notificationType 이 광고성인지 판정 (대소문자 무시). */
export function isMarketingNotificationType(
  notificationType?: string | null,
): boolean {
  if (!notificationType) return false;
  return (MARKETING_NOTIFICATION_TYPES as readonly string[]).includes(
    notificationType.toLowerCase(),
  );
}

/**
 * 광고성 알림톡 템플릿으로 취급하는 AlimtalkTemplate.category 값.
 * (정보성 카테고리: payment / attendance / class / credit / general)
 */
export const MARKETING_ALIMTALK_CATEGORIES = [
  "marketing",
  "promotion",
  "advertisement",
  "ad",
] as const;

/**
 * 광고성 알림톡 템플릿 코드 접두어 — category 미설정 템플릿의 보조 판정.
 *
 * `EVENT_` 는 넣지 않는다 — 팀 이벤트 리마인더 등 정보성 템플릿이 같은 접두어를
 * 쓸 수 있어, 정보성 알림톡이 야간에 오차단되는 쪽이 더 큰 사고다.
 */
export const MARKETING_ALIMTALK_CODE_PREFIXES = [
  "MARKETING_",
  "PROMO_",
  "PROMOTION_",
  "AD_",
] as const;

/**
 * 현재 시각이 야간 시간대(KST 21:00~08:00)인지 판정.
 * 별도 동의 없는 야간 광고성 전송은 금지된다(§50③).
 */
export function isNightTimeKST(now: Date = new Date()): boolean {
  const kstMinutes =
    (now.getUTCHours() * 60 + now.getUTCMinutes() + 9 * 60) % (24 * 60);
  const kstHour = Math.floor(kstMinutes / 60);
  return kstHour >= 21 || kstHour < 8;
}

/** 제목 앞에 붙는 법정 표기 (§50④). */
export const AD_LABEL = "(광고)";

export interface AdvertiserInfo {
  /** 전송자 명칭 */
  name: string;
  /** 전송자 연락처 (전화) */
  phone: string;
  /** 전송자 연락처 (이메일) */
  email: string;
  /** 무료 수신거부 방법 안내 문구 */
  optOutGuide: string;
}

/**
 * 전송자(사업자) 정보 — 환경변수 우선, 미설정 시 아래 기본값.
 *
 * 기본값은 teamplus-web `src/lib/legal/policy-content.ts` COMPANY_INFO(사업자등록증
 * 원본 기준)의 미러다. 법인 정보 변경 시 환경변수로 덮어쓰거나 양쪽을 함께 갱신한다.
 *
 * 지원 환경변수: ADVERTISER_NAME · ADVERTISER_PHONE · ADVERTISER_EMAIL ·
 * ADVERTISER_OPT_OUT_GUIDE
 */
const ADVERTISER_DEFAULTS: AdvertiserInfo = {
  name: "주식회사 아이스타임즈",
  phone: "02-557-5321",
  email: "icehockey@knewscorp.co.kr",
  optOutGuide: "무료 수신거부: 앱 [설정] > [알림 설정] > 마케팅 정보 수신 해제",
};

export function getAdvertiserInfo(): AdvertiserInfo {
  return {
    name: process.env.ADVERTISER_NAME || ADVERTISER_DEFAULTS.name,
    phone: process.env.ADVERTISER_PHONE || ADVERTISER_DEFAULTS.phone,
    email: process.env.ADVERTISER_EMAIL || ADVERTISER_DEFAULTS.email,
    optOutGuide:
      process.env.ADVERTISER_OPT_OUT_GUIDE || ADVERTISER_DEFAULTS.optOutGuide,
  };
}

/** 텍스트에 '(광고)' 표기가 이미 있는지 (중복 삽입 방지). */
export function hasAdLabel(text: string): boolean {
  return text.includes(AD_LABEL);
}

/** 제목 맨 앞에 '(광고)' 를 붙인다 — 이미 있으면 그대로 반환. */
export function buildAdvertisingTitle(title: string): string {
  const trimmed = (title ?? "").trim();
  if (hasAdLabel(trimmed)) return trimmed;
  return `${AD_LABEL} ${trimmed}`.trim();
}

/**
 * 본문 끝에 전송자 명칭·연락처 + 무료 수신거부 방법을 덧붙인다 (§50④).
 * 이미 전송자 정보가 포함된 본문(수동 작성)은 중복 삽입하지 않는다.
 */
export function buildAdvertisingBody(body: string): string {
  const base = (body ?? "").trimEnd();
  const info = getAdvertiserInfo();
  if (base.includes(info.optOutGuide)) return base;

  return [
    base,
    "",
    `전송자: ${info.name}`,
    `문의: ${info.phone} / ${info.email}`,
    info.optOutGuide,
  ].join("\n");
}

/**
 * 광고성 메시지 제목·본문을 법정 표기 형태로 가공한다.
 * 정보성 메시지에는 절대 적용하지 않는다(오표기도 위반이다).
 */
export function decorateAdvertisingMessage(
  title: string,
  body: string,
): { title: string; body: string } {
  return {
    title: buildAdvertisingTitle(title),
    body: buildAdvertisingBody(body),
  };
}

/**
 * 단일 문자열(SMS 등 제목·본문 구분이 없는 채널)용 가공.
 * 맨 앞 '(광고)' + 맨 끝 전송자 정보·수신거부 방법.
 */
export function decorateAdvertisingText(text: string): string {
  const labeled = hasAdLabel(text) ? text : `${AD_LABEL} ${text ?? ""}`.trim();
  return buildAdvertisingBody(labeled);
}
