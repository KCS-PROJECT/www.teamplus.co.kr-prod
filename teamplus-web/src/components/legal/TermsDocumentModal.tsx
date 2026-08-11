'use client';

/**
 * TermsDocumentModal — 약관·정책 본문을 화면 이탈 없이 모달로 보여준다.
 *
 * 배경: 동의 체크박스 옆 "보기" 링크가 `/terms` 로 이동하면 그 화면이 언마운트되어
 *   입력 중이던 폼 값이 사라진다. 자녀 등록·결제처럼 동의 직전에 내용을 확인하는
 *   자리에서 특히 문제라, 같은 화면 위에 모달로 띄운다.
 *
 * 본문 SoT 는 게시본(`GET /app/terms` 현행 1건/유형)이며, 조회 실패·미등록 유형은
 *   코드 폴백(`policy-content.ts`)을 쓴다. 약관 모달이 비어 있으면 동의 자체가
 *   무효가 될 수 있으므로 "빈 화면"은 허용하지 않는다.
 *
 * 사용:
 * ```tsx
 * const [policyType, setPolicyType] = useState<string | null>(null);
 * <button onClick={() => setPolicyType('child_privacy')}>보기</button>
 * <TermsDocumentModal policyType={policyType} onClose={() => setPolicyType(null)} />
 * ```
 */

import { useEffect, useState } from 'react';
import { FullModal } from '@/components/ui/Modal/FullModal';
import { api } from '@/services/api-client';
import { resolveTermsDocument, type ApiTermsRow } from '@/lib/terms-content';

interface TermsDocumentModalProps {
  /** 표시할 정책 type. null 이면 닫힘. 표준형·축약형 모두 허용 */
  policyType: string | null;
  onClose: () => void;
}

export function TermsDocumentModal({ policyType, onClose }: TermsDocumentModalProps) {
  // 게시본은 한 번만 받아 재사용한다 (모달을 여러 번 열어도 재조회하지 않음).
  const [rows, setRows] = useState<ApiTermsRow[] | null>(null);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!policyType || fetched) return;
    let cancelled = false;
    void (async () => {
      const res = await api.get<ApiTermsRow[]>('/app/terms');
      if (cancelled) return;
      if (res.success && Array.isArray(res.data)) setRows(res.data);
      setFetched(true); // 실패해도 폴백으로 진행 — 재시도 루프를 만들지 않는다
    })();
    return () => {
      cancelled = true;
    };
  }, [policyType, fetched]);

  if (!policyType) return null;

  const doc = resolveTermsDocument(rows, policyType);

  return (
    <FullModal
      isOpen
      onClose={onClose}
      title={doc?.title ?? '약관'}
      variant="slide-up"
    >
      <div className="px-5 py-5 bg-wbg dark:bg-puck">
        <div className="mb-3 text-card-meta text-wtext-3 dark:text-rink-300">
          {doc ? `${doc.version} · ${doc.updatedAt} 시행` : ''}
        </div>
        <pre className="whitespace-pre-wrap break-words font-sans text-card-body leading-relaxed text-wtext-2 dark:text-rink-100">
          {doc?.content ?? '약관 내용을 불러올 수 없습니다.'}
        </pre>
      </div>
    </FullModal>
  );
}
