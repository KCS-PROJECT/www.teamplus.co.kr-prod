import apiClient from './api-client';

export interface AppMenu {
  id: string;
  userType: string;
  label: string;
  icon: string;
  href: string;
  parentId?: string | null;
  order: number;
  isActive: boolean;
  children?: AppMenu[];
}

export interface CreateAppMenuDto {
  userType: string;
  label: string;
  icon: string;
  href: string;
  parentId?: string | null;
  order: number;
  isActive: boolean;
}

export const menuService = {
  /**
   * 사용자 유형별 메뉴 조회
   * 백엔드 응답이 { success, data: AppMenu[] } 또는 AppMenu[] 두 형태 모두 안전 처리.
   */
  async getMenus(userType?: string): Promise<AppMenu[]> {
    const params = userType ? { userType } : {};
    const response = await apiClient.get<AppMenu[] | { data?: AppMenu[] }>('/menus', { params });
    const payload = response.data as AppMenu[] | { data?: AppMenu[] } | undefined;
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray((payload as { data?: AppMenu[] }).data)) {
      return (payload as { data: AppMenu[] }).data;
    }
    return [];
  },

  /**
   * 메뉴 생성
   */
  async createMenu(dto: CreateAppMenuDto) {
    const response = await apiClient.post<AppMenu>('/menus', dto);
    return response.data;
  },

  /**
   * 메뉴 수정
   */
  async updateMenu(id: string, dto: Partial<CreateAppMenuDto>) {
    const response = await apiClient.put<AppMenu>(`/menus/${id}`, dto);
    return response.data;
  },

  /**
   * 메뉴 삭제
   */
  async deleteMenu(id: string) {
    const response = await apiClient.delete<void>(`/menus/${id}`);
    return response.data;
  },

  /**
   * 메뉴 일괄 저장 (Sync)
   */
  async syncMenus(userType: string, menus: CreateAppMenuDto[]) {
    const response = await apiClient.post<AppMenu[]>('/menus/sync', {
      userType,
      menus,
    });
    return response.data;
  },

  /**
   * 역할 메뉴를 spec 트리 기준으로 초기화.
   * shared/constants/app-menu-spec.ts 의 그룹 트리를 그대로 보낸다.
   */
  async resetTreeToDefault(
    userType: string,
    groups: { label: string; icon: string; children: { label: string; icon: string; href: string }[] }[],
  ) {
    const response = await apiClient.post<AppMenu[]>('/menus/reset-tree', {
      userType,
      groups,
    });
    return response.data;
  },
};
