/**
 * /notices-create — 고정 한도 사전 안내(정확 판정) + 서버 409 백스톱 (AC 3-8 · P3-R1-05 복원).
 *
 * 계약 고정:
 *   · 대상 팀 **풀 기준** 정확 카운트(admin/list scope=team&teamId — 미게시·만료 포함)로
 *     한도 도달 시 체크박스 사전 비활성화 + pinnedFull 안내
 *   · 풀에 여유가 있으면 활성 — 과거의 "전 열람 팀 합산" 오차단 재발 방지
 *   · 수정 모드는 자기 자신을 카운트에서 제외 (이미 고정된 공지의 수정 비차단)
 *   · 서버 409 NOTICE_PIN_LIMIT → pinnedFull toast — 레이스 최종 판정(백스톱)
 *
 * R6 상태기계 (풀 전환·비동기 레이스):
 *   · 풀 키 변경 즉시 이전 판정 폐기 — A(full)→B(여유) 전환 시 B 는 활성
 *   · 체크 후 full 풀 전환 / 응답 대기 중 체크 → full 응답: 강제 해제 + 비활성
 *   · 늦게 도착한 이전 풀 응답은 무시 (cancelled)
 *   · 원래 고정돼 있던 공지의 수정(wasPinned)은 full 이어도 활성 — 고정 해제 경로 보존
 *
 * R7 identity 전환 (editId 결합):
 *   · A(full)→B 전환은 B 풀 응답 **대기 중**에도 이전 full 판정이 즉시 폐기 (pending 구간 고정)
 *   · 고정 공지 편집 → 작성 모드 전환 시 wasPinned 폐기 — full 풀 방어 우회 불가
 *   · A→B 편집 전환 중 늦게 도착한 A 프리필 응답 무시 (B identity 유지)
 *   · 프리필 실패 시 대상 풀 미확정 → 판정 보류 (fail-open, 풀 조회 안 함)
 *   · full 상태 제출 payload 는 isPinned:false (제출 방어)
 *
 * R8 폼 상태 리셋 (editId 변경 시 프리필 소유 상태 전체 폐기):
 *   · 고정 공지 편집 → 작성 전환 + **여유 풀**: 체크 해제·빈 폼·POST isPinned:false
 *     (full 강제 해제에 가려지지 않는 순수 리셋 검증)
 *   · 고정 A → B 프리필 실패: A 의 체크·제목·본문·기간 잔존 없음 + stale payload 미제출
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MESSAGES } from '@/lib/messages';
import { api } from '@/services/api-client';
import NoticeCreatePage from '@/app/(common)/notices-create/page';

jest.mock('@/services/api-client', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
let mockEditId: string | null = null;
jest.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === 'edit' ? mockEditId : null),
  }),
}));
jest.mock('@/hooks/usePageReady', () => ({ usePageReady: () => {} }));
jest.mock('@/hooks/useNativeUI', () => ({ useNativeUI: () => {} }));
jest.mock('@/lib/refresh-bus', () => ({
  emitRefresh: jest.fn(),
  REFRESH_KEYS: { NOTICES: ['notices'] },
}));
jest.mock('@/components/ui/NavLink', () => ({
  useNavigation: () => ({ back: jest.fn(), navigate: jest.fn() }),
}));
const mockToastError = jest.fn();
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({
    toast: { success: jest.fn(), error: mockToastError, info: jest.fn() },
  }),
}));
jest.mock('@/components/layout/MobileContainer', () => ({
  MobileContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
jest.mock('@/components/layout/PageAppBar', () => ({
  PageAppBar: ({ title }: { title: string }) => <header>{title}</header>,
}));

const mockGet = api.get as jest.Mock;
const mockPost = api.post as jest.Mock;
const mockPatch = api.patch as jest.Mock;

/** URL 라우팅형 get mock — manage/teams + admin/list(팀별 풀 행) + 상세 프리필(공지별) */
function routeGet({
  teams = [{ id: 't1', name: 'A팀' }] as Array<{ id: string; name: string }>,
  poolRows = [] as Array<{ id: string; isPinned?: boolean }>,
  poolByTeam = {} as Record<
    string,
    | Array<{ id: string; isPinned?: boolean }>
    | Promise<Array<{ id: string; isPinned?: boolean }>>
  >,
  editNotice = null as Record<string, unknown> | null,
  editById = {} as Record<
    string,
    Record<string, unknown> | Promise<Record<string, unknown>>
  >,
} = {}) {
  mockGet.mockImplementation((url: string) => {
    if (url.includes('/notices/manage/teams')) {
      return Promise.resolve({ success: true, data: { data: teams } });
    }
    if (url.includes('/notices/admin/list')) {
      const teamId = /teamId=([^&]+)/.exec(url)?.[1];
      const rows =
        teamId && teamId in poolByTeam ? poolByTeam[teamId] : poolRows;
      return Promise.resolve(rows).then((r) => ({
        success: true,
        data: { data: r },
      }));
    }
    // 수정 모드 상세 프리필 — /notices/{id}
    const noticeId = url.split('/').pop() ?? '';
    if (noticeId in editById) {
      return Promise.resolve(editById[noticeId]).then((n) => ({
        success: true,
        data: n,
      }));
    }
    return Promise.resolve({ success: true, data: editNotice });
  });
}

const FULL_POOL = [
  { id: 'p1', isPinned: true },
  { id: 'p2', isPinned: true },
];

const TWO_TEAMS = [
  { id: 't1', name: 'A팀' },
  { id: 't2', name: 'B팀' },
];

/** 외부에서 resolve 시점을 제어하는 지연 응답 */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEditId = null;
  routeGet();
});

async function fillAndSubmit() {
  fireEvent.change(screen.getByPlaceholderText(MESSAGES.placeholders.enterTitleSimple), {
    target: { value: '고정 공지 제목' },
  });
  fireEvent.change(screen.getByPlaceholderText('내용을 입력하세요...'), {
    target: { value: '열 자 이상이 되는 본문입니다.' },
  });
  fireEvent.click(screen.getByRole('button', { name: /등록하기/ }));
}

describe('notices-create — 고정 한도 사전 안내 (풀 기준 정확 판정)', () => {
  it('대상 팀 풀이 가득(고정 2)이면 체크박스가 비활성화되고 pinnedFull 안내가 뜬다', async () => {
    routeGet({
      poolRows: [
        { id: 'p1', isPinned: true },
        { id: 'p2', isPinned: true },
        { id: 'n1', isPinned: false },
      ],
    });

    render(<NoticeCreatePage />);

    await waitFor(() => expect(screen.getByRole('checkbox')).toBeDisabled());
    expect(screen.getByText(MESSAGES.notice.pinnedFull)).toBeInTheDocument();
    // 풀 판정 쿼리 = 대상 팀 관리 목록 (미게시·만료 포함하는 admin/list)
    const poolCall = mockGet.mock.calls.find((c: [string]) =>
      c[0].includes('/notices/admin/list'),
    );
    expect(poolCall[0]).toContain('scope=team');
    expect(poolCall[0]).toContain('teamId=t1');
  });

  it('풀에 여유(고정 1)가 있으면 체크박스는 활성 — 전 팀 합산 오차단 재발 방지', async () => {
    routeGet({ poolRows: [{ id: 'p1', isPinned: true }] });

    render(<NoticeCreatePage />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /등록하기/ })).toBeEnabled(),
    );
    expect(screen.getByRole('checkbox')).toBeEnabled();
    expect(screen.getByText(MESSAGES.notice.pinnedHint)).toBeInTheDocument();
  });

  it('수정 모드는 자기 자신을 제외하고 센다 — 고정된 공지의 수정은 막히지 않는다', async () => {
    mockEditId = 'p2';
    routeGet({
      poolRows: [
        { id: 'p1', isPinned: true },
        { id: 'p2', isPinned: true }, // 수정 중인 자기 자신
      ],
      editNotice: {
        id: 'p2',
        title: '고정된 공지',
        content: '열 자 이상이 되는 본문입니다.',
        pinned: true,
        targetTeamId: 't1',
      },
    });

    render(<NoticeCreatePage />);

    // 자기 제외 시 풀 사용량 1 → 비활성화되지 않는다
    await waitFor(() =>
      expect(screen.getByRole('checkbox')).toBeChecked(),
    );
    expect(screen.getByRole('checkbox')).toBeEnabled();
  });
});

describe('notices-create — R6 풀 전환 상태기계', () => {
  it('A팀(full) 확정 후 B팀(여유)으로 바꾸면 즉시 이전 판정을 폐기하고 활성으로 돌아온다', async () => {
    routeGet({
      teams: TWO_TEAMS,
      poolByTeam: { t1: FULL_POOL, t2: [] },
    });

    render(<NoticeCreatePage />);
    const select = await screen.findByRole('combobox');

    fireEvent.change(select, { target: { value: 't1' } });
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeDisabled());

    fireEvent.change(select, { target: { value: 't2' } });
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeEnabled());
    expect(screen.getByText(MESSAGES.notice.pinnedHint)).toBeInTheDocument();
  });

  it('여유 풀에서 체크한 뒤 full 팀으로 전환하면 체크가 강제 해제되고 비활성화된다', async () => {
    routeGet({
      teams: TWO_TEAMS,
      poolByTeam: { t1: FULL_POOL, t2: [] },
    });

    render(<NoticeCreatePage />);
    const select = await screen.findByRole('combobox');

    fireEvent.change(select, { target: { value: 't2' } });
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeEnabled());
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('checkbox')).toBeChecked();

    fireEvent.change(select, { target: { value: 't1' } });
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeDisabled());
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByText(MESSAGES.notice.pinnedFull)).toBeInTheDocument();
  });

  it('풀 응답 대기 중 체크했다가 full 응답이 도착하면 강제 해제된다', async () => {
    const pending = deferred<Array<{ id: string; isPinned?: boolean }>>();
    routeGet({ poolByTeam: { t1: pending.promise }, teams: [{ id: 't1', name: 'A팀' }] });

    render(<NoticeCreatePage />);

    // 응답 전 fail-open 상태에서 체크
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeEnabled());
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('checkbox')).toBeChecked();

    pending.resolve(FULL_POOL);

    await waitFor(() => expect(screen.getByRole('checkbox')).toBeDisabled());
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('팀 전환 후 늦게 도착한 이전 풀(full) 응답은 무시된다', async () => {
    const slowA = deferred<Array<{ id: string; isPinned?: boolean }>>();
    routeGet({
      teams: TWO_TEAMS,
      poolByTeam: { t1: slowA.promise, t2: [] },
    });

    render(<NoticeCreatePage />);
    const select = await screen.findByRole('combobox');

    fireEvent.change(select, { target: { value: 't1' } }); // A 조회 시작 (미도착)
    fireEvent.change(select, { target: { value: 't2' } }); // B 로 전환 → A 조회 취소
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeEnabled());

    slowA.resolve(FULL_POOL); // 늦은 A(full) 응답

    // 현재 풀은 B(여유) — 이전 풀 판정이 덮어쓰지 않는다
    await waitFor(() =>
      expect(screen.getByText(MESSAGES.notice.pinnedHint)).toBeInTheDocument(),
    );
    expect(screen.getByRole('checkbox')).toBeEnabled();
  });

  it('원래 고정돼 있던 공지의 수정은 full 판정과 무관하게 해제가 가능하다', async () => {
    mockEditId = 'p2';
    routeGet({
      // 자기 제외 후에도 2개 남는 데이터 이상 상황 — wasPinned 가드가 없으면 잠긴다
      poolRows: [
        { id: 'p1', isPinned: true },
        { id: 'p3', isPinned: true },
        { id: 'p2', isPinned: true },
      ],
      editNotice: {
        id: 'p2',
        title: '고정된 공지',
        content: '열 자 이상이 되는 본문입니다.',
        pinned: true,
        targetTeamId: 't1',
      },
    });

    render(<NoticeCreatePage />);

    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());
    expect(screen.getByRole('checkbox')).toBeEnabled();

    // 고정 해제 경로 보존
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });
});

describe('notices-create — R7 identity 전환 (editId 결합)', () => {
  it('A팀(full) 확정 후 B팀 전환 — B 응답 대기 중에도 이전 full 판정이 즉시 폐기된다', async () => {
    const slowB = deferred<Array<{ id: string; isPinned?: boolean }>>();
    routeGet({
      teams: TWO_TEAMS,
      poolByTeam: { t1: FULL_POOL, t2: slowB.promise },
    });

    render(<NoticeCreatePage />);
    const select = await screen.findByRole('combobox');

    fireEvent.change(select, { target: { value: 't1' } });
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeDisabled());

    // B 응답이 아직 도착하지 않은 pending 구간 — 이전 A(full) 판정이 남아 있으면 안 된다
    fireEvent.change(select, { target: { value: 't2' } });
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeEnabled());
    expect(screen.getByText(MESSAGES.notice.pinnedHint)).toBeInTheDocument();

    // B(여유) 응답 도착 후에도 활성 유지
    slowB.resolve([]);
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeEnabled());
    expect(screen.getByText(MESSAGES.notice.pinnedHint)).toBeInTheDocument();
  });

  it('고정 공지 편집 → 작성 모드 전환 시 wasPinned 가 폐기되어 full 풀 방어가 다시 걸린다', async () => {
    mockEditId = 'p2';
    routeGet({
      poolRows: [
        { id: 'p1', isPinned: true },
        { id: 'p3', isPinned: true },
        { id: 'p2', isPinned: true },
      ],
      editNotice: {
        id: 'p2',
        title: '고정된 공지',
        content: '열 자 이상이 되는 본문입니다.',
        pinned: true,
        targetTeamId: 't1',
      },
    });

    const { rerender } = render(<NoticeCreatePage />);

    // 편집 중에는 wasPinned 로 활성 (데이터 이상 full 이어도 해제 경로 보존)
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());
    expect(screen.getByRole('checkbox')).toBeEnabled();

    // 같은 페이지 인스턴스에서 ?edit 제거 (작성 모드 전환)
    mockEditId = null;
    rerender(<NoticeCreatePage />);

    // identity 폐기 → 신규 작성으로서 full 풀 방어 적용 (자기 제외 없음 → 3개 full)
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeDisabled());
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByText(MESSAGES.notice.pinnedFull)).toBeInTheDocument();
  });

  it('A→B 편집 전환 중 늦게 도착한 A(고정) 프리필 응답은 무시된다 — B identity 유지', async () => {
    const slowA = deferred<Record<string, unknown>>();
    mockEditId = 'a';
    routeGet({
      poolRows: FULL_POOL,
      editById: {
        a: slowA.promise, // 고정 공지 — 늦게 도착
        b: {
          id: 'b',
          title: '미고정 공지',
          content: '열 자 이상이 되는 본문입니다.',
          pinned: false,
          targetTeamId: 't1',
        },
      },
    });

    const { rerender } = render(<NoticeCreatePage />);

    // A 프리필 미도착 상태에서 B 편집으로 전환
    mockEditId = 'b';
    rerender(<NoticeCreatePage />);

    // B(미고정) identity 확정 → full 풀 방어
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeDisabled());
    expect(screen.getByRole('checkbox')).not.toBeChecked();

    // 늦은 A(고정) 응답 — 이전 identity 를 되살리면 안 된다
    slowA.resolve({
      id: 'a',
      title: '고정 공지',
      content: '열 자 이상이 되는 본문입니다.',
      pinned: true,
      targetTeamId: 't1',
    });
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeDisabled());
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('프리필 실패 시 대상 풀 미확정 → 판정 보류 (풀 조회 없이 fail-open)', async () => {
    mockEditId = 'x';
    routeGet({ poolRows: FULL_POOL, editNotice: null }); // 프리필 data 없음 = 실패

    render(<NoticeCreatePage />);

    await waitFor(() => expect(screen.getByRole('checkbox')).toBeEnabled());
    // 대상 팀을 모르면 풀 판정 자체를 보류 — admin/list 조회가 없어야 한다
    const poolCalls = mockGet.mock.calls.filter((c: [string]) =>
      c[0].includes('/notices/admin/list'),
    );
    expect(poolCalls).toHaveLength(0);
  });

  it('full 상태 제출 payload 는 isPinned:false 로 방어된다', async () => {
    routeGet({ poolRows: FULL_POOL });
    mockPost.mockResolvedValue({ success: true, data: {} });

    render(<NoticeCreatePage />);
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeDisabled());

    await fillAndSubmit();

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost).toHaveBeenCalledWith(
      '/notices',
      expect.objectContaining({ isPinned: false }),
    );
  });
});

describe('notices-create — R8 editId 변경 시 프리필 소유 폼 상태 리셋', () => {
  it('고정 공지 편집 → 작성 전환(여유 풀): 체크 해제·빈 폼이 되고 POST 는 isPinned:false 다', async () => {
    mockEditId = 'p2';
    // 풀 = 자기 자신 1개뿐 — 편집(자기 제외 0)·작성(1) 모두 여유.
    // full 강제 해제가 개입하지 않으므로 체크 해제는 순수하게 리셋의 결과다.
    routeGet({
      poolRows: [{ id: 'p2', isPinned: true }],
      editNotice: {
        id: 'p2',
        title: '이전 고정 공지',
        content: '이전 공지의 본문 열 자 이상.',
        pinned: true,
        targetTeamId: 't1',
        startAt: '2026-08-01T00:00:00.000Z',
      },
    });
    mockPost.mockResolvedValue({ success: true, data: {} });

    const { rerender } = render(<NoticeCreatePage />);

    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());
    expect(screen.getByDisplayValue('이전 고정 공지')).toBeInTheDocument();

    // 같은 페이지 인스턴스에서 ?edit 제거 (작성 모드 전환)
    mockEditId = null;
    rerender(<NoticeCreatePage />);

    await waitFor(() =>
      expect(screen.getByRole('checkbox')).not.toBeChecked(),
    );
    expect(screen.getByRole('checkbox')).toBeEnabled(); // 여유 풀 — full 방어가 아닌 리셋
    expect(screen.queryByDisplayValue('이전 고정 공지')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('이전 공지의 본문 열 자 이상.')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('2026-08-01')).not.toBeInTheDocument();

    // 새로 채워 제출해도 이전 공지의 체크가 실리지 않는다
    await fillAndSubmit();
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost).toHaveBeenCalledWith(
      '/notices',
      expect.objectContaining({ isPinned: false, title: '고정 공지 제목' }),
    );
  });

  it('고정 A → B 편집 전환 + B 프리필 실패: A 폼 상태가 남지 않고 stale payload 도 제출되지 않는다', async () => {
    mockEditId = 'a';
    routeGet({
      poolRows: FULL_POOL,
      editById: {
        a: {
          id: 'a',
          title: 'A 고정 공지',
          content: 'A 공지의 본문 열 자 이상.',
          pinned: true,
          targetTeamId: 't1',
          startAt: '2026-08-01T00:00:00.000Z',
        },
        // b 는 미등록 → fallback editNotice(null) = 프리필 실패 (data 없음)
      },
    });

    const { rerender } = render(<NoticeCreatePage />);

    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());
    expect(screen.getByDisplayValue('A 고정 공지')).toBeInTheDocument();

    mockEditId = 'b';
    rerender(<NoticeCreatePage />);

    // A 의 체크·제목·본문·기간 전부 폐기 (B 는 빈 폼)
    await waitFor(() =>
      expect(screen.getByRole('checkbox')).not.toBeChecked(),
    );
    expect(screen.queryByDisplayValue('A 고정 공지')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('A 공지의 본문 열 자 이상.')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('2026-08-01')).not.toBeInTheDocument();

    // 빈 폼 그대로 제출 시도 → 검증에 걸려 stale PATCH 가 나가지 않는다
    fireEvent.click(screen.getByRole('button', { name: /수정하기/ }));
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        MESSAGES.noticesCreate.titleMinLength,
      ),
    );
    expect(mockPatch).not.toHaveBeenCalled();
  });
});

describe('notices-create — 서버 409 백스톱', () => {
  it('409 NOTICE_PIN_LIMIT 응답은 pinnedFull 문구로 안내한다 (레이스 최종 판정)', async () => {
    mockPost.mockResolvedValue({
      success: false,
      error: {
        code: 'NOTICE_PIN_LIMIT',
        message: '상단 고정은 최대 2개까지 가능합니다.',
        statusCode: 409,
      },
    });

    render(<NoticeCreatePage />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /등록하기/ })).toBeEnabled(),
    );

    await fillAndSubmit();

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(MESSAGES.notice.pinnedFull),
    );
  });

  it('풀 카운트 조회 실패 시에는 막지 않는다 — 오차단보다 서버 409 안내', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/notices/manage/teams')) {
        return Promise.resolve({
          success: true,
          data: { data: [{ id: 't1', name: 'A팀' }] },
        });
      }
      return Promise.reject(new Error('network'));
    });

    render(<NoticeCreatePage />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /등록하기/ })).toBeEnabled(),
    );
    expect(screen.getByRole('checkbox')).toBeEnabled();
  });
});
