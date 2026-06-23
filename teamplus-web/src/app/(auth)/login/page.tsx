"use client";

// @check-usePageReady-skip — 의도적 미호출 (v18, 2026-05-20)
//   로그인 페이지는 자체 fetch 가 없어 usePageReady(true) 호출 시 즉시 fast-path
//   가 발화한다. 그 결과 LoadingContext 의 pageReadySignaledRef 가 true 로 남아,
//   이후 로그인 버튼 클릭 시 startLoading('fullscreen') 사이클의 fast-path 가
//   가로채 풀스크린 LoadingPuck 이 paint 되기도 전에 finish() → 즉시 OFF 된다.
//   상세: line 465 의 주석 참조. SoT: docs/Design/LOADING_TIMING_POLICY.md v16+.

// ⚡ force-dynamic 제거 — 로그인 페이지는 정적 쉘. middleware.ts 가 인증 쿠키 기반
//    리다이렉트를 이미 처리하므로 매 요청 SSR 불필요. TTFB 30~60ms 단축.
import { useState, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { NavLink } from "@/components/ui/NavLink";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { useLoading } from "@/contexts/LoadingContext";
import { useLoginRateLimit } from "@/hooks/useLoginRateLimit";
import { useAuthUI } from "@/hooks/useNativeUI";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { useKeyboardAvoidance } from "@/hooks/useKeyboardAvoidance";
import { isNativeApp } from "@/lib/environment";
import MaintenanceBanner from "@/components/common/MaintenanceBanner";
import { useAppSettingsContext } from "@/contexts/AppSettingsContext";
import {
  getDashboardPathByUserType,
  isInternalRedirectPath,
  safeRedirectTarget,
} from "@/lib/auth-routing";
import { MESSAGES } from "@/lib/messages";
import { useToast } from "@/components/ui/Toast";
import { useModal } from "@/components/ui/Modal";
import { resetAuthGuardRedirectFlag } from "@/services/api-lifecycle-defaults";
import { loginSchema, type LoginInput } from "@/lib/validation/schemas";
import {
  listParentVisibleTeams,
  listManagedTeams,
} from "@/services/team.service";
import { api } from "@/services/api-client";

/**
 * [성능 2026-05-28 P0-F] 로그인 성공 직후 역할별 대시보드 핵심 데이터를 미리 발사한다.
 *   api-client 의 in-flight GET dedup 으로, navigate 후 대시보드가 동일 GET 을 호출하면
 *   이 prefetch promise 를 그대로 공유한다(중복 요청 0). 완료된 뒤라도 EtagCache 로 가볍다.
 *   fire-and-forget — 실패는 무시(대시보드가 자체적으로 재요청하므로 무해).
 */
function prefetchDashboardData(userType?: string) {
  const ut = (userType ?? "").toLowerCase();
  try {
    if (ut === "parent") {
      void listParentVisibleTeams().catch(() => undefined);
      void api.get("/children").catch(() => undefined);
    } else if (ut === "coach" || ut === "academy_director") {
      void listManagedTeams({ includePending: true }).catch(() => undefined);
    } else if (ut === "director") {
      void listManagedTeams().catch(() => undefined);
    }
  } catch {
    /* prefetch 실패는 무시 — 체감 최적화일 뿐 정확성에 영향 없음 */
  }
}

// 아이디 저장 — localStorage 키 (모듈 스코프 상수, SSR 안전)
const REMEMBER_EMAIL_FLAG_KEY = "teamplus_remember_email_enabled";
const SAVED_EMAIL_KEY = "teamplus_saved_email";


// ========== 한글 입력 차단 (2026-05-23 추가) ==========
//  보안/UX 정책: 로그인 아이디·비밀번호는 ASCII 만 허용. 한글 IME 로 조합된 글자가
//  입력되면 모든 진입 경로(키 입력·IME 조합·붙여넣기·드롭·autofill·setValue)에서
//  차단·strip 하여 폼 상태에 절대 들어가지 못하도록 보장.
//  유니코드 범위:
//    · U+1100–U+11FF  Hangul Jamo (초·중·종성 자모)
//    · U+3130–U+318F  Hangul Compatibility Jamo (한글 호환 자모)
//    · U+A960–U+A97F  Hangul Jamo Extended-A
//    · U+AC00–U+D7A3  Hangul Syllables (가–힣, 완성형 음절)
//    · U+D7B0–U+D7FF  Hangul Jamo Extended-B
//  추가로 `lang="en"` 속성을 입력에 부여해 모바일 키보드/IME 에 영문 힌트를 제공.
//
//  주의: g flag 있는 regex 의 `.test()` 는 lastIndex stateful 라 호출마다 결과가
//        달라질 수 있으므로, test 용은 별도 non-global regex 로 분리.
const HANGUL_REGEX_GLOBAL = /[ᄀ-ᇿ㄰-㆏ꥠ-꥿가-힣ힰ-퟿]/g;
const HANGUL_REGEX = /[ᄀ-ᇿ㄰-㆏ꥠ-꥿가-힣ힰ-퟿]/;
function stripHangul(value: string): string {
  return value.replace(HANGUL_REGEX_GLOBAL, "");
}
function hasHangul(value: string): boolean {
  return HANGUL_REGEX.test(value);
}

export default function LoginPage() {
  // Native 앱에서 로그인 화면 UI 설정 (페이지 마운트 시 적용)
  // useAuthUI 프리셋: showStatusBar=true, showAppBar=false, showBottomNav=false
  // (2026-06-15 사용자 직접 지시 — 로그인도 AppStatus 표시. 노출 정책 SoT: @/lib/app-status)
  useAuthUI();

  const router = useRouter();
  const {
    login,
    user,
    isAuthenticated,
    isLoading: isAuthLoading,
  } = useSessionAuth();
  const { settings } = useAppSettingsContext();
  // [수정] 로그인 헤더 브랜드명은 항상 한글 "팀플러스" 고정 (Jenkinsfile ff2a0f6 와 동일 방침).
  // settings.appName(DB 값 "TEAMPLUS")을 따르지 않으므로 hydration mismatch 위험도 자동 제거.
  // 풀스크린 LoadingPuck — 로그인 처리 + 대시보드 진입까지 단일 로더로 통합
  // (Button 내장 스피너 + 대시보드 페이지의 자체 LoadingPuck 이 연달아 보이는 이중 로딩 제거)
  const { startLoading, stopLoading, setLoadingMessage } = useLoading();
  const { toast } = useToast();
  const { modal } = useModal();
  const isRedirecting = useRef(false);
  // 단일 세션 정책 — SESSION_EXISTS 확인 모달에서 "기존 접속 종료" 선택 후
  // 재시도할 때 true. RHF handleSubmit 시그니처(data, event) 때문에 ref 로 전달.
  const forceLoginRef = useRef(false);
  // 키보드 회피 — 아이디/비밀번호 input focus 시 system 키보드가 화면을 가리지
  // 않도록 활성 input 을 viewport 안쪽으로 자동 스크롤. CSS-only 클래스
  // (`pb-keyboard-safe-8`) 와 함께 동작하여 폼이 키보드 위로 자연스럽게 올라옴.
  // SoT: docs/Architecture/SCREEN_METRICS.md, SPEC: docs/Planning/SPEC_LOGIN_KEYBOARD.md
  const formRef = useRef<HTMLFormElement>(null);
  useKeyboardAvoidance(formRef);

  // [추가 2026-05-16 · 보강 2026-05-17] /login 무한 로딩 대응 — 정적 쉘 페이지가
  //   RouteChangeHandler 의 MAX_WAIT(5초) fail-safe 까지 풀스크린 로더를 유지해
  //   사용자에게 "무한 로딩" 으로 보이는 회귀 차단.
  //   정책(데이터+셋팅 완료 전 hide 금지) 정합: /login 은 자체 fetch 가 없으므로
  //   마운트 시점이 곧 "셋팅 완료". RAF 두 번으로 풀스크린 로더가 1프레임 paint 된
  //   뒤 hide 되어 paint-then-hide 자연스러움 보장.
  //
  // ⚠️ 가드 (2026-05-17 보강) — 다음 케이스에는 stopLoading 호출 금지:
  //   · 인증 상태 확정 전 (isAuthLoading): loadUser 진행 중이며 결과에 따라 navigate
  //     가능성 있음. 미리 hide 하면 로그인 사용자가 dashboard 진입 직전 login 폼 잔상
  //     이 보이고 다시 풀스크린 로더가 켜져 "두 번 로딩 + 이전 화면 잔상" 회귀 발생.
  //   · 이미 인증된 사용자 (isAuthenticated): useEffect(L306)가 navigateToDashboard
  //     호출 → router.replace 진행 → 로더 유지가 자연.
  //   · URL ?redirect=... 가 있는 케이스: silent refresh 후 redirect 타겟으로 진입.
  useEffect(() => {
    if (isAuthLoading) return;
    if (isAuthenticated) return;
    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("redirect")
    ) {
      return;
    }

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        stopLoading();
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [isAuthLoading, isAuthenticated, stopLoading]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("signup") !== "success") return;
    toast.success(MESSAGES.signup.success);
    // 새로고침 시 토스트 재발생 방지
    params.delete("signup");
    const cleanQuery = params.toString();
    const cleanUrl =
      window.location.pathname + (cleanQuery ? `?${cleanQuery}` : "");
    window.history.replaceState(null, "", cleanUrl);
  }, [toast]);

  /**
   * 클라이언트 사이드 네비게이션 (무한 루프 방지)
   * - Native 앱: window.teamplusNavigate 사용 (Flutter 클라이언트 네비게이션)
   * - Web: router.push 사용 (Next.js 클라이언트 네비게이션)
   * - window.location.href는 전체 페이지 새로고침을 유발하여 무한 루프 원인
   *
   * 쿠키는 saveTokens()에서 동기적으로 설정되므로 즉시 이동 가능
   */
  const navigateToDashboard = (path: string) => {
    // Native 앱 환경: Flutter의 클라이언트 사이드 네비게이션 사용
    if (isNativeApp() && typeof window !== "undefined") {
      // 우선순위: window.__NEXT_ROUTER_PUSH__ > window.teamplusNavigate > router.push
      if (window.__NEXT_ROUTER_PUSH__) {
        window.__NEXT_ROUTER_PUSH__(path);
        return;
      }
      if (window.teamplusNavigate) {
        window.teamplusNavigate(path);
        return;
      }
    }

    // Web 환경 또는 fallback: Next.js router 사용
    // ※ replace 사용 — 로그인 화면을 history 에서 제거해 "홈에서 백버튼 → 로그인 재진입" 차단.
    router.replace(path, { scroll: false });
  };

  // 이미 로그인된 경우 역할별 대시보드로 리다이렉트
  useEffect(() => {
    // 이미 리다이렉트 중이면 중복 실행 방지
    if (isRedirecting.current) {
      return;
    }

    // URL 에 redirect 파라미터가 있으면 미들웨어가 인증 실패로 보낸 케이스.
    //
    // 2026-05-08: cookie JWT 가 만료(15분)되었지만 localStorage refresh 토큰은
    // 살아있는 상태에서 메뉴 클릭 시 발생. 단순히 로그인 페이지에 머물면
    // 사용자에게는 "로그인되어 있는데 갑자기 로그아웃된" 것처럼 보이고,
    // 다른 메뉴 클릭 시에도 동일 회귀가 반복된다.
    //
    // 해결: refresh 토큰이 있으면 silent 재발급 후 redirect 타겟으로 자동 진입.
    // refresh 도 실패한 경우에만 일반 로그인 폼 노출.
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const redirectParam = urlParams.get("redirect");

      if (redirectParam) {
        (async () => {
          try {
            const mod = await import("@/services/api-client");
            const fresh = await mod.ensureFreshAccessToken();
            if (fresh) {
              // cookie 동기화 완료 — 의도한 페이지로 진입.
              // 오픈 리다이렉트 방지: 외부/비정상 경로는 루트로 폴백 (safeRedirectTarget).
              isRedirecting.current = true;
              router.replace(safeRedirectTarget(redirectParam), {
                scroll: false,
              });
              return;
            }
          } catch {
            // 실패 시 일반 로그인 흐름으로
          }
          // 미들웨어가 인증 실패로 판단했으므로 캐시 삭제
          sessionStorage.removeItem("teamplus_auth_profile");
        })();
        return;
      }
    }

    // 로그아웃 직후에는 토큰이 삭제되었으므로 리다이렉트하지 않음
    // localStorage에 토큰이 실제 존재하는지 추가 확인
    if (isAuthenticated && user) {
      const hasToken =
        typeof window !== "undefined" &&
        (localStorage.getItem("teamplus_auth_token") ||
          document.cookie.includes("teamplus_access_token"));
      if (!hasToken) {
        // 토큰 없음 → 로그아웃 직후 상태, 리다이렉트 하지 않음
        return;
      }
      isRedirecting.current = true;
      const dashboardPath = getDashboardPathByUserType(user.userType, "/");
      navigateToDashboard(dashboardPath);
    }
  }, [isAuthenticated, user]);

  // Rate Limiting
  const { isLocked, lockoutMessage, onLoginFailed, onLoginSuccess } =
    useLoginRateLimit();

  // "아이디 저장" 체크박스 — 체크 시 로그인 성공한 아이디를 localStorage 에 보관해
  // 다음 진입 시 자동 채움. (비밀번호는 저장하지 않음 — 보안 정책)
  // 사용자 직접 지시 (2026-05-23): "로그인 유지" → "아이디 저장" 동작으로 통합.
  const [rememberEmail, setRememberEmail] = useState(true);

  // RHF + Zod — D-2 마이그레이션 (2026-05-14)
  // zodResolver 가 비어있음 검증 처리(아이디는 형식 무검증 — 일반 ID/기존 이메일 모두 허용).
  // mode: 'onSubmit' (기존 setError 동작과 동일 — 제출 시점에 검증).
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors: formErrors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onSubmit",
  });
  const email = watch("email");

  // [추가 2026-05-23] 한글 입력 절대 차단 — 4중 안전망.
  //  ① onBeforeInput: 가장 빠른 차단 — 키 입력/붙여넣기/드롭 시 data 가 한글이면
  //     preventDefault 로 value 변경 자체를 막음 (단, IME 조합 중에는 skip — preventDefault
  //     가 IME 상태를 깨뜨림. 조합 중에는 compositionend 와 onChange 에서 strip 처리).
  //  ② onChange sanitizer: IME 조합 완료 후 DOM 에 한글이 들어온 경우 strip.
  //  ③ onCompositionEnd 백업: 일부 브라우저(특히 iOS Safari)에서 onChange 보다 먼저 fire
  //     → DOM value 에 한글이 남으면 즉시 strip + input 이벤트 재dispatch 로 RHF 동기화.
  //  ④ onPaste 가드: clipboardData 의 한글을 strip 후 직접 삽입.
  const handleBeforeInput = (e: React.FormEvent<HTMLInputElement>) => {
    const ne = e.nativeEvent as InputEvent;
    // IME 조합 중에는 차단 금지 (조합 상태 파괴 방지) — compositionend + onChange 가 처리.
    if (ne.isComposing) return;
    if (ne.inputType && ne.inputType.startsWith("insertComposition")) return;
    if (ne.data && hasHangul(ne.data)) {
      e.preventDefault();
    }
  };
  const sanitizeOnChange =
    (regOnChange: React.ChangeEventHandler<HTMLInputElement>) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const cleaned = stripHangul(e.target.value);
      if (cleaned !== e.target.value) {
        e.target.value = cleaned;
      }
      regOnChange(e);
    };
  const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
    const target = e.currentTarget;
    const cleaned = stripHangul(target.value);
    if (cleaned !== target.value) {
      target.value = cleaned;
      // RHF 가 듣는 input 이벤트 재dispatch — DOM 값 변화를 RHF 폼 상태에 반영.
      target.dispatchEvent(new Event("input", { bubbles: true }));
    }
  };
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (!hasHangul(pasted)) return; // 한글 없으면 기본 동작 허용
    e.preventDefault();
    const target = e.currentTarget;
    const cleaned = stripHangul(pasted);
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    const next = target.value.slice(0, start) + cleaned + target.value.slice(end);
    target.value = next;
    // 캐럿 위치 보정
    const caret = start + cleaned.length;
    target.setSelectionRange(caret, caret);
    // RHF 동기화
    target.dispatchEvent(new Event("input", { bubbles: true }));
  };

  // 아이디 저장 — mount 시 localStorage 에서 체크 상태 + 저장된 아이디 복원
  // (SSR/CSR 분리 — window 가드 + setValue dep 안정성 보장)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const enabledRaw = localStorage.getItem(REMEMBER_EMAIL_FLAG_KEY);
      const savedEmail = localStorage.getItem(SAVED_EMAIL_KEY);
      if (enabledRaw !== null) {
        setRememberEmail(enabledRaw === "true");
      }
      if (savedEmail) {
        setValue("email", savedEmail);
      }
    } catch {
      /* localStorage 비가용 환경(InAppBrowser/private mode) 무시 */
    }
  }, [setValue]);

  // 체크박스 토글 시 즉시 localStorage 반영 (해제 시 저장된 아이디도 함께 삭제)
  const handleRememberEmailChange = (checked: boolean) => {
    setRememberEmail(checked);
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(REMEMBER_EMAIL_FLAG_KEY, String(checked));
      if (!checked) {
        localStorage.removeItem(SAVED_EMAIL_KEY);
      }
    } catch {
      /* localStorage 비가용 환경 무시 */
    }
  };

  const [loading, setLoading] = useState(false);

  // ⚠️ usePageReady 호출 금지 — 로그인 페이지는 자체 fetch 가 없으므로 마운트
  //    시점에 loading=false → !loading=true 로 평가되어 즉시 signalPageReady()
  //    가 트리거된다. 그 결과 LoadingContext.pageReadySignaledRef 가 true 로
  //    설정되어, 이후 로그인 버튼 클릭 시 startLoading('fullscreen') 사이클의
  //    fast-path 가 활성화되어 풀스크린 LoadingPuck 이 paint 되기도 전에
  //    finish() → 즉시 OFF 된다 (사용자 보고: "로딩바가 안 나오고 바로 다음
  //    화면으로 넘어감", 2026-05-09). 풀스크린 로더는 LoadingContext 의
  //    MutationObserver/STABLE_WINDOW/MIN_SHOW_DURATION 표준 흐름에 위임한다.
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardNotice, setGuardNotice] = useState<string | null>(null);

  /**
   * API 가드 유도로 도착한 경우 `reason` 쿼리 감지 → 안내 메시지 표시.
   * - reason=required → 미인증 상태에서 인증 필요 API 호출
   * - reason=expired  → 세션 만료 (401)
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const reason = params.get("reason");
    if (!reason) return;
    if (reason === "required") {
      setGuardNotice(MESSAGES.authGuard.required);
    } else if (reason === "expired") {
      setGuardNotice(MESSAGES.authGuard.expired);
    }
  }, []);

  // RHF onSubmit — zodResolver 가 검증 통과 후에만 호출됨
  // (빈 값은 formErrors 로 노출, setError 는 서버 응답/Rate limit 전용)
  const handleLogin = async (data: LoginInput) => {
    setError(null);

    // [추가 2026-05-23] 한글 입력 절대 차단 — backstop 검증.
    //   onBeforeInput/onChange/onCompositionEnd/onPaste 단계에서 이미 strip 되지만,
    //   autofill/외부 setValue/Flutter Bridge 등 어떤 경로로도 한글이 슬쩍 들어오는
    //   회귀 가능성을 차단하기 위해 제출 직전에 한 번 더 검사. 발견 시 사용자에게
    //   명확히 안내하고 차단 (서버 호출 없음).
    if (hasHangul(data.email) || hasHangul(data.password)) {
      setError("아이디와 비밀번호에 한글을 사용할 수 없습니다. 영문/숫자로 입력해 주세요.");
      return;
    }

    // Rate limit 체크 (로더 시작 전 — 차단 메시지가 아래의 알림으로 즉시 노출되어야 함)
    if (isLocked) {
      setError(lockoutMessage || "잠시 후 다시 시도해주세요.");
      return;
    }

    // 🛡️ 중복 navigation 차단 — handleLogin 와 L225 useEffect 가 모두 navigateToDashboard 를
    //    호출 가능한 구조라 React 리렌더 타이밍에 따라 2회 호출되어 풀스크린 로더가
    //    "닫혔다 다시 로딩" 으로 인지되는 깜빡임을 유발했음. 진입 즉시 플래그를 세워
    //    useEffect 의 redirect 분기를 차단한다. 실패 시 catch 에서 false 로 복원.
    isRedirecting.current = true;

    // 단일 로더: 풀스크린 LoadingPuck 로 일원화
    // (Button 내장 스피너 + 대시보드 자체 LoadingPuck 이중 표시 제거)
    //
    // (v2, 2026-05-08) flushSync 로 강제 동기 commit — 사용자 보고
    // "로그인 클릭 시 한번 멈췄다 메인 화면으로 넘어감" 해소.
    // React 18+ 자동 batching 으로 setLoading + startLoading 이 await login()
    // 이전에 commit 되지 않은 채 API 호출이 시작되면, 응답이 빠를 경우 첫
    // paint 전에 navigate 가 발생 → 로더가 보이지 않거나 깜빡임으로 인지됨.
    // flushSync 로 동기 commit + paint 를 강제하여 클릭 즉시 풀스크린 로더가
    // 표시된 후 API 호출 진입 보장.
    //
    // (v3, 2026-05-09) variant: 'fullscreen' → 'navigation' 변경.
    // 사용자 보고: "로그인 클릭 시 풀스크린 LoadingPuck 이 안 보이고 화면이
    // disable 처럼만 보임". 원인은 LoadingContext.tsx:577-581 의 렌더 조건
    // (`loadingVariant === 'navigation' || !isNativeApp()`) — Native 앱
    // 환경에서 'fullscreen' variant 호출 시 Web LoadingPuck 이 미렌더되고
    // Flutter `ui.startLoading()` 위임으로 빠지는데, Flutter 측이 본체 스피너
    // 없이 투명 오버레이만 띄우면서 "disable 처럼 보이는" 현상이 발생.
    // 'navigation' variant 는 Web + Native 모든 환경에서 Web LoadingPuck 을
    // 보장 렌더하며, ui.enterFullscreen() 적용도 동일 (Native StatusBar/AppBar/
    // BottomNav 숨김). 결제 등 명시적 long-running 작업은 'fullscreen' 유지.
    flushSync(() => {
      setLoading(true);
      startLoading("navigation", "로그인 중입니다...");
    });

    try {
      // 2026-04-22: 이전 세션의 잘못된 userType 캐시 정리
      try {
        sessionStorage.removeItem("teamplus_auth_profile");
      } catch {
        /* sessionStorage 비가용 환경(InAppBrowser 등) 무시 */
      }

      const force = forceLoginRef.current;
      forceLoginRef.current = false;
      const response = await login({
        email: data.email.trim(),
        password: data.password,
        ...(force ? { force: true } : {}),
      });

      if (response.success && response.data?.user) {
        // 메시지 자연스럽게 전환 — 사용자에게 다음 단계(데이터 fetch) 진행 중임을 인지시킴
        // (v14, 2026-05-08) 클릭→로그인 응답→메인 진입 사이의 빈 시간이 답답하지 않게 흐름 제공
        setLoadingMessage("정보를 불러오는 중...");

        // [성능 2026-05-28 P0-F] 역할별 대시보드 핵심 데이터 prefetch.
        //   navigate 직전에 발사 → 대시보드 mount 가 같은 GET 을 호출할 때 in-flight dedup 으로
        //   공유되어 first meaningful paint(calendarReady/teams) 도달을 앞당긴다.
        prefetchDashboardData(response.data.user.userType);

        // 아이디 저장 — 체크 상태에 따라 아이디 보관/삭제 (성공 시점에만 갱신)
        if (typeof window !== "undefined") {
          try {
            if (rememberEmail) {
              localStorage.setItem(SAVED_EMAIL_KEY, data.email.trim());
              localStorage.setItem(REMEMBER_EMAIL_FLAG_KEY, "true");
            } else {
              localStorage.removeItem(SAVED_EMAIL_KEY);
              localStorage.setItem(REMEMBER_EMAIL_FLAG_KEY, "false");
            }
          } catch {
            /* localStorage 비가용 환경 무시 */
          }
        }

        onLoginSuccess(); // Rate limit 카운터 초기화
        // (isRedirecting.current 는 handleLogin 진입 시점에 이미 true 로 설정됨)
        resetAuthGuardRedirectFlag();
        setLoginSuccess(true);

        // useAuthGuard 등이 redirect 파라미터로 returnTo 를 부착했다면 우선 사용.
        // 단, redirect 가 **다른 역할의 대시보드 루트**인 경우에는 자신의 대시보드로 강제 이동.
        const ROLE_DASHBOARD_ROOTS = new Set([
          "/admin",
          "/parent",
          "/coach",
          "/director",
          "/child",
          "/teen",
        ]);
        let targetPath: string | null = null;
        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          const redirectParam = params.get("redirect");
          if (
            isInternalRedirectPath(redirectParam) &&
            !ROLE_DASHBOARD_ROOTS.has(redirectParam)
          ) {
            targetPath = redirectParam;
          }
        }

        const dashboardPath =
          targetPath ??
          getDashboardPathByUserType(response.data.user.userType, "/");

        // 페이지 전환 → LoadingContext 의 RouteChangeHandler 가 stopLoading 을 자동 호출
        // (대시보드 자체 LoadingPuck 도 동일 톤이라 사용자 인지상 단일 로더로 이어짐)
        navigateToDashboard(dashboardPath);
      } else if (
        response.error?.code === "SESSION_EXISTS" ||
        // WebView(Native Bridge) 경로 폴백 — 구버전 앱이 errorCode 를 code 로
        // 매핑하지 못해도 로그인 409 는 세션 충돌이 유일하므로 status 로 판정.
        response.error?.statusCode === 409
      ) {
        // 단일 세션 정책 — 다른 기기에서 사용 중 (자격 증명은 유효하므로
        // rate limit 카운터를 증가시키지 않음). 확인 후 force 재시도.
        setLoading(false);
        stopLoading();
        isRedirecting.current = false;

        const confirmed = await modal.confirm({
          title: MESSAGES.auth.sessionExists.title,
          message: MESSAGES.auth.sessionExists.message,
          confirmText: MESSAGES.auth.sessionExists.confirm,
          cancelText: MESSAGES.auth.sessionExists.cancel,
          variant: "warning",
        });
        if (confirmed) {
          forceLoginRef.current = true;
          await handleLogin(data);
        }
      } else {
        onLoginFailed(); // Rate limit 카운터 증가
        setError(response.error?.message || "로그인에 실패했습니다.");
        setLoading(false);
        stopLoading();
        isRedirecting.current = false; // 실패 시 재시도 가능하도록 가드 복원
      }
    } catch {
      onLoginFailed(); // Rate limit 카운터 증가
      setError(MESSAGES.auth.loginError);
      setLoading(false);
      stopLoading();
      isRedirecting.current = false; // 실패 시 재시도 가능하도록 가드 복원
    }
  };

  // (로그인 페이지는 게스트 페이지이므로 인증 확인 중에도 폼 사용 가능해야 함)
  const isSubmitting = loading || loginSuccess || isLocked;

  const isSignupEnabled = settings?.signupEnabled ?? true;

  return (
    <MobileContainer hasBottomNav={false} className="bg-wbg dark:bg-puck">
      <main data-no-enter className="flex flex-1 flex-col overflow-y-auto scroll-keyboard-safe">
        <MaintenanceBanner />
        <div className="flex-1 flex flex-col px-7 pt-8 pb-keyboard-safe-8 max-w-md mx-auto w-full">
          {/* ─── 로고 + 헤드라인 ─────────────────────── */}
          <div className="flex flex-col">
            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-10 h-10 bg-ice-500 rounded-w-md flex items-center justify-center shadow-md">
                <Image
                  src="/images/app_icons/splash_logo.png"
                  alt="팀플러스"
                  width={28}
                  height={28}
                  priority
                  className="w-7 h-7 object-contain"
                />
              </div>
              {/* width/height 는 실제 본질 크기(954×218) 그대로 — 표시 크기는 h-5 w-auto 가 제어.
                  display 크기(88×20)를 props 로 주면 height 만 속성과 일치(미변경)하고 w-auto
                  계산폭(≈87.5)이 어긋나 next/image 의 단일 차원 변경 경고가 떴음. (aspect ratio 유지) */}
              <Image
                src="/images/app_icons/splash_wordmark3.png"
                alt="팀플러스"
                width={954}
                height={218}
                priority
                className="h-5 w-auto object-contain dark:invert"
              />
            </div>

            <h1 className="text-[24px] leading-[1.35] font-extrabold tracking-tight text-wtext-1 dark:text-white">
              오늘도 빙판 위에서
              <br />한 뼘 더 자라요
            </h1>
            <p className="mt-2 text-card-body text-wtext-3 dark:text-rink-300">
              로그인하고 수업 · 진도 · 결제를 한 번에 관리하세요.
            </p>
          </div>

          {/* ─── 알림 영역 ─────────────────────────── */}
          <div className="mt-6 flex flex-col gap-2">
            {isLocked && (
              <div className="p-3 bg-sun-100 dark:bg-sun-500/15 border border-sun-500/40 rounded-w-md">
                <div className="flex items-center gap-2">
                  <Icon
                    name="lock_clock"
                    className="text-sun-500 text-card-title"
                  />
                  <p className="text-wtext-2 dark:text-sun-100 text-card-body">
                    {lockoutMessage}
                  </p>
                </div>
              </div>
            )}
            {guardNotice && !error && (
              <div className="p-3 bg-ice-100 dark:bg-ice-500/15 border border-ice-500/40 rounded-w-md">
                <div className="flex items-center gap-2">
                  <Icon name="info" className="text-ice-500 text-card-title" />
                  <p className="text-wtext-2 dark:text-ice-100 text-card-body">
                    {guardNotice}
                  </p>
                </div>
              </div>
            )}
            {!isLocked && lockoutMessage && !error && (
              <div className="p-3 bg-sun-100 dark:bg-sun-500/15 border border-sun-500/40 rounded-w-md">
                <div className="flex items-center gap-2">
                  <Icon
                    name="warning"
                    className="text-sun-500 text-card-title"
                  />
                  <p className="text-wtext-2 dark:text-sun-100 text-card-body">
                    {lockoutMessage}
                  </p>
                </div>
              </div>
            )}
            {error && !isLocked && (
              <div
                id="login-error"
                role="alert"
                aria-live="assertive"
                className="p-3 bg-flame-100 dark:bg-flame-500/15 border border-flame-500/40 rounded-w-md"
              >
                <div className="flex items-center gap-2">
                  <Icon
                    name="error"
                    className="text-flame-500 text-card-title"
                    aria-hidden="true"
                  />
                  <p className="text-wtext-2 dark:text-flame-100 text-card-body">
                    {error}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ─── 로그인 폼 ─────────────────────────── */}
          {/* autoComplete="off" — 브라우저 자체 자동 완성/비밀번호 매니저 비활성.
              "아이디 저장"은 우리 코드(localStorage)가 직접 채우므로 Chrome dropdown 추천 + 비밀번호 자동 채움과 충돌 방지. */}
          <form
            ref={formRef}
            onSubmit={handleSubmit(handleLogin)}
            className="mt-7 flex flex-col gap-3"
            noValidate
            autoComplete="off"
          >
            <div className="flex flex-col gap-1">
              {(() => {
                // [추가 2026-05-23] 한글 IME 입력 차단 — register onChange 를 sanitizer 로 wrap.
                const emailReg = register("email");
                return (
                  <Input
                    type="text"
                    inputMode="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="off"
                    lang="en"
                    placeholder="아이디"
                    icon="person"
                    disabled={isSubmitting}
                    aria-label="아이디"
                    aria-invalid={!!formErrors.email || !!error}
                    aria-describedby={
                      formErrors.email
                        ? "login-email-error"
                        : error
                          ? "login-error"
                          : undefined
                    }
                    {...emailReg}
                    onChange={sanitizeOnChange(emailReg.onChange)}
                    onBeforeInput={handleBeforeInput}
                    onCompositionEnd={handleCompositionEnd}
                    onPaste={handlePaste}
                  />
                );
              })()}
              {formErrors.email && (
                <p
                  id="login-email-error"
                  role="alert"
                  className="px-1 text-card-meta text-flame-500"
                >
                  {formErrors.email.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              {(() => {
                // [추가 2026-05-23] 한글 IME 입력 차단 — register onChange 를 sanitizer 로 wrap.
                const passwordReg = register("password");
                return (
                  <Input
                    type="password"
                    inputMode="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="new-password"
                    lang="en"
                    placeholder="비밀번호"
                    icon="lock"
                    disabled={isSubmitting}
                    aria-label="비밀번호"
                    aria-invalid={!!formErrors.password || !!error}
                    aria-describedby={
                      formErrors.password
                        ? "login-password-error"
                        : error
                          ? "login-error"
                          : undefined
                    }
                    {...passwordReg}
                    onChange={sanitizeOnChange(passwordReg.onChange)}
                    onBeforeInput={handleBeforeInput}
                    onCompositionEnd={handleCompositionEnd}
                    onPaste={handlePaste}
                  />
                );
              })()}
              {formErrors.password && (
                <p
                  id="login-password-error"
                  role="alert"
                  className="px-1 text-card-meta text-flame-500"
                >
                  {formErrors.password.message}
                </p>
              )}
            </div>

            {/* 옵션 줄: 아이디 저장 체크 + 아이디/비밀번호 찾기 */}
            <div className="flex items-center justify-between mt-1 mb-2 px-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberEmail}
                  onChange={(e) => handleRememberEmailChange(e.target.checked)}
                  disabled={isSubmitting}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`w-[18px] h-[18px] rounded-[4px] border flex items-center justify-center transition-colors motion-reduce:transition-none
                  ${
                    rememberEmail
                      ? "bg-ice-500 border-ice-500"
                      : "bg-wsurface dark:bg-rink-800 border-wline dark:border-rink-700"
                  }`}
                >
                  {rememberEmail && (
                    <svg width={11} height={11} viewBox="0 0 11 11" fill="none">
                      <path
                        d="M2 5.5l2.5 2.5 4.5-5"
                        stroke="#fff"
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span className="text-card-body font-semibold text-wtext-2 dark:text-rink-100">
                  아이디 저장
                </span>
              </label>

              <div className="flex items-center gap-2 text-card-body text-wtext-3 dark:text-rink-300">
                {/* [수정 2026-05-19] /find-id 와 /find-password 는 통합 페이지로
                    /find-id?tab=id|password 단일 라우트가 두 탭을 모두 처리한다.
                    직접 ?tab= 쿼리를 부여하여 /find-password → /find-id 2단계
                    리다이렉트 깜빡임 제거 (find-id/page.tsx:34 searchParams.get('tab')). */}
                <NavLink
                  href="/find-id?tab=id"
                  className="hover:text-ice-500 transition-colors motion-reduce:transition-none"
                >
                  아이디 찾기
                </NavLink>
                <span className="text-wtext-4 dark:text-rink-500">·</span>
                <NavLink
                  href="/find-id?tab=password"
                  className="hover:text-ice-500 transition-colors motion-reduce:transition-none"
                >
                  비밀번호 찾기
                </NavLink>
              </div>
            </div>

            {/* 로그인 버튼 — 내장 스피너 비활성화 (풀스크린 LoadingPuck 로 일원화) */}
            <Button
              type="submit"
              fullWidth
              loading={false}
              disabled={isSubmitting}
              size="lg"
            >
              {loginSuccess ? (
                <span className="flex items-center justify-center gap-2 animate-fade-in motion-reduce:animate-none">
                  <Icon
                    name="check_circle"
                    className="text-xl"
                    aria-hidden="true"
                  />
                  로그인 완료
                </span>
              ) : (
                "로그인"
              )}
            </Button>

          </form>


          {/* ─── 푸터: 회원가입 + 약관 ───────────────── */}
          <div className="mt-auto pt-8">
            {isSignupEnabled && (
              <div className="flex items-center justify-center gap-1 mb-4">
                <span className="text-card-body text-wtext-3 dark:text-rink-300">
                  아직 회원이 아니신가요?
                </span>
                <NavLink
                  href="/signup"
                  className="text-card-body font-bold text-ice-500 hover:text-ice-700 transition-colors motion-reduce:transition-none"
                >
                  회원가입
                </NavLink>
              </div>
            )}
            <p className="text-center text-card-meta text-wtext-4 dark:text-rink-500">
              로그인 시{" "}
              <NavLink href="/terms" className="text-ice-500 hover:underline">
                이용약관
              </NavLink>{" "}
              및{" "}
              <NavLink href="/terms" className="text-ice-500 hover:underline">
                개인정보처리방침
              </NavLink>
              에 동의합니다.
            </p>
          </div>
        </div>
      </main>
    </MobileContainer>
  );
}
