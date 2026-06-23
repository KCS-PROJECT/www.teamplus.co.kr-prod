"use client";

/**
 * Task #58 A-Web — 영상 업로드 페이지 (PARENT)
 *
 * Backend:
 *   POST /api/v1/videos  (multipart/form-data)
 *        → 201 + { data: { id, videoUrl, status, ... } }  (최대 50MB)
 *
 * 플로우 (2026-05-23 R2 제거 후 multipart 단일 채널 전환):
 *   1) 제목/설명 입력 + 파일 선택 (카메라 직캡처 또는 갤러리)
 *   2) VideoUploadButton 이 multipart 단일 호출로 업로드 + Video 레코드 자동 생성
 *   3) onRegistered 콜백 → 완료 카드 표시
 */

import { useMemo, useState } from "react";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { BottomNav, parentNavItems } from "@/components/layout/BottomNav";
import { Icon } from "@/components/ui/Icon";
import { useNativeUI } from "@/hooks/useNativeUI";
import { usePageReady } from "@/hooks/usePageReady";
import { VideoUploadButton } from "@/components/videos/VideoUploadButton";
import type { RegisteredVideo } from "@/services/upload.service";
import { isNativeApp } from "@/services/native-bridge";
import { MESSAGES } from "@/lib/messages";

export default function ParentVideoUploadPage() {
  usePageReady(true);

  // [appbar-harness-v3 / 2026-05-13] 이중 헤더 방지 — Web `<PageAppBar />` 단독 렌더.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [registered, setRegistered] = useState<RegisteredVideo | null>(null);

  const trimmedTitle = title.trim();
  const canUpload = trimmedTitle.length > 0;
  const metadata = useMemo(
    () =>
      canUpload
        ? {
            title: trimmedTitle,
            description: description.trim() || undefined,
            videoType: "highlight" as const,
          }
        : undefined,
    [canUpload, trimmedTitle, description],
  );

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title={MESSAGES.video.pageTitle} />

      <main className="flex-1 px-6 py-6 flex flex-col gap-6 overflow-y-auto hide-scrollbar">
        {/* 페이지 히어로 */}
        <section className="flex items-start gap-3">
          <div
            className="flex items-center justify-center size-12 rounded-2xl bg-blue-50 dark:bg-blue-900/20 shrink-0"
            aria-hidden="true"
          >
            <Icon name="videocam" className="text-2xl text-ice-500" />
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <h1 className="text-2xl font-bold text-wtext-1 dark:text-white leading-tight">
              {MESSAGES.video.pageTitle}
            </h1>
            <p className="text-card-body text-wtext-3 dark:text-rink-300 leading-relaxed">
              {MESSAGES.video.pageDescription}
            </p>
          </div>
        </section>

        {/* 업로드 폼 */}
        <section
          aria-label={MESSAGES.video.pageTitle}
          className="flex flex-col gap-5 rounded-2xl border border-wline-2 dark:border-rink-700 bg-white dark:bg-rink-800 shadow-sm p-5"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-card-body font-semibold text-wtext-2 dark:text-rink-100">
              {MESSAGES.video.titleLabel}
              <span className="ml-1 text-red-500" aria-hidden="true">
                *
              </span>
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder={MESSAGES.video.titlePlaceholder}
              disabled={!!registered}
              required
              aria-required="true"
              className="w-full h-12 rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-700 px-3.5 text-card-body text-wtext-1 dark:text-white placeholder:text-wtext-3 dark:placeholder:text-wtext-3 focus:outline-none focus:ring-2 focus:ring-ice-500/30 focus:border-ice-500 transition-colors motion-reduce:transition-none disabled:bg-wbg dark:disabled:bg-rink-800 disabled:cursor-not-allowed"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-card-body font-semibold text-wtext-2 dark:text-rink-100">
              {MESSAGES.video.descriptionLabel}
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder={MESSAGES.video.descriptionPlaceholder}
              disabled={!!registered}
              className="w-full resize-none rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-700 px-3.5 py-2.5 text-card-body text-wtext-1 dark:text-white placeholder:text-wtext-3 dark:placeholder:text-wtext-3 focus:outline-none focus:ring-2 focus:ring-ice-500/30 focus:border-ice-500 transition-colors motion-reduce:transition-none disabled:bg-wbg dark:disabled:bg-rink-800 disabled:cursor-not-allowed"
            />
          </label>

          <div className="pt-1">
            <VideoUploadButton
              category="VIDEO"
              metadata={metadata}
              disabled={!canUpload || !!registered}
              onRegistered={(video) => {
                if ("videoUrl" in video) setRegistered(video);
              }}
            />
          </div>

          {!canUpload && !registered ? (
            <div
              role="note"
              className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 p-3"
            >
              <Icon
                name="info"
                size={16}
                className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0"
                aria-hidden="true"
              />
              <p className="text-card-meta text-amber-800 dark:text-amber-300">
                {MESSAGES.video.missingTitle}
              </p>
            </div>
          ) : null}
        </section>

        {/* 업로드 결과 */}
        {registered ? (
          <section
            aria-label="업로드 결과"
            role="status"
            className="rounded-2xl border border-green-200 dark:border-green-900/40 bg-green-50 dark:bg-green-900/10 shadow-sm p-5"
          >
            <div className="flex items-center gap-2 text-card-body font-bold text-green-700 dark:text-green-400 mb-4">
              <div className="flex items-center justify-center size-9 rounded-w-pill bg-green-100 dark:bg-green-900/30">
                <Icon name="check_circle" size={18} aria-hidden="true" />
              </div>
              <span>{MESSAGES.video.registerSuccess}</span>
            </div>
            <dl className="flex flex-col gap-2 text-card-meta text-wtext-2 dark:text-rink-100 rounded-xl bg-white/60 dark:bg-rink-900/40 p-3 border border-green-100 dark:border-green-900/30">
              <div className="flex gap-2">
                <dt className="min-w-[60px] font-semibold text-wtext-3 dark:text-rink-300">
                  제목
                </dt>
                <dd className="flex-1 truncate text-wtext-1 dark:text-white">
                  {registered.title}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="min-w-[60px] font-semibold text-wtext-3 dark:text-rink-300">
                  URL
                </dt>
                <dd className="flex-1 truncate font-mono text-[11px]">
                  {registered.videoUrl}
                </dd>
              </div>
              {registered.status ? (
                <div className="flex gap-2">
                  <dt className="min-w-[60px] font-semibold text-wtext-3 dark:text-rink-300">
                    상태
                  </dt>
                  <dd>{registered.status}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        ) : null}

        <div className="h-24" />
      </main>

      {!isNativeApp() && <BottomNav items={parentNavItems} />}
    </MobileContainer>
  );
}
