/**
 * Auth 공통 컴포넌트 Barrel Export
 *
 * @example
 *   import { AuthRequired, AuthenticatedLink } from '@/components/auth';
 */

export { AuthRequired, default as AuthRequiredDefault } from './AuthRequired';
export {
  AuthenticatedLink,
  default as AuthenticatedLinkDefault,
} from './AuthenticatedLink';
export type { AuthenticatedLinkProps } from './AuthenticatedLink';
