"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { authService } from "@/services/auth.service";
import { UserType } from "@/types";

export default function SignupPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    email: "",
    phone: "",
    password: "",
    passwordConfirm: "",
    name: "",
    username: "",
    userType: UserType.PARENT,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    // Validation
    if (
      !formData.email ||
      !formData.phone ||
      !formData.password ||
      !formData.name
    ) {
      setError("모든 필드를 입력해주세요.");
      setIsLoading(false);
      return;
    }

    if (formData.password !== formData.passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      setIsLoading(false);
      return;
    }

    if (formData.password.length < 8) {
      setError("비밀번호는 최소 8자 이상이어야 합니다.");
      setIsLoading(false);
      return;
    }

    // Username validation (optional field but if provided, must be valid)
    if (formData.username && !/^[a-zA-Z0-9_]{3,20}$/.test(formData.username)) {
      setError(
        "사용자명은 영문, 숫자, 밑줄(_)만 사용 가능하며 3-20자여야 합니다.",
      );
      setIsLoading(false);
      return;
    }

    try {
      await authService.register({
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
        userType: formData.userType,
        name: formData.name,
        ...(formData.username && { username: formData.username }),
      });

      router.push("/dashboard");
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "회원가입에 실패했습니다. 다시 시도해주세요.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary shadow-md mb-4">
            <svg
              className="w-8 h-8"
              viewBox="0 0 64 64"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M12 52L32 32L44 20L48 16"
                stroke="white"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M48 16L52 20L48 24"
                stroke="white"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M52 52L32 32L20 20L16 16"
                stroke="white"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M16 16L12 20L16 24"
                stroke="white"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-1.5">
            회원가입
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            TEAMPLUS 아이스하키 클럽 관리 플랫폼에 가입하세요
          </p>
        </div>

        {/* Signup Card */}
        <Card className="border border-slate-200 dark:border-slate-700 p-8 bg-white dark:bg-slate-800 rounded-2xl shadow-md">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* User Type Selection */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-900 dark:text-white">
                회원 유형
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: UserType.PARENT, label: "학부모" },
                  { value: UserType.COACH, label: "코치" },
                  { value: UserType.ADMIN, label: "관리자" },
                  { value: UserType.CHILD, label: "학생" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, userType: option.value })
                    }
                    className={`min-h-[44px] py-2.5 px-3 rounded-lg border-2 text-sm font-semibold transition-colors motion-reduce:transition-none ${
                      formData.userType === option.value
                        ? "border-primary bg-primary/5 text-primary dark:text-primary-light"
                        : "border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500"
                    }`}
                    aria-pressed={formData.userType === option.value}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Name Input */}
            <div className="space-y-2">
              <label
                htmlFor="name"
                className="block text-sm font-medium text-slate-900 dark:text-white"
              >
                이름
              </label>
              <Input
                id="name"
                type="text"
                placeholder="이름을 입력해주세요"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                disabled={isLoading}
                className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-primary focus:ring-primary"
                required
              />
            </div>

            {/* Username Input */}
            <div className="space-y-2">
              <label
                htmlFor="username"
                className="block text-sm font-medium text-slate-900 dark:text-white"
              >
                사용자명{" "}
                <span className="text-slate-400 dark:text-slate-500 font-normal">
                  (선택)
                </span>
              </label>
              <Input
                id="username"
                type="text"
                placeholder="영문, 숫자, 밑줄 3-20자"
                value={formData.username}
                onChange={(e) =>
                  setFormData({ ...formData, username: e.target.value })
                }
                disabled={isLoading}
                className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-primary focus:ring-primary"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                로그인 후 헤더에 표시됩니다.
              </p>
            </div>

            {/* Email Input */}
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-900 dark:text-white"
              >
                이메일
              </label>
              <Input
                id="email"
                type="email"
                placeholder="example@teamplus.com"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                disabled={isLoading}
                className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-primary focus:ring-primary"
                required
              />
            </div>

            {/* Phone Input */}
            <div className="space-y-2">
              <label
                htmlFor="phone"
                className="block text-sm font-medium text-slate-900 dark:text-white"
              >
                전화번호
              </label>
              <Input
                id="phone"
                type="tel"
                placeholder="01012345678"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                disabled={isLoading}
                className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-primary focus:ring-primary"
                required
              />
            </div>

            {/* Password Input */}
            <div className="space-y-2">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-900 dark:text-white"
              >
                비밀번호
              </label>
              <Input
                id="password"
                type="password"
                placeholder="8자 이상 입력해주세요"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                disabled={isLoading}
                className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-primary focus:ring-primary"
                required
              />
            </div>

            {/* Password Confirm Input */}
            <div className="space-y-2">
              <label
                htmlFor="passwordConfirm"
                className="block text-sm font-medium text-slate-900 dark:text-white"
              >
                비밀번호 확인
              </label>
              <Input
                id="passwordConfirm"
                type="password"
                placeholder="비밀번호를 다시 입력해주세요"
                value={formData.passwordConfirm}
                onChange={(e) =>
                  setFormData({ ...formData, passwordConfirm: e.target.value })
                }
                disabled={isLoading}
                className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-primary focus:ring-primary"
                required
              />
            </div>

            {/* Error Message */}
            {error && (
              <div
                className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm"
                role="alert"
              >
                {error}
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 bg-primary hover:bg-primary-dark text-white font-semibold transition-colors motion-reduce:transition-none"
            >
              {isLoading ? "가입 중..." : "회원가입하기"}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white dark:bg-slate-800 px-2 text-slate-500 dark:text-slate-400">
                또는
              </span>
            </div>
          </div>

          {/* Login Link */}
          <div className="text-center">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              이미 계정이 있으신가요?{" "}
              <Link
                href="/login"
                className="font-semibold text-primary hover:text-primary-dark transition-colors"
              >
                로그인하기
              </Link>
            </p>
          </div>
        </Card>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-slate-500 dark:text-slate-500">
          <p>© 2026 TEAMPLUS. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
