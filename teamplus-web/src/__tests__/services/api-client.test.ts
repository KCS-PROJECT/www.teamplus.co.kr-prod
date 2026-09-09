const mockRequestHandlers: Array<(config: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>> = [];
const mockResponseHandlers: Array<(response: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>> = [];
const mockRejectedHandlers: Array<(error: unknown) => Promise<unknown> | unknown> = [];
const mockAxiosPost = jest.fn();
// 테스트별 응답기 — 없으면 200. 던지면 axios 거부 경로(응답 인터셉터 rejected 핸들러)를 탄다.
let mockResponder: ((config: Record<string, unknown>) => Promise<Record<string, unknown>>) | null = null;

function createHeaders(initial?: Record<string, unknown>) {
  return {
    ...(initial ?? {}),
    set(key: string, value: string) {
      this[key] = value;
    },
    get(key: string) {
      return this[key];
    },
  };
}

/** lifecycle 훅은 마이크로태스크로 호출된다(runOnError) — 단언 전에 한 틱 비운다. */
const flushHooks = () => new Promise((resolve) => setTimeout(resolve, 0));

const mockAxiosRequest = jest.fn(async (config: Record<string, unknown>) => {
  let nextConfig = {
    ...config,
    headers: createHeaders(config.headers as Record<string, unknown> | undefined),
  };

  for (const handler of mockRequestHandlers) {
    nextConfig = await handler(nextConfig);
  }

  let response: Record<string, unknown>;
  try {
    response = mockResponder
      ? await mockResponder(nextConfig)
      : { status: 200, data: { ok: true }, headers: {}, config: nextConfig };
  } catch (err) {
    // axios 와 동일 — rejected 핸들러가 값을 돌려주면 복구, 다시 던지면 다음 핸들러로 전파.
    let current: unknown = err;
    for (const handler of mockRejectedHandlers) {
      try {
        return await handler(current);
      } catch (next) {
        current = next;
      }
    }
    throw current;
  }

  for (const handler of mockResponseHandlers) {
    response = await handler(response);
  }

  return response;
});

// axios 인스턴스는 호출 가능해야 한다 — 갱신 성공 후 재시도가 `apiClient(originalRequest)` 로 호출된다.
const mockAxiosInstance = Object.assign(
  jest.fn((config: Record<string, unknown>) => mockAxiosRequest(config)),
  {
    request: mockAxiosRequest,
    interceptors: {
      request: {
        use: jest.fn((fulfilled) => {
          mockRequestHandlers.push(fulfilled);
        }),
      },
      response: {
        use: jest.fn((fulfilled, rejected) => {
          mockResponseHandlers.push(fulfilled);
          if (rejected) mockRejectedHandlers.push(rejected);
        }),
      },
    },
  },
);

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => mockAxiosInstance),
    post: mockAxiosPost,
  },
}));

const mockGetToken = jest.fn();
const mockSaveToken = jest.fn();
const mockClearToken = jest.fn();

jest.mock('@/services/hybrid-auth', () => ({
  hybridAuth: {
    getToken: mockGetToken,
    saveToken: mockSaveToken,
    clearToken: mockClearToken,
  },
}));

jest.mock('@/lib/environment', () => ({
  isNativeApp: jest.fn(() => false),
}));

/** 원 요청이 401 로 거부되도록 하는 응답기 — config 를 붙여 인터셉터가 originalRequest 를 복원하게 한다. */
function reject401(config: Record<string, unknown>): Promise<Record<string, unknown>> {
  return Promise.reject({
    isAxiosError: true,
    message: 'Request failed with status code 401',
    config,
    response: {
      status: 401,
      data: { errorCode: 'TOKEN_EXPIRED', message: '토큰이 만료되었습니다.' },
      headers: {},
    },
  });
}

describe('api-client', () => {
  beforeEach(() => {
    jest.resetModules();
    mockRequestHandlers.length = 0;
    mockResponseHandlers.length = 0;
    mockRejectedHandlers.length = 0;
    mockResponder = null;
    mockAxiosRequest.mockClear();
    mockAxiosPost.mockReset();
    mockGetToken.mockReset();
    mockSaveToken.mockReset();
    mockClearToken.mockReset();
  });

  it('공개 API는 만료 토큰 확인과 refresh를 건너뛴다', async () => {
    mockGetToken.mockResolvedValue({
      accessToken: 'expired.access.token',
      refreshToken: 'refresh-token',
    });

    const { api } = await import('@/services/api-client');
    const response = await api.get('/app/settings');

    expect(response.success).toBe(true);
    expect(mockAxiosRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', url: '/app/settings' }),
    );
    expect(mockGetToken).not.toHaveBeenCalled();
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  describe('401 후 토큰 갱신 실패', () => {
    // exp 없는 형식상 JWT — 요청 인터셉터가 만료로 보지 않아 헤더를 붙이고, 갱신 형식 검사도 통과한다.
    const tokens = { accessToken: 'a.b.c', refreshToken: 'r.e.f' };

    async function loadWithErrorSpy() {
      const { apiLifecycle } = await import('@/services/api-lifecycle');
      const onError = jest.fn();
      apiLifecycle.subscribe({ onError });
      const { api } = await import('@/services/api-client');
      return { api, onError };
    }

    it('갱신 요청이 서버에 닿지 못하면 토큰을 유지하고 원 요청을 전송 오류로 돌려준다', async () => {
      mockGetToken.mockResolvedValue(tokens);
      mockResponder = reject401;
      mockAxiosPost.mockRejectedValue({
        isAxiosError: true,
        code: 'ERR_NETWORK',
        message: 'Network Error',
      });
      const { api, onError } = await loadWithErrorSpy();

      const res = await api.post('/classes/x/schedules/apply-draft', {}, { retry: false });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('NETWORK_ERROR');
      expect(res.error?.statusCode).not.toBe(401);
      expect(mockClearToken).not.toHaveBeenCalled();
      // 401 컨텍스트로 onError 가 나가면 lifecycle 훅이 세션 만료로 분류한다 — 전송 오류로만 기록돼야 한다.
      await flushHooks();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0]).toMatchObject({ code: 'REFRESH_UNAVAILABLE' });
      expect(onError.mock.calls[0][0].status).toBeUndefined();
    });

    it('갱신 응답 envelope 을 벗겨 토큰을 저장하고 원 요청을 새 토큰으로 재시도한다', async () => {
      mockGetToken.mockResolvedValue(tokens);
      // 재시도는 요청 인터셉터를 다시 거쳐 저장소에서 토큰을 읽는다 — 저장이 조회에 반영되게 한다.
      mockSaveToken.mockImplementation(async (next: { accessToken: string; refreshToken: string }) => {
        mockGetToken.mockResolvedValue(next);
      });
      let calls = 0;
      const seenAuth: unknown[] = [];
      mockResponder = async (config) => {
        calls += 1;
        seenAuth.push((config.headers as Record<string, unknown>).Authorization);
        if (calls === 1) return reject401(config);
        return { status: 200, data: { ok: true }, headers: {}, config };
      };
      mockAxiosPost.mockResolvedValue({
        data: {
          success: true,
          requestId: 'req-1',
          data: { accessToken: 'n.e.w', refreshToken: 'n.r.t' },
        },
      });
      const { api, onError } = await loadWithErrorSpy();

      const res = await api.post('/classes/x/schedules/apply-draft', {}, { retry: false });

      expect(res.success).toBe(true);
      expect(mockSaveToken).toHaveBeenCalledWith({ accessToken: 'n.e.w', refreshToken: 'n.r.t' });
      expect(mockClearToken).not.toHaveBeenCalled();
      expect(calls).toBe(2);
      expect(seenAuth[1]).toBe('Bearer n.e.w');
      await flushHooks();
      expect(onError).not.toHaveBeenCalled();
    });

    it('갱신 응답(200)에 토큰이 없으면 저장하지 않고 토큰도 지우지 않는다', async () => {
      mockGetToken.mockResolvedValue(tokens);
      mockResponder = reject401;
      mockAxiosPost.mockResolvedValue({ data: { success: true, requestId: 'req-2', data: {} } });
      const { api, onError } = await loadWithErrorSpy();

      const res = await api.post('/classes/x/schedules/apply-draft', {}, { retry: false });

      expect(res.success).toBe(false);
      expect(mockSaveToken).not.toHaveBeenCalled();
      expect(mockClearToken).not.toHaveBeenCalled();
      await flushHooks();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0]).toMatchObject({ code: 'REFRESH_UNAVAILABLE' });
    });

    it('갱신 요청이 429(요청 제한)이면 세션 판정으로 보지 않고 원 요청만 실패시킨다', async () => {
      mockGetToken.mockResolvedValue(tokens);
      mockResponder = reject401;
      mockAxiosPost.mockRejectedValue({
        isAxiosError: true,
        message: 'Request failed with status code 429',
        response: { status: 429, data: { message: '요청이 너무 많습니다.' }, headers: {} },
      });
      const { api, onError } = await loadWithErrorSpy();

      const res = await api.post('/classes/x/schedules/apply-draft', {}, { retry: false });

      expect(res.success).toBe(false);
      expect(res.error?.statusCode).toBe(429);
      expect(mockClearToken).not.toHaveBeenCalled();
      await flushHooks();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0]).toMatchObject({ code: 'REFRESH_UNAVAILABLE' });
      expect(onError.mock.calls[0][0].status).toBeUndefined();
    });

    it('갱신 요청을 서버가 401 로 거부하면 토큰을 지우고 401 을 그대로 전달한다', async () => {
      mockGetToken.mockResolvedValue(tokens);
      mockResponder = reject401;
      mockAxiosPost.mockRejectedValue({
        isAxiosError: true,
        message: 'Request failed with status code 401',
        response: { status: 401, data: { message: '세션이 만료되었습니다.' }, headers: {} },
      });
      const { api, onError } = await loadWithErrorSpy();

      const res = await api.post('/classes/x/schedules/apply-draft', {}, { retry: false });

      expect(res.success).toBe(false);
      expect(res.error?.statusCode).toBe(401);
      expect(mockClearToken).toHaveBeenCalledTimes(1);
      await flushHooks();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0]).toMatchObject({ status: 401 });
    });
  });
});
