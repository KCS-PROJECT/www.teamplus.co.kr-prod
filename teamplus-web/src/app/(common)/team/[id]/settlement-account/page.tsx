"use client";

import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { BottomSheetSelector } from "@/components/ui/BottomSheetSelector";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { AuthContext } from "@/contexts/AuthContext";
import { useNativeUI } from "@/hooks/useNativeUI";
import { useNavigation } from "@/hooks/useNavigation";
import { usePageReady } from "@/hooks/usePageReady";
import { MESSAGES } from "@/lib/messages";
import { emitRefresh, REFRESH_KEYS } from "@/lib/refresh-bus";
import { settlementAccountStatusView } from "@/lib/settlement-account-status";
import { cn } from "@/lib/utils";
import {
  getBankCodes,
  getTeam,
  getTeamSettlementAccount,
  upsertTeamSettlementAccount,
  type BankCodeOption,
  type TeamSettlementAccount,
} from "@/services/team.service";

const M = MESSAGES.settlementAccount;

const INPUT_WRAP =
  "h-12 rounded-w-md bg-it-fill dark:bg-it-blue-950 px-4 flex items-center border-[1.5px] border-it-line-strong dark:border-it-blue-900 transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none focus-within:border-it-blue-500 focus-within:ring-2 focus-within:ring-it-blue-500/20";
const INPUT_ERROR =
  "border-it-red-500 focus-within:border-it-red-500 focus-within:ring-it-red-500/20";
const INPUT =
  "flex-1 min-w-0 bg-transparent border-0 outline-none focus-visible-disabled text-[15.5px] font-extrabold text-it-ink-800 dark:text-white tracking-tight tabular-nums placeholder:text-it-ink-400 placeholder:font-medium";

const digitsOnly = (v: string) => v.replace(/[^0-9]/g, "");
const numericWithHyphen = (v: string) => v.replace(/[^0-9-]/g, "");

export default function TeamSettlementAccountPage() {
  useNativeUI({ showStatusBar: true, showAppBar: false, showBottomNav: true });

  const params = useParams();
  const { navigate, back } = useNavigation();
  const { toast } = useToast();
  const user = useContext(AuthContext)?.user;

  const teamId = useMemo(() => {
    const raw = params?.id;
    return Array.isArray(raw) ? raw[0] : (raw ?? "");
  }, [params]);

  const [loading, setLoading] = useState(true);
  usePageReady(!loading);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [notOwner, setNotOwner] = useState(false);
  const [account, setAccount] = useState<TeamSettlementAccount | null>(null);
  const [banks, setBanks] = useState<BankCodeOption[]>([]);

  const [businessNumber, setBusinessNumber] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [bankSheetOpen, setBankSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // keepInput: 저장 실패 뒤 재조회에서 사용자가 입력한 은행·예금주·사업자번호를 보존한다.
  const applyAccount = useCallback(
    (data: TeamSettlementAccount | null, keepInput = false) => {
      setAccount(data);
      setBankAccount("");
      if (keepInput) return;
      setBankCode(data?.bankCode ?? "");
      setAccountHolder(data?.accountHolder ?? "");
      setBusinessNumber("");
    },
    [],
  );

  // silent: 저장 실패 뒤 서버 상태 동기화용 — 풀 화면 로딩으로 폼과 오류 메시지를 지우지 않는다.
  const load = useCallback(
    async (silent = false) => {
      if (!teamId || !user) return;
      if (!silent) setLoading(true);
      setLoadError(null);
      try {
        const [teamRes, bankRes] = await Promise.all([getTeam(teamId), getBankCodes()]);

        if (teamRes.error?.statusCode === 403) {
          setNotOwner(true);
          return;
        }
        if (!teamRes.success || !teamRes.data || !bankRes.success) {
          setLoadError(teamRes.error?.message || M.loadError);
          return;
        }
        // 소유 확인 전에는 계좌 API 를 호출하지 않는다.
        if (teamRes.data.club?.coachId !== user.id) {
          setNotOwner(true);
          return;
        }
        const accountRes = await getTeamSettlementAccount(teamId);
        if (accountRes.error?.statusCode === 403) {
          setNotOwner(true);
          return;
        }
        if (!accountRes.success) {
          setLoadError(accountRes.error?.message || M.loadError);
          return;
        }
        setNotOwner(false);
        setBanks(bankRes.data ?? []);
        applyAccount(accountRes.data ?? null, silent);
      } catch {
        setLoadError(MESSAGES.error.network);
      } finally {
        setLoading(false);
      }
    },
    [teamId, user, applyAccount],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const isFirst = account === null;
  const bnDigits = digitsOnly(businessNumber);
  const accountDigits = digitsOnly(bankAccount);
  const holder = accountHolder.trim();

  const bnError =
    isFirst && businessNumber !== "" && bnDigits.length !== 10
      ? M.businessNumberInvalid
      : null;
  const accountError =
    bankAccount !== "" && (accountDigits.length < 6 || accountDigits.length > 30)
      ? M.accountInvalid
      : null;

  const canSubmit =
    !submitting &&
    (!isFirst || bnDigits.length === 10) &&
    bankCode !== "" &&
    accountDigits.length >= 6 &&
    accountDigits.length <= 30 &&
    holder.length >= 1 &&
    holder.length <= 30;

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!canSubmit) return;
      setSubmitting(true);
      setServerError(null);
      try {
        const res = await upsertTeamSettlementAccount(teamId, {
          ...(isFirst ? { businessNumber: bnDigits } : {}),
          bankCode,
          bankAccount: accountDigits,
          accountHolder: holder,
        });
        if (res.success && res.data) {
          applyAccount(res.data);
          toast.success(M.saveSuccess);
          emitRefresh([REFRESH_KEYS.TEAM, teamId]);
        } else {
          const message = res.error?.message || MESSAGES.error.general;
          setServerError(message);
          // 400/409 는 서버 쪽 계좌 상태가 바뀌었을 수 있어(운영자 초기화 등) 첫 저장 모드 판정을 다시 맞춘다.
          const code = res.error?.statusCode;
          if (code === 400 || code === 409) {
            toast.error(message);
            await load(true);
          }
        }
      } catch {
        setServerError(MESSAGES.error.network);
      } finally {
        setSubmitting(false);
      }
    },
    [canSubmit, teamId, isFirst, bnDigits, bankCode, accountDigits, holder, applyAccount, toast, load],
  );

  const goTeam = useCallback(() => navigate(`/team/${teamId}`), [navigate, teamId]);
  // 팀 상세·지급 정산·팀 홈 어디서 들어와도 온 곳으로 돌아간다. 뒤로가기를 팀 상세 push 로 두면
  //   기록이 쌓여 두 화면을 오간다. 알림·새로고침으로 직접 열려 기록이 없을 때만 팀 상세로 보낸다.
  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) back();
    else navigate(`/team/${teamId}`);
  }, [back, navigate, teamId]);

  const selectedBankName =
    banks.find((b) => b.code === bankCode)?.name ?? account?.bankName ?? "";
  const statusView = settlementAccountStatusView(account?.status);

  const shell = (children: React.ReactNode) => (
    <MobileContainer hasBottomNav>
      <PageAppBar title={M.pageTitle} onBack={handleBack} forceNative />
      {children}
    </MobileContainer>
  );

  if (loading) {
    return shell(<main className="flex-1 bg-it-canvas dark:bg-puck" />);
  }

  if (notOwner || loadError) {
    return shell(
      <main className="flex-1 flex items-center justify-center bg-it-canvas dark:bg-puck">
        <EmptyState
          icon="error_outline"
          title={notOwner ? M.notOwner : (loadError ?? M.loadError)}
          actionLabel={notOwner ? M.backToTeam : MESSAGES.common.retry}
          onAction={notOwner ? goTeam : () => void load()}
        />
      </main>,
    );
  }

  return shell(
    <main
      className="hide-scrollbar flex-1 overflow-y-auto bg-it-canvas dark:bg-puck"
      role="main"
      aria-label={M.pageTitle}
    >
      <section className="bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-5" aria-live="polite">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-extrabold tracking-tight text-it-ink-800 dark:text-white">
            {M.rowLabel}
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded-w-pill px-2.5 py-0.5 text-[12px] font-extrabold",
              statusView.badge,
            )}
          >
            {statusView.label}
          </span>
        </div>
        <p className="mt-2 text-[13px] font-semibold leading-relaxed text-it-ink-500 dark:text-it-ink-300">
          {statusView.hint}
        </p>
      </section>

      <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

      <form onSubmit={handleSubmit} className="bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-6">
        <Field label={M.businessNumberLabel} required={isFirst}>
          {account ? (
            <>
              <div className={cn(INPUT_WRAP, "bg-it-canvas dark:bg-rink-800")}>
                <span className="flex-1 text-[15.5px] font-extrabold tracking-tight text-it-ink-500 tabular-nums dark:text-it-ink-300">
                  {account.businessNumber}
                </span>
                <Icon name="lock" className="shrink-0 text-base text-it-ink-400" aria-hidden="true" />
              </div>
              <Hint text={M.businessNumberLockedHint} />
            </>
          ) : (
            <>
              <div className={cn(INPUT_WRAP, bnError && INPUT_ERROR)}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={businessNumber}
                  onChange={(e) => setBusinessNumber(numericWithHyphen(e.target.value))}
                  placeholder={M.businessNumberPlaceholder}
                  className={INPUT}
                  maxLength={12}
                  autoComplete="off"
                  aria-invalid={!!bnError}
                />
              </div>
              {bnError && <FieldError message={bnError} />}
            </>
          )}
        </Field>

        <Field label={M.bankLabel} required>
          <button
            type="button"
            onClick={() => setBankSheetOpen(true)}
            aria-label={M.bankLabel}
            className="flex h-12 w-full items-center gap-2 rounded-w-md border-[1.5px] border-it-line-strong bg-it-fill px-4 text-left transition-colors motion-reduce:transition-none focus-visible:border-it-blue-500 focus-visible:outline-none dark:border-it-blue-900 dark:bg-it-blue-950"
          >
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[15.5px] tracking-tight",
                selectedBankName
                  ? "font-bold text-it-ink-800 dark:text-white"
                  : "font-medium text-it-ink-400",
              )}
            >
              {selectedBankName || M.bankPlaceholder}
            </span>
            <Icon name="expand_more" className="ml-auto shrink-0 text-base text-it-ink-300" aria-hidden="true" />
          </button>
        </Field>

        <Field label={M.accountLabel} required>
          <div className={cn(INPUT_WRAP, accountError && INPUT_ERROR)}>
            <input
              type="text"
              inputMode="numeric"
              value={bankAccount}
              onChange={(e) => setBankAccount(numericWithHyphen(e.target.value))}
              placeholder={account ? account.bankAccount : M.accountPlaceholder}
              className={INPUT}
              maxLength={40}
              autoComplete="off"
              aria-invalid={!!accountError}
            />
          </div>
          {accountError && <FieldError message={accountError} />}
          {account && (
            <Hint text={`${M.accountCurrent(account.bankAccount)} ${M.accountReenterHint}`} />
          )}
        </Field>

        <Field label={M.holderLabel} required>
          <div className={INPUT_WRAP}>
            <input
              type="text"
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
              placeholder={M.holderPlaceholder}
              className={INPUT}
              maxLength={30}
              autoComplete="off"
            />
          </div>
        </Field>

        {serverError && (
          <div
            role="alert"
            className="mb-5 rounded-w-md border-[1.5px] border-it-red-200 bg-it-red-50 px-3.5 py-3 dark:border-it-red-500/40 dark:bg-it-red-500/10"
          >
            <p className="text-[13px] font-semibold text-it-red-600 dark:text-it-red-300">
              {serverError}
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          aria-disabled={!canSubmit}
          className="inline-flex h-[50px] w-full items-center justify-center rounded-w-md bg-it-blue-500 text-[15px] font-extrabold tracking-tight text-white transition-colors duration-150 ease-ios hover:bg-it-blue-600 active:brightness-95 disabled:cursor-not-allowed disabled:bg-it-line-strong motion-reduce:transition-none dark:disabled:bg-it-blue-900"
        >
          {submitting ? MESSAGES.common.saving : MESSAGES.common.save}
        </button>
      </form>

      <BottomSheetSelector
        isOpen={bankSheetOpen}
        title={M.bankSheetTitle}
        items={banks.map((b) => ({
          id: b.code,
          name: b.name,
          selected: b.code === bankCode,
        }))}
        onSelect={(code) => {
          setBankCode(code);
          setBankSheetOpen(false);
        }}
        onClose={() => setBankSheetOpen(false)}
      />
    </main>,
  );
}

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
    <div className="mb-[18px]">
      <div className="mb-2 flex items-center gap-1">
        <span className="text-[14px] font-extrabold tracking-tight text-it-ink-800 dark:text-white">
          {label}
        </span>
        {required && <span className="text-[14px] font-extrabold text-it-red-500">*</span>}
      </div>
      {children}
    </div>
  );
}

function Hint({ text }: { text: string }) {
  return (
    <div className="mt-1.5 text-[13px] font-semibold text-it-ink-500 dark:text-it-ink-300">
      {text}
    </div>
  );
}

function FieldError({ message }: { message: string }) {
  return (
    <p role="alert" className="mt-1.5 text-card-body text-it-red-500">
      {message}
    </p>
  );
}
