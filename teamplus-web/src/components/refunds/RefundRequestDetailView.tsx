'use client';

/**
 * RefundRequestDetailView — 환불 요청 상세 + 승인/거절/재처리(팀/오픈클래스 공유)
 *
 * 백엔드 상세 계약(중첩 구조 SoT): payment / request / usage(태그드 유니언) /
 * snapshotVsCurrent / decision / history / scope. 결제정보·요청정보·사용현황(판단
 * 자료)·스냅샷 vs 현재·이력을 보이고, 상태별로 CTA 를 분기한다:
 *   pending          → 승인/거절 (judgmentDataOk=false 시 승인 비활성 fail-closed)
 *   executing        → 처리 중 안내(승인 CTA 숨김)
 *   executed         → 완료 안내
 *   execution_failed → 재처리 + 거절(이체 미발생 확정 실패만) 동선(일반 승인 버튼 미노출)
 *   rejected/canceled→ 종료 안내
 *
 * fail-closed 게이트(모든 mutate CTA 미노출):
 *   - status/sourceType='unknown' 또는 구조 무효 → 전체 오류 화면(재시도).
 *   - 역할 부적합(scope=team→director/admin, scope=academy→academy_director/admin
 *     외 COACH 등) → 읽기 전용 안내.
 *   - URL [id] ≠ detail.scope.academyId(또는 팀 화면에 아카데미 요청) → 컨텍스트 오류.
 *   - 재조회 실패(stale) → mutate CTA 잠금 + 새로고침 안내.
 * 409(이미 처리됨) → 안내 후 재조회로 처리자/시각 반영·CTA 제거. 403 → 전용 lock.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import type { ApiResponse } from '@/types';
import { useToast } from '@/components/ui/Toast';
import { useModal } from '@/components/ui/Modal/ModalContext';
import { useNavigation } from '@/hooks/useNavigation';
import {
  getRefundRequestDetail,
  approveRefundRequest,
  rejectRefundRequest,
  reprocessRefundRequest,
  reconcileRefundRequest,
  canManageRefund,
  type RefundRequestDetail,
  type RefundRequestStatus,
  type RefundReconcileOutcome,
  type RefundScope,
  type RefundUsage,
} from '@/services/payment';
import { shouldApplyDetailResponse, isActionStillCurrent } from './refund-guards';

/**
 * PG 취소 결과 미확정 실패 코드 — 백엔드 REFUND_PG_UNCONFIRMED_CODES 와 동일 집합.
 * 취소 여부를 모르는 상태라 거절(종결) 대상이 아니다.
 */
const PG_UNCONFIRMED_CODES = [
  'KG_UNCONFIRMED',
  'TOSS_UNCONFIRMED',
  'TOSS_IDEMPOTENCY_CONFLICT',
];

/** Payment.paymentStatus 원문 키 → 한글 라벨 (미지 값은 원문 유지 — 정보 유실 방지). */
function formatPaymentStatus(status: string): string {
  return MESSAGES.refund.paymentStatus[status] ?? status;
}
import { RefundStatusBadge } from './RefundStatusBadge';
import { RefundRiskFlags } from './RefundRiskFlags';
import { RefundApproveSheet } from './RefundApproveSheet';
import { RefundRejectSheet } from './RefundRejectSheet';
import { RefundReconcileSheet } from './RefundReconcileSheet';

interface RefundRequestDetailViewProps {
  requestId: string;
  /** 목록 스코프 — 컨텍스트 대조·목록 복귀 경로 판별. */
  scope: RefundScope;
  /** academy scope 의 URL academyId — 컨텍스트 대조 기준. */
  scopeId?: string;
  /**
   * 현재 사용자 역할 — 페이지가 layout-provided user(useRouteUser)로 주입.
   * 컴포넌트에서 useAuth() 직접 호출 금지(인증 훅 layout 단일 호출 원칙).
   * 승인 권한은 상세 sourceType 과 함께 canManageRefund 로 판정한다(DIRECT=admin 전용).
   */
  userType?: string;
  /** 데이터 로드+셋팅 완료(성공/실패) 시 1회 호출 — 페이지 풀스크린 로더 hide. */
  onReady?: () => void;
}

/** 승인/거절/재처리/정산 API 응답의 공통 형태 — handleActionResult·runDetailAction 공유. */
type RefundActionResult = {
  success: boolean;
  data?: { status?: RefundRequestStatus } | null;
  error?: { statusCode?: number; message?: string };
};

/** ISO → "YYYY.MM.DD HH:mm". */
function formatDateTime(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}.${m}.${day} ${hh}:${mm}`;
}

export function RefundRequestDetailView({
  requestId,
  scope,
  scopeId,
  userType,
  onReady,
}: RefundRequestDetailViewProps) {
  const { toast } = useToast();
  const { modal } = useModal();
  const { navigate } = useNavigation();

  // 상세 상태를 현재 route(requestId)에 귀속 — render 시 저장된 requestId 가 현재와 다르면 이전
  //   상세·CTA 를 절대 표시하지 않는다(page 의 key={requestId} 리마운트와 이중 방어). 초기 조회 실패
  //   시 이전 detail 을 fail-closed 로 폐기해 이전 환불 건에 금전 액션이 실행되는 것을 원천 차단한다.
  const [detailState, setDetailState] = useState<{
    requestId: string;
    detail: RefundRequestDetail | null;
    errorCode: number | null;
  }>({ requestId, detail: null, errorCode: null });
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [staleReload, setStaleReload] = useState(false); // 재조회 실패 → mutate 잠금

  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // 요청 세대(generation) — 모든 fetch 가 **자기 generation**을 발급하고, 완료 시 최신 세대일 때만
  // state/flag 를 쓴다. 겹친 reload 의 out-of-order 덮어쓰기·stale 요청의 flag 조기 해제를 차단.
  const requestSeq = useRef(0);
  // 현재 라우트 requestId 를 매 렌더 **동기** 반영 — 모든 stale 가드의 단일 기준. action 핸들러는
  // 시작 시(및 confirm 모달 호출 전) 이 값을 캡처하고, 모든 await 직후 현재값과 대조해 다른 상세로
  // 전환됐으면(=stale action) 토스트·시트닫기·reload·state write·API 호출을 전부 억제한다. render
  // 중 갱신되므로 passive effect(useEffect) 실행 전 경합창(req-2 commit~effect 사이)까지 봉쇄한다.
  const currentRequestIdRef = useRef(requestId);
  currentRequestIdRef.current = requestId;

  // render-time route 귀속 — 저장된 requestId 가 현재와 다르면 이전 상세/오류를 표시하지 않는다
  //   (render→passive-effect 구간·초기 조회 실패 시 이전 CTA 노출 차단).
  const detail = detailState.requestId === requestId ? detailState.detail : null;
  const errorCode = detailState.requestId === requestId ? detailState.errorCode : null;

  /** 초기/재시도 결과 반영 — 실패 시 이전 detail 을 fail-closed 폐기(errorCode 만 남기지 않음). */
  const writeInitial = useCallback((forRequestId: string, res: ApiResponse<RefundRequestDetail>) => {
    if (res.success && res.data) {
      setDetailState({ requestId: forRequestId, detail: res.data, errorCode: null });
      setStaleReload(false);
    } else {
      // 초기 조회 실패 — 현재 route 에 귀속시키되 detail 은 폐기(이전 상세로 금전 액션 방지).
      setDetailState({ requestId: forRequestId, detail: null, errorCode: res.error?.statusCode ?? 500 });
    }
  }, []);

  /** 재조회 결과 반영 — 실패 시 같은 requestId 내 기존 detail 유지 + staleReload(mutate 잠금). */
  const writeReload = useCallback((forRequestId: string, res: ApiResponse<RefundRequestDetail>) => {
    if (res.success && res.data) {
      setDetailState({ requestId: forRequestId, detail: res.data, errorCode: null });
      setStaleReload(false);
    } else {
      setStaleReload(true); // detail 보존 — CTA만 잠금(같은 requestId 내 reload 실패 정책 존속)
    }
  }, []);

  /**
   * 상세 fetch 공통 실행기 — 초기/reload/retry/refresh 4경로의 "세대 발급→fetch→requestId+gen 판정
   * →write/flag" 반복을 단일화(judgment 로직 변화 0 · 순수 정리). 판정은 shouldApplyDetailResponse
   * (현재 route requestId + 자기 세대) 단일 기준. reload 는 이미 다른 상세면 세대 발급 없이 조기 반환.
   *
   * 중복 방어 정리: 기존 초기 effect 의 `cancelled` 는 shouldApplyDetailResponse 의 requestId 비교
   *   (+ page 의 key={requestId} 리마운트)로 대체돼 제거했다 — 전환 시 capturedRequestId ≠ 현재 route
   *   로 write 가 차단되고, React 18 은 unmount 후 setState 를 무시(경고 없음)한다. requestSeq(gen)는
   *   같은 requestId 내 겹친 reload 의 out-of-order 덮어쓰기를 막으므로 이중 방어로 유지한다.
   */
  const runDetailFetch = useCallback(
    async (kind: 'initial' | 'reload' | 'retry' | 'refresh'): Promise<void> => {
      // reload: 이미 다른 상세로 전환됐으면 세대 발급 없이 조기 반환(stale action 이 새 세대 발급 방지).
      if (kind === 'reload' && requestId !== currentRequestIdRef.current) return;
      const capturedRequestId = requestId;
      const gen = ++requestSeq.current;
      if (kind === 'initial') setIsLoading(true);
      if (kind === 'retry' || kind === 'refresh') setIsRetrying(true);
      const applies = () =>
        shouldApplyDetailResponse(
          { requestId: capturedRequestId, gen },
          { requestId: currentRequestIdRef.current, gen: requestSeq.current },
        );
      try {
        const res = await getRefundRequestDetail(capturedRequestId);
        if (!applies()) return; // 전환(render~effect 경합창 포함)/더 최신 요청 → write·flag 억제
        if (kind === 'reload' || kind === 'refresh') writeReload(capturedRequestId, res);
        else writeInitial(capturedRequestId, res);
        if (kind === 'initial') {
          setIsLoading(false);
          onReady?.();
        }
      } finally {
        // retry/refresh 만 자기 요청이 현재 route·세대일 때 flag 해제(stale 이 새 화면 flag 미변경).
        if ((kind === 'retry' || kind === 'refresh') && applies()) setIsRetrying(false);
      }
    },
    [requestId, writeInitial, writeReload, onReady],
  );

  /** 액션 후 재조회 — 공통 실행기(reload) 위임. */
  const reload = useCallback(() => runDetailFetch('reload'), [runDetailFetch]);

  useEffect(() => {
    // 라우트 전환/최초 마운트 — 이전 상세의 전이 flag/시트 정리(리마운트 시엔 새 인스턴스라 무해).
    setIsRetrying(false);
    setIsProcessing(false);
    setApproveOpen(false);
    setRejectOpen(false);
    setReconcileOpen(false);
    void runDetailFetch('initial');
    // requestId 변경만 재조회 트리거(runDetailFetch 는 requestId 의존 안정 참조).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  const handleRetry = useCallback(() => runDetailFetch('retry'), [runDetailFetch]);
  const handleRefreshStale = useCallback(() => runDetailFetch('refresh'), [runDetailFetch]);

  /** 승인/거절/재처리 응답 공통 처리 — 200+execution_failed 는 실패, 409/403 은 안내 후 재조회. */
  const handleActionResult = useCallback(
    async (res: RefundActionResult, successMsg: string, failMsg: string) => {
      if (res.success) {
        // 2xx 여도 status=execution_failed(실행 실패)면 성공 토스트 금지 — 실패 안내 + 재조회.
        if (res.data?.status === 'execution_failed') {
          toast.error(MESSAGES.refund.executionFailedToast);
        } else {
          toast.success(successMsg);
        }
        await reload();
        return;
      }
      const code = res.error?.statusCode;
      if (code === 409) {
        // 서버 메시지 우선(동시 처리 vs 이미 환불된 결제 구분), 폴백 alreadyHandled.
        toast.error(res.error?.message ?? MESSAGES.refund.alreadyHandled);
        await reload();
      } else if (code === 403) {
        toast.error(MESSAGES.refund.noPermission);
        await reload();
      } else {
        toast.error(res.error?.message ?? failMsg);
      }
    },
    [reload, toast],
  );

  /**
   * 액션 공통 실행기 — 승인/거절/재처리/정산의 "5시점 재검증(⑨-2 UI 불변조건 3)·API·결과 처리·finally"
   * 골격을 단일화. targetId=화면 실데이터(detail.id) · currentRequestIdRef=현재 route.
   *   ② API 호출 직전 · ③ 응답 직후 · ⑤ finally 에서 isActionStillCurrent(targetId, 현재 route) 재검증.
   *   (① 모달/시트 실행 전은 호출부의 targetId 캡처로, ④ reload 전은 reload 자체 가드로 충족.)
   * onAfterResponse: 대상 일치 확인 후 sheet close 등 액션별 후처리(응답 결과에 따른 분기 허용).
   */
  const runDetailAction = useCallback(
    async (
      targetId: string,
      apiCall: (id: string) => Promise<RefundActionResult>,
      opts: { successMsg: string; failMsg: string; onAfterResponse?: (res: RefundActionResult) => void },
    ): Promise<void> => {
      // ② API 호출 직전 — 대상 ID ≠ 현재 route 면 호출 자체 금지(모달 대기 중 전환 등).
      if (!isActionStillCurrent(targetId, currentRequestIdRef.current)) return;
      setIsProcessing(true);
      try {
        const res = await apiCall(targetId);
        // ③ 응답 직후 — 이후 부수효과(sheet/toast/reload/state) 전부 억제.
        if (!isActionStillCurrent(targetId, currentRequestIdRef.current)) return;
        opts.onAfterResponse?.(res);
        await handleActionResult(res, opts.successMsg, opts.failMsg);
      } finally {
        // ⑤ finally — 자기 대상이 현재 route 일 때만 processing 해제(stale 이 새 화면 미변경).
        if (isActionStillCurrent(targetId, currentRequestIdRef.current)) setIsProcessing(false);
      }
    },
    [handleActionResult],
  );

  const handleApprove = useCallback(
    () => {
      if (!detail) return;
      const version = detail.version;
      return runDetailAction(detail.id, (id) => approveRefundRequest(id, { version }), {
        successMsg: MESSAGES.refund.approveSuccess,
        failMsg: MESSAGES.refund.approveFailed,
        onAfterResponse: () => setApproveOpen(false),
      });
    },
    [detail, runDetailAction],
  );

  const handleReject = useCallback(
    (reason: string) => {
      if (!detail) return;
      const version = detail.version;
      return runDetailAction(
        detail.id,
        (id) => rejectRefundRequest(id, { version, decisionReason: reason }),
        {
          successMsg: MESSAGES.refund.rejectSuccess,
          failMsg: MESSAGES.refund.rejectFailed,
          onAfterResponse: () => setRejectOpen(false),
        },
      );
    },
    [detail, runDetailAction],
  );

  const handleReprocess = useCallback(async () => {
    if (!detail) return;
    // ① 모달/시트 실행 전 — 실제 API 대상(detail.id) 캡처. 모달 대기 중 전환 시 runDetailAction 의
    //   API 호출 직전(②) 재검증이 이전 환불 ID 실행을 차단한다.
    const targetId = detail.id;
    const version = detail.version;
    const body =
      detail.decision.failureStage === 'DB_AFTER_PG'
        ? MESSAGES.refund.reprocessBodyDbAfterPg
        : MESSAGES.refund.reprocessBodyPg;
    const ok = await modal.confirm({
      title: MESSAGES.refund.reprocessSheetTitle,
      message: body,
      confirmText: MESSAGES.refund.reprocessConfirm,
      cancelText: MESSAGES.refund.requestModalCancel,
    });
    if (!ok) return;
    await runDetailAction(targetId, (id) => reprocessRefundRequest(id, { version }), {
      successMsg: MESSAGES.refund.reprocessSuccess,
      failMsg: MESSAGES.refund.reprocessFailed,
    });
  }, [detail, runDetailAction, modal]);

  const handleReconcile = useCallback(
    (outcome: RefundReconcileOutcome, memo: string) => {
      if (!detail) return;
      const version = detail.version;
      return runDetailAction(
        detail.id,
        (id) => reconcileRefundRequest(id, { version, outcome, memo }),
        {
          successMsg: MESSAGES.refund.reconcileSuccess,
          failMsg: MESSAGES.refund.reconcileFailed,
          // 시트는 성공(2xx)/409(이미 처리)만 close — 일반 실패는 시트+memo 유지(재시도).
          onAfterResponse: (res) => {
            if (res.success || res.error?.statusCode === 409) setReconcileOpen(false);
          },
        },
      );
    },
    [detail, runDetailAction],
  );

  const goToList = useCallback(() => {
    const path =
      scope === 'academy'
        ? `/academy/${scopeId}/refunds`
        : '/director-payments/refunds';
    void navigate(path);
  }, [navigate, scope, scopeId]);

  // 최초 풀스크린 로더는 페이지 usePageReady 가 처리 — 로딩 중엔 null.
  //   detailState 가 아직 현재 route 에 귀속되지 않았으면(리마운트 전 render→effect gap 등) 이전
  //   상세/오류 대신 로딩(null)으로 처리 — fail-closed(이전 CTA·오류 화면 노출 방지).
  if (isLoading || detailState.requestId !== requestId) return null;

  // 권한 없음(403) — 전용 상태.
  if (errorCode === 403) {
    return (
      <RefundDetailNotice icon="lock" tone="neutral" message={MESSAGES.refund.noPermission} />
    );
  }

  // 로드 실패 / 구조 무효(fail-closed) / 오프라인 — 재시도.
  if (!detail) {
    return (
      <RefundDetailError message={MESSAGES.refund.detailLoadFailed} onRetry={handleRetry} retrying={isRetrying} />
    );
  }

  // 미지 상태/출처(fail-closed) — 부분 렌더 금지, 전체 오류 화면 + 재시도.
  const statusKnown = detail.status !== 'unknown' && detail.sourceType !== 'unknown';
  if (!statusKnown) {
    return (
      <RefundDetailError message={MESSAGES.refund.invalidDetail} onRetry={handleRetry} retrying={isRetrying} />
    );
  }

  // 승인 권한 — 상세 sourceType 반영(DIRECT=admin 전용). useAuth 미사용(userType prop).
  const isDirect = detail.sourceType === 'DIRECT';
  const canManage = canManageRefund(scope, userType, detail.sourceType);

  // URL 컨텍스트 대조 — 백엔드가 scope 를 상시 emit(DIRECT 원장 포함). scope 필수(부재=fail-closed).
  //   DIRECT: 팀 화면 + admin 역할만 허용(admin 전역 조회 진입 = /director-payments/refunds).
  //           아카데미 화면·비admin 은 fail-closed.
  //   academy: scope.academyId 필수 & URL [id] 일치. team: scope.teamId 필수 & academyId 부재.
  const scopeInfo = detail.scope;
  const contextMismatch = !scopeInfo
    ? true // scope 부재 = 오염(fail-closed)
    : isDirect
      ? !(scope === 'team' && canManage) // DIRECT = 팀 화면 + admin 만
      : scope === 'academy'
        ? !scopeInfo.academyId || scopeInfo.academyId !== (scopeId ?? null)
        : !scopeInfo.teamId || !!scopeInfo.academyId;
  if (contextMismatch) {
    // DIRECT(관리자 처리 건)는 오류가 아니라 안내 — 문구/아이콘을 중립 톤으로.
    return (
      <div className="bg-it-surface px-5 pt-4 dark:bg-rink-800">
        <div
          className="flex flex-col items-center gap-3 py-14 text-center"
          role="alert"
        >
          <div
            className={cn(
              'flex h-14 w-14 items-center justify-center rounded-w-pill',
              isDirect
                ? 'bg-it-fill dark:bg-it-blue-900/40'
                : 'bg-it-red-50 dark:bg-it-red-500/15',
            )}
          >
            <Icon
              name={isDirect ? 'admin_panel_settings' : 'report'}
              className={cn(
                'text-3xl',
                isDirect
                  ? 'text-it-ink-500 dark:text-it-ink-200'
                  : 'text-it-red-600 dark:text-it-red-400',
              )}
              aria-hidden="true"
            />
          </div>
          <p className="text-card-body text-it-ink-500 dark:text-wtext-4">
            {isDirect ? MESSAGES.refund.directHandled : MESSAGES.refund.contextMismatch}
          </p>
          <button
            type="button"
            onClick={goToList}
            className="mt-1 inline-flex items-center gap-1 rounded-w-md bg-it-blue-500 px-5 py-2.5 text-card-body font-bold text-white transition-colors hover:bg-it-blue-600 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 motion-reduce:transition-none"
          >
            <Icon name="list_alt" className="text-card-title" aria-hidden="true" />
            {MESSAGES.refund.backToList}
          </button>
        </div>
      </div>
    );
  }

  const { payment, request, snapshotVsCurrent, decision, history } = detail;
  const isPending = detail.status === 'pending';
  const isFailed = detail.status === 'execution_failed';

  // CTA 게이트 — DIRECT 는 승인/거절 없음(admin 재처리만). canManage 는 위에서 sourceType 반영.
  const isKgUnconfirmed = detail.decision.failureCode === 'KG_UNCONFIRMED';
  const roleLower = (userType ?? '').toLowerCase();
  const isAdminTier =
    roleLower === 'admin' || roleLower === 'system' || roleLower === 'oper';
  const canApprove = isPending && detail.judgmentDataOk && !staleReload;
  const showApproveReject = isPending && !isDirect;
  // KG 미확정 실패는 일반 재처리 숨김 → ADMIN reconcile 시트로만 해소.
  const showReprocess = isFailed && !isKgUnconfirmed;
  const showReconcile = isKgUnconfirmed && isAdminTier;
  // 실행 실패 거절 = 이체가 발생하지 않은 것이 확정된 PG 거절만(백엔드 가드와 동일 조건).
  //   DB_AFTER_PG(이체 완료 후 DB 실패) · PG 미확정 코드는 재처리/reconcile 로만 해소한다.
  const showRejectOnFailed =
    isFailed &&
    !isDirect &&
    decision.failureStage === 'PG' &&
    !PG_UNCONFIRMED_CODES.includes(decision.failureCode ?? '');
  // 대상 귀속 belt — detail.id 가 현재 route requestId 와 다르면 어떤 CTA 도 노출하지 않는다
  //   (렌더 귀속 가드의 이중 방어; 금전 액션 대상이 route 와 어긋나는 것을 원천 차단).
  const detailMatchesRoute = detail.id === requestId;
  const actionable =
    detailMatchesRoute &&
    (showApproveReject || showReprocess || showReconcile || showRejectOnFailed);

  // hasPriorRefund 파생 — 요청 생성 이전에 처리된 환불 이력 존재 여부.
  const priorRefund = history.some(
    (h) =>
      h.processedAt &&
      request.createdAt &&
      new Date(h.processedAt).getTime() < new Date(request.createdAt).getTime(),
  );
  const hasHistorySection = priorRefund || !!decision.decidedByName || !!decision.failureStage;

  return (
    <div className="flex flex-col">
      {/* ── 상태 헤더 (navy 밴드) ─────────────────────────── */}
      <section className="bg-it-blue-800 px-5 pb-5 pt-5 dark:bg-it-blue-950">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-w-h2 font-extrabold tracking-[-0.02em] text-white">
              {detail.subjectLabel || payment.product || MESSAGES.refund.detailTitle}
            </p>
            <p className="mt-1 text-[13px] text-white/70">
              {request.requesterName}
              {request.childName ? ` · ${request.childName}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <RefundStatusBadge status={detail.status} className="bg-white/15 text-white dark:bg-white/15" />
            {isDirect && (
              <span className="inline-flex items-center gap-1 rounded-w-pill bg-white/15 px-2.5 py-1 text-[11.5px] font-bold text-white">
                <Icon name="admin_panel_settings" className="text-[13px]" aria-hidden="true" />
                {MESSAGES.refund.sourceDirect}
              </span>
            )}
          </div>
        </div>
        <div className="mt-4 border-t border-white/15 pt-3.5">
          <p className="text-[12px] text-white/70">{MESSAGES.refund.paymentAmount}</p>
          <p className="mt-[3px] text-[30px] font-extrabold leading-none text-white tabular-nums">
            {payment.amount.toLocaleString()}
            <span className="ml-1 text-w-body font-semibold text-white/70">
              {MESSAGES.settlement.won}
            </span>
          </p>
        </div>
        <RefundRiskFlags flags={riskFromDetail(detail)} className="mt-3" />
      </section>

      <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

      {/* 재조회 실패(stale) — mutate 잠금 + 새로고침 안내. */}
      {staleReload && (
        <div className="bg-it-surface px-5 pt-4 dark:bg-rink-800">
          <div
            className="flex items-start gap-2.5 rounded-w-md border border-sun-500/40 bg-sun-100 p-3.5 dark:bg-sun-500/10"
            role="status"
          >
            <Icon name="cloud_off" className="mt-0.5 shrink-0 text-card-emphasis text-it-ink-700 dark:text-sun-500" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold leading-relaxed text-it-ink-800 dark:text-sun-500">
                {MESSAGES.refund.staleDetail}
              </p>
              <button
                type="button"
                onClick={handleRefreshStale}
                disabled={isRetrying}
                className="mt-2 inline-flex items-center gap-1 rounded-w-md bg-it-blue-500 px-3 py-1.5 text-card-meta font-bold text-white transition-colors hover:bg-it-blue-600 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
              >
                <Icon name="refresh" className="text-card-body" aria-hidden="true" />
                {MESSAGES.refund.refreshAction}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 상태별 안내 ───────────────────────────────────── */}
      {detail.status === 'executing' && (
        <RefundDetailNotice icon="sync" tone="info" message={MESSAGES.refund.executingNotice} />
      )}
      {detail.status === 'executed' && (
        <RefundDetailNotice icon="check_circle" tone="success" message={MESSAGES.refund.executedNotice} />
      )}
      {detail.status === 'rejected' && (
        <RefundDetailNotice icon="block" tone="neutral" message={MESSAGES.refund.rejectedNotice} />
      )}
      {detail.status === 'canceled' && (
        <RefundDetailNotice icon="undo" tone="neutral" message={MESSAGES.refund.canceledNotice} />
      )}
      {isFailed && (
        <RefundDetailNotice icon="error" tone="danger" message={MESSAGES.refund.executionFailedNotice} />
      )}
      {/* KG 미확정(PG 결과 미확정) — 관리자 정산(reconcile) 필요 안내. Phase 1 화면 CTA 없음. */}
      {detail.decision.failureCode === 'KG_UNCONFIRMED' && (
        <RefundDetailNotice icon="help" tone="info" message={MESSAGES.refund.kgUnconfirmedNotice} />
      )}

      {/* ── 결제 정보 ─────────────────────────────────────── */}
      <RefundSection title={MESSAGES.refund.paymentSectionTitle}>
        <RefundInfoRow label={MESSAGES.refund.orderNumber} value={payment.orderNumber ?? '-'} mono />
        <RefundInfoRow label={MESSAGES.refund.productLabel} value={payment.product ?? detail.subjectLabel ?? '-'} />
        <RefundInfoRow label={MESSAGES.refund.paymentMethod} value={payment.paymentMethod ?? '-'} />
        {payment.tid && <RefundInfoRow label={MESSAGES.refund.tidLabel} value={payment.tid} mono />}
        <RefundInfoRow label={MESSAGES.refund.completedAt} value={formatDateTime(payment.completedAt)} />
      </RefundSection>

      {/* ── 요청 정보 ─────────────────────────────────────── */}
      <RefundSection title={MESSAGES.refund.requesterSectionTitle}>
        <RefundInfoRow label={MESSAGES.refund.requesterName} value={request.requesterName || '-'} />
        {request.requesterPhone && (
          <RefundInfoRow label={MESSAGES.refund.requesterPhone} value={request.requesterPhone} mono />
        )}
        {request.childName && <RefundInfoRow label={MESSAGES.refund.childLabel} value={request.childName} />}
        <RefundInfoRow label={MESSAGES.refund.requestedAt} value={formatDateTime(request.createdAt)} />
        {/* 환불 사유 — 요청자 원문(감독 승인 판단 자료) */}
        <div className="pt-3">
          <p className="mb-1.5 text-card-meta font-bold text-it-ink-500 dark:text-it-ink-300">
            {MESSAGES.refund.requestReasonTitle}
          </p>
          <p className="rounded-w-md bg-it-fill px-4 py-3 text-card-body leading-relaxed text-it-ink-800 dark:bg-it-blue-900/40 dark:text-white whitespace-pre-wrap">
            {request.requestReason || '-'}
          </p>
        </div>
      </RefundSection>

      {/* ── 사용 현황 (판단 자료) ─────────────────────────── */}
      <RefundSection title={MESSAGES.refund.usageSectionTitle}>
        {/* DIRECT 는 사용 판단 자료가 없는 원장 건이라 fail-closed 경고 미노출. */}
        {!detail.judgmentDataOk && !isDirect && (
          <div className="mb-3 flex items-start gap-2 rounded-w-md border border-it-red-100 bg-it-red-50 p-3 dark:border-it-red-500/30 dark:bg-it-red-500/10">
            <Icon name="warning" className="mt-0.5 shrink-0 text-card-emphasis text-it-red-600 dark:text-it-red-400" aria-hidden="true" />
            <p className="text-[12.5px] leading-relaxed text-it-red-700 dark:text-it-red-200">
              {MESSAGES.refund.judgmentDataError}
            </p>
          </div>
        )}
        <RefundUsageBody usage={detail.usage} sourceType={detail.sourceType} />
      </RefundSection>

      {/* ── 스냅샷 vs 현재 ────────────────────────────────── */}
      <RefundSection title={MESSAGES.refund.snapshotVsCurrent}>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-w-md bg-it-fill px-3.5 py-3 dark:bg-it-blue-900/40">
            <p className="text-[11.5px] font-semibold text-it-ink-500 dark:text-wtext-4">
              {MESSAGES.refund.snapshotStatus}
            </p>
            <p className="mt-1 text-card-body font-bold text-it-ink-800 tabular-nums dark:text-white">
              {snapshotVsCurrent.requestedAmount.toLocaleString()}
              {MESSAGES.settlement.won}
            </p>
            {snapshotVsCurrent.requestedStatusAtCreate && (
              <p className="mt-0.5 text-[11.5px] text-it-ink-400 dark:text-wtext-4">
                {formatPaymentStatus(snapshotVsCurrent.requestedStatusAtCreate)}
              </p>
            )}
          </div>
          <div className="rounded-w-md bg-it-fill px-3.5 py-3 dark:bg-it-blue-900/40">
            <p className="text-[11.5px] font-semibold text-it-ink-500 dark:text-wtext-4">
              {MESSAGES.refund.currentStatus}
            </p>
            <p className="mt-1 text-card-body font-bold text-it-ink-800 dark:text-white">
              {snapshotVsCurrent.currentPaymentStatus
                ? formatPaymentStatus(snapshotVsCurrent.currentPaymentStatus)
                : '-'}
            </p>
          </div>
        </div>
      </RefundSection>

      {/* ── 처리 이력 ─────────────────────────────────────── */}
      {hasHistorySection && (
        <RefundSection title={MESSAGES.refund.historySectionTitle}>
          {priorRefund && (
            <div className="mb-3 flex items-start gap-2 rounded-w-md border border-sun-500/40 bg-sun-100 p-3 dark:bg-sun-500/10">
              <Icon name="history" className="mt-0.5 shrink-0 text-card-emphasis text-it-ink-700 dark:text-sun-500" aria-hidden="true" />
              <p className="text-[12.5px] leading-relaxed text-it-ink-800 dark:text-sun-500">
                {MESSAGES.refund.priorRefundExists}
              </p>
            </div>
          )}
          {decision.decidedByName && (
            <RefundInfoRow label={MESSAGES.refund.decidedBy} value={decision.decidedByName} />
          )}
          {decision.decidedAt && (
            <RefundInfoRow label={MESSAGES.refund.decidedAt} value={formatDateTime(decision.decidedAt)} />
          )}
          {decision.decisionReason && (
            <RefundInfoRow label={MESSAGES.refund.decisionReason} value={decision.decisionReason} />
          )}
          {decision.failureStage && (
            <RefundInfoRow
              label={MESSAGES.refund.failureStageLabel}
              value={
                decision.failureStage === 'DB_AFTER_PG'
                  ? MESSAGES.refund.failureStageDbAfterPg
                  : MESSAGES.refund.failureStagePg
              }
            />
          )}
          {decision.failureReason && (
            <RefundInfoRow label={MESSAGES.refund.failureReasonLabel} value={decision.failureReason} />
          )}
        </RefundSection>
      )}

      {/* ── CTA (역할 게이트) ─────────────────────────────── */}
      {actionable && (
        <div className="bg-it-surface px-5 pb-7 pt-2 dark:bg-rink-800">
          {showReconcile ? (
            // KG 미확정 — ADMIN 전용 정산 처리(일반 재처리 대신 reconcile 시트).
            <button
              type="button"
              onClick={() => setReconcileOpen(true)}
              disabled={isProcessing || staleReload}
              className="h-12 w-full rounded-w-md bg-it-blue-500 text-card-title font-semibold text-white transition-colors hover:bg-it-blue-600 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
            >
              {MESSAGES.refund.reconcileCta}
            </button>
          ) : canManage ? (
            <>
              {/* DIRECT 는 승인/거절 없음 — showApproveReject 로 게이트(!isDirect). */}
              {showApproveReject && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setRejectOpen(true)}
                    disabled={isProcessing || staleReload}
                    className="h-12 flex-1 rounded-w-md border-[1.5px] border-it-red-500 text-card-title font-semibold text-it-red-600 transition-colors hover:bg-it-red-50 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-red-500/40 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none dark:border-it-red-400 dark:text-it-red-400 dark:hover:bg-it-red-500/10"
                  >
                    {MESSAGES.refund.rejectCta}
                  </button>
                  <button
                    type="button"
                    onClick={() => setApproveOpen(true)}
                    disabled={isProcessing || !canApprove}
                    className="h-12 flex-[1.4] rounded-w-md bg-it-blue-500 text-card-title font-semibold text-white transition-colors hover:bg-it-blue-600 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
                  >
                    {MESSAGES.refund.approveCta}
                  </button>
                </div>
              )}
              {/* execution_failed — 일반 승인 버튼 미노출. 재처리 + 거절(이체 미발생 확정 시). */}
              {(showReprocess || showRejectOnFailed) && (
                <div className="flex items-center gap-3">
                  {showRejectOnFailed && (
                    <button
                      type="button"
                      onClick={() => setRejectOpen(true)}
                      disabled={isProcessing || staleReload}
                      className={cn(
                        'h-12 rounded-w-md border-[1.5px] border-it-red-500 text-card-title font-semibold text-it-red-600 transition-colors hover:bg-it-red-50 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-red-500/40 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none dark:border-it-red-400 dark:text-it-red-400 dark:hover:bg-it-red-500/10',
                        showReprocess ? 'flex-1' : 'w-full',
                      )}
                    >
                      {MESSAGES.refund.rejectCta}
                    </button>
                  )}
                  {showReprocess && (
                    <button
                      type="button"
                      onClick={handleReprocess}
                      disabled={isProcessing || staleReload}
                      className={cn(
                        'h-12 rounded-w-md bg-it-blue-500 text-card-title font-semibold text-white transition-colors hover:bg-it-blue-600 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none',
                        showRejectOnFailed ? 'flex-[1.4]' : 'w-full',
                      )}
                    >
                      {isProcessing
                        ? MESSAGES.refund.reprocessProcessing
                        : MESSAGES.refund.reprocessCta}
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            // 승인 권한 없는 역할(코치 등) — 읽기 전용 안내(mutate CTA 미노출).
            <div
              className="flex items-start gap-2.5 rounded-w-md border border-it-line bg-it-fill p-3.5 dark:border-rink-700 dark:bg-it-blue-900/40"
              role="status"
            >
              <Icon name="visibility" className="mt-0.5 shrink-0 text-card-emphasis text-it-ink-500 dark:text-it-ink-200" aria-hidden="true" />
              <p className="text-[13px] font-semibold leading-relaxed text-it-ink-700 dark:text-it-ink-200">
                {MESSAGES.refund.readOnlyForCoach}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 승인/거절 시트 */}
      <RefundApproveSheet
        isOpen={approveOpen}
        onClose={() => setApproveOpen(false)}
        onConfirm={handleApprove}
        isProcessing={isProcessing}
        amount={payment.amount}
      />
      <RefundRejectSheet
        isOpen={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onConfirm={handleReject}
        isProcessing={isProcessing}
      />
      <RefundReconcileSheet
        isOpen={reconcileOpen}
        onClose={() => setReconcileOpen(false)}
        onConfirm={handleReconcile}
        isProcessing={isProcessing}
      />
    </div>
  );
}

/* ── Sub Components ─────────────────────────────────────── */

/** 상세 응답에서 위험 표식 파생(목록 riskFlags 계약과 동일 신호). */
function riskFromDetail(detail: RefundRequestDetail) {
  const u = detail.usage;
  let used = false;
  if (u) {
    if (u.kind === 'CLASS_PREPAID') used = u.usedCount > 0;
    else if (u.kind === 'CLASS_POSTPAID') used = u.attendanceCount > 0;
    else if (u.kind === 'TOURNAMENT') used = u.gamesCount > 0;
  }
  return {
    used,
    postpaid: detail.sourceType === 'CLASS_POSTPAID',
    tournament: detail.sourceType === 'TOURNAMENT',
  };
}

function RefundUsageBody({
  usage,
  sourceType,
}: {
  usage: RefundUsage;
  sourceType: RefundRequestDetail['sourceType'];
}) {
  // DIRECT(관리자 직접 환불) — 사용 판단 자료 없음. 원장 안내.
  if (sourceType === 'DIRECT') {
    return (
      <div className="flex items-start gap-2 rounded-w-md bg-it-fill p-3 dark:bg-it-blue-900/40">
        <Icon name="admin_panel_settings" className="mt-0.5 shrink-0 text-card-emphasis text-it-ink-500 dark:text-it-ink-200" aria-hidden="true" />
        <p className="text-card-body text-it-ink-700 dark:text-it-ink-200">
          {MESSAGES.refund.usageDirect}
        </p>
      </div>
    );
  }
  if (!usage) {
    return (
      <p className="text-card-body text-it-ink-500 dark:text-wtext-4">
        {MESSAGES.refund.usagePrepaidNone}
      </p>
    );
  }

  if (usage.kind === 'CLASS_POSTPAID') {
    // 회당 단가 = 청구액 / 출석수 (0 나눗셈 가드).
    const unit =
      usage.attendanceCount > 0 ? Math.round(usage.amount / usage.attendanceCount) : 0;
    return (
      <div className="space-y-2">
        <p className="text-card-body font-semibold text-it-ink-800 dark:text-white">
          {MESSAGES.refund.usagePostpaidBasis(usage.attendanceCount, unit)}
        </p>
        <p className="text-card-body text-it-ink-500 tabular-nums dark:text-wtext-4">
          {usage.amount.toLocaleString()}
          {MESSAGES.settlement.won}
        </p>
      </div>
    );
  }

  if (usage.kind === 'TOURNAMENT') {
    return (
      <div className="space-y-2">
        <p className="text-card-body font-semibold text-it-ink-800 dark:text-white">
          {MESSAGES.refund.usageTournamentGames(usage.gamesCount)}
        </p>
        <p className="text-card-body text-it-ink-500 tabular-nums dark:text-wtext-4">
          {MESSAGES.refund.usageCalculatedFee} {usage.calculatedFee.toLocaleString()}
          {MESSAGES.settlement.won}
        </p>
      </div>
    );
  }

  // CLASS_PREPAID — 결제일 이후 사용(출석) 횟수 + 수업별 요약.
  if (usage.usedCount === 0) {
    return (
      <p className="text-card-body text-it-ink-500 dark:text-wtext-4">
        {MESSAGES.refund.usagePrepaidNone}
      </p>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <p className="text-card-body font-semibold text-it-ink-800 dark:text-white">
        {MESSAGES.refund.usageAttendanceCount(usage.usedCount)}
      </p>
      {usage.perClass.length > 0 && (
        <span className="text-card-meta text-it-ink-500 dark:text-wtext-4">
          · {MESSAGES.refund.usagePrepaidClassCount(usage.perClass.length)}
        </span>
      )}
    </div>
  );
}

function RefundSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <section className="bg-it-surface px-5 py-5 dark:bg-rink-800" aria-label={title}>
        {/* 제목 위계 — 세로 장식선(RULE-D04) 대신 라벨 타이포(대문자 트래킹)로 구분. */}
        <h3 className="pb-2 text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-it-blue-600 dark:text-it-blue-300">
          {title}
        </h3>
        {children}
      </section>
      <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
    </>
  );
}

function RefundInfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="shrink-0 text-card-body font-semibold text-it-ink-500 dark:text-it-ink-300">
        {label}
      </span>
      <span
        className={cn(
          'min-w-0 break-words text-right text-card-body font-bold text-it-ink-800 dark:text-white',
          mono && 'tabular-nums',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function RefundDetailError({
  message,
  onRetry,
  retrying,
}: {
  message: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <section className="bg-it-surface dark:bg-rink-800">
      <div className="flex flex-col items-center gap-3 px-5 py-16 text-center" role="alert">
        <div className="flex h-14 w-14 items-center justify-center rounded-w-pill bg-it-red-50 dark:bg-it-red-500/15">
          <Icon name="error_outline" className="text-3xl text-it-red-600 dark:text-it-red-400" aria-hidden="true" />
        </div>
        <p className="text-card-body text-it-ink-500 dark:text-wtext-4">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-1 inline-flex items-center gap-1 rounded-w-md bg-it-blue-500 px-5 py-2.5 text-card-body font-bold text-white transition-colors hover:bg-it-blue-600 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
        >
          <Icon name="refresh" className="text-card-title" aria-hidden="true" />
          {MESSAGES.refund.retry}
        </button>
      </div>
    </section>
  );
}

function RefundDetailNotice({
  icon,
  tone,
  message,
}: {
  icon: string;
  tone: 'info' | 'success' | 'neutral' | 'danger';
  message: string;
}) {
  const toneClass = {
    info: 'border-it-blue-100 bg-it-blue-50 text-it-blue-700 dark:border-it-blue-900 dark:bg-it-blue-900/30 dark:text-it-blue-300',
    success: 'border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400',
    neutral: 'border-it-line bg-it-fill text-it-ink-700 dark:border-rink-700 dark:bg-it-blue-900/40 dark:text-it-ink-200',
    danger: 'border-it-red-100 bg-it-red-50 text-it-red-700 dark:border-it-red-500/30 dark:bg-it-red-500/10 dark:text-it-red-200',
  }[tone];

  return (
    <div className="bg-it-surface px-5 pt-4 dark:bg-rink-800">
      <div className={cn('flex items-start gap-2.5 rounded-w-md border p-3.5', toneClass)} role="status">
        <Icon name={icon} className="mt-0.5 shrink-0 text-card-emphasis" aria-hidden="true" />
        <p className="text-[13px] font-semibold leading-relaxed">{message}</p>
      </div>
    </div>
  );
}

export default RefundRequestDetailView;
