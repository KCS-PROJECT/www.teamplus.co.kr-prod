export type AdminNoticeCategory = "general" | "schedule" | "event" | "urgent";
export type AdminNoticeTargetType = "all" | "club" | "class";

export interface AdminNotice {
  id: string;
  title: string;
  content: string;
  category: AdminNoticeCategory;
  targetType: AdminNoticeTargetType;
  targetName?: string;
  isPinned: boolean;
  isPublished: boolean;
  authorName: string;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  targetBirthYearFrom?: number;
  targetBirthYearTo?: number;
}

export interface CreateAdminNoticePayload {
  title: string;
  content: string;
  category: AdminNoticeCategory;
  targetType: AdminNoticeTargetType;
  targetName?: string;
  isPinned?: boolean;
  isPublished?: boolean;
  authorName?: string;
  targetBirthYearFrom?: number;
  targetBirthYearTo?: number;
}

const STORAGE_KEY = "teamplus_admin_notices_v1";

/**
 * 클라이언트 localStorage 기반 임시 store.
 * Backend `notices/` API 통합 후 폐기 예정.
 *
 * 이전에 들어있던 정적 mock 3건(notice-1001~1003)은 혼란 방지를 위해 제거.
 * 첫 진입 시 빈 배열로 시작하여, 사용자 입력만 누적된다.
 */
const DEFAULT_NOTICES: AdminNotice[] = [];

const clone = (items: AdminNotice[]): AdminNotice[] =>
  items.map((item) => ({ ...item }));

const seedNotices = (): AdminNotice[] => clone(DEFAULT_NOTICES);

const canUseStorage = (): boolean =>
  typeof window !== "undefined" && !!window.localStorage;

const isNoticeLike = (value: unknown): value is AdminNotice => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<AdminNotice>;
  return (
    typeof candidate.id === "string" && typeof candidate.title === "string"
  );
};

const readStorage = (): AdminNotice[] => {
  if (!canUseStorage()) {
    return seedNotices();
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seeded = seedNotices();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(isNoticeLike)) {
      return parsed as AdminNotice[];
    }
  } catch (error) {
    console.error("[Notice Store] 저장 데이터 파싱 실패:", error);
  }

  const fallback = seedNotices();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
  return fallback;
};

const writeStorage = (items: AdminNotice[]) => {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
};

export const getAdminNotices = (): AdminNotice[] => {
  return readStorage().sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
};

export const getAdminNoticeById = (noticeId: string): AdminNotice | null => {
  const found = getAdminNotices().find((notice) => notice.id === noticeId);
  return found || null;
};

export const createAdminNotice = (
  payload: CreateAdminNoticePayload,
): AdminNotice => {
  const notices = getAdminNotices();
  const now = new Date().toISOString();
  const newNotice: AdminNotice = {
    id: `notice-${Date.now()}`,
    title: payload.title.trim(),
    content: payload.content.trim(),
    category: payload.category,
    targetType: payload.targetType,
    targetName: payload.targetName?.trim() || undefined,
    isPinned: payload.isPinned ?? false,
    isPublished: payload.isPublished ?? true,
    authorName: payload.authorName?.trim() || "관리자",
    viewCount: 0,
    createdAt: now,
    updatedAt: now,
    targetBirthYearFrom: payload.targetBirthYearFrom,
    targetBirthYearTo: payload.targetBirthYearTo,
  };

  const next = [newNotice, ...notices];
  writeStorage(next);
  return newNotice;
};

export const updateAdminNotice = (
  noticeId: string,
  updates: Partial<Omit<AdminNotice, "id" | "createdAt">>,
): AdminNotice | null => {
  const notices = getAdminNotices();
  const targetIndex = notices.findIndex((notice) => notice.id === noticeId);
  if (targetIndex === -1) return null;

  const current = notices[targetIndex];
  const updatedNotice: AdminNotice = {
    ...current,
    ...updates,
    title:
      typeof updates.title === "string" ? updates.title.trim() : current.title,
    content:
      typeof updates.content === "string"
        ? updates.content.trim()
        : current.content,
    targetName:
      typeof updates.targetName === "string"
        ? updates.targetName.trim() || undefined
        : current.targetName,
    updatedAt: new Date().toISOString(),
  };

  const next = [...notices];
  next[targetIndex] = updatedNotice;
  writeStorage(next);
  return updatedNotice;
};

export const deleteAdminNotice = (noticeId: string): boolean => {
  const notices = getAdminNotices();
  const next = notices.filter((notice) => notice.id !== noticeId);
  if (next.length === notices.length) return false;
  writeStorage(next);
  return true;
};
