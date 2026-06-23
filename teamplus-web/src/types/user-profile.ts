/**
 * UserProfile 공통 타입 정의
 *
 * 여러 페이지에서 공통 사용되는 UserProfile 인터페이스.
 * - drawer/page.tsx, more/page.tsx, mypage/page.tsx, my-profile/page.tsx 에서 공통 사용
 * - shop-profile/page.tsx는 쇼핑몰 전용 (ShopUserProfile)으로 별도 정의
 */

/** 사용자 역할 (6개 역할 전체 포함) */
export type UserRole =
  | 'parent'
  | 'coach'
  | 'admin'
  | 'director'
  | 'teen'
  | 'child';

/** 공통 사용자 프로필 */
export interface UserProfile {
  /** 사용자 이름 */
  name: string;
  /** 사용자 역할 */
  role: UserRole | string;
  /** 역할 한글 라벨 (예: '학부모', '코치') */
  roleLabel?: string;
  /** 프로필 상태 메시지 */
  message?: string;
  /** 이메일 주소 */
  email?: string;
  /** 프로필 이미지 URL */
  avatarUrl?: string;
}

/** 쇼핑몰 전용 사용자 프로필 */
export interface ShopUserProfile {
  /** 사용자 이름 */
  name: string;
  /** 회원 등급 */
  grade: string;
  /** 퍽 포인트 */
  puckPoints: number;
  /** 보유 쿠폰 수 */
  coupons: number;
  /** 위시리스트 수 */
  wishlistCount: number;
}
