import { apiClient } from './api-client';

/**

 * 관리(출석, 수업, 팀) 관련 API 서비스

 */

export const managementService = {

  /**

   * 출석 목록 조회

   */

  async getAttendanceList(params?: { classId?: string; date?: string }) {

    return apiClient.get('/attendance', { params });

  },



  /**

   * 출석 상태 변경

   */

  async updateAttendanceStatus(id: string, status: string) {

    return apiClient.put(`/attendance/${id}/status`, { status });

  },



  /**

   * 수업 목록 조회

   */

  async getClasses() {

    return apiClient.get('/classes');

  },



  /**

   * 자녀 목록 조회

   */

  async getChildren() {

    return apiClient.get('/children');

  },



  /**

   * 팀 정보 및 팀원 조회

   */

  async getTeamInfo() {

    return apiClient.get('/team');

  },



  /**

   * 기술 평가 리포트 조회

   */

  async getSkillReport(id?: string) {

    return apiClient.get(`/reports/skill/${id || 'latest'}`);

  },



  /**

   * 팀 통계 조회 (감독용)

   */

  async getStatistics() {

    return apiClient.get('/statistics/club');

  }

};
