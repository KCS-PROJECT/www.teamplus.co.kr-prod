import {
  Users,
  CalendarDays,
  ScanLine,
  CreditCard,
  BellRing,
  ShoppingBag,
  Trophy,
  MessageCircle,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { ACCENT_CLASSES, cn, type Accent } from '@/lib/utils';

const ICON_MAP: Record<string, LucideIcon> = {
  users: Users,
  calendar: CalendarDays,
  qr: ScanLine,
  card: CreditCard,
  bell: BellRing,
  shop: ShoppingBag,
  trophy: Trophy,
  chat: MessageCircle,
};

type Props = {
  name: string;
  accent: Accent;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

/**
 * Feature icon — DESIGN.md SoT 준수 라이트 카드 친화 아이콘
 * - backdrop-blur 제거 (RULE-1)
 * - 컬러 그림자 제거 (RULE-1)
 * - 단순 ring + bg 조합으로 정보 위계 구성
 */
export function FeatureIcon({ name, accent, size = 'md', className }: Props) {
  const Icon = ICON_MAP[name] ?? Sparkles;
  const a = ACCENT_CLASSES[accent];
  const dims = {
    sm: 'h-10 w-10',
    md: 'h-12 w-12',
    lg: 'h-14 w-14',
  }[size];
  const iconSize = { sm: 18, md: 22, lg: 26 }[size];

  return (
    <div
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-2xl ring-1',
        dims,
        a.bg,
        a.ring,
        className,
      )}
    >
      <Icon size={iconSize} className={cn('relative', a.text)} strokeWidth={1.7} />
    </div>
  );
}
