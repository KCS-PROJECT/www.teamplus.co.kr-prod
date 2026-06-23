"use client";

import { useState, useEffect, useCallback } from "react";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useNavigation } from "@/components/ui/NavLink";
import { useToast } from "@/components/ui/Toast";
import { usePageReady } from '@/hooks/usePageReady';
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { useNativeUI } from "@/hooks/useNativeUI";
import { cn } from "@/lib/utils";
import { MESSAGES } from "@/lib/messages";
import { api, apiRequest } from "@/services/api-client";
import { resolveImageSrc } from "@/lib/image-url";

// ========== 타입 ==========

interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  nickname: string;
  imageUrl: string | null;
  birthDate: string;
  userType: string;
}

interface AttendanceStats {
  totalClasses: number;
  attendedClasses: number;
  rate: number;
}

// ========== 출석 통계 카드 ==========

function AttendanceStatsCard({
  stats,
  isLoading,
}: {
  stats: AttendanceStats | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return null;
  }

  if (!stats) return null;

  const statItems = [
    {
      label: "총 수업",
      value: `${stats.totalClasses}회`,
      icon: "school",
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-900/20",
    },
    {
      label: "출석",
      value: `${stats.attendedClasses}회`,
      icon: "check_circle",
      color: "text-green-600 dark:text-green-400",
      bg: "bg-green-50 dark:bg-green-900/20",
    },
    {
      label: "출석률",
      value: `${stats.rate}%`,
      icon: "trending_up",
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-900/20",
    },
  ];

  return (
    <div className="bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 p-4">
      <h3 className="text-card-body font-bold text-wtext-1 dark:text-white mb-3 flex items-center gap-1.5">
        <Icon
          name="bar_chart"
          className="text-ice-500 text-card-title"
          aria-hidden="true"
        />
        최근 30일 출석 통계
      </h3>
      <div className="grid grid-cols-3 gap-3">
        {statItems.map((item) => (
          <div
            key={item.label}
            className={`${item.bg} rounded-xl p-3 text-center`}
          >
            <Icon
              name={item.icon}
              className={`text-xl ${item.color} mb-1`}
              aria-hidden="true"
            />
            <p className="text-card-title font-bold text-wtext-1 dark:text-white">
              {item.value}
            </p>
            <p className="text-card-meta text-wtext-3 dark:text-rink-300">
              {item.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ========== 설정 항목 ==========

function SettingItem({
  icon,
  label,
  description,
  onClick,
  rightContent,
  danger,
  isChild,
}: {
  icon: string;
  label: string;
  description?: string;
  onClick?: () => void;
  rightContent?: React.ReactNode;
  danger?: boolean;
  isChild?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center justify-between w-full border-b border-wline-2 dark:border-rink-800 last:border-b-0 text-left active:brightness-95 transition-colors motion-reduce:transition-none",
        isChild ? "min-h-[72px] py-4" : "py-3.5",
      )}
      disabled={!onClick}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "rounded-xl flex items-center justify-center",
            isChild ? "size-12" : "size-9",
            danger
              ? "bg-red-50 dark:bg-red-900/20"
              : "bg-wline-2 dark:bg-rink-700",
          )}
        >
          <Icon
            name={icon}
            className={cn(
              isChild ? "text-xl" : "text-card-title",
              danger
                ? "text-red-500 dark:text-red-400"
                : "text-wtext-3 dark:text-rink-300",
            )}
            aria-hidden="true"
          />
        </div>
        <div>
          <p
            className={cn(
              "font-medium",
              isChild ? "text-card-title" : "text-card-body",
              danger
                ? "text-red-600 dark:text-red-400"
                : "text-wtext-1 dark:text-white",
            )}
          >
            {label}
          </p>
          {description && (
            <p
              className={cn(
                "text-wtext-3 dark:text-rink-300",
                isChild ? "text-card-body" : "text-card-meta",
              )}
            >
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {rightContent}
        {onClick && (
          <Icon
            name="chevron_right"
            className={cn(
              "text-wtext-3 dark:text-rink-300",
              isChild ? "text-xl" : "text-card-title",
            )}
            aria-hidden="true"
          />
        )}
      </div>
    </button>
  );
}

// ========== 메인 컴포넌트 ==========

export default function MyProfilePage() {
  const { navigate } = useNavigation();
  const { toast } = useToast();
  const { user } = useSessionAuth();

  useNativeUI({
    showStatusBar: true,
    showBottomNav: true,
    appBarTitle: "내 프로필",
  });

  // 상태
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 닉네임 편집
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nicknameEdit, setNicknameEdit] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // 알림 설정
  const [pushEnabled, setPushEnabled] = useState(true);

  // 프로필 로딩
  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await api.get<UserProfile>("/users/me");
      if (response.success && response.data) {
        const data =
          (response.data as { data?: UserProfile }).data ??
          (response.data as UserProfile);
        setProfile(data);
        setNicknameEdit(data.nickname || "");
      } else {
        setLoadError("프로필 정보를 불러올 수 없습니다.");
      }
    } catch {
      setLoadError(MESSAGES.error.general);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 출석 통계 로딩
  const loadStats = useCallback(async () => {
    setIsStatsLoading(true);
    try {
      const response = await apiRequest<AttendanceStats>({
        method: "GET",
        url: "/users/me/attendance-rate?period=monthly",
        retry: false,
      });
      if (response.success && response.data) {
        const data = response.data as AttendanceStats;
        setStats({
          totalClasses: data.totalClasses ?? 0,
          attendedClasses: data.attendedClasses ?? 0,
          rate: data.rate ?? 0,
        });
      }
    } catch {
      // 통계 로딩 실패는 무시 (선택 데이터)
    } finally {
      setIsStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
    loadStats();
  }, [loadProfile, loadStats]);

  // 닉네임 저장
  const saveNickname = async () => {
    if (!nicknameEdit.trim()) {
      toast.error(MESSAGES.profile.nicknameRequired);
      return;
    }
    if (nicknameEdit.trim().length > 20) {
      toast.error(MESSAGES.profile.nicknameTooLong);
      return;
    }

    setIsSaving(true);
    try {
      const response = await api.put("/users/me", {
        nickname: nicknameEdit.trim(),
      });
      if (response.success) {
        toast.success(MESSAGES.save.success);
        setProfile((prev) =>
          prev ? { ...prev, nickname: nicknameEdit.trim() } : prev,
        );
        setIsEditingNickname(false);
      } else {
        toast.error(MESSAGES.save.error);
      }
    } catch {
      toast.error(MESSAGES.error.general);
    } finally {
      setIsSaving(false);
    }
  };

  // 로딩 상태
  if (isLoading) return null;

  // 에러 상태
  if (loadError || !profile) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title="내 프로필" />
        <main className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="size-16 rounded-w-pill bg-wline-2 dark:bg-rink-800 flex items-center justify-center mb-4">
            <Icon
              name="error_outline"
              className="text-3xl text-wtext-3 dark:text-rink-300"
              aria-hidden="true"
            />
          </div>
          <p className="text-card-body text-wtext-3 dark:text-rink-300 font-medium text-center mb-4">
            {loadError ?? "프로필을 불러올 수 없습니다."}
          </p>
          <Button variant="outline" onClick={loadProfile}>
            {MESSAGES.dashboard.errorRetry}
          </Button>
        </main>
      </MobileContainer>
    );
  }

  const fullName = `${profile.lastName}${profile.firstName}`;
  const isTeen = profile.userType === "TEEN";
  const isChild = profile.userType === "CHILD";

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="내 프로필" />

      <main className="flex-1 overflow-y-auto hide-scrollbar">
        <div className="px-4 py-6 space-y-6 pb-40">
          {/* ========== 프로필 헤더 ========== */}
          <section className="flex flex-col items-center">
            {/* 프로필 사진 — primary ring 으로 브랜드 강조 */}
            <div className="relative mb-3 p-1 rounded-w-pill ring-2 ring-ice-500/30 dark:ring-ice-500/40">
              <div className="size-24 rounded-w-pill overflow-hidden bg-wline-2 dark:bg-rink-700 border-[3px] border-white dark:border-rink-800 shadow-sm">
                {resolveImageSrc(profile.imageUrl) ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={resolveImageSrc(profile.imageUrl)}
                    alt={fullName}
                    width={96}
                    height={96}
                    className="object-cover size-full"
                  />
                ) : (
                  <div className="size-full flex items-center justify-center">
                    <Icon
                      name="person"
                      className="text-4xl text-wtext-3 dark:text-rink-300"
                      aria-hidden="true"
                    />
                  </div>
                )}
              </div>
              <button
                className={cn(
                  "absolute bottom-0 right-0 rounded-w-pill bg-ice-500 text-white flex items-center justify-center shadow-sm hover:bg-ice-700 transition-colors motion-reduce:transition-none active:brightness-95",
                  isChild ? "size-10" : "size-8",
                )}
                aria-label="프로필 사진 변경"
                onClick={() =>
                  toast.info(MESSAGES.profile.photoChangeUnavailable)
                }
              >
                <Icon name="camera_alt" size={isChild ? 20 : 16} />
              </button>
            </div>

            {/* 이름 + 타입 */}
            <h2
              className={cn(
                "font-bold text-wtext-1 dark:text-white",
                isChild ? "text-2xl" : "text-xl",
              )}
            >
              {fullName}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={cn(
                  "font-bold px-2.5 py-0.5 rounded-w-pill",
                  isChild ? "text-card-body" : "text-card-meta",
                  isTeen
                    ? "bg-blue-100 text-ice-500 dark:bg-blue-900/30 dark:text-blue-400"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                )}
              >
                {isTeen ? "TEEN" : "CHILD"}
              </span>
              {profile.email && (
                <span
                  className={cn(
                    "text-wtext-3 dark:text-rink-300",
                    isChild ? "text-card-body" : "text-card-meta",
                  )}
                >
                  {profile.email}
                </span>
              )}
            </div>
          </section>

          {/* ========== 닉네임 수정 ========== */}
          <section className="bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3
                className={cn(
                  "font-bold text-wtext-1 dark:text-white flex items-center gap-1.5",
                  isChild ? "text-card-emphasis" : "text-card-body",
                )}
              >
                <Icon
                  name="badge"
                  className={cn(
                    "text-ice-500",
                    isChild ? "text-xl" : "text-card-title",
                  )}
                  aria-hidden="true"
                />
                닉네임
              </h3>
              {!isEditingNickname && (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingNickname(true);
                    setNicknameEdit(profile.nickname || "");
                  }}
                  aria-label="닉네임 수정"
                  className={cn(
                    "inline-flex items-center justify-center font-semibold text-ice-500 hover:text-ice-700 transition-colors motion-reduce:transition-none px-3 rounded-w-pill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flame-500",
                    isChild
                      ? "text-card-body min-h-[72px] min-w-[72px]"
                      : "text-card-body min-h-[44px] min-w-[44px]",
                  )}
                >
                  수정하기
                </button>
              )}
            </div>

            {isEditingNickname ? (
              <div className="space-y-3">
                <Input
                  value={nicknameEdit}
                  onChange={(e) => setNicknameEdit(e.target.value)}
                  placeholder={MESSAGES.placeholders.enterNickname}
                  maxLength={20}
                  disabled={isSaving}
                />
                <div className="flex items-center gap-2">
                  <Button
                    size={isChild ? "lg" : "sm"}
                    onClick={saveNickname}
                    disabled={isSaving}
                    className={isChild ? "min-h-[72px] text-card-title px-8" : ""}
                  >
                    {isSaving ? MESSAGES.common.saving : MESSAGES.common.save}
                  </Button>
                  <Button
                    variant="outline"
                    size={isChild ? "lg" : "sm"}
                    onClick={() => setIsEditingNickname(false)}
                    disabled={isSaving}
                    className={isChild ? "min-h-[72px] text-card-title px-8" : ""}
                  >
                    취소
                  </Button>
                </div>
              </div>
            ) : (
              <p
                className={cn(
                  "font-medium text-wtext-1 dark:text-white",
                  isChild ? "text-card-title" : "text-card-emphasis",
                )}
              >
                {profile.nickname || MESSAGES.myProfile.setNicknameHint}
              </p>
            )}
          </section>

          {/* ========== 출석 통계 ========== */}
          <AttendanceStatsCard stats={stats} isLoading={isStatsLoading} />

          {/* ========== 설정 메뉴 ========== */}
          <section className="bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 p-4">
            <h3
              className={cn(
                "font-bold text-wtext-1 dark:text-white mb-1 flex items-center gap-1.5",
                isChild ? "text-card-emphasis" : "text-card-body",
              )}
            >
              <Icon
                name="settings"
                className={cn("text-ice-500", isChild ? "text-xl" : "text-card-title")}
                aria-hidden="true"
              />
              설정
            </h3>

            <div>
              {/* 알림 설정 */}
              <div
                className={cn(
                  "flex items-center justify-between border-b border-wline-2 dark:border-rink-800",
                  isChild ? "min-h-[72px] py-4" : "py-3.5",
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "rounded-xl bg-wline-2 dark:bg-rink-700 flex items-center justify-center",
                      isChild ? "size-12" : "size-9",
                    )}
                  >
                    <Icon
                      name="notifications"
                      className={cn(
                        "text-wtext-3 dark:text-rink-300",
                        isChild ? "text-xl" : "text-card-title",
                      )}
                      aria-hidden="true"
                    />
                  </div>
                  <div>
                    <p
                      className={cn(
                        "font-medium text-wtext-1 dark:text-white",
                        isChild ? "text-card-title" : "text-card-body",
                      )}
                    >
                      알림
                    </p>
                    <p
                      className={cn(
                        "text-wtext-3 dark:text-rink-300",
                        isChild ? "text-card-body" : "text-card-meta",
                      )}
                    >
                      수업, 출석 알림 받기
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setPushEnabled(!pushEnabled);
                    toast.success(
                      pushEnabled
                        ? "알림이 해제되었습니다."
                        : "알림이 활성화되었습니다.",
                    );
                  }}
                  className={cn(
                    "relative rounded-w-pill transition-colors motion-reduce:transition-none duration-200",
                    isChild ? "w-14 h-8 min-w-[72px]" : "w-11 h-6",
                    pushEnabled
                      ? "bg-ice-500"
                      : "bg-wline dark:bg-rink-500",
                  )}
                  role="switch"
                  aria-checked={pushEnabled}
                  aria-label="알림 설정"
                >
                  <div
                    className={cn(
                      "absolute top-0.5 left-0.5 rounded-w-pill bg-white shadow-sm transition-transform motion-reduce:transition-none duration-200",
                      isChild ? "size-7" : "size-5",
                      pushEnabled
                        ? isChild
                          ? "translate-x-6"
                          : "translate-x-5"
                        : "",
                    )}
                  />
                </button>
              </div>

              {/* 비밀번호 변경 */}
              <SettingItem
                icon="lock"
                label="비밀번호 변경"
                description="로그인 비밀번호를 변경합니다"
                onClick={() => navigate("/mypage")}
                isChild={isChild}
              />

              {/* 출석 기록 */}
              <SettingItem
                icon="history"
                label="출석 기록"
                description="전체 출석 이력 보기"
                onClick={() => navigate("/attendance")}
                isChild={isChild}
              />

              {/* 수업 일정 */}
              <SettingItem
                icon="calendar_month"
                label="수업 일정"
                description="등록된 수업 일정 확인"
                onClick={() => navigate("/calendar")}
                isChild={isChild}
              />
            </div>
          </section>

          {/* ========== 내 정보 ========== */}
          <section className="bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 p-4">
            <h3
              className={cn(
                "font-bold text-wtext-1 dark:text-white mb-3 flex items-center gap-1.5",
                isChild ? "text-card-emphasis" : "text-card-body",
              )}
            >
              <Icon
                name="info"
                className={cn("text-ice-500", isChild ? "text-xl" : "text-card-title")}
                aria-hidden="true"
              />
              내 정보
            </h3>

            <div className="space-y-3">
              <div
                className={cn(
                  "flex items-center justify-between border-b border-wline-2 dark:border-rink-700/50",
                  isChild ? "py-3" : "py-2",
                )}
              >
                <span
                  className={cn(
                    "font-medium text-wtext-3 dark:text-rink-300",
                    isChild ? "text-card-body" : "text-card-meta",
                  )}
                >
                  아이디
                </span>
                <span
                  className={cn(
                    "text-wtext-1 dark:text-white",
                    isChild ? "text-card-emphasis" : "text-card-body",
                  )}
                >
                  {profile.email || "-"}
                </span>
              </div>
              <div
                className={cn(
                  "flex items-center justify-between border-b border-wline-2 dark:border-rink-700/50",
                  isChild ? "py-3" : "py-2",
                )}
              >
                <span
                  className={cn(
                    "font-medium text-wtext-3 dark:text-rink-300",
                    isChild ? "text-card-body" : "text-card-meta",
                  )}
                >
                  전화번호
                </span>
                <span
                  className={cn(
                    "text-wtext-1 dark:text-white",
                    isChild ? "text-card-emphasis" : "text-card-body",
                  )}
                >
                  {profile.phone || "-"}
                </span>
              </div>
              <div
                className={cn(
                  "flex items-center justify-between",
                  isChild ? "py-3" : "py-2",
                )}
              >
                <span
                  className={cn(
                    "font-medium text-wtext-3 dark:text-rink-300",
                    isChild ? "text-card-body" : "text-card-meta",
                  )}
                >
                  계정 유형
                </span>
                <span
                  className={cn(
                    "font-bold px-2 py-0.5 rounded-w-pill",
                    isChild ? "text-card-body" : "text-card-meta",
                    isTeen
                      ? "bg-blue-100 text-ice-500 dark:bg-blue-900/30 dark:text-blue-400"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                  )}
                >
                  {isTeen ? "TEEN" : "CHILD"}
                </span>
              </div>
            </div>
          </section>
        </div>
      </main>
    </MobileContainer>
  );
}
