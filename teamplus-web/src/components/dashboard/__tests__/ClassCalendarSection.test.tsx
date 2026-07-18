import {
  getDashboardScheduleView,
  getDashboardCalendarQueryRange,
  replaceScheduleRange,
  resolveSelectedDateKey,
  ClassCalendarSection,
  type CalendarClass,
  type SelectedClassesPayload,
} from '@/components/dashboard/ClassCalendarSection';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WeekScheduleList } from '@/components/dashboard/WeekScheduleList';
import { api } from '@/services/api-client';

const SAMPLE_CLASS: CalendarClass = {
  id: 'schedule-1',
  classId: 'class-1',
  title: '주니어 훈련',
  time: '18:00',
  scheduledDate: '2026-07-16T18:00:00.000Z',
  coach: '코치',
  location: '메인 링크',
  type: 'REGULAR',
};

describe('대시보드 달력 일정 동기화', () => {
  it('선택 날짜가 없으면 이번 주 일정 그룹을 유지한다', () => {
    const selection: SelectedClassesPayload = {
      dateKey: null,
      classes: [],
      weekGroups: [{ dateKey: '2026-07-16', classes: [SAMPLE_CLASS] }],
    };

    expect(getDashboardScheduleView(selection)).toEqual({
      title: '이번주 일정',
      groups: selection.weekGroups,
      isDateSelected: false,
    });
  });

  it('날짜를 선택하면 일정이 없어도 해당 날짜 한 그룹을 표시한다', () => {
    const selection: SelectedClassesPayload = {
      dateKey: '2026-07-19',
      classes: [],
      weekGroups: [{ dateKey: '2026-07-16', classes: [SAMPLE_CLASS] }],
    };

    expect(getDashboardScheduleView(selection)).toEqual({
      title: '선택한 일정',
      groups: [{ dateKey: '2026-07-19', classes: [] }],
      isDateSelected: true,
    });
  });

  it('선택일 섹션 제목과 날짜 그룹에서 구체적인 날짜를 중복 표시하지 않는다', () => {
    const view = getDashboardScheduleView({
      dateKey: '2026-07-19',
      classes: [],
      weekGroups: [],
    });

    render(
      <>
        <h2>{view.title}</h2>
        <WeekScheduleList
          groups={view.groups}
          collapsePast={false}
          todayKey="2026-07-16"
          renderDayClasses={() => null}
        />
      </>,
    );

    expect(screen.getByRole('heading', { name: '선택한 일정' })).toBeInTheDocument();
    expect(screen.getByText('7월 19일 (일)')).toBeInTheDocument();
    expect(screen.queryByText('7월 19일 일정')).not.toBeInTheDocument();
  });

  it('week-default는 같은 날짜를 다시 누르면 선택을 해제한다', () => {
    expect(resolveSelectedDateKey('2026-07-16', '2026-07-16', 'week-default')).toBeNull();
    expect(resolveSelectedDateKey(null, '2026-07-16', 'week-default')).toBe('2026-07-16');
  });

  it('today-default는 같은 날짜를 다시 눌러도 선택을 유지한다', () => {
    expect(resolveSelectedDateKey('2026-07-16', '2026-07-16', 'today-default')).toBe(
      '2026-07-16',
    );
  });

  it('현재 주가 월 경계에 걸리면 조회 범위를 인접 월까지 확장한다', () => {
    const { start, end } = getDashboardCalendarQueryRange(
      2026,
      4,
      new Date(2026, 4, 31, 12),
    );

    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(4);
    expect(start.getDate()).toBe(1);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(5);
    expect(end.getDate()).toBe(6);
  });

  it('조회 범위만 교체하고 다른 월의 캐시는 유지한다', () => {
    const current = {
      '2026-06-30': [SAMPLE_CLASS],
      '2026-07-16': [SAMPLE_CLASS],
      '2026-08-01': [SAMPLE_CLASS],
    };
    const next = { '2026-07-19': [SAMPLE_CLASS] };

    expect(replaceScheduleRange(current, next, '2026-07-01', '2026-07-31')).toEqual({
      '2026-06-30': [SAMPLE_CLASS],
      '2026-07-19': [SAMPLE_CLASS],
      '2026-08-01': [SAMPLE_CLASS],
    });
  });

  it('week-default 달력은 날짜 선택과 재선택 해제를 화면에 반영한다', async () => {
    const onSelectionChange = jest.fn();
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    render(
      <ClassCalendarSection
        teamIds={[]}
        selectionMode="week-default"
        onSelectionChange={onSelectionChange}
      />,
    );

    const todayCell = await screen.findByRole('gridcell', {
      name: `${today.getMonth() + 1}월 ${today.getDate()}일 오늘`,
    });
    expect(todayCell).toHaveAttribute('aria-selected', 'false');

    fireEvent.click(todayCell);
    expect(todayCell).toHaveAttribute('aria-selected', 'true');
    await waitFor(() =>
      expect(onSelectionChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ dateKey }),
      ),
    );

    fireEvent.click(todayCell);
    expect(todayCell).toHaveAttribute('aria-selected', 'false');
    await waitFor(() =>
      expect(onSelectionChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ dateKey: null }),
      ),
    );
  });

  it('today-default 달력은 오늘을 기본 선택하고 재선택해도 유지한다', async () => {
    const today = new Date();
    render(<ClassCalendarSection teamIds={[]} />);

    const todayCell = await screen.findByRole('gridcell', {
      name: `${today.getMonth() + 1}월 ${today.getDate()}일 오늘`,
    });
    expect(todayCell).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(todayCell);
    expect(todayCell).toHaveAttribute('aria-selected', 'true');
  });

  it('선택한 과거 날짜는 지난 일정 접힘 없이 즉시 표시한다', () => {
    render(
      <WeekScheduleList
        groups={[{ dateKey: '2020-01-01', classes: [SAMPLE_CLASS] }]}
        collapsePast={false}
        todayKey="2026-07-16"
        renderDayClasses={() => <span>선택한 일정</span>}
      />,
    );

    expect(screen.getByText('선택한 일정')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /지난 일정/ })).not.toBeInTheDocument();
  });

  it('오늘 버튼은 현재 월로 돌아와 오늘 일정을 선택한다', async () => {
    const today = new Date();
    render(<ClassCalendarSection teamIds={[]} selectionMode="week-default" />);

    fireEvent.click(screen.getByRole('button', { name: '다음 달' }));
    fireEvent.click(screen.getByRole('button', { name: '오늘 일정으로 이동' }));

    expect(
      screen.getByRole('heading', {
        name: `${today.getFullYear()}년 ${today.getMonth() + 1}월`,
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('gridcell', {
        name: `${today.getMonth() + 1}월 ${today.getDate()}일 오늘`,
      }),
    ).toHaveAttribute('aria-selected', 'true');
  });

  it('팀 범위가 바뀌면 이전 선택과 캐시 범위를 초기화한다', async () => {
    const getSpy = jest.spyOn(api, 'get').mockResolvedValue({ success: true, data: [] });
    const today = new Date();
    const { rerender } = render(
      <ClassCalendarSection teamIds={[]} selectionMode="week-default" />,
    );
    const todayCell = await screen.findByRole('gridcell', {
      name: `${today.getMonth() + 1}월 ${today.getDate()}일 오늘`,
    });
    fireEvent.click(todayCell);
    expect(todayCell).toHaveAttribute('aria-selected', 'true');

    rerender(
      <ClassCalendarSection
        teamIds={[{ id: 'team-1', name: '테스트 팀' }]}
        selectionMode="week-default"
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole('gridcell', {
          name: `${today.getMonth() + 1}월 ${today.getDate()}일 오늘`,
        }),
      ).toHaveAttribute('aria-selected', 'false'),
    );
    getSpy.mockRestore();
  });
});
