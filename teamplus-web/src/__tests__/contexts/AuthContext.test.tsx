import { render, screen, waitFor } from "@testing-library/react";
import {
  AuthProvider,
  resetAuthStateForTests,
  useAuth,
} from "@/contexts/AuthContext";

const navigateMock = jest.fn();
const getTokenMock = jest.fn();
const getProfileMock = jest.fn();

jest.mock("@/components/ui/NavLink", () => ({
  useNavigation: () => ({
    navigate: navigateMock,
  }),
}));

jest.mock("@/services/hybrid-auth", () => ({
  hybridAuth: {
    getToken: (...args: unknown[]) => getTokenMock(...args),
  },
}));

jest.mock("@/services/auth", () => ({
  __esModule: true,
  default: {
    getProfile: (...args: unknown[]) => getProfileMock(...args),
  },
}));

function AuthStateProbe() {
  const { isLoading, isAuthenticated, user } = useAuth();

  return (
    <>
      <div data-testid="loading">{String(isLoading)}</div>
      <div data-testid="authenticated">{String(isAuthenticated)}</div>
      <div data-testid="user">{user?.userType ?? "none"}</div>
    </>
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    resetAuthStateForTests();
  });

  it("토큰이 없으면 세션 캐시가 있어도 로그인 상태로 복원하지 않는다", async () => {
    sessionStorage.setItem(
      "teamplus_auth_profile",
      JSON.stringify({
        id: "teen-user",
        email: "teen@teamplus.com",
        name: "Teen",
        userType: "teen",
        isVerified: true,
        createdAt: "2026-03-07T00:00:00.000Z",
      }),
    );
    getTokenMock.mockResolvedValue(null);

    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });

    expect(screen.getByTestId("authenticated")).toHaveTextContent("false");
    expect(screen.getByTestId("user")).toHaveTextContent("none");
    expect(sessionStorage.getItem("teamplus_auth_profile")).toBeNull();
    expect(getProfileMock).not.toHaveBeenCalled();
  });

  it("토큰이 있으면 캐시된 사용자 정보를 복원한다", async () => {
    sessionStorage.setItem(
      "teamplus_auth_profile",
      JSON.stringify({
        id: "teen-user",
        email: "teen@teamplus.com",
        name: "Teen",
        userType: "TEEN",
        isVerified: true,
        createdAt: "2026-03-07T00:00:00.000Z",
      }),
    );
    getTokenMock.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });

    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });

    expect(screen.getByTestId("authenticated")).toHaveTextContent("true");
    expect(screen.getByTestId("user")).toHaveTextContent("teen");
    expect(getProfileMock).not.toHaveBeenCalled();
  });
});
