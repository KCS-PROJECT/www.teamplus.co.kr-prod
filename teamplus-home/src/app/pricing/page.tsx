import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, X } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Pricing } from '@/components/sections/Pricing';
import { Faq } from '@/components/sections/Faq';
import { FinalCta } from '@/components/sections/FinalCta';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: '요금제',
  description:
    'Starter · Business · Enterprise 3가지 플랜으로 제공됩니다. 모든 플랜은 14일 무료 체험 · 온보딩 무상 지원 · 데이터 이관 대행을 포함합니다.',
};

const COMPARE = [
  { label: '회원 수 제한', values: ['50명', '300명', '무제한'] },
  { label: '수업 · 스케줄', values: [true, true, true] },
  { label: 'QR 출석 · 크레딧', values: [true, true, true] },
  { label: 'KG이니시스 결제', values: [true, true, true] },
  { label: '알림톡 템플릿', values: ['3개', '5개', '무제한'] },
  { label: '클럽 쇼핑몰', values: [false, true, true] },
  { label: '대회 · 리그 · 픽업매치', values: [false, true, true] },
  { label: '실시간 채팅 · 게시판', values: [false, true, true] },
  { label: '다중 클럽 · 지점', values: [false, false, true] },
  { label: 'SSO · 화이트라벨', values: [false, false, true] },
  { label: '전담 CS · 온사이트 교육', values: [false, false, true] },
  { label: 'SLA 계약', values: [false, false, true] },
];

export default function PricingPage() {
  return (
    <>
      <PageHeader
        eyebrow="요금제"
        title={
          <>
            클럽 규모에 맞춘
            <br className="hidden sm:block" />
            <span className="text-ice-600">투명한 요금제</span>
          </>
        }
        description="숨겨진 비용 없이, 필요한 기능만 사용한 만큼 결제합니다. 언제든 플랜을 변경·해지할 수 있습니다."
      />

      <Pricing />

      <section className="section relative">
        <div className="container-site">
          <div className="mx-auto max-w-5xl">
            <div className="text-center">
              <span className="section-eyebrow">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-ice-500" />
                플랜 비교
              </span>
              <h2 className="mt-6 text-display-lg font-bold tracking-normal text-balance text-rink-900">
                플랜별 <span className="text-ice-600">상세 비교</span>
              </h2>
            </div>

            <div className="mt-10 overflow-hidden rounded-[1.5rem] border border-wline bg-wsurface shadow-sh-1">
              <div className="grid grid-cols-4 bg-wbg text-sm">
                <div className="p-5 text-xs font-semibold uppercase tracking-wider text-wtext-4">
                  기능
                </div>
                {['Starter', 'Business', 'Enterprise'].map((n) => (
                  <div key={n} className="p-5 text-center font-bold text-rink-900">
                    {n}
                  </div>
                ))}
              </div>

              <div className="divide-y divide-wline">
                {COMPARE.map((row, rowIdx) => (
                  <div
                    key={row.label}
                    className={cn(
                      'grid grid-cols-4 text-sm',
                      rowIdx % 2 === 0 ? 'bg-wbg/60' : '',
                    )}
                  >
                    <div className="p-5 font-medium text-wtext-2">{row.label}</div>
                    {row.values.map((v, i) => (
                      <div key={i} className="flex items-center justify-center p-5">
                        {v === true ? (
                          <Check size={18} className="text-ice-600" strokeWidth={2.5} />
                        ) : v === false ? (
                          <X size={18} className="text-wtext-4" strokeWidth={2} />
                        ) : (
                          <span className="text-sm font-semibold text-rink-900">{v}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-wtext-3">
                어떤 플랜이 맞을지 고민되신다면, 전담 매니저가 클럽 상황에 맞는 플랜을 추천해드립니다.
              </p>
              <Link href="/contact" className="btn-primary">
                1:1 플랜 상담 받기
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Faq />
      <FinalCta />
    </>
  );
}
