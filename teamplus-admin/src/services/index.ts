/**
 * TEAMPLUS Services Barrel Export
 * 모든 서비스를 중앙에서 관리하고 내보내기
 */

// API Client
export { default as apiClient, api, setTokens, clearTokens, getAccessToken, getRefreshToken } from './api-client';

// Services
export { authService, default as authServiceDefault } from './auth.service';
export { clubService, default as clubServiceDefault } from './club.service';
export { classService, default as classServiceDefault } from './class.service';
export { paymentService, default as paymentServiceDefault } from './payment.service';
export { attendanceService, default as attendanceServiceDefault } from './attendance.service';
export { shopService, default as shopServiceDefault } from './shop.service';
export { userService, default as userServiceDefault } from './user.service';
export { rsvpService } from './rsvp.service';
export { waitlistService } from './waitlist.service';
export { tournamentRegistrationService } from './tournament-registration.service';
export { academyPromotionService } from './academy-promotion.service';
export { datetimeService, default as datetimeServiceDefault } from './datetime.service';
export type { DateTimeData } from './datetime.service';
export {
  uploadService,
  default as uploadServiceDefault,
  validateFile,
  uploadFile,
  uploadFiles,
  deleteFile as deleteUploadedFile,
  getFile as getUploadedFile,
  toAbsoluteUrl,
  UPLOAD_LIMITS,
  MULTI_UPLOAD_MAX_FILES,
  MULTI_UPLOAD_TOTAL_SIZE,
  UploadValidationError,
  UploadNetworkError,
  UploadCancelledError,
} from './upload.service';
export type {
  UploadCategory,
  UploadedFile,
  UploadProgress,
  UploadOptions,
  CategoryLimit,
} from './upload.service';

// Type Re-exports
export type * from '../types';

/**
 * 통합 서비스 객체
 * 모든 서비스를 하나의 객체로 접근 가능
 *
 * @example
 * import { services } from '@/services';
 *
 * const user = await services.auth.login(email, password);
 * const clubs = await services.club.getClubs();
 */
import { authService } from './auth.service';
import { clubService } from './club.service';
import { classService } from './class.service';
import { paymentService } from './payment.service';
import { attendanceService } from './attendance.service';
import { shopService } from './shop.service';
import { userService } from './user.service';
import { rsvpService } from './rsvp.service';
import { waitlistService } from './waitlist.service';
import { tournamentRegistrationService } from './tournament-registration.service';
import { academyPromotionService } from './academy-promotion.service';
import { uploadService } from './upload.service';
import { datetimeService } from './datetime.service';

export const services = {
  auth: authService,
  club: clubService,
  class: classService,
  payment: paymentService,
  attendance: attendanceService,
  shop: shopService,
  user: userService,
  rsvp: rsvpService,
  waitlist: waitlistService,
  tournamentRegistration: tournamentRegistrationService,
  academyPromotion: academyPromotionService,
  upload: uploadService,
  datetime: datetimeService,
};

export default services;
