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
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 bg-it-canvas dark:bg-puck">
          <Icon
            name="error_outline"
            className="text-4xl text-it-ink-400 dark:text-wtext-4 mb-3"
          />
          <p className="text-[14px] text-it-ink-500 dark:text-wtext-4">
            {MESSAGES.error.general}
          </p>
        </div>
      </MobileContainer>
    );
  }

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title={academy.name} />

      <main className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck">
        {/* 헤더 + 통계 — flat 흰 섹션 */}
        <section className="bg-it-surface dark:bg-rink-800 mt-2 px-5 pt-5 pb-5">
          <div className="flex items-start gap-4">
            {resolveImageSrc(academy.imageUrl) ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={resolveImageSrc(academy.imageUrl)}
                alt={`${academy.name} 로고`}
                className="w-16 h-16 rounded-w-md object-cover shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-w-md bg-it-blue-50 dark:bg-it-blue-900/40 flex items-center justify-center shrink-0">
                <Icon name="school" className="text-2xl text-it-blue-500" aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-xl font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white">
                {academy.name}
              </h1>
              {academy.region && (
                <p className="text-[14px] text-it-ink-500 dark:text-wtext-4 mt-1 flex items-center gap-1">
                  <Icon name="location_on" className="text-[16px] text-it-blue-500" aria-hidden="true" />
                  {academy.region}
                </p>
              )}
              <span
                className={cn(
                  "inline-block mt-2 px-2 py-0.5 rounded-w-pill text-[11px] font-bold",
                  academy.isActive
                    ? "bg-it-blue-50 dark:bg-it-blue-900/40 text-it-blue-500"
                    : "bg-it-fill dark:bg-rink-700 text-it-ink-500 dark:text-wtext-4",
                )}
              >
                {academy.isActive ? "운영중" : "비활성"}
              </span>
            </div>
          </div>

          {/* 통계 — 인셋 fill 영역 */}
          <div className="mt-5 grid grid-cols-3 rounded-w-md bg-it-fill dark:bg-puck/30 py-3">
            <div className="text-center">
              <p className="text-[17px] font-extrabold font-num tabular-nums text-it-blue-500">
                {academy._count?.members ?? 0}
              </p>
              <p className="text-[11px] text-it-ink-500 dark:text-wtext-4 mt-0.5">수강생</p>
            </div>
            <div className="text-center">
              <p className="text-[17px] font-extrabold font-num tabular-nums text-it-blue-500">
                {academy._count?.coaches ?? 0}
              </p>
              <p className="text-[11px] text-it-ink-500 dark:text-wtext-4 mt-0.5">코치</p>
            </div>
            <div className="text-center">
              <p className="text-[17px] font-extrabold font-num tabular-nums text-it-blue-500">
                {academy._count?.classes ?? 0}
              </p>
              <p className="text-[11px] text-it-ink-500 dark:text-wtext-4 mt-0.5">수업</p>
            </div>
          </div>
        </section>

        {/* 소개 — flat 흰 섹션 */}
        {academy.description && (
          <>
            <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
            <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-5">
              <h2 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white mb-2">
                소개
              </h2>
              <p className="text-[14px] text-it-ink-800 dark:text-wtext-2 leading-relaxed whitespace-pre-wrap">
                {academy.description}
              </p>
            </section>
          </>
        )}

        {/* 연락처 — flat 흰 섹션 */}
        {(academy.contactPhone || academy.contactEmail) && (
          <>
            <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
            <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-5">
              <h2 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white mb-3">
                연락처
              </h2>
              <div className="flex flex-col">
                {academy.contactPhone && (
                  <div className={cn(
                    "flex items-center gap-2 py-3 text-[14px] text-it-ink-800 dark:text-wtext-2",
                    academy.contactEmail && "border-b border-it-line dark:border-rink-700",
                  )}>
                    <Icon name="call" className="text-card-emphasis text-it-blue-500" aria-hidden="true" />
                    <a
                      href={`tel:${academy.contactPhone}`}
                      className="hover:text-it-blue-500 transition-colors motion-reduce:transition-none"
                    >
                      {academy.contactPhone}
                    </a>
                  </div>
                )}
                {academy.contactEmail && (
                  <div className="flex items-center gap-2 py-3 text-[14px] text-it-ink-800 dark:text-wtext-2">
                    <Icon name="mail" className="text-card-emphasis text-it-blue-500" aria-hidden="true" />
                    <a
                      href={`mailto:${academy.contactEmail}`}
                      className="hover:text-it-blue-500 transition-colors motion-reduce:transition-none"
                    >
                      {academy.contactEmail}
                    </a>
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        <div className="h-28" aria-hidden="true" />

        {/* 하단 고정 가입 신청 버튼 */}
        <div className="fixed bottom-[72px] left-0 right-0 z-10">
          <div className="max-w-md mx-auto px-4 pb-4 pt-2 bg-it-canvas/90 dark:bg-puck/90">
            <button
              type="button"
              onClick={handleJoinRequest}
              disabled={isJoining}
              className={cn(
                "w-full h-14 rounded-w-md text-white font-bold text-[16px]",
                "bg-it-blue-500 hover:bg-it-blue-600 active:brightness-95",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "transition-colors motion-reduce:transition-none focus:outline-none focus:ring-2 focus:ring-it-blue-500 focus:ring-offset-2 dark:focus:ring-offset-rink-900",
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
          <div className="relative bg-it-surface dark:bg-rink-800 rounded-w-xl shadow-md mx-6 w-full max-w-sm p-6">
            <h3 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white mb-2">
              가입 신청
            </h3>
            <p className="text-[14px] text-it-ink-800 dark:text-wtext-2 mb-6">
              <strong className="text-it-blue-500">{academy.name}</strong>에 가입을
              신청하시겠습니까? 관리자의 승인 후 수강이 가능합니다.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowJoinModal(false)}
                className="flex-1 h-12 rounded-w-md text-[14px] font-bold border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 text-it-ink-800 dark:text-white hover:bg-it-fill dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none focus:outline-none focus:ring-2 focus:ring-it-blue-500/30"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmJoin}
                disabled={isJoining}
                className={cn(
                  "flex-[2] h-12 rounded-w-md text-[14px] font-bold",
                  "bg-it-blue-500 text-white hover:bg-it-blue-600 active:brightness-95",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  "transition-colors motion-reduce:transition-none focus:outline-none focus:ring-2 focus:ring-it-blue-500",
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
