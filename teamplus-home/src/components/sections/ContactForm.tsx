"use client";

import { useState } from "react";
import { Send, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type PlanOption = {
  value: string;
  label: string;
  download?: { href: string; filename: string };
  notice?: string;
};

const PLAN_OPTIONS: PlanOption[] = [
  { value: "starter", label: "Starter" },
  { value: "business", label: "Business" },
  { value: "enterprise", label: "Enterprise" },
  {
    value: "aos",
    label: "AOS",
    // [2026-05-20] href 는 API route — 서버 파일시스템 경로(/home/kcssi/...)는
    //   public/ 밖이라 직접 링크 시 404. route handler 가 APK 를 스트리밍한다.
    download: {
      href: "/api/download/app",
      filename: "teamplus-app-release.apk",
    },
  },
  { value: "ios", label: "iOS", notice: "iOS 앱은 준비중입니다." },
  { value: "undecided", label: "아직 고민 중" },
];

const CLUB_SIZE = ["~50명", "50-150명", "150-300명", "300명+"];

// 이메일 형식 검증 (간단·관용 정규식 — 공백/@/도메인 점 확인)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ContactForm() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // 폼 필드 (controlled)
  const [organizationName, setOrganizationName] = useState("");
  const [managerName, setManagerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [plan, setPlan] = useState("business");
  const [clubSize, setClubSize] = useState("50-150명");
  const [message, setMessage] = useState("");
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [planNotice, setPlanNotice] = useState("");

  // 이메일 입력은 있으나 형식이 틀린 경우만 인라인 안내
  const emailInvalid = email.trim().length > 0 && !EMAIL_RE.test(email.trim());

  // 필수 입력 + 동의 충족 시에만 제출 활성화 (plan/clubSize 는 기본값 존재로 충족)
  const isValid =
    organizationName.trim().length > 0 &&
    managerName.trim().length > 0 &&
    EMAIL_RE.test(email.trim()) &&
    phone.trim().length > 0 &&
    privacyAgreed;

  const disabled = !isValid || submitting;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (disabled) return; // 가드 (이중 제출/비활성 방지)

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationName: organizationName.trim(),
          managerName: managerName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          interestedPlan: plan,
          clubSize,
          message: message.trim() || undefined,
          privacyAgreed,
        }),
      });

      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        message?: string;
      } | null;

      if (!res.ok || !data?.success) {
        throw new Error(
          data?.message ??
            "문의 접수에 실패했습니다. 잠시 후 다시 시도해주세요.",
        );
      }

      // 현재 스크롤 위치 고정 — 제출 성공 시 포커스 이동/스크롤 앵커링으로 페이지가
      //   아래로 밀리는 현상 방지("현재 위치에서 내용만 바뀜"). 카드 높이는 불변이므로
      //   복원이 자연스럽다. 렌더 직후 2프레임 + 짧은 지연으로 비동기 스크롤까지 상쇄.
      const keepY = typeof window !== "undefined" ? window.scrollY : 0;
      const restoreScroll = () => window.scrollTo(0, keepY);
      setSubmitted(true);
      if (typeof window !== "undefined") {
        requestAnimationFrame(() => {
          restoreScroll();
          requestAnimationFrame(restoreScroll);
        });
        setTimeout(restoreScroll, 80);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "문의 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSubmitted(false);
    setError("");
    setOrganizationName("");
    setManagerName("");
    setEmail("");
    setPhone("");
    setPlan("business");
    setClubSize("50-150명");
    setMessage("");
    setPrivacyAgreed(false);
    setPlanNotice("");
  };

  // 제출 성공 시: 폼을 통째로 다른 엘리먼트로 교체하지 않는다(루트 교체 = 전체 remount 로
  //   깜박임 + 높이 급변으로 스크롤 점프 발생). 대신 같은 glass-card 안에서 폼은 자리(높이)를
  //   유지한 채 페이드아웃하고, 성공 메시지를 동일 카드 위에 절대배치 오버레이로 페이드인한다.
  //   → 카드 위치·크기 불변(스크롤 점프 없음) + 루트 unmount 없음(깜박임 없음).
  return (
    <div className="glass-card relative p-8 sm:p-10">
      <div
        role="status"
        aria-live="polite"
        aria-hidden={!submitted}
        className={cn(
          "absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 rounded-[inherit] bg-wsurface p-10 text-center transition-opacity duration-300 ease-out motion-reduce:transition-none",
          submitted ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-ice-50 text-ice-600">
          <CheckCircle2 size={36} strokeWidth={1.7} />
        </span>
        <h2 className="text-2xl font-bold text-rink-900">
          문의가 접수되었습니다
        </h2>
        <p className="max-w-sm text-sm leading-relaxed text-wtext-3">
          팀플러스+ 팀이 영업일 1일 이내에 입력하신 연락처로 회신드리겠습니다.
          급한 문의는{" "}
          <a
            className="text-ice-600 underline underline-offset-4"
            href="tel:02-0000-0000"
          >
            전화
          </a>
          로도 연락주세요.
        </p>
        <button type="button" onClick={handleReset} className="btn-ghost mt-2">
          새 문의 작성하기
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        className={cn(
          "space-y-6 transition-opacity duration-300 ease-out motion-reduce:transition-none",
          submitted && "pointer-events-none select-none opacity-0",
        )}
        aria-hidden={submitted}
        noValidate
      >
        <div>
          <h2 className="text-2xl font-bold text-rink-900">상담 신청</h2>
          <p className="mt-2 text-sm text-wtext-3">
            아래 양식을 작성해주시면 담당 매니저가 빠르게 연락드립니다.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="클럽명 / 단체명" required>
            <input
              type="text"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder="예) 안양 ACE 아이스하키"
              className={inputClass}
              autoComplete="organization"
            />
          </Field>
          <Field label="담당자 성함" required>
            <input
              type="text"
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
              placeholder="예) 김OO"
              className={inputClass}
              autoComplete="name"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="이메일" required>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@club.com"
              className={cn(
                inputClass,
                emailInvalid &&
                  "!border-accent-rose focus:!ring-accent-rose/20",
              )}
              autoComplete="email"
              aria-invalid={emailInvalid}
            />
            {emailInvalid && (
              <span className="mt-1.5 block text-xs text-accent-rose">
                올바른 이메일 형식을 입력해주세요.
              </span>
            )}
          </Field>
          <Field label="연락처" required>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-0000-0000"
              className={inputClass}
              autoComplete="tel"
            />
          </Field>
        </div>

        <Field label="관심 플랜">
          <div className="flex flex-wrap gap-2">
            {PLAN_OPTIONS.map((p) => {
              if (p.download) {
                return (
                  <a
                    key={p.value}
                    href={p.download.href}
                    download={p.download.filename}
                    onClick={() => setPlanNotice("")}
                    className={cn(
                      "rounded-full border px-4 py-2 text-xs font-semibold transition-colors",
                      "border-wline bg-wsurface text-wtext-3 hover:bg-wbg",
                    )}
                  >
                    {p.label}
                  </a>
                );
              }
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => {
                    if (p.notice) {
                      setPlanNotice(p.notice);
                      return;
                    }
                    setPlanNotice("");
                    setPlan(p.value);
                  }}
                  className={cn(
                    "rounded-full border px-4 py-2 text-xs font-semibold transition-colors",
                    plan === p.value
                      ? "border-ice-100 bg-ice-50 text-ice-700"
                      : "border-wline bg-wsurface text-wtext-3 hover:bg-wbg",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          {planNotice && (
            <p
              role="status"
              aria-live="polite"
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-accent-amber/40 bg-accent-amber/10 px-3 py-1.5 text-xs font-medium text-rink-800"
            >
              <span aria-hidden="true">⏳</span>
              {planNotice}
            </p>
          )}
        </Field>

        <Field label="클럽 규모">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CLUB_SIZE.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setClubSize(s)}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors",
                  clubSize === s
                    ? "border-ice-100 bg-ice-50 text-ice-700"
                    : "border-wline bg-wsurface text-wtext-3 hover:bg-wbg",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </Field>

        <Field label="문의 내용">
          <textarea
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="도입 검토 목적, 현재 사용 중인 툴, 특별히 궁금한 기능이 있다면 자유롭게 남겨주세요."
            className={cn(inputClass, "resize-none py-3")}
          />
        </Field>

        <label className="flex items-start gap-3 text-xs text-wtext-3">
          <input
            type="checkbox"
            checked={privacyAgreed}
            onChange={(e) => setPrivacyAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-wline bg-wsurface text-ice-500 focus:ring-ice-500"
          />
          <span>
            개인정보 수집·이용 (문의 응대 목적, 3년 보관) 에 동의합니다.
            <a
              href="/legal/privacy"
              className="ml-1.5 text-ice-600 underline underline-offset-4"
            >
              자세히 보기
            </a>
          </span>
        </label>

        {error && (
          <p
            role="alert"
            aria-live="assertive"
            className="flex items-start gap-2 rounded-xl border border-accent-rose/40 bg-accent-rose/10 px-4 py-3 text-xs font-medium text-accent-rose"
          >
            <AlertCircle
              size={15}
              className="mt-px shrink-0"
              aria-hidden="true"
            />
            {error}
          </p>
        )}

        <div className="space-y-2">
          <button
            type="submit"
            disabled={disabled}
            aria-disabled={disabled}
            className={cn(
              "btn-primary w-full !justify-center !py-3.5 text-base transition-opacity",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            {submitting ? (
              <>
                <Loader2
                  size={16}
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                접수 중...
              </>
            ) : (
              <>
                <Send size={16} aria-hidden="true" />
                상담 신청하기
              </>
            )}
          </button>
          {!isValid && !submitting && (
            <p
              role="status"
              aria-live="polite"
              className="text-center text-xs text-wtext-4"
            >
              필수 항목과 개인정보 동의를 완료하면 신청할 수 있습니다.
            </p>
          )}
        </div>
      </form>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-wline bg-wsurface px-4 py-3 text-sm text-rink-900 placeholder:text-wtext-4 transition-colors hover:bg-wbg focus:border-ice-500 focus:outline-none focus:ring-2 focus:ring-ice-500/20";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-wtext-4">
        {label} {required && <span className="text-ice-600">*</span>}
      </span>
      {children}
    </label>
  );
}
