const mockRequestHandlers: Array<(config: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>> = [];
const mockResponseHandlers: Array<(response: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>> = [];
const mockAxiosPost = jest.fn();

function createHeaders(initial?: Record<string, unknown>) {
  return {
    ...(initial ?? {}),
    set(key: string, value: string) {
      this[key] = value;
    },
  };
}

const mockAxiosRequest = jest.fn(async (config: Record<string, unknown>) => {
  let nextConfig = {
    ...config,
    headers: createHeaders(config.headers as Record<string, unknown> | undefined),
  };

  for (const handler of mockRequestHandlers) {
    nextConfig = await handler(nextConfig);
  }

  let response = {
    status: 200,
    data: { ok: true },
    headers: {},
    config: nextConfig,
  };

  for (const handler of mockResponseHandlers) {
    response = await handler(response);
  }

  return response;
});

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({
      request: mockAxiosRequest,
      interceptors: {
        request: {
          use: jest.fn((fulfilled) => {
            mockRequestHandlers.push(fulfilled);
          }),
        },
        response: {
          use: jest.fn((fulfilled) => {
            mockResponseHandlers.push(fulfilled);
          }),
        },
      },
    })),
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

describe('api-client', () => {
  beforeEach(() => {
    jest.resetModules();
    mockRequestHandlers.length = 0;
    mockResponseHandlers.length = 0;
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
});
