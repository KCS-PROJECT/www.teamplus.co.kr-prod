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

      <main className="flex-1 flex flex-col overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck !pb-8">
        {/* 페이지 히어로 — flat 흰 섹션 */}
        <section className="bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-5 flex items-start gap-3">
          <div
            className="flex items-center justify-center size-12 rounded-w-md bg-it-blue-50 dark:bg-it-blue-500/15 shrink-0"
            aria-hidden="true"
          >
            <Icon name="videocam" className="text-2xl text-it-blue-500" />
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <h1 className="text-2xl font-bold text-it-ink-800 dark:text-white leading-tight">
              {MESSAGES.video.pageTitle}
            </h1>
            <p className="text-card-body text-it-ink-500 dark:text-wtext-4 leading-relaxed">
              {MESSAGES.video.pageDescription}
            </p>
          </div>
        </section>

        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 업로드 폼 — flat 흰 섹션 */}
        <section
          aria-label={MESSAGES.video.pageTitle}
          className="flex flex-col gap-5 bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-6"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-card-body font-semibold text-it-ink-700 dark:text-wtext-4">
              {MESSAGES.video.titleLabel}
              <span className="ml-1 text-it-red-500" aria-hidden="true">
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
              className="w-full h-12 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-700 px-3.5 text-card-body text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-wtext-4 focus:outline-none focus:ring-2 focus:ring-it-blue-500/30 focus:border-it-blue-500 transition-colors motion-reduce:transition-none disabled:bg-it-fill dark:disabled:bg-rink-800 disabled:cursor-not-allowed"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-card-body font-semibold text-it-ink-700 dark:text-wtext-4">
              {MESSAGES.video.descriptionLabel}
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder={MESSAGES.video.descriptionPlaceholder}
              disabled={!!registered}
              className="w-full resize-none rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-700 px-3.5 py-2.5 text-card-body text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-wtext-4 focus:outline-none focus:ring-2 focus:ring-it-blue-500/30 focus:border-it-blue-500 transition-colors motion-reduce:transition-none disabled:bg-it-fill dark:disabled:bg-rink-800 disabled:cursor-not-allowed"
            />
          </label>

          <div className="pt-1">
            <VideoUploadButton
              category="VIDEO"
              iceTheme
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
              className="flex items-start gap-2 rounded-w-md bg-sun-100 dark:bg-sun-500/10 border border-sun-500/30 dark:border-sun-500/20 p-3"
            >
              <Icon
                name="info"
                size={16}
                className="text-sun-500 mt-0.5 shrink-0"
                aria-hidden="true"
              />
              <p className="text-card-meta text-it-ink-700 dark:text-sun-500">
                {MESSAGES.video.missingTitle}
              </p>
            </div>
          ) : null}
        </section>

        {/* 업로드 결과 */}
        {registered ? (
          <>
            <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
            <section
              aria-label="업로드 결과"
              role="status"
              className="bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-6"
            >
              <div className="flex items-center gap-2 text-card-body font-bold text-mint-500 mb-4">
                <div className="flex items-center justify-center size-9 rounded-w-pill bg-mint-100 dark:bg-mint-500/15">
                  <Icon name="check_circle" size={18} aria-hidden="true" />
                </div>
                <span>{MESSAGES.video.registerSuccess}</span>
              </div>
              <dl className="flex flex-col gap-2 text-card-meta text-it-ink-700 dark:text-wtext-4 rounded-w-md bg-it-fill dark:bg-rink-900/40 p-3 border border-it-line dark:border-rink-700">
                <div className="flex gap-2">
                  <dt className="min-w-[60px] font-semibold text-it-ink-500 dark:text-wtext-4">
                    제목
                  </dt>
                  <dd className="flex-1 truncate text-it-ink-800 dark:text-white">
                    {registered.title}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="min-w-[60px] font-semibold text-it-ink-500 dark:text-wtext-4">
                    URL
                  </dt>
                  <dd className="flex-1 truncate font-mono text-[11px]">
                    {registered.videoUrl}
                  </dd>
                </div>
                {registered.status ? (
                  <div className="flex gap-2">
                    <dt className="min-w-[60px] font-semibold text-it-ink-500 dark:text-wtext-4">
                      상태
                    </dt>
                    <dd>{registered.status}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          </>
        ) : null}
      </main>

      {!isNativeApp() && <BottomNav items={parentNavItems} />}
    </MobileContainer>
  );
}
