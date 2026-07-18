/**
 * 테스트 헬퍼 유틸리티
 *
 * 하이브리드 API 테스트를 위한 공통 mock 및 헬퍼 함수
 */

import type { TokenData } from "@/services/web-token-storage";

// ============================================
// JWT 토큰 생성 헬퍼
// ============================================

export interface MockJWTOptions {
  /** 만료까지 남은 시간 (밀리초) */
  expiresInMs?: number;
  /** 직접 지정할 exp 값 (초) */
  exp?: number;
  /** 사용자 ID */
  sub?: string;
  /** 유효하지 않은 토큰 생성 여부 */
  invalid?: boolean;
  /** 부분 형식 (2 parts만) */
  malformed?: boolean;
  /** exp 필드 없음 */
  noExp?: boolean;
}

/**
 * 테스트용 Mock JWT 토큰 생성
 *
 * @example
 * // 1시간 후 만료되는 토큰
 * const token = createMockJWT({ expiresInMs: 3600000 });
 *
 * // 이미 만료된 토큰
 * const expiredToken = createMockJWT({ expiresInMs: -1000 });
 *
 * // 5분 내 만료 예정 토큰 (버퍼 테스트)
 * const bufferToken = createMockJWT({ expiresInMs: 4 * 60 * 1000 });
 */
export function createMockJWT(options: MockJWTOptions = {}): string {
  const {
    expiresInMs = 3600000, // 기본 1시간
    exp,
    sub = "test-user-id",
    invalid = false,
    malformed = false,
    noExp = false,
  } = options;

  if (invalid) {
    return "invalid.token";
  }

  if (malformed) {
    return "only.two-parts";
  }

  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));

  const payloadData: Record<string, unknown> = {
    sub,
    iat: Math.floor(Date.now() / 1000),
  };

  if (!noExp) {
    const expTime = exp ?? Math.floor((Date.now() + expiresInMs) / 1000);
    payloadData.exp = expTime;
  }

  const payload = btoa(JSON.stringify(payloadData));
  const signature = "mock-signature-for-testing";

  return `${header}.${payload}.${signature}`;
}

/**
 * 만료된 Mock JWT 토큰 생성
 */
export function createExpiredJWT(sub?: string): string {
  return createMockJWT({ expiresInMs: -60000, sub }); // 1분 전 만료
}

/**
 * 5분 버퍼 내 만료 예정 Mock JWT 토큰 생성
 */
export function createAlmostExpiredJWT(sub?: string): string {
  return createMockJWT({ expiresInMs: 4 * 60 * 1000, sub }); // 4분 후 만료 (5분 버퍼 내)
}

// ============================================
// localStorage Mock 헬퍼
// ============================================

export interface MockLocalStorage {
  getItem: jest.Mock;
  setItem: jest.Mock;
  removeItem: jest.Mock;
  clear: jest.Mock;
  readonly length: number;
  key: jest.Mock;
  /** 테스트용 내부 저장소 직접 접근 */
  __store: Record<string, string>;
  /** 저장소 초기화 */
  __reset: () => void;
  /** 에러 시뮬레이션 설정 */
  __setError: (
    method: "getItem" | "setItem" | "removeItem",
    error: Error | null,
  ) => void;
}

/**
 * localStorage Mock 생성
 *
 * @example
 * const mockStorage = createLocalStorageMock();
 * Object.defineProperty(window, 'localStorage', { value: mockStorage });
 *
 * // 토큰 설정
 * mockStorage.__store['teamplus_auth_token'] = 'test-token';
 *
 * // 에러 시뮬레이션
 * mockStorage.__setError('getItem', new Error('Storage error'));
 */
export function createLocalStorageMock(): MockLocalStorage {
  const store: Record<string, string> = {};
  const errors: Record<string, Error | null> = {
    getItem: null,
    setItem: null,
    removeItem: null,
  };

  const mock: MockLocalStorage = {
    getItem: jest.fn((key: string) => {
      if (errors.getItem) throw errors.getItem;
      return store[key] ?? null;
    }),
    setItem: jest.fn((key: string, value: string) => {
      if (errors.setItem) throw errors.setItem;
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      if (errors.removeItem) throw errors.removeItem;
      delete store[key];
    }),
    clear: jest.fn(() => {
      Object.keys(store).forEach((key) => delete store[key]);
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: jest.fn((index: number) => {
      const keys = Object.keys(store);
      return keys[index] ?? null;
    }),
    __store: store,
    __reset: () => {
      Object.keys(store).forEach((key) => delete store[key]);
      errors.getItem = null;
      errors.setItem = null;
      errors.removeItem = null;
      mock.getItem.mockClear();
      mock.setItem.mockClear();
      mock.removeItem.mockClear();
      mock.clear.mockClear();
      mock.key.mockClear();
    },
    __setError: (method, error) => {
      errors[method] = error;
    },
  };

  return mock;
}

// ============================================
// FlutterBridge Mock 헬퍼
// ============================================

export interface MockFlutterBridge {
  auth: {
    getToken: jest.Mock<Promise<TokenData | null>>;
    saveToken: jest.Mock<Promise<void>>;
    clearToken: jest.Mock<Promise<void>>;
    isAuthenticated: jest.Mock<Promise<boolean>>;
  };
  /** Mock 초기화 */
  __reset: () => void;
  /** 에러 시뮬레이션 설정 */
  __setError: (
    method: keyof MockFlutterBridge["auth"],
    error: Error | null,
  ) => void;
  /** 반환값 설정 */
  __setReturnValue: <K extends keyof MockFlutterBridge["auth"]>(
    method: K,
    value: Awaited<ReturnType<MockFlutterBridge["auth"][K]>>,
  ) => void;
}

/**
 * FlutterBridge Mock 생성
 *
 * @example
 * const mockBridge = createFlutterBridgeMock();
 * (window as any).FlutterBridge = mockBridge;
 *
 * // 토큰 반환 설정
 * mockBridge.__setReturnValue('getToken', { accessToken: 'test', refreshToken: 'refresh' });
 *
 * // 에러 시뮬레이션
 * mockBridge.__setError('saveToken', new Error('Bridge error'));
 */
export function createFlutterBridgeMock(): MockFlutterBridge {
  const errors: Record<string, Error | null> = {
    getToken: null,
    saveToken: null,
    clearToken: null,
    isAuthenticated: null,
  };

  const returnValues: Record<string, unknown> = {
    getToken: null,
    saveToken: undefined,
    clearToken: undefined,
    isAuthenticated: false,
  };

  const mock: MockFlutterBridge = {
    auth: {
      getToken: jest.fn(async () => {
        if (errors.getToken) throw errors.getToken;
        return returnValues.getToken as TokenData | null;
      }),
      saveToken: jest.fn(async () => {
        if (errors.saveToken) throw errors.saveToken;
      }),
      clearToken: jest.fn(async () => {
        if (errors.clearToken) throw errors.clearToken;
      }),
      isAuthenticated: jest.fn(async () => {
        if (errors.isAuthenticated) throw errors.isAuthenticated;
        return returnValues.isAuthenticated as boolean;
      }),
    },
    __reset: () => {
      Object.keys(errors).forEach((key) => {
        errors[key] = null;
      });
      returnValues.getToken = null;
      returnValues.saveToken = undefined;
      returnValues.clearToken = undefined;
      returnValues.isAuthenticated = false;
      mock.auth.getToken.mockClear();
      mock.auth.saveToken.mockClear();
      mock.auth.clearToken.mockClear();
      mock.auth.isAuthenticated.mockClear();
    },
    __setError: (method, error) => {
      errors[method] = error;
    },
    __setReturnValue: (method, value) => {
      returnValues[method] = value;
    },
  };

  return mock;
}

// ============================================
// Window 환경 설정 헬퍼
// ============================================

export type TestEnvironment = "native" | "web" | "server";

export interface WindowEnvironmentSetup {
  localStorage: MockLocalStorage;
  flutterBridge?: MockFlutterBridge;
  cleanup: () => void;
}

// 원본 값 저장
let originalLocalStorage: Storage | undefined;
let originalFlutterBridge: unknown;
let originalFlutterInAppWebView: unknown;

/**
 * 테스트용 Window 환경 설정
 *
 * jsdom 환경에서 window 객체의 속성을 수정하여 환경을 시뮬레이션합니다.
 *
 * @example
 * // Native 환경 설정
 * const { localStorage, flutterBridge, cleanup } = setupWindowEnvironment('native');
 *
 * // 테스트 후 정리
 * cleanup();
 */
export function setupWindowEnvironment(
  env: TestEnvironment,
): WindowEnvironmentSetup {
  const localStorageMock = createLocalStorageMock();
  let flutterBridgeMock: MockFlutterBridge | undefined;

  // 원본 값 백업
  if (typeof window !== "undefined") {
    originalLocalStorage = window.localStorage;
    originalFlutterBridge = (window as Record<string, unknown>).FlutterBridge;
    originalFlutterInAppWebView = (window as Record<string, unknown>)
      .flutter_inappwebview;
  }

  if (env === "server") {
    // Server 환경: window를 완전히 제거하기 어려우므로,
    // 대신 모듈에서 typeof window === 'undefined'를 시뮬레이션하기 위해
    // 특별한 처리가 필요합니다.
    // jsdom에서는 window를 삭제할 수 없으므로, 테스트에서 직접 처리합니다.

    return {
      localStorage: localStorageMock,
      cleanup: () => {
        // 복원 불필요
      },
    };
  }

  // Web 또는 Native 환경: window 속성 수정
  Object.defineProperty(window, "localStorage", {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });

  // FlutterBridge 및 flutter_inappwebview 초기화
  delete (window as Record<string, unknown>).FlutterBridge;
  delete (window as Record<string, unknown>).flutter_inappwebview;

  if (env === "native") {
    flutterBridgeMock = createFlutterBridgeMock();
    (window as Record<string, unknown>).FlutterBridge = flutterBridgeMock;
  }

  return {
    localStorage: localStorageMock,
    flutterBridge: flutterBridgeMock,
    cleanup: () => {
      // 원본 값 복원
      if (originalLocalStorage) {
        Object.defineProperty(window, "localStorage", {
          value: originalLocalStorage,
          writable: true,
          configurable: true,
        });
      }
      delete (window as Record<string, unknown>).FlutterBridge;
      delete (window as Record<string, unknown>).flutter_inappwebview;
      if (originalFlutterBridge) {
        (window as Record<string, unknown>).FlutterBridge =
          originalFlutterBridge;
      }
      if (originalFlutterInAppWebView) {
        (window as Record<string, unknown>).flutter_inappwebview =
          originalFlutterInAppWebView;
      }
    },
  };
}

// ============================================
// 토큰 저장소 키 상수
// ============================================

export const TOKEN_KEYS = {
  ACCESS_TOKEN: "teamplus_auth_token",
  REFRESH_TOKEN: "teamplus_refresh_token",
  TOKEN_EXPIRY: "teamplus_token_expiry",
} as const;

// ============================================
// 테스트 데이터 팩토리
// ============================================

/**
 * 테스트용 TokenData 생성
 */
export function createTestTokenData(overrides?: Partial<TokenData>): TokenData {
  return {
    accessToken: createMockJWT(),
    refreshToken: createMockJWT({ sub: "refresh-token" }),
    ...overrides,
  };
}

/**
 * 만료된 토큰 데이터 생성
 */
export function createExpiredTokenData(): TokenData {
  return {
    accessToken: createExpiredJWT(),
    refreshToken: createMockJWT({ sub: "refresh-token" }),
  };
}

// ============================================
// 콘솔 Mock 헬퍼
// ============================================

export interface ConsoleMock {
  log: jest.SpyInstance;
  warn: jest.SpyInstance;
  error: jest.SpyInstance;
  restore: () => void;
}

/**
 * 콘솔 Mock 설정
 *
 * @example
 * const consoleMock = mockConsole();
 * // 테스트 코드...
 * expect(consoleMock.warn).toHaveBeenCalledWith(expect.stringContaining('warning'));
 * consoleMock.restore();
 */
export function mockConsole(): ConsoleMock {
  const log = jest.spyOn(console, "log").mockImplementation(() => {});
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const error = jest.spyOn(console, "error").mockImplementation(() => {});

  return {
    log,
    warn,
    error,
    restore: () => {
      log.mockRestore();
      warn.mockRestore();
      error.mockRestore();
    },
  };
}

// ============================================
// 환경 변수 Mock 헬퍼
// ============================================

/**
 * NODE_ENV Mock 설정
 */
export function mockNodeEnv(
  env: "development" | "production" | "test",
): () => void {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = env;
  return () => {
    process.env.NODE_ENV = original;
  };
}

// ============================================
// Test Helpers 자체 테스트 (Jest 요구사항 충족)
// ============================================
describe("test-helpers", () => {
  it("createMockJWT가 올바른 JWT 형식을 생성한다", () => {
    const token = createMockJWT();
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
  });

  it("createExpiredJWT가 만료된 토큰을 생성한다", () => {
    const token = createExpiredJWT();
    const parts = token.split(".");
    const payload = JSON.parse(atob(parts[1]));
    expect(payload.exp * 1000).toBeLessThan(Date.now());
  });

  it("createLocalStorageMock이 localStorage 인터페이스를 구현한다", () => {
    const mock = createLocalStorageMock();
    expect(mock.getItem).toBeDefined();
    expect(mock.setItem).toBeDefined();
    expect(mock.removeItem).toBeDefined();
    expect(mock.clear).toBeDefined();
  });

  it("createFlutterBridgeMock이 FlutterBridge 인터페이스를 구현한다", () => {
    const mock = createFlutterBridgeMock();
    expect(mock.auth.getToken).toBeDefined();
    expect(mock.auth.saveToken).toBeDefined();
    expect(mock.auth.clearToken).toBeDefined();
    expect(mock.auth.isAuthenticated).toBeDefined();
  });

  it("mockConsole이 콘솔 메서드를 mock한다", () => {
    const consoleMock = mockConsole();
    console.log("test");
    expect(consoleMock.log).toHaveBeenCalled();
    consoleMock.restore();
  });
});
