import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";

export interface PushPolicyContext {
  /** canonical notificationType — 카테고리 필터 판정에 사용 */
  notificationType?: string;
  /** 광고성 여부 (야간 법적 게이트는 발송 진입점에서 throw 로 선차단됨) */
  isMarketing?: boolean;
}

export type PushSuppressReason =
  | "push_disabled"
  | "category_disabled"
  | "quiet_hours";

export interface PushPolicyResult {
  /** 푸시 발송 허용 대상 */
  allowed: string[];
  /** 정책에 의해 억제된 대상 + 사유 (관측/CS 추적용) */
  suppressed: Array<{ userId: string; reason: PushSuppressReason }>;
}

/**
 * notificationType → 설정 카테고리(class|payment|notice|system) 매핑.
 *
 * 웹 알림함 탭 분류(teamplus-web/src/lib/notification-mapper.ts —
 * normalizeNotificationType/deriveCategory)와 동일한 prefix 규칙을 4개 설정
 * 카테고리로 수렴시킨 것. UserNotificationPreference.categories JSON 의 키와
 * 1:1 대응한다.
 *
 * 미분류 타입(chat_message, admin_push 등)은 null 을 반환하며 카테고리 필터를
 * **통과**한다 — 설정 화면에 토글이 없는 타입을 임의 분류로 차단하지 않는
 * 보수 정책 (웹의 'notice 폴백'은 탭 노출 관심사라 여기에 적용하지 않는다).
 */
export function categoryOfNotificationType(
  notificationType: string,
): "class" | "payment" | "notice" | "system" | null {
  const t = notificationType.toLowerCase();

  if (t.startsWith("payment") || t.endsWith("_billing")) return "payment";

  if (
    t === "class" ||
    t.startsWith("class_") ||
    t === "schedule" ||
    t.startsWith("enrollment") ||
    t.includes("attendance") ||
    t.startsWith("rsvp")
  ) {
    return "class";
  }

  if (t === "system" || t === "account_dormant" || t === "dormant_warning") {
    return "system";
  }

  if (
    t.startsWith("membership") ||
    t.startsWith("approval") ||
    t === "club" ||
    t.startsWith("club_") ||
    t === "academy_notice" ||
    t.startsWith("team_notice") ||
    t === "notice" ||
    t.startsWith("notice_") ||
    t.startsWith("tournament") ||
    t.startsWith("credit") ||
    t.startsWith("waitlist") ||
    t.startsWith("feedback") ||
    t.startsWith("match") ||
    t.startsWith("trip")
  ) {
    return "notice";
  }

  return null;
}

/**
 * 현재(KST)가 방해금지 시간대인지 판정. 자정 걸침("22:00"→"08:00") 지원.
 * 형식 오류·동일 시각(빈 구간)은 false — 잘못된 설정으로 푸시가 전부 막히는
 * 것을 방지한다.
 */
export function isWithinQuietHoursKST(
  start: string | null,
  end: string | null,
  now: Date = new Date(),
): boolean {
  const toMinutes = (value: string | null): number | null => {
    if (!value) return null;
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  };

  const startMin = toMinutes(start);
  const endMin = toMinutes(end);
  if (startMin === null || endMin === null || startMin === endMin) {
    return false;
  }

  const kstMinutes =
    (now.getUTCHours() * 60 + now.getUTCMinutes() + 9 * 60) % (24 * 60);

  if (startMin < endMin) {
    return kstMinutes >= startMin && kstMinutes < endMin;
  }
  // 자정 걸침 (예: 22:00 → 08:00)
  return kstMinutes >= startMin || kstMinutes < endMin;
}

/**
 * 푸시 발송 정책 게이트 — 전 발송 경로가 공유하는 단일 SoT.
 *
 * 모든 FCM 발송 경로는 대상 userId 산출 직후 filterRecipients() 를 통과해야 한다.
 * 적용 순서(고정):
 *  ① 야간×마케팅 법적 게이트(정보통신망법 §50) — 발송 진입점에서 throw 로
 *     선차단하며 어떤 경우에도 우회 불가 (이 서비스 범위 밖)
 *  ② pushEnabled=false 제외
 *  ③ categories[category(type)]=false 제외 (명시 매핑 타입만)
 *  ④ quietHours 내 사용자 FCM 억제 (v1: 드랍+로그 — 아침 재발송 없음)
 *
 * 인앱 알림·WebSocket 은 이 게이트의 대상이 아니다 — 수신거부는 '푸시' 거부이지
 * 알림함 차단이 아니다 (결제 내역 등 정보성 기록은 알림함에 남아야 한다).
 */
@Injectable()
export class PushPolicyService {
  private readonly logger = new Logger(PushPolicyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async filterRecipients(
    userIds: string[],
    ctx: PushPolicyContext = {},
  ): Promise<PushPolicyResult> {
    const unique = Array.from(new Set(userIds)).filter(Boolean);
    if (unique.length === 0) {
      return { allowed: [], suppressed: [] };
    }

    const prefs = await this.prisma.userNotificationPreference.findMany({
      where: { userId: { in: unique } },
      select: {
        userId: true,
        pushEnabled: true,
        categories: true,
        quietHoursEnabled: true,
        quietHoursStart: true,
        quietHoursEnd: true,
      },
    });
    const prefMap = new Map(prefs.map((p) => [p.userId, p]));

    const category = ctx.notificationType
      ? categoryOfNotificationType(ctx.notificationType)
      : null;
    const now = new Date();

    const allowed: string[] = [];
    const suppressed: PushPolicyResult["suppressed"] = [];

    for (const id of unique) {
      const pref = prefMap.get(id);
      if (!pref) {
        // preference 행 없음 = 전 항목 기본값(허용)
        allowed.push(id);
        continue;
      }

      if (!pref.pushEnabled) {
        suppressed.push({ userId: id, reason: "push_disabled" });
        continue;
      }

      if (
        category &&
        (pref.categories as Record<string, unknown> | null)?.[category] ===
          false
      ) {
        suppressed.push({ userId: id, reason: "category_disabled" });
        continue;
      }

      if (
        pref.quietHoursEnabled &&
        isWithinQuietHoursKST(pref.quietHoursStart, pref.quietHoursEnd, now)
      ) {
        suppressed.push({ userId: id, reason: "quiet_hours" });
        continue;
      }

      allowed.push(id);
    }

    if (suppressed.length > 0) {
      const byReason = suppressed.reduce<Record<string, number>>((acc, s) => {
        acc[s.reason] = (acc[s.reason] ?? 0) + 1;
        return acc;
      }, {});
      this.logger.debug(
        `푸시 정책 억제 ${suppressed.length}건 (${JSON.stringify(byReason)})` +
          (ctx.notificationType ? ` — type=${ctx.notificationType}` : ""),
      );
    }

    return { allowed, suppressed };
  }
}
