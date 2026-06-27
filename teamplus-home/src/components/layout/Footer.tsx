import Image from 'next/image';
import Link from 'next/link';
import { BRAND, NAV_ITEMS } from '@/lib/content';

const year = new Date().getFullYear();

/**
 * Footer — WCAG 2.1 AA 접근성 강화
 * - 모든 Link/a 에 focus-visible 적용 (키보드 사용자 위치 추적)
 * - 단축 키워드 `link-row` 패턴 — outline + offset
 * - 색상 대비 wtext-3 (5.36:1) 사용 보장
 */

const linkBase =
  'rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 focus-visible:ring-offset-wsurface';

export function Footer() {
  return (
    <footer className="relative mt-10 border-t border-wline bg-wsurface">
      <div className="container-site py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ice-500 shadow-sh-1">
                <Image
                  src="/images/splash_logo.png"
                  alt=""
                  width={28}
                  height={28}
                  className="h-7 w-7 object-contain"
                />
              </span>
              <Image
                src="/images/teamplus-wordmark.png"
                alt={BRAND.name}
                width={954}
                height={218}
                className="h-5 w-auto object-contain"
              />
            </div>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-wtext-3">
              {BRAND.descriptor}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-wtext-4">
              바로가기
            </p>
            <ul className="mt-4 space-y-3">
              {/* '/' 홈 + '/pricing' 요금제 제외 (요금제는 푸터 미노출) */}
              {NAV_ITEMS.filter((n) => n.href !== '/' && n.href !== '/pricing').map((n) => (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    className={`${linkBase} text-sm text-wtext-3 hover:text-ice-600`}
                  >
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-wtext-4">
              리소스
            </p>
            <ul className="mt-4 space-y-3 text-sm text-wtext-3">
              <li>
                <Link href="/features" className={`${linkBase} hover:text-ice-600`}>
                  앱 기능 보기
                </Link>
              </li>
              <li>
                <Link href="/news" className={`${linkBase} hover:text-ice-600`}>
                  공지 · 소식
                </Link>
              </li>
              <li>
                <a href="#faq" className={`${linkBase} hover:text-ice-600`}>
                  자주 묻는 질문
                </a>
              </li>
              <li>
                <Link href="/contact?type=brochure" className={`${linkBase} hover:text-ice-600`}>
                  소개자료 받기
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-wtext-4">
              고객 지원
            </p>
            <ul className="mt-4 space-y-3 text-sm text-wtext-3">
              <li>
                <a
                  href={`mailto:${BRAND.contact.email}`}
                  className={`${linkBase} hover:text-ice-600`}
                >
                  {BRAND.contact.email}
                </a>
              </li>
              <li>
                <a
                  href={`tel:${BRAND.contact.phone.replace(/-/g, '')}`}
                  className={`${linkBase} hover:text-ice-600`}
                >
                  {BRAND.contact.phone}
                </a>
              </li>
              <li className="text-wtext-4">{BRAND.contact.hours}</li>
              <li className="text-wtext-4">{BRAND.contact.address}</li>
            </ul>
          </div>
        </div>

        {/* 사업자 정보 — PG 대행사 심사 및 전자상거래법 §10조 표시 의무사항.
            (사업자등록증 + 통신판매업신고증 원본 기준, 2026-05-27 적용) */}
        <address className="mt-14 not-italic border-t border-wline pt-6 text-xs leading-relaxed text-wtext-4">
          <p className="mb-1">
            <span className="font-semibold text-wtext-3">{BRAND.legal.companyName}</span>
            <span className="mx-2 text-wline">|</span>
            대표자: {BRAND.legal.representative}
            <span className="mx-2 text-wline">|</span>
            {BRAND.legal.address}
          </p>
          <p className="mb-1">
            사업자등록번호: {BRAND.legal.businessNumber}
            <span className="mx-2 text-wline">|</span>
            통신판매업신고번호: {BRAND.legal.mailOrderNumber}
          </p>
          <p>
            고객센터:{" "}
            <a
              href={`tel:${BRAND.contact.phone.replace(/-/g, "")}`}
              className={`${linkBase} hover:text-wtext-2`}
            >
              {BRAND.contact.phone}
            </a>
            <span className="mx-2 text-wline">|</span>
            이메일:{" "}
            <a
              href={`mailto:${BRAND.contact.email}`}
              className={`${linkBase} hover:text-wtext-2`}
            >
              {BRAND.contact.email}
            </a>
            <span className="mx-2 text-wline">|</span>
            개인정보보호책임자: {BRAND.legal.privacyOfficer}
          </p>
        </address>

        <div className="mt-6 flex flex-col gap-4 border-t border-wline pt-6 text-xs text-wtext-4 sm:flex-row sm:items-center sm:justify-between">
          <p>Copyright © {year} {BRAND.legal.companyName}. All rights reserved.</p>
          <nav aria-label="법적 고지" className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/legal/privacy" className={`${linkBase} hover:text-wtext-2`}>
              개인정보처리방침
            </Link>
            <Link href="/legal/terms" className={`${linkBase} hover:text-wtext-2`}>
              이용약관
            </Link>
            <Link href="/legal/refund" className={`${linkBase} hover:text-wtext-2`}>
              환불정책
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
