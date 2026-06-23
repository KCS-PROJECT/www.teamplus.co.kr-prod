'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { MESSAGES } from '@/lib/messages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import { menuService, AppMenu } from '@/services/menu.service';
import {
  APP_MENU_USER_TYPES,
  getAppMenuSpec,
  type AppMenuUserType,
} from '@shared/constants/app-menu-spec';
import {
  type LucideIcon,
  Menu,
  Plus,
  Trash2,
  Edit3,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  RefreshCw,
  FolderOpen,
  Layers,
  AlignLeft,
  RotateCcw,
  Save,
  Undo2,
  // ─── Spec 아이콘 풀 (Lucide kebab-case → PascalCase) ───
  Activity,
  Badge as BadgeIcon,
  BarChart2,
  BookOpen,
  Building2,
  Calendar,
  CalendarCheck,
  CheckCircle,
  CheckCircle2,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  Clock,
  CreditCard,
  Dumbbell,
  FileText,
  Gift,
  Globe,
  Grid3x3,
  GripVertical,
  HelpCircle,
  Home,
  Image as ImageIcon,
  LayoutTemplate,
  List,
  MapPin,
  Medal,
  Megaphone,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Package,
  Plane,
  PlusCircle,
  QrCode,
  Receipt,
  Settings,
  Shield,
  Star,
  Swords,
  Tag,
  Trophy,
  User,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';

// ─── 타입 ────────────────────────────────────────
interface MenuL3 extends AppMenu { children?: AppMenu[] }
interface MenuL2 extends AppMenu { children: MenuL3[] }
interface MenuL1 extends AppMenu { children: MenuL2[] }

type MenuLevel = 1 | 2 | 3;

// ─── 상수 ────────────────────────────────────────
/**
 * UI 탭 값 — DB enum + 가상 'STUDENT' 통합 탭.
 * STUDENT 탭은 TEEN 데이터를 표시하고 저장 시 TEEN/CHILD 양쪽에 동시 적용된다.
 */
type MenuTabValue = AppMenuUserType | 'STUDENT';

// [수정 2026-04-30] 사용자 요청 — 앱관리자(ADMIN)을 마지막으로 배치
const userTypes: { value: MenuTabValue; label: string; color: string }[] = [
  { value: 'DIRECTOR',         label: '감독',           color: 'bg-orange-500' },
  { value: 'ACADEMY_DIRECTOR', label: '오픈클래스 감독',  color: 'bg-amber-500' },
  { value: 'COACH',            label: '코치',           color: 'bg-yellow-500' },
  { value: 'PARENT',           label: '학부모',         color: 'bg-green-500' },
  { value: 'STUDENT',          label: '학생',           color: 'bg-blue-500' },
  { value: 'ADMIN',            label: '앱관리자',       color: 'bg-red-500' },
];

void APP_MENU_USER_TYPES;

/** UI 탭 → 실제 DB GET/SAVE 시 사용할 user_type 으로 변환 (STUDENT → TEEN). */
function tabToUserType(tab: MenuTabValue): AppMenuUserType {
  return tab === 'STUDENT' ? 'TEEN' : (tab as AppMenuUserType);
}

const LEVEL_META: Record<MenuLevel, {
  label: string;
  badge: string;
  rowBg: string;
  rowHover: string;
  rowAccent: string;
  icon: LucideIcon;
  iconWrap: string;
}> = {
  // 2026-05-08: web GlobalMenu 와 정합 — 2단계 (대분류 → 메뉴 항목) 만 사용.
  // level=3 (소분류) 는 더 이상 노출하지 않음. 기존 데이터 호환을 위해 정의는 유지.
  1: {
    label: '대분류',
    badge: 'bg-slate-700 text-white dark:bg-slate-500',
    rowBg: 'bg-slate-50/90 dark:bg-slate-800/70',
    rowHover: 'hover:bg-slate-100/90 dark:hover:bg-slate-700/60',
    rowAccent: 'border-l-slate-400 dark:border-l-slate-500',
    icon: FolderOpen,
    iconWrap: 'bg-slate-100 border-slate-200 text-slate-600 dark:bg-slate-700/80 dark:border-slate-600 dark:text-slate-200',
  },
  2: {
    label: '메뉴 항목',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    rowBg: 'bg-white dark:bg-slate-800',
    rowHover: 'hover:bg-blue-50/70 dark:hover:bg-slate-700/60',
    rowAccent: 'border-l-blue-300 dark:border-l-blue-500',
    icon: Layers,
    iconWrap: 'bg-blue-50 border-blue-100 text-blue-600 dark:bg-blue-900/30 dark:border-blue-700/70 dark:text-blue-300',
  },
  3: {
    label: '메뉴 항목',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    rowBg: 'bg-slate-50/70 dark:bg-slate-800/40',
    rowHover: 'hover:bg-emerald-50/60 dark:hover:bg-slate-700/55',
    rowAccent: 'border-l-emerald-300 dark:border-l-emerald-500',
    icon: AlignLeft,
    iconWrap: 'bg-emerald-50 border-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:border-emerald-700/70 dark:text-emerald-300',
  },
};

/**
 * value = Lucide kebab-case 아이콘명 (DB / web spec / Icon 컴포넌트와 동일)
 * Icon = admin 미리보기용 lucide-react 컴포넌트
 */
const iconOptions: { value: string; label: string; Icon: LucideIcon }[] = [
  { value: 'activity',         label: '활동',         Icon: Activity },
  { value: 'badge',            label: '뱃지',         Icon: BadgeIcon },
  { value: 'bar-chart-2',      label: '통계',         Icon: BarChart2 },
  { value: 'book-open',        label: '수업',         Icon: BookOpen },
  { value: 'building-2',       label: '경기장',       Icon: Building2 },
  { value: 'calendar',         label: '일정',         Icon: Calendar },
  { value: 'calendar-check',   label: 'RSVP',         Icon: CalendarCheck },
  { value: 'check-circle',     label: '체크',         Icon: CheckCircle },
  { value: 'check-circle-2',   label: '완료',         Icon: CheckCircle2 },
  { value: 'check-square',     label: '출석 기록',    Icon: CheckSquare },
  { value: 'clipboard-check',  label: '출석 확인',    Icon: ClipboardCheck },
  { value: 'clipboard-list',   label: '체크리스트',   Icon: ClipboardList },
  { value: 'clock',            label: '시간',         Icon: Clock },
  { value: 'credit-card',      label: '결제',         Icon: CreditCard },
  { value: 'dumbbell',         label: '훈련',         Icon: Dumbbell },
  { value: 'edit-3',           label: '편집',         Icon: Edit3 },
  { value: 'file-text',        label: '약관',         Icon: FileText },
  { value: 'gift',             label: '선물',         Icon: Gift },
  { value: 'globe',            label: '공개',         Icon: Globe },
  { value: 'grid',             label: '주간 일정',    Icon: Grid3x3 },
  { value: 'grip-vertical',    label: '드래그',       Icon: GripVertical },
  { value: 'help-circle',      label: '도움말',       Icon: HelpCircle },
  { value: 'home',             label: '홈',           Icon: Home },
  { value: 'image',            label: '이미지',       Icon: ImageIcon },
  { value: 'layout-template',  label: '팝업',         Icon: LayoutTemplate },
  { value: 'list',             label: '목록',         Icon: List },
  { value: 'layers',           label: '그룹/계층',    Icon: Layers },
  { value: 'map-pin',          label: '구장 정보',    Icon: MapPin },
  { value: 'medal',            label: '리그',         Icon: Medal },
  { value: 'megaphone',        label: '공지사항',     Icon: Megaphone },
  { value: 'message-circle',   label: '메시지',       Icon: MessageCircle },
  { value: 'message-square',   label: '상담',         Icon: MessageSquare },
  { value: 'more-horizontal',  label: '기타',         Icon: MoreHorizontal },
  { value: 'package',          label: '재고',         Icon: Package },
  { value: 'plane',            label: '해외 원정',    Icon: Plane },
  { value: 'plus-circle',      label: '신규 추가',    Icon: PlusCircle },
  { value: 'qr-code',          label: 'QR 코드',      Icon: QrCode },
  { value: 'receipt',          label: '영수증',       Icon: Receipt },
  { value: 'settings',         label: '설정',         Icon: Settings },
  { value: 'shield',           label: '코치/관리',    Icon: Shield },
  { value: 'star',             label: '스티커',       Icon: Star },
  { value: 'swords',           label: '경기/매치',    Icon: Swords },
  { value: 'tag',              label: '프로모션',     Icon: Tag },
  { value: 'trophy',           label: '대회',         Icon: Trophy },
  { value: 'user',             label: '내 정보',      Icon: User },
  { value: 'user-check',       label: '승인',         Icon: UserCheck },
  { value: 'user-plus',        label: '회원 등록',    Icon: UserPlus },
  { value: 'users',            label: '회원',         Icon: Users },
  { value: 'wallet',           label: '크레딧',       Icon: Wallet },
  { value: 'menu',             label: '메뉴(기본)',   Icon: Menu },
];

// ─── 임시 ID (저장 전 신규 노드 식별용) ──────────
let tempIdCounter = 0;
function newTempId(): string {
  tempIdCounter += 1;
  return `temp:${Date.now()}-${tempIdCounter}`;
}

// ─── 트리 헬퍼 (메모리 mutation) ──────────────────
function mapTreeNodes(tree: MenuL1[], fn: (m: AppMenu) => AppMenu): MenuL1[] {
  return tree.map((l1) => {
    const newL1 = fn(l1) as MenuL1;
    return {
      ...newL1,
      children: (l1.children ?? []).map((l2) => {
        const newL2 = fn(l2) as MenuL2;
        return {
          ...newL2,
          children: (l2.children ?? []).map((l3) => fn(l3) as MenuL3),
        };
      }),
    };
  });
}

function deleteFromTree(tree: MenuL1[], id: string): MenuL1[] {
  return tree
    .filter((l1) => l1.id !== id)
    .map((l1, i) => ({
      ...l1,
      order: i + 1,
      children: (l1.children ?? [])
        .filter((l2) => l2.id !== id)
        .map((l2, j) => ({
          ...l2,
          order: j + 1,
          children: (l2.children ?? [])
            .filter((l3) => l3.id !== id)
            .map((l3, k) => ({ ...l3, order: k + 1 })),
        })),
    }));
}

function moveInTree(tree: MenuL1[], id: string, dir: 'up' | 'down'): MenuL1[] {
  // L1
  const l1Idx = tree.findIndex((l1) => l1.id === id);
  if (l1Idx >= 0) {
    const target = dir === 'up' ? l1Idx - 1 : l1Idx + 1;
    if (target < 0 || target >= tree.length) return tree;
    const arr = [...tree];
    [arr[l1Idx], arr[target]] = [arr[target], arr[l1Idx]];
    return arr.map((m, i) => ({ ...m, order: i + 1 }));
  }
  // L2
  for (const l1 of tree) {
    const l2Idx = (l1.children ?? []).findIndex((l2) => l2.id === id);
    if (l2Idx >= 0) {
      const children = l1.children ?? [];
      const target = dir === 'up' ? l2Idx - 1 : l2Idx + 1;
      if (target < 0 || target >= children.length) return tree;
      const newChildren = [...children];
      [newChildren[l2Idx], newChildren[target]] = [newChildren[target], newChildren[l2Idx]];
      return tree.map((m) =>
        m.id === l1.id
          ? { ...m, children: newChildren.map((c, i) => ({ ...c, order: i + 1 })) }
          : m,
      );
    }
    // L3
    for (const l2 of l1.children ?? []) {
      const l3Idx = (l2.children ?? []).findIndex((l3) => l3.id === id);
      if (l3Idx >= 0) {
        const children = l2.children ?? [];
        const target = dir === 'up' ? l3Idx - 1 : l3Idx + 1;
        if (target < 0 || target >= children.length) return tree;
        const newChildren = [...children];
        [newChildren[l3Idx], newChildren[target]] = [newChildren[target], newChildren[l3Idx]];
        return tree.map((m1) =>
          m1.id === l1.id
            ? {
                ...m1,
                children: (m1.children ?? []).map((m2) =>
                  m2.id === l2.id
                    ? {
                        ...m2,
                        children: newChildren.map((c, i) => ({ ...c, order: i + 1 })),
                      }
                    : m2,
                ),
              }
            : m1,
        );
      }
    }
  }
  return tree;
}

function insertInTree(
  tree: MenuL1[],
  newNode: AppMenu,
  parentId: string | null,
  level: MenuLevel,
): MenuL1[] {
  if (level === 1) {
    const fresh: MenuL1 = {
      ...(newNode as MenuL1),
      order: tree.length + 1,
      parentId: null,
      children: [],
    };
    return [...tree, fresh];
  }
  if (level === 2) {
    return tree.map((l1) =>
      l1.id === parentId
        ? {
            ...l1,
            children: [
              ...(l1.children ?? []),
              {
                ...(newNode as MenuL2),
                order: (l1.children ?? []).length + 1,
                parentId: l1.id,
                children: [],
              },
            ],
          }
        : l1,
    );
  }
  // level === 3
  return tree.map((l1) => ({
    ...l1,
    children: (l1.children ?? []).map((l2) =>
      l2.id === parentId
        ? {
            ...l2,
            children: [
              ...(l2.children ?? []),
              {
                ...(newNode as MenuL3),
                order: (l2.children ?? []).length + 1,
                parentId: l2.id,
              },
            ],
          }
        : l2,
    ),
  }));
}

// ─── 아이콘 렌더링 헬퍼 ──────────────────────────
function RenderIcon({ name, className }: { name: string; className?: string }) {
  const opt = iconOptions.find((o) => o.value === name);
  const Icon = opt?.Icon ?? Menu;
  return <Icon className={className ?? 'w-4 h-4'} />;
}

// ─── 메뉴 행 컴포넌트 ────────────────────────────
function MenuRow({
  menu,
  level,
  siblings: _siblings,
  onEdit,
  onDelete,
  onToggle,
  onMoveUp,
  onMoveDown,
  onAddChild,
  isFirst,
  isLast,
  hasChildren,
  isExpanded,
  onToggleExpand,
}: {
  menu: AppMenu;
  level: MenuLevel;
  siblings: AppMenu[];
  onEdit: (m: AppMenu) => void;
  onDelete: (id: string) => void;
  onToggle: (m: AppMenu) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddChild?: () => void;
  isFirst: boolean;
  isLast: boolean;
  hasChildren?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}) {
  const meta = LEVEL_META[level];
  const iconButtonBaseClass = 'inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent transition-colors';

  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 border-b border-slate-100 px-6 py-3.5 transition-colors dark:border-slate-700/60',
        meta.rowBg,
        meta.rowHover,
        !menu.isActive && 'opacity-60',
      )}
    >
      <div className={cn(
        'w-56 shrink-0 flex items-center gap-2',
        level === 1 ? 'pl-8' : level === 2 ? 'pl-14' : 'pl-20',
      )}>
        {level > 1 && <span className="text-slate-300 dark:text-slate-600 text-xs font-bold select-none shrink-0">L</span>}

        <div className={cn('p-1 rounded-md border shrink-0',
          level === 1 ? 'bg-slate-100 border-slate-200 text-slate-600' :
          level === 2 ? 'bg-blue-50 border-blue-100 text-blue-600' :
          'bg-emerald-50 border-emerald-100 text-emerald-600',
        )}>
          <meta.icon className="w-3.5 h-3.5" />
        </div>

        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0', meta.badge)}>{meta.label}</span>

        {hasChildren && (
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={isExpanded ? '하위 메뉴 접기' : '하위 메뉴 펼치기'}
            className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-transparent hover:border-slate-200 hover:bg-white dark:hover:border-slate-600 dark:hover:bg-slate-700 transition-colors shrink-0 ml-auto"
          >
            <ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} aria-hidden="true" />
          </button>
        )}
      </div>

      <span className="w-16 shrink-0 text-center">
        <span className="inline-flex min-w-[28px] justify-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 tabular-nums dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">
          {menu.order}
        </span>
      </span>

      <div className="w-16 shrink-0 flex justify-center">
        <div className={cn('w-9 h-9 rounded-xl border flex items-center justify-center', meta.iconWrap)}>
          <RenderIcon name={menu.icon} className="w-4 h-4" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <p className={`font-semibold truncate text-sm leading-5 ${menu.isActive ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
          {menu.label}
        </p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate font-mono mt-1">{menu.href}</p>
      </div>

      <div className="w-52 shrink-0 flex items-center justify-center gap-1.5">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          aria-label="위로 이동"
          className={cn(iconButtonBaseClass, 'hover:border-slate-200 hover:bg-white dark:hover:border-slate-600 dark:hover:bg-slate-700 disabled:opacity-30')}
          title="위로 이동"
        >
          <ChevronUp className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          aria-label="아래로 이동"
          className={cn(iconButtonBaseClass, 'hover:border-slate-200 hover:bg-white dark:hover:border-slate-600 dark:hover:bg-slate-700 disabled:opacity-30')}
          title="아래로 이동"
        >
          <ChevronDown className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
        </button>

        {/* 2026-05-08: 자식 추가는 대분류(level=1) 에만 허용. web GlobalMenu 와 정합한 2단계 구조 유지. */}
        {onAddChild && level === 1 && (
          <button
            type="button"
            onClick={onAddChild}
            className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-700/70 dark:bg-blue-900/25 dark:text-blue-300 dark:hover:bg-blue-900/40 whitespace-nowrap"
          >
            <Plus className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>메뉴 항목</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => onToggle(menu)}
          aria-label={menu.isActive ? '비활성화' : '활성화'}
          className={cn(
            iconButtonBaseClass,
            menu.isActive
              ? 'text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:border-emerald-700/70 dark:hover:bg-emerald-900/20'
              : 'text-slate-400 hover:border-slate-200 hover:bg-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-700',
          )}
          title={menu.isActive ? '비활성화' : '활성화'}
        >
          {menu.isActive ? <Eye className="w-4 h-4" aria-hidden="true" /> : <EyeOff className="w-4 h-4" aria-hidden="true" />}
        </button>

        <button
          type="button"
          onClick={() => onEdit(menu)}
          aria-label="수정"
          className={cn(iconButtonBaseClass, 'text-slate-400 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 dark:hover:border-blue-700/70 dark:hover:bg-blue-900/20 dark:hover:text-blue-300')}
          title="수정"
        >
          <Edit3 className="w-4 h-4" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => onDelete(menu.id)}
          aria-label="삭제"
          className={cn(iconButtonBaseClass, 'text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:border-red-700/70 dark:hover:bg-red-900/20')}
          title="삭제"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// ─── 메인 페이지 ─────────────────────────────────
export default function AppMenusPage() {
  const [isLoading, setIsLoading]         = useState(true);
  const [isSaving, setIsSaving]           = useState(false);
  // [수정 2026-04-30] 기본 선택 ADMIN → DIRECTOR (사용 빈도 높은 탭 우선)
  const [selectedUserType, setSelectedUserType] = useState<MenuTabValue>('DIRECTOR');
  const [tree, setTree]                   = useState<MenuL1[]>([]);
  const [isDirty, setIsDirty]             = useState(false);
  const [isModalOpen, setIsModalOpen]     = useState(false);
  const [editingMenu, setEditingMenu]     = useState<Partial<AppMenu> | null>(null);
  const [addingLevel, setAddingLevel]     = useState<MenuLevel>(1);
  const [addingParentId, setAddingParentId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds]     = useState<Set<string>>(new Set());
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // ── 데이터 로드 ──────────────────────────────
  const loadMenus = useCallback(async (tab: MenuTabValue) => {
    setIsLoading(true);
    try {
      const realUserType = tabToUserType(tab);
      const raw = await menuService.getMenus(realUserType) as unknown;
      // 응답이 배열이 아닐 경우(예: 페이지네이션 객체, null, 에러 래퍼) flatMap 런타임 에러 방지
      const data: MenuL1[] = Array.isArray(raw)
        ? (raw as MenuL1[])
        : Array.isArray((raw as { data?: unknown })?.data)
          ? ((raw as { data: MenuL1[] }).data)
          : [];
      setTree(data);
      // 2026-05-09: 로드 직후 모든 그룹 자동 펼침 — 사용자가 자식 항목까지 한 번에 볼 수 있도록.
      const allIds = new Set<string>();
      data.forEach((l1) => {
        if ((l1.children ?? []).length > 0) allIds.add(l1.id);
        (l1.children ?? []).forEach((l2) => {
          if ((l2.children ?? []).length > 0) allIds.add(l2.id);
        });
      });
      setExpandedIds(allIds);
      setIsDirty(false);
    } catch (e) {
      console.error('Failed to load menus:', e);
      setTree([]);
      setActionMsg({ type: 'error', text: MESSAGES.menu.loadError });
      setTimeout(() => setActionMsg(null), 5000);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadMenus(selectedUserType); }, [selectedUserType, loadMenus]);

  // ── 플랫 리스트 ──────────────────────────────
  // 방어적 가드: setTree에서 이미 배열을 보장하지만 동시 변경 가능성 대비
  const flatL2 = useMemo(
    () => (Array.isArray(tree) ? tree.flatMap((p) => p.children ?? []) : []),
    [tree],
  );

  // ── 트리 접기/펼치기 ────────────────────────
  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const ids = new Set<string>();
    tree.forEach((l1) => {
      if ((l1.children ?? []).length > 0) ids.add(l1.id);
      (l1.children ?? []).forEach((l2) => {
        if ((l2.children ?? []).length > 0) ids.add(l2.id);
      });
    });
    setExpandedIds(ids);
  }, [tree]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  // ── 부모 id로 형제 목록 탐색 (모달 열기 시 order 계산) ───
  const findSiblingsByParent = useCallback((parentId: string | null, level: MenuLevel): AppMenu[] => {
    if (level === 1) return tree;
    if (level === 2) return tree.find((l1) => l1.id === parentId)?.children ?? [];
    return flatL2.find((l2) => l2.id === parentId)?.children ?? [];
  }, [tree, flatL2]);

  // ── 모달 열기 헬퍼 ───────────────────────────
  const openAdd = (level: MenuLevel, parentId: string | null = null) => {
    const siblings = findSiblingsByParent(parentId, level);
    setAddingLevel(level);
    setAddingParentId(parentId);
    setEditingMenu({
      label: '',
      icon: 'menu',
      href: level === 1 ? '#' : '',
      isActive: true,
      order: siblings.length + 1,
      userType: tabToUserType(selectedUserType),
      parentId,
    });
    setIsModalOpen(true);
  };

  const openEdit = (menu: AppMenu) => {
    const isL1 = tree.some((m) => m.id === menu.id);
    const isL2 = flatL2.some((m) => m.id === menu.id);
    setAddingLevel(isL1 ? 1 : isL2 ? 2 : 3);
    setAddingParentId(menu.parentId ?? null);
    setEditingMenu({ ...menu });
    setIsModalOpen(true);
  };

  // ── 모달 확인 (메모리만 갱신) ────────────────
  const handleSaveMenu = () => {
    if (!editingMenu?.label) {
      setActionMsg({ type: 'error', text: MESSAGES.menu.nameRequired });
      setTimeout(() => setActionMsg(null), 3000);
      return;
    }
    if (!editingMenu.href) {
      setActionMsg({ type: 'error', text: MESSAGES.menu.pathRequired });
      setTimeout(() => setActionMsg(null), 3000);
      return;
    }

    if (editingMenu.id) {
      // 기존 노드 수정
      setTree((prev) =>
        mapTreeNodes(prev, (m) =>
          m.id === editingMenu.id
            ? {
                ...m,
                label: editingMenu.label!,
                icon: editingMenu.icon ?? 'menu',
                href: editingMenu.href!,
                isActive: editingMenu.isActive ?? true,
              }
            : m,
        ),
      );
    } else {
      // 신규 노드 추가 (임시 id 부여, 저장 시 BE 가 새 cuid 부여)
      const newNode: AppMenu = {
        id: newTempId(),
        userType: tabToUserType(selectedUserType),
        label: editingMenu.label!,
        icon: editingMenu.icon ?? 'menu',
        href: editingMenu.href!,
        isActive: editingMenu.isActive ?? true,
        order: 0,
        parentId: addingParentId ?? null,
      };
      setTree((prev) => insertInTree(prev, newNode, addingParentId, addingLevel) as MenuL1[]);
    }
    setIsDirty(true);
    setIsModalOpen(false);
    setEditingMenu(null);
  };

  // ── 삭제 (메모리만 갱신) ─────────────────────
  const handleDeleteConfirmed = (id: string) => {
    setTree((prev) => deleteFromTree(prev, id));
    setIsDirty(true);
  };

  const handleDelete = (id: string) => {
    setConfirmAction({ id, action: 'delete' });
  };

  // ── 활성화 토글 (메모리만 갱신) ───────────────
  const handleToggle = (menu: AppMenu) => {
    setTree((prev) =>
      mapTreeNodes(prev, (m) => (m.id === menu.id ? { ...m, isActive: !m.isActive } : m)),
    );
    setIsDirty(true);
  };

  // ── 이동 (메모리만 갱신) ─────────────────────
  const handleMove = (id: string, _siblings: AppMenu[], dir: 'up' | 'down') => {
    setTree((prev) => moveInTree(prev, id, dir));
    setIsDirty(true);
  };

  // ── 변경사항 저장: tree → reset-tree DTO 통째 저장 ──
  const handleSaveAll = useCallback(async () => {
    setIsSaving(true);
    try {
      const groups = tree.map((l1) => ({
        label: l1.label,
        icon: l1.icon,
        isActive: l1.isActive,
        children: (l1.children ?? []).map((l2) => ({
          label: l2.label,
          icon: l2.icon,
          href: l2.href,
          isActive: l2.isActive,
        })),
      }));

      if (selectedUserType === 'STUDENT') {
        await menuService.resetTreeToDefault('TEEN', groups);
        await menuService.resetTreeToDefault('CHILD', groups);
      } else {
        await menuService.resetTreeToDefault(selectedUserType, groups);
      }

      setActionMsg({ type: 'success', text: MESSAGES.menu.saved });
      setIsDirty(false);
      await loadMenus(selectedUserType);
    } catch (e) {
      console.error('저장 실패:', e);
      setActionMsg({ type: 'error', text: MESSAGES.menu.saveError });
    } finally {
      setIsSaving(false);
      setTimeout(() => setActionMsg(null), 3000);
    }
  }, [tree, selectedUserType, loadMenus]);

  // ── 변경사항 취소(돌리기): DB 상태 다시 로드 ──
  const handleDiscardChanges = useCallback(() => {
    loadMenus(selectedUserType);
    setActionMsg({ type: 'success', text: MESSAGES.menu.cancelled });
    setTimeout(() => setActionMsg(null), 3000);
  }, [selectedUserType, loadMenus]);

  // ── 기본값으로 초기화 (spec 트리로 reseed) ────────────
  const handleResetToDefault = useCallback(async () => {
    setIsSaving(true);
    try {
      const realUserType = tabToUserType(selectedUserType);
      const specGroups = getAppMenuSpec(realUserType);

      if (selectedUserType === 'STUDENT') {
        await menuService.resetTreeToDefault('TEEN', specGroups);
        await menuService.resetTreeToDefault('CHILD', specGroups);
      } else {
        await menuService.resetTreeToDefault(realUserType, specGroups);
      }
      setActionMsg({ type: 'success', text: MESSAGES.menu.resetSuccess });
      await loadMenus(selectedUserType);
    } catch (e) {
      console.error('초기화 실패:', e);
      setActionMsg({ type: 'error', text: MESSAGES.menu.resetError });
    } finally {
      setIsSaving(false);
      setTimeout(() => setActionMsg(null), 3000);
    }
  }, [selectedUserType, loadMenus]);

  // ── 탭 전환 시 미저장 변경 경고 ──────────────────────
  const handleTabChange = (tab: MenuTabValue) => {
    if (isDirty) {
      const ok = window.confirm('저장하지 않은 변경 사항이 있습니다. 다른 탭으로 이동하면 변경 사항이 사라집니다. 계속하시겠습니까?');
      if (!ok) return;
    }
    setSelectedUserType(tab);
  };

  if (isLoading) return <LoadingSpinner message="메뉴 데이터를 불러오는 중..." />;

  const currentTabLabel = userTypes.find((u) => u.value === selectedUserType)?.label ?? '';
  const isStudentTab = selectedUserType === 'STUDENT';

  return (
    <div className="space-y-6 pb-10">
      {actionMsg && (
        <div className={`p-3 rounded-lg text-sm ${
          actionMsg.type === 'success'
            ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
            : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
        }`}>
          {actionMsg.text}
        </div>
      )}

      {/* 페이지 헤더 + 저장/취소 버튼 */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">앱메뉴 관리</h1>
            {isDirty && (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                저장되지 않은 변경
              </span>
            )}
          </div>
          <p className="text-base text-slate-500 dark:text-slate-400 mt-2">
            {isStudentTab
              ? '학생 메뉴는 TEEN/CHILD 양쪽에 동시 적용됩니다. 변경 후 우측 "변경사항 저장"을 눌러 확정하세요.'
              : '메뉴 변경은 메모리에서만 일어납니다. 우측 "변경사항 저장"을 눌러야 DB 에 반영됩니다.'}
          </p>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Button
            type="button"
            onClick={() => setConfirmDiscard(true)}
            disabled={!isDirty || isSaving}
            variant="outline"
            className="h-12 px-5 text-base font-bold gap-2 border-slate-300 dark:border-slate-600 disabled:opacity-40"
          >
            <Undo2 className="w-4 h-4" aria-hidden="true" />
            취소(돌리기)
          </Button>
          <Button
            type="button"
            onClick={handleSaveAll}
            disabled={!isDirty || isSaving}
            className="h-12 px-6 text-base font-bold gap-2 bg-primary hover:bg-primary-dark disabled:opacity-40"
          >
            <Save className="w-4 h-4" aria-hidden="true" />
            {isSaving ? '저장 중…' : '변경사항 저장'}
          </Button>
        </div>
      </div>

      {/* 사용자 유형 탭 */}
      <div className="flex flex-wrap gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl w-fit" role="tablist">
        {userTypes.map((type) => (
          <button key={type.value} type="button" onClick={() => handleTabChange(type.value)}
            role="tab"
            aria-selected={selectedUserType === type.value}
            className={`min-h-[44px] px-4 py-2 rounded-lg text-sm font-semibold transition-all motion-reduce:transition-none ${
              selectedUserType === type.value
                ? 'bg-white dark:bg-slate-700 text-primary shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
            }`}>
            {type.label}
          </button>
        ))}
      </div>

      {/* 액션 바 (트리 조작 — 메모리 변경만) */}
      <div className="flex items-center">
        <div className="flex gap-3 flex-wrap">
          <Button type="button" onClick={() => openAdd(1)} className="h-12 px-5 text-base font-bold bg-primary hover:bg-primary-dark gap-2">
            <Plus className="w-4 h-4" aria-hidden="true" />
            대분류 추가
          </Button>
          <Button type="button" onClick={expandAll} variant="outline"
            className="h-12 px-5 text-base font-bold gap-2 border-slate-300 dark:border-slate-600">
            전체 펼치기
          </Button>
          <Button type="button" onClick={collapseAll} variant="outline"
            className="h-12 px-5 text-base font-bold gap-2 border-slate-300 dark:border-slate-600">
            전체 접기
          </Button>
          <Button type="button" onClick={() => loadMenus(selectedUserType)} variant="outline"
            className="h-12 px-5 text-base font-bold gap-2 border-slate-300 dark:border-slate-600">
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            새로고침
          </Button>
          <Button type="button" onClick={() => setConfirmReset(true)} variant="outline"
            className="h-12 px-5 text-base font-bold gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/30">
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            기본값으로 초기화
          </Button>
        </div>
      </div>

      {/* 초기화 확인 UI */}
      {confirmReset && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
          <span className="text-sm text-amber-800 dark:text-amber-300">
            현재 {currentTabLabel} 메뉴를 모두 삭제하고 기본값(spec)으로 즉시 초기화합니다. 진행할까요?
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => setConfirmReset(false)} className="h-7 text-xs">취소</Button>
          <Button type="button" size="sm" onClick={() => { setConfirmReset(false); handleResetToDefault(); }} className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white">초기화하기</Button>
        </div>
      )}

      {/* 변경사항 취소 확인 UI */}
      {confirmDiscard && (
        <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          <span className="text-sm text-slate-700 dark:text-slate-300">변경 사항을 모두 취소하고 마지막 저장 상태로 되돌립니다. 진행할까요?</span>
          <Button type="button" size="sm" variant="outline" onClick={() => setConfirmDiscard(false)} className="h-7 text-xs">취소</Button>
          <Button type="button" size="sm" onClick={() => { setConfirmDiscard(false); handleDiscardChanges(); }} className="h-7 text-xs bg-slate-600 hover:bg-slate-700 text-white">되돌리기</Button>
        </div>
      )}

      {/* 삭제 확인 UI */}
      {confirmAction && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <span className="text-sm text-red-700 dark:text-red-400">이 메뉴를 트리에서 제거합니다 (저장 시 DB 에 반영). 하위 메뉴도 함께 제거됩니다.</span>
          <Button type="button" size="sm" variant="outline" onClick={() => setConfirmAction(null)} className="h-7 text-xs">취소</Button>
          <Button type="button" size="sm" onClick={() => { handleDeleteConfirmed(confirmAction.id); setConfirmAction(null); }} className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white">삭제하기</Button>
        </div>
      )}

      {/* 트리 뷰 */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            {/* 헤더 */}
            <div className="flex items-center gap-3 px-6 py-3.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50/95 dark:bg-slate-800/95">
              <span className="w-56 shrink-0 pl-14 text-[11px] font-bold tracking-[0.08em] uppercase text-slate-500 dark:text-slate-300">레벨</span>
              <span className="w-16 shrink-0 text-center text-[11px] font-bold tracking-[0.08em] uppercase text-slate-500 dark:text-slate-300">순서</span>
              <span className="w-16 shrink-0 text-center text-[11px] font-bold tracking-[0.08em] uppercase text-slate-500 dark:text-slate-300">아이콘</span>
              <span className="flex-1 min-w-0 text-[11px] font-bold tracking-[0.08em] uppercase text-slate-500 dark:text-slate-300">메뉴명 / 경로</span>
              <span className="w-52 shrink-0 text-center text-[11px] font-bold tracking-[0.08em] uppercase text-slate-500 dark:text-slate-300">액션</span>
            </div>

            {tree.length === 0 ? (
              <div className="p-20 text-center">
                <Menu className="w-16 h-16 text-slate-200 dark:text-slate-700 mx-auto mb-4" />
                <p className="text-slate-500 dark:text-slate-400 mb-4">등록된 메뉴가 없습니다</p>
                <Button type="button" onClick={() => openAdd(1)} variant="outline" className="h-12 px-5 text-base font-bold border-primary text-primary">
                  대분류 추가하기
                </Button>
              </div>
            ) : (
              tree.map((l1, l1Idx) => (
                <div key={l1.id}>
                  <MenuRow
                    menu={l1} level={1} siblings={tree}
                    isFirst={l1Idx === 0} isLast={l1Idx === tree.length - 1}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    onToggle={handleToggle}
                    onMoveUp={() => handleMove(l1.id, tree, 'up')}
                    onMoveDown={() => handleMove(l1.id, tree, 'down')}
                    onAddChild={() => openAdd(2, l1.id)}
                    hasChildren={(l1.children ?? []).length > 0}
                    isExpanded={expandedIds.has(l1.id)}
                    onToggleExpand={() => toggleExpand(l1.id)}
                  />

                  {expandedIds.has(l1.id) && (l1.children ?? []).map((l2, l2Idx) => (
                    <div key={l2.id}>
                      <MenuRow
                        menu={l2} level={2} siblings={l1.children}
                        isFirst={l2Idx === 0} isLast={l2Idx === l1.children.length - 1}
                        onEdit={openEdit}
                        onDelete={handleDelete}
                        onToggle={handleToggle}
                        onMoveUp={() => handleMove(l2.id, l1.children, 'up')}
                        onMoveDown={() => handleMove(l2.id, l1.children, 'down')}
                        onAddChild={() => openAdd(3, l2.id)}
                        hasChildren={(l2.children ?? []).length > 0}
                        isExpanded={expandedIds.has(l2.id)}
                        onToggleExpand={() => toggleExpand(l2.id)}
                      />

                      {expandedIds.has(l2.id) && (l2.children ?? []).map((l3, l3Idx) => (
                        <MenuRow
                          key={l3.id}
                          menu={l3} level={3} siblings={l2.children ?? []}
                          isFirst={l3Idx === 0} isLast={l3Idx === (l2.children ?? []).length - 1}
                          onEdit={openEdit}
                          onDelete={handleDelete}
                          onToggle={handleToggle}
                          onMoveUp={() => handleMove(l3.id, l2.children ?? [], 'up')}
                          onMoveDown={() => handleMove(l3.id, l2.children ?? [], 'down')}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── 메뉴 편집/추가 모달 ── */}
      <Modal isOpen={isModalOpen && !!editingMenu} onClose={() => setIsModalOpen(false)} size="md">
        <ModalHeader
          title={editingMenu?.id
            ? `${LEVEL_META[addingLevel].label} 수정`
            : `${LEVEL_META[addingLevel].label} 추가`}
          icon={LEVEL_META[addingLevel].icon}
        />
        <ModalBody>
          {editingMenu && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${LEVEL_META[addingLevel].badge}`}>
                  {LEVEL_META[addingLevel].label}
                </span>
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  {addingLevel === 1 && '최상위 아코디언 그룹 — 드로어에서 클릭 가능한 메뉴입니다'}
                  {addingLevel === 2 && '중간 항목 — 드로어에서 클릭 가능한 메뉴입니다'}
                  {addingLevel === 3 && '하위 세부 항목'}
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">메뉴 이름</label>
                <Input
                  value={editingMenu.label ?? ''}
                  onChange={(e) => setEditingMenu({ ...editingMenu, label: e.target.value })}
                  placeholder="예: 회원 관리"
                  className="h-11"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                  경로 (href)
                  {addingLevel === 1 && (
                    <span className="ml-2 text-xs font-normal text-slate-400">서브메뉴 없이 직접 이동 시 입력, 아코디언만 사용하면 # 유지</span>
                  )}
                </label>
                <Input
                  value={editingMenu.href ?? ''}
                  onChange={(e) => setEditingMenu({ ...editingMenu, href: e.target.value })}
                  placeholder={addingLevel === 1 ? '예: # 또는 /dashboard' : '예: /members'}
                  className="h-11 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">아이콘</label>
                <div className="grid grid-cols-4 gap-2 max-h-[200px] overflow-y-auto p-1">
                  {iconOptions.map((opt) => (
                    <button key={opt.value}
                      type="button"
                      onClick={() => setEditingMenu({ ...editingMenu, icon: opt.value })}
                      className={`p-2 rounded-lg border transition-all flex flex-col items-center gap-1 ${
                        editingMenu.icon === opt.value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-500'
                      }`}>
                      <opt.Icon className="w-5 h-5" aria-hidden="true" />
                      <span className="text-[10px] truncate w-full text-center">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <input type="checkbox" id="isActive"
                  checked={editingMenu.isActive ?? true}
                  onChange={(e) => setEditingMenu({ ...editingMenu, isActive: e.target.checked })}
                  className="w-5 h-5 text-primary rounded"
                />
                <label htmlFor="isActive" className="text-sm font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                  활성화 (사용자에게 표시)
                </label>
              </div>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} className="flex-1 h-12 px-5 text-base font-bold">취소</Button>
          <Button type="button" onClick={handleSaveMenu} className="flex-1 h-12 px-5 text-base font-bold bg-primary hover:bg-primary-dark">확인</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
