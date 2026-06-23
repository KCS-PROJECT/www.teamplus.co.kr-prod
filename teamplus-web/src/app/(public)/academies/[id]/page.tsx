"use client";

import { useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { Icon } from "@/components/ui/Icon";
import { useNavigation } from "@/components/ui/NavLink";
import { useToast } from "@/components/ui/Toast";
import { useAcademyDetail } from "@/hooks/useAcademy";
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { api } from "@/services/api-client";
import { resolveImageSrc } from "@/lib/image-url";
import { MESSAGES } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { usePageReady } from '@/hooks/usePageReady';

/**
 * PublicAcademyDetailPage - 공개 오픈클래스 상세
 * Route: /academies/[id] (public layout, 인증 가드 없음)
 */
export default function PublicAcademyDetailPage() {
  const params = useParams();
  const academyId = typeof params?.id === "string" ? params.id : null;

  const { academy, isLoading } = useAcademyDetail(academyId);

  // v18 (2026-05-20, audit §4 C #8): isLoading 도착 후 ready — 이중 로더 race 차단.
  usePageReady(!isLoading);
  const { user } = useSessionAuth();
  const { navigate } = useNavigation();
  const { toast } = useToast();

  const [isJoining, setIsJoining] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  const handleJoinRequest = useCallback(async () => {
    if (!user) {
      navigate("/login");
      return;
    }
    setShowJoinModal(true);
  }, [user, navigate]);

  const handleConfirmJoin = useCallback(async () => {
    if (!academyId) return;
    setIsJoining(true);
    try {
      const res = await api.post(`/academies/${academyId}/join`);
      if (res.success) {
        toast.success(MESSAGES.academy.joined);
        setShowJoinModal(false);
      } else {
        toast.error(MESSAGES.error.general);
      }
    } catch {
      toast.error(MESSAGES.error.general);
    } finally {
      setIsJoining(false);
    }
  }, [academyId, toast]);

  if (isLoading) {
    return null;
  }

  if (!academy) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title="오픈클래스" />
        <div className="flex flex-col items-center justify-center px-6 py-20">
          <Icon
            name="error_outline"
            className="text-4xl text-wtext-4 dark:text-rink-500 mb-3"
          />
          <p className="text-card-body text-wtext-3 dark:text-rink-300">
            {MESSAGES.error.general}
          </p>
        </div>
      </MobileContainer>
    );
  }

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title={academy.name} />

      <main className="flex-1 overflow-y-auto hide-scrollbar">
        <div className="px-4 py-5 pb-30 space-y-5">
          {/* 헤더 영역 */}
          <div className="flex items-start gap-4">
            {resolveImageSrc(academy.imageUrl) ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={resolveImageSrc(academy.imageUrl)}
                alt={`${academy.name} 로고`}
                className="w-16 h-16 rounded-xl object-cover shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-ice-500/10 dark:bg-ice-500/20 flex items-center justify-center shrink-0">
                <Icon name="school" className="text-2xl text-ice-500" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-wtext-1 dark:text-white">
                {academy.name}
              </h1>
              {academy.region && (
                <p className="text-card-body text-wtext-3 dark:text-rink-300 mt-1 flex items-center gap-1">
                  <Icon name="location_on" className="text-card-body" />
                  {academy.region}
                </p>
              )}
              <span
                className={cn(
                  "inline-block mt-2 px-2 py-0.5 rounded-w-pill text-[11px] font-medium",
                  academy.isActive
                    ? "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400"
                    : "bg-wline-2 dark:bg-rink-700 text-wtext-3 dark:text-rink-300",
                )}
              >
                {academy.isActive ? "운영중" : "비활성"}
              </span>
            </div>
          </div>

          {/* 통계 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white dark:bg-rink-800 rounded-xl border border-wline-2 dark:border-rink-700 p-3 text-center">
              <p className="text-card-title font-bold text-ice-500">
                {academy._count?.members ?? 0}
              </p>
              <p className="text-[11px] text-wtext-3 dark:text-rink-300">
                수강생
              </p>
            </div>
            <div className="bg-white dark:bg-rink-800 rounded-xl border border-wline-2 dark:border-rink-700 p-3 text-center">
              <p className="text-card-title font-bold text-ice-500">
                {academy._count?.coaches ?? 0}
              </p>
              <p className="text-[11px] text-wtext-3 dark:text-rink-300">
                코치
              </p>
            </div>
            <div className="bg-white dark:bg-rink-800 rounded-xl border border-wline-2 dark:border-rink-700 p-3 text-center">
              <p className="text-card-title font-bold text-ice-500">
                {academy._count?.classes ?? 0}
              </p>
              <p className="text-[11px] text-wtext-3 dark:text-rink-300">
                수업
              </p>
            </div>
          </div>

          {/* 소개 */}
          {academy.description && (
            <div className="bg-white dark:bg-rink-800 rounded-xl border border-wline-2 dark:border-rink-700 p-4">
              <h2 className="text-card-body font-bold text-wtext-1 dark:text-white mb-2">
                소개
              </h2>
              <p className="text-card-body text-wtext-2 dark:text-rink-100 leading-relaxed whitespace-pre-wrap">
                {academy.description}
              </p>
            </div>
          )}

          {/* 연락처 */}
          {(academy.contactPhone || academy.contactEmail) && (
            <div className="bg-white dark:bg-rink-800 rounded-xl border border-wline-2 dark:border-rink-700 p-4 space-y-2.5">
              <h2 className="text-card-body font-bold text-wtext-1 dark:text-white mb-1">
                연락처
              </h2>
              {academy.contactPhone && (
                <div className="flex items-center gap-2 text-card-body text-wtext-2 dark:text-rink-100">
                  <Icon name="call" className="text-card-emphasis text-wtext-3" />
                  <a
                    href={`tel:${academy.contactPhone}`}
                    className="hover:text-ice-500 transition-colors motion-reduce:transition-none"
                  >
                    {academy.contactPhone}
                  </a>
                </div>
              )}
              {academy.contactEmail && (
                <div className="flex items-center gap-2 text-card-body text-wtext-2 dark:text-rink-100">
                  <Icon name="mail" className="text-card-emphasis text-wtext-3" />
                  <a
                    href={`mailto:${academy.contactEmail}`}
                    className="hover:text-ice-500 transition-colors motion-reduce:transition-none"
                  >
                    {academy.contactEmail}
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 하단 고정 가입 신청 버튼 */}
        <div className="fixed bottom-[72px] left-0 right-0 z-10">
          <div className="max-w-md mx-auto px-4 pb-4 pt-2 bg-wbg/80 dark:bg-rink-900/80">
            <button
              type="button"
              onClick={handleJoinRequest}
              disabled={isJoining}
              className={cn(
                "w-full py-3.5 rounded-xl text-white font-bold text-[15px]",
                "bg-ice-500 hover:bg-ice-700 active:bg-ice-700",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "transition-colors motion-reduce:transition-none focus:outline-none focus:ring-2 focus:ring-ice-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900",
              )}
            >
              {MESSAGES.academy.joinButton}
            </button>
          </div>
        </div>
      </main>

      {/* 가입 확인 모달 */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowJoinModal(false)}
            aria-hidden="true"
          />
          <div className="relative bg-white dark:bg-rink-800 rounded-2xl shadow-md mx-6 w-full max-w-sm p-6">
            <h3 className="text-card-title font-bold text-wtext-1 dark:text-white mb-2">
              가입 신청
            </h3>
            <p className="text-card-body text-wtext-2 dark:text-rink-100 mb-6">
              <strong className="text-ice-500">{academy.name}</strong>에 가입을
              신청하시겠습니까? 관리자의 승인 후 수강이 가능합니다.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowJoinModal(false)}
                className="flex-1 py-2.5 rounded-xl text-card-body font-medium bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 hover:bg-wline dark:hover:bg-rink-500 transition-colors motion-reduce:transition-none focus:outline-none focus:ring-2 focus:ring-ice-500/30"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmJoin}
                disabled={isJoining}
                className={cn(
                  "flex-1 py-2.5 rounded-xl text-card-body font-bold",
                  "bg-ice-500 text-white hover:bg-ice-700",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  "transition-colors motion-reduce:transition-none focus:outline-none focus:ring-2 focus:ring-ice-500",
                )}
              >
                {isJoining ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-w-pill animate-spin motion-reduce:animate-none" />
                    처리 중...
                  </span>
                ) : (
                  "신청하기"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </MobileContainer>
  );
}
