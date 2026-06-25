'use client';

import { useState, useCallback, useEffect, memo } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { SubmainAppBar } from '@/components/layout/SubmainAppBar';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────
interface Promotion {
  id: string;
  title: string;
  lessonType: string;
  schedule: string;
  price: string;
  capacity: number;
  enrolled: number;
  location: string;
  description: string;
  viewCount: number;
  inquiryCount: number;
  status: 'ACTIVE' | 'CLOSED' | 'DRAFT';
  createdAt: string;
}

type TabKey = 'all' | 'active' | 'closed';

// ─── Status Map (ICETIMES — mint/중립/sun) ───────────
const PROMO_STATUS_MAP: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: '게시중', className: 'bg-mint-100 text-rink-800 dark:bg-mint-500/20 dark:text-mint-100' },
  CLOSED: { label: '마감', className: 'bg-it-fill text-it-ink-600 dark:bg-rink-700 dark:text-rink-300' },
  DRAFT: { label: '임시저장', className: 'bg-sun-100 text-rink-800 dark:bg-sun-500/20 dark:text-sun-100' },
};

// 레슨 타입 식별용 inline dot (좌측 stripe는 .impeccable.md BAN — 사용 금지)
const TYPE_DOT: Record<string, string> = {
  '개인레슨': 'bg-it-blue-500',
  '그룹레슨': 'bg-it-blue-700',
  '펀하키': 'bg-sun-500',
  '캠프': 'bg-it-red-500',
  '정규훈련': 'bg-mint-500',
};

// ─── Promotion Card ──────────────────────────────────
const PromotionCard = memo(function PromotionCard({
  promo,
  onEdit,
}: {
  promo: Promotion;
  onEdit: (id: string) => void;
}) {
  const statusInfo = PROMO_STATUS_MAP[promo.status] ?? PROMO_STATUS_MAP.ACTIVE;
  const dotColor = TYPE_DOT[promo.lessonType] ?? 'bg-wtext-4';
  const occupancy = promo.capacity > 0 ? Math.round((promo.enrolled / promo.capacity) * 100) : 0;
  const occupancyColor = occupancy >= 90 ? 'bg-it-red-500' : occupancy >= 70 ? 'bg-sun-500' : 'bg-it-blue-500';

  return (
    <article className="group border-b border-it-line dark:border-rink-700 hover:bg-it-fill dark:hover:bg-rink-700/30 transition-colors motion-reduce:transition-none">
      <div className="px-4 sm:px-5 pt-4 pb-4">
        {/* 상단: [● 타입] · 등록시점 ————— 상태 */}
        <div className="flex items-center justify-between gap-3 mb-3.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn('w-1.5 h-1.5 rounded-w-pill flex-shrink-0', dotColor)} aria-hidden="true" />
            <span className="text-card-meta font-bold text-it-ink-600 dark:text-rink-100 uppercase tracking-[0.14em]">
              {promo.lessonType}
            </span>
            <span className="text-it-ink-300 dark:text-wtext-2 select-none" aria-hidden="true">·</span>
            <span className="text-card-meta text-it-ink-500 dark:text-rink-300 font-medium">
              {promo.createdAt}
            </span>
          </div>
          <span className={cn('flex-shrink-0 text-card-meta font-bold px-2 h-5 inline-flex items-center rounded-w-pill tracking-wide', statusInfo.className)}>
            {statusInfo.label}
          </span>
        </div>

        {/* 제목 — Pretendard bold, tight */}
        <h3 className="text-[15.5px] font-bold text-it-ink-800 dark:text-white leading-[1.35] tracking-tight mb-1.5">
          {promo.title}
        </h3>

        {/* 설명 — single line muted */}
        <p className="text-card-meta text-it-ink-500 dark:text-rink-300 line-clamp-1 mb-4 leading-relaxed">
          {promo.description}
        </p>

        {/* 메타 — 각 항목 독립 라인 (pipe 제거) */}
        <dl className="flex flex-col gap-1.5 text-card-meta text-it-ink-800 dark:text-rink-100">
          <div className="flex items-center gap-2">
            <dt className="sr-only">일정</dt>
            <Icon name="schedule" className="text-[14px] text-it-ink-500 dark:text-rink-300 flex-shrink-0" aria-hidden="true" />
            <dd className="tabular-nums">{promo.schedule}</dd>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <dt className="sr-only">장소</dt>
            <Icon name="place" className="text-[14px] text-it-ink-500 dark:text-rink-300 flex-shrink-0" aria-hidden="true" />
            <dd className="truncate">{promo.location}</dd>
          </div>
        </dl>

        {/* 가격 + 정원 ─ numbers as hero (가격 오른쪽 정렬) */}
        <div className="mt-4 flex items-end justify-between gap-4">
          {/* 정원 */}
          <div className="flex flex-col gap-1.5 min-w-0">
            <span className="text-card-meta font-bold text-it-ink-500 dark:text-rink-300 uppercase tracking-[0.14em]">
              정원
            </span>
            <div className="flex items-center gap-2">
              <span className="text-card-body font-bold text-it-ink-800 dark:text-white tabular-nums tracking-tight">
                {promo.enrolled}
                <span className="text-it-ink-500 dark:text-rink-300 font-medium">/{promo.capacity}</span>
              </span>
              <span
                className="block w-14 h-1 bg-it-line dark:bg-rink-800 rounded-w-pill overflow-hidden"
                role="progressbar"
                aria-valuenow={promo.enrolled}
                aria-valuemin={0}
                aria-valuemax={promo.capacity}
                aria-label={`정원 ${promo.enrolled}명 중 ${promo.capacity}명 충족`}
              >
                <span
                  className={cn('block h-full transition-[width] duration-500 motion-reduce:transition-none', occupancyColor)}
                  style={{ width: `${Math.min(occupancy, 100)}%` }}
                />
              </span>
            </div>
          </div>

          {/* 가격 — 오른쪽 정렬, bold tabular-nums (hero number) */}
          <div className="flex flex-col gap-1.5 items-end">
            <span className="text-card-meta font-bold text-it-ink-500 dark:text-rink-300 uppercase tracking-[0.14em]">
              금액
            </span>
            <span className="text-card-title font-bold text-it-ink-800 dark:text-white tabular-nums tracking-tight text-right">
              {promo.price}
            </span>
          </div>
        </div>
      </div>

      {/* 푸터 — 참여 지표 + 편집 */}
      <div className="px-4 sm:px-5 py-3 border-t border-it-line dark:border-rink-800 flex items-center justify-between">
        <div className="flex items-center gap-4 text-card-meta text-it-ink-500 dark:text-rink-300">
          <span className="inline-flex items-center gap-1 tabular-nums" aria-label={`조회수 ${promo.viewCount}`}>
            <Icon name="visibility" className="text-[13px]" aria-hidden="true" />
            {promo.viewCount.toLocaleString()}
          </span>
          <span className="inline-flex items-center gap-1 tabular-nums" aria-label={`문의 ${promo.inquiryCount}`}>
            <Icon name="forum" className="text-[13px]" aria-hidden="true" />
            {promo.inquiryCount}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onEdit(promo.id)}
          className="inline-flex items-center gap-1 text-card-meta font-semibold text-it-blue-500 dark:text-it-blue-300 hover:text-it-blue-600 dark:hover:text-it-blue-200 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:underline"
          aria-label={`${promo.title} 편집`}
        >
          편집
          <Icon name="arrow_forward" className="text-[13px]" aria-hidden="true" />
        </button>
      </div>
    </article>
  );
});

// ─── Create Form Modal ───────────────────────────────
function CreatePromotionForm({
  isOpen,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<Promotion>) => void;
}) {
  const [form, setForm] = useState({
    title: '',
    lessonType: '개인레슨',
    schedule: '',
    price: '',
    capacity: '',
    location: '',
    description: '',
  });

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!form.title || !form.schedule || !form.price) return;
    onSubmit({
      title: form.title,
      lessonType: form.lessonType,
      schedule: form.schedule,
      price: form.price,
      capacity: parseInt(form.capacity) || 10,
      location: form.location,
      description: form.description,
    });
    setForm({ title: '', lessonType: '개인레슨', schedule: '', price: '', capacity: '', location: '', description: '' });
  };

  const lessonTypes = ['개인레슨', '그룹레슨', '펀하키', '캠프', '정규훈련'];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="홍보 등록">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 cursor-default focus:outline-none"
        onClick={onClose}
        aria-label="닫기"
        tabIndex={-1}
      />
      <div className="relative w-full max-w-lg bg-it-surface dark:bg-rink-900 rounded-t-2xl max-h-[85vh] overflow-y-auto hide-scrollbar">
        {/* 핸들 */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-it-line-strong dark:bg-rink-700 rounded-w-pill" />
        </div>

        <div className="px-6 pb-8">
          <h2 className="text-card-title font-bold text-it-ink-800 dark:text-white mb-5">홍보 등록하기</h2>

          <div className="flex flex-col gap-4">
            {/* 레슨 타입 */}
            <div>
              <label className="block text-card-meta font-bold text-it-ink-800 dark:text-rink-100 mb-2">레슨 타입</label>
              <div className="flex gap-2 flex-wrap">
                {lessonTypes.map(type => (
                  <button
                    key={type}
                    onClick={() => setForm(prev => ({ ...prev, lessonType: type }))}
                    className={cn(
                      'h-9 px-4 rounded-w-pill text-[14px] font-bold transition-colors border-[1.5px]',
                      form.lessonType === type
                        ? 'bg-it-blue-500 text-white border-it-blue-500'
                        : 'bg-it-surface dark:bg-rink-800 text-it-ink-600 dark:text-rink-100 border-it-line-strong dark:border-rink-700'
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* 제목 */}
            <div>
              <label className="block text-card-meta font-bold text-it-ink-800 dark:text-rink-100 mb-1.5">제목</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="예: 주말 기초 스케이팅 클래스"
                className="w-full px-4 py-3 bg-it-fill dark:bg-rink-800 border-[1.5px] border-it-line-strong dark:border-rink-700 rounded-w-md text-[15px] font-medium text-it-ink-800 dark:text-white placeholder:text-it-ink-400 focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500"
              />
            </div>

            {/* 일정 */}
            <div>
              <label className="block text-card-meta font-bold text-it-ink-800 dark:text-rink-100 mb-1.5">일정</label>
              <input
                type="text"
                value={form.schedule}
                onChange={(e) => setForm(prev => ({ ...prev, schedule: e.target.value }))}
                placeholder="예: 매주 토 10:00-12:00"
                className="w-full px-4 py-3 bg-it-fill dark:bg-rink-800 border-[1.5px] border-it-line-strong dark:border-rink-700 rounded-w-md text-[15px] font-medium text-it-ink-800 dark:text-white placeholder:text-it-ink-400 focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500"
              />
            </div>

            {/* 가격 & 정원 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-card-meta font-bold text-it-ink-800 dark:text-rink-100 mb-1.5">가격</label>
                <input
                  type="text"
                  value={form.price}
                  onChange={(e) => setForm(prev => ({ ...prev, price: e.target.value }))}
                  placeholder="예: 월 200,000원"
                  className="w-full px-4 py-3 bg-it-fill dark:bg-rink-800 border-[1.5px] border-it-line-strong dark:border-rink-700 rounded-w-md text-[15px] font-medium text-it-ink-800 dark:text-white placeholder:text-it-ink-400 focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500"
                />
              </div>
              <div>
                <label className="block text-card-meta font-bold text-it-ink-800 dark:text-rink-100 mb-1.5">정원</label>
                <input
                  type="number"
                  value={form.capacity}
                  onChange={(e) => setForm(prev => ({ ...prev, capacity: e.target.value }))}
                  placeholder="예: 15"
                  className="w-full px-4 py-3 bg-it-fill dark:bg-rink-800 border-[1.5px] border-it-line-strong dark:border-rink-700 rounded-w-md text-[15px] font-medium text-it-ink-800 dark:text-white placeholder:text-it-ink-400 focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500"
                />
              </div>
            </div>

            {/* 장소 */}
            <div>
              <label className="block text-card-meta font-bold text-it-ink-800 dark:text-rink-100 mb-1.5">장소</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm(prev => ({ ...prev, location: e.target.value }))}
                placeholder="예: 목동 아이스링크 메인 A"
                className="w-full px-4 py-3 bg-it-fill dark:bg-rink-800 border-[1.5px] border-it-line-strong dark:border-rink-700 rounded-w-md text-[15px] font-medium text-it-ink-800 dark:text-white placeholder:text-it-ink-400 focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500"
              />
            </div>

            {/* 설명 */}
            <div>
              <label className="block text-card-meta font-bold text-it-ink-800 dark:text-rink-100 mb-1.5">설명</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder={MESSAGES.placeholders.enterClassIntro}
                rows={3}
                className="w-full px-4 py-3 bg-it-fill dark:bg-rink-800 border-[1.5px] border-it-line-strong dark:border-rink-700 rounded-w-md text-[15px] font-medium text-it-ink-800 dark:text-white placeholder:text-it-ink-400 focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500 resize-none"
              />
            </div>

            {/* 액션 */}
            <div className="flex gap-3 pt-2">
              <Button iceTheme variant="outline" size="lg" className="flex-1" onClick={onClose}>
                취소
              </Button>
              <Button iceTheme size="lg" className="flex-1" onClick={handleSubmit}>
                등록하기
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab Filter — brand-anchored underline ───────────
function TabButton({ label, count, isActive, onClick }: { label: string; count: number; isActive: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative h-11 inline-flex items-center gap-1.5 text-card-body font-semibold transition-colors whitespace-nowrap',
        'motion-reduce:transition-none focus:outline-none focus-visible:text-it-blue-500 dark:focus-visible:text-it-blue-300',
        isActive
          ? 'text-it-ink-800 dark:text-white'
          : 'text-it-ink-500 dark:text-rink-300 hover:text-it-ink-800 dark:hover:text-rink-100'
      )}
      aria-pressed={isActive}
    >
      <span className="tracking-tight">{label}</span>
      <span className={cn(
        'text-card-meta font-bold tabular-nums tracking-tight',
        isActive ? 'text-it-blue-500 dark:text-it-blue-300' : 'text-it-ink-500 dark:text-rink-300'
      )}>
        {count}
      </span>
      {isActive && (
        <span
          className="absolute inset-x-0 -bottom-px h-[2px] bg-it-blue-500 dark:bg-it-blue-300 rounded-w-pill"
          aria-hidden="true"
        />
      )}
    </button>
  );
}

// ─── Main Page ───────────────────────────────────────
export default function CoachPromotionsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [isFormOpen, setIsFormOpen] = useState(false);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
    isDataLoaded: !isLoading,
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      setPromotions([
        {
          id: 'pr1',
          title: '주말 기초 스케이팅 클래스 모집',
          lessonType: '그룹레슨',
          schedule: '매주 토 10:00-12:00',
          price: '월 200,000원',
          capacity: 15,
          enrolled: 12,
          location: '목동 아이스링크 메인 A',
          description: '초보자를 위한 기초 스케이팅 수업입니다. 안전장비 무료 대여, 소규모 맞춤 지도로 빠르게 실력을 키울 수 있습니다.',
          viewCount: 234,
          inquiryCount: 8,
          status: 'ACTIVE',
          createdAt: '3일 전',
        },
        {
          id: 'pr2',
          title: '겨울 캠프 특별반',
          lessonType: '캠프',
          schedule: '1/6-1/10 09:00-15:00',
          price: '500,000원 (5일)',
          capacity: 20,
          enrolled: 20,
          location: '과천 아이스링크',
          description: '겨울방학 집중 캠프! 기초부터 슈팅, 패싱, 팀 전술까지 5일간 집중 훈련합니다.',
          viewCount: 567,
          inquiryCount: 23,
          status: 'CLOSED',
          createdAt: '2주 전',
        },
        {
          id: 'pr3',
          title: '1:1 개인레슨 (슈팅 특화)',
          lessonType: '개인레슨',
          schedule: '협의',
          price: '회당 80,000원',
          capacity: 5,
          enrolled: 3,
          location: '메인 링크 B',
          description: '슈팅 기술 향상을 위한 1:1 맞춤 레슨입니다. 시간 협의 가능합니다.',
          viewCount: 128,
          inquiryCount: 5,
          status: 'ACTIVE',
          createdAt: '1주 전',
        },
        {
          id: 'pr4',
          title: '토요 펀하키 (자유 연습)',
          lessonType: '펀하키',
          schedule: '매주 토 16:00-18:00',
          price: '회당 30,000원',
          capacity: 30,
          enrolled: 18,
          location: '메인 링크 A',
          description: '자유롭게 즐기는 아이스하키! 초보부터 경험자까지 모두 환영합니다.',
          viewCount: 345,
          inquiryCount: 12,
          status: 'ACTIVE',
          createdAt: '5일 전',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = useCallback((data: Partial<Promotion>) => {
    toast.success(MESSAGES.save.success);
    setIsFormOpen(false);
    fetchData();
  }, [toast, fetchData]);

  const handleEdit = useCallback((id: string) => {
    // 편집 페이지로 이동하거나 모달 열기
  }, []);


  const filtered = promotions.filter(p => {
    if (activeTab === 'active') return p.status === 'ACTIVE';
    if (activeTab === 'closed') return p.status !== 'ACTIVE';
    return true;
  });

  const counts = {
    all: promotions.length,
    active: promotions.filter(p => p.status === 'ACTIVE').length,
    closed: promotions.filter(p => p.status !== 'ACTIVE').length,
  };

  // 통계
  const totalViews = promotions.reduce((sum, p) => sum + p.viewCount, 0);
  const totalInquiries = promotions.reduce((sum, p) => sum + p.inquiryCount, 0);

  return (
    <MobileContainer hasBottomNav>
      {/* AppBar — + 제거, 햄버거 메뉴만 유지 */}
      <SubmainAppBar title="홍보 관리" />

      <main className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck pb-30">
        {/* ─── 요약 통계 — navy 히어로 full-bleed ─── */}
        <section className="bg-it-blue-800 dark:bg-it-blue-950 px-5 pt-6 pb-6 grid grid-cols-3 gap-3" aria-label="홍보 통계 요약">
          {[
            { label: '게시물', value: promotions.length, icon: 'campaign' },
            { label: '조회수', value: totalViews, icon: 'visibility' },
            { label: '문의', value: totalInquiries, icon: 'forum' },
          ].map(stat => (
            <div key={stat.label}>
              {/* 숫자를 먼저 — hero number */}
              <p className="text-[28px] font-extrabold text-white tabular-nums tracking-tight leading-none">
                {stat.value.toLocaleString()}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-card-meta font-bold text-white/60 uppercase tracking-[0.14em]">
                  {stat.label}
                </span>
                <Icon
                  name={stat.icon}
                  className="text-card-body text-white/40"
                  aria-hidden="true"
                />
              </div>
            </div>
          ))}
        </section>

        {/* ─── 탭 + 목록 — flat 흰 섹션 ─── */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
          {/* 탭 필터 — underline 스타일 */}
          <div
            className="flex items-center gap-6 px-4 sm:px-5 border-b border-it-line dark:border-rink-800 overflow-x-auto hide-scrollbar"
            role="tablist"
            aria-label="홍보 상태 필터"
          >
            <TabButton label="전체" count={counts.all} isActive={activeTab === 'all'} onClick={() => setActiveTab('all')} />
            <TabButton label="게시중" count={counts.active} isActive={activeTab === 'active'} onClick={() => setActiveTab('active')} />
            <TabButton label="마감" count={counts.closed} isActive={activeTab === 'closed'} onClick={() => setActiveTab('closed')} />
          </div>

          {/* 홍보 목록 — hairline 행 */}
          <div role="list" aria-label="홍보 게시물 목록">
            {isLoading ? null : filtered.length > 0 ? (
              filtered.map(promo => (
                <div key={promo.id} role="listitem">
                  <PromotionCard promo={promo} onEdit={handleEdit} />
                </div>
              ))
            ) : (
              // ─── Empty State — 절제된 pure icon + brand CTA ───
              <div className="flex flex-col items-center justify-center py-24 px-5 text-center">
                <Icon
                  name="campaign"
                  className="text-w-display text-it-ink-300 dark:text-wtext-2 mb-5"
                  aria-hidden="true"
                />
                <h3 className="text-card-body font-bold text-it-ink-800 dark:text-rink-100 mb-2 tracking-tight">
                  등록된 홍보가 없습니다
                </h3>
                <p className="text-card-meta text-it-ink-500 dark:text-rink-300 mb-6 leading-[1.6] max-w-[250px]">
                  레슨, 캠프, 펀하키 등을 홍보하여
                  <br />
                  회원과 학부모에게 알려보세요
                </p>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(true)}
                  className="h-10 px-5 rounded-w-pill bg-it-blue-500 hover:bg-it-blue-600 text-white text-card-meta font-bold transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
                >
                  첫 홍보 등록하기
                </button>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* ─── FAB — 홍보 등록 ─── */}
      <button
        type="button"
        onClick={() => setIsFormOpen(true)}
        className="fixed bottom-24 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-w-pill bg-it-blue-500 text-white shadow-sh-2 hover:bg-it-blue-600 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
        aria-label="홍보 등록"
      >
        <Icon name="add" className="text-[28px]" aria-hidden="true" />
      </button>

      {/* 홍보 등록 폼 */}
      <CreatePromotionForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleCreate}
      />
    </MobileContainer>
  );
}
