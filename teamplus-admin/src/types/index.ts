/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TEAMPLUS API Type Definitions
 * 모든 API 응답 및 요청 타입 정의
 */

// ==================== Enums ====================

/**
 * 사용자 유형
 */
export enum UserType {
  PARENT = 'parent',
  COACH = 'coach',
  ADMIN = 'admin',
  CHILD = 'child',
  TEEN = 'teen',
  DIRECTOR = 'director',
  ACADEMY_DIRECTOR = 'academy_director',
}

/**
 * 상태 (승인, 결제, 출석 등)
 */
export enum Status {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  PRESENT = 'present',
  ABSENT = 'absent',
  SENT = 'sent',
  DELIVERED = 'delivered',
}

// ==================== User & Auth ====================

/**
 * 사용자 정보
 */
export interface User {
  id: string;
  username?: string; // 사용자명
  email: string;
  phone: string;
  userType: UserType;
  name?: string;
  department?: string; // 부서
  position?: string; // 직책
  profileImage?: string; // 프로필 이미지 URL
  lastLoginAt?: string; // 마지막 로그인 시간
  createdAt: string;
  updatedAt: string;
}

/**
 * 인증 응답
 */
export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // 초 단위
}

/**
 * 로그인 요청
 */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * 암호화된 로그인 요청 (E2E 암호화)
 * AES-256-GCM으로 암호화된 이메일/비밀번호 전송
 */
export interface EncryptedLoginRequest {
  encryptedData: string; // Base64-encoded 암호화 데이터
  iv: string; // Base64-encoded Initialization Vector (16바이트)
  authTag: string; // Base64-encoded 인증 태그 (16바이트)
}

/**
 * 회원가입 요청
 */
export interface RegisterRequest {
  email: string;
  password: string;
  phone: string;
  userType: UserType;
  username?: string; // 사용자명 (선택)
  name?: string;
}

/**
 * 토큰 갱신 응답
 */
export interface RefreshTokenResponse {
  accessToken: string;
  // [2026-06-04] 백엔드 Token Rotation 대응 — refresh 시 새 refresh 토큰이 함께 발급된다.
  //   이전 토큰은 즉시 revoke 되므로 반드시 새 값으로 교체 저장해야 한다(미교체 시 재사용→401).
  refreshToken?: string;
  expiresIn?: number;
}

// ==================== Team ====================

/**
 * 팀 정보 (백엔드 Team 모델, /api/v1/admin/clubs alias 라우트 호환).
 * Club 은 historical alias — 신규 코드는 Team 사용.
 */
export interface Club {
  id: string;
  /** 초대 코드 (백엔드 alias: clubCode 보존, 일반 라우트는 teamCode) */
  clubCode?: string;
  /** 팀 코드 (신규 표준 필드) */
  teamCode?: string;
  /** 팀 이름 (백엔드 alias: clubName 보존, 일반 라우트는 name) */
  clubName?: string;
  /** 팀 이름 (신규 표준 필드) */
  name?: string;
  coachId?: string;
  coach?: User;
  directorName?: string;
  directorEmail?: string;
  description?: string;
  location?: string;
  phone?: string;
  memberCount?: number;
  classCount?: number;
  createdAt: string;
  updatedAt?: string;
}

/**
 * 팀 멤버 (백엔드 TeamMember 모델 호환)
 */
export interface TeamMember {
  id: string;
  userId: string;
  user?: User;
  /** 팀 ID (백엔드 일반 라우트는 teamId, alias 호환은 clubId) */
  teamId?: string;
  clubId?: string;
  team?: Club;
  club?: Club;
  playerName: string;
  playerAge: number;
  approvalStatus: Status;
  createdAt: string;
  updatedAt: string;
}

/**
 * @deprecated `TeamMember` 사용. ClubMember 는 historical alias.
 */
export type ClubMember = TeamMember;

/**
 * 팀 가입 요청
 */
export interface JoinClubRequest {
  /** 팀 코드 (백엔드 DTO 는 teamCode, alias 호환은 clubCode) */
  teamCode?: string;
  clubCode?: string;
  playerName: string;
  playerAge: number;
}

/**
 * 멤버 승인 요청
 */
export interface ApproveMemberRequest {
  memberId: string;
  approvalStatus: Status.APPROVED | Status.REJECTED;
}

/**
 * 대량 멤버 승인 요청
 */
export interface BulkApproveMembersRequest {
  memberIds: string[];
  approvalStatus: Status.APPROVED | Status.REJECTED;
}

// ==================== Class ====================

/**
 * 수업 정보
 */
export interface Class {
  id: string;
  /** 팀 ID — 백엔드 응답 표준 (구 alias: clubId) */
  teamId?: string;
  clubId?: string;
  team?: Club;
  club?: Club;
  className: string;
  description?: string;
  ageMin?: number;
  ageMax?: number;
  capacity: number;
  currentEnrollment?: number;
  schedules?: ClassSchedule[];
  products?: ClassProduct[];
  /** 승인 상태 — Backend getClass() 응답과 정합 */
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  /** 반려 사유 (approvalStatus='REJECTED' 일 때) */
  rejectionReason?: string | null;
  /** 승인 완료 시각 */
  approvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 수업 일정
 */
export interface ClassSchedule {
  id: string;
  classId: string;
  class?: Class;
  scheduledDate: string; // ISO 8601 format
  isCancelled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 수업 상품 (가격 정보)
 */
export interface ClassProduct {
  id: string;
  classId: string;
  class?: Class;
  productName: string;
  price: number; // Decimal을 number로 변환
  sessionsPerMonth: number; // SPEC §4 재해석: "총 회수" 의미 (옛 모델에서는 "월 N회")
  description?: string;
  // PACKAGE_WEEKS_SPEC §6 신규 필드 — 정기권 단위 정합 (web/backend 와 SoT 통일).
  durationDays?: number | null;
  packageWeeks?: number | null;
  packageTotalSessions?: number | null;
  packageSessionsPerWeek?: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 수업 등록 요청
 */
export interface EnrollClassRequest {
  classId: string;
  memberId: string;
  productId: string;
}

// ==================== Payment ====================

/**
 * 결제 정보
 */
export interface Payment {
  id: string;
  orderNumber: string; // 주문 번호 (중복 방지)
  userId: string;
  user?: User;
  memberId?: string;
  member?: TeamMember;
  productId?: string;
  product?: ClassProduct;
  amount: number;
  paymentStatus: Status;
  tid?: string; // KG이니시스 거래 ID
  paymentMethod?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 결제 생성 요청
 */
export interface CreatePaymentRequest {
  memberId: string;
  productId: string;
  amount: number;
  returnUrl: string; // 결제 완료 후 리다이렉트 URL
  cancelUrl: string; // 결제 취소 시 리다이렉트 URL
}

/**
 * 결제 결과
 */
export interface PaymentResult {
  success: boolean;
  payment?: Payment;
  message: string;
  redirectUrl?: string; // KG이니시스 결제 페이지 URL
}

/**
 * 결제 검증 요청
 */
export interface VerifyPaymentRequest {
  tid: string; // KG이니시스 거래 ID
  orderNumber: string;
}

// ==================== Attendance ====================

/**
 * 출석 정보
 */
export interface Attendance {
  id: string;
  scheduleId: string;
  schedule?: ClassSchedule;
  memberId: string;
  member?: TeamMember;
  attendanceStatus: Status;
  checkInTime?: string;
  qrCode?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 출석 체크인 요청
 */
export interface CheckInRequest {
  scheduleId: string;
  memberId: string;
  qrCode: string;
}

/**
 * 출석 이력 조회 필터
 */
export interface AttendanceHistoryFilter {
  memberId?: string;
  scheduleId?: string;
  startDate?: string;
  endDate?: string;
  status?: Status;
}

// ==================== Credit ====================

/**
 * 회원 결제권 정보
 */
export interface MemberCredit {
  id: string;
  memberId: string;
  member?: TeamMember;
  totalCredits: number;
  usedCredits: number;
  remainingCredits: number; // 계산된 값
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== Community (Team Posts & Events) ====================

export interface TeamPostAttachment {
  id: string;
  postId: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  displayOrder: number;
  createdAt: string;
}

export interface TeamPost {
  id: string;
  /** 팀 ID — 백엔드 응답 표준 (구 alias: clubId) */
  teamId?: string;
  clubId?: string;
  team?: Club;
  club?: Club;
  authorId: string;
  author?: User;
  title: string;
  content: string;
  postType: string; // announcement|lesson|tournament|friendly|survey
  targetLevel?: string;
  isPinned: boolean;
  isActive: boolean;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  isLikedByMe?: boolean;
  attachments?: TeamPostAttachment[];
  comments?: TeamPostComment[];
  createdAt: string;
  updatedAt: string;
}

export interface TeamPostComment {
  id: string;
  postId: string;
  post?: TeamPost;
  authorId: string;
  author?: User;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamPostLike {
  id: string;
  postId: string;
  userId: string;
  user?: User;
  createdAt: string;
}

export interface CommunityStats {
  postCount: number;
  eventCount: number;
  totalLikes: number;
  totalComments: number;
}

export interface TeamEvent {
  id: string;
  /** 팀 ID — 백엔드 응답 표준 (구 alias: clubId) */
  teamId?: string;
  clubId?: string;
  team?: Club;
  club?: Club;
  title: string;
  description?: string;
  eventType: string; // clinic|trial|tournament|friendly|meeting
  targetLevel?: string;
  capacity?: number | null;
  startAt: string;
  endAt: string;
  priceMode: string; // payment|credit|free
  priceAmount?: number | null;
  status: string; // draft|published|closed|cancelled
  createdAt: string;
  updatedAt: string;
}

export interface TeamEventRegistration {
  id: string;
  eventId: string;
  event?: TeamEvent;
  memberId: string;
  member?: TeamMember;
  status: string; // pending|confirmed|cancelled|waiting
  paid: boolean;
  paymentId?: string | null;
  payment?: Payment;
  memo?: string;
  createdAt: string;
}

// ==================== Notification ====================

/**
 * 알림 정보
 */
export interface Notification {
  id: string;
  userId: string;
  user?: User;
  notificationType: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 알림톡 로그
 */
export interface AlimtalkLog {
  id: string;
  notificationId: string;
  notification?: Notification;
  phone: string;
  templateCode: string;
  status: Status;
  sentAt?: string;
  deliveredAt?: string;
  failedReason?: string;
  createdAt: string;
}

// ==================== System ====================

/**
 * 시스템 공지
 */
export interface SystemNotice {
  id: string;
  title: string;
  content: string;
  isPinned?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 감사 로그
 */
export interface AuditLog {
  id: string;
  userId: string;
  user?: User;
  action: string; // login, payment, attendance 등
  resource: string; // club_id, payment_id 등
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ==================== API Response Wrappers ====================

/**
 * API 성공 응답
 */
export interface ApiResponse<T> {
  success: true;
  data: T;
  message?: string;
}

/**
 * API 에러 응답
 */
export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * 페이지네이션 메타데이터
 */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

/**
 * 페이지네이션 응답
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

/**
 * 페이지네이션 요청 파라미터
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ==================== Shop ====================

/**
 * 주문 상태
 */
export enum OrderStatus {
  PENDING = 'pending',
  PAID = 'paid',
  PREPARING = 'preparing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

/**
 * 상품 카테고리
 *
 * 2026-05-20 Phase C-D — alias dual emit 제거 완료. canonical only.
 *   백엔드 매퍼/DTO/요청 키 모두 `level` · `displayOrder` 만 사용.
 *   참조: docs/Guides/CLAUDE_STANDARDS.md "API 응답 매퍼 — Dual Emit 패턴" 섹션 (제거 정책 Phase C 단계).
 */
export interface ShopCategory {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  parent?: ShopCategory;
  children?: ShopCategory[];
  /** 정렬 순서 (오름차순) */
  displayOrder: number;
  isActive: boolean;
  /** 계층 레벨 (1: 대분류 ~ 4: 세분류) */
  level: number;
  productCount?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 상품 이미지
 */
export interface ShopProductImage {
  id: string;
  productId: string;
  imageUrl: string;
  altText?: string;
  isMain: boolean;
  displayOrder: number;
  createdAt: string;
}

/**
 * 상품 옵션
 */
export interface ShopProductOption {
  id: string;
  productId: string;
  optionName: string;
  optionValue: string;
  additionalPrice: number;
  stock: number;
  isActive: boolean;
  createdAt: string;
}

/**
 * 상품 정보
 */
export interface ShopProduct {
  id: string;
  categoryId: string;
  category?: ShopCategory;
  name: string;
  code: string;
  description?: string;
  price: number;
  salePrice?: number;
  costPrice?: number;
  stock: number;
  minOrderQty: number;
  maxOrderQty?: number;
  brand?: string;
  manufacturer?: string;
  origin?: string;
  weight?: number;
  isActive: boolean;
  isFeatured: boolean;
  isNew: boolean;
  viewCount: number;
  salesCount: number;
  images?: ShopProductImage[];
  options?: ShopProductOption[];
  createdAt: string;
  updatedAt: string;
}

/**
 * 상품 생성/수정 요청
 */
export interface CreateProductRequest {
  categoryId: string;
  name: string;
  code: string;
  description?: string;
  price: number;
  salePrice?: number;
  costPrice?: number;
  stock: number;
  minOrderQty?: number;
  maxOrderQty?: number;
  brand?: string;
  manufacturer?: string;
  origin?: string;
  weight?: number;
  isActive?: boolean;
  isFeatured?: boolean;
  isNew?: boolean;
  images?: {
    imageUrl: string;
    altText?: string;
    isMain: boolean;
    displayOrder: number;
  }[];
  options?: {
    optionName: string;
    optionValue: string;
    additionalPrice: number;
    stock: number;
    isActive?: boolean;
  }[];
}

/**
 * 주문 상품
 */
export interface ShopOrderItem {
  id: string;
  orderId: string;
  productId: string;
  product?: ShopProduct;
  productName: string;
  productCode: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  price?: number; // 단가 (unitPrice alias)
  options?: Record<string, string>;
  optionValue?: string; // 옵션 표시용 문자열
  createdAt: string;
}

/**
 * 배송 정보
 */
export interface ShippingInfo {
  id: string;
  orderId: string;
  recipientName: string;
  phone: string;
  recipientPhone?: string; // phone alias
  postalCode: string;
  address: string;
  addressDetail?: string;
  deliveryMemo?: string;
  memo?: string; // deliveryMemo alias
  trackingNumber?: string;
  courierCode?: string;
  courierName?: string;
  shippedAt?: string;
  deliveredAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 주문 정보
 */
export interface ShopOrder {
  id: string;
  orderNumber: string;
  userId: string;
  user?: User;
  status: OrderStatus;
  totalAmount: number;
  shippingFee: number;
  discountAmount: number;
  finalAmount: number;
  orderMemo?: string;
  paymentMethod?: string;
  paidAt?: string;
  items?: ShopOrderItem[];
  shippingInfo?: ShippingInfo;
  createdAt: string;
  updatedAt: string;
}

/**
 * 주문 생성 요청
 */
export interface CreateOrderRequest {
  items: {
    productId: string;
    quantity: number;
    options?: Record<string, string>;
  }[];
  shippingAddress: {
    recipientName: string;
    phone: string;
    postalCode: string;
    address: string;
    addressDetail?: string;
    deliveryMemo?: string;
  };
  orderMemo?: string;
}

/**
 * 주문 상태 변경 요청
 */
export interface UpdateOrderStatusRequest {
  status: OrderStatus;
  trackingNumber?: string;
  courierCode?: string;
  note?: string;
}

/**
 * 상품 필터 파라미터
 */
export interface ProductFilterParams extends PaginationParams {
  categoryId?: string;
  isActive?: boolean;
  isFeatured?: boolean;
  isNew?: boolean;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
}

/**
 * 주문 필터 파라미터
 */
export interface OrderFilterParams extends PaginationParams {
  status?: OrderStatus;
  startDate?: string;
  endDate?: string;
  search?: string;
}

/**
 * 쇼핑몰 통계
 */
export interface ShopStats {
  // 기본 통계
  totalOrders: number;
  totalRevenue?: number;
  totalSales?: number; // totalRevenue alias
  totalProducts: number;
  averageOrderValue?: number;

  // 주문 상태별 통계
  pendingOrders: number;
  shippedOrders?: number;
  completedOrders?: number;
  cancelledOrders?: number;

  // 기간별 통계
  todayOrders?: number;
  todayRevenue?: number;
  monthlyOrders?: number;
  monthlyRevenue?: number;

  // 상위 상품
  topProducts?: {
    id: string;
    name: string;
    productId?: string;
    productName?: string;
    salesCount: number;
    revenue: number;
  }[];

  // 카테고리별 매출
  salesByCategory?: {
    categoryId: string;
    categoryName: string;
    sales: number;
    percentage: number;
  }[];

  // 매출 추이
  salesTrend?: {
    date: string;
    amount: number;
  }[];
}

/**
 * 이미지 업로드 응답
 */
export interface ImageUploadResponse {
  url: string;
  filename: string;
}

// ==================== Error Codes ====================

/**
 * API 에러 코드
 */
export enum ErrorCode {
  // Auth
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',

  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',

  // Resource
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',

  // Business Logic
  INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS',
  CLASS_FULL = 'CLASS_FULL',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  ALREADY_CHECKED_IN = 'ALREADY_CHECKED_IN',

  // System
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  NETWORK_ERROR = 'NETWORK_ERROR',
}
/* eslint-disable @typescript-eslint/no-explicit-any */
