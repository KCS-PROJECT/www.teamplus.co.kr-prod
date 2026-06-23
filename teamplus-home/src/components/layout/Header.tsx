'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { BRAND, NAV_ITEMS } from '@/lib/content';
import { cn } from '@/lib/utils';

export function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  // 상단 네비게이션에서 요금제(/pricing) 제외 (Footer 링크는 유지)
  const navItems = NAV_ITEMS.filter((item) => item.href !== '/pricing');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-colors duration-300',
        scrolled
          ? 'border-b border-wline bg-wsurface/95 shadow-sh-1'
          : 'bg-transparent',
      )}
    >
      <div className="container-site flex h-16 items-center justify-between sm:h-20">
        <Link
          href="/"
          aria-label={`${BRAND.name} 홈`}
          className="group flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 focus-visible:ring-offset-wsurface"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ice-500 shadow-sh-2">
            <Image
              src="/images/splash_logo.png"
              alt=""
              width={28}
              height={28}
              priority
              className="h-7 w-7 object-contain"
            />
          </span>
          <Image
            src="/images/teamplus-wordmark.png"
            alt=""
            width={954}
            height={218}
            priority
            className="h-5 w-auto object-contain"
          />
        </Link>

        <nav aria-label="주 메뉴" className="hidden items-center gap-1 lg:flex">
          {navItems.map((item) => {
            const active =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 focus-visible:ring-offset-wsurface',
                  active
                    ? 'text-ice-600'
                    : 'text-wtext-2 hover:text-rink-900',
                )}
              >
                {item.label}
                {active && (
                  <span className="absolute inset-0 -z-10 rounded-full bg-ice-50 ring-1 ring-ice-100" />
                )}
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? '메뉴 닫기' : '메뉴 열기'}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-wline bg-wsurface text-rink-800 transition-colors hover:bg-ice-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 focus-visible:ring-offset-wsurface lg:hidden"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {open && (
        <div id="mobile-nav" className="border-t border-wline bg-wsurface lg:hidden">
          <nav aria-label="모바일 메뉴" className="container-site flex flex-col gap-1 py-4">
            {navItems.map((item) => {
              const active =
                item.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-xl px-4 py-3 text-sm font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500',
                    active
                      ? 'bg-ice-50 text-ice-700'
                      : 'text-wtext-2 hover:bg-wbg hover:text-rink-900',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
