'use client';

export const dynamic = 'force-dynamic';

/**
 * 아이디·비밀번호 찾기 (2026-06-17 재설계)
 *
 * 로그인 화면 링크: /find-id?tab=id (아이디 찾기) · /find-id?tab=password (비밀번호 찾기)
 *
 * 아이디 찾기(tab=id):
 *   휴대폰 본인인증 완료 → 가입 이력 있으면 아이디 즉시 출력, 없으면 "가입 이력 없음".
 *
 * 비밀번호 찾기(tab=password):
 *   휴대폰 본인인증 완료 → 임시 비밀번호를 받을 이메일 입력 → [발송하기]
 *   → 계정 확인 시 임시 비밀번호 발급 후 입력한 이메일로 발송(로그인 후 변경).
 *
 * 보안: 비밀번호 평문 보관 불가 → 임시 비밀번호 발급. 아이디는 본인인증으로 신원 증명되어 마스킹 없이 노출.
 */

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { Button } from '@/components/ui/Button';
import { NavLink } from '@/components/ui/NavLink';
import { useToast } from '@/components/ui/Toast';
import { useGuestOnly } from '@/contexts/AuthContext';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import IdentityVerifyInput, {
  type IdentityVerifyResult,
} from '@/components/identity/IdentityVerifyInput';
import authService from '@/services/auth';
import { MESSAGES } from '@/lib/messages';

type Tab = 'id' | 'password';

type IdResult =
  | { found: true; loginId: string; createdAt?: string }
  | { found: false }
  | null;

export default function FindAccountPage() {
  useGuestOnly();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const tab: Tab = searchParams.get('tab') === 'password' ? 'password' : 'id';

  const [verified, setVerified] = useState<IdentityVerifyResult | null>(null);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [idResult, setIdResult] = useState<IdResult>(null);
  const [pwDone, setPwDone] = useState(false);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
    showBackButton: true,
  });
  usePageReady(true);

  const title = tab === 'id' ? '아이디 찾기' : '비밀번호 찾기';

  // 아이디 찾기 — 본인인증 완료 즉시 가입 이력 조회.
  const handleIdVerified = async (result: IdentityVerifyResult) => {
    setVerified(result);
    setSubmitting(true);
    const res = await authService.findIdByIdentity({
      identityVerificationId: result.requestId,
    });
    setSubmitting(false);
    if (res.success && res.data) {
      setIdResult(
        res.data.found
          ? {
              found: true,
              loginId: res.data.loginId ?? '',
              createdAt: res.data.createdAt,
            }
          : { found: false },
      );
    } else {
      toast.error(res.error?.message ?? MESSAGES.error.general);
    }
  };

  // 비밀번호 찾기 — 본인인증 + 이메일 입력 후 발송.
  const handleSendPassword = async () => {
    if (!verified) {
      toast.error('휴대폰 본인인증을 먼저 완료해주세요.');
      return;
    }
    if (!email.trim()) {
      toast.error('이메일을 입력해주세요.');
      return;
    }
    setSubmitting(true);
    const res = await authService.findAccount({
      identityVerificationId: verified.requestId,
      email: email.trim(),
    });
    setSubmitting(false);
    if (res.success) {
      setPwDone(true);
      toast.success(res.data?.message ?? '메일을 발송했습니다.');
    } else {
      toast.error(res.error?.message ?? MESSAGES.error.general);
    }
  };

  const formatDate = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(
      d.getDate(),
    ).padStart(2, '0')}`;
  };

  return (
    <MobileContainer>
      <PageAppBar
        title={title}
        centerTitle
        showMy={false}
        showMenu={false}
        forceNative
      />

      <main className="flex flex-col gap-5 px-5 py-6">
        {/* ───────────── 아이디 찾기 ───────────── */}
        {tab === 'id' && idResult !== null ? (
          <section className="flex flex-col items-center gap-4 py-8 text-center">
            {idResult.found ? (
              <>
                <div className="grid h-16 w-16 place-items-center rounded-full bg-ice-100 dark:bg-ice-500/15">
                  <Icon
                    name="badge"
                    className="text-[32px] text-ice-500"
                    aria-hidden="true"
                    filled
                  />
                </div>
                <div>
                  <h2 className="text-w-h3 font-extrabold text-wtext-1 dark:text-white">
                    회원님의 아이디입니다
                  </h2>
                  <div className="mt-4 rounded-w-md border border-wline-2 bg-white px-6 py-4 dark:border-rink-700 dark:bg-rink-800">
                    <p className="text-w-h3 font-extrabold tracking-tight text-ice-500 break-all">
                      {idResult.loginId}
                    </p>
                  </div>
                  {idResult.createdAt && (
                    <p className="mt-2 text-w-caption text-wtext-3 dark:text-rink-300">
                      가입일 {formatDate(idResult.createdAt)}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="grid h-16 w-16 place-items-center rounded-full bg-wline-2 dark:bg-rink-700">
                  <Icon
                    name="person_off"
                    className="text-[32px] text-wtext-3 dark:text-rink-300"
                    aria-hidden="true"
                    filled
                  />
                </div>
                <div>
                  <h2 className="text-w-h3 font-extrabold text-wtext-1 dark:text-white">
                    가입 이력이 없습니다
                  </h2>
                  <p className="mt-2 text-w-small text-wtext-3 dark:text-rink-300">
                    본인인증 정보와 일치하는 가입 계정을 찾지 못했습니다.
                    <br />
                    회원가입을 진행해주세요.
                  </p>
                </div>
              </>
            )}
            <div className="mt-2 flex gap-3">
              <NavLink
                href="/login"
                className="inline-flex h-12 items-center justify-center rounded-w-md bg-ice-500 px-6 text-w-body font-bold text-white hover:bg-ice-500/90 active:brightness-95"
              >
                {idResult.found ? '로그인하러 가기' : '로그인'}
              </NavLink>
              {!idResult.found && (
                <NavLink
                  href="/signup"
                  className="inline-flex h-12 items-center justify-center rounded-w-md border border-wline-2 px-6 text-w-body font-bold text-wtext-2 hover:bg-wbg dark:border-rink-700 dark:text-rink-100"
                >
                  회원가입
                </NavLink>
              )}
            </div>
          </section>
        ) : null}

        {/* ───────────── 비밀번호 찾기: 완료 ───────────── */}
        {tab === 'password' && pwDone ? (
          <section className="flex flex-col items-center gap-4 py-10 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <Icon
                name="mark_email_read"
                className="text-[32px] text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
                filled
              />
            </div>
            <div>
              <h2 className="text-w-h3 font-extrabold text-wtext-1 dark:text-white">
                메일을 발송했습니다
              </h2>
              <p className="mt-2 text-w-small text-wtext-3 dark:text-rink-300">
                입력하신 이메일로 임시 비밀번호를 보냈습니다.
                <br />
                로그인 후 비밀번호를 변경해주세요.
              </p>
            </div>
            <NavLink
              href="/login"
              className="mt-2 inline-flex h-12 items-center justify-center rounded-w-md bg-ice-500 px-8 text-w-body font-bold text-white hover:bg-ice-500/90 active:brightness-95"
            >
              로그인하러 가기
            </NavLink>
          </section>
        ) : null}

        {/* ───────────── 본인인증 + (비번) 이메일 입력 ───────────── */}
        {((tab === 'id' && idResult === null) ||
          (tab === 'password' && !pwDone)) && (
          <>
            <div>
              <h2 className="text-w-h3 font-extrabold text-wtext-1 dark:text-white">
                휴대폰 본인인증
              </h2>
              <p className="mt-1.5 text-w-small text-wtext-3 dark:text-rink-300">
                {tab === 'id'
                  ? '가입 시 사용한 휴대폰으로 본인인증하면 아이디를 알려드립니다.'
                  : '가입 시 사용한 휴대폰으로 본인인증 후, 임시 비밀번호를 받을 이메일을 입력해주세요.'}
              </p>
            </div>

            {/* 1) 휴대폰 본인인증 */}
            <IdentityVerifyInput
              label="이름 (본인인증)"
              verified={verified}
              onVerified={
                tab === 'id' ? handleIdVerified : (r) => setVerified(r)
              }
              onError={(msg: string) => toast.error(msg)}
              disabled={submitting}
            />

            {/* 2) 비밀번호 찾기: 인증 완료 시 이메일 입력칸 활성화 */}
            {tab === 'password' && verified && (
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="find-email"
                  className="text-w-small font-bold text-wtext-2 dark:text-rink-100"
                >
                  임시 비밀번호를 받을 이메일
                </label>
                <input
                  id="find-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="이메일 주소를 입력하세요"
                  className="h-12 w-full rounded-w-md border border-wline-2 bg-white px-4 text-w-body text-wtext-1 placeholder:text-wtext-4 focus:border-ice-500 focus:outline-none focus:ring-2 focus:ring-ice-500/30 dark:border-rink-700 dark:bg-rink-800 dark:text-white"
                />
                <p className="text-w-caption text-wtext-3 dark:text-rink-300">
                  입력하신 이메일 주소로 임시 비밀번호가 발송됩니다.
                </p>
              </div>
            )}

            {tab === 'id' && submitting && (
              <p className="text-center text-w-small text-wtext-3 dark:text-rink-300">
                가입 이력을 확인하는 중...
              </p>
            )}

            {tab === 'password' && (
              <Button
                onClick={handleSendPassword}
                disabled={!verified || email.trim().length === 0 || submitting}
                className="mt-2 w-full"
              >
                {submitting ? '발송 중...' : '발송하기'}
              </Button>
            )}
          </>
        )}
      </main>
    </MobileContainer>
  );
}
