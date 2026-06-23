import { renderHook, act } from '@testing-library/react';
import { useAttendance } from '../useAttendance';
import { managementService } from '@/services/management';
import { useToast } from '@/components/ui/Toast';

// Mock dependencies
jest.mock('@/services/management');
jest.mock('@/components/ui/Toast');

describe('useAttendance Hook', () => {
  const mockToast = {
    success: jest.fn(),
    error: jest.fn(),
  };

  const mockData = [
    { id: '1', name: 'Student 1', className: 'Class A', status: '미출석' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (useToast as jest.Mock).mockReturnValue({ toast: mockToast });
    (managementService.getAttendanceList as jest.Mock).mockResolvedValue({ data: mockData });
  });

  it('should fetch attendance data on mount', async () => {
    const { result } = renderHook(() => useAttendance());

    // Initial state
    expect(result.current.isLoading).toBe(true);

    // Wait for async effect
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.attendanceList).toEqual(mockData);
    expect(result.current.isLoading).toBe(false);
  });

  it('should perform optimistic update when changing status', async () => {
    const { result } = renderHook(() => useAttendance());

    // Wait for load
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Mock API to be successful
    (managementService.updateAttendanceStatus as jest.Mock).mockResolvedValue({ success: true });

    // Action: Change status to '출석'
    await act(async () => {
      await result.current.updateStatus('1', '출석');
    });

    // Verify UI updated immediately (Optimistic UI)
    expect(result.current.attendanceList[0].status).toBe('출석');
    expect(mockToast.success).toHaveBeenCalledWith('출석 처리가 완료되었습니다.');
  });

  it('should rollback and show error toast when API fails', async () => {
    const { result } = renderHook(() => useAttendance());

    // Wait for load
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Mock API to fail
    const error = new Error('API Error');
    (managementService.updateAttendanceStatus as jest.Mock).mockRejectedValue(error);

    // Action: Change status to '지각'
    await act(async () => {
      await result.current.updateStatus('1', '지각');
    });

    // Verify rollback to '미출석' (initial mockData status)
    expect(result.current.attendanceList[0].status).toBe('미출석');
    expect(mockToast.error).toHaveBeenCalledWith('상태 변경에 실패했습니다. 다시 시도해주세요.');
  });
});
