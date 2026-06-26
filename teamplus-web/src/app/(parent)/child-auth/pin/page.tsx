"use client";

import { useState, useCallback, useEffect } from "react";
import { useNavigation } from "@/components/ui/NavLink";
import { Icon } from "@/components/ui/Icon";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import PinInput from "@/components/ui/PinInput";
import { useToast } from "@/components/ui/Toast";
import { usePageReady } from '@/hooks/usePageReady';
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { apiRequest } from "@/services/api-client";
import { MESSAGES } from "@/lib/messages";
import { useNativeUI } from "@/hooks/useNativeUI";

interface ChildOption {
  id: string;
  name: string;
  hasPin: boolean;
}

type PinMode = "select" | "set" | "verify" | "confirm";

export default function ChildAuthPinPage() {
  const { back } = useNavigation();
  const { toast } = useToast();
  const { user } = useSessionAuth();
  // [appbar-harness-v3 / 2026-05-13] 이중 헤더 방지 — Web `<PageAppBar />` 단독 렌더.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  const [children, setChildren] = useState<ChildOption[]>([]);
  const [selectedChild, setSelectedChild] = useState<ChildOption | null>(null);
  const [mode, setMode] = useState<PinMode>("select");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 자녀 목록 조회
  const fetchChildren = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiRequest<{
        data?: {
          id: string;
          firstName: string;
          lastName: string;
          childProfile?: { id: string };
        }[];
      }>({
        method: "GET",
        url: "/children",
      });
      if (res.success && res.data) {
        const raw = Array.isArray(res.data)
          ? res.data
          : ((res.data as { data?: typeof res.data }).data ?? []);
        setChildren(
          (
            raw as {
              id: string;
              firstName: string;
              lastName: string;
              childProfile?: { id: string };
            }[]
          ).map((c) => ({
            id: c.childProfile?.id || c.id,
            name: `${c.lastName || ""}${c.firstName || ""}`.trim() || "자녀",
            hasPin: false,
          })),
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChildren();
  }, [fetchChildren]);

  // PIN 설정 제출
  const handleSetPin = useCallback(async () => {
    if (pin !== confirmPin) {
      setError("PIN이 일치하지 않습니다. 다시 입력해주세요.");
      setConfirmPin("");
      setMode("confirm");
      return;
    }
    if (!selectedChild) return;

    setIsSubmitting(true);
    setError("");
    try {
      const res = await apiRequest({
        method: "POST",
        url: "/child-auth/pin",
        data: { childProfileId: selectedChild.id, pin },
      });
      if (res.success) {
        toast.success(MESSAGES.childAuth.pinSet);
        setMode("select");
        setPin("");
        setConfirmPin("");
        setSelectedChild(null);
      } else {
        setError(
          (res.error as { message?: string })?.message ||
            MESSAGES.error.general,
        );
      }
    } catch {
      setError(MESSAGES.error.general);
    } finally {
      setIsSubmitting(false);
    }
  }, [pin, confirmPin, selectedChild, toast]);

  // PIN 검증
  const handleVerifyPin = useCallback(async () => {
    if (!selectedChild) return;

    setIsSubmitting(true);
    setError("");
    try {
      const res = await apiRequest<{
        data?: { verified: boolean; remainingAttempts?: number };
      }>({
        method: "POST",
        url: "/child-auth/verify",
        data: { childProfileId: selectedChild.id, pin },
      });
      if (res.success && (res.data as { verified?: boolean })?.verified) {
        toast.success(MESSAGES.childAuth.verified);
        setMode("select");
        setPin("");
      } else {
        const remaining = (res.data as { remainingAttempts?: number })
          ?.remainingAttempts;
        setError(
          remaining !== undefined
            ? `PIN이 일치하지 않습니다. (남은 시도: ${remaining}회)`
            : "PIN이 일치하지 않습니다.",
        );
        setPin("");
      }
    } catch {
      setError(MESSAGES.error.general);
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedChild, pin, toast]);

  // PIN 완성 시
  const handlePinComplete = useCallback(
    (value: string) => {
      if (mode === "set") {
        setPin(value);
        setMode("confirm");
        setConfirmPin("");
        setError("");
      } else if (mode === "confirm") {
        setConfirmPin(value);
      } else if (mode === "verify") {
        setPin(value);
      }
    },
    [mode],
  );

  // confirm 단계에서 완성 시 자동 제출
  useEffect(() => {
    if (mode === "confirm" && confirmPin.length === 6) {
      handleSetPin();
    }
  }, [confirmPin, mode, handleSetPin]);

  // verify 단계에서 완성 시 자동 제출
  useEffect(() => {
    if (mode === "verify" && pin.length === 6) {
      handleVerifyPin();
    }
  }, [pin, mode, handleVerifyPin]);

  const modeCopy: Record<
    Exclude<PinMode, "select">,
    { icon: string; description: string }
  > = {
    set: {
      icon: "lock_person",
      description: "안전을 위해 6자리 PIN 번호를 설정해주세요.",
    },
    confirm: {
      icon: "lock_person",
      description: "PIN을 한 번 더 입력해주세요.",
    },
    verify: {
      icon: "key",
      description: "설정된 PIN 번호를 입력해주세요.",
    },
  };

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="자녀 인증" onBack={back} />

      <div className="flex-1 flex flex-col px-6 pt-8 pb-28 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck">
        {/* 자녀 선택 모드 */}
        {mode === "select" && (
          <>
            <div className="text-center mb-8">
              <div
                className="flex items-center justify-center size-16 rounded-w-md bg-it-blue-50 dark:bg-it-blue-500/15 mx-auto mb-4"
                aria-hidden="true"
              >
                <Icon name="lock_person" className="text-3xl text-it-blue-500" />
              </div>
              <h2 className="text-xl font-bold text-it-ink-800 dark:text-white mb-2">
                자녀 인증 PIN 관리
              </h2>
              <p className="text-card-body text-it-ink-500 dark:text-wtext-4 leading-relaxed">
                자녀를 선택하여 PIN을 설정하거나 인증하세요.
              </p>
            </div>

            {isLoading ? null : children.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 rounded-w-md bg-it-surface dark:bg-rink-800 border border-it-line dark:border-rink-700">
                <div className="flex items-center justify-center size-16 rounded-w-pill bg-it-fill dark:bg-rink-700 mb-4">
                  <Icon
                    name="child_care"
                    className="text-3xl text-it-ink-400 dark:text-wtext-4"
                    aria-hidden="true"
                  />
                </div>
                <p className="text-card-emphasis font-semibold text-it-ink-700 dark:text-wtext-4">
                  {MESSAGES.empty("등록된 자녀")}
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-3 w-full" aria-label="자녀 목록">
                {children.map((child) => (
                  <li key={child.id} className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedChild(child);
                        setMode("set");
                        setPin("");
                        setConfirmPin("");
                        setError("");
                      }}
                      className="flex-1 flex items-center gap-3 min-h-[72px] p-4 bg-it-surface dark:bg-rink-800 rounded-w-md border border-it-line dark:border-rink-700 hover:border-it-blue-500/40 dark:hover:border-it-blue-500/40 active:brightness-95 transition-colors motion-reduce:transition-none"
                      aria-label={`${child.name} PIN 설정하기`}
                    >
                      <div className="flex items-center justify-center size-11 rounded-w-pill bg-it-blue-50 dark:bg-it-blue-500/15 shrink-0">
                        <Icon
                          name="child_care"
                          className="text-xl text-it-blue-500"
                          aria-hidden="true"
                        />
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="font-bold text-it-ink-800 dark:text-white truncate">
                          {child.name}
                        </p>
                        <p className="text-card-meta text-it-ink-500 dark:text-wtext-4 mt-0.5">
                          PIN 설정하기
                        </p>
                      </div>
                      <Icon
                        name="chevron_right"
                        className="text-it-ink-300 dark:text-rink-500"
                        aria-hidden="true"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedChild(child);
                        setMode("verify");
                        setPin("");
                        setError("");
                      }}
                      className="flex items-center justify-center size-[72px] bg-it-fill dark:bg-rink-800 rounded-w-md border border-it-line dark:border-rink-700 hover:bg-it-line dark:hover:bg-rink-700 active:brightness-95 transition-colors motion-reduce:transition-none"
                      aria-label={`${child.name} PIN 검증하기`}
                    >
                      <Icon
                        name="key"
                        className="text-xl text-it-ink-700 dark:text-wtext-4"
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {/* PIN 설정/확인/검증 모드 */}
        {(mode === "set" || mode === "confirm" || mode === "verify") && (
          <>
            <div className="text-center mb-8">
              <div
                className="flex items-center justify-center size-16 rounded-w-md bg-it-blue-50 dark:bg-it-blue-500/15 mx-auto mb-4"
                aria-hidden="true"
              >
                <Icon
                  name={modeCopy[mode].icon}
                  className="text-3xl text-it-blue-500"
                />
              </div>
              <h2 className="text-xl font-bold text-it-ink-800 dark:text-white mb-2">
                {selectedChild?.name}
              </h2>
              <p className="text-card-body text-it-ink-700 dark:text-wtext-4 leading-relaxed font-medium">
                {modeCopy[mode].description}
              </p>
              {mode === "set" && (
                <p className="text-card-meta text-it-ink-500 dark:text-wtext-4 mt-2">
                  연속된 숫자나 동일 숫자는 사용할 수 없습니다.
                </p>
              )}
            </div>

            <div className="flex justify-center">
              <PinInput
                value={mode === "confirm" ? confirmPin : pin}
                onChange={mode === "confirm" ? setConfirmPin : setPin}
                onComplete={handlePinComplete}
                disabled={isSubmitting}
                error={error}
                iceTheme
                autoFocus
              />
            </div>

            <div className="w-full mt-auto pt-6 flex flex-col gap-3">
              {mode === "verify" && (
                <button
                  type="button"
                  onClick={handleVerifyPin}
                  disabled={pin.length !== 6 || isSubmitting}
                  className="w-full min-h-[56px] bg-it-blue-500 hover:bg-it-blue-600 text-white font-bold text-card-emphasis rounded-w-md shadow-sm disabled:bg-it-line dark:disabled:bg-rink-500 disabled:shadow-none transition-colors motion-reduce:transition-none active:brightness-95"
                >
                  {isSubmitting ? MESSAGES.common.processing : "인증하기"}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setMode("select");
                  setPin("");
                  setConfirmPin("");
                  setError("");
                  setSelectedChild(null);
                }}
                className="w-full min-h-[48px] bg-it-fill dark:bg-rink-800 text-it-ink-700 dark:text-wtext-4 font-semibold text-card-body rounded-w-md hover:bg-it-line dark:hover:bg-rink-700 active:brightness-95 transition-colors motion-reduce:transition-none"
              >
                돌아가기
              </button>
            </div>
          </>
        )}
      </div>
    </MobileContainer>
  );
}
