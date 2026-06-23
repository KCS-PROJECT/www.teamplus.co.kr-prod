/**
 * 공통 타입 정의 인덱스
 */

export * from './identity';
export * from './api';
export * from './payment';
export * from './rsvp';
export * from './waitlist';

export enum View {
  LOGIN = 'LOGIN',
  FIND_ID = 'FIND_ID',
  FIND_PW = 'FIND_PW',
  SIGN_UP = 'SIGN_UP',
}

/** @deprecated 각 컴포넌트에서 필요한 역할 타입을 직접 정의하세요. TEEN, CHILD, ADMIN 등이 누락되어 있습니다. */
export type UserRole = 'PARENT' | 'DIRECTOR' | 'COACH';

export interface TabProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
}
