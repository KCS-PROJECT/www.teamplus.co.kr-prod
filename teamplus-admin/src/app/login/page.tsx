"use client";

/**
 * 로그인 페이지 - TEAMPLUS
 *
 * === Design 7 Principles 적용 ===
 * 1. 화면 분석: 아이스하키 액션 배경 + 아이스 스프레이 애니메이션
 * 2. 휴먼 디자인: 사람이 만든 것처럼 자연스러운 UI
 * 3. AI 스타일 금지: gradient, blur 최소화, 단순한 오버레이 사용
 * 4. 페르소나 융합: frontend + architect
 * 5. Tone & Manner: 존댓말, 액션 동사
 * 6. 애니메이션: 아이스 스프레이 파티클 + 3D 하키 퍽
 * 7. 생동감: 배경 미세 움직임 + 파티클 + 3D 요소
 */

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authService } from "@/services/auth.service";
import { resetAdminAuthGuardRedirectFlag } from "@/services/api-lifecycle";

// ============================================
// 3D 하키 퍽 컴포넌트 (새로 추가)
// ============================================
function HockeyPuck3D({
  x,
  y,
  scale = 1,
  delay = 0,
  duration = 6,
}: {
  x: number;
  y: number;
  scale?: number;
  delay?: number;
  duration?: number;
}) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `scale(${scale})`,
        animation: `puckFloat ${duration}s ease-in-out ${delay}s infinite`,
        opacity: 0.7,
      }}
    >
      <div
        style={{
          animation: `puckSpin ${8}s linear infinite`,
          transformStyle: "preserve-3d",
        }}
      >
        {/* 퍽 본체 */}
        <div
          className="w-12 h-12 rounded-full bg-slate-800 border-2 border-slate-600"
          style={{
            boxShadow: `
              0 4px 15px rgba(0,0,0,0.4),
              inset 0 -2px 8px rgba(0,0,0,0.3),
              inset 0 2px 4px rgba(255,255,255,0.1)
            `,
          }}
        >
          {/* 퍽 테두리 */}
          <div className="absolute inset-2 rounded-full border border-slate-500/50" />
          {/* 반사광 */}
          <div
            className="absolute top-2 left-2 w-4 h-2 bg-white/20 rounded-full blur-sm"
            style={{ transform: "rotate(-30deg)" }}
          />
        </div>
        {/* 그림자 */}
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-10 h-2 bg-black/20 rounded-full blur-md" />
      </div>
    </div>
  );
}

// ============================================
// 아이스 링크 오버레이 (새로 추가)
// ============================================
function IceRinkOverlay() {
  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none z-[2]"
      style={{
        perspective: "800px",
        perspectiveOrigin: "50% 100%",
      }}
    >
      {/* 링크 바닥 */}
      <div
        className="absolute w-full h-[60%] bottom-0 left-0"
        style={{
          transform: "rotateX(60deg)",
          transformOrigin: "center bottom",
          opacity: 0.15,
        }}
      >
        {/* 센터 서클 */}
        <div
          className="absolute left-1/2 top-[40%] -translate-x-1/2 w-32 h-32 rounded-full border-4 border-red-500/60"
          style={{
            animation: "rinkGlow 4s ease-in-out infinite",
          }}
        />

        {/* 센터 라인 (레드) */}
        <div className="absolute left-1/2 top-0 bottom-0 w-2 -translate-x-1/2 bg-red-500/50" />

        {/* 블루 라인 좌 */}
        <div className="absolute left-[30%] top-0 bottom-0 w-1.5 bg-blue-500/60" />

        {/* 블루 라인 우 */}
        <div className="absolute left-[70%] top-0 bottom-0 w-1.5 bg-blue-500/60" />
      </div>
    </div>
  );
}

// 아이스 파티클 컴포넌트 (기존)
function IceParticle({
  delay,
  duration,
  startX,
  startY,
  size,
}: {
  delay: number;
  duration: number;
  startX: number;
  startY: number;
  size: number;
}) {
  return (
    <div
      className="absolute rounded-full bg-white/80 pointer-events-none"
      style={{
        width: size,
        height: size,
        left: `${startX}%`,
        bottom: `${startY}%`,
        animation: `iceSpray ${duration}s ease-out ${delay}s infinite`,
      }}
    />
  );
}

// 아이스 스프레이 파티클 생성 (기존)
function IceSprayEffect() {
  const particles = useMemo(() => {
    const items = [];
    // 하단 중앙에서 위로 튀어오르는 얼음 파티클 (30개)
    for (let i = 0; i < 30; i++) {
      items.push({
        id: i,
        delay: Math.random() * 3,
        duration: 2 + Math.random() * 2,
        startX: 30 + Math.random() * 40, // 화면 중앙 부근
        startY: 5 + Math.random() * 15,
        size: 2 + Math.random() * 6,
      });
    }
    return items;
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-[5]">
      {particles.map((p) => (
        <IceParticle key={p.id} {...p} />
      ))}
    </div>
  );
}

// 반짝이는 아이스 크리스탈 효과 (기존)
function IceSparkles() {
  const sparkles = useMemo(() => {
    const items = [];
    for (let i = 0; i < 15; i++) {
      items.push({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        delay: Math.random() * 4,
        size: 2 + Math.random() * 4,
      });
    }
    return items;
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-[6]">
      {sparkles.map((s) => (
        <div
          key={s.id}
          className="absolute bg-white rounded-full"
          style={{
            width: s.size,
            height: s.size,
            left: `${s.x}%`,
            top: `${s.y}%`,
            animation: `sparkle 3s ease-in-out ${s.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

// 3D 하키 퍽 그룹 (새로 추가)
function HockeyPucks3D() {
  const pucks = useMemo(
    () => [
      { x: 5, y: 15, scale: 0.8, delay: 0, duration: 7 },
      { x: 85, y: 25, scale: 0.6, delay: 1.5, duration: 8 },
      { x: 10, y: 70, scale: 0.5, delay: 3, duration: 6 },
      { x: 90, y: 65, scale: 0.7, delay: 2, duration: 9 },
    ],
    [],
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-[3]">
      {pucks.map((puck, i) => (
        <HockeyPuck3D key={i} {...puck} />
      ))}
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const [guardNotice, setGuardNotice] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  /**
   * API 가드 유도로 도착한 경우 `reason` 쿼리 감지 → 안내 메시지 표시.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const reason = params.get("reason");
    if (reason === "required") {
      setGuardNotice("로그인이 필요합니다.");
    } else if (reason === "expired") {
      setGuardNotice("로그인이 만료되었습니다. 다시 로그인해주세요.");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await authService.login(email, password);

      // 로그인 성공 → 다음 세션 만료 시 재차 리다이렉트가 정상 동작하도록 플래그 해제
      resetAdminAuthGuardRedirectFlag();

      // 쿠키가 설정될 때까지 대기 (미들웨어 인증 동기화, 최대 3초 타임아웃)
      const waitForCookie = () => {
        return new Promise<void>((resolve) => {
          const startTime = Date.now();
          const MAX_WAIT_MS = 3000; // 최대 3초 대기
          const checkCookie = () => {
            if (document.cookie.includes("teamplus_access_token")) {
              resolve();
            } else if (Date.now() - startTime >= MAX_WAIT_MS) {
              // 타임아웃 시 쿠키 없이 진행 (무한 루프 방지)
              console.warn(
                "[Login] 쿠키 대기 타임아웃 - 쿠키 없이 진행합니다.",
              );
              resolve();
            } else {
              // 쿠키가 아직 설정되지 않았으면 짧은 대기 후 재확인
              setTimeout(checkCookie, 10);
            }
          };
          checkCookie();
        });
      };

      await waitForCookie();

      // useAuthGuard / 미들웨어가 redirect 파라미터로 returnTo 를 부착했다면 우선 이동
      let targetPath = "/dashboard";
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const redirectParam = params.get("redirect");
        if (
          redirectParam &&
          redirectParam.startsWith("/") &&
          !redirectParam.startsWith("//")
        ) {
          targetPath = redirectParam;
        }
      }

      router.push(targetPath);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "로그인에 실패했습니다. 이메일과 비밀번호를 확인해주세요.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      suppressHydrationWarning
    >
      {/* CSS Animations */}
      <style jsx global>{`
        @keyframes iceSpray {
          0% {
            transform: translateY(0) translateX(0) scale(1);
            opacity: 0.9;
          }
          50% {
            opacity: 0.7;
          }
          100% {
            transform: translateY(-200px) translateX(var(--drift, 30px))
              scale(0.3);
            opacity: 0;
          }
        }

        @keyframes sparkle {
          0%,
          100% {
            opacity: 0;
            transform: scale(0.5);
          }
          50% {
            opacity: 1;
            transform: scale(1.2);
          }
        }

        @keyframes slowZoom {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
        }

        @keyframes fadeSlideUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeSlideRight {
          from {
            opacity: 0;
            transform: translateX(-30px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        /* 3D 하키 퍽 애니메이션 (새로 추가) */
        @keyframes puckFloat {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-20px);
          }
        }

        @keyframes puckSpin {
          0% {
            transform: rotateY(0deg) rotateX(15deg);
          }
          100% {
            transform: rotateY(360deg) rotateX(15deg);
          }
        }

        /* 아이스 링크 발광 효과 (새로 추가) */
        @keyframes rinkGlow {
          0%,
          100% {
            opacity: 0.4;
            box-shadow: 0 0 20px rgba(239, 68, 68, 0.3);
          }
          50% {
            opacity: 0.7;
            box-shadow: 0 0 40px rgba(239, 68, 68, 0.5);
          }
        }

        .animate-slow-zoom {
          animation: slowZoom 20s ease-in-out infinite;
        }

        .animate-fade-up {
          animation: fadeSlideUp 0.8s ease-out forwards;
        }

        .animate-fade-right {
          animation: fadeSlideRight 0.8s ease-out forwards;
        }

        .animation-delay-200 {
          animation-delay: 0.2s;
        }

        .animation-delay-400 {
          animation-delay: 0.4s;
        }

        .animation-delay-600 {
          animation-delay: 0.6s;
        }
      `}</style>

      {/* Full Screen Background Image with slow zoom animation */}
      <div className="absolute inset-0 overflow-hidden">
        <Image
          src="/images/Gemini_Generated_Image_dpp8owdpp8owdpp8.png"
          alt="Ice Hockey Background"
          fill
          priority
          className="object-cover animate-slow-zoom"
          sizes="100vw"
        />
      </div>

      {/* Dark Overlay */}
      <div className="absolute inset-0 bg-slate-900/50" />

      {/* Ice Rink Overlay (새로 추가) */}
      {mounted && <IceRinkOverlay />}

      {/* 3D Hockey Pucks (새로 추가) */}
      {mounted && <HockeyPucks3D />}

      {/* Ice Spray Particle Effect */}
      {mounted && <IceSprayEffect />}

      {/* Ice Sparkle Effect */}
      {mounted && <IceSparkles />}

      {/* Content */}
      <div className="relative z-10 min-h-screen flex">
        {/* Left Side - Branding */}
        <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center p-12">
          {/* Logo */}
          <div
            className={`text-center ${mounted ? "animate-fade-right" : "opacity-0"}`}
          >
            <p className="text-white/80 text-lg mb-4">
              아이스하키 대회·수강 관리를 한 번에
            </p>
            <div className="flex items-center justify-center gap-3">
              <h1 className="text-6xl font-extrabold tracking-tight">
                <span className="text-white">아이</span>
                <span className="text-[#4ADE80]">스</span>
                <span className="text-white">타임</span>
              </h1>
              {/* Hockey Stick Icon with pulse */}
              <svg className="w-14 h-14" viewBox="0 0 64 64" fill="none">
                <path
                  d="M12 52L32 32L44 20L48 16"
                  stroke="#4ADE80"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M48 16L52 20L48 24"
                  stroke="#4ADE80"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M52 52L32 32L20 20L16 16"
                  stroke="#4ADE80"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M16 16L12 20L16 24"
                  stroke="#4ADE80"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          {/* Stats with staggered animation */}
          <div
            className={`flex gap-12 mt-16 ${mounted ? "animate-fade-up animation-delay-400" : "opacity-0"}`}
          >
            <div className="text-center">
              <p className="text-4xl font-bold text-white">500+</p>
              <p className="text-white/60 text-sm mt-1">등록 클럽</p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-bold text-white">15,000+</p>
              <p className="text-white/60 text-sm mt-1">활성 회원</p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-bold text-white">99.9%</p>
              <p className="text-white/60 text-sm mt-1">서비스 안정성</p>
            </div>
          </div>

          {/* Footer */}
          <p className="absolute bottom-8 text-white/40 text-sm">
            © 2026 TEAMPLUS. All rights reserved.
          </p>
        </div>

        {/* Right Side - Login Form */}
        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-md">
            {/* Mobile Logo */}
            <div
              className={`lg:hidden text-center mb-10 ${mounted ? "animate-fade-up" : "opacity-0"}`}
            >
              <div className="inline-flex items-center gap-2 mb-4">
                <h1 className="text-4xl font-extrabold tracking-tight">
                  <span className="text-white">아이</span>
                  <span className="text-[#4ADE80]">스</span>
                  <span className="text-white">타임</span>
                </h1>
                <svg className="w-9 h-9" viewBox="0 0 64 64" fill="none">
                  <path
                    d="M12 52L32 32L44 20L48 16"
                    stroke="#4ADE80"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M48 16L52 20L48 24"
                    stroke="#4ADE80"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M52 52L32 32L20 20L16 16"
                    stroke="#4ADE80"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M16 16L12 20L16 24"
                    stroke="#4ADE80"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <p className="text-white/70 text-sm">
                아이스하키 대회·수강 관리를 한 번에
              </p>
            </div>

            {/* Login Card with entrance animation */}
            <div
              className={`bg-white/95 rounded-2xl p-8 shadow-2xl ${mounted ? "animate-fade-up animation-delay-200" : "opacity-0"}`}
            >
              {/* Header */}
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-900">로그인</h2>
                <p className="text-slate-500 mt-1">
                  계정에 로그인하여 시작하세요
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Email Input */}
                <div className="space-y-2">
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-slate-700"
                  >
                    이메일
                  </label>
                  <Input
                    id="email"
                    type="email"
                    name="email"
                    autoComplete="username"
                    placeholder="example@teamplus.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    className="login-autofill-fix h-12 !bg-white !border-slate-200 !text-slate-900 placeholder:!text-slate-400 dark:!bg-white dark:!border-slate-200 dark:!text-slate-900 dark:placeholder:!text-slate-400 focus:border-primary focus:ring-primary transition-all duration-200"
                    required
                  />
                </div>

                {/* Password Input */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="password"
                      className="block text-sm font-medium text-slate-700"
                    >
                      비밀번호
                    </label>
                    <Link
                      href="/forgot-password"
                      className="text-sm text-primary hover:text-primary-dark transition-colors"
                    >
                      비밀번호 찾기
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      name="password"
                      autoComplete="current-password"
                      placeholder="비밀번호를 입력하세요"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                      className="login-autofill-fix h-12 !bg-white !border-slate-200 !text-slate-900 placeholder:!text-slate-400 dark:!bg-white dark:!border-slate-200 dark:!text-slate-900 dark:placeholder:!text-slate-400 focus:border-primary focus:ring-primary transition-all duration-200 pr-12"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* 인증 가드 안내 (세션 만료 또는 미로그인 API 호출로 유도된 경우) */}
                {guardNotice && !error && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm flex items-start gap-2 animate-fade-up">
                    <svg
                      className="w-5 h-5 flex-shrink-0 mt-0.5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h.01a1 1 0 100-2H10V9z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>{guardNotice}</span>
                  </div>
                )}

                {/* Error Message */}
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2 animate-fade-up">
                    <svg
                      className="w-5 h-5 flex-shrink-0 mt-0.5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>{error}</span>
                  </div>
                )}

                {/* Submit Button with hover effect */}
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 bg-primary hover:bg-primary-dark text-white font-semibold rounded-lg transition-all duration-200 motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98] motion-reduce:transition-none"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      로그인 중...
                    </span>
                  ) : (
                    "로그인"
                  )}
                </Button>
              </form>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-3 bg-white text-slate-400">또는</span>
                </div>
              </div>

              {/* Sign Up Link */}
              <div className="text-center">
                <p className="text-sm text-slate-600">
                  아직 계정이 없으신가요?{" "}
                  <Link
                    href="/signup"
                    className="font-semibold text-primary hover:text-primary-dark transition-colors"
                  >
                    회원가입
                  </Link>
                </p>
              </div>
            </div>

            {/* Mobile Footer */}
            <div className="lg:hidden mt-8 text-center text-xs text-white/50">
              <p>© 2026 TEAMPLUS. All rights reserved.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
