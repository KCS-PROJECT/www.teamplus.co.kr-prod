'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/services/api-client';

import { usePageReady } from '@/hooks/usePageReady';
interface PremiumEventItem {
  id: string;
  title: string;
  subtitle?: string | null;
  description: string;
  eventDate: string;
  venueName: string;
  venueAddress?: string | null;
  benefitsJson?: unknown;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  imageUrl?: string | null;
}

function isSafeUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /^(https?:\/\/|\/)/.test(url);
}

function formatEventDate(dateValue: string | undefined): string {
  if (!dateValue) return '-';

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return '-';

  const year = parsed.getFullYear();
  const month = parsed.getMonth() + 1;
  const date = parsed.getDate();
  return `${year}년 ${month}월 ${date}일`;
}

function extractBenefits(benefitsJson: unknown): string[] {
  if (!Array.isArray(benefitsJson)) return [];
  return benefitsJson
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export default function PremiumEventPage() {
  const [eventData, setEventData] = useState<PremiumEventItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadPremiumEvent = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await api.get<PremiumEventItem | PremiumEventItem[] | null>('/app/premium-events/featured');

      if (!res.success) {
        setErrorMessage(res.error?.message ?? '이벤트 정보를 불러오지 못했습니다.');
        setEventData(null);
        return;
      }

      const payload = res.data;
      if (!payload) {
        setEventData(null);
        return;
      }

      const nextItem = Array.isArray(payload) ? payload[0] ?? null : payload;
      setEventData(nextItem);
    } catch {
      setErrorMessage('이벤트 정보를 불러오는 중 오류가 발생했습니다.');
      setEventData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPremiumEvent();
  }, [loadPremiumEvent]);

  const benefits = useMemo(
    () => extractBenefits(eventData?.benefitsJson),
    [eventData?.benefitsJson],
  );

  const handleApply = () => {
    if (!eventData?.ctaUrl || !isSafeUrl(eventData.ctaUrl)) return;

    if (eventData.ctaUrl.startsWith('http://') || eventData.ctaUrl.startsWith('https://')) {
      window.open(eventData.ctaUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    window.location.href = eventData.ctaUrl;
  };

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar showBack={false} title="프리미엄 이벤트" showMenu />
      <main className="flex-1 overflow-y-auto px-5 py-6">
        <div className="space-y-4">
          {!isLoading && eventData && (
            <>
              <Card className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ice-500/10 text-ice-500">
                    <Icon name="emoji_events" className="text-2xl" />
                  </div>
                  <div>
                    <p className="text-w-small font-semibold text-wtext-3">
                      {eventData.subtitle || '프리미엄 이벤트'}
                    </p>
                    <h2 className="text-xl font-bold text-wtext-1">{eventData.title}</h2>
                  </div>
                </div>
                <p className="text-w-small text-wtext-2">{eventData.description}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-wbg p-3 text-center">
                    <p className="text-w-caption text-wtext-3">일정</p>
                    <p className="text-w-small font-semibold text-wtext-2">
                      {formatEventDate(eventData.eventDate)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-wbg p-3 text-center">
                    <p className="text-w-caption text-wtext-3">장소</p>
                    <p className="text-w-small font-semibold text-wtext-2">
                      {eventData.venueName}
                    </p>
                  </div>
                </div>
                {eventData.venueAddress && (
                  <p className="text-w-caption text-wtext-3">{eventData.venueAddress}</p>
                )}
              </Card>

              <Card className="space-y-3">
                <h3 className="text-w-small font-semibold text-wtext-2">포함 혜택</h3>
                {benefits.length > 0 ? (
                  <ul className="space-y-2 text-w-small text-wtext-2">
                    {benefits.map((benefit, index) => (
                      <li key={`${benefit}-${index}`} className="flex items-center gap-2">
                        <Icon name="check_circle" className="text-w-body-lg text-ice-500" />
                        {benefit}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-w-small text-wtext-3">등록된 혜택 정보가 없습니다.</p>
                )}
              </Card>

              <Button
                className="w-full"
                disabled={!eventData.ctaUrl || !isSafeUrl(eventData.ctaUrl)}
                onClick={handleApply}
              >
                {eventData.ctaLabel || '이벤트 신청하기'}
              </Button>
            </>
          )}

          {!isLoading && !eventData && (
            <Card className="space-y-3 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-wline-2 text-wtext-3 dark:bg-rink-800 dark:text-rink-300">
                <Icon name="event_busy" className="text-2xl" />
              </div>
              <h2 className="text-w-title font-semibold text-wtext-1 dark:text-white">
                진행 중인 이벤트가 없습니다.
              </h2>
              <p className="text-w-small text-wtext-3 dark:text-rink-300">
                새로운 프리미엄 이벤트가 등록되면 이 화면에서 확인하실 수 있습니다.
              </p>
              {errorMessage && (
                <p className="text-w-caption text-red-500">{errorMessage}</p>
              )}
              <Button variant="outline" className="w-full" onClick={() => void loadPremiumEvent()}>
                다시 불러오기
              </Button>
            </Card>
          )}
        </div>
      </main>
    </MobileContainer>
  );
}
