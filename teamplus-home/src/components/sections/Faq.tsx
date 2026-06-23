"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { FAQ } from "@/lib/content";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { BackgroundMesh } from "@/components/ui/BackgroundMesh";
import { cn } from "@/lib/utils";

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section
      id="faq"
      aria-label="자주 묻는 질문"
      className="section relative scroll-mt-24"
    >
      <BackgroundMesh variant="soft" />
      <div className="container-site">
        <SectionHeading
          eyebrow="도입 전 확인"
          title="자주 묻는 질문"
          description="팀플러스+ 도입 전 가장 많이 궁금해하신 내용을 모았습니다. 추가 문의는 언제든 icehockey@knewscorp.co.kr 으로 보내주세요."
        />

        <div className="mx-auto mt-14 max-w-3xl space-y-3">
          {FAQ.map((f, i) => {
            const isOpen = open === i;
            return (
              <div
                key={f.q}
                className={cn(
                  "overflow-hidden rounded-2xl border transition-colors",
                  isOpen
                    ? "border-ice-100 bg-ice-50"
                    : "border-wline bg-wsurface hover:bg-wbg",
                )}
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                >
                  <span
                    className={cn(
                      "text-sm font-semibold sm:text-base",
                      isOpen ? "text-rink-900" : "text-wtext-2",
                    )}
                  >
                    {f.q}
                  </span>
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors",
                      isOpen
                        ? "rotate-45 border-ice-200 bg-wsurface text-ice-600"
                        : "border-wline bg-wbg text-wtext-3",
                    )}
                  >
                    <Plus size={16} strokeWidth={2.5} />
                  </span>
                </button>

                {isOpen && (
                  <div className="px-6 pb-5 text-sm leading-relaxed text-wtext-3 sm:text-[15px]">
                    {f.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
