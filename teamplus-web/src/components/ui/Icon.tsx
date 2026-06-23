"use client";

import { cn } from "@/lib/utils";
import { devWarn } from "@/lib/logger";

/**
 * Icon Component - TEAMPLUS Design System
 * WCAG 2.1 접근성 준수:
 * - 장식용 아이콘: aria-hidden="true", role="presentation"
 * - 의미있는 아이콘: role="img", aria-label 필수
 *
 * 렌더러: Material Symbols Outlined (ligature 기반 폰트 아이콘)
 *
 * Lucide 네이밍 호환 레이어:
 * 백엔드 AppMenu seed(`teamplus-backend/prisma/seeds/app-menus.ts`)가 Lucide kebab-case
 * 아이콘 이름(users, user-check, calendar, chart-2 등)을 DB에 저장하지만 이 컴포넌트는
 * Material Symbols ligature 로 렌더한다. 매칭 실패 시 span 에 문자열이 그대로 노출되어
 * drawer 메뉴 아이콘이 "USERS", "LENDAR", "PODIUM" 등 raw 텍스트로 깨져 보이는 회귀가
 * 발생한다 (2026-04-18 확인).
 *
 * 해결: 들어온 이름이 Lucide 스타일이면 Material Symbols 대응 ligature 로 치환한다.
 * 추후 seed 마이그레이션으로 DB 아이콘 네임을 MS native 로 통일하면 이 매핑을 제거할 수 있다.
 */
const LUCIDE_TO_MATERIAL: Record<string, string> = {
  // 사용자 / 권한
  users: "groups",
  user: "person",
  "user-check": "how_to_reg",
  "user-plus": "person_add",
  "user-minus": "person_remove",
  "user-x": "person_off",
  "user-cog": "manage_accounts",
  shield: "shield",
  "shield-check": "verified_user",
  lock: "lock",
  unlock: "lock_open",
  key: "key",

  // 일정 / 시간
  calendar: "calendar_today",
  "calendar-days": "calendar_month",
  "calendar-check": "event_available",
  "calendar-x": "event_busy",
  clock: "schedule",
  timer: "timer",
  hourglass: "hourglass_top",

  // 리스트 / 문서
  list: "list",
  "list-checks": "checklist",
  "list-todo": "fact_check",
  "file-text": "description",
  file: "insert_drive_file",
  folder: "folder",
  "folder-open": "folder_open",
  clipboard: "content_paste",
  "clipboard-list": "assignment",
  "clipboard-check": "assignment_turned_in",

  // 스포츠 / 게임
  swords: "sports_kabaddi",
  trophy: "emoji_events",
  podium: "emoji_events",
  medal: "military_tech",
  award: "workspace_premium",
  "sports-hockey": "sports_hockey",
  target: "target",

  // 결제 / 재무
  "credit-card": "credit_card",
  receipt: "receipt_long",
  "dollar-sign": "attach_money",
  wallet: "account_balance_wallet",
  banknote: "payments",
  "piggy-bank": "savings",

  // 시설 / 재고
  package: "inventory_2",
  "building-2": "stadium",
  building: "apartment",
  home: "home",
  warehouse: "warehouse",
  store: "store",

  // 콘텐츠 / 커뮤니케이션
  megaphone: "campaign",
  "message-square": "chat",
  "message-circle": "forum",
  mail: "mail",
  send: "send",
  bell: "notifications",
  "bell-ring": "notifications_active",
  "support-agent": "support_agent",
  headset: "headset_mic",
  "life-buoy": "support",
  "help-buoy": "support",
  "edit-3": "edit",
  edit: "edit",
  "edit-2": "edit",
  pen: "edit",
  "pen-tool": "draw",
  "layout-template": "web_asset",
  layout: "dashboard",
  "layout-dashboard": "dashboard",
  "layout-grid": "grid_view",
  "layout-list": "view_list",

  // 차트 / 통계
  chart: "bar_chart",
  "chart-2": "bar_chart",
  "bar-chart": "bar_chart",
  "bar-chart-2": "bar_chart",
  "bar-chart-3": "analytics",
  "bar-chart-4": "leaderboard",
  "line-chart": "show_chart",
  "pie-chart": "pie_chart",
  "trending-up": "trending_up",
  "trending-down": "trending_down",
  activity: "monitoring",

  // 네비게이션 / 공용
  settings: "settings",
  "settings-2": "settings",
  cog: "settings",
  search: "search",
  filter: "filter_alt",
  menu: "menu",
  x: "close",
  plus: "add",
  minus: "remove",
  check: "check",
  "check-circle": "check_circle",
  "x-circle": "cancel",
  "alert-circle": "error",
  "alert-triangle": "warning",
  info: "info",
  "help-circle": "help",
  "headset-mic": "headset_mic",

  // 이동 / 여행
  plane: "flight_takeoff",
  "plane-takeoff": "flight_takeoff",
  "plane-landing": "flight_land",
  globe: "public",
  map: "map",
  "map-pin": "location_on",
  compass: "explore",

  // 미디어
  camera: "photo_camera",
  image: "image",
  video: "videocam",
  music: "music_note",
  headphones: "headphones",
  mic: "mic",
  "mic-off": "mic_off",
  play: "play_arrow",
  pause: "pause",

  // 기타
  heart: "favorite",
  star: "star",
  bookmark: "bookmark",
  download: "download",
  upload: "upload",
  copy: "content_copy",
  share: "share",
  "share-2": "share",
  link: "link",
  refresh: "refresh",
  "refresh-cw": "refresh",
  rotate: "rotate_right",
  phone: "phone",
  "phone-call": "call",
  eye: "visibility",
  "eye-off": "visibility_off",
  "thumbs-up": "thumb_up",
  "thumbs-down": "thumb_down",
  flag: "flag",
  tag: "sell",
  tags: "sell",
  zap: "bolt",
  sun: "light_mode",
  moon: "dark_mode",
  "log-out": "logout",
  "log-in": "login",

  // Seed 추가 매핑 (app-menus.ts 미매핑 항목 보강)
  badge: "badge",
  "book-open": "menu_book",
  dumbbell: "fitness_center",
  gift: "redeem",
  grid: "grid_view",
  "grip-vertical": "drag_indicator",
  "more-horizontal": "more_horiz",
  "plus-circle": "add_circle",
  "qr-code": "qr_code_2",
};

/**
 * 아이콘 이름을 Material Symbols ligature 로 정규화한다.
 * 1) Lucide 매핑에 있으면 치환
 * 2) 없으면 원본(이미 MS native 이름이라 가정) 사용
 */
function normalizeIconName(name: string): string {
  if (!name) return name;
  const lower = name.toLowerCase().trim();
  return LUCIDE_TO_MATERIAL[lower] ?? name;
}

interface IconProps {
  name: string;
  className?: string;
  filled?: boolean;
  weight?: number;
  grade?: number;
  size?: number;
  /** 장식용 아이콘 여부 (기본값: true - 대부분 아이콘은 텍스트와 함께 사용) */
  decorative?: boolean;
  /** 스크린 리더용 라벨 (decorative=false일 때 필수) */
  ariaLabel?: string;
  /** 인라인 스타일 (색상 등 Tailwind 임의값 대체용) */
  style?: React.CSSProperties;
}

export function Icon({
  name,
  className,
  filled = false,
  weight = 400,
  grade = 0,
  size = 24,
  decorative = true,
  ariaLabel,
  style,
}: IconProps) {
  // 의미있는 아이콘에 ariaLabel이 없으면 개발 환경에서 경고
  if (!decorative && !ariaLabel && process.env.NODE_ENV === "development") {
    devWarn(`Icon "${name}": decorative=false이지만 ariaLabel이 없습니다.`);
  }

  const resolvedName = normalizeIconName(name);

  return (
    <span
      className={cn("material-symbols-outlined", className)}
      style={{
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' ${weight}, 'GRAD' ${grade}, 'opsz' ${size}`,
        ...style,
      }}
      aria-hidden={decorative}
      role={decorative ? "presentation" : "img"}
      aria-label={!decorative ? ariaLabel : undefined}
    >
      {resolvedName}
    </span>
  );
}
