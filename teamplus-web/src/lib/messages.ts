/**
 * TEAMPLUS Tone & Manner 표준 메시지
 *
 * 공통 메시지는 @shared/constants/messages.ts에서 가져오고,
 * Web 전용 메시지는 이 파일에서 확장합니다.
 *
 * 참조: CLAUDE.md > Tone & Manner Guidelines
 */
import { MESSAGES as SHARED_MESSAGES, subjectParticle } from "@shared/constants/messages";

export { subjectParticle };

export const MESSAGES = {
  ...SHARED_MESSAGES,
  class: {
    registered: "수업이 등록되었습니다.",
    cancelConfirm: "수업을 취소하시겠습니까?",
    shareAction: "공유",
    shareAriaLabel: (name: string) => `${name} 수업 공유하기`,
    shareTitle: (name: string) => `${name} 수업`,
    shareText: (meta: string) =>
      meta ? `TEAMPLUS 수업 정보 · ${meta}` : "TEAMPLUS 수업 정보",
    shareSuccess: "링크가 복사되었습니다.",
    shareFailed: "링크 복사에 실패했습니다.",
    nameRequired: "수업명을 입력해주세요.",
    nameMaxLength: "수업명은 50자 이내로 입력해주세요.",
    instructorRequired: "코치명을 입력해주세요.",
    instructorMaxLength: "코치명은 30자 이내로 입력해주세요.",
    capacityMin: "정원은 1명 이상이어야 합니다.",
    capacityMax: "정원은 100명 이하로 입력해주세요.",
    ageMaxInvalid: "최대 연령은 최소 연령보다 크거나 같아야 합니다.",
    startDateRequired: "시작 날짜를 선택해주세요.",
    startTimeRequired: "시작 시간을 선택해주세요.",
    endTimeRequired: "종료 시간을 입력해주세요.",
    deleteConfirm:
      "이 수업을 삭제하시겠습니까? 관련 일정과 등록 데이터가 함께 삭제됩니다.",
    deleteBlocked: "신청자 또는 결제·출석 이력이 있어 삭제할 수 없습니다.",
    deleted: "수업이 삭제되었습니다.",
    updated: "수업 정보가 수정되었습니다.",
    scheduleCreated: "수업 일정이 생성되었습니다.",
    scheduleBulkCreated: (count: number) =>
      `${count}개의 수업 일정이 생성되었습니다.`,
    scheduleCancelled: "수업 일정이 취소되었습니다.",
    scheduleManage: "일정 관리",
    // 일정마다 시간/장소가 달라 단일 값으로 요약할 수 없을 때 표기.
    schedulesVary: "회차별 상이",
    policyInfo:
      "수업 등록 시 학부모님들께 알림이 발송됩니다. 대관 시간 15분 전 링크장 도착을 원칙으로 합니다.",
    policyInfoCreate:
      "클래스 개설 정보는 실시간으로 학부모 앱에 공지됩니다. 모든 정산 및 취소는 파워플레이 프로 표준 약관을 준수합니다.",
    noProducts: "등록된 수강 상품이 없어 신청할 수 없습니다.",
    selectProductTitle: "수강 방식 선택",
    selectProductDescription: "원하시는 결제 방식을 선택해주세요.",
    // 수업 유형 (정규/레슨 2카테고리)
    kindLabel: {
      regular: "정규훈련",
      lesson: "레슨",
    },
    kindDescription: {
      regular: "주별 반복 일정으로 진행되는 정기 수업입니다.",
    },
    // 수정 모드에서 유형 전환 차단 안내
    kindLockedNotice: "등록된 수업은 유형을 변경할 수 없습니다.",
    // PACKAGE_WEEKS_SPEC §3 — 정기 패키지 표기.
    // 카드 라벨은 회당 단가 환산 (요일 라벨과 중복되는 "주 N회" 제거).
    // 상세 화면 detailLabel 은 정보 충실도 우선.
    package: {
      label: (weeks: number, perSessionPrice: number) =>
        `${weeks}주 정기권 · 회당 ${perSessionPrice.toLocaleString("ko-KR")}원`,
      detailLabel: (weeks: number, perWeek: number, total: number) =>
        `${weeks}주 정기권 (주 ${perWeek}회 · 총 ${total}회)`,
      weeksOnly: (weeks: number) => `${weeks}주 정기권`,
      perWeekOnly: (perWeek: number) => `주 ${perWeek}회`,
      // 등록 폼 옵션 A — 운영자가 패키지 주 수를 명시 선택.
      // 한국어 자연성: "주 단위로 정한다" / "종료일까지 (의 기간으로 정한다)" 동일 차원의 입력 방식.
      mode: {
        weeks: "주 단위로",
        endDate: "종료일까지",
      },
      presets: {
        custom: "직접 입력",
      },
      endDateAuto: (dateStr: string) => `종료일 자동: ${dateStr}`,
      weeksAuto: (weeks: number) => `${weeks}주 (자동 계산)`,
      preview: (
        weeks: number,
        perWeek: number,
        total: number,
        perSession: number,
      ) =>
        `${weeks}주 정기권 · 주 ${perWeek}회 · 총 ${total}회 · 회당 ${perSession.toLocaleString("ko-KR")}원`,
    },
    featured: {
      label: "이번 주 추천 수업",
    },
    accessDenied: "이 수업에 접근할 권한이 없습니다.",
  },
  enrollment: {
    // 성공/실패
    successTitle: "수강신청이 완료되었습니다.",
    failureTitle: "수강신청 처리 중 오류가 발생했습니다.",
    paymentFailureTitle: "결제 처리 중 오류가 발생했습니다.",

    // 검증/사전 조건
    noChildren: "등록된 자녀가 없습니다. 먼저 자녀를 등록해주세요.",
    notEligibleForTeam: "이 수업을 수강할 수 있는 자녀가 없습니다.",
    selectChild: "자녀를 선택해주세요.",

    // 중복/상태
    duplicateError: "이미 신청 중이거나 수강 중인 수업입니다.",

    // [추가 2026-05-18] 자녀 단일 선택 진입점 통일 (수업 상세 ChildSelector → 결제 옵션 readonly)
    //  - cancelConfirm: 결제취소 모달에서 자녀명·수업명 명시 (다자녀 시나리오)
    //  - selectedChildHelper: 결제 옵션 readonly 표시 카드 헬퍼 문구
    //  - disabled 라벨: ChildSelector 비활성 자녀 사유 표기 (이미 수강 중 / 연령 제한)
    //    팀 가입 미승인 라벨은 MESSAGES.team.disabled{Pending|Rejected|NotMember}Label 재사용.
    cancelConfirmTitle: "결제를 취소할까요?",
    // [Phase B] 후불 수강 신청/취소 (구독형)
    //   [2026-06-18 사용자 직접 지시] 선불과 동일하게 '신청' 문구로 통일
    //   (수강 등록하기→신청하기 · 수강 중→신청완료 · 수강 종료→신청취소).
    postpaidEnrolled: "수강 등록되었습니다. 출석한 만큼 매월 정산됩니다.",
    postpaidEnrollCta: "신청하기",
    enrolledLabel: "신청완료",
    endConfirmTitle: "신청을 취소할까요?",
    endConfirmMessage: (child: string, cls: string) =>
      `${child}의 "${cls}" 신청을 취소합니다. 이후 출석·청구가 중단됩니다.`,
    endConfirm: "신청취소",
    ending: "취소 중...",
    endSuccess: "신청이 취소되었습니다.",
    // [선택형(BOTH)] 상세에서 선·후불 택1 — 후불은 즉시 등록, 선불은 결제 페이지로.
    bothPrepaidCta: "선불로 결제하기",
    bothPostpaidCta: "후불로 등록하기",
    selectPlanRequired: "수강 플랜을 선택해주세요.",
    cancelConfirmMessage: (childName: string, className: string) =>
      `${childName} 의 ${className} 수업 결제가 취소됩니다.`,
    selectedChildHelper: "수강생을 변경하려면 이전 단계로 돌아가세요",
    disabledEnrolledLabel: "이미 수강 중",
    disabledEnrolledShort: "수강중",
    disabledAgeLabel: "연령 제한",
    disabledAgeShort: "연령",
    // 결제 단계에서 선택된 자녀가 수업 대상 연령(출생연도)에 맞지 않을 때 진행 차단 안내.
    ageBlockedNotice: "선택한 자녀는 이 수업의 대상 연령이 아니에요. 다른 자녀를 선택해주세요.",
    allChildrenEnrolled: "모든 자녀가 이미 이 수업을 수강 중입니다.",
    noEligibleChildForAge: (ageRangeLabel: string) =>
      `이 수업을 수강 가능한 자녀가 없습니다. (수강 연령 ${ageRangeLabel})`,
    // [추가 2026-05-18] ChildSelector paid 자녀 배지 / SelectedChildDisplay 라벨
    paidBadgeLabel: "결제완료",
    studentLabel: "수강생",
    childSelectorAriaLabel: "자녀 선택",
    selectedChildAriaLabel: "선택된 수강생",
    selectedChildLoading: "수강생 정보를 불러오는 중...",
  },
  attendance: {
    ...SHARED_MESSAGES.attendance,
    todayClasses: "오늘의 수업",
    changeClass: "바꾸기",
    selectClass: "수업 선택",
    statusOngoing: "진행 중",
    statusUpcoming: "예정",
    // PR-D Hotfix #4 (v1.1): canCheckIn=false 분기 메시지
    creditRequired: "수업권이 필요해요",
    payNow: "결제하기",
    // 코치/감독 출석 관리 → QR 생성 진입 CTA
    generateQr: "QR 출석 생성하기",
  },
  qrScan: {
    title: "QR 출석 체크",
    hint: "코치의 QR 코드를 화면 중앙에 비춰주세요",
    scanning: "스캔 중...",
    permissionDeniedTitle: "카메라 권한이 필요합니다",
    permissionDeniedBody: "브라우저 설정에서 카메라 권한을 허용해주세요",
    permissionRetry: "다시 시도하기",
    notSupported:
      "이 브라우저에서는 QR 스캔이 지원되지 않습니다. 팀플러스 앱에서 이용해 주세요.",
    insecureContext: "HTTPS 환경에서만 QR 스캔이 가능합니다",
    checking: "출석 확인 중...",
    success: "출석 완료!",
    alreadyCheckedIn: "이미 출석이 완료되었습니다",
    expired: "QR 코드가 만료되었습니다. 새 코드를 요청해주세요",
    reused: "이미 사용된 QR 코드입니다. 새 코드를 스캔해주세요",
    insufficientCredit: "사용 가능한 결제권이 없습니다",
    notRegistered:
      "이 수업에 수강 등록되지 않았습니다. 수강 신청 후 이용해주세요",
    scanAgain: "다시 스캔하기",
    viewHistory: "출석 이력 보기",
    chargeCredit: "결제권 충전하기",
    cancel: "취소",
    networkError:
      "네트워크 연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요",
    networkRetry: "다시 시도하기",
    // 카메라 권한 거부 시 대체 경로 (iOS 5.1.1(iv) / AOS) — 카메라 없이도 출석 가능
    showMyQr: "내 QR 코드 보여주기",
    permissionAltHint:
      "카메라를 허용하지 않아도 내 QR 코드를 코치에게 보여주면 출석할 수 있어요.",
    // 학부모 대리 QR 출석 — 일정 카드 버튼 라벨 + 자녀 컨텍스트 안내
    parentButton: "QR 출석",
    proxyTitle: (name: string) => `${name} QR 출석`,
    proxyHint: (name: string) =>
      `${name}의 출석을 위해 코치의 QR 코드를 비춰주세요`,
  },
  grade: {
    1: "1순위",
    2: "2순위",
    3: "3순위",
    score: (score: number, percentile: number) =>
      `종합 점수 ${score}점 (상위 ${100 - percentile}%)`,
    evaluationCount: (count: number) => `총 ${count}회 평가 기준`,
  },
  verify: {
    expired: "인증시간이 만료되었습니다.",
    sent: "인증번호가 발송되었습니다.",
    success: "인증이 완료되었습니다.",
  },
  signup: {
    success: "회원가입이 완료되었습니다. 로그인해주세요.",
  },
  // [추가 2026-05-20 Phase 2] 인증 흐름 관련 표준 카피 (login/find-id/find-password 공용).
  //   clarify 원칙: "오류 발생"이라는 기술 표현 → "어려움이 있었어요" 같은 사용자 친화 톤 X
  //   대신 명확하게 "로그인 중 오류가 발생했어요"는 유지하되 "다시 시도해주세요"로 회복 경로 제시.
  auth: {
    loginError: "로그인 중 오류가 발생했어요. 다시 시도해주세요.",
    // ICETIMES 브랜드 카피 — 스플래시/로그인 비주얼 전용 (2026-06-24 ICETIMES 롤아웃)
    brand: {
      wordmark: "TEAMPLUS",
      tagline: "아이스하키 클럽 운영의 모든 것",
      footer: "ICE HOCKEY CLUB OS",
    },
    // 단일 세션 정책 — 다른 기기에서 사용 중인 계정으로 로그인 시 확인 모달
    sessionExists: {
      title: "이미 로그인된 계정이에요",
      message:
        "다른 기기에서 이 계정을 사용 중이에요.\n기존 접속을 종료하고 여기에서 로그인할까요?",
      confirm: "기존 접속 종료",
      cancel: "취소",
    },
  },
  dashboard: {
    welcome: (name: string) => `안녕하세요, ${name}`,
    greeting: {
      morning: "좋은 아침이에요.",
      afternoon: "좋은 오후예요.",
      evening: "좋은 저녁이에요.",
    },
    quotes: {
      admin:
        "효율적인 관리가 최고의 팀을 만듭니다. 오늘도 팀의 성장을 이끌어주세요!",
      director: "좋은 리더는 함께 성장합니다. 오늘도 팀의 도약을 이끌어주세요!",
      coach: "열정은 전염됩니다. 오늘도 선수들의 빛나는 성장을 응원합니다!",
      parent: "노력은 결코 배신하지 않습니다. 오늘도 자녀의 성장을 응원해요!",
      teen: "매일의 훈련이 빛나는 성장을 만듭니다. 오늘도 멋진 하루 보내세요!",
      // 2026-04-28: student 통합 대시보드 — CHILD 친근한 톤
      child: "오늘도 신나게 얼음 위로 나가볼까요? 멋진 하루를 응원해요!",
    },
    todaySchedule: "오늘의 수업 일정",
    classSchedule: "수업 일정",
    teamNotices: "공지사항",
    notices: "공지사항",
    // [수정 2026-05-12] 요일 포함 — "5월 12일(월) 수업".
    //  Date 객체 1개로 단일 진입점. 호출처 3곳(parent/coach/director home) 동시 동기화.
    dayClasses: (date: Date) => {
      const m = date.getMonth() + 1;
      const d = date.getDate();
      const w = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
      return `${m}월 ${d}일(${w}) 수업`;
    },
    // [추가 2026-05-28] 코치/감독 대시보드 전용 — "팀 일정" + "오늘의 훈련" / "M월 D일(요일) 훈련"
    teamSchedule: "팀 일정",
    dayTraining: (date: Date) => {
      const today = new Date();
      const isToday =
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate();
      if (isToday) return "오늘의 훈련";
      const m = date.getMonth() + 1;
      const d = date.getDate();
      const w = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
      return `${m}월 ${d}일(${w}) 훈련`;
    },
    myTeam: "소속 팀",
    noTeam: "소속 팀 없음",
    unspecifiedTeam: "소속 팀 미지정",
    // [추가 2026-05-21] 코치 가입 직후 'pending' 상태 안내 — 감독 승인 대기.
    pendingApprovalBadge: "승인 대기",
    pendingTeamLabel: (teamName: string) => `${teamName} (승인 대기 중)`,
    pendingApprovalHelper: "감독님 승인을 기다리고 있어요.",
    // [추가 2026-05-12] ACADEMY_DIRECTOR — 운영 단위 라벨 (Academy = 오픈클래스).
    myAcademy: "소속 오픈클래스",
    noAcademy: "소속 오픈클래스 없음",
    allChildren: (count: number) => `전체 자녀 ${count}명`,
    noSchedule: "오늘 예정된 수업이 없습니다.",
    weekSchedule: {
      title: "이번주 일정",
      pastToggleShow: (count: number) => `지난 일정 ${count}일 보기`,
      pastToggleHide: "지난 일정 접기",
      todayBadge: "오늘",
      noRemaining: "이번주 남은 일정이 없습니다.",
    },
    // 캘린더 일정 카드 코치/감독 액션 — 출석 확인 / 선수정보(팀·학원 공용 명단+결제)
    calendarAction: {
      attendance: "출석 확인",
      players: "선수정보",
    },
    pendingMembers: "승인 대기 회원",
    pendingMembersBanner: (count: number) => `${count}명이 승인 대기 중입니다`,
    quickLinks: "바로가기",
    viewAll: "전체보기",
    moreMembers: (count: number) => `대기 회원 ${count}명 더보기`,
    qrAttendance: "QR 출석 관리",
    todayStats: "오늘의 현황",
    errorTitle: "데이터를 불러올 수 없습니다.",
    errorRetry: "다시 시도하기",
    stats: {
      todayClasses: "오늘 수업",
      totalMembers: "총 담당 학생",
      attendanceRate: "출석 완료",
      attendanceToday: "오늘 출석률",
      pendingApprovals: "승인 대기",
      newMembers: "신규 회원",
      progress: "진행",
      nextClassPrefix: "다음 수업",
    },
    links: {
      classList: "수업 목록",
      trainingList: "훈련 목록",
      memberList: "학생 목록",
      scheduleManage: "일정 관리",
      coachInfo: "코치 정보",
    },
    todayRevenue: "금일 매출액",
    weeklyTrend: "주간 매출 추이",
    priorityActions: "우선 처리 항목",
    settlement: "정산 현황",
    monthlyTotal: "월간 총 수납액",
    quickActions: "빠른 작업",
    noRevenueData: "매출 데이터가 없습니다",
    pendingApprovalAlert: "신규 회원 승인 대기",
    pendingCount: (n: number) => `${n}명이 대기 중입니다`,
    todayNewMember: "오늘 신규 가입",
    newMemberCount: (n: number) => `${n}명이 가입했습니다`,
    viewDetail: "확인하러 가기",
    monthlyRevenue: "이번달 매출",
    todayAttendance: "오늘 출석",
    recentPayments: "최근 결제 내역",
    parentDashboard: {
      myChild: "자녀",
      weeklyAttendance: "이번 주 출석 현황",
      monthlyPerformance: "월간 출석 추이",
      recentPayments: "최근 결제 내역",
      creditSummary: "보유 결제권",
      creditCharge: "충전하기",
      creditLow: "해당 수업 미결제 상태입니다",
      creditExpiring: "만료 예정",
      upcomingClasses: "다가오는 수업",
      childPerformance: (name: string) => `${name} 출석 현황`,
      noChildData: "등록된 자녀가 없습니다",
      // 2026-04-27: ParentTodaySchedules 빈 상태 — "일정" 은 받침 있어 '이' 만 사용.
      noTodaySchedule: "등록된 오늘 일정이 없습니다.",
      noSelectedDateSchedule: "등록된 이 날짜의 일정이 없습니다.",
      attendanceRate: "출석률",
      creditsUsed: "사용 결제권",
      creditsRemaining: "잔여 결제권",
      totalClasses: "총 수업",
      attendedClasses: "출석 수업",
      last6Months: "최근 6개월",
      performanceData: "성과 데이터가 없습니다",
    },
    adminDashboard: {
      console: "관리자 콘솔",
      todayRevenue: "금일 매출액",
      monthlyRevenueTrend: "월간 매출 추이",
      weeklyRevenueTrend: "주간 매출 추이",
      operationalMetrics: "주요 운영 지표",
      totalMembers: "전체 회원",
      monthlyRevenue: "이번 달 매출",
      todayAttendance: "오늘 출석",
      pendingItems: "대기 처리",
      goToCheck: "확인하러 가기",
      recentTransactions: "최근 결제 및 주문",
      payments: "결제 내역",
      orders: "주문 내역",
      settlementStatus: "정산 현황 (월간)",
      monthlyTotal: "월간 총 수납액",
      goalAchievement: "목표 달성률",
      urgentNotice: "긴급 공지사항",
      pushNotification: "푸시 알림 발송하기",
      monthlyPerformance: "월간 성과 보고",
      comparedToLastMonth: "지난달 대비",
      goalAchieved: "목표 달성",
      last7Days: "최근 7일",
    },
  },
  coach: {
    todoTitle: "할 일 목록",
    nextClassTitle: "다음수업",
    studentList: "참석 학생 명단",
    moreStudents: (n: number) => `외 ${n}명 더보기`,
    writeLog: "수업일지 작성",
    requestEquipment: "교구 신청",
    scheduleTitle: "전체 수업 일정",
    shortcuts: "바로가기",
    currentClass: "현재 진행 중 수업",
    checkAttendance: "출석 관리",
    noPendingMembers: "승인 대기 중인 회원이 없습니다",
    allMemberManage: "전체 회원 관리",
    registerDescription:
      "코치 정보와 로그인 아이디·비밀번호를 입력해 계정을 생성하세요.",
    editDescription: "코치의 정보를 수정하고 저장하세요.",
    // 코치 계정 생성 완료 — 감독이 아이디/비밀번호를 코치에게 직접 전달.
    created: {
      title: "코치 계정이 생성되었습니다",
      guide:
        "아래 아이디와 비밀번호를 코치에게 전달해주세요. 코치는 이 정보로 로그인할 수 있습니다.",
      idLabel: "아이디",
      pwLabel: "비밀번호",
      changePwNotice:
        "보안을 위해 첫 로그인 후 비밀번호를 변경하도록 안내해주세요.",
      copy: "아이디·비밀번호 복사",
      copied: "복사되었습니다.",
      share: "카카오로 전달하기",
      shareText: (id: string, pw: string) =>
        `[TEAMPLUS 코치 로그인 정보]\n아이디: ${id}\n비밀번호: ${pw}\n\n첫 로그인 후 비밀번호를 변경해주세요.`,
      goList: "코치 목록으로",
    },
    // [추가 2026-05-20 Phase 2] 코치 장비 점검(equipment inspection) 등록 검증 & 사진 업로드.
    //   clarify: 단순 "X해주세요" → 상황 맥락 동반 ("모든 항목의 이름").
    equipment: {
      teamRequired: "점검할 팀을 먼저 선택해주세요.",
      itemNameRequired: "모든 항목의 이름을 입력해주세요.",
      fileSizeExceed:
        "사진 크기는 10MB 이하만 업로드할 수 있어요.",
      imageOnly: "사진 파일만 업로드할 수 있어요.",
    },
    // 스태프 상세 역할 배지 — User.userType(대문자 enum) → 한글 라벨.
    roleBadge: {
      COACH: "코치",
      DIRECTOR: "감독",
      ACADEMY_DIRECTOR: "오픈클래스 감독",
      ADMIN: "관리자",
    } as Record<string, string>,
  },
  // 스태프(코치·감독) 경력/약력 — staff_careers 연동. 자격증은 별도 필드 미사용,
  //   주요 활동(description) 자유 서술에 통합(A안).
  career: {
    sectionTitle: "약력",
    addButton: "약력 추가",
    addEmptyCta: "약력 추가하기",
    emptyText: "등록된 약력이 없습니다.",
    current: "현재",
    editAction: "약력 수정",
    deleteAction: "약력 삭제",
    formCreateTitle: "약력 추가",
    formEditTitle: "약력 수정",
    bioLabel: "약력",
    bioPlaceholder:
      "소속·경력·자격·수상 내역을 자유롭게 작성해주세요.",
    organizationLabel: "소속 기관",
    organizationPlaceholder: "예: 서울 아이스하키 클럽",
    roleLabel: "직책",
    rolePlaceholder: "직책을 선택하세요",
    startDateLabel: "시작일",
    endDateLabel: "종료일",
    isCurrentLabel: "현재 재직 중",
    leagueLabel: "리그명",
    leaguePlaceholder: "예: 대한아이스하키협회",
    descriptionLabel: "주요 활동·수상·자격",
    descriptionPlaceholder:
      "주요 활동, 수상 경력, 보유 자격증 등을 자유롭게 입력해주세요.",
    deleteConfirmTitle: "약력을 삭제하시겠습니까?",
    deleteConfirmDescription: "삭제한 약력은 복구할 수 없습니다.",
    created: "약력이 등록되었습니다.",
    updated: "약력이 수정되었습니다.",
    deleted: "약력이 삭제되었습니다.",
    permissionDenied: "이 약력을 관리할 권한이 없습니다.",
    validation: {
      organizationRequired: "소속 기관을 입력해주세요.",
      roleRequired: "직책을 선택해주세요.",
      startDateRequired: "시작일을 입력해주세요.",
      dateRange: "종료일은 시작일 이후여야 합니다.",
      descriptionRequired: "약력을 입력해주세요.",
    },
    // 스태프 직책 enum(8종) → 한글 라벨. 백엔드 CreateStaffCareerDto STAFF_ROLES 와 1:1.
    roles: {
      head_coach: "헤드코치",
      assistant_coach: "코치",
      goalie_coach: "골리코치",
      director: "감독",
      manager: "매니저",
      trainer: "트레이너",
      referee: "심판",
      analyst: "분석관",
    } as Record<string, string>,
  },
  director: {
    notificationSent: "참가자에게 알림이 발송되었습니다.",
    viewHistory: "내역 보기",
    viewAllHistory: "승인/거절 내역 전체 보기",
    editSchedule: "일정 수정하기",
    sendParticipantNotify: "참가자 알림 발송",
    deleteSchedule: "일정 삭제하기",
    coachClassStatus: "코치별 수업 현황",
    upcomingEvents: "다가오는 주요 일정",
    // [추가 2026-05-20 Phase 2] 레벨 승인/거절 처리 실패 — clarify: 기술 용어 배제, 행동 유도.
    approvalError:
      "승인 처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.",
  },
  feedback: {
    submitted: "피드백이 접수되었습니다.",
    thanks: "소중한 의견 감사합니다. 더 나은 서비스를 위해 반영하겠습니다.",
    submitError: "제출 중 오류가 발생했습니다. 다시 시도해주세요.",
    contentRequired: "내용을 입력해주세요.",
    titleRequired: "제목을 입력해주세요.",
    teamRequired: "대상 팀을 선택해주세요.",
    newFeedback: "새 피드백 보내기",
    submitting: "제출 중...",
    sendFeedback: "피드백 보내기",
  },
  accessibility: {
    pageTitle: "접근성 설정",
    pageDescription: "더 편하게 이용하실 수 있도록 설정을 조절하세요.",

    // 글자 크기
    fontSizeSection: "글자 크기",
    fontSizeDescription: "본문과 버튼의 글자 크기를 조절합니다.",
    fontSizeSmall: "작게",
    fontSizeNormal: "기본",
    fontSizeLarge: "크게",
    fontSizeExtraLarge: "매우 크게",
    fontSizePreview: "미리보기: 오늘의 수업을 확인하세요.",

    // 고대비
    highContrastSection: "고대비 모드",
    highContrastDescription: "배경과 글자의 대비를 높여 읽기 편하게 합니다.",
    highContrastOn: "사용",
    highContrastOff: "사용 안 함",

    // 애니메이션 감소
    reducedMotionSection: "애니메이션 감소",
    reducedMotionDescription:
      "화면 전환과 움직임을 최소화합니다. (기기 설정과 연동)",
    reducedMotionOn: "감소",
    reducedMotionOff: "기본",
    reducedMotionSystemNote:
      '기기에서 \"동작 줄이기\"를 켜 놓은 경우 자동 적용됩니다.',

    // 스크린 리더 힌트
    screenReaderHintsSection: "스크린 리더 힌트",
    screenReaderHintsDescription: "포커스된 요소의 음성 안내를 강화합니다.",
    screenReaderHintsOn: "켜기",
    screenReaderHintsOff: "끄기",

    // 공통
    resetAll: "기본값으로 되돌리기",
    resetConfirm: "모든 접근성 설정을 기본값으로 되돌릴까요?",
    resetSuccess: "접근성 설정이 기본값으로 복원되었습니다.",
    saved: "설정이 저장되었습니다.",
    tip: "설정한 내용은 이 기기에서 자동으로 기억됩니다.",
  },
  shop: {
    addedToCart: (name: string) =>
      `'${name}' 상품이 장바구니에 추가되었습니다.`,
    addedMultipleToCart: (count: number) =>
      `${count}개의 상품이 장바구니에 추가되었습니다.`,
    noCartItems: "장바구니에 추가할 수 있는 상품이 없습니다.",
    emptyCart: "장바구니가 비어있습니다",
    emptyWishlist: "찜한 상품이 없습니다",
    emptyOrders: "주문 내역이 없습니다",
    goShopping: "쇼핑하러 가기",
    browseProducts: "상품 둘러보기",
    wishlistHint: "마음에 드는 상품을 찜해보세요",
    outOfStock: "품절",
  },
  payment2: {
    completed: "결제가 완료되었습니다!",
    // [수정 2026-05-18] 감성 톤 — 결제 완료 화면 분위기. "결제권" 어색함 해소.
    creditIssued: (n: number) => `이제 수업 ${n}회를 이용하실 수 있어요`,
    processing: "처리 중...",
    securePayment: "안전하게 암호화되어 처리되었습니다",
    classLabel: "수업",
    // [추가 2026-06-09] App Store 3.1.1 — 결제권은 디지털 콘텐츠/화폐가 아닌 '오프라인 대면 수업 수강료 결제 수단'임을 명시(심사 오인 방지)
    offlineCreditNotice:
      "본 결제권은 오프라인 빙상 아이스하키 수업의 수업료 결제 수단이며, 수업 당일 현장 QR 출석 시 차감됩니다.",
    // [추가 2026-05-18] 결제 완료 페이지 — 신규 결제 금액 카드 + 결제 상세 항목 정리
    totalAmountLabel: "최종 결제 금액",
    orderNumberLabel: "주문번호",
    installmentLabel: "할부",
    paymentMethodLabel: "결제 수단",
    paymentDateLabel: "결제 일시",
    /**
     * [추가 2026-05-18] PG SDK enum(card·easy·vbank·trans·phone·toss) → 한글 라벨 매핑.
     *
     *  공통코드화는 PG 스펙 종속·위젯 위임 구조 때문에 부적합 — 단순 정적 매핑이 정답.
     *
     *  ⚠️ 단일 진실은 백엔드:
     *      teamplus-backend/src/payments/constants/payment-method.constant.ts (PAYMENT_METHODS)
     *
     *  본 객체는 라벨 미러링이며, 백엔드 상수 label 필드와 동기화 의무가 있다.
     *  (모노레포 @shared/ 통합은 별도 작업으로 검토 — 빌드 설정 영향 검증 필요)
     *
     *  신규 결제수단 추가 시: 백엔드 PAYMENT_METHODS 추가 → 본 객체에도 동일 키/라벨 추가.
     */
    paymentMethodMap: {
      card: "신용카드",
      easy: "간편결제",
      vbank: "가상계좌",
      trans: "계좌이체",
      phone: "휴대폰 결제",
      toss: "토스페이먼츠",
    } as Record<string, string>,
    noSearchResult: "검색 결과가 없습니다",
    tryOtherKeyword: "다른 검색어로 시도해보세요",
    noRegisteredStudent: "등록된 수강생이 없습니다.",
    termsRequired: "구매 조건 및 이용약관에 동의합니다",
    refundPolicy: "본 상품은 환불 규정에 따라 환불이 가능합니다.",
    viewRefundPolicy: "환불 규정 보기",
    historyNote: "결제 내역은 최근 1년까지 조회 가능합니다.",
    usageNote: "사용 내역은 최근 1년까지 조회 가능합니다.",
    creditRecovered: "결제권 복구됨",
    emptyPaymentHistory: "결제 내역이 없습니다",
    emptyUsageHistory: "사용 내역이 없습니다",
    paymentHistoryHint: "아직 결제 내역이 없어요. 결제권을 충전해보세요!",
    usageHistoryHint: "아직 사용 내역이 없어요. 수업에 출석해보세요!",
    dataLoadError: "데이터를 불러올 수 없습니다",
    feeType: {
      monthlyFixed: "정기권",
      perSession: "횟수제",
      perGame: "경기당",
    },
    feeDescription: {
      // PACKAGE_WEEKS_SPEC §3 — 정기권 표기.
      //   weeks 인자 누락 시 4주 폴백 (구 데이터 호환). 단위는 "X주 정기권 · 주 N회".
      monthlyFixed: (
        sessionsPerWeek: number,
        _feePerSession: number,
        weeks: number = 4,
      ) => `${weeks}주 정기권 · 주 ${sessionsPerWeek}회`,
      perSession: "실제 출석 횟수 기반 정산",
      perGame: "경기 수 기반 정산",
    },
    pricePerMonth: "원 / 월",
    pricePerSession: "원 / 회",
    pricePerGame: "원 / 경기",
    previewLoadError: "금액 정보를 불러올 수 없습니다",
    calculatedAmount: "계산된 금액",
    refundContactInfo: "고객센터를 통해 환불 요청이 가능합니다.",
    // A-5 결제 방식 카드(PaymentOptionCard) 전용 문구
    card: {
      // 카드 상단 배지
      badge: {
        monthlyFixed: "정기권",
        perSession: "횟수제",
        perGame: "경기당",
      },
      // 카드 제목 — PaymentOptionCard 는 ClassProduct.productName 을 우선 사용하고,
      // productName 이 비었을 때만 아래 폴백 카피를 노출한다.
      title: {
        monthlyFixed: "정기권",
        perSession: "1회권",
        perGame: "경기당",
      },
      // 카드 설명 (한 줄) — PaymentOptionCard 는 ClassProduct.description 을 우선 사용하고,
      // description 이 비었을 때만 아래 폴백 카피를 노출한다.
      summary: {
        monthlyFixed: "정해진 주 수 동안 정기적으로 수업합니다.",
        perSession: "수업 1회 참여권을 선결제합니다.",
        perGame: "참가 경기 수 기준으로 정산됩니다.",
      },
      // 계산식 표시 — PACKAGE_WEEKS_SPEC §3 정합.
      //   학부모 목록 카드와 동일 표기로 통일 (X주 정기권 · 주 N회 · 회당 OO원).
      //   weeks 미지정 시 4주 폴백 (구 데이터 호환).
      formula: {
        monthlyFixed: (
          weeklyCount: number,
          pricePerUnit: number,
          weeks: number = 4,
        ) =>
          `${weeks}주 정기권 · 주 ${weeklyCount}회 · 회당 ${new Intl.NumberFormat("ko-KR").format(pricePerUnit)}원`,
        perSession: (totalSessions: number, pricePerUnit: number) =>
          `${totalSessions}회 × ${new Intl.NumberFormat("ko-KR").format(pricePerUnit)}원`,
        perGame: (gameCount: number, pricePerUnit: number) =>
          `${gameCount}경기 × ${new Intl.NumberFormat("ko-KR").format(pricePerUnit)}원`,
      },
      // 최종 금액 라벨
      totalLabel: {
        monthlyFixed: "정기권 결제 금액",
        perSession: "총 결제 금액",
        perGame: "총 참가비",
      },
      // 필수 필드 누락 시 안내
      missingInfo: "결제 정보를 불러올 수 없습니다.",
    },
    // ─── [추가 2026-05-20 Phase 2] 결제 흐름 표준 토스트/배너 카피 ───
    //   토스/KG이니시스 분기 공용. clarify 원칙: 기술 용어("위젯 초기화") 배제 + 행동 유도("다시 시도해주세요").
    //   설명은 사용자 입장 — "왜 실패했는지"보다 "지금 어떻게 하면 되는지"에 초점.
    confirmFailed:
      "결제 승인이 완료되지 않았어요. 잠시 후 다시 시도해주세요.",
    initFailed:
      "결제 화면을 불러올 수 없어요. 잠시 후 다시 시도해주세요.",
    widgetInitFailed:
      "결제 위젯을 불러올 수 없어요. 새로고침 후 다시 시도해주세요.",
    requestFailed:
      "결제 요청에 실패했어요. 잠시 후 다시 시도해주세요.",
    loadError:
      "결제 내역을 가져오지 못했어요. 새로고침 후 다시 시도해주세요.",
    usageLoadError:
      "사용 내역을 가져오지 못했어요. 새로고침 후 다시 시도해주세요.",
    cancelFailed:
      "결제 취소에 실패했어요. 잠시 후 다시 시도해주세요.",
    cancelSuccess: "결제가 취소되었습니다.",
  },
  notification: {
    settingsReset: "알림 설정을 초기화하시겠습니까?",
    deviceSettingsHint:
      "앱 알림을 받으려면 기기 설정에서도 알림을 허용해야 합니다. 기기 설정 > 알림 > 팀플러스에서 확인하세요.",
  },
  /**
   * 팀 멤버 푸시 발송 (코치/감독 → 팀 회원) — MemberPushComposer 전용.
   * 백엔드 계약: POST /notifications/team/:teamId/push.
   */
  memberPush: {
    entryAction: "발송",
    pageTitle: "알림 발송",
    // 진입 안내
    description: "팀 회원에게 푸시 알림을 발송합니다.",
    // 팀 선택
    teamSectionTitle: "발송 팀",
    teamPlaceholder: "발송할 팀을 선택해주세요.",
    teamLoadError: "팀 정보를 불러올 수 없습니다.",
    noTeam: "관리 중인 팀이 없습니다.",
    // 대상 선택
    recipientSectionTitle: "받는 사람",
    recipientSearchPlaceholder: "이름으로 검색",
    recipientLoadError: "발송 대상을 불러올 수 없습니다.",
    recipientEmpty: "발송 가능한 대상이 없습니다.",
    recipientSearchEmpty: "검색 결과가 없습니다.",
    selectAll: "전체 선택",
    deselectAll: "전체 해제",
    selectedCount: (n: number) => `${n}명 선택됨`,
    groupMembers: "선수",
    groupParents: "학부모",
    groupManagers: "감독·코치",
    // 메시지 입력
    messageSectionTitle: "메시지",
    titleLabel: "제목",
    titlePlaceholder: "알림 제목을 입력해주세요.",
    messageLabel: "내용",
    messagePlaceholder: "알림 내용을 입력해주세요.",
    charCount: (current: number, max: number) => `${current}/${max}`,
    // 발송 버튼
    sendAction: "발송하기",
    sending: "발송 중...",
    // 검증
    teamRequired: "발송할 팀을 선택해주세요.",
    recipientRequired: "받는 사람을 1명 이상 선택해주세요.",
    recipientTooMany: "한 번에 최대 200명까지 발송할 수 있어요.",
    titleRequired: "알림 제목을 입력해주세요.",
    messageRequired: "알림 내용을 입력해주세요.",
    // 결과
    sendSuccess: (n: number) => `${n}명에게 알림을 발송했습니다.`,
    sendError: "알림 발송 중 오류가 발생했습니다.",
    forbidden: "이 팀에 알림을 발송할 권한이 없습니다.",
  },
  attendance2: {
    emptyHistory: "출석 내역이 없습니다.",
    successTitle: "출석 완료!",
    successMessage: "오늘도 열심히 연습해요",
    goHome: "홈으로 돌아가기",
    noUnpaid: "미수금이 없습니다",
    featureComingSoon: (name: string) => `${name} 기능 준비 중입니다.`,
    comingSoonSub: "빠른 시일 내 제공될 예정입니다.",
  },
  director2: {
    sendNotice: "공지 발송하기",
    sending: "발송 중...",
    sentHistory: "발송 내역",
    composeNotice: "공지 작성하기",
    // 미수금 탭 — 미납 안내 발송 / 상세 보기
    remindSuccess: (n: number) => `보호자 ${n}명에게 미납 안내를 발송했습니다.`,
    remindCooldown: "최근에 이미 발송했습니다. 24시간 후 다시 시도해주세요.",
    remindNoParent: "연결된 보호자가 없어 발송하지 못했습니다.",
    remindFailed: "미납 안내 발송에 실패했습니다.",
    unpaidDetailFailed: "미수금 상세 정보를 불러오지 못했습니다.",
  },
  socialLogin: {
    preparing: (provider: string) => `${provider} 로그인은 준비 중입니다.`,
    failed: (provider: string) =>
      `${provider} 로그인에 실패했습니다. 다시 시도해주세요.`,
    sdkLoadFailed: (provider: string) =>
      `${provider} SDK를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.`,
    cancelled: "소셜 로그인이 취소되었습니다.",
    networkError: "네트워크 연결을 확인 후 다시 시도해주세요.",
  },
  awards: {
    created: "수상 이력이 등록되었습니다.",
    updated: "수상 이력이 수정되었습니다.",
    deleted: "수상 이력이 삭제되었습니다.",
    deleteConfirm: "이 수상 이력을 삭제하시겠습니까?",
    nameRequired: "수상명을 입력해주세요.",
    typeRequired: "수상 유형을 선택해주세요.",
    dateRequired: "수상일을 선택해주세요.",
    childRequired: "자녀를 선택해주세요.",
    createError: "수상 이력 등록 중 오류가 발생했습니다.",
    updateError: "수상 이력 수정 중 오류가 발생했습니다.",
    deleteError: "수상 이력 삭제 중 오류가 발생했습니다.",
    loadError: "수상 이력을 불러올 수 없습니다.",
    noAwards: "아직 등록된 수상 이력이 없습니다.",
    addFirst: "아래 버튼을 눌러 첫 수상 이력을 등록해보세요.",
    selectChild: "수상 이력을 확인할 자녀를 선택해주세요.",
    titleList: "수상 이력",
    titleCreate: "수상 이력 등록",
    titleEdit: "수상 이력 수정",
    titleByChild: (name: string) => `${name}의 수상 이력`,
    labelAwardName: "수상명",
    labelAwardType: "수상 유형",
    labelAwardedAt: "수상일",
    labelDescription: "수상 설명",
    labelAwardedBy: "수여 기관",
    labelSeason: "시즌",
    labelCertificate: "상장(PDF/이미지)",
    labelImage: "수상 사진",
    labelChild: "수상 자녀",
    placeholderAwardName: "예: 시즌 MVP, 최우수 선수상",
    placeholderDescription: "수상 내용이나 소감을 자유롭게 기록해주세요.",
    placeholderAwardedBy: "예: 한국아이스하키협회",
    placeholderSeason: "예: 2025-2026",
    uploadingImage: "이미지 업로드 중...",
    uploadingCertificate: "상장 업로드 중...",
    uploadImageError: "이미지 업로드에 실패했습니다.",
    uploadCertError: "상장 업로드에 실패했습니다.",
    removeImage: "이미지 삭제",
    removeCertificate: "상장 삭제",
    needTeamMembership: "등록하려면 자녀가 팀에 가입되어 있어야 합니다.",
    noChildren: "등록된 자녀가 없습니다. 먼저 자녀를 등록해주세요.",
    countLabel: (n: number) => `${n}건`,
    typeLabel: {
      mvp: "MVP",
      best_scorer: "득점왕",
      best_goalie: "베스트 골리",
      most_improved: "가장 발전한 선수",
      sportsmanship: "스포츠맨십",
      skill: "기술상",
      attendance: "개근상",
      special: "특별상",
    } as Record<string, string>,
  },
  calendar: {
    title: "통합 캘린더",
    training: "정규훈련",
    lesson: "개인 레슨",
    tournament: "대회",
    noEvents: "이 날짜에 예정된 일정이 없습니다.",
    loadError: "캘린더 데이터를 불러올 수 없습니다.",
    eventCount: (count: number) => `일정 ${count}건`,
    historyTitle: "연간 훈련 이력",
    historyDescription: "월별 수업 출석 · 결제권 사용 기록",
    historyEmpty: "해당 연도에 기록된 수업 이력이 없습니다.",
    historyTotal: "연간 총계",
    historyClass: "수업",
    historyTournament: "대회",
    historyAttended: "출석",
    historyAbsent: "결석",
    historyLate: "지각",
    historyCreditUsed: "결제권 사용",
    historyMonthLabel: (m: number) => `${m}월`,
    historyCount: (n: number) => `${n}회`,
    historyPrevYear: "이전 해",
    historyNextYear: "다음 해",
    historyThisYear: "올해로 이동",
    historyYearLabel: (y: number) => `${y}년`,
    // 총계 타일 라벨 — 올해면 "올해 출석", 과거 연도면 "2025년 출석"
    historyAttendanceLabel: (y: number, isCurrent: boolean) =>
      isCurrent ? '올해 출석' : `${y}년 출석`,
    historyMonthEmpty: "이 달에는 수업 이력이 없습니다.",
    historyLoadError: "수업 이력을 불러올 수 없습니다.",
    historyStatus: {
      present: "출석",
      absent: "결석",
      late: "지각",
      cancelled: "취소",
    } as Record<string, string>,
  },
  childAttendance: {
    quickActionLabel: "출석 현황",
    quickActionSub: "이번 달 출석 · 연간 이력",
    quickActionTeamLabel: "팀 정보",
    pageTitle: (name: string) => `${name} 출석 현황`,
    yearTotal: (n: number) => `올해 ${n}회`,
    monthTotal: (n: number) => `이번 달 ${n}회`,
    yearAndMonth: (year: number, month: number) =>
      `올해 ${year}회 · 이번 달 ${month}회`,
    yearLabel: "올해 출석",
    monthLabel: "이번 달 출석",
    byClassTitle: "수업별 출석 (올해)",
    byClassCount: (name: string, n: number) => `${name} ${n}회`,
    monthListTitle: (m: number) => `${m}월 출석`,
    prevMonthHint: "이번 달은 기록이 없어 직전 달을 보여드려요",
    emptyThisMonth: "이번 달은 아직 출석 기록이 없어요",
    viewYearHistory: "연간 전체 이력 보기",
  },
  notice: {
    created: "공지사항이 등록되었습니다.",
    updated: "공지사항이 수정되었습니다.",
    deleted: "공지사항이 삭제되었습니다.",
    deleteConfirm: "정말 이 공지를 삭제하시겠습니까?",
    deleteConfirmDesc: "삭제한 공지는 복구할 수 없습니다.",
    manage: "공지 관리",
    manageMenuOpen: "공지 관리 메뉴 열기",
    targetAll: "전체",
    targetParent: "학부모",
    targetCoach: "코치",
    gradeFilter: "학년별",
    gradeAll: "전체 학년",
    gradeU6: "U6 (5~6세)",
    gradeU9: "U9 (7~9세)",
    gradeU12: "U12 (10~12세)",
    gradeU15: "U15 (13~15세)",
    gradeU18: "U18 (16~18세)",
    gradeCustom: "직접 설정",
    birthYearFrom: "출생연도 시작",
    birthYearTo: "출생연도 종료",
    targetGradeLabel: "대상 학년",
    targetGradeHint:
      "특정 학년 대상으로 공지를 보내면 해당 연령 자녀를 둔 학부모에게만 노출됩니다.",
    noTargetGrade: "학년 제한 없음",
    ageGroup: {
      sectionLabel: "대상 학년 (선택 시 해당 연령 자녀 보유 학부모에게만 노출)",
      allGradesHint: "선택하지 않으면 전체 학년에 노출됩니다.",
      U6: "U6 (5세)",
      U7: "U7 (6세)",
      U8: "U8 (초1)",
      U9: "U9 (초2)",
      U10: "U10 (초3)",
      U11: "U11 (초4)",
      U12: "U12 (초5)",
      previewPrefix: "대상 출생연도",
      previewAll: "전체",
    },
    badge: {
      notice: "공지",
      event: "이벤트",
      important: "중요",
      promotion: "홍보",
      expired: "(종료)",
    },
    eventStatus: {
      active: "진행중인 이벤트",
      member_only: "회원 전용",
      ended: "종료된 이벤트",
    },
    allChecked: "모든 공지사항을 확인했습니다",
    list: {
      loadMore: (current: number, total: number) =>
        `더보기 (${current}/${total})`,
      loadMoreShort: "더보기",
      loadMoreAriaLabel: "공지 더보기",
      loadingMore: "불러오는 중...",
      allLoaded: "모든 공지를 확인했습니다",
      loadMoreError:
        "공지를 더 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
    },
  },
  coachInvitation: {
    invited: "코치 초대가 발송되었습니다.",
    accepted: "초대를 수락했습니다.",
    declined: "초대를 거절했습니다.",
    removed: "코치가 제거되었습니다.",
    fulfilled: "필요 코치 인원이 충족되었습니다.",
    alreadyInvited: "이미 초대된 코치입니다.",
    selectCoach: "초대할 코치를 선택해주세요.",
    noAvailable: "초대 가능한 코치가 없습니다.",
    declineReasonPlaceholder: "거절 사유를 입력해주세요 (선택)",
    status: {
      invited: "대기 중",
      accepted: "수락",
      declined: "거절",
      removed: "제거됨",
    },
    role: {
      lead: "메인 코치",
      assistant: "보조 코치",
    },
    summary: (accepted: number, required: number) =>
      `${accepted}/${required} 수락`,
  },
  approval: {
    approved: "승인 처리되었습니다.",
    rejected: "거절 처리되었습니다.",
    bulkResult: (success: number, failed: number): string =>
      failed > 0
        ? `${success}건 처리 완료, ${failed}건 실패`
        : `${success}건 처리 완료`,
  },
  rsvp: {
    attending: "참석 처리되었습니다.",
    declined: "불참 처리되었습니다.",
    changed: "응답이 변경되었습니다.",
    deadline: "응답 마감 시간이 지났습니다.",
    remind: "아직 응답하지 않은 일정이 있습니다.",
  },
  waitlist: {
    joined: "대기자로 등록되었습니다.",
    promoted: "대기가 해소되었습니다! 24시간 내 확인해주세요.",
    cancelled: "대기가 취소되었습니다.",
    expired: "확인 시간이 만료되었습니다.",
    position: (n: number) => `현재 ${n}번째 대기 중입니다.`,
  },
  // NOTE: 레거시 `venue:` 블록은 하단의 확장형 `venue:` 블록으로 통합됨 (2026-04-12)
  tournament: {
    created: "대회가 등록되었습니다.",
    updated: "대회 정보가 수정되었습니다.",
    deleted: "대회가 삭제되었습니다.",
    // [추가 2026-05-20 Phase 2] deleted 와 동일하지만 toast.success 용 별칭 — 의도 분리.
    deleteSuccess: "대회가 삭제되었습니다.",
    deleteConfirm: "정말 이 대회를 삭제하시겠습니까?",
    deleteHasMatches: "경기가 등록된 대회는 삭제할 수 없습니다.",
    registered: "대회 참가 신청이 완료되었습니다.",
    registerCancelled: "참가 신청이 취소되었습니다.",
    registerFailed: "참가 신청에 실패했습니다.",
    // [후불 대회] 결제 위젯 없이 참가 신청만 처리 — 종료 후 감독이 일괄 청구.
    postpaidRegistered: "대회 참가 신청이 완료되었습니다. 참가비는 대회 종료 후 청구됩니다.",
    postpaidNotice: "후불 대회입니다. 참가비는 대회 종료 후 일괄 청구됩니다.",
    postpaidApplyCta: "참가 신청하기",
    postpaidFeeLabel: "후불 정산 (종료 후 청구)",
    // [후불 대회 — 결제 방식 선택 / 정산 UI (2026-06-16)]
    billingModeLabel: "결제 방식",
    billingModePrepaid: "선불",
    billingModePostpaid: "후불",
    postpaidScheduleHint:
      "후불 대회는 종료 후 1인당 참가비를 입력해 일괄 청구합니다. 일정별 참가비 입력은 생략됩니다.",
    settleCta: "정산하기",
    settleTitle: "후불 정산",
    settleFeeLabel: "1인당 참가비",
    settleFeePlaceholder: "참가비 (원)",
    settleTargetCount: (n: number) => `정산 대상 ${n}명`,
    settleTotalLabel: "총 청구 금액",
    settleNoTarget: "정산 대상 참가자가 없습니다.",
    settleFeeRequired: "1인당 참가비를 입력해주세요.",
    settleSuccess: (count: number, total: number): string =>
      `${count}명에게 총 ${new Intl.NumberFormat("ko-KR").format(total)}원이 청구되었습니다.`,
    nameRequired: "대회명을 입력해주세요.",
    dateRequired: "대회 기간을 입력해주세요.",
    // [2026-06-16] 참가대상 = 선수 명단 선택. 최소 1명 필수.
    participantRequired: "참가할 선수를 1명 이상 선택해주세요.",
    participantSelectedCount: (n: number) => `선수 ${n}명 선택`,
    participantBirthYearUnknown: "출생연도 미상",
    participantSelectAll: "전체 선택",
    // [2026-06-16] 단일 평면 리스트 — 필터 드롭다운 '전체' 옵션 + 현재 표시 대상 기준 전체선택 카운트.
    participantFilterAll: "전체",
    participantSelectAllCount: (sel: number, total: number) =>
      `전체 선택 (${sel}/${total})`,
    participantEmpty: "선택할 수 있는 선수가 없습니다.",
    // 수정 시 팀을 이탈해 멤버 목록에 없는 선택 선수 안내.
    participantLeftTeam: "팀을 이탈한 선수입니다.",
    // [2026-06-16] 전용 선택 시트(ParticipantPickerSheet) UI 문구.
    participantPickerTitle: "참가 선수 선택",
    participantPickerOpen: "선택",
    participantPickerChange: "변경",
    participantPickerDone: (n: number) => `완료 (${n}명)`,
    participantSearchPlaceholder: "선수 이름 검색",
    participantSelectedSummary: (n: number) => `${n}명 선택됨`,
    participantTargetCount: (n: number) => `선수 ${n}명`,
    // [2026-06-16] 대회 상세 "참가 대상" 역할 분기 표기.
    //  · 감독/코치: 이름 N명 인라인 후 초과분 "외 N명" / 전체 명단 시트.
    //  · 학부모/학생: 본인 자녀 중 대상 자녀 이름만.
    participantMore: (n: number) => `외 ${n}명`,
    participantListTitle: "참가 선수",
    participantViewList: "명단 보기",
    participantNameUnknown: "선수",
    // 학부모 뷰 참가 대상 문장 — 이름 끝 받침에 따라 주격조사 이/가 자동 선택.
    participantParentNotice: (namesStr: string) => {
      const last = namesStr.trim().slice(-1);
      const code = last.charCodeAt(0);
      const hasBatchim =
        code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
      return `${namesStr}${hasBatchim ? "이" : "가"} 참가 대상이에요.`;
    },
    participantSelectPrompt: "참가할 선수를 선택하세요 (최소 1명)",
    participantSearchEmpty: "검색 결과가 없습니다.",
    participantSectionBirthYear: "출생연도",
    participantSectionGroup: "하위그룹",
    // [2026-06-16] 참가 선수 선택 시트 분류 세그먼트(전체/연도/그룹) — 선택 세그먼트의 칩만 노출.
    participantSegmentAll: "전체",
    participantSegmentYear: "연도",
    participantSegmentGroup: "그룹",
    // [2026-06-16] 대회 기간(start/end)을 경기 일정에서 자동 파생 — 일정 1건 이상 필수.
    scheduleRequired: "경기 일정을 최소 1건 등록해주세요 (날짜·시간 입력).",
    scheduleIncomplete: "경기 일정의 날짜와 시간을 모두 입력해주세요.",
    locationRequired: "장소를 입력해주세요.",
    statusChanged: "대회 상태가 변경되었습니다.",
    feePreview: (games: number, fee: number) =>
      `${games}경기 x ${new Intl.NumberFormat("ko-KR").format(fee)}원`,
    // 상태 라벨 (Tournament UI Status)
    statusLabel: {
      recruiting: "접수중",
      closing_soon: "마감 임박",
      closed: "모집 완료",
      in_progress: "진행 중",
      completed: "완료",
      cancelled: "취소",
    } as Record<string, string>,
    // 권한 관련
    viewOnlyHint: "조회만 가능합니다. 수정은 감독/코치 권한이 필요합니다.",
    endedNoEdit: "종료된 대회는 수정할 수 없습니다.",
    applyCta: "참가 신청(결제)하기",
    bracketTitle: (round: string) => `${round} 대진표`,
    // 탭 라벨
    tabs: {
      bracket: "대진표",
      ranking: "순위",
      schedule: "경기 일정",
      info: "대회 정보",
    },
  },
  common: {
    retry: "다시 시도",
    unknown: "알 수 없음",
    processing: "처리 중...",
    goBack: "돌아가기",
    loading: "불러오는 중...",
    loadFailed: "정보를 불러오지 못했습니다.",
    requiredField: "필수 항목을 모두 입력해주세요.",
    invalidDateRange: "종료일은 시작일 이후여야 합니다.",
    save: "저장하기",
    saving: "저장 중...",
    edit: "수정하기",
    cancel: "취소",
    confirm: "확인",
    close: "닫기",
    logoutConfirmTitle: "로그아웃",
    logoutConfirmMessage: "로그아웃하시겠습니까?",
    logoutConfirmButton: "로그아웃",
    // 앱 종료 확인 (Android 하드웨어 백키 → 홈 화면 — 2026-05-16)
    exitConfirmTitle: "앱을 종료하시겠습니까?",
    exitConfirmMessage: "팀플러스 앱을 완전히 종료합니다.",
    exitConfirmButton: "종료하기",
    // 기능 준비 중 안내 (attendance2.featureComingSoon 의 공통화 — 2026-05-14)
    featureComingSoon: (name: string) => `${name} 기능 준비 중입니다.`,
    // [추가 2026-05-20 Phase 2] 상태 변경 성공 — 장비 점검, 회원 상태, 결제 상태 등 도메인 공용.
    statusChanged: "상태가 변경되었습니다.",
  },
  /**
   * 설정 화면 (시안 07 적용 — 2026-04-29).
   * 5개 섹션 + 8개 메뉴 라벨 + Footer.
   */
  settings: {
    title: "설정",
    sections: {
      account: "계정",
      notification: "알림",
      display: "화면",
      security: "보안",
      privacy: "개인정보",
      legal: "약관·정책",
    },
    items: {
      profile: { label: "프로필 설정", sub: "내 정보 및 계정 관리" },
      notification: { label: "알림 설정", sub: "푸시 알림 수신 여부" },
      theme: { label: "테마 설정", sub: "다크 모드 및 화면 스타일" },
      accessibility: {
        label: "접근성 설정",
        sub: "글자 크기 · 고대비 · 애니메이션 감소",
      },
      security: { label: "보안 설정", sub: "로그인 기록 · 연결된 기기" },
      block: { label: "차단 목록", sub: "차단한 사용자 관리" },
      privacyManage: {
        label: "개인정보 관리",
        sub: "내 정보 다운로드 (PIPA §35)",
      },
      withdrawal: { label: "회원 탈퇴", sub: "계정 삭제 및 데이터 처리" },
      terms: { label: "이용약관", sub: "서비스 이용약관" },
      privacyPolicy: { label: "개인정보 처리방침", sub: "수집·이용 및 보호 정책" },
      refund: { label: "환불 규정", sub: "결제 취소 및 환불 안내" },
    },
    footer: {
      logoutInProgress: "로그아웃 중...",
      brand: "TEAMPLUS",
      versionPrefix: "v",
    },
  },
  /**
   * UI 상호작용 메시지 — Pull-to-Refresh · 빈 상태 · 기타 UX 문구.
   * 2026-04-22 신설: 6개 역할별 메인화면 공통 Pull-to-Refresh 지원 (SPEC_PULL_TO_REFRESH).
   * 기존 coach/director 에서 사용하던 MESSAGES.ui.releaseRefresh 가 런타임 undefined 이던
   * 버그를 근본 해결.
   */
  ui: {
    pullRefresh: "아래로 당겨서 새로고침",
    releaseRefresh: "놓으면 새로고침",
    refreshing: "새로고침 중...",
    cancel: "취소",
  },
  save: {
    success: "저장되었습니다.",
    fail: "저장에 실패했습니다.",
    error: "저장에 실패했습니다.",
  },
  match: {
    created: "경기가 등록되었습니다.",
    updated: "경기 정보가 수정되었습니다.",
    deleted: "경기가 삭제되었습니다.",
    deleteConfirm: "정말 이 경기를 삭제하시겠습니까?",
    titleRequired: "매치 제목을 입력해주세요.",
    scoreUpdated: "스코어가 업데이트되었습니다.",
    scoreUpdateFailed: "스코어 업데이트에 실패했습니다.",
    // 상태 라벨 (MatchStatus)
    statusLabel: {
      scheduled: "예정",
      warmup: "워밍업",
      in_progress: "진행 중",
      intermission: "피리어드 휴식",
      completed: "종료",
      postponed: "연기",
      cancelled: "취소",
    } as Record<string, string>,
    // 라운드 라벨
    roundLabel: {
      group: "조별 예선",
      quarter: "8강",
      semi: "4강",
      third: "3-4위전",
      final: "결승",
    } as Record<string, string>,
    // 피리어드 표기 헬퍼
    periodLabel: (n: number): string => {
      if (n === 4) return "OT";
      if (n === 5) return "SO";
      return `${n}P`;
    },
    // 권한 메시지
    managerOnly: "이 작업은 코치 또는 감독만 수행할 수 있습니다.",
    liveStateChanged: "경기 상태가 변경되었습니다.",
    // 픽업 매치 재디자인 (Phase 2-B)
    list: {
      title: "매치 관리",
      headerTitle: "매치 찾기",
      empty: "등록된 매치가 없습니다.",
      createFab: "매치 등록하기",
      searchPlaceholder: "장소·레벨·매치명으로 검색",
      searchAriaLabel: "검색",
      backAriaLabel: "뒤로가기",
      resetFilterAriaLabel: "필터 초기화",
      loadMoreAriaLabel: "매치 더보기",
      loadMore: (current: number, total: number) =>
        `더보기 (${current}/${total})`,
      loadingMore: "불러오는 중...",
      countLabel: (n: number) => `${n}건`,
      weekendSection: "이번 주말 매치",
      mineSection: "내가 신청한 매치",
      filters: {
        date: "날짜",
        level: "레벨",
        location: "장소",
      },
    },
    tabs: {
      active: "모집 중",
      mine: "내 신청",
      past: "지난 매치",
    },
    status: {
      recruiting: "모집 중",
      closingSoon: "마감 임박",
      closed: "모집 마감",
      cancelled: "취소됨",
    },
    form: {
      createTitle: "매치 등록",
      editTitle: "매치 수정",
      sections: {
        basic: "기본 정보",
        requirements: "모집 요건",
        description: "안내 사항",
      },
      titleField: {
        label: "매치 제목",
        placeholder: "예: 주말 오전 친선 경기",
      },
      date: { label: "일자" },
      time: { label: "시간" },
      rink: { label: "구장 선택", placeholder: "구장을 검색하세요" },
      rinkAddress: {
        label: "주소 (선택)",
        placeholder: "예: 경기도 고양시 ...",
      },
      maxParticipants: { label: "모집 인원" },
      price: { label: "참가비 (1인)" },
      level: { label: "실력 레벨 제한" },
      levelCode: {
        label: "레벨 코드",
        none: "없음",
        option: (code: string) => `Level ${code}`,
      },
      levels: {
        beginner: "입문",
        amateur: "초급",
        intermediate: "중급",
        advanced: "상급",
      },
      gender: { label: "성별" },
      description: {
        label: "안내 사항 (옵션)",
        placeholder: "주차 정보, 준비물 등 참가자에게 알릴 내용을 입력하세요.",
      },
      rules: {
        label: "경기 규칙 (줄바꿈으로 구분)",
        placeholder: "예:\n보호장비 필수\n정시 시작",
      },
      submit: {
        create: "매치 등록하기",
        update: "매치 수정하기",
        preview: "미리보기",
      },
      errors: {
        titleTooShort: "매치 제목은 3자 이상 입력해 주세요.",
        dateRequired: "일자와 시간을 입력해 주세요.",
        rinkRequired: "구장 정보를 입력해 주세요.",
        priceRange: "참가비는 0원 이상 1,000,000원 이하로 입력해 주세요.",
        participantsRange: "모집 인원은 2명 이상 30명 이하로 입력해 주세요.",
      },
    },
    detail: {
      title: "매치 상세 정보",
      tabs: { info: "경기 정보", roster: "참여 명단", venue: "장소 안내" },
      vs: "친선 경기",
      home: "Home",
      away: "Away",
      homeTeam: "홈 팀",
      awayTeam: "어웨이 팀",
      vsAriaLabel: "대결",
      rules: "경기 규칙 및 안내",
      manager: "매니저",
      managerFallback: "매니저",
      inquiry: "1:1 문의",
      apply: "매치 참가 신청하기",
      manage: "매치 관리하기",
      view: "참여 명단 보기",
      viewAll: "전체 명단 보기",
      spotsLeft: (n: number): string => `현재 ${n}자리 남았습니다`,
      closedNotice: "모집이 종료되었습니다",
      closedLabel: "모집 마감",
      loginRequired: "로그인 후 참가 신청",
      editBtn: "수정하기",
      editAriaLabel: "매치 수정",
      shareAriaLabel: "공유하기",
      openMap: "지도 앱 실행",
      parking: "주차 안내",
      refundPolicy: "취소 및 환불 규정",
      applicantsLabelAria: "매치 상세 탭",
      participantCount: (n: number) => `${n}명`,
      participantSeparator: (current: number, max: number) =>
        `${current}명 / ${max}명`,
      infoLabels: {
        price: "참가비",
        participants: "모집 인원",
        levelLimit: "레벨 제한",
      },
    },
    applicants: {
      title: "신청자 관리",
      listTitle: "매치 신청자 목록",
      anonymous: "익명",
      summary: (current: number, max: number): string =>
        `승인 현황 ${current} / ${max}명`,
      remaining: (n: number): string => `${n}명 남음`,
      pending: "대기 중",
      approved: "승인됨",
      rejected: "거절됨",
      bulkApprove: "일괄 승인",
      bulkReject: "일괄 거절",
      selectAll: "전체 선택",
      clearSelection: "선택 해제",
      selectedCount: (n: number): string => `${n}명 선택됨`,
      approveBtn: "승인",
      rejectBtn: "거절",
      recentApproved: "최근 승인됨",
      reject: {
        title: (n: number): string => (n > 1 ? `${n}명 거절` : "신청자 거절"),
        reasonLabel: "거절 사유",
        reasonPlaceholder: "거절 사유를 10자 이상 200자 이하로 입력해 주세요.",
        reasonLengthError:
          "거절 사유는 10자 이상 200자 이하로 입력해야 합니다.",
        confirm: "거절하기",
        cancel: "취소",
      },
    },
    payment: {
      title: "결제 확인",
      headerTitle: "매치 참가 신청",
      steps: { position: "포지션", payment: "결제하기", done: "완료" },
      headline: "신청하신 매치 정보를 확인해 주세요",
      selectedPosition: "선택 포지션",
      detail: "결제 상세 내역",
      basePrice: "참가비",
      discount: "할인",
      total: "총 결제 금액",
      info: "매치 시작 24시간 전까지 취소 시 100% 환불되며, 이후에는 환불이 불가합니다. 경기장 내 안전 수칙을 준수해 주세요.",
      detailMore: "자세히 보기",
      agree: "매치 이용 수칙 및 환불 규정에 동의합니다",
      payBtn: (price: number): string =>
        `${price.toLocaleString("ko-KR")}원 결제하기`,
      processing: "신청 처리 중...",
      sections: {
        matchInfo: "매치 정보",
        applicationInfo: "신청 정보",
      },
      fields: {
        location: "장소",
        schedule: "일시",
      },
      preferredPosition: "희망 포지션",
      level: {
        label: "현재 레벨 (선택)",
        none: "선택 안함",
        options: ["입문", "초급", "중급", "고급", "전문가"] as const,
      },
      note: {
        label: "요청 메모 (선택)",
        placeholder: "주최자에게 전달할 내용을 입력해주세요.",
      },
      notice: {
        title: "참가 유의사항",
        items: [
          "신청 후 주최자 승인 시 최종 참가가 확정됩니다.",
          "승인/거절 결과는 알림으로 안내됩니다.",
          "매치 시작 24시간 전까지 취소 시 100% 환불됩니다.",
          "허위 신청 시 이용이 제한될 수 있습니다.",
        ] as const,
      },
    },
    roster: {
      title: "참여 명단",
      listTitle: "매치 참여 명단",
      current: "현재 참가 인원",
      confirmed: "참가 확정",
      waiting: "대기 중",
      waitingOrder: (n: number): string => `대기 ${n}순위`,
      empty: "아직 참가 확정된 선수가 없습니다.",
      manageAriaLabel: "신청자 관리",
      countLabel: (n: number) => `${n}명`,
    },
    position: {
      title: "선호 포지션 선택",
      subtitle: "이번 매치에서 플레이할 주 포지션을 선택해 주세요.",
      forward: "포워드",
      defender: "디펜스",
      goalie: "골리",
      submit: "선택 완료 및 참가하기",
    },
    error: {
      loadFailed: "매치 정보를 불러오지 못했습니다.",
      createFailed: "매치 등록에 실패했습니다.",
      updateFailed: "매치 수정에 실패했습니다.",
      applyFailed: "참가 신청에 실패했습니다.",
      rejectFailed: "거절 처리에 실패했습니다.",
      notOwner: "본인이 등록한 매치만 수정할 수 있습니다.",
      cancelled: "이미 취소된 매치입니다.",
      actionFailed: "요청을 처리하지 못했습니다. 다시 시도해 주세요.",
    },
    success: {
      created: "매치가 등록되었습니다.",
      updated: "매치 정보가 수정되었습니다.",
      applied: "참가 신청이 완료되었습니다.",
      approved: "승인 처리되었습니다.",
      rejected: "거절 처리되었습니다.",
      bulkRejected: (n: number): string => `${n}건 거절 처리되었습니다.`,
      cancelled: "매치가 취소되었습니다.",
    },
  },
  matchEvent: {
    created: "이벤트가 기록되었습니다.",
    updated: "이벤트가 수정되었습니다.",
    deleted: "이벤트가 삭제되었습니다.",
    deleteConfirm:
      "이 이벤트를 삭제하시겠습니까? 골 이벤트는 스코어에서 자동 차감됩니다.",
    createFailed: "이벤트 기록에 실패했습니다.",
    eventTimeFormat: "이벤트 시간은 MM:SS 형식으로 입력해주세요. (예: 12:45)",
    // 이벤트 타입 라벨
    typeLabel: {
      goal: "골",
      assist: "어시스트",
      penalty: "페널티",
      shot: "슛",
      save: "세이브",
      timeout: "타임아웃",
      period_start: "피리어드 시작",
      period_end: "피리어드 종료",
    } as Record<string, string>,
    // 페널티 타입 라벨
    penaltyTypeLabel: {
      minor: "마이너",
      major: "메이저",
      misconduct: "미스컨덕트",
      game_misconduct: "게임 미스컨덕트",
    } as Record<string, string>,
  },
  training: {
    created: "훈련 세션이 등록되었습니다.",
    updated: "훈련 세션이 수정되었습니다.",
    deleted: "훈련 세션이 삭제되었습니다.",
    deleteConfirm:
      "이 훈련을 삭제하시겠습니까? 관련 일정과 출석 데이터가 함께 삭제됩니다.",
    scheduleCreated: "훈련 일정이 생성되었습니다.",
    scheduleBulkCreated: (count: number) =>
      `${count}개의 훈련 일정이 생성되었습니다.`,
    scheduleCancelled: "훈련 일정이 취소되었습니다.",
    attendanceMarked: "출석이 기록되었습니다.",
    attendanceAlready: "이미 출석 처리된 회원입니다.",
    noTrainings: "등록된 훈련이 없습니다.",
    nameRequired: "훈련 이름을 입력해주세요.",
    typeRequired: "훈련 유형을 선택해주세요.",
    coachRequired: "담당 코치를 입력해주세요.",
    capacityRequired: "최대 인원을 입력해주세요.",
    timeRequired: "훈련 시간을 입력해주세요.",
    cancelReason: "취소 사유를 입력해주세요.",
  },
  overseasTrip: {
    title: "해외 원정",
    listTitle: "원정 일정",
    detailTitle: "원정 상세",
    registrationTitle: "참가 신청",
    myTripsTitle: "내 원정",
    registered: "참가 신청이 완료되었습니다.",
    registerFailed: "참가 신청에 실패했습니다.",
    cancelled: "참가 신청이 취소되었습니다.",
    cancelConfirm: "정말 참가 신청을 취소하시겠습니까?",
    cancelFailed: "참가 취소에 실패했습니다.",
    depositPaid: "예치금 납부가 완료되었습니다.",
    alreadyRegistered: "이미 참가 신청이 완료되었습니다.",
    deadlinePassed: "참가 등록 마감일이 지났습니다.",
    notOpen: "현재 참가 등록을 받지 않는 원정입니다.",
    noTrips: "등록된 원정이 없습니다.",
    noMyTrips: "참가 신청한 원정이 없습니다.",
    status: {
      draft: "준비중",
      open: "모집중",
      closed: "모집마감",
      ongoing: "진행중",
      completed: "완료",
      cancelled: "취소",
    },
    registrationStatus: {
      pending: "대기",
      confirmed: "확정",
      deposit_paid: "예치금 완료",
      cancelled: "취소",
      waitlisted: "대기목록",
    },
    participants: "참가 인원",
    estimatedCost: "예상 비용",
    depositAmount: "예치금",
    registrationDeadline: "등록 마감일",
    depositDeadline: "예치금 마감일",
    flightInfo: "항공 정보",
    hotelInfo: "숙소 정보",
    transportInfo: "현지 교통",
    itinerary: "상세 일정",
    emergencyContact: "비상 연락처",
    specialRequirements: "특이사항",
    passportVerified: "여권 확인",
    ageGroup: "대상 연령대",
  },
  withdrawal: {
    title: "회원 탈퇴",
    pageTitle: "회원 탈퇴 신청",
    noticeTitle: "회원 탈퇴 시 유의사항",
    gracePeriod:
      "탈퇴 신청 후 7일간의 유예 기간이 있으며, 유예 기간 내 로그인하면 탈퇴가 취소됩니다.",
    dataDelete:
      "개인정보는 비식별화 처리되며, 결제 기록은 관련 법률에 따라 5년간 보관됩니다.",
    creditExpire:
      "보유 중인 잔여 결제권은 탈퇴 확정 시 전액 소멸되며, 복구할 수 없습니다.",
    reasonTitle: "탈퇴 사유를 선택해주세요",
    reasons: {
      inconvenient: "서비스 이용이 불편해서",
      notUsing: "더 이상 사용하지 않아서",
      privacy: "개인정보 보호를 위해",
      other: "기타",
    },
    passwordTitle: "본인 확인",
    passwordPlaceholder: "현재 비밀번호를 입력해주세요",
    passwordRequired: "비밀번호를 입력해주세요.",
    reasonRequired: "탈퇴 사유를 선택해주세요.",
    confirmTitle: "정말 탈퇴하시겠습니까?",
    confirmMessage:
      "탈퇴 신청 후 7일 이내에 로그인하지 않으면 계정이 영구 삭제됩니다.",
    confirmButton: "탈퇴하기",
    cancelButton: "취소",
    completeTitle: "탈퇴 신청이 완료되었습니다",
    completeMessage:
      "7일간의 유예 기간이 적용됩니다. 유예 기간 내 로그인하시면 탈퇴가 취소됩니다.",
    submitError: "탈퇴 처리 중 오류가 발생했습니다. 다시 시도해주세요.",
    submitting: "처리 중...",
    agreeLabel: "위 내용을 모두 확인했으며, 회원 탈퇴에 동의합니다.",
    agreeRequired: "유의사항에 동의해주세요.",
    socialTitle: "본인 확인",
    socialGuide:
      "소셜 로그인으로 가입한 계정은 비밀번호가 없습니다. 아래에 '탈퇴합니다'를 입력해주세요.",
    socialPlaceholder: "탈퇴합니다",
    socialKeyword: "탈퇴합니다",
    socialRequired: "'탈퇴합니다'를 정확히 입력해주세요.",
    socialToggle: "소셜 로그인으로 가입해 비밀번호가 없으신가요?",
    completeConfirm: "확인",
    next: "다음",
    prev: "이전",
  },
  search: {
    classPlaceholder: "수업명, 강사, 종목으로 검색",
    classAriaLabel: "수업 검색",
    clear: "검색어 지우기",
    noResults: "검색 결과가 없습니다",
    noResultsDescription: (query: string) =>
      `"${query}"에 해당하는 수업을 찾을 수 없어요`,
  },
  // [추가 2026-05-20 Phase 2] 학부모 흐름 표준 카피.
  //   clarify: 안전 동의는 "모두 체크 필요" 표현보다 "동의해주세요"가 더 자연스러움.
  parent: {
    overseasConsent: "해외원정 안전 동의 3개 항목에 모두 동의해주세요.",
  },
  // [추가 2026-05-20 Phase 2] 자녀(child) 등록·권한 관련 표준 카피.
  //   clarify: WCAG AAA 대상이 아닌 학부모 화면에서 사용되는 메시지지만 (자녀를 "추가하는" 학부모 화면)
  //   톤은 친근한 존댓말 유지. 법적 표현("법정대리인")은 정확성을 위해 보존.
  child: {
    photoPermission:
      "사진 접근 권한이 거부되었어요. 설정에서 허용해주세요.",
    guardianConsent:
      "법정대리인 동의가 필요해요. 동의 항목을 모두 확인해주세요.",
    deleteSuccess: "선수 정보가 삭제되었습니다.",
    deleteError: "선수 삭제 중 오류가 발생했습니다.",
  },
  team: {
    // 로고 권리 고지 (iOS 5.2 / AOS #9888072 — 약관 제19조5항 보조 인앱 고지)
    logoRightsNotice:
      "등록하는 팀 로고·엠블럼은 타인의 상표·저작권을 침해하지 않으며 사용 권리를 보유한 이미지여야 합니다.",
    // 기본 CRUD
    createSuccess: "팀이 등록되었습니다.",
    updateSuccess: "팀 정보가 수정되었습니다.",
    deleteSuccess: "팀이 삭제되었습니다.",
    // [참고 2026-05-20 Phase 2] `nameRequired: "팀 이름을 입력해주세요."` 는 본 블록 폼 검증 섹션에
    //   이미 존재 (line ~1455) — 신규 추가 없이 기존 키 그대로 사용.
    deleteConfirm:
      "이 팀을 삭제하시겠습니까? 팀 로스터와 경기 이력은 보존됩니다.",
    loadError: "팀 정보를 불러올 수 없습니다.",
    notFound: "팀을 찾을 수 없습니다.",
    permissionDenied: "이 팀을 관리할 권한이 없습니다.",
    // [추가 2026-05-21] /team 메뉴 — managed(approved+pending) 결과 0건일 때 안내.
    //  코치가 가입 신청도 하지 않은 상태이거나, 모든 신청이 거절되어 활성/대기 팀이 없을 때.
    listEmptyForCoach: "가입한 팀이 없습니다. 회원가입 시 선택한 팀을 확인하거나 감독님께 문의해주세요.",
    // [추가 2026-05-21] pending 팀 카드 클릭 시 안내 — 조회는 허용하되 수정 권한 없음 명시.
    pendingClickHelperToast: "감독님 승인 후 팀 관리가 가능합니다. 정보 확인만 가능해요.",

    // ─── 팀 자체 삭제 (위험 작업, 2단계 확인) ───────────────────
    //  V01 (2026-05-15): 선수단 탭 하단 "삭제하기" 버튼이 팀 자체 삭제로 동작 →
    //   라벨 명확화("팀 자체 삭제") + 2단계 confirm 으로 오클릭 방지.
    deleteTeamButtonLabel: "팀 삭제하기",
    deleteTeamAriaLabel: "팀 삭제하기 (위험 작업)",
    deleteTeamWarningTitle: "팀 삭제",
    deleteTeamWarningFirst:
      "정말로 이 팀을 삭제하시겠습니까?\n팀 운영이 종료되며, 선수단 명단·경기 일정·운영 데이터에 더 이상 접근할 수 없게 됩니다.",
    deleteTeamFirstConfirmText: "계속",
    deleteTeamFinalTitle: "마지막 확인",
    deleteTeamFinalWarning: (teamName: string) =>
      `팀 "${teamName}" 을(를) 영구 삭제합니다.\n이 작업은 되돌릴 수 없습니다.`,
    deleteTeamFinalConfirmText: "영구 삭제",

    // 팀 하위 그룹 (감독·코치가 팀 안에서 만드는 단위)
    groupListTitle: "하위그룹",
    groupListEmpty: "아직 등록된 하위그룹이 없습니다.",
    groupCreateTitle: "하위그룹 등록",
    groupCreateButton: "하위그룹 등록하기",
    groupNameLabel: "하위그룹 이름",
    groupNamePlaceholder: "예: 선수반 A조",
    groupNameRequired: "하위그룹 이름을 입력해주세요.",
    groupAgeGroupLabel: "대상 설명",
    groupAgeGroupPlaceholder: "예: 주말반 · 초급 · 2014년생 위주",
    groupAgeGroupHelper:
      "선택 입력 — 이 하위그룹의 대상이나 성격을 자유롭게 적어주세요.",
    // 하위그룹 선수 트리 — 미리보기 초과분 더보기/접기 토글
    groupMemberShowMore: (count: number) => `외 ${count}명 더보기`,
    groupMemberCollapse: "접기",
    groupMembersLabel: "회원 선택",
    groupMembersEmpty: "등록 가능한 회원이 없습니다.",
    groupMembersHelper: "하위그룹에 포함할 회원을 선택하세요.",
    groupCreateSuccess: "하위그룹이 등록되었습니다.",
    groupCreateFailure: "하위그룹 등록에 실패했습니다.",
    groupDeleteConfirm: "이 하위그룹을 삭제하시겠습니까?",
    groupDeleteSuccess: "하위그룹이 삭제되었습니다.",
    groupMemberCountLabel: (n: number) => `회원 ${n}명`,

    // 팀 코드 (자녀 등록 시 팀 가입 신청 · 설계서 §4.5, 필수 입력)
    codeLabel: "팀 코드",
    codePlaceholder: "예: RUBY-DUCKS",
    codeHelper: "소속 팀의 코드를 입력해주세요. 감독님 승인 후 가입됩니다.",
    codeRequired:
      "팀 코드를 입력해주세요. 소속 팀 감독님께 문의하시거나 아래 팀 찾아보기를 이용해주세요.",
    codeChecking: "팀 코드를 확인하고 있어요",
    codeVerified: (teamName: string) => `'${teamName}' 팀으로 가입 신청됩니다.`,
    codeNotFound: "입력하신 팀 코드를 찾을 수 없습니다.",
    codeCheckFailed: "팀 코드 확인에 실패했습니다. 잠시 후 다시 시도해주세요.",
    codeInvalidFormat: "팀 코드는 영문, 숫자, -, _ 만 사용 가능합니다.",
    browseTeamsLink: "팀 찾아보기",
    pendingApproval: (teamName: string) => `승인 대기 · ${teamName}`,
    pendingApprovalGeneric: "가입 승인 대기 중",

    // 회원가입 진입 시 가장 먼저 보이는 가입 유형 안내 문구
    signupRoleHelper: "본인의 가입 유형을 먼저 선택해주세요.",

    // 감독 가입 — 팀/오픈클래스 생성 (설계서 §4.5, §4.6)
    signupDirectorTypeTitle: "감독 유형",
    signupDirectorTypeTeam: "팀 감독",
    signupDirectorTypeTeamDesc: "우리 팀 선수를 직접 관리합니다",
    signupDirectorTypeAcademy: "오픈클래스 감독",
    signupDirectorTypeAcademyDesc: "여러 팀 선수를 대상으로 레슨을 운영합니다",
    signupDirectorTypeRequired: "감독 유형을 선택해주세요.",

    signupTeamSectionTitle: "팀 정보",
    signupTeamSectionHelper:
      "가입과 동시에 팀이 생성되며, 감독님이 소유자가 됩니다.",
    signupTeamNameLabel: "팀 이름",
    signupTeamNamePlaceholder: "예: 루비덕스",
    signupTeamNameRequired: "팀 이름을 입력해주세요.",
    signupTeamCodeLabel: "팀 코드",
    signupTeamCodePlaceholder: "예: RUBY-DUCKS",
    signupTeamCodeHelper:
      "학부모가 자녀 등록 시 입력할 코드입니다. 영문·숫자·-·_만 가능.",
    signupTeamCodeRequired: "팀 코드를 입력해주세요.",
    signupTeamLocationLabel: "훈련 장소 (선택)",
    signupTeamLocationPlaceholder: "예: 목동 아이스링크",

    signupAcademySectionTitle: "오픈클래스 정보",
    signupAcademySectionHelper:
      "가입과 동시에 오픈클래스가 생성되며, 감독님이 운영자가 됩니다.",
    signupAcademyNameLabel: "오픈클래스 이름",
    signupAcademyNamePlaceholder: "예: 블랙아이스 오픈클래스",
    signupAcademyNameRequired: "오픈클래스 이름을 입력해주세요.",
    signupAcademyRegionLabel: "지역 (선택)",
    signupAcademyRegionPlaceholder: "예: 인천",

    // 코치 가입 — 팀 선택 (감독이 만든 팀 목록에서 선택, 설계서 §4.5)
    //  [수정 2026-05-21] 텍스트 코드 입력 → 팀 선택 모달(TeamPickerModal) 진입 방식으로 전환.
    //   가입 페이로드는 동일하게 선택된 팀의 teamCode 를 그대로 전송.
    signupCoachTeamCodeLabel: "팀 선택",
    signupCoachTeamCodePlaceholder: "소속할 팀을 선택해주세요",
    signupCoachTeamCodeHelper:
      "가입할 팀을 선택해주세요. 감독님 승인 후 활성화됩니다.",
    signupCoachTeamCodeRequired: "가입할 팀을 선택해주세요.",

    // 학부모 가입 — 팀 선택 (옵션 A: 회원가입 시 필수 선택, 즉시 TeamMember(PARENT, approved) 생성)
    //  PARENT_TEAM_REGISTRATION_SPEC.md §2 #15.
    //  [수정 2026-05-21] 텍스트 코드 입력 → 팀 선택 모달 방식으로 전환.
    signupParentTeamCodeLabel: "팀 선택",
    signupParentTeamCodePlaceholder: "소속할 팀을 선택해주세요",
    signupParentTeamCodeHelper:
      "가입할 팀을 선택해주세요. 자녀 등록 시 이 팀에 자동으로 매핑됩니다.",
    signupParentTeamCodeRequired: "가입할 팀을 선택해주세요.",

    // 팀 선택 모달 (TeamPickerModal — 학부모/코치 가입 공용)
    //  /api/v1/teams/public 기반 검색·페이지네이션·선택 UI.
    pickerTitle: "팀 찾아보기",
    pickerSearchPlaceholder: "팀명 또는 지역으로 검색",
    pickerSelectAction: "선택하기",
    pickerLoadMore: "더 보기",
    pickerEmpty: "검색 결과가 없습니다.",
    pickerSearchPrompt: "가입할 팀 이름을 검색해주세요.",
    pickerLoadFailed: "팀 목록을 불러오지 못했습니다.",
    pickerCodeLabel: (code: string) => `코드: ${code}`,
    pickerOpenAction: "선택",
    pickerChangeAction: "변경",
    pickerSelectedFormat: (teamName: string, teamCode: string) =>
      `${teamName} (${teamCode})`,
    childrenAddTeamReadonlyHelper: "자녀는 학부모님과 같은 팀에 등록됩니다.",
    childrenAddNoParentTeam:
      "학부모 팀 정보가 없습니다. 회원가입을 다시 진행해주세요.",
    // [Phase 1] 자녀별 팀 선택 — 무소속 허용
    childrenAddTeamSelectHelper:
      "자녀가 가입할 팀을 선택하세요. 선택하지 않으면 팀 없이 등록되며, 나중에 가입할 수 있습니다.",
    childrenAddTeamSelectLabel: "소속 팀",
    childrenAddTeamPickAction: "팀 선택하기",
    childrenAddTeamChangeAction: "변경",
    childrenAddTeamNoneOption: "소속 팀 없음",
    childrenAddTeamNoneHint: "팀을 선택하지 않으면 소속 팀 없이 등록됩니다.",
    childrenAddTeamClear: "선택 해제",
    // [Phase 3] 자녀 수정 화면 — 팀 변경(교체 · 승인 대기)
    childEditTeamSelectHelper:
      "자녀의 소속 팀을 변경할 수 있습니다. 다른 팀으로 바꾸면 기존 팀에서 나가고 새 팀에 가입 신청(승인 대기)됩니다.",
    childEditTeamCurrentLabel: "현재 소속 팀",
    childEditTeamPendingHint: "현재 팀 가입 승인을 기다리고 있습니다.",
    childEditTeamChangeNotice:
      "팀을 변경하면 새 팀의 승인 후 소속이 확정됩니다.",
    childEditTeamRemoveNotice:
      "팀에서 나가면 소속 없이 변경되며, 나중에 다시 가입할 수 있습니다.",

    // disable 라벨 (수강신청/결제 자녀 선택 화면)
    disabledPendingLabel: "가입 승인 대기",
    disabledPendingShort: "승인대기",
    disabledRejectedLabel: "가입 반려",
    disabledRejectedShort: "반려",
    disabledNotMemberLabel: "미가입 팀",
    disabledNotMemberShort: "미가입",

    // 대시보드 상단 배너 (/parent) — [2026-06-18] 실제 자녀 이름 표기. 2명 이상이면 "OO 외 N명".
    dashboardPendingBanner: (name: string, extraCount: number) =>
      extraCount > 0
        ? `${name} 외 ${extraCount}명의 팀 가입 승인을 기다리고 있어요`
        : `${name}의 팀 가입 승인을 기다리고 있어요`,
    dashboardRejectedBanner: (
      name: string,
      extraCount: number,
      reason?: string | null,
    ) =>
      `${extraCount > 0 ? `${name} 외 ${extraCount}명` : name}의 팀 가입이 반려되었어요.${
        reason && reason.trim() ? `(사유 : ${reason.trim()})` : ''
      } 다시 신청하려면 클릭하세요`,
    dashboardBannerCta: "자세히 보기",

    // 대시보드 헤더 타이틀 — 선택 자녀의 소속팀 자리 라벨 (club 없을 때).
    //   거절·무소속은 동일하게 "소속없음", 승인 대기만 별도 표기.
    childHeaderPendingLabel: "승인 대기",
    childHeaderNoTeamLabel: "소속없음",

    // 자녀 0명 안내 카드 (/parent · ParentChildSelector 자리)
    dashboardEmptyChildrenTitle: "등록된 자녀가 없습니다.",
    dashboardEmptyChildrenHelper:
      "자녀를 등록하면 수업·출석·결제를 한 번에 관리할 수 있어요.",
    dashboardEmptyChildrenCta: "등록하기",

    // 자녀 상세 상태 카드 (/children/[childId])
    detailApprovedTitle: (teamName: string) => `'${teamName}' 정식 소속`,
    detailApprovedDesc: "팀 감독님의 승인이 완료되었습니다.",
    detailPendingTitle: (teamName: string) => `'${teamName}' 가입 대기`,
    detailPendingDesc:
      "팀 감독님의 승인을 기다리고 있어요. 승인이 완료되면 알림으로 알려드릴게요.",
    detailRejectedTitle: (teamName: string) => `'${teamName}' 가입 반려`,
    detailRejectedDesc:
      "팀 감독님이 가입을 반려하셨습니다. 아래 사유를 확인해주세요.",
    detailNoMembershipTitle: "소속 팀 없음",
    detailNoMembershipDesc: "아직 가입 신청한 팀이 없습니다.",
    retrySignupCta: "다시 신청하기",
    rejectionReasonLabel: "반려 사유",

    // 폼 검증
    nameRequired: "팀 이름을 입력해주세요.",
    nameMinLength: "팀 이름은 최소 2글자 이상이어야 합니다.",
    nameMaxLength: "팀 이름은 50글자 이내로 입력해주세요.",
    divisionRequired: "부문을 선택해주세요.",
    invalidColor: "컬러는 HEX 형식(#RRGGBB)으로 입력해주세요.",
    duplicateName: "같은 이름의 팀이 이미 존재합니다.",
    noTeam: "먼저 팀을 생성하거나 소속 팀이 있어야 팀을 만들 수 있습니다.",

    // 목록/필터
    empty: "등록된 팀이 없습니다.",
    emptyHint: "새 팀을 만들어 선수를 배정해 보세요.",
    searchPlaceholder: "팀 이름으로 검색",
    filterAll: "전체",
    filterU8: "U8",
    filterU9: "U9",
    filterU10: "U10",
    filterU11: "U11",
    filterU12: "U12",
    memberCount: (n: number) => `${n}명 소속`,

    // 상세 - 탭
    tabInfo: "팀 정보",
    tabRoster: "선수단",
    tabSchedule: "경기 일정",

    // 상세 - 정보 탭
    slogan: "팀 슬로건",
    founded: "창단",
    homeArena: "홈 경기장",
    history: "주요 약력",
    coachStaff: "감독/코치",
    coachStaffEmpty: "등록된 감독/코치가 없습니다.",
    historyEmpty: "등록된 수상/약력이 없습니다.",
    historyEmptyHint: "대회 수상이 등록되면 이곳에 타임라인으로 표시됩니다.",
    sloganFallback: "얼음 위에서 하나되는 열정",
    aboutSection: "팀 소개",
    aboutEmpty: "팀 소개가 아직 등록되지 않았습니다.",
    leagueTagFallback: "아마추어 리그",
    headCoachBadge: "감독",
    coachBadge: "코치",
    seeAll: "전체보기",
    inquireJoin: "팀 가입 문의하기",
    fieldDescription: "팀 소개",
    fieldDescriptionPlaceholder:
      "예: 2018년 창단된 지역 대표 아이스하키 팀입니다.",
    fieldSlogan: "슬로건",
    fieldSloganPlaceholder: "예: 얼음 위에서 하나되는 열정",
    fieldFoundingDate: "창단일",
    fieldHomeArena: "홈 경기장",
    fieldHomeArenaPlaceholder: "예: 고척 아이스링크",
    // 신규 섹션 타이틀 (접근성용 aria-label)
    ariaHeroRegion: "팀 헤더",
    ariaSloganRegion: "팀 슬로건",
    ariaQuickStatsRegion: "팀 요약 정보",
    ariaHistoryRegion: "팀 주요 약력",
    ariaCoachStaffRegion: "감독/코치",
    ariaMetaRegion: "팀 상세 정보",

    // 로스터(선수단)
    rosterEmpty: "아직 등록된 선수가 없습니다.",
    rosterEmptyHint: "아래 버튼으로 팀 회원을 팀에 배정해 보세요.",
    addMember: "선수 추가하기",
    addMemberTitle: "팀에 선수 추가",
    availableEmpty: "추가할 수 있는 회원이 없습니다.",
    availableHint:
      "팀에 승인된 회원 중 이 팀에 등록되지 않은 회원만 표시됩니다.",
    memberSearchPlaceholder: "회원 이름으로 검색",
    rosterAddSuccess: "선수가 팀에 등록되었습니다.",
    rosterRemoveSuccess: "선수가 팀에서 제거되었습니다.",
    rosterRemoveConfirm: "이 선수를 팀에서 제거하시겠습니까?",
    rosterUpdateSuccess: "선수 정보가 수정되었습니다.",
    rosterDuplicate: "이미 이 팀에 등록된 회원입니다.",
    jerseyDuplicate: (n: number) => `등번호 ${n}번은 이미 사용 중입니다.`,

    // 포지션
    positionGoalie: "골리",
    positionDefense: "디펜스",
    positionForward: "포워드",
    captain: "주장",
    altCaptain: "부주장",

    // 폼 필드 레이블
    fieldName: "하위그룹 이름",
    fieldDivision: "연령",
    fieldLogoUrl: "로고 URL",
    fieldPrimaryColor: "메인 컬러",
    fieldSecondaryColor: "보조 컬러",
    fieldNamePlaceholder: "예: 팀플러스 주니어 A팀",
    fieldTeamCode: "팀 코드",
    fieldTeamCodeHint:
      "영문·숫자·-·_ 3~32자. 미입력 시 미설정 상태로 저장됩니다.",

    // 폼 힌트
    createHint:
      "기본 정보만 입력해도 등록할 수 있습니다. 로고/컬러는 나중에 수정 가능합니다.",

    // 페이지 타이틀
    titleList: "팀 관리",
    titleDetail: "팀 상세",
    titleCreate: "하위그룹 등록",
    titleEdit: "하위그룹 수정",

    // 검색/필터 결과
    noSearchResults: "검색 결과가 없어요",
    searchResultHint: "다른 검색어나 필터로 시도해 보세요.",
    inactiveBadge: "비활성",

    // 학부모 전용 뷰
    titleParent: "우리 팀",
    myChildTeamsSection: "우리 아이 팀",
    myChildTeamsSectionHint: "자녀가 소속된 팀이에요",
    teamsSection: "같은 팀의 다른 팀",
    teamsSectionHint: "자녀가 속한 팀의 다른 팀을 둘러볼 수 있어요",
    noChildTeamsYet: "아직 자녀가 배정된 팀이 없어요",
    noChildTeamsHint: "팀에 가입한 뒤 팀에 배정되면 이곳에 표시됩니다.",
    noOtherTeams: "같은 팀에 소속된 다른 팀이 없어요",
    parentNoChildren: "등록된 자녀가 없어요",
    parentNoChildrenHint: "자녀 정보를 먼저 등록해 주세요.",
    myChildBadge: "내 아이",
    defaultChildName: "자녀",
    jerseyLabel: (n: number) => `등번호 ${n}번`,
    jerseyUnassigned: "등번호 미지정",
    teamCountLabel: (n: number) => `${n}개 팀`,

    // ─── 2026-04-12 v2: 하드코딩 제거 (FE-4~FE-8) ─────────
    // 메타 정보 테이블
    metaTeamInfo: "팀 정보",
    metaDivision: "부문",
    metaTeamCode: "팀 코드",
    metaPrimaryColor: "메인 컬러",
    metaSecondaryColor: "보조 컬러",
    metaStatus: "상태",
    metaActive: "활성",
    metaInactive: "비활성",

    // 운영 현황 요약
    operationStats: "운영 현황",
    statPlayer: "선수",
    statHomeMatch: "홈 경기",
    statAwayMatch: "원정 경기",
    unitPerson: "명",
    unitCount: "회",

    // [추가 2026-04-30] 그룹 현황 섹션
    groupStats: "그룹 현황",
    statGroup: "하위 그룹",
    statGroupActiveLabel: "활성 그룹",
    groupsViewMore: "하위 그룹 관리",
    unitGroup: "개",

    // 경기 일정 섹션 (SchedulePanel)
    scheduleEmptyTitle: "예정된 경기가 없어요",
    scheduleEmptyHint: "경기 일정이 등록되면 이곳에 표시됩니다.",
    matchesTotal: (n: number) => `최근 ${n}건`,
    matchesTotalLabel: "누적 경기",

    // 로스터 모달 (AddRosterModal / EditRosterModal)
    rosterAddTitle: "팀에 선수 추가",
    rosterEditTitle: "선수 정보 수정",
    rosterEditDescription: "포지션 · 등번호 · 주장 여부를 편집합니다.",
    rosterSelectPlayerRequired: "선수를 선택해 주세요.",
    rosterFieldPosition: "포지션",
    rosterFieldJersey: "등번호",
    rosterJerseyPlaceholder: "1-99",
    rosterFieldCaptain: "주장 여부",
    rosterPositionNone: "선택 안 함",
    rosterCaptainNone: "일반",
    rosterCaptainMain: "주장",
    rosterCaptainAlt: "부주장",
    rosterSubmitting: "등록 중...",
    rosterSavingEdit: "저장 중...",
    rosterCancel: "취소",

    // 팀 가입 문의 (Dead link 대체)
    inquireJoinUnavailable: "팀 가입 문의는 팀 관리자에게 직접 문의해 주세요.",

    // [추가 2026-05-18 W2.B] 가입 신청 처리 (CoachTeamManageCard 푸터)
    pendingHandleLabel: "처리하기",
    pendingHandleAria: (teamName: string) =>
      `${teamName} 가입 신청 처리하기`,

    // [추가 2026-05-18 W2.B] 회원 선택 카테고리 (하위그룹 등록/수정 — 연령별 필터)
    groupMembersFilterAll: "전체",
    groupMembersFilterEmpty:
      "해당 연령의 회원이 없습니다. 다른 카테고리를 선택해 주세요.",

    // 재사용 힌트
    retryHint: "목록으로 돌아가 다시 시도해 주세요.",

    // 폼 검증/힌트 (TeamForm)
    formDescriptionMax: "팀 소개는 1000자 이하로 입력해 주세요.",
    formSloganMax: "슬로건은 200자 이하로 입력해 주세요.",
    formHomeArenaMax: "홈 경기장 이름은 100자 이하로 입력해 주세요.",
    formFoundingDateFormat: "창단일은 YYYY-MM-DD 형식으로 입력해 주세요.",
    formDescriptionHint:
      '최대 1000자. 팀 정보 탭의 "팀 소개" 섹션으로 표시됩니다.',

    // 자녀 재신청 (가입 반려된 자녀를 학부모가 같은 팀에 다시 신청)
    reapplyButton: "다시 신청하기",
    reapplySubmitting: "재신청 중...",
    reapplySuccess: "수정과 재신청이 완료되었습니다.",
    reapplyPartialFailure: "수정은 완료됐지만 재신청에 실패했습니다.",

    // ─── [추가 2026-05-23] /team/[id] 상세 페이지 하드코딩 제거 ─────────
    // 선수 제거 모달
    rosterRemoveTitle: "선수 제거",
    rosterRemoveConfirmText: "제거하기",

    // 빈 상태 / 폴백 텍스트
    backToList: "목록으로",
    positionUnassigned: "미지정",
    groupUnassigned: "그룹 미배정",
    groupsEmpty: "등록된 하위 그룹이 없습니다.",
    ourTeamFallback: "우리팀",
    opponentTbd: "상대 미정",
    opponentTbdLong: "상대팀 미정",

    // 매치 양측 라벨
    locationHome: "홈",
    locationAway: "원정",
    vsLabel: "VS",

    // 운영 현황 — 신규 라벨 (감독·코치 / 학부모 카운트)
    statStaff: "감독·코치",
    statParent: "학부모",

    // 헬퍼 (라벨 함수)
    ageLabel: (n: number) => `${n}세`,
    birthYearLabel: (y: number) => `${y}년생`,
    jerseyAriaLabel: (n: number | null | undefined) =>
      `등번호 ${n != null ? n : "-"}`,
    matchAriaLabel: (opponent: string) => `${opponent} 전`,
    detailAriaLabel: (name: string) => `${name} 상세`,

    // aria-label (접근성)
    ariaTabMenu: "탭 메뉴",
    ariaActions: "팀 작업",
    ariaMatchList: "경기 목록",
    ariaCandidateList: "회원 후보 목록",
    ariaRosterList: "선수단",
    editTeamAriaLabel: "팀 수정하기",
    editSloganAriaLabel: "슬로건 수정",

    // 요일 (단축형) — 매치 일정 표기용
    dayShort: ["일", "월", "화", "수", "목", "금", "토"] as readonly string[],

    // 로스터 모달 submit 버튼 라벨 (한글 표준 버튼 라벨, MESSAGES SoT 일관화)
    rosterSubmit: "등록하기",
    rosterSubmitEdit: "수정하기",
  },
  academy: {
    created: "오픈클래스가 등록되었습니다.",
    updated: "오픈클래스 정보가 수정되었습니다.",
    deleted: "오픈클래스가 삭제되었습니다.",
    joined: "오픈클래스 가입 신청이 완료되었습니다.",
    memberApproved: "회원이 승인되었습니다.",
    memberRejected: "회원이 거절되었습니다.",
    coachAdded: "코치가 추가되었습니다.",
    coachRemoved: "코치가 제거되었습니다.",
    nameRequired: "오픈클래스명을 입력해주세요.",
    nameMaxLength: "오픈클래스명은 50자 이내로 입력해주세요.",
    deleteConfirm: "이 오픈클래스를 삭제하시겠습니까?",
    codeCopied: "코드가 복사되었습니다.",
    codeLabel: "오픈클래스 코드",
    codePlaceholder: "오픈클래스 코드를 입력해주세요",
    joinButton: "가입 신청",
    manage: "오픈클래스 관리",
    myAcademies: "내 오픈클래스",
    publicList: "오픈클래스 검색",
    memberCount: (n: number) => `수강생 ${n}명`,
    coachCount: (n: number) => `코치 ${n}명`,
    classCount: (n: number) => `수업 ${n}개`,
    noticeInputRequired: "제목과 내용을 모두 입력해주세요.",
    noticeSent: (n: number) => `${n}명에게 공지가 발송되었습니다.`,
    noticeSending: "발송 중...",
    noticeSendButton: "공지 발송하기",
    noticeRecipientHint: "활성 수강생 전원에게 알림이 발송됩니다",
    noticeTitle: "공지 제목",
    noticeTitlePlaceholder: "공지 제목을 입력해주세요",
    noticeContent: "공지 내용",
    noticeContentPlaceholder: "수강생에게 전달할 내용을 입력해주세요",
    // 오픈클래스 감독 수업 등록 가드
    noAcademyTitle: "운영 중인 오픈클래스가 없습니다",
    noAcademyDescription: "수업을 등록하려면 먼저 오픈클래스를 생성해주세요.",
    createAcademyCta: "오픈클래스 만들기",
    // SPEC v3 (2026-05-18) — 수업 카드 IA + 검색 모드 학생 카드 전환
    students: {
      tabLabel: "수강생",
      // [SPEC v3] 학생 단위 + 활성 수업 카운트 (기본 모드 헤더)
      summary: (uniqueCount: number, activeClassCount: number) =>
        `진행중인 수강생 ${uniqueCount}명 (수업 ${activeClassCount}개)`,
      // [SPEC v3] 활성 수업 0개 빈 상태
      emptyClasses: "진행중인 수업이 없습니다",
      searchStudentPlaceholder: "학생 이름 검색",
      searchInClassPlaceholder: "이 수업의 학생 검색",
      searchResultCount: (n: number) => `매칭 학생 ${n}명`,
      noStudents: "아직 수강생이 없습니다",
      noSearchResults: (q: string) => `'${q}'에 매칭되는 학생이 없습니다`,
      enrolledClasses: "수강 중인 수업",
      sortByRecent: "최신순",
      sortByName: "이름순",
      // aria-label SoT
      summaryAriaLabel: "학원 수강생 요약",
      classInfoAriaLabel: "수업 정보",
      statusPaid: "결제완료",
      statusPending: "대기",
      // 필터 / 정렬 그룹 라벨 (Detail 화면에서만 사용)
      filterAll: "전체",
      filterPaid: "결제완료",
      filterPending: "대기",
      sortLabel: "정렬",
      filterLabel: "필터",
      // 검색바
      clearSearch: "검색어 지우기",
      searchAriaLabel: "학생 이름 검색",
      // 카드 / 라벨
      // [SPEC v3] 수업 카드 aria-label — "명단 보기" 명시
      classCardAriaLabel: (name: string, count: number) =>
        `${name} 수강생 ${count}명 명단 보기`,
      // [SPEC v2/v3] 학생 카드의 수업 칩 aria-label
      classChipAriaLabel: (className: string) =>
        `${className} 수강생 명단 보기`,
      enrollmentCount: (n: number) => `${n}명`,
      pendingCount: (n: number) => `대기 ${n}`,
      pendingBadge: (n: number) => `대기 ${n}`,
      durationMinutes: (m: number) => `${m}분`,
      registeredAt: (date: string) => `${date} 등록`,
      requestedAt: (date: string) => `${date} 신청`,
      callParent: "보호자에게 전화",
      classInfoSchedule: "일정",
      classInfoDuration: "수업 시간",
      classInfoCount: "현재 인원",
      // 로딩 / 무한 스크롤
      loadingMore: "더 불러오는 중...",
      loadMoreError: "추가 데이터를 불러오지 못했습니다.",
      retry: "다시 시도",
      // [SPEC v2] /classes/[id] 빠른 액션 4-버튼 라벨
      actionStudents: "수강생",
      actionStudentsAriaLabel: "수강생 명단",
      actionPayments: "결제 확인",
      actionPaymentsAriaLabel: "결제 확인",
      // 결제 확인 → '선수정보' 통합 — 수강생 정보 + 결제 상태 단일 진입점(팀·학원 공용).
      actionPlayers: "선수정보",
      actionPlayersAriaLabel: "선수정보",
      playersTitle: "선수정보",
      playersEnrolledOn: (date: string) => `등록 ${date}`,
      // 선수정보 페이지 2탭 — 1차 명단(roster) / 2차 결제(payment)
      tabRoster: "선수정보",
      tabPayment: "결제 현황",
      rosterCount: (n: number) => `등록 ${n}명`,
      payerLabel: (name: string) => `학부모 ${name}`,
      paymentSummaryTotal: "총 수금액",
      // 결제 탭 미납 필터 — 완납/미납 라벨은 페이지 STATE_META 단일 출처 사용
      filterAllPay: "전체",
      emptyRoster: "등록된 선수가 없습니다.",
      emptyPaymentFilter: "해당 상태의 선수가 없습니다.",
      // [Phase B 연동] 결제 탭 모드 분기 — 후불(POSTPAID) 표시
      billingPostpaid: "후불 정산",
      postpaidPerSessionNote: (price: number) =>
        `회당 ${price.toLocaleString('ko-KR')}원 · 월말 출석 기준 정산`,
      postpaidNotice:
        "출석한 만큼 월말에 정산됩니다. 출석 횟수·정산 확정은 출석 관리에서 진행됩니다.",
      // [Phase C] 선수정보 탭 당월 출석 횟수
      attendanceThisMonth: (n: number) => `이번 달 출석 ${n}회`,
      // ── [DEPRECATED] SPEC v1 잔존 키 — deprecated 컴포넌트의 빌드 안전성 유지 목적.
      //    SPEC v3 에서는 정렬/필터 칩 UI 가 노출되지 않으므로 신규 사용 금지.
      noClasses: "수업 등록 후 수강생이 자동으로 표시됩니다",
      noStudentsInClass: "이 수업에 수강생이 없습니다",
      sortByEnrollment: "인원순",
      sortByOldest: "오래된순",
      statusActive: "진행중",
      statusEnded: "종료",
      filterActive: "진행중",
      filterEnded: "종료",
    },
  },
  promotion: {
    // 공통
    title: "오픈클래스 광고",
    detailTitle: "광고 상세",
    createTitle: "광고 등록",
    editTitle: "광고 수정",
    empty: "등록된 광고가 없습니다.",
    listCount: (n: number) => `총 ${n}개`,
    viewCount: (n: number) => `조회 ${n.toLocaleString()}`,
    // 필터 탭
    lessonTypeAll: "전체",
    lessonType: {
      PRIVATE: "개인 레슨",
      GROUP: "그룹 레슨",
      GAME_LESSON: "게임 레슨",
      FUN: "취미/체험",
    } as const,
    // 폼 레이블
    fieldTitle: "제목",
    fieldTitlePlaceholder: "홍보 제목을 입력해주세요",
    fieldContent: "상세 내용",
    fieldContentPlaceholder: "레슨 소개, 커리큘럼, 강사 이력 등을 입력해주세요",
    fieldLessonType: "레슨 유형",
    fieldSchedule: "일정",
    fieldSchedulePlaceholder: "예: 매주 월/수 19:30~21:00",
    fieldPrice: "가격",
    fieldPricePlaceholder: "예: 3회 20만원 / 4회 26만원",
    fieldCapacity: "정원",
    fieldCapacityPlaceholder: "예: 6",
    fieldVenue: "장소",
    fieldVenuePlaceholder: "예: IN CHEON 블랙아이스A",
    fieldContact: "문의 연락처",
    fieldContactPlaceholder: "예: 010-1234-5678",
    fieldStartDate: "모집 시작일",
    fieldEndDate: "모집 종료일",
    fieldImage: "배너 이미지 URL",
    fieldImagePlaceholder: "https://storage.teamplus.com/...",
    fieldActive: "공개 여부",
    fieldActiveOn: "공개 중",
    fieldActiveOff: "비공개",
    // 검증
    titleRequired: "제목을 입력해주세요.",
    titleMinLength: "제목은 2자 이상 입력해주세요.",
    contentRequired: "내용을 입력해주세요.",
    contentMinLength: "내용은 10자 이상 입력해주세요.",
    lessonTypeRequired: "레슨 유형을 선택해주세요.",
    // 토스트
    created: "광고가 등록되었습니다.",
    updated: "광고가 수정되었습니다.",
    deleted: "광고가 삭제되었습니다.",
    deleteConfirm: "이 광고를 삭제하시겠습니까?",
    // 탭 (academy/create 페이지용)
    tabInfo: "오픈클래스 정보",
    tabPromotion: "광고 등록",
    // 상세 섹션
    sectionSchedule: "일정/장소",
    sectionPrice: "가격/정원",
    sectionContact: "문의",
    // 액션
    createButton: "광고 등록하기",
    editButton: "수정하기",
    deleteButton: "삭제하기",
    contactAction: "문의하기",
    // 모집 상태
    statusActive: "모집중",
    statusEnded: "모집종료",
    statusScheduled: "모집예정",
    statusInactive: "비공개",
  },
  venue: {
    // 목록/상태
    listTitle: "구장 정보",
    manageTitle: "구장 관리",
    detailTitle: "구장 상세",
    nearbyCount: (n: number) => `내 주변 ${n}개`,
    nearbyLabel: "내 주변 링크장",
    foundCount: (n: number) => `${n}개 발견`,
    currentLocation: "현재 위치",
    locationChecking: "위치 정보 확인 중",
    defaultCity: "서울 양천구",
    loading: "구장 정보를 불러오는 중입니다.",
    empty: "등록된 구장이 없습니다.",
    noAddress: "주소 정보 없음",
    defaultDescription: "국제 규격 아이스하키 전용 경기장",
    mapPreview: "지도 미리보기",
    searchError: "구장 정보를 불러오지 못했습니다.",
    searchPlaceholder: "구장명 또는 주소로 검색",
    retry: "다시 시도",
    recommended: "추천",

    // 운영 상태
    status: {
      active: "운영중",
      maintenance: "점검중",
      closed: "운영종료",
    },

    // 시설
    facilities: {
      title: "보유 시설",
      galleryTitle: "시설 둘러보기",
      locker_room: "라커룸",
      shower: "샤워실",
      parking: "주차장",
      stand: "관람석",
      cafe: "카페",
      pro_shop: "프로샵",
      rental: "장비 대여",
      kids_room: "대기실",
    },

    // 정보 라벨
    info: {
      address: "주소",
      phone: "전화번호",
      hours: "영업 시간",
      capacity: (n: number) => `수용 인원 ${n}명`,
      rinkSize: "링크 규격",
      hourlyRate: (price: number) => `시간당 ${price.toLocaleString()}원`,
      operatingHours: (open: string, close: string) => `${open} ~ ${close}`,
      openUntil: (close: string) => `${close}에 종료`,
      noOperatingHours: "운영 시간 정보 없음",
      enterNotice: "매치 시작 30분 전 입장 가능",
      copyAddress: "주소 복사",
      copiedAddress: "주소가 복사되었습니다.",
    },

    // 액션 / 버튼
    actions: {
      findWay: "길 찾기",
      call: "전화하기",
      share: "공유하기",
      save: "저장하기",
      edit: "수정하기",
      delete: "삭제하기",
      create: "등록하기",
      cancel: "취소",
      close: "닫기",
      toggleStatus: "운영 상태 변경",
      changePhoto: "사진 변경",
      saveChanges: "변경사항 저장",
      viewAll: "전체보기",
      searchAddress: "주소 검색",
      manageCta: "관리",
      editCta: "편집",
    },

    // 폼 라벨
    form: {
      sectionStatus: "운영 상태",
      sectionBasic: "기본 정보",
      sectionLocation: "위치 정보",
      sectionHours: "운영 설정",
      sectionFacilities: "보유 시설",
      sectionMemo: "시설 안내",
      sectionAdvanced: "규격 및 요금",
      nameLabel: "구장명",
      namePlaceholder: "구장 이름을 입력해주세요",
      phoneLabel: "대표 전화번호",
      phonePlaceholder: "02-0000-0000",
      addressLabel: "주소",
      addressPlaceholder: "주소를 검색해주세요",
      addressDetailLabel: "상세 주소",
      addressDetailPlaceholder: "상세 주소 (선택)",
      openLabel: "오픈 시간",
      closeLabel: "마감 시간",
      descriptionLabel: "시설 안내",
      descriptionPlaceholder: "구장에 대한 상세 설명을 입력해주세요.",
      imageLabel: "대표 사진",
      imageAlt: (name: string) => `${name || "구장"} 대표 사진`,
      heroTitle: "구장 상세 정보",
      rinkSizeLabel: "링크 규격",
      rinkSizeHint: "NHL · International · Olympic · Custom",
      capacityLabel: "수용 인원",
      capacityPlaceholder: "예: 500",
      hourlyRateLabel: "시간당 대관료",
      hourlyRatePlaceholder: "예: 150000",
      amenitiesLabel: "보유 시설 선택",
      amenitiesHint: "제공 가능한 시설만 선택해주세요.",
    },

    // 유효성
    validation: {
      nameRequired: "구장명을 입력해주세요.",
      nameMaxLength: "구장명은 100자 이내로 입력해주세요.",
      phoneInvalid: "전화번호 형식이 올바르지 않습니다.",
      addressRequired: "주소를 입력해주세요.",
      timeInvalid: "시간 형식이 올바르지 않습니다.",
      descriptionMaxLength: "시설 안내는 2000자 이내로 입력해주세요.",
      imageMime: "지원하지 않는 이미지 형식입니다. (jpeg/png/webp 만 허용)",
      imageSize: "이미지 크기는 5MB 이내여야 합니다.",
      capacityInvalid: "수용 인원은 1명 이상이어야 합니다.",
      hourlyRateInvalid: "시간당 대관료는 0원 이상이어야 합니다.",
    },

    // 결과 메시지
    result: {
      created: "구장이 등록되었습니다.",
      updated: "구장 정보가 수정되었습니다.",
      deleted: "구장이 삭제되었습니다.",
      saving: "저장 중...",
      uploading: "업로드 중...",
      statusUpdated: "운영 상태가 변경되었습니다.",
      imageUpdated: "대표 사진이 변경되었습니다.",
      imageUploadError: "이미지 업로드에 실패했습니다.",
      imageUploadRequiresSave:
        "먼저 구장 정보를 저장한 후 이미지를 업로드할 수 있습니다.",
      statusUpdateError: "운영 상태 변경 중 오류가 발생했습니다.",
      saveError: "저장 중 오류가 발생했습니다. 다시 시도해주세요.",
      deleteError: "삭제 중 오류가 발생했습니다. 다시 시도해주세요.",
      deleteConfirm: "구장을 삭제하시겠어요? 이 작업은 되돌릴 수 없습니다.",
      deleteBlocked: "진행 중인 예약 또는 대관 계약이 있어 삭제할 수 없습니다.",
      noPermission: "관리 권한이 없습니다.",
      callFailed: "전화 연결에 실패했습니다.",
    },

    // 관리 리스트 헤더
    manage: {
      totalCount: (n: number) => `등록된 구장 ${n}개`,
      addButton: "구장 등록하기",
      editButton: "구장 정보 수정",
    },
  },
  chat: {
    title: "메시지",
    searchPlaceholder: "학부모 또는 학생 이름 검색",
    noConversations: "아직 대화가 없습니다",
    noSearchResults: "검색 결과가 없습니다",
    startConversation: "대화를 시작해보세요.",
    inputPlaceholder: "메시지를 입력하세요...",
    fileUploadError: "파일 업로드 중 오류가 발생했습니다.",
    leaveConfirm: "채팅방을 나가시겠습니까?",
    leaveError: "처리 중 오류가 발생했습니다.",
    notificationChanged: "알림 설정이 변경되었습니다.",
    notificationLabel: "알림 설정",
    leaveRoom: "채팅방 나가기",
    uploading: "파일 업로드 중...",
    statusOnline: "현재 활동중",
    statusOffline: "오프라인",
    statusConnecting: "연결 중...",
    justNow: "방금 전",
    minutesAgo: (n: number) => `${n}분 전`,
    yesterday: "어제",
    readLabel: "읽음",
    selectedCount: (n: number) => `${n}장 선택됨`,
    composeNew: "새 메시지 작성하기",
    sendButton: "메시지 보내기",
    sending: "메시지 전송 중...",
    sendSuccess: "메시지를 보냈습니다.",
    sendFailed: "메시지 전송에 실패했습니다.",
    fillRecipient: "받는 사람을 입력해주세요.",
    fillContent: "메시지 내용을 입력해주세요.",
    scheduleButton: "발송 시간 설정하기",
    scheduleTitle: "예약 발송",
    scheduleHint: "필요한 시간에 자동으로 발송됩니다.",
    scheduleHelper: "예약 발송 기능은 곧 제공될 예정입니다.",
    scheduleConfirm: (datetime: string) => `${datetime}에 예약 발송됩니다.`,
    // UGC 안전장치 (신고·차단)
    report: "신고하기",
    block: "차단하기",
    blockConfirmTitle: "사용자 차단",
    blockConfirm:
      "이 사용자를 차단하시겠습니까? 차단하면 상대의 메시지가 더 이상 표시되지 않습니다.",
    blockSuccess: "차단되었습니다. 이 사용자의 메시지가 더 이상 표시되지 않습니다.",
    blockedMessage: "차단한 사용자의 메시지입니다.",
  },
  gallery: {
    title: "활동 포토 갤러리",
    tabAll: "전체",
    tabClass: "수업",
    tabMatch: "매치",
    selectMode: "선택",
    cancelMode: "취소",
    emptyPhotos: "등록된 사진이 없습니다",
    photoCountLabel: (n: number) => `${n}장`,
    downloadStart: (n: number) => `${n}장의 사진 다운로드를 시작합니다.`,
    photoSaved: "사진이 저장되었습니다.",
    commentPosted: "댓글이 등록되었습니다.",
    saveLabel: "저장",
    shareLabel: "공유",
  },
  wishlist: {
    title: "찜한 목록",
    emptyTitle: "찜한 목록이 비어 있어요",
    emptyHint: "마음에 드는 수업이나 매치를 찜해보세요",
    browseClasses: "수업 둘러보기",
    selectAll: "전체선택",
    removeSelected: "선택삭제",
    addToCartSelected: (n: number) => `선택상품 장바구니 담기 (${n})`,
    cart: "장바구니",
  },
  childAuth: {
    pinSet: "자녀 PIN이 설정되었습니다.",
    pinReset: "PIN이 초기화되었습니다.",
    verified: "인증이 완료되었습니다.",
    mismatch: "PIN이 일치하지 않습니다.",
    mismatchRetry: "다시 입력해주세요.",
    locked: (min: number) => `잠금 상태입니다. ${min}분 후 다시 시도해주세요.`,
    remaining: (n: number) => `남은 시도: ${n}회`,
    setTitle: "안전을 위해 6자리 PIN 번호를 설정해주세요.",
    confirmTitle: "PIN을 한 번 더 입력해주세요.",
    verifyTitle: "설정된 PIN 번호를 입력해주세요.",
    noSequential: "연속된 숫자나 동일 숫자는 사용할 수 없습니다.",
  },
  skillReport: {
    pageTitle: "기술 평가",
    title: "기술 평가 리포트",
    shareText: (name: string) => `${name} 코치님의 기술 평가 리포트입니다.`,
    linkCopied: "링크가 복사되었습니다.",
    shareUnavailable: "공유 기능을 사용할 수 없습니다.",
    skating: "스케이팅",
    shooting: "슈팅",
    passing: "패스",
    agility: "민첩성",
    teamwork: "팀워크",
    overallAnalysis: "종합 능력치 분석",
    maxScore: "5점 만점 기준",
    averageScore: "평균 점수",
    detailedScores: "상세 평가 점수",
    evaluation: "평가",
    excellent: "Excellent",
    shareReport: "리포트 공유",
    askCoach: "코치님께 질문하기",
  },
  review: {
    created: "리뷰가 등록되었습니다.",
    createError: "리뷰 등록 중 오류가 발생했습니다. 다시 시도해주세요.",
    duplicate: "이미 해당 수업에 리뷰를 작성하셨습니다.",
    submitting: "등록 중...",
    loadError: "수업 정보를 불러올 수 없습니다.",
  },
  upload: {
    success: "업로드가 완료되었습니다.",
    start: "업로드를 시작합니다.",
    rightsNotice:
      "타인의 저작권·상표·초상권을 침해하지 않는 콘텐츠만 올려주세요. 자녀의 사진은 보호자(법정대리인)가 직접 올릴 수 있어요.",
    multiSuccess: (count: number) => `${count}개 파일 업로드가 완료되었습니다.`,
    partialFailed: (succeeded: number, failed: number) =>
      `${succeeded}개 성공, ${failed}개 실패했습니다.`,
    failed: "업로드에 실패했습니다. 잠시 후 다시 시도해주세요.",
    cancelled: "업로드가 취소되었습니다.",
    invalidType: "지원하지 않는 파일 형식입니다.",
    tooLarge: (maxMb: number) => `파일 크기가 ${maxMb}MB를 초과합니다.`,
    tooMany: (max: number) => `최대 ${max}개까지 업로드할 수 있습니다.`,
    totalTooLarge: (maxMb: number) =>
      `총 업로드 크기가 ${maxMb}MB를 초과합니다.`,
    empty: "업로드할 파일을 선택해주세요.",
    dragHint: "파일을 끌어다 놓거나 클릭해서 선택하세요.",
    progress: (percent: number) => `업로드 중 · ${percent}%`,
    removeLabel: (index: number) => `${index}번째 파일 제거`,
    retry: "다시 시도하기",
    preview: (index: number) => `업로드 미리보기 ${index}`,
    cancelAction: "업로드 취소하기",
    successBadge: "업로드 완료",
    fileListLabel: "업로드 파일 목록",
    imageGridLabel: "업로드된 이미지 미리보기",
    avatarCurrentAlt: "현재 프로필 사진",
    avatarChangeChild: "프로필 사진 바꾸기",
    avatarChange: "프로필 사진 변경",
    avatarOpenLarge: "프로필 사진 크게 보기",
    fileAddChild: "파일 추가 📎",
    imageAddChild: "사진 추가 📷",
    fileAdd: "파일 추가하기",
    imageAdd: "사진 추가하기",
    fileUploadLabel: "파일 업로드",
    imageUploadLabel: "사진 업로드",
  },
  video: {
    pageTitle: "영상 업로드",
    pageDescription:
      "자녀의 훈련·경기 영상을 업로드할 수 있습니다. 최대 100MB, mp4·webm·mov 형식을 지원합니다.",
    selectButton: "영상 파일 선택",
    changeButton: "다른 영상 선택",
    uploadButton: "업로드하기",
    cancelButton: "업로드 취소하기",
    selectedHint: (name: string, sizeMb: number) => `${name} · ${sizeMb}MB`,
    uploading: (percent: number) => `업로드 중 · ${percent}%`,
    waiting: "준비 중...",
    success: "영상 업로드가 완료되었습니다.",
    successWithKey: (key: string) => `업로드 완료 · 키: ${key}`,
    failed: "영상 업로드에 실패했습니다. 잠시 후 다시 시도해주세요.",
    unavailable:
      "현재 영상 업로드 서비스를 사용할 수 없습니다. 운영팀에 문의해주세요.",
    unauthorized: "로그인이 만료되었습니다. 다시 로그인해주세요.",
    invalidType: "지원하지 않는 영상 형식입니다. mp4·webm·mov만 가능합니다.",
    tooLarge: "영상 파일 크기가 100MB를 초과합니다.",
    cancelled: "영상 업로드가 취소되었습니다.",
    emptyField: "업로드할 영상을 선택해주세요.",
    progressAriaLabel: "영상 업로드 진행률",
    registering: "영상 정보 저장 중...",
    registerFailed: "영상 정보 저장에 실패했습니다. 운영팀에 문의해주세요.",
    registerSuccess: "영상이 등록되었습니다.",
    missingTitle: "영상 제목을 입력해주세요.",
    titleLabel: "영상 제목",
    titlePlaceholder: "예: U12 훈련 하이라이트",
    descriptionLabel: "설명 (선택)",
    descriptionPlaceholder: "영상에 대한 간단한 설명을 입력하세요.",
    defaultPlayerTitle: (name: string) => `${name} 플레이 영상`,
  },
  role: {
    viewAsLabel: "보기 모드",
    viewAsParent: "학부모로 보기",
    viewAsCoach: "코치로 보기",
    parentLabel: "학부모",
    coachLabel: "코치",
    switchSuccess: (target: string) => `${target} 모드로 전환했습니다.`,
    switchHint: "메뉴와 대시보드가 선택한 역할에 맞게 바뀝니다.",
    noSecondaryRole: "겸직된 역할이 없습니다.",
    dropdownAriaLabel: "보기 모드 전환",
  },
  authGuard: {
    required: "로그인이 필요합니다.",
    requiredDescription: "로그인 후 다시 시도해주세요.",
    expired: "로그인이 만료되었습니다. 다시 로그인해주세요.",
    redirectingToLogin: "로그인 화면으로 이동합니다.",
    loginRequiredForAction: "이 기능을 사용하려면 로그인이 필요합니다.",
    // 세션 만료 안내 모달 (SessionExpiredModal)
    autoLogoutTitle: "자동 로그아웃 안내",
    autoLogoutMessage:
      "안전한 사용을 위해 일정 시간 후\n자동으로 로그아웃됩니다.\n서비스를 계속 이용하시려면\n재로그인 해주세요.",
    reloginButton: "재로그인",
  },
  // ──────────────────────────────────────────────────────────────────
  //  Wallet (4탭 메인 화면) — 신한pLay풍 핀테크 메인 화면
  //  역할 공통 라벨. 역할별 콘텐츠는 페이지에서 직접 주입.
  // ──────────────────────────────────────────────────────────────────
  wallet: {
    // 상단바 (제목 + 4 아이콘 액션)
    appBar: {
      title: "팀플러스",
      // 마이페이지 한정 타이틀 — 다른 메인 5개는 기본 title('팀플러스') 사용
      titleMy: "마이",
      search: "검색",
      timeline: "타임라인",
      my: "마이",
      menu: "메뉴",
    },
    // 4탭 라벨
    tabs: {
      pay: "수업·결제",
      mship: "멤버십",
      doc: "전자문서",
      extra: "부가서비스",
    },
    // 코치/관리자/감독용 탭 라벨 변형 (역할별 톤 차이)
    tabsCoach: {
      pay: "수업·정산",
      mship: "자격",
      doc: "문서",
      extra: "부가",
    },
    tabsAdmin: {
      pay: "매출·정산",
      mship: "회원",
      doc: "문서",
      extra: "부가",
    },
    tabsStudent: {
      pay: "내 수업",
      mship: "내 등급",
      doc: "내 기록",
      extra: "부가",
    },
    // Floating actions
    floating: {
      qrCheckin: "QR 출석체크",
      qrCheckinAction: "QR 발급", // 코치/관리자
      teamplusPlus: "아이스+",
      plusComing: "아이스+ 멤버십은 곧 제공될 예정입니다.",
    },
    // 기록카드 promo (B1 상단)
    recordCard: {
      titleSelf: (name: string) => `${name}의 기록 카드 만들어 보세요`,
      titleNoChild: "아이의 기록 카드 만들어 보세요",
      titleCoach: (name: string) => `${name} 코치 활동 카드 만들어 보세요`,
      titleAdmin: "팀 활동 카드 만들어 보세요",
      titleStudent: "나의 빙판 다이어리 만들기",
      tag: "기록 카드",
      cta: "시작",
    },
    // B1 수업·결제
    pay: {
      monthlyDue: "이번달 결제할 금액",
      monthlyDueHelp: "이용 내역 기준 자동 산정",
      lessonAmount: "이용금액",
      pass: "패스",
      otherPaymentTitle: "기타 결제수단",
      // Quick chips (View toggle 옆)
      historyChip: "이용내역",
      manageChip: "결제·계좌관리",
      // 사이드 actions (Hero card vertical strip)
      sideAttendance: "출석\n체크",
      sideTransfer: "송금",
      sideMore: "더보기",
      sideEvaluate: "평가서",
      sideStats: "통계",
      sideMy: "내 일정",
      sideApprove: "승인",
      // 빈 상태
      noPass: "아직 등록된 수업/패스가 없어요.",
      addPassCta: "수업 둘러보기",
    },
    // B1a 수업·결제 (미등록) — ClassPaymentEmpty
    empty: {
      promoPrefix: "첫 수업 등록하고",
      promoSuffix: "받기",
      promoBenefitButton: "혜택",
      cta: "팀플러스",
      ctaHighlight: "처음이신가요?",
      heroLabel: (childName: string) => `${childName}의 첫 빙판 시간`,
      heroHeadlinePrefix: "아이의",
      heroHeadlineSuffix: "수업과 코치를\n추가하고 관리해 보세요",
      addAction: "추가하기",
      recommendTitle: "수업 추천",
      recommendMore: "더보기 ›",
      recommendRegister: "등록",
      ariaLabel: "수업·결제 미등록 안내",
    },
    // B1b 수업·결제 (목록형) — ClassPaymentList
    list: {
      recordPromoPrefix: (childName: string) => `${childName}의`,
      recordPromoSuffix: "를 시작해보세요",
      financeButton: "금융",
      payAmountLabel: "결제할 금액",
      monthlyAmountLabel: (month: number) => `${month}월 이용금액`,
      passSuffix: "패스",
      actionAttendance: "출석체크",
      actionTransfer: "송금",
      actionMore: "더보기",
      ariaLabel: "수업·결제 목록형",
      viewToggleLabel: "보기 형식",
      viewCardLabel: "카드 보기",
      viewListLabel: "리스트 보기",
      actionGroupLabel: "수업 액션",
    },
    // B2 멤버십
    mship: {
      heroSub: "팀플러스 정회원",
      cumLessons: "누적 수업",
      points: "포인트",
      nextGrade: "다음 등급까지",
      otherClubsTitle: "다른 링크 멤버십",
      otherClubsAction: "추가 ›",
      affiliatesTitle: "제휴 혜택",
      affiliatesAction: "전체 ›",
      noClub: "아직 가입된 팀이 없어요.",
    },
    // B3 전자문서
    doc: {
      pendingAlert: (n: number) => `서명할 문서 ${n}건이 있어요`,
      noPending: "서명할 문서가 없습니다.",
      waitingTitle: "대기중",
      storageTitle: "보관함",
      storageAction: "더보기 ›",
      sign: "서명",
      signed: "체결완료",
      expired: "만료",
      urgent: "긴급",
      deadline: (date: string) => `서명 마감 · ${date}`,
      comingSoon: "전자문서 기능은 곧 제공될 예정입니다.",
    },
    // B4 부가서비스
    extra: {
      frequentTitle: "자주 쓰는 서비스",
      moreTitle: "더 많은 서비스",
      // 자주 쓰는 4그리드 (역할별 다름 — 페이지에서 직접 주입)
      taxiCall: "택시\n호출",
      gearRental: "장비\n대여",
      coachMatch: "코치\n매칭",
      videoAnalysis: "영상\n분석",
      // 코치 / 학생 / 관리자 변형 라벨
      attendanceMng: "출석\n관리",
      classRegister: "수업\n등록",
      evaluateForm: "평가서\n작성",
      uploadVideo: "영상\n업로드",
      qrCheckin: "QR\n출석",
      mySchedule: "내\n일정",
      badges: "뱃지",
      stickers: "스티커",
      ranking: "랭킹",
      checklist: "체크\n리스트",
      stats: "통계",
      approvals: "승인",
      pushSend: "푸시\n발송",
      settlementProc: "정산\n처리",
      // 더 많은 서비스 리스트 — 라벨/배지
      tagRecommend: "추천",
      tagNew: "신규",
    },
  },
  // ─── K3. Toast (P5~P8 — 경로/확인/정상/주의) ─────
  toast: {
    closeAriaLabel: "토스트 메시지 닫기",
    routeLabel: "경로 안내",
    infoLabel: "확인",
    successLabel: "정상",
    warningLabel: "주의",
  },

  // ─── L. SNS 공유 ──────────────────────────────────
  share: {
    title: "공유하기",
    linkCopied: "링크가 복사되었습니다.",
    copyFailed: "링크 복사에 실패했습니다. 다시 시도해주세요.",
    kakaoUnavailable: "카카오톡 공유가 곧 제공됩니다.",
    kakaoSdkLoading:
      "카카오 SDK를 불러오는 중입니다. 잠시 후 다시 시도해주세요.",
    kakaoViewDetail: "자세히 보기",
    failed: "공유에 실패했습니다.",
    platformKakao: "카카오톡",
    platformFacebook: "페이스북",
    platformTwitter: "X",
    platformCopy: "링크 복사",
    ariaKakao: "카카오톡으로 공유",
    ariaFacebook: "페이스북으로 공유",
    ariaTwitter: "X(트위터)로 공유",
    ariaCopy: "링크 복사",
    defaultTitle: "TEAMPLUS",
  },

  // ─── M. 드로어 · 사이드 메뉴 ────────────────────────
  drawer: {
    title: "전체 메뉴",
    recentMenu: "최근 이용 메뉴",
    noRecent: "최근 이용한 메뉴가 없어요",
    account: "계정",
    support: "고객 지원",
    search: "검색",
    profile: "프로필",
    activeChildChanged: (name: string) => `${name}(으)로 전환되었습니다.`,
    selectChild: "자녀 선택",
    allChildren: "전체 자녀",
    childNoTeam: "소속없음",
  },

  // ─── N. 프로필 / 닉네임 / 비밀번호 ──────────────────
  profile: {
    nicknameRequired: "닉네임을 입력해주세요.",
    nicknameTooLong: "닉네임은 최대 20자까지 입력 가능합니다.",
    photoChangeUnavailable: "프로필 사진 변경 기능은 준비 중입니다.",
    passwordChanged: "비밀번호가 변경되었습니다.",
    passwordChangeFailed: "비밀번호 변경 중 오류가 발생했습니다.",
    fileSizeOver5MB: "파일 크기는 5MB 이하여야 합니다.",
    // 마이페이지 Hero 보조 한 줄 — 학부모 다자녀 요약 ("자녀 2명 · 안OO")
    heroChildSummary: (count: number, firstChildName: string) =>
      `자녀 ${count}명 · ${firstChildName}`,
  },

  // ─── O. 보안 / 2FA / 디바이스 ───────────────────────
  security: {
    twoFactorEnabled: "이중 인증이 활성화되었습니다.",
    twoFactorDisabled: "이중 인증이 비활성화되었습니다.",
    deviceLoggedOut: "디바이스에서 로그아웃했습니다.",
    deviceLogoutFailed: "로그아웃에 실패했습니다. 다시 시도해주세요.",
    copied: "복사했습니다.",
  },

  // ─── P. 개인정보 / 다운로드 ────────────────────────
  privacy: {
    collectionStarted:
      "개인정보 수집을 시작했습니다. 잠시 후 다운로드 가능합니다.",
    downloadStarted: "다운로드가 시작됩니다.",
    downloadFailed: "다운로드 중 오류가 발생했습니다.",
  },

  // ─── Q. 정산 ──────────────────────────────────────
  settlements: {
    downloadComingSoon: "정산 내역 다운로드 기능이 준비 중입니다.",
  },

  // ─── R. 차단 / 신고 ────────────────────────────────
  moderation: {
    unblocked: "차단이 해제되었습니다.",
    unblockFailed: "차단 해제에 실패했습니다.",
    alreadyReported:
      "이미 신고한 대상입니다. 24시간 후 다시 신고할 수 있습니다.",
  },

  // ─── S. 알림 추가 ──────────────────────────────────
  notifications: {
    noOldToDelete: "삭제할 오래된 알림이 없습니다.",
    markAllRead: "전체 읽음",
    markAllReadSuccess: "모든 알림을 읽음 처리했어요.",
    noUnreadToMark: "읽지 않은 알림이 없습니다.",
  },

  // ─── T. 자녀 프로필 ────────────────────────────────
  // (childAuth.pinSet · childAuth.verified 는 위쪽 블록 재사용)
  childProfile: {
    nameAndPhoneRequired: "이름과 전화번호를 입력해주세요.",
  },

  // ─── V. 감독 (회원/공지/승인) ──────────────────────
  directorMembers: {
    nameRequired: "이름을 입력해주세요.",
  },
  directorNotices: {
    titleRequired: "제목을 입력해주세요.",
    contentRequired: "내용을 입력해주세요.",
    targetTeamRequired: "대상 팀을 선택해주세요.",
  },
  directorApproval: {
    rejectReasonRequired: "거절 사유를 입력해주세요.",
  },

  // ─── W. 승인 처리 확장 (코치 회원 승인) ─────────────
  approvalExt: {
    loadFailed: "데이터를 불러오는 중 오류가 발생했습니다.",
    approveSuccess: "승인이 완료되었습니다.",
    rejectSuccess: "거절 처리가 완료되었습니다.",
    bulkRejectFailed: "일괄 거절 중 오류가 발생했습니다.",
  },

  // ─── X. 매치 / 수업 편집 / 오픈클래스 ─────────────────
  matchManage: {
    participantRemoved: "참가자가 제외되었습니다.",
    applicantApproved: "신청자를 승인했습니다.",
    applicantRejected: "신청자를 거절했습니다.",
    applicantsEmpty: "아직 신청자가 없습니다.",
    applicantsLoadFailed: "신청자 목록을 불러오지 못했습니다.",
  },
  classesEdit: {
    clubNotFound: "팀 정보를 찾을 수 없습니다.",
    addressCopied: "주소가 복사되었습니다.",
    addressCopyFailed: "주소 복사에 실패했습니다.",
    episodeCancelConfirm: "이 회차를 취소하시겠습니까?",
    // 등록/수정 폼 검증 — useClassForm.validateClassForm / handleSubmit 에서 참조 (2026-05-14 추가).
    validation: {
      classDaysRequired: "수업 요일을 1개 이상 선택해주세요.",
      // 요일별 시간 입력 검증 (2026-06-05 추가) — useClassForm.validateClassForm 참조.
      dayScheduleRequired: "선택한 요일의 시작·종료 시간을 입력해주세요.",
      dayScheduleTimeRequired: "시작·종료 시간을 입력해주세요.",
      dayScheduleTimeOrderInvalid: "종료 시간은 시작 시간보다 늦어야 합니다.",
      singlePriceRequired: "1회 수업료를 입력해주세요.",
      packagePriceRequired: "정기 패키지 가격을 입력해주세요.",
      capacityRequired: "정원(최대 인원)을 입력해주세요.",
      dateScheduleRequired: "일정을 1개 이상 추가해주세요.",
      dateScheduleTimeRequired: "각 일정의 날짜·시작·종료 시간을 올바르게 입력해주세요.",
      endDateRequired: "교육 종료일을 입력해주세요.",
      // 오픈클래스 자동 일정 생성 분기 (handleSubmit 내 academyErrors)
      academyAutoGenStartDate:
        "오픈클래스 일정 자동 생성을 위해 시작일이 필요합니다.",
      academyAutoGenEndDate:
        "오픈클래스 일정 자동 생성을 위해 종료일이 필요합니다.",
      academyAutoGenClassDays:
        "오픈클래스 일정 자동 생성을 위해 수업 요일을 1개 이상 선택해주세요.",
      academyAutoGenStartTime:
        "오픈클래스 일정 자동 생성을 위해 시작 시간이 필요합니다.",
      academyAutoGenRequiredToast:
        "오픈클래스 일정 자동 생성을 위한 필수 항목을 입력해주세요.",
    },
    // 수업 목록 FAB → '추가하기' 액션 바텀시트 (수업/대회 등록 진입 선택).
    addSheet: {
      title: "추가하기",
      classRegister: "수업 등록",
      classRegisterDesc: "팀 정규 훈련을 새로 등록합니다",
      tournamentRegister: "대회 등록",
      tournamentRegisterDesc: "팀 대회를 새로 등록합니다",
    },
  },
  // (academy.codeCopied 는 위쪽 academy 블록에 병합됨)

  // ─── Y. 공지 작성 (drafts) ─────────────────────────
  noticesCreate: {
    titleOrContentRequired: "제목 또는 내용을 입력해주세요.",
    draftSaved: "임시저장되었습니다.",
    draftSaveFailed: "임시저장 중 오류가 발생했습니다.",
    titleRequired: "제목을 입력해주세요.",
    contentRequired: "내용을 입력해주세요.",
    titleMinLength: "제목은 2자 이상 입력해주세요.",
    titleMaxLength: "제목은 200자 이하로 입력해주세요.",
    contentMinLength: "내용은 10자 이상 입력해주세요.",
    contentMaxLength: "내용은 10,000자 이하로 입력해주세요.",
    createError: "등록 중 오류가 발생했습니다.",
    updateError: "수정 중 오류가 발생했습니다.",
    periodInvalid: "노출 종료일은 시작일 이후로 설정해주세요.",
  },

  // ─── Z. 폼 취소 confirm 공통 ───────────────────────
  formCancel: {
    confirmDiscard: "입력한 내용이 사라집니다. 취소하시겠습니까?",
  },

  // ─── AA-1. Loading / Empty / Delivery / Misc (M4 마이그레이션 · 2026-05-10) ──
  loading: {
    waitMessage: "잠시만 기다려 주세요",
    // [추가 2026-05-20 Phase 2] 표준 로딩 카피 — `MESSAGES.common.loading` 과 동일 톤을 유지하되
    //  spinner/aria-label/in-place 로딩에 일관적으로 사용. clarify 원칙: 친근한 존댓말 + 행동 유도.
    standard: "불러오는 중...",
    // [추가 2026-05-28 사용자 직접 지시] 풀스크린 퍽 로더(LoadingPuck) 하단 고정 표시 문구.
    //  단계 변화 없는 고정 카피 — v18 동적 message 회귀(문구 변화로 두 화면 인지) 방지.
    spinner: "로딩중...",
    paymentWidget: "결제 위젯을 불러오는 중이에요...",
    data: "데이터를 불러오는 중이에요...",
    inProgress: "불러오는 중",
  },
  emptyChart: {
    classes: "수업 데이터가 없습니다",
    attendance: "출석 데이터가 없습니다",
    sales: "매출 데이터가 없습니다",
    members: "회원 변동 데이터가 없습니다",
  },
  // [추가 2026-05-16] 페르소나별 Empty State 카피 — useAuth().user.role 분기로 사용.
  //   tone & manner: teen(열정 🔥) · admin(중립) · parent(따뜻 💭) · child(놀이 🎊)
  //   사용 예: const empty = MESSAGES.emptyByPersona[role]?.('수업') ?? MESSAGES.empty('수업');
  emptyByPersona: {
    teen: (target: string) => `${target}${subjectParticle(target)} 없네요. 더 도전해보세요! 🔥`,
    admin: (target: string) => `모니터링할 ${target}${subjectParticle(target)} 없습니다`,
    parent: (target: string) => `예정된 ${target}${subjectParticle(target)} 없네요 💭`,
    child: (target: string) => `오늘은 ${target} 쉬는 날이에요! 🎊`,
    coach: (target: string) =>
      `${target}${subjectParticle(target)} 비어 있어요. 새로 시작해볼까요?`,
    director: (target: string) => `${target} 데이터가 없습니다`,
  } as Record<string, (target: string) => string>,
  delivery: {
    requestFront: "문 앞에 놓아주세요",
    requestSecurity: "경비실에 맡겨주세요",
    requestBox: "택배함에 넣어주세요",
  },
  scoreboard: {
    noLive: "현재 진행 중인 경기가 없습니다",
    noUpcoming: "예정된 경기가 없습니다",
    noFinished: "종료된 경기가 없습니다",
  },
  signupValidation: {
    emailDuplicated: "이미 사용 중인 이메일입니다.",
    phoneDuplicated: "이미 등록된 전화번호입니다.",
  },
  classDelete: {
    cannotDelete: "등록자가 있는 활성 수업은 삭제할 수 없습니다",
  },
  tournamentForm: {
    titleHint: "대회를 쉽게 식별할 수 있도록 입력해주세요",
    dateHint: "대회가 진행되는 시작일과 종료일을 지정해주세요",
    // [2026-06-16] 대회 기간 수동 입력 제거 — 경기 일정에서 자동 산출.
    scheduleHint: "경기별 상대팀과 일정을 입력하세요. 대회 기간은 경기 일정에서 자동 계산됩니다",
    capacityHint: "모집 마감일과 참가팀 정원을 설정해주세요",
    // [선불 단일 금액 입력 — 일정별 합계 대체]
    feeLabel: "대회 참가비",
    feePlaceholder: "대회 참가비를 입력하세요.",
    feeHint: "대회 전체 참가비를 입력하세요 (무료는 0 또는 비워두기)",
  },
  approvals: {
    emptyApprovalHistory: "승인 대기 이력이 없습니다",
  },
  myProfile: {
    setNicknameHint: "닉네임을 설정해주세요",
  },
  teamSlogan: {
    placeholder: "팀 슬로건을 등록해 주세요",
  },
  tournamentStatus: {
    finished: "종료된 대회입니다.",
  },

  // ─── AA. Input placeholder 통합 (M4 마이그레이션 · 2026-05-10) ──
  placeholders: {
    // 검색 / 이름 입력
    searchMember: "회원 이름을 입력해주세요",
    searchStudent: "학생 이름을 입력해주세요",
    searchCoach: "코치 이름을 입력해주세요",
    searchFAQ: "질문을 검색하세요",
    enterNickname: "닉네임을 입력해주세요",
    enterFirstName: "성을 입력해주세요",
    enterLastName: "이름을 입력해주세요",
    enterFullName: "성함을 입력해주세요",
    enterMyName: "이름을 입력해주세요",
    enterTeamName: "팀명을 입력해주세요",
    // 메시지 / 댓글 / 공지
    enterRecipient: "받는 사람을 입력하세요",
    enterMessageSubject: "메시지 주제를 입력하세요",
    enterMessageBody: "전달할 내용을 입력하세요",
    enterCommentSimple: "댓글을 입력하세요",
    enterComment: "댓글을 입력해주세요",
    enterNoticeTitle: "공지 제목을 입력하세요",
    enterNoticeContent: "공지 내용을 입력하세요",
    enterTitleSimple: "제목을 입력하세요",
    enterFeedback: "의견을 자유롭게 작성해주세요",
    enterReportContent: "구체적인 내용을 입력해 주세요",
    // 결제 / 배송 / 포인트
    enterRecipientName: "수령인 이름을 입력해주세요",
    enterAddress: "배송지 주소를 입력해주세요",
    enterUsePoint: "사용할 포인트를 입력해주세요",
    // 주소 / 비밀번호
    searchAddress: "주소를 검색해주세요",
    enterDetailAddress: "상세주소를 입력해주세요",
    enterCurrentPassword: "현재 비밀번호를 입력하세요",
    enterNewPassword: "새 비밀번호를 입력하세요",
    enterConfirmPassword: "새 비밀번호를 다시 입력하세요",
    // 도메인별
    enterClassIntro: "수업 소개를 작성해주세요",
    enterTrainingIntro: "훈련 내용을 간단히 설명해주세요",
    enterAdminMemo: "관리자 메모를 입력해주세요",
    enterRejectReason: "거절 사유를 입력해주세요",
    enterCoachCareer: "경력 및 수상 내역을 상세히 입력해주세요",
    enterChildNote: "특이사항을 입력해주세요",
    enterTournamentRequest: "주최측에 전달할 요청 사항을 입력해주세요",
  },

  // ─── AB. 회차 조정 · 미결제 위젯 (월정액 결제 마이그레이션 Step 6/7/10) ──
  credits: {
    adjust: {
      title: "회차 조정",
      titleAdd: "회차 추가",
      titleSubtract: "회차 차감",
      amountLabel: "조정 회차",
      amountPlaceholder: "수량을 입력해주세요",
      amountHint: "양수: 추가, 음수: 차감 (-100 ~ +100, 0 불가)",
      reasonLabel: "조정 사유",
      reasonPlaceholder: "조정 사유를 입력해주세요",
      reasonHint: "학부모에게 표시되는 사유입니다 (2~200자)",
      confirmAdd: (amount: number) => `${amount}회를 추가하시겠습니까?`,
      confirmSubtract: (amount: number) =>
        `${Math.abs(amount)}회를 차감하시겠습니까?`,
      success: "회차가 조정되었습니다.",
      failure: "회차 조정에 실패했습니다.",
      submitting: "조정 중...",
      submit: "조정하기",
      cancel: "취소",
      forbidden: "권한이 없습니다. 감독에게 문의해주세요.",
    },
    history: {
      adjustedByCoachPositive: (amount: number, reason?: string) =>
        reason
          ? `감독 조정 (+${amount}회) · ${reason}`
          : `감독 조정 (+${amount}회)`,
      adjustedByCoachNegative: (amount: number, reason?: string) =>
        reason
          ? `감독 조정 (${amount}회) · ${reason}`
          : `감독 조정 (${amount}회)`,
      adjustedByCoachLabel: "감독 조정",
      expired: "기간 만료",
      carriedOver: "전월 이월",
    },
    // 정액(기간제) 수업권 — 회수 차감 없이 그 달 무제한, 만료일 게이트만.
    periodPass: {
      unlimited: "이 달 무제한",
      expiresLabel: (date: string) => `만료 ${date}`,
      noExpiry: "이 달 무제한",
      sessionPassCount: (n: number) => `회차권 ${n}회`,
    },
  },
  coachDashboard: {
    unpaidMembers: {
      title: (month: string) => `${month} 미결제 회원`,
      countLabel: (count: number) => `${count}명`,
      viewAll: "전체 보기",
      sendAlertAction: "알림 발송",
      sendAlertComingSoon: "알림 발송 기능은 준비 중입니다.",
      columnHeaderName: "학부모",
      columnHeaderChild: "자녀",
      columnHeaderClass: "수업",
      emptyTitle: "미결제 회원이 없습니다",
      emptyDescription: "모든 회원이 결제를 완료했습니다.",
    },
  },

  /**
   * 앱 설치 안내 — /get-app 페이지, AppInstallBanner, deeplink fallback 공용.
   * 외부 공유 링크(카카오톡 등)에서 진입한 미설치 사용자에게 노출된다.
   */
  appInstall: {
    pageTitle: "앱으로 더 편하게 이용하세요",
    pageSubtitle: "팀플러스 전용 앱에서 모든 기능을 빠르게 만나보세요.",
    detectedHint: (platform: "iOS" | "Android") =>
      `${platform} 기기로 접속하셨네요. 아래 버튼으로 설치를 진행해주세요.`,
    iosButton: "App Store에서 받기",
    androidButton: "Play Store에서 받기",
    otherDeviceTitle: "PC에서 보고 계신가요?",
    otherDeviceDescription:
      "휴대폰 카메라로 QR 코드를 스캔하거나 사용 중인 기기를 선택해주세요.",
    chooseDevice: "기기를 선택해주세요",
    chooseDeviceIos: "iPhone · iPad",
    chooseDeviceAndroid: "Android",
    continueWeb: "웹으로 계속 이용하기",
    bannerTitle: "팀플러스 앱이 더 빨라요",
    bannerDescription: "앱에서는 출석·결제·알림을 더 빠르게 받을 수 있어요.",
    bannerCta: "앱 받기",
    bannerDismissAria: "배너 닫기",
    redirecting: "스토어로 이동 중입니다…",
    placeholderWarning:
      "스토어 등록이 완료되지 않았어요. 잠시 후 다시 시도해주세요.",
  },

  /**
   * 수업 패키지 관리 — (coach) classes-manage/edit/[id] 섹션 + 학부모 결제 비활성 라벨 공용.
   * 백엔드 getClassProducts 응답의 disabledReason 과 라벨 일치를 유지한다.
   */
  // [Phase B-5-3] 후불(POSTPAID) 정산 — attendance-manage 내 후불 정산 섹션.
  postpaidSettlement: {
    title: "후불 정산",
    confirmedBadge: "확정됨",
    monthLabel: (ym: string) => {
      const [y, m] = ym.split("-");
      return `${y}년 ${Number(m)}월`;
    },
    prevMonth: "이전 달",
    nextMonth: "다음 달",
    attendanceUnit: (n: number, unit: number) =>
      `출석 ${n}회 × ${unit.toLocaleString()}원`,
    total: "총 청구 금액",
    empty: "해당 월 출석 내역이 없습니다.",
    confirmCta: "정산 확정 (결제 요청)",
    confirming: "처리 중...",
    confirmHint:
      "확정하면 회원에게 결제 요청 알림이 발송되고, 해당 월 출석은 수정할 수 없습니다.",
    monthNotEndedHint: "이번 달이 끝난 뒤 정산을 확정할 수 있어요.",
    confirmedToast: "정산이 확정되어 결제 요청이 발송되었습니다.",
  },
  // [Phase C] 선불 수업 회원별 출석 횟수 가시화 (출석관리 화면 임베드, 읽기 전용)
  monthlyAttendance: {
    title: "회원별 출석 횟수",
    monthLabel: (ym: string) => {
      const [y, m] = ym.split("-");
      return `${y}년 ${Number(m)}월`;
    },
    prevMonth: "이전 달",
    nextMonth: "다음 달",
    countUnit: (n: number) => `${n}회`,
    nominalNote: (n: number) => `패키지 ${n}회`,
    total: "총 출석",
    empty: "이번 달 출석 기록이 없어요.",
    hint: "출석 횟수로 수업 참여를 확인할 수 있어요. 선불 수업은 별도 정산이 없습니다.",
  },
  // [Phase B-5-4] 후불 결제 화면 (알림 deep-link 진입)
  postpaidPay: {
    title: "수업료 결제",
    invalid: "잘못된 결제 요청입니다. 알림에서 다시 시도해주세요.",
    paying: "결제 진행 중...",
    payCta: (won: number) => `${won.toLocaleString()}원 결제하기`,
    // [Phase B] 후불 결제 완료 문구 — 이미 출석한 수업에 대한 사후 정산이므로
    //   선불 "수업 N회 이용 가능" 대신 정산 완료 안내를 노출한다.
    completedNote: "이번 달 출석한 수업료 결제가 완료되었어요",
  },
  classProduct: {
    sectionTitle: "수업 패키지",
    sectionDescription: "패키지별로 수업료·유효기간을 다양하게 운영할 수 있어요.",
    // 후불 수업 수정 — 패키지 대신 노출하는 단순 수강료 카드 제목.
    feeSectionTitle: "수업료",
    // [Phase B-5] 결제 방식 (감독이 수업 생성 시 지정)
    billingModeLabel: "결제 방식",
    billingModePrepaid: "선불",
    billingModePostpaid: "후불",
    // [Phase B-6] 선택형(BOTH) — 학부모가 결제 시 선불/후불을 택1.
    billingModeBoth: "선택형",
    billingModePrepaidHint: "수업료를 미리 결제합니다. (정기·번들)",
    billingModePostpaidHint: "월말 출석 횟수에 따라 후불 정산합니다.",
    billingModeBothHint: "학부모가 결제 시 선불·후불 중 선택합니다.",
    // [Phase B-6] 정액 패키지 강제 — 선불·선택형은 정액 패키지가 1개 이상 있어야 등록 가능.
    validationMonthlyFixedRequired: "정액 패키지를 1개 이상 등록해주세요.",
    // [Phase B-6] 감독 정액 직접 수정 안내(A안).
    monthlyFixedAdjustHint: "매월 정액 금액은 감독이 직접 수정할 수 있어요.",
    // [Phase B-5] 가격 입력 라벨 (결제방식별) + 1회당 참고가
    singlePriceLabel: "1회 수업료",
    feePerSessionLabel: "1회 수업료",
    // [Phase B-6] 선불 수업의 1회 수업료 — 참고용(판매 안 함) 라벨·안내.
    singlePriceRefLabel: "1회 수업료 (참고)",
    singlePriceRefHint:
      "선불 수업의 1회 수업료는 참고용이며, 결제는 정액 패키지로 진행됩니다.",
    singlePricePlaceholder: "1회 수업료를 입력하세요.",
    // [Phase B-6] 선택형(BOTH) 결제 옵션 — 결제 방식 택1 UI.
    timingSelectTitle: "결제 방식 선택",
    timingPrepaidTitle: "선불 결제",
    timingPrepaidDesc: "정액 패키지를 미리 결제해요.",
    timingPostpaidTitle: "후불 정산",
    timingPostpaidDesc: "출석한 만큼 매월 정산해요.",
    selectPrepaidPackageTitle: "정액 패키지 선택",
    // [선택형(BOTH)] 1회 수업료(참고) 블록 — 선불·후불 공통 노출.
    singleFeeRefTitle: "1회 수업료",
    singleFeeRefPrepaidNote: "참고가",
    singleFeePostpaidNote: "출석 횟수만큼 월말 정산",
    singleFeeAmount: (won: number) => `${Number(won).toLocaleString()}원`,
    postpaidEnrollCta: "후불로 신청하기",
    postpaidEnrolling: "신청 중…",
    postpaidAmountNote: "결제 금액은 매월 출석 횟수에 따라 정산됩니다.",
    perSessionRef: (won: number) => `1회당 약 ${won.toLocaleString()}원`,
    // 결제일로부터 결제권이 만료되기까지의 유효기간 라벨 (1회권 포함 전 상품 공통).
    validDays: (days: number) => `유효 ${days}일`,
    addPackage: "패키지 추가",
    // 등록 화면 수강료 카드 내부에 임베드되는 추가 패키지(정기권) 영역 라벨.
    embedSectionLabel: "정기 패키지 (선택)",
    // 후불(POSTPAID) 수업 — 패키지 추가 차단 안내(출석 기반 정산).
    postpaidLockTitle: "후불 수업은 패키지를 추가할 수 없어요",
    postpaidLockHint:
      "후불 수업은 출석 횟수에 따라 1회 수업료로 월말 정산됩니다.",
    editPackage: "패키지 수정",
    deletePackage: "패키지 삭제",
    deleteConfirmTitle: "패키지를 삭제할까요?",
    deleteConfirmBody:
      "결제 또는 수강 이력이 있다면 비활성으로 전환되고, 신규 결제만 차단됩니다.",
    softDeletedToast: "결제 이력이 있어 비활성으로 전환되었습니다.",
    hardDeletedToast: "패키지가 삭제되었습니다.",
    saveSuccess: "패키지가 저장되었습니다.",
    fieldProductName: "패키지명",
    fieldProductNamePlaceholder: "예) 주 2회 4주 정기권",
    fieldDescription: "설명",
    fieldDescriptionPlaceholder: "예) 주 2회 수업 · 4주 유효",
    fieldPrice: "가격(원)",
    fieldDurationDays: "유효기간(일)",
    fieldSessionsPerMonth: "월 횟수",
    fieldSessionsPerWeek: "주당 횟수",
    fieldFeePerSession: "회당 단가(원)",
    fieldIsActive: "활성화",
    fieldIsActiveHelp: "비활성화 시 결제 화면에서 선택할 수 없습니다.",
    badgeInactive: "비활성",
    badgeEndDateExceed: "수업 종료일 초과",
    badgeClassEnded: "수업 종료",
    listBadgeClassEnded: "종료된 수업",
    emptyTitle: "등록된 패키지가 없어요",
    emptyDescription: "감독·코치가 패키지를 등록해야 학부모가 결제할 수 있습니다.",
    unavailableEndDateExceed: "수업 종료일을 초과하는 패키지입니다",
    unavailableClassEnded: "이 수업은 종료되었습니다",
    selectAnotherPackage: "다른 패키지를 선택해주세요",
    validationProductName: "패키지명을 입력해주세요.",
    validationPrice: "가격을 올바르게 입력해주세요.",
    validationSessionsPerMonth: "월 횟수는 1 이상이어야 합니다.",
    validationDurationDays: "유효기간은 1일 이상이어야 합니다.",
    saveFailed: "저장에 실패했습니다. 잠시 후 다시 시도해주세요.",
    saving: "저장 중…",
    // 2026-05-22 옵션 F-2 — 수업 등록 폼 안내 + 수업 상세 관리 진입점.
    formHintCreate:
      "정기권·다중 패키지는 수업 등록 후 수업 상세의 \"수강 플랜\" 섹션에서 관리해요.",
    // 2026-05-22 옵션 H — PackageEditSheet 재설계 라벨.
    fieldWeeks: "주 수",
    fieldSessions: "수업 횟수",
    fieldProductNameHint: "(선택, 비우면 자동)",
    fieldDescriptionHint: "(선택, 비우면 자동)",
    validationWeeks: "주 수는 1~52 사이로 입력해주세요.",
    perSessionEditHint:
      "1회 수업료는 가격만 수정할 수 있어요. 다른 정보는 변경되지 않습니다.",
    previewTitle: "자동 계산",
    previewSessionsPerWeek: "주당 횟수",
    previewSessionsPerWeekHint: "(수업 일정 기준)",
    previewTotalSessions: "총 회차",
    previewDuration: "유효기간",
    // 2026-05-22 정책 — 수업권 사용 기간 한 줄 통합. 보너스 톤 X · 정책 명시 O.
    previewUsageWindow: "사용 기간",
    previewUsageWindowHint: (weeks: number, extraDays: number) =>
      `(수업 ${weeks}주 + 미사용 ${extraDays}일)`,
    // /payment/options 결제 직전 안내 박스.
    paymentInfoTitle: "수업권 이용 안내",
    paymentInfoUsableDays: (totalDays: number) =>
      `결제일부터 ${totalDays}일까지 사용 가능`,
    paymentInfoExtraDays: (extraDays: number) =>
      `본 수업 기간 종료 후에도 미사용 회차를 ${extraDays}일간 추가 사용 가능`,
    // 제출 시 일괄 반영 — 부분 성공/이탈 안내.
    bulkSaveFailed:
      "수업 정보는 저장됐지만 패키지 반영에 실패했습니다. 패키지를 다시 저장해주세요.",
    deferredDeleteHint:
      "패키지 추가·수정·삭제는 ‘수정하기’를 눌러야 저장됩니다.",
    unsavedLeaveConfirm:
      "저장하지 않은 패키지 변경이 있습니다. 이 페이지를 벗어나면 변경 내용이 사라집니다.",
  },
} as const;
