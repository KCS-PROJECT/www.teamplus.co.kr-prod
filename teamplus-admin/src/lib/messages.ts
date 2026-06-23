/**
 * TEAMPLUS Admin 표준 메시지
 *
 * 공통 메시지는 @shared/constants/messages.ts에서 가져옵니다.
 * Admin 전용 메시지는 이 파일에서 확장합니다.
 *
 * 사용법:
 * import { MESSAGES } from '@/lib/messages';
 * toast.success(MESSAGES.save.success);
 */
import { MESSAGES as SHARED_MESSAGES } from '@shared/constants/messages';

export const MESSAGES = {
  ...SHARED_MESSAGES,

  // Admin 전용 메시지
  member: {
    approved: '회원이 승인되었습니다.',
    rejected: '회원이 거절되었습니다.',
    approveError: '승인 처리에 실패했습니다.',
    rejectError: '거절 처리에 실패했습니다.',
    bulkApproved: (count: number) => `${count}명의 회원이 승인되었습니다.`,
    bulkRejected: (count: number) => `${count}명의 회원이 거절되었습니다.`,
    statusChanged: '회원 상태가 변경되었습니다.',
  },
  notice: {
    sent: '공지가 발송되었습니다.',
    sendError: '공지 발송에 실패했습니다. 다시 시도해주세요.',
  },
  club: {
    created: '클럽이 등록되었습니다.',
    updated: '클럽이 수정되었습니다.',
    deleted: '클럽이 삭제되었습니다.',
    createError: '클럽 생성에 실패했습니다.',
    updateError: '클럽 수정에 실패했습니다.',
    nameRequired: '클럽명을 입력해주세요.',
  },
  product: {
    requiredFields: '필수 항목(카테고리, 상품명, 코드, 가격)을 입력해주세요.',
    saveError: '상품 저장에 실패했습니다. 다시 시도해주세요.',
    deleteError: '상품 삭제에 실패했습니다.',
  },
  settlement: {
    approved: '정산이 승인되었습니다.',
    rejected: '정산이 거절되었습니다.',
    approveError: '정산 승인에 실패했습니다.',
    rejectError: '정산 거절에 실패했습니다.',
    payError: '정산 지급에 실패했습니다.',
    csvExported: 'CSV 파일로 내보내기가 완료되었습니다.',
  },
  tournament: {
    // 참가 자격 출생연도 표시 라벨. 개별 집합(eligibleBirthYears) 우선, 없으면 범위(from/to) 폴백.
    eligibleYearsLabel: (years: number[]) =>
      `${[...years].sort((a, b) => a - b).join('·')}년생`,
    eligibleRangeLabel: (from: number, to: number) => `${from}~${to}년생`,
    eligibleFromLabel: (from: number) => `${from}년생~`,
    eligibleToLabel: (to: number) => `~${to}년생`,
    eligibleNone: '연령 제한 없음',
  },
  tournamentSettlement: {
    confirm: (count: number, total: number) =>
      `참가자 ${count}명에게 총 ${total.toLocaleString()}원을 청구합니다. 진행하시겠습니까?`,
    success: (count: number, total: number) =>
      `참가자 ${count}명에게 총 ${total.toLocaleString()}원 청구가 완료되었습니다.`,
    error: '대회 정산에 실패했습니다. 다시 시도해주세요.',
    feeRequired: '1인당 참가비를 입력해주세요. (1원 이상)',
    notFinished: '종료된 대회만 정산할 수 있습니다.',
    noTarget: '청구 대상 참가자가 없습니다.',
  },
  terms: {
    requiredFields: '약관 유형, 제목, 내용을 모두 입력해주세요.',
    createError: '약관 등록에 실패했습니다.',
  },
  version: {
    requiredFields: '버전 번호와 최소 요구 버전은 필수 입력 항목입니다.',
    createError: '버전 등록에 실패했습니다.',
  },
  faq: {
    requiredFields: '질문과 답변은 필수 입력 항목입니다.',
    saveError: 'FAQ 저장에 실패했습니다.',
    deleteError: 'FAQ 삭제에 실패했습니다.',
  },
  banner: {
    requiredFields: '제목은 필수이며, 링크 유형이 있을 경우 링크 URL도 필수입니다.',
    saveError: '배너 저장에 실패했습니다.',
    deleteError: '배너 삭제에 실패했습니다.',
    statusError: '배너 상태 변경에 실패했습니다.',
  },
  menu: {
    loadError: '메뉴를 불러오는데 실패했습니다.',
    nameRequired: '메뉴 이름을 입력해주세요.',
    pathRequired: '경로를 입력해주세요. 아코디언 그룹은 # 을 입력하세요.',
    saved: '저장되었습니다.',
    saveError: '저장에 실패했습니다.',
    cancelled: '변경 사항이 취소되었습니다.',
    resetSuccess: '기본 메뉴로 초기화했습니다.',
    resetError: '초기화에 실패했습니다.',
  },
  shopProduct: {
    deleted: '상품이 삭제되었습니다.',
    deleteError: '상품 삭제에 실패했습니다.',
    statusError: '상태 변경에 실패했습니다.',
    copied: '복사되었습니다.',
    nameRequired: '상품명을 입력해주세요.',
    skuRequired: '상품 코드(SKU)를 입력해주세요.',
    priceRequired: '판매가를 입력해주세요.',
    categoryRequired: '카테고리를 선택해주세요.',
    created: '상품이 등록되었습니다.',
    updated: '상품이 수정되었습니다.',
    createError: '상품 등록에 실패했습니다.',
    imageUploadError: '이미지 업로드에 실패했습니다.',
  },
  shopOrder: {
    selectRequired: '변경할 주문을 선택해주세요.',
    statusChanged: '주문 상태가 변경되었습니다.',
    statusError: '상태 변경에 실패했습니다.',
    cancelled: '주문이 취소되었습니다.',
    cancelError: '주문 취소에 실패했습니다.',
    copied: '클립보드에 복사되었습니다.',
  },
  adminNotice: {
    created: '공지사항이 등록되었습니다.',
    updated: '공지사항이 수정되었습니다.',
    createError: '공지사항 등록에 실패했습니다. 다시 시도해 주세요.',
    updateError: '공지사항 수정에 실패했습니다. 다시 시도해 주세요.',
    deleteError: '공지사항 삭제에 실패했습니다. 다시 시도해 주세요.',
  },
  coupon: {
    created: '쿠폰이 생성되었습니다.',
    updated: '쿠폰이 수정되었습니다.',
    deleted: '쿠폰이 삭제되었습니다.',
    deleteError: '쿠폰 삭제에 실패했습니다. 다시 시도해주세요.',
    codeCopied: '쿠폰 코드가 복사되었습니다.',
  },
  shopCategory: {
    maxDepth: '최대 4단계까지만 생성할 수 있습니다.',
    nameRequired: '카테고리명을 입력해주세요.',
    saveError: '카테고리 저장에 실패했습니다.',
    hasChildren:
      '하위 카테고리가 있는 경우 삭제할 수 없습니다. 하위 카테고리를 먼저 삭제해주세요.',
    deleteError: '카테고리 삭제에 실패했습니다.',
    statusError: '상태 변경에 실패했습니다.',
  },
  review: {
    visibilityError: '공개 여부 변경에 실패했습니다.',
    deleteError: '삭제에 실패했습니다.',
  },
  tms: {
    attachmentLimit: '첨부파일은 최대 5개까지 가능합니다.',
    fileUploadError: '파일 업로드에 실패했습니다.',
    postRequiredFields: '제목, 내용, 작성자 이름은 필수입니다.',
    postCreated: '게시글이 등록되었습니다.',
    postCreateError: '게시글 등록에 실패했습니다.',
    statusChanged: '상태가 변경되었습니다.',
    statusError: '상태 변경에 실패했습니다.',
    postDeleted: '게시글이 삭제되었습니다.',
    deleteError: '삭제에 실패했습니다.',
    assigneeChanged: '담당자가 변경되었습니다.',
    assigneeError: '담당자 변경에 실패했습니다.',
    loadError: '게시글을 불러올 수 없습니다.',
    editRequiredFields: '제목과 내용은 필수입니다.',
    updated: '수정되었습니다.',
    updateError: '수정에 실패했습니다.',
    commentRequired: '작성자 이름과 댓글 내용을 입력하세요.',
    commentCreated: '댓글이 등록되었습니다.',
    commentError: '댓글 등록에 실패했습니다.',
  },
  clubBoard: {
    postRequired: '제목과 내용을 입력해주세요.',
    postCreated: '게시글이 등록되었습니다.',
    postCreateError: '게시글 생성에 실패했습니다. 다시 시도해주세요.',
    eventRequired: '제목과 일시를 입력해주세요.',
    eventCreated: '이벤트가 생성되었습니다.',
    eventCreateError: '이벤트 생성에 실패했습니다. 다시 시도해주세요.',
  },
  permission: {
    saved: '권한 설정이 저장되었습니다.',
    savedLocal: '권한 설정이 저장되었습니다. (로컬)',
    reset: '변경 사항이 초기화되었습니다.',
    restored: '기본 권한으로 복원되었습니다.',
  },
  dashboardNotice: {
    titleMinLength: '제목은 2자 이상 입력해주세요.',
    titleMaxLength: '제목은 200자 이하로 입력해주세요.',
    contentMinLength: '내용은 10자 이상 입력해주세요.',
    contentMaxLength: '내용은 10,000자 이하로 입력해주세요.',
    saveErrorRetry: '저장에 실패했습니다. 다시 시도해주세요.',
    deleteErrorRetry: '삭제에 실패했습니다. 다시 시도해주세요.',
  },
  settlementDynamic: {
    paid: (amount: number) =>
      `${amount.toLocaleString()}원 지급이 완료되었습니다.`,
  },
  systemImport: {
    noSheets: '엑셀 파일에 시트가 없습니다.',
  },
  pushNotification: {
    templateRequired: '발송할 템플릿을 선택해주세요.',
    customMessageRequired: '커스텀 메시지를 입력해주세요.',
    targetRequired: '발송 대상 회원을 선택해주세요.',
    sendError: '발송에 실패했습니다. 다시 시도해주세요.',
  },
  settings: {
    saved: '설정이 저장되었습니다.',
    resetConfirm: '설정을 초기화하시겠습니까?',
    reset: '설정이 초기화되었습니다.',
  },
  session: {
    expired: '세션이 만료되었습니다. 다시 로그인해주세요.',
    idleWarning: '장시간 미사용으로 자동 로그아웃됩니다.',
    extend: '세션 연장',
  },
  authGuard: {
    required: '로그인이 필요합니다.',
    requiredDescription: '로그인 후 다시 시도해주세요.',
    expired: '로그인이 만료되었습니다. 다시 로그인해주세요.',
    redirectingToLogin: '로그인 화면으로 이동합니다.',
    loginRequiredForAction: '이 기능을 사용하려면 로그인이 필요합니다.',
  },
  // [추가 2026-05-20 Phase 4] 통합 Uploader 메시지 — Web 의 messages.upload 와 1:1 동기화
  upload: {
    success: '업로드가 완료되었습니다.',
    start: '업로드를 시작합니다.',
    multiSuccess: (count: number) => `${count}개 파일 업로드가 완료되었습니다.`,
    partialFailed: (succeeded: number, failed: number) =>
      `${succeeded}개 성공, ${failed}개 실패했습니다.`,
    failed: '업로드에 실패했습니다. 잠시 후 다시 시도해주세요.',
    cancelled: '업로드가 취소되었습니다.',
    invalidType: '지원하지 않는 파일 형식입니다.',
    tooLarge: (maxMb: number) => `파일 크기가 ${maxMb}MB를 초과합니다.`,
    tooMany: (max: number) => `최대 ${max}개까지 업로드할 수 있습니다.`,
    totalTooLarge: (maxMb: number) => `총 업로드 크기가 ${maxMb}MB를 초과합니다.`,
    empty: '업로드할 파일을 선택해주세요.',
    dragHint: '파일을 끌어다 놓거나 클릭해서 선택하세요.',
    progress: (percent: number) => `업로드 중 · ${percent}%`,
    removeLabel: (index: number) => `${index}번째 파일 제거`,
    retry: '다시 시도하기',
    preview: (index: number) => `업로드 미리보기 ${index}`,
    cancelAction: '업로드 취소하기',
    successBadge: '업로드 완료',
    // [추가 2026-05-20 Phase 7 재검증] Web messages.upload 12 신규 키 1:1 동기화
    fileListLabel: '업로드 파일 목록',
    imageGridLabel: '업로드된 이미지 미리보기',
    avatarCurrentAlt: '현재 프로필 사진',
    avatarChangeChild: '프로필 사진 바꾸기',
    avatarChange: '프로필 사진 변경',
    avatarOpenLarge: '프로필 사진 크게 보기',
    fileAddChild: '파일 추가 📎',
    imageAddChild: '사진 추가 📷',
    fileAdd: '파일 추가하기',
    imageAdd: '사진 추가하기',
    fileUploadLabel: '파일 업로드',
    imageUploadLabel: '사진 업로드',
  },
} as const;
