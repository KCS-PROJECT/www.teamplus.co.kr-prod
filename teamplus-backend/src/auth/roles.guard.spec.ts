import { Test } from "@nestjs/testing";
import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";
import { ROLES_KEY } from "./roles.decorator";
import { IS_PUBLIC_KEY } from "./public.decorator";

describe("RolesGuard", () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RolesGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * RolesGuard 는 IS_PUBLIC_KEY 와 ROLES_KEY 두 메타데이터를 순서대로 조회한다.
   * 테스트에서 둘을 구분해 mock 해야 IS_PUBLIC_KEY 호출이 ROLES 값으로 오염되지
   * 않는다 (그러지 않으면 isPublic=truthy 로 평가되어 RolesGuard 가 잘못 우회됨).
   */
  const mockMetadata = (
    opts: { isPublic?: boolean; roles?: string[] | undefined } = {},
  ) => {
    jest.spyOn(reflector, "getAllAndOverride").mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) return opts.isPublic ?? false;
      if (key === ROLES_KEY) return opts.roles;
      return undefined;
    });
  };

  it("should be defined", () => {
    expect(guard).toBeDefined();
  });

  it("should return true if no roles required", () => {
    mockMetadata({ roles: undefined });

    const mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { userType: "COACH", id: "user-123" },
        }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;

    const result = guard.canActivate(mockExecutionContext);

    expect(result).toBe(true);
  });

  it("should allow user with required role", () => {
    mockMetadata({ roles: ["COACH"] });

    const mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { userType: "COACH", id: "user-123" },
        }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;

    const result = guard.canActivate(mockExecutionContext);

    expect(result).toBe(true);
  });

  it("should allow user when one of multiple required roles matches", () => {
    mockMetadata({ roles: ["COACH", "ADMIN"] });

    const mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { userType: "ADMIN", id: "user-456" },
        }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;

    const result = guard.canActivate(mockExecutionContext);

    expect(result).toBe(true);
  });

  it("should deny user without required role", () => {
    mockMetadata({ roles: ["COACH"] });

    const mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { userType: "PARENT", id: "user-789" },
        }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      "이 작업을 수행할 권한이 없습니다",
    );
  });

  it("should throw error if user is not authenticated", () => {
    mockMetadata({ roles: ["COACH"] });

    const mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: null,
        }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      "인증되지 않은 사용자입니다",
    );
  });

  it("should deny PARENT user from accessing COACH endpoint", () => {
    mockMetadata({ roles: ["COACH"] });

    const mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { userType: "PARENT", id: "parent-user" },
        }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(mockExecutionContext)).toThrow();
  });

  it("should deny CHILD user from accessing PARENT endpoint", () => {
    mockMetadata({ roles: ["PARENT"] });

    const mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { userType: "CHILD", id: "child-user" },
        }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(mockExecutionContext)).toThrow();
  });

  it("should deny CHILD user from accessing COACH endpoint", () => {
    mockMetadata({ roles: ["COACH"] });

    const mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { userType: "CHILD", id: "child-user" },
        }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(mockExecutionContext)).toThrow();
  });

  it("should allow ADMIN user to access all endpoints", () => {
    mockMetadata({ roles: ["ADMIN"] });

    const mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { userType: "ADMIN", id: "admin-user" },
        }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;

    const result = guard.canActivate(mockExecutionContext);

    expect(result).toBe(true);
  });

  // ============================================================
  // [2026-05-14] @Public() 우회 회귀 가드 — auth.controller 등 클래스 레벨
  // @Roles 가 부착된 컨트롤러의 @Public() 메서드(/auth/login 등) 가 user 없는
  // 상태에서도 통과해야 함. 이 테스트가 깨지면 로그인 403 버그 재발.
  // ============================================================

  it("@Public() 엔드포인트는 user 없어도 통과 (RolesGuard 우회)", () => {
    mockMetadata({ isPublic: true, roles: ["PARENT", "COACH"] });

    const mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: null, // 미인증 — @Public 이므로 통과해야 함
          method: "POST",
          url: "/api/v1/auth/login",
        }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(mockExecutionContext)).toBe(true);
  });

  it("@Public() 엔드포인트는 인증된 사용자에 대해서도 role 검사 우회", () => {
    // 권한 부족(PARENT → COACH 필요) 케이스라도 isPublic=true 면 통과.
    mockMetadata({ isPublic: true, roles: ["COACH"] });

    const mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { userType: "PARENT", id: "p-1" },
        }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(mockExecutionContext)).toBe(true);
  });

  it("should include required roles in error message", () => {
    mockMetadata({ roles: ["COACH", "ADMIN"] });

    const mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { userType: "PARENT", id: "parent-user" },
        }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;

    try {
      guard.canActivate(mockExecutionContext);
    } catch (error: any) {
      expect(error.message).toContain("COACH");
      expect(error.message).toContain("ADMIN");
    }
  });
});
