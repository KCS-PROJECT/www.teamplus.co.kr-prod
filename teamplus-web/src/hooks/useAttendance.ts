'use client';

import { useState, useCallback, useEffect } from 'react';
import { AttendanceStatus } from '@/components/attendance/AttendanceItem';
import { managementService } from '@/services/management';
import { useToast } from '@/components/ui/Toast';
import { devError, devWarn } from '@/lib/logger';

interface AttendanceRecord {
  id: string;
  name: string;
  className: string;
  status: AttendanceStatus;
}

/**
 * 출석 관리 Hook (실제 API 및 낙관적 업데이트 적용)
 */
export function useAttendance() {
  const [attendanceList, setAttendanceList] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const { toast } = useToast();

  const fetchAttendance = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await managementService.getAttendanceList();
      if (response && response.data) {
        setAttendanceList(response.data);
      } else {
        throw new Error('No data');
      }
    } catch (error) {
      devWarn('Attendance API failed, using fallback:', error);
      // Fallback 데이터 유지
      setAttendanceList([
        { id: 'att-1', name: '김하준', className: '기초 스케이팅', status: '출석' },
        { id: 'att-2', name: '박서연', className: '슈팅 클리닉', status: '지각' },
        { id: 'att-3', name: '이지훈', className: '팀 전술 훈련', status: '미출석' },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  /**
   * 상태 변경 (낙관적 업데이트 적용)
   */
  const updateStatus = useCallback(async (id: string, newStatus: AttendanceStatus) => {
    // 1. 현재 상태 저장 (롤백용)
    const previousList = [...attendanceList];
    
    // 2. UI 즉시 업데이트 (Optimistic UI)
    setAttendanceList(prev => 
      prev.map(item => item.id === id ? { ...item, status: newStatus } : item)
    );

    try {
      // 3. 서버 API 호출
      await managementService.updateAttendanceStatus(id, newStatus);
      toast.success(`${newStatus} 처리가 완료되었습니다.`);
    } catch (error) {
      // 4. 실패 시 롤백
      setAttendanceList(previousList);
      toast.error('상태 변경에 실패했습니다. 다시 시도해주세요.');
      devError('Failed to update status:', error);
    }
  }, [attendanceList, toast]);

  const filteredList = attendanceList.filter(item => 
    item.name.toLowerCase().includes(filter.toLowerCase()) ||
    item.className.toLowerCase().includes(filter.toLowerCase())
  );

  return {
    attendanceList: filteredList,
    isLoading,
    filter,
    setFilter,
    updateStatus,
    refresh: fetchAttendance
  };
}