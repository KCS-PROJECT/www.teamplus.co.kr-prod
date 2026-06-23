import { registerAs } from "@nestjs/config";

export default registerAs("kakao", () => ({
  // 카카오 비즈니스 API 설정
  apiKey: process.env.KAKAO_API_KEY || "",
  senderKey: process.env.KAKAO_SENDER_KEY || "",
  apiUrl: process.env.KAKAO_API_URL || "https://api.kakaowork.com/v1/messages",

  // 알림톡 템플릿 코드 (카카오 비즈니스에서 사전 승인 필요)
  templateCodes: {
    paymentSuccess:
      process.env.KAKAO_TEMPLATE_PAYMENT_SUCCESS || "PAYMENT_SUCCESS_001",
    membershipApproved:
      process.env.KAKAO_TEMPLATE_MEMBERSHIP_APPROVED ||
      "MEMBERSHIP_APPROVED_001",
    classReminder:
      process.env.KAKAO_TEMPLATE_CLASS_REMINDER || "CLASS_REMINDER_001",
    attendanceConfirmed:
      process.env.KAKAO_TEMPLATE_ATTENDANCE_CONFIRMED ||
      "ATTENDANCE_CONFIRMED_001",
    creditExpiry:
      process.env.KAKAO_TEMPLATE_CREDIT_EXPIRY || "CREDIT_EXPIRY_001",
    classCancelled:
      process.env.KAKAO_TEMPLATE_CLASS_CANCELLED || "CLASS_CANCELLED_001",
  },

  // SMS 폴백 설정
  smsFallback: {
    enabled: process.env.SMS_FALLBACK_ENABLED === "true",
    senderNumber: process.env.SMS_SENDER_NUMBER || "",
  },

  // 재시도 설정
  retry: {
    attempts: parseInt(process.env.ALIMTALK_RETRY_ATTEMPTS || "3", 10),
    delay: parseInt(process.env.ALIMTALK_RETRY_DELAY || "1000", 10), // 1초
    backoff: process.env.ALIMTALK_RETRY_BACKOFF || "exponential", // exponential | linear
  },
}));
