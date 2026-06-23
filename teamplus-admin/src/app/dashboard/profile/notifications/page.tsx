"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import {
  BellRing,
  Mail,
  MessageSquare,
  Smartphone,
  Save,
  Bell,
  Calendar,
  CreditCard,
  Users,
} from "lucide-react";

interface NotificationSetting {
  id: string;
  title: string;
  description: string;
  email: boolean;
  push: boolean;
  sms: boolean;
}

const STORAGE_KEY = "teamplus_admin_notification_settings";

const DEFAULT_SETTINGS: NotificationSetting[] = [
  {
    id: "member",
    title: "회원 관련 알림",
    description: "신규 가입, 회원 승인 요청 등",
    email: true,
    push: true,
    sms: false,
  },
  {
    id: "class",
    title: "수업 관련 알림",
    description: "수업 등록, 변경, 취소 등",
    email: true,
    push: true,
    sms: true,
  },
  {
    id: "payment",
    title: "결제 관련 알림",
    description: "결제 완료, 환불, 미납 알림 등",
    email: true,
    push: true,
    sms: true,
  },
  {
    id: "notice",
    title: "공지사항 알림",
    description: "새로운 공지사항 등록 시",
    email: false,
    push: true,
    sms: false,
  },
];

const ICON_MAP: Record<string, React.ReactNode> = {
  member: <Users className="w-5 h-5" />,
  class: <Calendar className="w-5 h-5" />,
  payment: <CreditCard className="w-5 h-5" />,
  notice: <Bell className="w-5 h-5" />,
};

export default function NotificationSettingsPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [settings, setSettings] =
    useState<NotificationSetting[]>(DEFAULT_SETTINGS);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as NotificationSetting[];
        // 기본 설정과 머지 (새로운 항목 누락 방지)
        const merged = DEFAULT_SETTINGS.map((def) => {
          const found = parsed.find((p) => p.id === def.id);
          return found
            ? { ...def, email: found.email, push: found.push, sms: found.sms }
            : def;
        });
        setSettings(merged);
      }
    } catch {
      // localStorage 오류 시 기본값 유지
    }
  }, []);

  const handleToggle = (id: string, type: "email" | "push" | "sms") => {
    setSettings((prev) =>
      prev.map((setting) =>
        setting.id === id ? { ...setting, [type]: !setting[type] } : setting,
      ),
    );
    setIsSaved(false);
    setSaveError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setSaveError("");
    setIsSaved(false);

    try {
      // 백엔드 알림 설정 API 미구현 → localStorage에 저장
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      setIsSaved(true);
    } catch {
      setSaveError("설정 저장에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  const ToggleSwitch = ({
    enabled,
    onChange,
    label,
  }: {
    enabled: boolean;
    onChange: () => void;
    label: string;
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800 ${
        enabled ? "bg-primary" : "bg-slate-300 dark:bg-slate-600"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${
          enabled ? "translate-x-6" : "translate-x-1"
        }`}
        aria-hidden="true"
      />
    </button>
  );

  return (
    <>
      <PageHeader
        title="알림 설정"
        subtitle="알림 수신 방법을 설정할 수 있습니다."
      />

      <div className="max-w-3xl">
        <form onSubmit={handleSubmit}>
          {/* 알림 방식 안내 */}
          <Card className="p-4 mb-6 dark:bg-slate-800 dark:border-slate-700">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <Mail className="w-4 h-4" />
                  <span>이메일</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <Smartphone className="w-4 h-4" />
                  <span>푸시 알림</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <MessageSquare className="w-4 h-4" />
                  <span>문자(SMS)</span>
                </div>
              </div>
            </div>
          </Card>

          {/* 알림 설정 목록 */}
          <div className="space-y-4">
            {settings.map((setting) => (
              <Card
                key={setting.id}
                className="p-5 dark:bg-slate-800 dark:border-slate-700"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-400">
                      {ICON_MAP[setting.id]}
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-slate-900 dark:text-white">
                        {setting.title}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {setting.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {/* 이메일 */}
                    <div className="flex flex-col items-center gap-1.5">
                      <ToggleSwitch
                        enabled={setting.email}
                        onChange={() => handleToggle(setting.id, "email")}
                        label={`${setting.title} 이메일 알림 ${setting.email ? "켜짐" : "꺼짐"}`}
                      />
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        이메일
                      </span>
                    </div>

                    {/* 푸시 */}
                    <div className="flex flex-col items-center gap-1.5">
                      <ToggleSwitch
                        enabled={setting.push}
                        onChange={() => handleToggle(setting.id, "push")}
                        label={`${setting.title} 푸시 알림 ${setting.push ? "켜짐" : "꺼짐"}`}
                      />
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        푸시
                      </span>
                    </div>

                    {/* SMS */}
                    <div className="flex flex-col items-center gap-1.5">
                      <ToggleSwitch
                        enabled={setting.sms}
                        onChange={() => handleToggle(setting.id, "sms")}
                        label={`${setting.title} SMS 알림 ${setting.sms ? "켜짐" : "꺼짐"}`}
                      />
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        SMS
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* 추가 안내 */}
          <Card className="p-4 mt-6 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
            <div className="flex items-start gap-3">
              <BellRing className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  알림 수신 안내
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  SMS 알림은 등록된 연락처로 발송됩니다. 연락처가 변경된 경우 내
                  정보에서 먼저 수정해주세요.
                </p>
              </div>
            </div>
          </Card>

          {/* 저장 버튼 */}
          <div className="pt-6 flex items-center gap-3">
            <Button
              type="submit"
              disabled={isLoading}
              className="h-11 bg-primary hover:bg-primary-dark text-white font-semibold gap-2 transition-colors motion-reduce:transition-none"
            >
              <Save className="w-4 h-4" aria-hidden="true" />
              {isLoading ? "저장 중..." : "저장하기"}
            </Button>
            {isSaved && !saveError && (
              <span
                className="text-sm text-green-600 dark:text-green-400"
                role="status"
              >
                설정이 저장되었습니다.
              </span>
            )}
            {saveError && (
              <span
                className="text-sm text-red-600 dark:text-red-400"
                role="alert"
              >
                {saveError}
              </span>
            )}
          </div>
        </form>
      </div>
    </>
  );
}
