import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "@/redis/redis.service";

/**
 * Account Lockout Service
 * Implements progressive account lockout to prevent brute-force attacks
 *
 * Strategy:
 * - Track failed login attempts in Redis
 * - Progressive lockout: 3 failures → 15 min lockout, 5 failures → 1 hour lockout
 * - Clear attempts on successful login
 */
@Injectable()
export class AccountLockoutService {
  private readonly logger = new Logger(AccountLockoutService.name);

  // Configuration
  private readonly LOCKOUT_THRESHOLDS = [
    { attempts: 3, duration: 900, lockoutLevel: 1 }, // 3 failures → 15 min lockout
    { attempts: 5, duration: 3600, lockoutLevel: 2 }, // 5 failures → 1 hour lockout
    { attempts: 10, duration: 86400, lockoutLevel: 3 }, // 10 failures → 24 hour lockout
  ];

  constructor(private redisService: RedisService) {}

  /**
   * Get the key for storing failed attempts
   */
  private getAttemptsKey(email: string): string {
    return `login_attempts:${email}`;
  }

  /**
   * Get the key for storing lockout status
   */
  private getLockoutKey(email: string): string {
    return `account_locked:${email}`;
  }

  /**
   * Check if account is locked
   * Returns: { isLocked, remainingTime, lockoutLevel }
   */
  async checkIfLocked(email: string): Promise<{
    isLocked: boolean;
    remainingTime?: number;
    lockoutLevel?: number;
  }> {
    const lockoutKey = this.getLockoutKey(email);
    const lockoutData = await this.redisService.get<{
      lockoutLevel: number;
      lockedAt: number;
      duration: number;
    }>(lockoutKey);

    if (!lockoutData) {
      return { isLocked: false };
    }

    const elapsedSeconds = Math.floor(
      (Date.now() - lockoutData.lockedAt) / 1000,
    );
    const remainingSeconds = lockoutData.duration - elapsedSeconds;

    if (remainingSeconds <= 0) {
      // Lockout expired, clean up
      await this.redisService.del(lockoutKey);
      await this.redisService.del(this.getAttemptsKey(email));
      return { isLocked: false };
    }

    return {
      isLocked: true,
      remainingTime: remainingSeconds,
      lockoutLevel: lockoutData.lockoutLevel,
    };
  }

  /**
   * Record a failed login attempt
   * Returns: { attempts, isLocked, lockoutDuration?, lockoutLevel? }
   */
  async recordFailedAttempt(email: string): Promise<{
    attempts: number;
    isLocked: boolean;
    lockoutDuration?: number;
    lockoutLevel?: number;
  }> {
    const attemptsKey = this.getAttemptsKey(email);
    const lockoutKey = this.getLockoutKey(email);

    // Increment attempt counter
    const attempts = await this.redisService.incr(attemptsKey);

    // Set TTL for attempts counter (24 hours) - resets every 24 hours
    if (attempts === 1) {
      await this.redisService.expire(attemptsKey, 86400);
    }

    this.logger.warn(
      `⚠️ Failed login attempt for ${email}: ${attempts} attempt(s)`,
    );

    // Check if we need to apply lockout
    const threshold = this.LOCKOUT_THRESHOLDS.find(
      (t) => attempts >= t.attempts,
    );

    if (threshold) {
      // Apply progressive lockout
      const existingLockout = await this.redisService.get<{
        lockoutLevel: number;
      }>(lockoutKey);

      // Only apply new lockout if it's a higher level
      if (
        !existingLockout ||
        existingLockout.lockoutLevel < threshold.lockoutLevel
      ) {
        const lockoutData = {
          lockoutLevel: threshold.lockoutLevel,
          lockedAt: Date.now(),
          duration: threshold.duration,
        };

        await this.redisService.set(
          lockoutKey,
          JSON.stringify(lockoutData),
          threshold.duration,
        );

        this.logger.warn(
          `🔒 Account locked for ${email}: Level ${threshold.lockoutLevel} (${threshold.duration}s)`,
        );

        return {
          attempts,
          isLocked: true,
          lockoutDuration: threshold.duration,
          lockoutLevel: threshold.lockoutLevel,
        };
      }
    }

    return {
      attempts,
      isLocked: false,
    };
  }

  /**
   * Clear failed attempts on successful login
   */
  async clearFailedAttempts(email: string): Promise<void> {
    const attemptsKey = this.getAttemptsKey(email);
    await this.redisService.del(attemptsKey);
    this.logger.debug(`✅ Cleared failed attempts for ${email}`);
  }

  /**
   * Get current attempt count for monitoring
   */
  async getAttemptCount(email: string): Promise<number> {
    const attemptsKey = this.getAttemptsKey(email);
    const count = await this.redisService.get<number>(attemptsKey);
    return count || 0;
  }

  /**
   * Manually unlock an account (admin operation)
   */
  async unlockAccount(email: string): Promise<void> {
    const attemptsKey = this.getAttemptsKey(email);
    const lockoutKey = this.getLockoutKey(email);

    await Promise.all([
      this.redisService.del(attemptsKey),
      this.redisService.del(lockoutKey),
    ]);

    this.logger.log(`🔓 Account unlocked by admin: ${email}`);
  }

  /**
   * Get detailed lockout status (for monitoring/admin)
   */
  async getLockoutStatus(email: string): Promise<{
    isLocked: boolean;
    attempts: number;
    remainingTime?: number;
    lockoutLevel?: number;
  }> {
    const lockoutStatus = await this.checkIfLocked(email);
    const attempts = await this.getAttemptCount(email);

    return {
      ...lockoutStatus,
      attempts,
    };
  }
}
