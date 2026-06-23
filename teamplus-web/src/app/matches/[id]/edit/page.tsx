"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useNavigation } from "@/components/ui/NavLink";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { usePageReady } from '@/hooks/usePageReady';
import { useMatchPermissions } from "@/hooks/useMatchPermissions";
import { fetchMatchDetail, updateMatch } from "@/services/matches-api";
import { MESSAGES } from "@/lib/messages";
import {
  MatchCreateForm,
  MatchErrorState,
  type MatchFormValues,
  type MatchLevelType,
  type MatchGenderType,
  type MatchLevelCodeType,
} from "@/components/match";
import type { MatchDetail, UpdateMatchPayload } from "@/types/match";

/**
 * 매치 수정 페이지 (Phase 2-B 신규).
 *
 * 기존 매치를 불러와 {@link MatchCreateForm}에 주입하고,
 * PATCH /matches/:id 로 업데이트합니다.
 *
 * 소유권 체크:
 * - 본인이 등록한 매치여야 수정 가능 (`useMatchPermissions`)
 * - 관리자/감독/오픈클래스 감독은 모든 매치 수정 가능
 * - 그 외 접근 시 매치 상세로 리다이렉트
 */

function toMatchFormValues(api: MatchDetail): Partial<MatchFormValues> {
  const dt = new Date(api.scheduledAt);
  const date = Number.isNaN(dt.getTime())
    ? ""
    : `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
        dt.getDate(),
      ).padStart(2, "0")}`;
  const time = Number.isNaN(dt.getTime())
    ? ""
    : `${String(dt.getHours()).padStart(2, "0")}:${String(
        dt.getMinutes(),
      ).padStart(2, "0")}`;

  const levelValue: MatchLevelType = ["입문", "초급", "중급", "고급"].includes(
    api.level,
  )
    ? (api.level as MatchLevelType)
    : "중급";

  const genderValue: MatchGenderType = ["혼성", "남성", "여성"].includes(
    api.gender ?? "",
  )
    ? (api.gender as MatchGenderType)
    : "혼성";

  const levelCodeValue: MatchLevelCodeType =
    api.levelCode === "A" || api.levelCode === "B" || api.levelCode === "C"
      ? api.levelCode
      : "";

  return {
    title: api.title,
    date,
    time,
    rinkName: api.rinkName,
    rinkAddress: api.rinkAddress ?? "",
    price: api.price,
    level: levelValue,
    levelCode: levelCodeValue,
    gender: genderValue,
    maxParticipants: api.maxParticipants,
    rulesText: (api.rules ?? []).join("\n"),
    description: api.description ?? "",
  };
}

export default function EditMatchPage() {
  const params = useParams();
  const matchId = (params?.id as string) ?? "";
  const { navigate, back } = useNavigation();

  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const permissions = useMatchPermissions({
    matchManagerId: match?.manager.id ?? null,
  });

  const loadMatch = useCallback(async () => {
    if (!matchId) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await fetchMatchDetail(matchId);
      setMatch(data);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : MESSAGES.match.error.loadFailed,
      );
    } finally {
      setIsLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    void loadMatch();
  }, [loadMatch]);

  // 권한 검사: 소유자 또는 전체 관리자만 수정 가능
  useEffect(() => {
    if (!match) return;
    if (!permissions.canManage) {
      // 매니저 권한 없음 → 상세로 리다이렉트
      navigate(`/matches/${matchId}`);
    }
  }, [match, permissions.canManage, matchId, navigate]);

  const initialValues = useMemo(
    () => (match ? toMatchFormValues(match) : undefined),
    [match],
  );

  const handleSubmit = async (values: MatchFormValues) => {
    setSubmitError(null);
    const localDateTime = new Date(`${values.date}T${values.time}:00`);
    if (Number.isNaN(localDateTime.getTime())) {
      setSubmitError(MESSAGES.match.form.errors.dateRequired);
      return;
    }

    const payload: UpdateMatchPayload = {
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
      await updateMatch(matchId, payload);
      navigate(`/matches/${matchId}`);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : MESSAGES.match.error.updateFailed,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // 데이터 로딩
  if (isLoading) {
    return (
      <MobileContainer hasBottomNav={false}>
        <PageAppBar
          title={MESSAGES.match.form.editTitle}
          onBack={() => back()}
          forceNative
        />
        <div className="flex-1 flex items-center justify-center bg-white dark:bg-rink-900">
          <div
            className="w-8 h-8 border-2 border-ice-500 border-t-transparent rounded-w-pill animate-spin motion-reduce:animate-none"
            role="status"
            aria-label="로딩 중"
          />
        </div>
      </MobileContainer>
    );
  }

  // 에러
  if (loadError || !match) {
    return (
      <MobileContainer hasBottomNav={false}>
        <PageAppBar
          title={MESSAGES.match.form.editTitle}
          onBack={() => back()}
          forceNative
        />
        <MatchErrorState
          message={loadError ?? MESSAGES.match.error.loadFailed}
          onRetry={() => void loadMatch()}
        />
      </MobileContainer>
    );
  }

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar title={MESSAGES.match.form.editTitle} onBack={() => back()} forceNative />

      <main className="flex-1 overflow-y-auto px-4 pt-5 pb-30">
        <MatchCreateForm
          mode="edit"
          initialValues={initialValues}
          onSubmit={handleSubmit}
          onCancel={() => navigate(`/matches/${matchId}`)}
          isSubmitting={isSubmitting}
          error={submitError}
        />
      </main>
    </MobileContainer>
  );
}
