"use client";

import { useState } from "react";
import { useNavigation } from "@/components/ui/NavLink";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { createMatch } from "@/services/matches-api";
import { MESSAGES } from "@/lib/messages";
import { MatchCreateForm, type MatchFormValues } from "@/components/match";
import type { CreateMatchPayload } from "@/types/match";
import { usePageReady } from '@/hooks/usePageReady';
import { emitRefresh, REFRESH_KEYS } from "@/lib/refresh-bus";

/**
 * 매치 생성 페이지 (Phase 2-B 재디자인).
 *
 * 기존 인라인 폼을 {@link MatchCreateForm} 공용 컴포넌트로 추출하여
 * `/matches/[id]/edit`에서도 재사용합니다.
 */
export default function CreateMatchPage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  const { navigate, back } = useNavigation();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (values: MatchFormValues) => {
    setError(null);

    const localDateTime = new Date(`${values.date}T${values.time}:00`);
    if (Number.isNaN(localDateTime.getTime())) {
      setError(MESSAGES.match.form.errors.dateRequired);
      return;
    }

    const payload: CreateMatchPayload = {
      title: values.title.trim(),
      scheduledAt: localDateTime.toISOString(),
      rinkName: values.rinkName.trim(),
      rinkAddress: values.rinkAddress.trim() || undefined,
      price: values.price,
      level: values.level,
      levelCode: values.levelCode || undefined,
      gender: values.gender,
      maxParticipants: values.maxParticipants,
      rules: values.rulesText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      description: values.description.trim() || undefined,
    };

    setIsSubmitting(true);
    try {
      const created = await createMatch(payload);
      // [추가 W2.D 2026-05-18 #7] 매치 listing 캐시 무효화 신호 — matches/list 페이지가
      //   useRefreshSubscription(REFRESH_KEYS.MATCHES) 로 자동 재 fetch.
      //   종전: 등록 후 목록으로 돌아가도 stale 데이터 표시되던 회귀.
      emitRefresh(REFRESH_KEYS.MATCHES);
      navigate(`/matches/${created.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : MESSAGES.match.error.createFailed,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar
        title={MESSAGES.match.form.createTitle}
        onBack={() => back()}
        forceNative
      />

      <main className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck px-4 pt-5 pb-30">
        <MatchCreateForm
          mode="create"
          onSubmit={handleSubmit}
          onCancel={() => back()}
          isSubmitting={isSubmitting}
          error={error}
          iceTheme
        />
      </main>
    </MobileContainer>
  );
}
