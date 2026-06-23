'use client';

import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

interface BannerLinkProps {
  href: string;
  title: string;
  description: string;
  icon: string;
  className?: string;
  iconClassName?: string;
}

export function BannerLink({ 
  href, 
  title, 
  description, 
  icon, 
  className,
  iconClassName 
}: BannerLinkProps) {
  return (
    <NavLink
      href={href}
      className={cn(
        "block bg-ice-500 hover:bg-ice-700 rounded-2xl p-5 shadow-md transition-all active:brightness-95 group",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={cn(
            "w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center group-hover:bg-white/30 transition-colors",
            iconClassName
          )}>
            <Icon name={icon} className="text-white text-2xl" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">
              {title}
            </h3>
            <p className="text-sm text-white/80">
              {description}
            </p>
          </div>
        </div>
        <Icon
          name="arrow_forward"
          className="text-white/70 group-hover:text-white group-hover:translate-x-1 transition-all"
          aria-hidden="true"
        />
      </div>
    </NavLink>
  );
}
