"use client";

/**
 * /withdrawal — 회원 탈퇴(계정 삭제) 신청.
 *
 * [재구현 2026-06-04] Apple App Store 5.1.1(v) · Google Play #9888076 대응.
 *   앱 내에서 사용자가 직접 탈퇴할 수 있도록 4-step 플로우 복원.
 *   notice(유의사항+동의) → reason(사유) → confirm(본인확인) → complete(완료).
 *   - 이메일/비밀번호 계정: 현재 비밀번호로 본인 확인
 *   - 소셜 로그인 전용 계정(phone 이 social_ 로 시작): '탈퇴합니다' 문구로 본인 확인
 *   백엔드: POST /auth/withdraw → 7일 유예 후 비식별화. 성공 시 세션 즉시 폐기.
 */

import { useMemo, useState } from "react";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { useNativeUI } from "@/hooks/useNativeUI";
import { Button } from "@/components/ui/Button";
import { Input, Checkbox } from "@/components/ui/Input";
import { Icon } from "@/components/ui/Icon";
import { usePageReady } from "@/hooks/usePageReady";
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { withdraw } from "@/services/auth";
import { MESSAGES } from "@/lib/messages";

type Step = "notice" | "reason" | "confirm" | "complete";

const W = MESSAGES.withdrawal;
const REASON_KEYS = ["inconvenient", "notUsing", "privacy", "other"] as const;
type ReasonKey = (typeof REASON_KEYS)[number];

export default function WithdrawalPage() {
  usePageReady(true); // 세션 user 는 layout 에서 로드됨 — 마운트 즉시 ready
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  const { user, logout } = useSessionAuth();

  // 소셜 전용 계정 여부 (phone 이 social_ 로 시작) — 백엔드와 동일 기준
  const isSocialOnly = useMemo(
    () => user?.phone?.startsWith("social_") ?? false,
    [user?.phone],
  );

  const [step, setStep] = useState<Step>("notice");
  const [agreed, setAgreed] = useState(false);
  const [reasonKey, setReasonKey] = useState<ReasonKey | null>(null);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  // 소셜 계정 자가 선택 폴백 — 세션에 phone 이 없어 판별 실패한 경우 대비
  const [usePhrase, setUsePhrase] = useState(isSocialOnly);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const phraseMode = isSocialOnly || usePhrase;

  const handleNoticeNext = () => {
    if (!agreed) {
      setError(W.agreeRequired);
      return;
    }
    setError(null);
    setStep("reason");
  };

  const handleReasonNext = () => {
    if (!reasonKey) {
      setError(W.reasonRequired);
      return;
    }
    setError(null);
    setStep("confirm");
  };

  const handleSubmit = async () => {
    if (submitting) return;

    // 클라이언트 사전 검증
    if (phraseMode) {
      if (confirmText.trim() !== W.socialKeyword) {
        setError(W.socialRequired);
        return;
      }
    } else if (!password.trim()) {
      setError(W.passwordRequired);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const reasonText = reasonKey ? W.reasons[reasonKey] : undefined;
      const res = await withdraw(
        phraseMode
          ? { confirmText: confirmText.trim(), reason: reasonText }
          : { password, reason: reasonText },
      );
      if (res.success) {
        setStep("complete");
      } else {
        setError(res.error?.message ?? W.submitError);
      }
    } catch {
      setError(W.submitError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleComplete = async () => {
    // 서버에서 이미 세션이 폐기됨 — 로컬 토큰 정리 후 /login 이동(logout 내부 처리)
    await logout();
  };

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title={W.pageTitle} forceNative />

      <main className="flex-1 overflow-y-auto pb-30 hide-scrollbar bg-wbg dark:bg-rink-900">
        <section className="px-5 pt-6 pb-6 flex flex-col gap-5">
          {/* STEP 1 — 유의사항 + 동의 */}
          {step === "notice" && (
            <>
              <Card>
                <div className="flex flex-col items-center text-center gap-3 pb-2">
                  <div className="flex size-14 items-center justify-center rounded-w-pill bg-error/10">
                    <Icon name="warning" className="text-[26px] text-error" />
                  </div>
                  <h2 className="text-w-h3 font-bold text-wtext-1 dark:text-white">
                    {W.noticeTitle}
                  </h2>
                </div>
                <ul className="flex flex-col gap-3 pt-2">
                  {[W.gracePeriod, W.dataDelete, W.creditExpire].map((text) => (
                    <li key={text} className="flex items-start gap-2.5">
                      <Icon
                        name="check_circle"
                        className="text-[18px] text-ice-500 mt-0.5 shrink-0"
                        aria-hidden="true"
                      />
                      <p className="text-w-body text-wtext-2 dark:text-rink-200 leading-relaxed">
                        {text}
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card>
                <Checkbox
                  label={W.agreeLabel}
                  checked={agreed}
                  onChange={(e) => {
                    setAgreed(e.target.checked);
                    if (e.target.checked) setError(null);
                  }}
                />
              </Card>

              {error && <ErrorText message={error} />}

              <Button fullWidth variant="primary" onClick={handleNoticeNext}>
                {W.next}
              </Button>
            </>
          )}

          {/* STEP 2 — 탈퇴 사유 */}
          {step === "reason" && (
            <>
              <Card>
                <h2 className="text-w-h3 font-bold text-wtext-1 dark:text-white pb-3">
                  {W.reasonTitle}
                </h2>
                <div className="flex flex-col gap-2.5">
                  {REASON_KEYS.map((key) => {
                    const selected = reasonKey === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setReasonKey(key);
                          setError(null);
                        }}
                        className={
                          "flex items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors motion-reduce:transition-none " +
                          (selected
                            ? "border-ice-500 bg-ice-500/5 dark:bg-ice-500/10"
                            : "border-wline dark:border-rink-700 bg-white dark:bg-rink-800 hover:bg-wbg dark:hover:bg-rink-700/40")
                        }
                        aria-pressed={selected}
                      >
                        <span className="text-w-body font-medium text-wtext-1 dark:text-white">
                          {W.reasons[key]}
                        </span>
                        <Icon
                          name={selected ? "radio_button_checked" : "radio_button_unchecked"}
                          className={
                            "text-[20px] " +
                            (selected
                              ? "text-ice-500"
                              : "text-wtext-4 dark:text-rink-300")
                          }
                          aria-hidden="true"
                        />
                      </button>
                    );
                  })}
                </div>
              </Card>

              {error && <ErrorText message={error} />}

              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setError(null);
                    setStep("notice");
                  }}
                  className="flex-1"
                >
                  {W.prev}
                </Button>
                <Button
                  variant="primary"
                  onClick={handleReasonNext}
                  className="flex-1"
                >
                  {W.next}
                </Button>
              </div>
            </>
          )}

          {/* STEP 3 — 본인 확인 */}
          {step === "confirm" && (
            <>
              <Card>
                <h2 className="text-w-h3 font-bold text-wtext-1 dark:text-white pb-1">
                  {phraseMode ? W.socialTitle : W.passwordTitle}
                </h2>
                <p className="text-w-small text-wtext-3 dark:text-rink-300 leading-relaxed pb-4">
                  {phraseMode ? W.socialGuide : W.confirmMessage}
                </p>

                {phraseMode ? (
                  <Input
                    value={confirmText}
                    onChange={(e) => {
                      setConfirmText(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder={W.socialPlaceholder}
                    error={error ?? undefined}
                    aria-label={W.socialTitle}
                  />
                ) : (
                  <>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder={W.passwordPlaceholder}
                      error={error ?? undefined}
                      aria-label={W.passwordTitle}
                    />
                    {!isSocialOnly && (
                      <button
                        type="button"
                        onClick={() => {
                          setUsePhrase(true);
                          setError(null);
                        }}
                        className="mt-3 text-w-small font-medium text-ice-500 underline-offset-2 hover:underline focus:outline-none focus-visible:underline"
                      >
                        {W.socialToggle}
                      </button>
                    )}
                  </>
                )}
              </Card>

              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setError(null);
                    setStep("reason");
                  }}
                  className="flex-1"
                  disabled={submitting}
                >
                  {W.prev}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => void handleSubmit()}
                  loading={submitting}
                  className="flex-1"
                >
                  {W.confirmButton}
                </Button>
              </div>
            </>
          )}

          {/* STEP 4 — 완료 */}
          {step === "complete" && (
            <>
              <Card>
                <div className="flex flex-col items-center text-center gap-4 py-2">
                  <div className="flex size-16 items-center justify-center rounded-w-pill bg-ice-500/10">
                    <Icon name="check_circle" className="text-[30px] text-ice-500" />
                  </div>
                  <h2 className="text-w-h3 font-bold text-wtext-1 dark:text-white">
                    {W.completeTitle}
                  </h2>
                  <p className="text-w-body text-wtext-3 dark:text-rink-200 leading-relaxed">
                    {W.completeMessage}
                  </p>
                </div>
              </Card>

              <Button
                fullWidth
                variant="primary"
                onClick={() => void handleComplete()}
              >
                {W.completeConfirm}
              </Button>
            </>
          )}
        </section>
      </main>
    </MobileContainer>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 p-6">
      {children}
    </div>
  );
}

function ErrorText({ message }: { message: string }) {
  return (
    <p
      className="flex items-center gap-1.5 text-w-small text-error"
      role="alert"
    >
      <Icon name="error" className="text-[16px]" aria-hidden="true" />
      {message}
    </p>
  );
}
