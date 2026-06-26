import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { resolveScheduleTime } from "@/common/utils/schedule-time.util";
import {
  scheduleEligibleClassFilter,
  scheduleVisibleChildIds,
  canCheckInForClass,
} from "@/common/billing/schedule-eligibility.util";

@Injectable()
export class ParentDashboardService {
  private readonly logger = new Logger(ParentDashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * 학부모 대시보드 통계
   */
  async getParentDashboard(parentId: string) {
    // W2: Redis 캐시 (TTL 60s)
    const cacheKey = `dashboard:parent:${parentId}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

      // W1 Step 1: parentUser + parentChildren 병렬
      const [parentUser, parentChildren] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: parentId },
          select: { firstName: true, lastName: true },
        }),
        this.prisma.parentChild.findMany({
          // 2026-04-23 회의 재설계: 승인된 ClubMember 가 있는 자녀만 반환.
          // 미승인/거절 자녀는 이미 학부모 대시보드 상단 pendingApprovalCount /
          // rejectedApprovalCount 배너에서 별도 안내되므로 Hot zone(셀렉터·
          // 소속팀 뱃지·미니 캘린더)의 혼란을 방지하기 위해 중복 노출 제거.
          where: {
            parentId,
            child: {
              teamMembers: {
                some: { approvalStatus: "approved" },
              },
            },
          },
          select: {
            child: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                birthDate: true,
                childProfile: {
                  select: {
                    id: true,
                    currentLevel: true,
                    levelLabel: true,
                    progressPercent: true,
                    nextTestDate: true,
                  },
                },
                teamMembers: {
                  where: { approvalStatus: "approved" },
                  select: {
                    id: true,
                    team: {
                      select: { name: true },
                    },
                    // 팀 내 그룹(블레이즈/라이징 등) — 설계서 §4.5 "팀 내 그룹" 노출용.
                    // Phase 2 (2026-04-29) — TeamRoster 폐기, TeamGroupMember 단일화.
                    // group.team(=Club) 의 clubName 사용.
                    teamGroupMembers: {
                      where: { leftAt: null, status: "active" },
                      select: {
                        group: {
                          select: {
                            team: { select: { name: true } },
                          },
                        },
                      },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        }),
      ]);
      // 폴백 문자열에 "님" 포함 금지 — UI(AppBar)에서 "{name}님" 자동 부착.
      const parentName = parentUser
        ? `${parentUser.lastName}${parentUser.firstName}`.trim() || "회원"
        : "회원";

      // 2026-04-27 (N-9): 자녀 User.id 기반으로 통일.
      // ClubMember 는 가입 자격(소속팀명/teamRoster) 표시 용도로만 사용.
      const children = parentChildren.map((pc) => {
        const child = pc.child;
        const membership = (child as any).teamMembers?.[0];
        // membership.registrations 는 ClubMember 에서 제거됨(N-9). 대신 ClassRegistration.userId 기반 조회 필요.
        // 다음 수업/className 은 별도 쿼리로 채움 (아래 nextScheduleByChild 참조).

        return {
          id: child.id,
          name: `${child.lastName}${child.firstName}`,
          // 2026-04-28 (학부모 홈 자녀 카드): 한국나이 + 출생년도 표기용 birthDate 노출.
          birthDate: child.birthDate ? child.birthDate.toISOString() : null,
          teamBelonging: membership?.team?.name ?? null,
          teamName:
            membership?.teamGroupMembers?.[0]?.group?.team?.name ?? null,
          className: null as string | null,
          remainingCredits: 0,
          nextClass: null as Date | null,
          currentLevel: child.childProfile?.currentLevel ?? 1,
          levelLabel: child.childProfile?.levelLabel ?? "입문",
          progressPercent: child.childProfile?.progressPercent ?? 0,
          nextTestDate: child.childProfile?.nextTestDate ?? null,
        };
      });

      // W1 Step 2 준비: 모든 의존 변수 사전 계산
      const childUserIds = parentChildren.map((pc) => pc.child.id);
      const prevMonthStart = new Date(
        today.getFullYear(),
        today.getMonth() - 1,
        1,
      );
      const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      const sixMonthsAgo = new Date(
        today.getFullYear(),
        today.getMonth() - 5,
        1,
      );
      const thirtyDaysLater = new Date(today);
      thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
      const nowDate = new Date();

      // === W1 Step 2: 11개 쿼리 단일 Promise.all 통합 ===
      const [
        memberCredits,
        monthAttendances,
        recentPayment,
        monthPayments,
        upcomingSchedules,
        thisMonthChildAttendances,
        prevMonthChildAttendances,
        sixMonthChildAttendances,
        recentPaymentsData,
        allMemberCreditsData,
        monthCreditDeductions,
        // W6
        latestNotices,
      ] = await Promise.all([
        childUserIds.length > 0
          ? this.prisma.memberCredit.findMany({
              where: {
                userId: { in: childUserIds },
                expiresAt: { gte: nowDate },
              },
              select: {
                userId: true,
                classId: true,
                totalSessions: true,
                usedSessions: true,
              },
            })
          : Promise.resolve(
              [] as {
                userId: string;
                classId: string;
                totalSessions: number;
                usedSessions: number;
              }[],
            ),
        childUserIds.length > 0
          ? this.prisma.classAttendance.findMany({
              where: {
                memberId: { in: childUserIds },
                schedule: {
                  scheduledDate: { gte: monthStart, lte: monthEnd },
                },
              },
              select: { attendanceStatus: true },
            })
          : Promise.resolve([] as { attendanceStatus: string }[]),
        this.prisma.payment.findFirst({
          where: { userId: parentId, paymentStatus: "completed" },
          orderBy: { createdAt: "desc" },
          select: { id: true, amount: true, createdAt: true },
        }),
        this.prisma.payment.findMany({
          where: {
            userId: parentId,
            paymentStatus: "completed",
            createdAt: { gte: monthStart, lte: monthEnd },
          },
          select: { amount: true },
        }),
        childUserIds.length > 0
          ? this.prisma.classSchedule.findMany({
              where: {
                // [Phase B] 일정 노출 자격 — 공통 SoT (선불 paid OR 후불 approved).
                class: scheduleEligibleClassFilter(childUserIds),
                // 2026-04-27: 오늘 자정부터 — 이미 시작된 오늘 일정도 카드에 표시되도록.
                // 이미 끝난 일정은 시간 윈도우 검증으로 출석 버튼만 비활성화됨.
                scheduledDate: { gte: today, lte: monthEnd },
                isCancelled: false,
              },
              select: {
                id: true, // 2026-04-27 (Phase 2): 학부모 출석 버튼용 scheduleId
                scheduledDate: true,
                startTime: true, // 표시 시각 SoT (text "HH:mm") — 입력 그대로
                class: {
                  select: {
                    id: true, // classId — 출석 가능 여부 판단 + 수업권 매칭
                    className: true,
                    trainingType: true,
                    startTime: true, // 폴백용 (회차 start_time 미존재 시 UTC 추출)
                    // 2026-05-14: 학부모 홈 대시보드 ClassCalendarSection 이
                    //   학원/팀 owner ID 를 모아 학원 endpoint 호출 분기에 사용.
                    teamId: true,
                    academyId: true,
                    billingMode: true,
                    registrations: {
                      // [수정 2026-05-13] 자녀별 매핑은 Enrollment paid 자녀만 카드에 노출.
                      //  paid 자녀의 user.id 가 registrations.userId 와 일치한다는 가정(paid 결제는
                      //  ClassRegistration active 도 함께 만듦). 코치 자동 배치(미결제)는 여기서 제외하기 위해
                      //  enrollments 의 paid 자녀 집합을 별도 계산해 클라이언트에서 cross-filter.
                      where: {
                        userId: { in: childUserIds },
                        status: "active",
                      },
                      select: { userId: true },
                    },
                    // [추가 2026-05-13] paid enrollments 의 childId — frontend 가 자녀별 매핑 시 교집합 필터링용.
                    enrollments: {
                      where: {
                        childId: { in: childUserIds },
                        // [Phase B] 후불(approved)도 포함 — FE 가 active 등록과 교집합하므로
                        //   선불 미결제(approved·active 등록 없음)는 자연 제외된다.
                        status: { in: ["paid", "approved"] },
                      },
                      // [B5b] BOTH 수업에서 후불 상품 선택 자녀를 판별하기 위해 billingTiming 동반.
                      select: {
                        childId: true,
                        product: { select: { billingTiming: true } },
                      },
                    },
                  },
                },
                // 2026-04-27 (Phase 2): 자녀별 출석 상태 — 카드 버튼 분기용
                attendances: {
                  where: { memberId: { in: childUserIds } },
                  select: { memberId: true, attendanceStatus: true },
                },
              },
              orderBy: { scheduledDate: "asc" },
              take: 100,
            })
          : Promise.resolve(
              [] as {
                id: string;
                scheduledDate: Date;
                startTime: string | null;
                class: {
                  id: string;
                  className: string;
                  trainingType: string;
                  startTime: Date | null;
                  teamId: string | null;
                  academyId: string | null;
                  billingMode: string;
                  registrations: { userId: string }[];
                  enrollments: {
                    childId: string;
                    product: { billingTiming: string } | null;
                  }[];
                };
                attendances: {
                  memberId: string;
                  attendanceStatus: string;
                }[];
              }[],
            ),
        childUserIds.length > 0
          ? this.prisma.classAttendance.findMany({
              where: {
                memberId: { in: childUserIds },
                schedule: {
                  scheduledDate: { gte: monthStart, lte: monthEnd },
                },
              },
              select: { memberId: true, attendanceStatus: true },
            })
          : Promise.resolve([]),

        childUserIds.length > 0
          ? this.prisma.classAttendance.findMany({
              where: {
                memberId: { in: childUserIds },
                schedule: {
                  scheduledDate: { gte: prevMonthStart, lte: prevMonthEnd },
                },
              },
              select: { memberId: true, attendanceStatus: true },
            })
          : Promise.resolve([]),

        childUserIds.length > 0
          ? this.prisma.classAttendance.findMany({
              where: {
                memberId: { in: childUserIds },
                schedule: { scheduledDate: { gte: sixMonthsAgo } },
              },
              select: {
                attendanceStatus: true,
                schedule: { select: { scheduledDate: true } },
              },
            })
          : Promise.resolve([]),

        this.prisma.payment.findMany({
          where: { userId: parentId, paymentStatus: "completed" },
          select: {
            id: true,
            amount: true,
            paymentStatus: true,
            completedAt: true,
            product: { select: { productName: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),

        childUserIds.length > 0
          ? this.prisma.memberCredit.findMany({
              where: { userId: { in: childUserIds } },
              select: {
                userId: true,
                classId: true,
                totalSessions: true,
                usedSessions: true,
                expiresAt: true,
              },
            })
          : Promise.resolve([]),

        childUserIds.length > 0
          ? this.prisma.creditTransaction.findMany({
              where: {
                memberCredit: { userId: { in: childUserIds } },
                type: "deducted",
                createdAt: { gte: monthStart, lte: monthEnd },
              },
              select: { amount: true },
            })
          : Promise.resolve([]),
        // W6: 프론트 NoticeSection 중복 API 제거
        // targetType: null(미지정), "all", "parent"만 학부모에게 노출
        this.prisma.systemNotice.findMany({
          where: {
            isActive: true,
            OR: [
              { targetType: null },
              { targetType: "all" },
              { targetType: "parent" },
            ],
          },
          orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
          take: 5,
          select: {
            id: true,
            title: true,
            targetType: true,
            createdAt: true,
            pinned: true,
          },
        }),
      ]);

      // Promise.all 이후 파생 계산 복원
      // 2026-04-27 (N-9): User × Class 단위 수업권 → 자녀별 합산 잔량.
      const childrenWithCredits = children.map((c) => {
        const credits = memberCredits.filter((mc) => mc.userId === c.id);
        const remaining = credits.reduce(
          (sum, mc) => sum + Math.max(0, mc.totalSessions - mc.usedSessions),
          0,
        );
        return {
          ...c,
          remainingCredits: remaining,
        };
      });

      const monthPresent = monthAttendances.filter(
        (a) =>
          a.attendanceStatus === "present" || a.attendanceStatus === "late",
      ).length;
      const monthAbsent = monthAttendances.filter(
        (a) => a.attendanceStatus === "absent",
      ).length;
      const presentRate =
        monthAttendances.length > 0
          ? ((monthPresent / monthAttendances.length) * 100).toFixed(1)
          : "0";

      const totalPaidThisMonth = monthPayments.reduce(
        (sum, p) => sum + Number(p.amount),
        0,
      );

      // 1. 자녀별 월간 성과
      const monthlyChildPerformance = childrenWithCredits.map((child) => {
        const thisMonthAtt = thisMonthChildAttendances.filter(
          (a) => a.memberId === child.id,
        );
        const prevMonthAtt = prevMonthChildAttendances.filter(
          (a) => a.memberId === child.id,
        );
        const attended = thisMonthAtt.filter(
          (a) =>
            a.attendanceStatus === "present" || a.attendanceStatus === "late",
        ).length;
        const total = thisMonthAtt.length;
        const attendanceRate =
          total > 0 ? Math.round((attended / total) * 100) : 0;
        const prevAttended = prevMonthAtt.filter(
          (a) =>
            a.attendanceStatus === "present" || a.attendanceStatus === "late",
        ).length;
        const prevTotal = prevMonthAtt.length;
        const prevRate =
          prevTotal > 0 ? Math.round((prevAttended / prevTotal) * 100) : 0;

        // 2026-04-27 (N-9): 자녀의 모든 수업권 합산 잔량
        const childCredits = allMemberCreditsData.filter(
          (mc) => mc.userId === child.id,
        );
        const remainingTotal = childCredits.reduce(
          (sum, mc) => sum + Math.max(0, mc.totalSessions - mc.usedSessions),
          0,
        );

        return {
          childId: child.id,
          childName: child.name,
          attendanceRate,
          attendanceChange: attendanceRate - prevRate,
          totalClasses: total,
          attendedClasses: attended,
          creditsUsed: attended,
          creditsRemaining: remainingTotal,
        };
      });

      // 2. 출석 추이 최근 6개월
      const attendanceTrend = Array.from({ length: 6 }, (_, i) => {
        const mStart = new Date(
          today.getFullYear(),
          today.getMonth() - (5 - i),
          1,
        );
        const mEnd = new Date(
          today.getFullYear(),
          today.getMonth() - (5 - i) + 1,
          0,
        );
        const data = sixMonthChildAttendances.filter((a) => {
          const d = a.schedule.scheduledDate;
          return d >= mStart && d <= mEnd;
        });
        const present = data.filter(
          (a) =>
            a.attendanceStatus === "present" || a.attendanceStatus === "late",
        ).length;
        return {
          month: `${mStart.getMonth() + 1}월`,
          rate: data.length > 0 ? Math.round((present / data.length) * 100) : 0,
        };
      });

      // 3. 최근 결제 내역
      const recentPayments = recentPaymentsData.map((p) => ({
        id: p.id,
        description: p.product?.productName ?? "기타 결제",
        amount: Number(p.amount),
        status: p.paymentStatus,
        completedAt: p.completedAt?.toISOString() ?? "",
      }));

      // 4. 수업권 요약 (nowDate는 Step 2 직전에 이미 선언됨)
      const creditSummary = {
        totalRemaining: allMemberCreditsData
          .filter((mc) => mc.expiresAt >= nowDate)
          .reduce(
            (sum, mc) => sum + Math.max(0, mc.totalSessions - mc.usedSessions),
            0,
          ),
        expiringWithin30Days: allMemberCreditsData
          .filter(
            (mc) => mc.expiresAt >= nowDate && mc.expiresAt <= thirtyDaysLater,
          )
          .reduce(
            (sum, mc) => sum + Math.max(0, mc.totalSessions - mc.usedSessions),
            0,
          ),
        usedThisMonth: monthCreditDeductions.reduce(
          (sum, t) => sum + t.amount,
          0,
        ),
      };

      // ⚡ BFF — 첫 자녀의 최근 14건 출석 통합.
      //    클라이언트(useParentHome)가 /attendance/member/{firstChildId}?limit=14 를
      //    직렬 호출하던 200~350ms RTT 제거. 학부모 대시보드 LCP 직접 단축.
      //    응답 형식은 frontend AttendanceRecord({ scheduledDate, attendanceStatus })
      //    + buildWeekDays() 와 호환. 자녀 미존재 시 빈 배열.
      const firstChildId = childUserIds[0] ?? null;
      const weeklyAttendance = firstChildId
        ? (
            await this.prisma.classAttendance.findMany({
              where: { memberId: firstChildId },
              select: {
                attendanceStatus: true,
                schedule: { select: { scheduledDate: true } },
              },
              orderBy: { createdAt: "desc" },
              take: 14,
            })
          ).map((a) => ({
            scheduledDate: a.schedule?.scheduledDate?.toISOString() ?? null,
            attendanceStatus: a.attendanceStatus,
          }))
        : [];

      const result = {
        parentName,
        children: childrenWithCredits,
        weeklyAttendance,
        attendance: {
          monthPresent,
          monthAbsent,
          presentRate,
        },
        payments: {
          recentPayment: recentPayment
            ? {
                id: recentPayment.id,
                amount: Number(recentPayment.amount),
                createdAt: recentPayment.createdAt,
              }
            : null,
          totalPaidThisMonth,
        },
        upcomingSchedules: upcomingSchedules.map((s) => {
          // [수정 2026-05-13] 자녀별 매핑은 paid Enrollment 자녀만 — 코치 자동 배치(미결제) 제외.
          //  registrations(active) ∩ enrollments(paid) 교집합으로 카드에 노출되는 자녀를 좁힘.
          const childIds = scheduleVisibleChildIds(
            s.class.registrations.map((r) => r.userId),
            (s.class.enrollments ?? []).map((e) => e.childId),
            childUserIds,
          );
          // 2026-04-27 (Phase 2): 자녀별 출석 상태 매핑 — 카드 [출석하기] 버튼 분기용
          const attendanceByChild: Record<string, string> = {};
          for (const att of s.attendances) {
            attendanceByChild[att.memberId] = att.attendanceStatus;
          }
          // PR-D Hotfix #4 (v1.0): 자녀별 출석 가능 여부 — 만료 안 된 수업권 중 잔량 > 0 자녀
          //   프론트가 false 면 [출석하기] 대신 [수업권이 필요해요 + 결제하기] 분기 표시.
          //   memberCredits 는 이미 만료 안 된 (expiresAt >= now) 수업권만 조회된 상태.
          // [B5b] BOTH 수업에서 후불 상품(billingTiming=POSTPAID)을 선택한 자녀 — 크레딧 없이 출석 가능.
          const postpaidChildIds = new Set(
            (s.class.enrollments ?? [])
              .filter((e) => e.product?.billingTiming === "POSTPAID")
              .map((e) => e.childId),
          );
          const canCheckInByChild: Record<string, boolean> = {};
          for (const childId of childIds) {
            canCheckInByChild[childId] = canCheckInForClass(
              s.class.billingMode,
              memberCredits.some(
                (mc) =>
                  mc.userId === childId &&
                  mc.classId === s.class.id &&
                  mc.usedSessions < mc.totalSessions,
              ),
              postpaidChildIds.has(childId),
            );
          }
          return {
            scheduleId: s.id, // 2026-04-27 (Phase 2): 학부모 출석 API 호출 키
            classId: s.class.id, // 수업권 매칭 + 라우팅
            className: s.class.className,
            scheduledDate: s.scheduledDate,
            // 표시 시각 SoT — class_schedules.start_time(text) 우선, 폴백 Class.startTime(UTC 추출).
            //   프론트는 이 값을 그대로 노출(입력값 "HH:mm"과 일치). scheduledDate 의 시:분은 신뢰 불가.
            startTime: resolveScheduleTime(s.startTime, s.class.startTime),
            trainingType: s.class.trainingType,
            // [Phase B] 후불(POSTPAID) 여부 — 출석 모달 "결제권 차감" 문구 분기용.
            billingMode: s.class.billingMode,
            // 2026-05-14: 학부모 홈 대시보드 ClassCalendarSection 이
            //   학원/팀 owner ID 를 모아 endpoint 분기에 사용.
            teamId: s.class.teamId,
            academyId: s.class.academyId,
            childIds,
            attendanceByChild, // { childUserId: 'present' | 'absent' | ... }
            canCheckInByChild, // PR-D Hotfix #4: { childUserId: true | false }
          };
        }),
        monthlyChildPerformance,
        attendanceTrend,
        recentPayments,
        creditSummary,
        // W6
        latestNotices,
      };

      // W2: 캐시 저장 (TTL 60s)
      await this.redis.set(cacheKey, result, 60);
      return result;
    } catch (error) {
      this.logger.error(
        `getParentDashboard error for ${parentId}:`,
        error instanceof Error ? error.stack : error,
      );
      return {
        parentName: "회원",
        children: [],
        weeklyAttendance: [],
        attendance: { monthPresent: 0, monthAbsent: 0, presentRate: "0" },
        payments: { recentPayment: null, totalPaidThisMonth: 0 },
        upcomingSchedules: [],
        monthlyChildPerformance: [],
        attendanceTrend: [],
        recentPayments: [],
        creditSummary: {
          totalRemaining: 0,
          expiringWithin30Days: 0,
          usedThisMonth: 0,
        },
        latestNotices: [],
      };
    }
  }
}
