/**
 * TEAMPLUS 홍보 홈페이지 — 전역 콘텐츠 데이터
 *
 * 모든 페이지·섹션의 카피, 수치, 링크는 이 파일에서만 수정합니다.
 * 실수치는 `docs/Planning/PRD.md`·`README.md` 기준 (2026-04-11 실측)
 */

export const BRAND = {
  name: "팀플러스+",
  tagline: "아이의 아이스하키 하루를 함께 보는 앱",
  descriptor:
    "수업 일정, QR 출석, 성장 기록, 결제와 수업권까지 학부모와 코치가 한곳에서 확인합니다.",
  contact: {
    email: "icehockey@knewscorp.co.kr",
    phone: "02-557-5321",
    address: "서울특별시 송파구 송파대로 260, 1210호 (가락동, 제일오피스텔)",
    hours: "평일 09:00 - 18:00",
  },
  /**
   * 법인 사업자 정보 — PG 대행사 심사 및 전자상거래법 §10조 표시 의무사항.
   * 2026-05-27 사업자등록증 + 통신판매업신고증 원본 기반.
   * (PDF: 아이스타임즈_사업자등록증.pdf, 통신판매업 신고증_아이스타임즈.pdf)
   */
  legal: {
    /** 법인명 (사업자등록증 표시) */
    companyName: "주식회사 아이스타임즈",
    /** 영문명 */
    companyNameEn: "icetimes Inc.",
    /** 대표자 */
    representative: "신명근",
    /** 사업자등록번호 */
    businessNumber: "554-87-03674",
    /** 통신판매업 신고번호 */
    mailOrderNumber: "제 2025-서울송파-2647 호",
    /** 사업장 주소 */
    address: "서울특별시 송파구 송파대로 260, 제일오피스텔 1210호 (가락동)",
    /** 개인정보보호책임자 (2026-06-14 확정: 이준섭 · icehockey@knewscorp.co.kr) */
    privacyOfficer: "이준섭",
  },
  sns: {
    blog: "https://blog.teamplus.kr",
  },
  badges: [
    "아동 화면 고대비 설계",
    "보호자 결제 관리",
    "QR 출석 지원",
    "KG이니시스 공식 연동",
    "카카오 알림톡 연동",
  ],
};

export const NAV_ITEMS = [
  { href: "/", label: "홈" },
  { href: "/features", label: "앱 기능" },
  { href: "/solution", label: "클럽 도입" },
  { href: "/pricing", label: "요금제" },
  { href: "/news", label: "공지·소식" },
  { href: "/contact", label: "문의·상담" },
] as const;

/**
 * Hero 4-grid 인라인 메트릭 — 마케팅 임팩트 수치.
 * (기존 `Hero.tsx` 로컬 `heroStats` 배열을 카피 SoT 로 이관 · 값 동일)
 */
export const HERO_STATS = [
  { label: "클럽 도입", value: "17곳+" },
  { label: "월 결제 처리", value: "12,000건" },
  { label: "출석 자동화", value: "97%" },
  { label: "QR 성공률", value: "99.8%" },
];

/** 앱 스토어 다운로드 링크 — 출시 후 연결 (현재 빈 값). Hero · Final CTA 공용 SoT */
export const APP_DOWNLOAD = {
  appStore: "", // TODO: App Store 링크 추가
  googlePlay: "", // TODO: Google Play 링크 추가
};

export const HERO = {
  headlineTop: "아이의 아이스하키 하루를",
  headlineAccent: "한눈에 확인하세요",
  subCopy:
    "수업 일정, QR 출석, 성장 기록, 결제와 수업권까지. 팀플러스+는 아이가 빙판 위에서 보내는 시간을 부모와 코치가 놓치지 않도록 연결합니다.",
  metrics: [
    { label: "수업 일정", value: "오늘" },
    { label: "QR 출석", value: "즉시" },
    { label: "성장 기록", value: "한눈에" },
    { label: "결제 관리", value: "안전하게" },
  ],
};

/**
 * Hero 좌측 핵심 기능 3종.
 * icon 은 lucide-react 컴포넌트명, accent 는 일부 하위 컴포넌트 호환을 위해 유지한다.
 * 카피는 사실 기반(STATS·BRAND.badges 와 정합) — 임의 수치/효능 과장 금지.
 */
export const HERO_FEATURES = [
  {
    icon: "QrCode",
    accent: "cyan",
    title: "QR 출석 자동화",
    desc: "5분 일회용 QR 한 번으로 수업 시작이 끊기지 않습니다.",
  },
  {
    icon: "TrendingUp",
    accent: "violet",
    title: "성장 기록 한눈에",
    desc: "훈련·평가·피드백을 타임라인으로 모아 부모와 공유합니다.",
  },
  {
    icon: "ShieldCheck",
    accent: "ice",
    title: "안전한 결제·수업권",
    desc: "KG이니시스 공식 연동으로 결제와 수업권을 안전하게 관리합니다.",
  },
] as const;

/**
 * 핵심 메트릭 — 마케팅 임팩트용 큰 숫자 디스플레이
 * 실측 가능한 운영 수치만 노출 (PRD.md / SOLUTIONS 데이터 기준)
 */
export const STATS = [
  {
    value: "한 흐름",
    label: "클럽 운영 연결",
    description:
      "수업 편성, QR 출석, 결제권 차감, 알림 전달을 따로 처리하지 않고 하나의 운영 흐름으로 묶습니다.",
  },
  {
    value: "반복↓",
    label: "수기 업무",
    description:
      "종이 출석부, 엑셀 정산, 단톡방 공지를 줄이고 현장에서 다시 확인하는 시간을 줄입니다.",
  },
  {
    value: "8개",
    label: "운영 모듈",
    description:
      "회원 · 수업 · 출석 · 결제 · 알림 · 쇼핑 · 대회 · 채팅을 필요한 순서로 연결합니다.",
  },
  {
    value: "역할별",
    label: "맞춤 화면",
    description:
      "학부모 · 코치 · 감독이 같은 클럽 데이터를 각자 해야 할 일 중심으로 봅니다.",
  },
];

/**
 * 신뢰 지표 — 보안/결제/인증/접근성 4대 카드
 * TrustBar에 사용. 추상적 카피 대신 구체 인증·수치만 노출.
 */
export const TRUST_INDICATORS = [
  {
    iconName: "shield-check" as const,
    label: "보안 · 권한",
    value: "JWT Rotation · OWASP",
    description:
      "Access 15분 + Refresh 7일 · Redis 블랙리스트 · IP 화이트리스트",
  },
  {
    iconName: "credit-card" as const,
    label: "결제 · 정산",
    value: "KG이니시스 공식",
    description: "카드 토큰화 · Webhook 서명 · 멱등성 · PCI DSS 비저장",
  },
  {
    iconName: "bell" as const,
    label: "알림 · 전달",
    value: "카카오 Alimtalk + SMS",
    description: "5개 기본 템플릿 · Redis 큐 · 3회 재시도 · SMS 자동 폴백",
  },
  {
    iconName: "accessibility" as const,
    label: "접근성 · 아동",
    value: "WCAG AAA",
    description: "72×72dp 터치 · 7:1 대비 · 18px+ 폰트 · PIPA 아동 보호 준수",
  },
];

export const APP_FLOW = [
  {
    label: "수업 전",
    title: "오늘 수업과 준비물을 확인합니다",
    description: "학부모는 자녀별 일정과 출석 예정 상태를 한 화면에서 봅니다.",
  },
  {
    label: "출석",
    title: "QR로 빠르게 출석합니다",
    description: "코치가 QR을 열고 아이가 체크인하면 기록이 바로 남습니다.",
  },
  {
    label: "수업 후",
    title: "성장 기록을 놓치지 않습니다",
    description: "출석, 진도, 코치 메모가 자녀 프로필에 차곡차곡 쌓입니다.",
  },
  {
    label: "월말",
    title: "결제와 수업권을 정리합니다",
    description: "수업권 잔여 횟수와 결제 내역을 보호자 기준으로 관리합니다.",
  },
];

/**
 * 핵심 3역할(학부모 · 코치 · 감독) 카드 데이터.
 * 학부모는 가족(자녀 · 청소년) 프로필을 family 로 내부 통합 → 별도 역할로 노출하지 않는다.
 * iconName 은 lucide-react 키 — Personas.tsx 에서 매핑
 */
export const USER_VALUES: Array<{
  role: string;
  subtitle: string;
  iconName:
    | "users-round"
    | "whistle"
    | "shield"
    | "baby"
    | "graduation-cap"
    | "briefcase";
  bullets: string[];
  highlight?: boolean;
  /** 보호자 계정 아래 함께 묶이는 가족 프로필 (자녀 · 청소년) — Parent 카드 내부에 통합 표시 */
  family?: Array<{
    role: string;
    subtitle: string;
    iconName: "baby" | "graduation-cap";
    bullets: string[];
  }>;
}> = [
  {
    role: "학부모",
    subtitle: "보호자",
    iconName: "users-round",
    bullets: [
      "자녀 여러 명 한 계정",
      "수업·출석 실시간 알림",
      "결제·수업권 잔여 관리",
    ],
    highlight: true,
    family: [
      {
        role: "자녀 프로필",
        subtitle: "자녀",
        iconName: "baby",
        bullets: [
          "이름(별명) · 생년월일만으로 등록",
          "출석 · 성장 기록 자동 누적",
          "이용 · 결제는 보호자가 관리",
        ],
      },
      {
        role: "청소년 선수",
        subtitle: "청소년",
        iconName: "graduation-cap",
        bullets: ["직접 출석·일정 확인", "뱃지 컬렉션·랭킹", "코치 피드백 열람"],
      },
    ],
  },
  {
    role: "코치",
    subtitle: "현장 운영",
    iconName: "whistle",
    bullets: [
      "수업·정원·반복 일정",
      "QR 한 번에 전원 출석",
      "코치 메모·진도 기록",
    ],
  },
  {
    role: "감독",
    subtitle: "클럽 관리",
    iconName: "shield",
    bullets: ["클럽 KPI 대시보드", "코치 진행률 막대", "월간 정산 표·엑셀"],
  },
];

export type FeatureItem = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  bullets: string[];
  icon: string;
  accent: "cyan" | "violet" | "emerald" | "amber" | "rose" | "ice";
};

export const FEATURES: FeatureItem[] = [
  {
    id: "member",
    title: "회원 · 클럽 관리",
    subtitle: "Membership & Club",
    description:
      "학부모 · 선수 · 코치 · 감독까지 역할 기반(RBAC 9개) 으로 분리하고, 초대코드 · QR 로 클럽 가입을 1분 안에 끝냅니다.",
    bullets: [
      "학부모 1명 = 자녀 N명 다중 프로필",
      "클럽 초대코드 · QR 가입",
      "코치 대량 승인 (15명 → 2분)",
      "회원 등급 · 경력 · 수상 이력 관리",
    ],
    icon: "users",
    accent: "ice",
  },
  {
    id: "class",
    title: "수업 · 스케줄",
    subtitle: "Class & Schedule",
    description:
      "연령 · 레벨 · 정원을 한번에 제한하고, 반복 스케줄 · 게임레슨 · 아카데미 프로모션까지 캘린더에서 통합 관리합니다.",
    bullets: [
      "반복 수업 · 임시 수업 혼합",
      "연령·스킬 레벨 제한",
      "자녀별 컬러 구분 가족 캘린더",
      "수업 전날 자동 확정 배치",
    ],
    icon: "calendar",
    accent: "cyan",
  },
  {
    id: "qr",
    title: "QR 출석 시스템",
    subtitle: "Real-time QR Attendance",
    description:
      "코치가 5분짜리 QR 을 띄우고 학생이 스캔하면 그 자리에서 출석이 기록됩니다. PC · 모바일 · 아동 전용 UI 모두 지원.",
    bullets: [
      "5분 유효 일회용 QR",
      "즉시 체크인 · 3초 연속 스캔",
      "오프라인 대기열 → 온라인 동기화",
      "실시간 Socket.io 대시보드 반영",
    ],
    icon: "qr",
    accent: "violet",
  },
  {
    id: "payment",
    title: "결제",
    subtitle: "Payment",
    description:
      "KG이니시스 공식 연동으로 카드 · 간편결제 · 가상계좌를 모두 지원합니다. Webhook 서명 검증과 멱등성 키로 중복 결제를 원천 차단합니다.",
    bullets: [
      "카드 · 간편결제 · 가상계좌",
      "Webhook 서명 · 멱등성",
      "환불 · 부분환불 자동 처리",
      "PCI DSS · 카드정보 비저장",
    ],
    icon: "card",
    accent: "emerald",
  },
  {
    id: "notification",
    title: "알림톡 · 푸시",
    subtitle: "Alimtalk & Push",
    description:
      "카카오 Alimtalk 템플릿 + FCM 푸시 + SMS 폴백 3단 구조. 결제 완료 · 승인 · 취소 · 리마인더 5대 템플릿 내장.",
    bullets: [
      "카카오 Alimtalk 5개 기본 템플릿",
      "Redis 큐 + 3회 재시도",
      "미수신 시 SMS 자동 폴백",
      "조용한 시간 (7PM-7AM) 일괄 지원",
    ],
    icon: "bell",
    accent: "amber",
  },
  {
    id: "shop",
    title: "클럽 쇼핑몰",
    subtitle: "Shop & E-commerce",
    description:
      "유니폼 · 스틱 · 헬멧 등 하키 용품을 클럽 전용 쇼핑몰에서 판매. 재고 · 위시리스트 · 리뷰까지 기본 제공합니다.",
    bullets: [
      "13개 전용 모델 · 장바구니 · 주문",
      "회원 할인가 · 그룹 할인",
      "리뷰 · 위시리스트 · 재고 관리",
      "결제 시스템 공유 (동일 KG이니시스)",
    ],
    icon: "shop",
    accent: "rose",
  },
  {
    id: "tournament",
    title: "대회 · 픽업매치",
    subtitle: "Tournament & Pickup",
    description:
      "i-League · 디비전 · 토너먼트 · 픽업매치 4가지 경기 형식을 모두 지원. 참가 신청 · 대진 · 경력 기록까지 자동화.",
    bullets: [
      "리그 / 디비전 / 토너먼트 / 픽업",
      "참가 신청 · RSVP · 대기자",
      "선수 경력 · 수상 자동 누적",
      "해외 원정 스케줄 관리",
    ],
    icon: "trophy",
    accent: "ice",
  },
  {
    id: "chat",
    title: "실시간 채팅",
    subtitle: "Realtime Chat",
    description:
      "Socket.io 기반 1:1 · 그룹 · 공지 채팅방. 공지사항과 자연스럽게 연결되어 클럽 내부 커뮤니케이션을 한곳으로 모읍니다.",
    bullets: [
      "1:1 · 그룹 · 공지 채팅",
      "읽지 않음 · 알림 뱃지",
      "파일 · 이미지 · 동영상 첨부",
      "클럽 공지 · 게시판 연동",
    ],
    icon: "chat",
    accent: "cyan",
  },
];

/**
 * 8개 기능 모듈을 "4개의 일"로 묶는 그룹 — /features 전용.
 * id = in-page anchor · moduleIds = FEATURES.id 참조(상세는 FEATURES 가 SoT, 재사용).
 * accent 는 ACCENT_CLASSES 키 — 그룹 라벨 점에만 절제 적용(색 = 의미별 분류, 장식 아님).
 */
export const FEATURE_GROUPS: Array<{
  id: string;
  label: string;
  caption: string;
  accent: "ice" | "emerald" | "cyan" | "violet";
  moduleIds: string[];
}> = [
  {
    id: "ops",
    label: "운영 핵심",
    caption: "회원을 받고, 수업을 열고, 출석을 남기는 매일의 기본기",
    accent: "ice",
    moduleIds: ["member", "class", "qr"],
  },
  {
    id: "commerce",
    label: "결제 · 커머스",
    caption: "수업료부터 클럽 용품까지 돈의 흐름을 한 결제선으로",
    accent: "emerald",
    moduleIds: ["payment", "shop"],
  },
  {
    id: "comms",
    label: "소통 · 알림",
    caption: "놓치는 공지 없이 알림톡과 채팅으로 한곳에서",
    accent: "cyan",
    moduleIds: ["notification", "chat"],
  },
  {
    id: "compete",
    label: "경기 · 기록",
    caption: "리그 · 토너먼트 · 픽업매치와 선수 경력까지",
    accent: "violet",
    moduleIds: ["tournament"],
  },
];

/**
 * 시그니처 워크플로 — "8개가 따로가 아니라 한 흐름"을 증명하는 /features 핵심 장면.
 * QR 출석 한 번이 수업권·결제·기록으로 이어지는 연결성. 수치는 STATS/FEATURES 재사용(날조 0).
 */
export const FEATURE_SIGNATURE = {
  kicker: "한 번의 출석, 끊기지 않는 흐름",
  headlineTop: "QR 한 번이",
  headlineBottom: "출석 · 결제권 · 기록까지",
  description:
    "코치가 5분 일회용 QR을 띄우면 아이가 그 자리에서 체크인하고, 결제권 차감과 정산, 성장 기록까지 끊김 없이 이어집니다. 따로 도는 8개 기능이 아니라 하나의 운영입니다.",
  stat: { value: "자동", label: "출석 이후 흐름" },
  flow: [
    { step: "QR 출석", note: "5분 일회용 · 3초 연속 스캔" },
    { step: "결제권 차감", note: "수업권 잔여 자동 반영" },
    { step: "결제 · 정산", note: "KG이니시스 공식 연동" },
    { step: "성장 기록", note: "출석 · 진도 · 코치 메모" },
  ],
  // [0] = 앞(큰) hero · [1] = 뒤(작은) 보조. 결과(학부모 출석·결제권)를 hero 로, QR 생성(코치)을 보조로.
  screens: [
    { src: "/images/screens/parent/14-attendance-history.png", cap: "학부모 · 출석·결제권" },
    { src: "/images/screens/coach/04-qr-generate.png", cap: "코치 · QR 출석" },
  ],
} as const;

export type SolutionPillar = {
  title: string;
  description: string;
  highlights: string[];
};

export const SOLUTIONS: SolutionPillar[] = [
  {
    title: "Hybrid 아키텍처",
    description:
      "Flutter Native Shell 15-20% + Next.js WebView 80-85% 구조로 네이티브 성능과 웹 유연성을 동시에 확보합니다. 카메라 · 생체인증 · 결제 · QR · 딥링크 10종 브릿지를 기본 제공합니다.",
    highlights: [
      "Flutter 3.16+",
      "Next.js 15.5",
      "JS Bridge 10종",
      "iOS · Android",
    ],
  },
  {
    title: "엔터프라이즈 보안",
    description:
      "JWT Access 15분 + Refresh 7일 · bcrypt salt ≥10 · Redis 블랙리스트 · IP 화이트리스트 · Webhook 서명검증 · OWASP Top 10 방어. PIPA · WCAG AAA 법적 요건까지 완비되어 있습니다.",
    highlights: ["JWT Rotation", "RBAC 9 Role", "PIPA 준수", "WCAG AAA"],
  },
  {
    title: "1초 SLA 성능",
    description:
      "gzip compression (응답 85% 감소 실측) · HTTP keep-alive · ETag · Redis 캐시 · Prisma connection_limit=25 · Flutter 타임아웃 5/10/15s 세팅. 모든 플랫폼에서 `[SLA_BREACH]` 로그로 성능 회귀를 즉시 감지합니다.",
    highlights: ["gzip 85%↓", "ETag Weak", "Redis TTL", "Lighthouse >90"],
  },
  {
    title: "관제 · 운영 자동화",
    description:
      "43 모듈 · 145 Prisma 모델 · 700+ API 엔드포인트. 어드민 대시보드 86개 페이지에서 매출 · 회원 · 출석 · 결제를 실시간 모니터링하고 엑셀 · PDF 로 내보냅니다.",
    highlights: ["Admin 86 Page", "700+ API", "Socket.io", "Excel Export"],
  },
];

export type PersonaItem = {
  role: string;
  subtitle: string;
  tasks: string[];
  accent: "cyan" | "violet" | "emerald" | "amber" | "rose" | "ice";
};

export const PERSONAS: PersonaItem[] = [
  {
    role: "학부모",
    subtitle: "Parent",
    tasks: [
      "자녀 여러 명 한 계정에서 관리",
      "수업 결제 · 알림톡 확인 · 환불",
      "결제 내역 · 환불 현황 한눈에 확인",
      "QR 출석 체크인 · 실시간 수업 알림",
    ],
    accent: "ice",
  },
  {
    role: "코치",
    subtitle: "Coach",
    tasks: [
      "수업 · 스케줄 · 정원 관리",
      "QR 한 번으로 전원 출석체크",
      "회원 일괄 승인 · 등급 조정",
      "엑셀로 출석부 · 매출 내보내기",
    ],
    accent: "cyan",
  },
  {
    role: "관리자",
    subtitle: "Administrator",
    tasks: [
      "다중 클럽 통합 운영",
      "매출 · 정산 · 환불 실시간 대시보드",
      "공지 · 팝업 · 이벤트 배너 관리",
      "사용자 · 권한 · 감사로그 관리",
    ],
    accent: "violet",
  },
  {
    role: "청소년 선수",
    subtitle: "Teen Player",
    tasks: [
      "QR 출석 체크인 · 일정 확인",
      "출석 뱃지 · 랭킹 게이미피케이션",
      "훈련 체크리스트 · 성장 기록",
      "결제 · 개인정보는 보호자가 관리",
    ],
    accent: "emerald",
  },
];

export type PricingPlan = {
  name: string;
  tagline: string;
  price: string;
  priceUnit: string;
  featured?: boolean;
  description: string;
  includes: string[];
  ctaLabel: string;
  ctaHref: string;
};

export const PRICING: PricingPlan[] = [
  {
    name: "Starter",
    tagline: "소규모 클럽 · 소속 회원 50명 이하",
    price: "99,000",
    priceUnit: "원 / 월",
    description:
      "핵심 기능만 빠르게 도입하여 종이 운영을 디지털로 옮기고 싶은 신규 클럽에 추천합니다.",
    includes: [
      "회원 · 수업 · 스케줄",
      "QR 출석 (기본 1코치)",
      "KG이니시스 결제 연동",
      "알림톡 기본 3템플릿",
      "이메일 지원",
    ],
    ctaLabel: "14일 무료 체험",
    ctaHref: "/contact?plan=starter",
  },
  {
    name: "Business",
    tagline: "성장 중인 클럽 · 회원 50-300명",
    price: "249,000",
    priceUnit: "원 / 월",
    featured: true,
    description:
      "대부분의 프로 · 아마추어 클럽이 선택하는 기본 플랜입니다. 쇼핑몰 · 대회 · 실시간 채팅까지 포함합니다.",
    includes: [
      "Starter 전 기능 +",
      "클럽 쇼핑몰 (상품 무제한)",
      "대회 · 픽업매치 · 리그",
      "실시간 채팅 · 공지 게시판",
      "관리자 대시보드 (86개 화면)",
      "알림톡 5종 + SMS 폴백",
      "카카오톡 · 전화 지원",
    ],
    ctaLabel: "Business 데모 받기",
    ctaHref: "/contact?plan=business",
  },
  {
    name: "Enterprise",
    tagline: "다중 클럽 · 프랜차이즈 · 협회",
    price: "문의",
    priceUnit: "Custom",
    description:
      "복수 지점 통합, 자체 도메인, SSO, 전용 인프라가 필요한 조직을 위한 맞춤형 플랜입니다.",
    includes: [
      "Business 전 기능 +",
      "다중 클럽 · 지점 통합 관리",
      "커스텀 도메인 · 화이트라벨",
      "SSO · 감사로그 · 권한 세분화",
      "전용 인프라 · SLA 계약",
      "24/7 전담 CS · 온사이트 교육",
      "해외 원정 · 국제 대회 지원",
    ],
    ctaLabel: "Enterprise 상담",
    ctaHref: "/contact?plan=enterprise",
  },
];

export type CaseStudy = {
  name: string;
  type: string;
  region: string;
  logoLetter: string;
  metrics: { label: string; value: string }[];
  quote: string;
  author: string;
};

export const CASES: CaseStudy[] = [
  {
    name: "안양 ACE 아이스하키",
    type: "유소년 · 성인 통합 클럽",
    region: "경기 안양",
    logoLetter: "A",
    metrics: [
      { label: "회원", value: "420명" },
      { label: "월 결제", value: "1,200건" },
      { label: "출석률", value: "+32%" },
    ],
    quote:
      "종이 출석부와 카톡으로 하던 일을 팀플러스+ 한 화면에서 처리합니다. 코치들이 수업에 집중할 수 있어 만족도가 크게 올랐어요.",
    author: "김 디렉터 / 운영총괄",
  },
  {
    name: "서울 Glacier HC",
    type: "프로 · 성인 클럽",
    region: "서울 송파",
    logoLetter: "G",
    metrics: [
      { label: "정기회원", value: "180명" },
      { label: "대회 참가", value: "12회/년" },
      { label: "환불 처리", value: "-68%" },
    ],
    quote:
      "KG이니시스 연동이 깔끔하고 환불 처리가 자동이라 CS 업무가 크게 줄었습니다. 리그 · 토너먼트 관리가 특히 강점이에요.",
    author: "이 대표 / 구단주",
  },
  {
    name: "부산 Polar Kids",
    type: "유소년 전문 아카데미",
    region: "부산 해운대",
    logoLetter: "P",
    metrics: [
      { label: "아동 회원", value: "230명" },
      { label: "학부모 만족", value: "4.8/5" },
      { label: "QR 성공률", value: "99.8%" },
    ],
    quote:
      "아이들이 직접 사용하는 화면이라 접근성 (WCAG AAA) 이 정말 중요했어요. 큰 버튼 · 고대비 · 쉬운 아이콘이 기본이라 안심됩니다.",
    author: "박 원장 / 아카데미 디렉터",
  },
  {
    name: "i-League 연합",
    type: "국내 최대 아이스하키 리그",
    region: "전국 17개 구단",
    logoLetter: "L",
    metrics: [
      { label: "소속 구단", value: "17팀" },
      { label: "정규 경기", value: "240건/시즌" },
      { label: "선수 DB", value: "2,100명+" },
    ],
    quote:
      "여러 구단을 한 플랫폼에서 통합 운영하니 대진 · 기록 · 정산이 한 화면에서 해결됩니다. 팀플러스+ 없이는 리그 운영을 상상할 수 없어요.",
    author: "i-League 사무국",
  },
];

export type FaqItem = { q: string; a: string };

export const FAQ: FaqItem[] = [
  {
    q: "기존 회원 데이터를 팀플러스+로 옮길 수 있나요?",
    a: "네, 기존 회원 명단과 수업 정보를 정리해 옮길 수 있습니다. 도입 초기에는 전담 온보딩 담당자가 클럽 상황에 맞춰 안내합니다.",
  },
  {
    q: "학부모가 바로 앱을 사용할 수 있나요?",
    a: "클럽 도입 후 학부모 계정과 자녀 정보가 준비되면 사용할 수 있습니다. 앱 배포 상태와 초대 방식은 클럽별 운영 방식에 맞춰 안내합니다.",
  },
  {
    q: "자녀 정보는 어떻게 등록하고 관리되나요?",
    a: "자녀는 보호자가 이름(또는 별명)과 생년월일만으로 등록하는 자녀 프로필로 관리됩니다. 별도의 자녀 계정이나 어린이가 직접 조작하는 화면 없이, 수업 신청 · 출석 확인 · 결제까지 모든 이용은 보호자 계정에서 이루어집니다.",
  },
  {
    q: "결제와 수업권은 어떻게 관리되나요?",
    a: "보호자가 결제 내역과 남은 결제권을 확인합니다. 카드 정보는 서버에 직접 저장하지 않고 결제사 토큰화 흐름을 따릅니다.",
  },
  {
    q: "코치는 무엇이 편해지나요?",
    a: "수업 명단, QR 출석, 출석 상태, 코치 메모를 한 흐름에서 처리합니다. 링크장에서 종이 명단과 별도 메신저를 오가는 일을 줄입니다.",
  },
  {
    q: "데이터 보안은 어떻게 관리되나요?",
    a: "역할별로 볼 수 있는 정보를 분리하고, 보호자와 클럽 운영자가 필요한 범위 안에서만 데이터를 다룹니다. 결제와 개인정보 흐름은 별도 보안 기준에 맞춰 관리합니다.",
  },
];

export const TRUST_LOGOS = [
  "ACE",
  "Glacier",
  "Polar",
  "i-League",
  "Arctic",
  "Frozen",
  "Blizzard",
  "IceBreaker",
  "Tundra",
  "Avalanche",
  "Northern",
  "Storm",
];

export const FINAL_CTA = {
  // 헤딩은 브랜드 토큰("팀플러스+로")이 줄바꿈에 쪼개지지 않도록 파트 분리 (FinalCta.tsx 에서 brand 에 nowrap)
  headlineLead: "우리 클럽도",
  headlineBrand: "팀플러스+로",
  headlineTail: "시작하세요",
  subCopy:
    "학부모 앱, 자녀 프로필, 코치 출석 관리까지 클럽 상황에 맞춰 도입 흐름을 안내합니다.",
};

/**
 * 설득 깔때기 (A)(B) — 문제 공감 + Before/After 전환 대비.
 * `ProblemSolution.tsx`(Hero 직후 첫 스크롤)에서 사용한다.
 * 가드: 신규 정량 수치 0(정성 표현만) · 자녀는 보호자가 등록·관리하는 프로필 포지션 유지.
 * `pairs` 는 before ↔ after 1:1 병렬 대응 — 같은 인덱스가 시각적으로 마주본다.
 */
export const PROBLEM_SOLUTION = {
  eyebrow: "운영 전환",
  headline: "클럽 운영이 여기저기 흩어져 있지 않나요?",
  subCopy:
    "출석부는 종이에, 정산은 엑셀에, 공지는 단톡방에. 흩어진 운영은 빠지는 기록과 반복되는 확인 전화를 만듭니다. 팀플러스는 이 모든 흐름을 한곳으로 모읍니다.",
  beforeLabel: "지금, 이렇게 나뉘어 있습니다",
  afterLabel: "팀플러스, 한 흐름으로 모읍니다",
  pairs: [
    { before: "종이 출석부에 손으로 체크", after: "QR 한 번으로 그 자리에서 자동 기록" },
    { before: "엑셀로 수업료·미수금 수기 정산", after: "결제·수업권이 출석과 함께 자동 정리" },
    { before: "단톡방 공지가 학부모·코치 뒤섞임", after: "역할별 화면과 알림으로 따로 전달" },
    { before: "결제·환불 요청을 메신저로 일일이", after: "보호자가 결제·수업권을 앱에서 직접 관리" },
  ],
} as const;

/**
 * 설득 깔때기 (C)(D) — 차별점 명명("왜 팀플러스여야 하는가") + 도입 장벽 해소.
 * `WhyTeamplus.tsx` 에서 사용한다. `marker` 는 전부 기존 content.ts 사실 근거(날조 0):
 *  - "경기 형식 4종" = FEATURES.tournament · "역할별 화면" = STATS "역할별 맞춤 화면"
 *  - "QR 즉시 기록" = FEATURES.qr · "한 흐름 운영" = 정성 표현.
 * `support` 는 FAQ 1번(전담 온보딩 담당자) 사실과 정합한다.
 */
export const WHY_TEAMPLUS = {
  eyebrow: "도입 이유",
  headline: "범용 관리 앱이 아니라, 팀플러스여야 하는 이유",
  subCopy:
    "예약 앱이나 단체 채팅으로는 채우지 못하는, 아이스하키 클럽 운영에 필요한 네 가지입니다.",
  reasons: [
    {
      title: "아이스하키에 맞춰 설계",
      description:
        "범용 예약 앱이 아니라 리그·디비전·토너먼트·픽업매치와 빙상 수업 구조를 그대로 담았습니다.",
      marker: "경기 형식 4종",
    },
    {
      title: "역할이 섞이지 않습니다",
      description:
        "학부모·코치·감독이 같은 데이터를 각자의 화면으로 봅니다. 자녀는 보호자가 등록·관리하는 프로필입니다.",
      marker: "핵심 3역할",
    },
    {
      title: "출석은 그 자리에서 기록",
      description:
        "코치가 5분 일회용 QR을 띄우면 출석이 바로 남고, 수업권과 기록이 이어집니다.",
      marker: "QR 즉시 기록",
    },
    {
      title: "결제·출석·정산이 한 흐름",
      description:
        "QR 출석이 결제권 차감과 KG이니시스 결제·정산까지 끊김 없이 이어집니다.",
      marker: "한 흐름 운영",
    },
  ],
  support:
    "도입은 전담 담당자가 기존 회원·수업 데이터 이관부터 정착까지 함께합니다.",
} as const;
