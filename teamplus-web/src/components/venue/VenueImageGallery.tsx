'use client';

/**
 * VenueImageGallery — 시설 둘러보기 가로 스크롤 갤러리
 * - 목업 3 (장소 상세) "시설 둘러보기" 섹션 구현
 * - 사진 미배치 구장은 정적 플레이스홀더 4장 렌더
 */

import Image from 'next/image';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';

interface VenueImageGalleryProps {
  images?: (string | null)[];
  title?: string;
  className?: string;
}

const PLACEHOLDERS = [
  'https://images.unsplash.com/photo-1515703407324-5f753afd8be8?w=400&h=280&fit=crop',
  'https://images.unsplash.com/photo-1580748141549-71748dbe0bdc?w=400&h=280&fit=crop',
  'https://images.unsplash.com/photo-1520034475321-cbe63696469a?w=400&h=280&fit=crop',
  'https://images.unsplash.com/photo-1569336415962-a4bd9f69cd83?w=400&h=280&fit=crop',
];

export function VenueImageGallery({
  images,
  title = MESSAGES.venue.actions.viewAll,
  className,
}: VenueImageGalleryProps) {
  const valid = (images ?? []).filter((u): u is string => typeof u === 'string' && u.length > 0);
  const displayImages = valid.length > 0 ? valid : PLACEHOLDERS;

  return (
    <section
      className={cn('py-6', className)}
      aria-label={MESSAGES.venue.facilities.galleryTitle}
    >
      <div className="flex items-center justify-between px-5 mb-4">
        <h2 className="text-card-section text-wtext-1 dark:text-white">
          {MESSAGES.venue.facilities.galleryTitle}
        </h2>
        <button
          type="button"
          className="text-card-emphasis font-semibold text-ice-500 dark:text-blue-300 flex items-center gap-0.5 hover:underline"
        >
          {title}
          <Icon name="chevron_right" className="text-[16px]" aria-hidden="true" />
        </button>
      </div>
      <div
        className="flex overflow-x-auto gap-3 px-5 pb-3 snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none' }}
      >
        {displayImages.map((src, idx) => (
          <div
            key={`${src}-${idx}`}
            className="relative w-44 h-28 rounded-xl overflow-hidden shadow ring-1 ring-wline dark:ring-rink-700 flex-shrink-0 snap-start bg-wline-2 dark:bg-rink-800"
          >
            <Image
              src={src}
              alt={`시설 사진 ${idx + 1}`}
              fill
              sizes="176px"
              className="object-cover"
              unoptimized
            />
          </div>
        ))}
      </div>
    </section>
  );
}

export default VenueImageGallery;
