-- AlterTable: Sign in with Apple refresh token 저장 (계정 삭제 시 Apple 토큰 revoke 용 · iOS 5.1.1(v))
ALTER TABLE "social_accounts" ADD COLUMN "apple_refresh_token" TEXT;
