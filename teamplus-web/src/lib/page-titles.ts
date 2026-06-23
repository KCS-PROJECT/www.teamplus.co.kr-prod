/**
 * 페이지 경로별 공식 타이틀 매핑 (Single Source of Truth)
 *
 * 용도:
 *  - PageAppBar 타이틀과 drawer 메뉴 라벨을 동일 문자열로 일치시키기 위한 공통 사전.
 *  - 서버 `/menus/my` 응답의 label 을 이 테이블로 덮어써서 UI 일관성을 보장한다.
 *  - 각 페이지의 <PageAppBar title={...} /> 에 동일 상수를 재사용한다.
 *
 * 규칙:
 *  - 키는 **trailing slash 없는 절대 경로**. 동적 세그먼트는 기본 매칭 불가
 *    (별도 prefix 매처 필요 시 `resolvePageTitle` 확장).
 *  - 값은 한국어 + Tone & Manner (과한 영문·줄임말 금지).
 *  - 메뉴에 나오는 항목만 등록하면 된다 — 세부 페이지는 페이지 자체에서
 *    PageAppBar title 하드코딩을 유지해도 무방.
 */
export const PAGE_TITLES: Record<string, string> = {
  // ── 학생(Teen · Child) 공통 활동기록 ─────────────────
  '/attendance': '출석 내역',
  '/badges': '뱃지 컬렉션',
  '/stickers': '칭찬 스티커',
  '/ranking': '팀 랭킹',
  '/gift': '선물·리워드',
  '/photos': '포토 갤러리',

  // ── 학생 나의 활동 ───────────────────────────────────
  '/qr-checkin': 'QR 체크인',
  '/qr-scan': 'QR 출석 체크',
  '/calendar': '수업 캘린더',
  '/schedule': '주간 일정',
  '/dashboard': '대시보드',

  // ── 학생 훈련 분석 (Teen) ────────────────────────────
  '/teen': '홈',
  '/child': '홈',
  '/teen/dashboard': '종합 대시보드',
  '/teen/training-stats': '훈련 스탯',
  '/teen/skill-analysis': '능력 분석',

  // ── 학생 준비물 ───────────────────────────────────────
  '/checklist': '장비 체크리스트',

  // ── 공통 마이페이지 ──────────────────────────────────
  '/mypage': '마이페이지',
  '/notifications': '알림',
  '/settings': '환경 설정',
  '/profile': '프로필',
  '/profile/edit': '프로필 수정',
  '/profile/password': '비밀번호 변경',
  '/security': '보안 설정',
  '/notification-settings': '알림 설정',
  '/my-qr': '내 QR 코드',
  '/feedback': '고객센터',
  '/search': '검색',
  '/withdrawal': '회원 탈퇴',
  '/help': '도움말',
  '/faq': '자주 묻는 질문',
  '/messages': '상담',

  // ── 공지·소식 ────────────────────────────────────────
  '/timeline': '타임라인',
  '/notices': '서비스 공지사항',
  '/list': '서비스 공지사항',
  '/team-notices': '팀 공지사항',
  '/events': '이벤트',
  '/club/news': '팀 소식',
  '/event/premium': '프리미엄 이벤트',
  '/live-review': '라이브 리뷰',
  '/scoreboard': '실시간 스코어보드',

  // ── 팀·수업·쇼핑 공통 ────────────────────────────────
  '/classes': '수업',
  '/class-calendar': '수업 캘린더',
  '/class-favorites': '즐겨찾기 수업',
  // [수정 2026-04-30] 사용자 요청 — '팀' → '팀 관리', '대회' → '대회 관리'
  '/team': '팀 관리',
  '/teams': '팀 목록',
  '/tournaments': '대회 관리',
  '/matches/list': '경기 일정',
  '/matches/pickup': '픽업 매치',
  '/team-chat': '팀 채팅',
  '/leagues': '리그',
  '/statistics': '통계',

  // ── 학부모 ───────────────────────────────────────────
  '/parent': '홈',
  '/children': '선수 목록',
  '/children/add': '자녀 등록',
  '/parent-calendar': '자녀 수업 캘린더',
  '/rsvp': 'RSVP 응답',
  '/waitlist': '대기 목록',
  '/review': '코치 리뷰',
  '/report': '성장 리포트',
  '/skill-report': '기술 리포트',
  '/progress': '진도 현황',
  '/awards': '시상 내역',
  '/overseas-trips': '해외 원정',
  '/credits': '결제권',
  '/payment/history': '결제 내역',

  // ── 코치 ─────────────────────────────────────────────
  '/coach': '홈',
  '/coaches': '코치 목록',
  '/coach-schedules': '코치 일정',
  '/coach-calendar': '코치 캘린더',
  '/coach-members': '수강생 목록',
  '/coach-rsvp': 'RSVP 관리',
  '/classes-manage': '수업 관리',
  '/classes-manage/create': '수업 등록',
  '/classes-organize': '수업 구성',
  '/attendance-manage': '출석 관리',
  '/profile-edit': '프로필 수정',
  '/promotions': '프로모션',
  '/approval': '수강 신청 승인',
  '/qr-generate': 'QR 코드 발급',
  '/academy': '오픈클래스',
  '/training-manage': '훈련 관리',

  // ── 감독 ─────────────────────────────────────────────
  '/director': '홈',
  '/director-schedules': '전체 일정',
  '/director-notices': '공지사항 관리',
  '/director-payments': '결제 관리',
  '/director-approvals': '승인 내역',
  '/director-coaches': '코치 관리',
  '/director-credits': '결제권 관리',
  '/director-overseas-trips': '해외 원정 관리',
  '/director-members': '선수 관리',

  // ── 관리자 ───────────────────────────────────────────
  '/admin': '관리자 대시보드',
  '/admin-schedules': '일정 관리',
  '/coach-manage': '코치 관리',
  '/members': '회원 관리',
  '/members-create': '회원 등록',
  '/payments-manage': '결제 관리',
  '/settlements': '정산 관리',
  '/match-manage': '매치 관리',
  '/tournament-manage': '대회 관리',
  '/venue-manage': '경기장 관리',
  '/inventory': '장비/재고 관리',
  '/notices-manage': '공지 관리',
  '/notices/create': '공지 작성',
  '/popups': '팝업 관리',

  // ── 쇼핑몰 ───────────────────────────────────────────
  '/home': '쇼핑몰',
  '/products': '상품 목록',
  '/cart': '장바구니',
  '/wishlist': '위시리스트',
  '/orders': '주문 내역',
  '/shop-profile': '쇼핑몰 프로필',
  '/shop-checkout': '결제',
};

/**
 * pathname 에 대응하는 공식 타이틀을 반환.
 * - 정확히 일치하는 키가 있으면 그 값.
 * - 없으면 undefined (호출처에서 fallback 처리).
 */
export function resolvePageTitle(pathname: string): string | undefined {
  if (!pathname) return undefined;
  const normalized = pathname.replace(/\/+$/, '') || pathname; // trailing slash 제거
  return PAGE_TITLES[normalized];
}
