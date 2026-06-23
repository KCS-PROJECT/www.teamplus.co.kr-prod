'use client';

import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { resolveImageSrc } from '@/lib/image-url';

interface NextClassCardProps {
  tag: string;
  title: string;
  time: string;
  teacher: string;
  imageUrl?: string;
  href?: string;
}

export function NextClassCard({ tag, title, time, teacher, imageUrl, href = '/classes/1' }: NextClassCardProps) {
  return (
    <NavLink href={href}>
      <div className="relative overflow-hidden rounded-xl bg-white dark:bg-rink-800 shadow-sm border border-wline-2 dark:border-rink-700 hover:shadow-md transition-shadow duration-200 ease-out cursor-pointer transform-gpu will-change-transform">
        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-ice-500 h-full" />

        <div className="flex items-center p-4 pl-5 gap-4">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-wline-2 dark:bg-rink-700">
            {resolveImageSrc(imageUrl) ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={resolveImageSrc(imageUrl)}
                alt={title}
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <Icon name="ice_skating" className="text-3xl text-ice-500/60" aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col justify-center gap-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-teal-50 dark:bg-teal-900/30 px-2 py-0.5 text-card-meta font-bold !text-ice-500 ring-1 ring-inset ring-teal-600/20">
                {tag}
              </span>
              <h4 className="text-card-title leading-tight line-clamp-1">
                {title}
              </h4>
            </div>
            <div className="flex items-center gap-1.5">
              <Icon name="schedule" className="text-[16px]" aria-hidden="true" />
              <span className="text-card-body font-medium">{time}</span>
              <span className="text-wtext-4 mx-0.5">•</span>
              <span className="text-card-body font-medium">{teacher}</span>
            </div>
          </div>

          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-wbg dark:bg-rink-700 text-wtext-3 hover:bg-ice-500/10 hover:text-ice-500 transition-colors">
            <Icon name="chevron_right" aria-hidden="true" />
          </div>
        </div>
      </div>
    </NavLink>
  );
}
