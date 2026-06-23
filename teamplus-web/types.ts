export enum View {
  LOGIN = 'LOGIN',
  FIND_ID = 'FIND_ID',
  FIND_PW = 'FIND_PW',
  SIGN_UP = 'SIGN_UP',
}

export type UserRole = 'PARENT' | 'DIRECTOR' | 'COACH';

export interface TabProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
}