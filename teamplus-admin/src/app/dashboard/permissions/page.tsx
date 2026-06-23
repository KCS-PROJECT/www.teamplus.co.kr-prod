'use client';

import { useState, useEffect, useCallback } from 'react';
import { MESSAGES } from '@/lib/messages';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Shield,
  Users,
  Settings,
  ShoppingBag,
  GraduationCap,
  Calendar,
  CreditCard,
  Megaphone,
  Smartphone,
  Info,
  Save,
  Check,
  X,
  Eye,
  Pencil,
  Trash2,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { api } from '@/services/api-client';

/**
 * TEAMPLUS 권한 관리 페이지
 * 역할별 RBAC 권한 매트릭스 (읽기/쓰기/삭제)
 *
 * 행: ADMIN, DIRECTOR, COACH, PARENT, TEEN, CHILD (6개 역할)
 * 열: 회원관리, 수업관리, 결제관리, 출석관리, 공지관리, 쇼핑몰관리, 앱관리, 시스템관리 (8개 권한)
 * 셀: 읽기(R) / 쓰기(W) / 삭제(D) 체크박스
 *
 * API:
 *   GET  /admin/permissions → 현재 권한 로드
 *   PUT  /admin/permissions → 권한 저장
 */

// ── 타입 정의 ──────────────────────────────────────
type RoleKey = 'ADMIN' | 'DIRECTOR' | 'COACH' | 'PARENT' | 'TEEN' | 'CHILD';

type PermissionAction = 'read' | 'write' | 'delete';

interface PermissionSet {
  read: boolean;
  write: boolean;
  delete: boolean;
}

interface MenuPermission {
  id: string;
  label: string;
  icon: typeof Users;
}

interface RoleInfo {
  key: RoleKey;
  label: string;
  description: string;
  color: string;
  userCount: number;
}

/** 역할별 메뉴 접근 권한 매트릭스 (읽기/쓰기/삭제) */
type PermissionMatrix = Record<RoleKey, Record<string, PermissionSet>>;

interface AdminStatsResponse {
  users?: {
    byType?: Record<string, number>;
  };
}

// ── 메뉴 정의 (8개 권한 항목) ────────────────────────
const MENU_LIST: MenuPermission[] = [
  { id: 'members', label: '회원관리', icon: Users },
  { id: 'classes', label: '수업관리', icon: GraduationCap },
  { id: 'payments', label: '결제관리', icon: CreditCard },
  { id: 'attendance', label: '출석관리', icon: Calendar },
  { id: 'notices', label: '공지관리', icon: Megaphone },
  { id: 'shop', label: '쇼핑몰관리', icon: ShoppingBag },
  { id: 'app', label: '앱관리', icon: Smartphone },
  { id: 'system', label: '시스템관리', icon: Settings },
];

// ── 역할 정의 (6개 역할) ─────────────────────────────
const ROLE_LIST: Omit<RoleInfo, 'userCount'>[] = [
  { key: 'ADMIN', label: '시스템 관리자', description: '모든 권한을 가진 최고 관리자', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
  { key: 'DIRECTOR', label: '감독', description: '클럽 운영 및 코치 관리 권한', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' },
  { key: 'COACH', label: '코치', description: '수업 및 출석 관리 권한', color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' },
  { key: 'PARENT', label: '학부모', description: '자녀 수업 및 결제 조회 권한', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
  { key: 'TEEN', label: '10세 이상 학생', description: '본인 수업 및 출석 조회 권한', color: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400' },
  { key: 'CHILD', label: '10세 미만 학생', description: '최소 조회 권한', color: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-400' },
];

const PERMISSION_ACTIONS: { key: PermissionAction; label: string; shortLabel: string; icon: typeof Eye }[] = [
  { key: 'read', label: '읽기', shortLabel: 'R', icon: Eye },
  { key: 'write', label: '쓰기', shortLabel: 'W', icon: Pencil },
  { key: 'delete', label: '삭제', shortLabel: 'D', icon: Trash2 },
];

// ── 기본 권한 매트릭스 ──────────────────────────────
function createPermSet(r: boolean, w: boolean, d: boolean): PermissionSet {
  return { read: r, write: w, delete: d };
}

const ALL_PERMS = createPermSet(true, true, true);
const READ_WRITE = createPermSet(true, true, false);
const READ_ONLY = createPermSet(true, false, false);
const NO_PERMS = createPermSet(false, false, false);

const DEFAULT_MATRIX: PermissionMatrix = {
  ADMIN: Object.fromEntries(MENU_LIST.map((m) => [m.id, ALL_PERMS])) as Record<string, PermissionSet>,
  DIRECTOR: {
    members: READ_WRITE,
    classes: ALL_PERMS,
    payments: READ_ONLY,
    attendance: ALL_PERMS,
    notices: READ_WRITE,
    shop: READ_ONLY,
    app: NO_PERMS,
    system: NO_PERMS,
  },
  COACH: {
    members: READ_ONLY,
    classes: READ_WRITE,
    payments: NO_PERMS,
    attendance: READ_WRITE,
    notices: READ_ONLY,
    shop: NO_PERMS,
    app: NO_PERMS,
    system: NO_PERMS,
  },
  PARENT: {
    members: NO_PERMS,
    classes: READ_ONLY,
    payments: READ_ONLY,
    attendance: READ_ONLY,
    notices: READ_ONLY,
    shop: READ_ONLY,
    app: NO_PERMS,
    system: NO_PERMS,
  },
  TEEN: {
    members: NO_PERMS,
    classes: READ_ONLY,
    payments: NO_PERMS,
    attendance: READ_ONLY,
    notices: READ_ONLY,
    shop: READ_ONLY,
    app: NO_PERMS,
    system: NO_PERMS,
  },
  CHILD: {
    members: NO_PERMS,
    classes: READ_ONLY,
    payments: NO_PERMS,
    attendance: READ_ONLY,
    notices: NO_PERMS,
    shop: NO_PERMS,
    app: NO_PERMS,
    system: NO_PERMS,
  },
};

// ── 깊은 복사 유틸 ──────────────────────────────────
function deepCopy<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export default function PermissionsPage() {
  const [matrix, setMatrix] = useState<PermissionMatrix>(deepCopy(DEFAULT_MATRIX));
  const [savedMatrix, setSavedMatrix] = useState<PermissionMatrix>(deepCopy(DEFAULT_MATRIX));
  const [roleInfos, setRoleInfos] = useState<RoleInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [expandedRole, setExpandedRole] = useState<RoleKey | null>(null);

  const hasChanges = JSON.stringify(matrix) !== JSON.stringify(savedMatrix);

  // ── 권한 데이터 로드 ─────────────────────────────
  const loadPermissions = useCallback(async () => {
    try {
      const response = await api.get<{ permissions: PermissionMatrix }>('/admin/permissions');
      if (response?.permissions) {
        setMatrix(deepCopy(response.permissions));
        setSavedMatrix(deepCopy(response.permissions));
      }
    } catch {
      // API 미구현 시 기본값 사용
    }
  }, []);

  // ── 사용자 통계 로드 ─────────────────────────────
  const loadStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const stats = await api.get<AdminStatsResponse>('/admin/stats');
      const byType: Record<string, number> = stats?.users?.byType ?? {};

      setRoleInfos(
        ROLE_LIST.map((role) => ({
          ...role,
          userCount: byType[role.key] ?? 0,
        }))
      );
    } catch {
      setRoleInfos(ROLE_LIST.map((role) => ({ ...role, userCount: 0 })));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadPermissions();
  }, [loadStats, loadPermissions]);

  // ── 개별 체크박스 토글 ──────────────────────────
  const handleToggle = (role: RoleKey, menuId: string, action: PermissionAction) => {
    if (role === 'ADMIN') return;

    setMatrix((prev) => {
      const next = deepCopy(prev);
      const current = next[role][menuId];

      if (action === 'read' && current.read) {
        // 읽기 해제 시 쓰기/삭제도 함께 해제
        current.read = false;
        current.write = false;
        current.delete = false;
      } else if (action === 'write') {
        current.write = !current.write;
        if (!current.write) {
          current.delete = false; // 쓰기 해제 시 삭제도 해제
        } else {
          current.read = true; // 쓰기 활성화 시 읽기도 활성화
        }
      } else if (action === 'delete') {
        current.delete = !current.delete;
        if (current.delete) {
          current.read = true;
          current.write = true; // 삭제 활성화 시 읽기/쓰기도 활성화
        }
      } else {
        current[action] = !current[action];
      }

      return next;
    });
  };

  // ── 메뉴별 전체 토글 (한 역할의 한 메뉴 RWD 모두 토글) ────
  const handleToggleMenu = (role: RoleKey, menuId: string) => {
    if (role === 'ADMIN') return;

    const current = matrix[role][menuId];
    const allEnabled = current.read && current.write && current.delete;

    setMatrix((prev) => {
      const next = deepCopy(prev);
      if (allEnabled) {
        next[role][menuId] = createPermSet(false, false, false);
      } else {
        next[role][menuId] = createPermSet(true, true, true);
      }
      return next;
    });
  };

  // ── 역할별 전체 토글 ──────────────────────────────
  const handleToggleRole = (role: RoleKey) => {
    if (role === 'ADMIN') return;

    const allEnabled = MENU_LIST.every(
      (m) => matrix[role][m.id].read && matrix[role][m.id].write && matrix[role][m.id].delete
    );

    setMatrix((prev) => {
      const next = deepCopy(prev);
      MENU_LIST.forEach((m) => {
        next[role][m.id] = allEnabled
          ? createPermSet(false, false, false)
          : createPermSet(true, true, true);
      });
      return next;
    });
  };

  // ── 저장 ──────────────────────────────────────
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.put('/admin/permissions', { permissions: matrix });
      setSavedMatrix(deepCopy(matrix));
      setActionMsg({ type: 'success', text: MESSAGES.permission.saved });
    } catch {
      // API 미구현 시 로컬 저장 처리
      setSavedMatrix(deepCopy(matrix));
      setActionMsg({ type: 'success', text: MESSAGES.permission.savedLocal });
    } finally {
      setIsSaving(false);
      setTimeout(() => setActionMsg(null), 3000);
    }
  };

  // ── 초기화 ────────────────────────────────────
  const handleReset = () => {
    setMatrix(deepCopy(savedMatrix));
    setActionMsg({ type: 'success', text: MESSAGES.permission.reset });
    setTimeout(() => setActionMsg(null), 3000);
  };

  // ── 기본값 복원 ────────────────────────────────
  const handleRestoreDefaults = () => {
    setMatrix(deepCopy(DEFAULT_MATRIX));
    setActionMsg({ type: 'success', text: MESSAGES.permission.restored });
    setTimeout(() => setActionMsg(null), 3000);
  };

  // ── 권한 수 계산 ──────────────────────────────
  const getEnabledCount = (role: RoleKey): { read: number; write: number; delete: number } => {
    let r = 0, w = 0, d = 0;
    MENU_LIST.forEach((m) => {
      if (matrix[role][m.id].read) r++;
      if (matrix[role][m.id].write) w++;
      if (matrix[role][m.id].delete) d++;
    });
    return { read: r, write: w, delete: d };
  };

  if (isLoading) {
    return <LoadingSpinner message="권한 정보를 불러오는 중..." />;
  }

  return (
    <div className="p-6 space-y-6">
      {/* 인라인 메시지 */}
      {actionMsg && (
        <div
          className={`p-3 rounded-lg text-sm ${
            actionMsg.type === 'success'
              ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
              : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
          }`}
        >
          {actionMsg.text}
        </div>
      )}

      <PageHeader
        title="권한 관리"
        description="역할별 메뉴 접근 권한을 관리합니다. (읽기/쓰기/삭제)"
      />

      {/* 코드 기반 RBAC 안내 */}
      <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-800 dark:text-blue-300">
            <p>
              역할별 권한은 <strong>읽기(R)</strong>, <strong>쓰기(W)</strong>, <strong>삭제(D)</strong>로
              세분화됩니다. ADMIN 역할은 모든 권한을 가지며 변경할 수 없습니다.
            </p>
            <p className="mt-1 text-blue-600 dark:text-blue-400">
              쓰기를 활성화하면 읽기가 자동 활성화되고, 삭제를 활성화하면 읽기와 쓰기가 자동 활성화됩니다.
            </p>
          </div>
        </div>
      </Card>

      {/* 역할 개요 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {roleInfos.map((role) => {
          const counts = getEnabledCount(role.key);
          return (
            <Card
              key={role.key}
              className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${role.color.split(' ').slice(0, 2).join(' ')}`}>
                  <Shield className={`h-5 w-5 ${role.color.split(' ').slice(2).join(' ')}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate text-slate-900 dark:text-white">{role.label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{role.description}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                    <Users className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-sm font-medium">{role.userCount}명</span>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      R:{counts.read}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      W:{counts.write}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      D:{counts.delete}
                    </Badge>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* 권한 매트릭스 테이블 */}
      <Card className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider min-w-[180px] sticky left-0 bg-slate-50 dark:bg-slate-700/50 z-10">
                  역할
                </th>
                {MENU_LIST.map((menu) => {
                  const Icon = menu.icon;
                  return (
                    <th
                      key={menu.id}
                      className="px-2 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider min-w-[120px]"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <Icon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                        <span>{menu.label}</span>
                        <div className="flex gap-1 text-[10px] text-slate-400 font-normal">
                          <span>R</span>
                          <span>W</span>
                          <span>D</span>
                        </div>
                      </div>
                    </th>
                  );
                })}
                <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider min-w-[80px]">
                  전체
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {ROLE_LIST.map((role) => {
                const isAdmin = role.key === 'ADMIN';
                const allEnabled = MENU_LIST.every(
                  (m) => matrix[role.key][m.id].read && matrix[role.key][m.id].write && matrix[role.key][m.id].delete
                );
                const isExpanded = expandedRole === role.key;

                return (
                  <tr
                    key={role.key}
                    className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    {/* 역할 이름 */}
                    <td className="px-4 py-3 sticky left-0 bg-white dark:bg-slate-800 z-10">
                      <button
                        type="button"
                        onClick={() => setExpandedRole(isExpanded ? null : role.key)}
                        className="flex items-center gap-2 text-left w-full"
                      >
                        <Shield
                          className={`h-4 w-4 shrink-0 ${
                            isAdmin
                              ? 'text-blue-700 dark:text-blue-400'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-slate-900 dark:text-white text-sm">
                              {role.label}
                            </p>
                            {isAdmin && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                전체
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                            {role.key}
                          </p>
                        </div>
                        {!isAdmin && (
                          isExpanded
                            ? <ChevronUp className="h-3.5 w-3.5 text-slate-400 ml-auto shrink-0" />
                            : <ChevronDown className="h-3.5 w-3.5 text-slate-400 ml-auto shrink-0" />
                        )}
                      </button>
                    </td>

                    {/* 메뉴별 권한 체크박스 (R/W/D) */}
                    {MENU_LIST.map((menu) => {
                      const perms = matrix[role.key][menu.id];
                      return (
                        <td key={menu.id} className="px-2 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {PERMISSION_ACTIONS.map((action) => {
                              const enabled = perms[action.key];
                              return (
                                <button
                                  key={action.key}
                                  type="button"
                                  onClick={() => handleToggle(role.key, menu.id, action.key)}
                                  disabled={isAdmin}
                                  className={`inline-flex items-center justify-center w-7 h-7 rounded text-[10px] font-bold border transition-colors ${
                                    enabled
                                      ? action.key === 'delete'
                                        ? 'bg-red-50 border-red-200 text-red-600 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400'
                                        : action.key === 'write'
                                        ? 'bg-amber-50 border-amber-200 text-amber-600 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400'
                                        : 'bg-green-50 border-green-200 text-green-600 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400'
                                      : 'bg-white border-slate-200 text-slate-300 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-500'
                                  } ${
                                    isAdmin
                                      ? 'cursor-not-allowed opacity-60'
                                      : 'hover:border-slate-400 dark:hover:border-slate-500 cursor-pointer'
                                  }`}
                                  title={`${role.label} - ${menu.label}: ${action.label} ${enabled ? '허용됨' : '제한됨'}`}
                                >
                                  {action.shortLabel}
                                </button>
                              );
                            })}
                            {/* 메뉴별 전체 토글 (모바일/확장 시) */}
                            {isExpanded && !isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleToggleMenu(role.key, menu.id)}
                                className="ml-0.5 inline-flex items-center justify-center w-7 h-7 rounded border border-dashed border-slate-300 dark:border-slate-600 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-[10px] cursor-pointer transition-colors"
                                title={`${menu.label} 전체 토글`}
                              >
                                {perms.read && perms.write && perms.delete ? (
                                  <X className="h-3 w-3" />
                                ) : (
                                  <Check className="h-3 w-3" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}

                    {/* 전체 토글 */}
                    <td className="px-3 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleRole(role.key)}
                        disabled={isAdmin}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          allEnabled
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600'
                        } ${isAdmin ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                      >
                        {allEnabled ? '전체' : '선택'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 범례 */}
      <Card className="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">권한 유형 안내</h3>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-green-50 border border-green-200 dark:bg-green-900/20 dark:border-green-800 flex items-center justify-center">
              <Eye className="h-4 w-4 text-green-600 dark:text-green-400" aria-hidden="true" />
            </div>
            <span className="text-sm text-slate-700 dark:text-slate-300"><span className="font-semibold">R (읽기)</span> — 데이터 조회 및 목록 열람</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 flex items-center justify-center">
              <Pencil className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            </div>
            <span className="text-sm text-slate-700 dark:text-slate-300"><span className="font-semibold">W (쓰기)</span> — 데이터 생성 및 수정</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800 flex items-center justify-center">
              <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden="true" />
            </div>
            <span className="text-sm text-slate-700 dark:text-slate-300"><span className="font-semibold">D (삭제)</span> — 데이터 삭제</span>
          </div>
        </div>
      </Card>

      {/* 저장/초기화 버튼 */}
      <div className="sticky bottom-0 -mx-6 px-6 py-4 bg-white/95 dark:bg-slate-900/95 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-sm">
          {hasChanges ? (
            <span className="inline-flex items-center gap-2 text-amber-700 dark:text-amber-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-500" aria-hidden="true" />
              변경 사항이 있습니다. 저장하기를 눌러주세요.
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <span className="w-2 h-2 rounded-full bg-slate-400" aria-hidden="true" />
              현재 설정이 저장된 상태입니다.
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleRestoreDefaults()}
            disabled={isSaving}
            className="h-11 px-4 text-sm font-semibold motion-reduce:transition-none"
          >
            <RotateCcw className="h-4 w-4 mr-1.5" aria-hidden="true" />
            기본값 복원
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleReset()}
            disabled={!hasChanges || isSaving}
            className="h-11 px-4 text-sm font-semibold motion-reduce:transition-none"
          >
            초기화
          </Button>
          <Button
            type="button"
            onClick={() => handleSave()}
            disabled={!hasChanges || isSaving}
            className="h-11 px-5 text-sm font-semibold bg-primary hover:bg-primary-dark text-white motion-reduce:transition-none"
          >
            <Save className="h-4 w-4 mr-1.5" aria-hidden="true" />
            {isSaving ? '저장 중...' : '저장하기'}
          </Button>
        </div>
      </div>
    </div>
  );
}
