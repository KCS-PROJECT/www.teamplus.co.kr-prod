"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { KeyRound, Mail, ArrowLeft, CheckCircle } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!email) return;
    setIsSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary shadow-md mb-4">
            <KeyRound className="w-7 h-7 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-1.5">
            비밀번호 찾기
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            등록하신 이메일로 재설정 링크를 보내드립니다
          </p>
        </div>

        {/* Card */}
        <Card className="border border-slate-200 dark:border-slate-700 p-8 bg-white dark:bg-slate-800 rounded-2xl shadow-md">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="forgot-email"
                className="block text-sm font-medium text-slate-900 dark:text-white"
              >
                이메일
              </label>
              <div className="relative">
                <Mail
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500"
                  aria-hidden="true"
                />
                <Input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="admin@teamplus.com"
                  className="h-12 pl-10 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-primary focus:ring-primary"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            {isSubmitted && (
              <div
                className="flex items-start gap-2.5 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-400"
                role="status"
              >
                <CheckCircle
                  className="w-4 h-4 flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <span>재설정 링크를 전송했습니다. 이메일을 확인해주세요.</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-12 bg-primary hover:bg-primary-dark text-white font-semibold transition-colors motion-reduce:transition-none"
            >
              재설정 링크 보내기
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:text-primary dark:hover:text-primary-light transition-colors"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              로그인으로 돌아가기
            </Link>
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
