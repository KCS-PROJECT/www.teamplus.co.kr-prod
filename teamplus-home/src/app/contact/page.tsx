import type { Metadata } from 'next';
import { Mail, Phone, MapPin, Clock, Building2, Users2 } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { ContactForm } from '@/components/sections/ContactForm';
import { StoreBadge } from '@/components/ui/StoreBadge';
import { BRAND, APP_DOWNLOAD } from '@/lib/content';

export const metadata: Metadata = {
  title: '문의·상담',
  description:
    '14일 무료 체험 · 데모 신청 · 맞춤 견적 · 파트너십 문의까지. TEAMPLUS 팀이 영업일 1일 이내에 연락드립니다.',
};

const CONTACT_ITEMS = [
  {
    icon: Mail,
    label: '이메일',
    value: BRAND.contact.email,
    href: `mailto:${BRAND.contact.email}`,
  },
  {
    icon: Phone,
    label: '전화',
    value: BRAND.contact.phone,
    href: `tel:${BRAND.contact.phone.replace(/-/g, '')}`,
  },
  {
    icon: Clock,
    label: '운영 시간',
    value: BRAND.contact.hours,
  },
  {
    icon: MapPin,
    label: '주소',
    value: BRAND.contact.address,
  },
];

const INQUIRIES = [
  {
    icon: Building2,
    title: '도입 문의',
    description: 'Starter · Business · Enterprise 플랜 선택 · 데이터 이관 · 온보딩',
  },
  {
    icon: Users2,
    title: '파트너십',
    description: '리그 · 구단 연합 · 빙상장 · 용품사 제휴 · API 파트너 프로그램',
  },
];

const HERO_TRUST = ['영업일 1일 이내 회신', '클럽 규모별 견적 안내', '데모 화면 함께 검토'];

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="문의 · 상담"
        title={
          <>
            <span className="text-ice-500">팀플러스+</span>에
            <br className="hidden sm:block" /> 무엇이든 물어보세요
          </>
        }
        description="도입 검토, 데모 신청, 맞춤 견적, 데이터 이관, 파트너십까지 현재 운영 방식에 맞춰 상담합니다. 남겨주신 문의는 영업일 1일 이내에 확인하고, 필요한 화면과 플랜을 함께 안내드립니다."
        primary={{ src: '/images/app-home.png', alt: '팀플러스 감독 홈 대시보드 앱 화면' }}
      >
        {/* 히어로 도입 CTA */}
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <StoreBadge
            store="apple"
            href={APP_DOWNLOAD.appStore}
            className="w-full justify-center sm:w-auto sm:justify-start"
          />
          <StoreBadge
            store="google"
            href={APP_DOWNLOAD.googlePlay}
            className="w-full justify-center sm:w-auto sm:justify-start"
          />
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-wtext-4">
          {HERO_TRUST.map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-ice-500" />
              {t}
            </span>
          ))}
        </div>
      </PageHero>

      {/*
       * 어색했던 좌우 stretch 빈 공간 제거 → lg:items-start + 좌측 플랫 sticky 레일.
       * 좌측은 카드 박스 없이(정보 레일), 우측 폼만 단일 카드(주요 액션) → 카드 수프 해소·위계 정리.
       */}
      <section className="section relative !pt-0">
        <div className="container-site">
          <div className="grid gap-x-12 gap-y-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
            {/* Left rail — 연락처 · 문의 유형 (flat, sticky) */}
            <aside className="lg:sticky lg:top-28">
              <div>
                <h2 className="text-lg font-extrabold text-rink-900">연락처</h2>
                <p className="mt-2 text-sm leading-6 text-wtext-3">
                  바로 연락이 필요하시면 아래 채널을 이용해주세요.
                </p>
                <ul className="mt-7 flex flex-col gap-5">
                  {CONTACT_ITEMS.map((item) => (
                    <li key={item.label} className="flex items-start gap-3.5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-wline bg-ice-50 text-ice-600">
                        <item.icon size={17} strokeWidth={1.7} />
                      </span>
                      <div className="pt-0.5">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-wtext-4">
                          {item.label}
                        </p>
                        {item.href ? (
                          <a
                            href={item.href}
                            className="mt-1 block text-sm font-semibold text-rink-900 transition-colors hover:text-ice-600"
                          >
                            {item.value}
                          </a>
                        ) : (
                          <p className="mt-1 text-sm font-semibold leading-6 text-rink-900">
                            {item.value}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-10 border-t border-wline pt-10">
                <h2 className="text-lg font-extrabold text-rink-900">어떤 문의든 환영합니다</h2>
                <div className="mt-6 flex flex-col gap-5">
                  {INQUIRIES.map((i) => (
                    <div key={i.title} className="flex items-start gap-3.5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-wline bg-ice-50 text-ice-600">
                        <i.icon size={17} strokeWidth={1.7} />
                      </span>
                      <div>
                        <p className="font-bold text-rink-900">{i.title}</p>
                        <p className="mt-1 text-sm leading-6 text-wtext-3">{i.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </aside>

            {/* Right — 상담 신청 폼 (단일 카드 · 주요 액션) */}
            <ContactForm />
          </div>
        </div>
      </section>
    </>
  );
}
