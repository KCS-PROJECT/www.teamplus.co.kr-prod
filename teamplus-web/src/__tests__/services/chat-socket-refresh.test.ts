// ChatSocket 토큰 갱신 회귀 테스트.
//
// 핵심 회귀 방지 대상:
//  1) 서버의 token_expired / token:refresh_required 수신 시 **실제로 갱신**한다.
//     저장소만 읽으면(hybridAuth.getToken) 만료된 토큰을 그대로 다시 써서 서버가 또 거부한다.
//  2) 갱신이 서버에 닿지 못하면(null) 세션 판정이 아니므로 포기하지 않고 백오프 재연결을 예약한다.
//     (예약 없이 error 로 끝내면 순단 후 소켓이 살아나지 않는다)

/** io() 가 돌려주는 가짜 소켓 — 등록된 이벤트 핸들러를 보관해 테스트가 직접 발화시킨다. */
interface FakeSocket {
  auth: Record<string, unknown>;
  handlers: Map<string, (payload?: unknown) => void>;
  connected: boolean;
  on: jest.Mock;
  off: jest.Mock;
  onAny: jest.Mock;
  offAny: jest.Mock;
  emit: jest.Mock;
  connect: jest.Mock;
  disconnect: jest.Mock;
  removeAllListeners: jest.Mock;
}

const createdSockets: FakeSocket[] = [];

function makeFakeSocket(auth: Record<string, unknown>): FakeSocket {
  const handlers = new Map<string, (payload?: unknown) => void>();
  return {
    auth,
    handlers,
    connected: false,
    on: jest.fn((event: string, cb: (payload?: unknown) => void) => {
      handlers.set(event, cb);
    }),
    off: jest.fn(),
    onAny: jest.fn(),
    offAny: jest.fn(),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    removeAllListeners: jest.fn(),
  };
}

const mockIo = jest.fn((_url: string, opts: { auth?: Record<string, unknown> }) => {
  const socket = makeFakeSocket(opts?.auth ?? {});
  createdSockets.push(socket);
  return socket;
});

jest.mock('socket.io-client', () => ({
  __esModule: true,
  io: (...args: unknown[]) =>
    mockIo(...(args as [string, { auth?: Record<string, unknown> }])),
}));

const mockGetToken = jest.fn();
jest.mock('@/services/hybrid-auth', () => ({
  hybridAuth: { getToken: mockGetToken },
}));

const mockEnsureFresh = jest.fn();
jest.mock('@/services/api-client', () => ({
  ensureFreshAccessToken: () => mockEnsureFresh(),
}));

const OLD_TOKEN = 'old.access.token';
const NEW_TOKEN = 'new.access.token';

/** 마지막으로 만들어진 소켓의 특정 이벤트를 서버가 보낸 것처럼 발화시킨다. */
function fire(event: string): void {
  const socket = createdSockets[createdSockets.length - 1];
  const handler = socket.handlers.get(event);
  if (!handler) throw new Error(`핸들러 없음: ${event}`);
  handler();
}

/** 마이크로태스크 큐를 비운다(갱신은 async · jsdom 에는 setImmediate 가 없다). */
const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe('chat-socket 토큰 갱신', () => {
  let chatSocket: typeof import('@/services/chat-socket').chatSocket;

  beforeEach(async () => {
    jest.resetModules();
    jest.useFakeTimers();
    createdSockets.length = 0;
    mockIo.mockClear();
    mockGetToken.mockReset().mockResolvedValue({
      accessToken: OLD_TOKEN,
      refreshToken: 'refresh.token',
    });
    mockEnsureFresh.mockReset();

    ({ chatSocket } = await import('@/services/chat-socket'));
    chatSocket.acquire(); // 첫 소비자 → connect()
    await flush();
  });

  afterEach(() => {
    chatSocket.release();
    jest.useRealTimers();
  });

  it('최초 연결은 저장소의 토큰을 쓴다', () => {
    expect(createdSockets).toHaveLength(1);
    expect(createdSockets[0].auth).toEqual({ token: OLD_TOKEN });
  });

  it('token_expired 수신 시 실제로 갱신해 새 토큰으로 다시 연결한다', async () => {
    mockEnsureFresh.mockResolvedValue(NEW_TOKEN);

    fire('token_expired');
    await flush();

    // 저장소 읽기가 아니라 갱신 함수를 불러야 한다.
    expect(mockEnsureFresh).toHaveBeenCalledTimes(1);
    expect(createdSockets).toHaveLength(2);
    expect(createdSockets[1].auth).toEqual({ token: NEW_TOKEN });
  });

  it('token:refresh_required(만료 5분 전) 도 같은 경로를 탄다', async () => {
    mockEnsureFresh.mockResolvedValue(NEW_TOKEN);

    fire('token:refresh_required');
    await flush();

    expect(mockEnsureFresh).toHaveBeenCalledTimes(1);
    expect(createdSockets[1].auth).toEqual({ token: NEW_TOKEN });
  });

  it('갱신이 서버에 닿지 못하면 재연결을 예약한다(포기하지 않음)', async () => {
    mockEnsureFresh.mockResolvedValue(null);

    fire('token_expired');
    await flush();

    // 새 소켓을 만들지 않고, 백오프 재연결이 예약돼야 한다(reconnecting = 타이머 예약됨).
    expect(createdSockets).toHaveLength(1);
    expect(chatSocket.getStatus()).toBe('reconnecting');

    // 백오프(2^1 * 2000ms ± 10%) 경과 후 재연결 시도.
    mockEnsureFresh.mockResolvedValue(NEW_TOKEN);
    jest.advanceTimersByTime(5000);
    await flush();

    expect(createdSockets.length).toBeGreaterThan(1);
  });

  it('갱신 중 예외가 나도 재연결을 예약한다', async () => {
    mockEnsureFresh.mockRejectedValue(new Error('network down'));

    fire('token_expired');
    await flush();

    expect(chatSocket.getStatus()).toBe('reconnecting');
    jest.advanceTimersByTime(5000);
    await flush();

    expect(createdSockets.length).toBeGreaterThan(1);
  });
});
