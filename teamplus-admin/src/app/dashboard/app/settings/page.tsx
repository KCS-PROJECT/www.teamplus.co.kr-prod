"use client";

/**
 * 앱 설정 관리 페이지 - TEAMPLUS Admin
 *
 * === Design 7 Principles 적용 ===
 * 1. 화면 분석: 운영 설정 / 앱 버전 / 회원 인증 / 서비스 설정 4탭 구조
 * 2. 휴먼 디자인: 직관적인 탭 UI, 점검 모드 경고 강조
 * 3. AI 스타일 금지: gradient, blur, 컬러 그림자 미사용
 * 4. 페르소나 융합: frontend + architect
 * 5. Tone & Manner: 존댓말, 한국어 액션 동사
 */

import { useState, useEffect, useCallback, useId } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  Save,
  RotateCcw,
  Settings,
  Smartphone,
  Shield,
  Server,
  AlertTriangle,
  CheckCircle,
  XCircle,
  CreditCard,
} from "lucide-react";
import { api } from "@/services/api-client";

// ==================== Types ====================

interface AppSettingsData {
  // 운영 설정
  maintenanceMode: boolean;
  maintenanceMessage: string;
  debugMode: boolean;

  // 앱 버전
  minimumAppVersionIos: string;
  minimumAppVersionAnd: string;
  forceUpdateMessage: string;

  // 회원/인증
  signupEnabled: boolean;
  socialLoginEnabled: boolean;
  maxLoginAttempts: number;
  sessionTimeout: number;

  // 서비스 설정
  creditExpireDays: number;
  qrExpireMinutes: number;
  supportEmail: string;
  supportPhone: string;
  supportHours: string;
  termsVersion: string;
  privacyVersion: string;

  // 결제
  paymentProvider: string;
}

/** 결제사 목록 — 선택 가능 여부는 서버가 판정(키 설정 + 결제 화면 구현). */
interface PaymentProviderOption {
  code: string;
  label: string;
  selectable: boolean;
  reason: string | null;
}

function normalizeSettings(
  data?: Partial<AppSettingsData> | null,
): AppSettingsData {
  return {
    ...DEFAULT_SETTINGS,
    ...(data ?? {}),
    maintenanceMessage:
      data?.maintenanceMessage ?? DEFAULT_SETTINGS.maintenanceMessage,
    forceUpdateMessage:
      data?.forceUpdateMessage ?? DEFAULT_SETTINGS.forceUpdateMessage,
    supportEmail: data?.supportEmail ?? DEFAULT_SETTINGS.supportEmail,
    supportPhone: data?.supportPhone ?? DEFAULT_SETTINGS.supportPhone,
    supportHours: data?.supportHours ?? DEFAULT_SETTINGS.supportHours,
    minimumAppVersionIos:
      data?.minimumAppVersionIos ?? DEFAULT_SETTINGS.minimumAppVersionIos,
    minimumAppVersionAnd:
      data?.minimumAppVersionAnd ?? DEFAULT_SETTINGS.minimumAppVersionAnd,
    termsVersion: data?.termsVersion ?? DEFAULT_SETTINGS.termsVersion,
    privacyVersion: data?.privacyVersion ?? DEFAULT_SETTINGS.privacyVersion,
    paymentProvider:
      data?.paymentProvider ?? DEFAULT_SETTINGS.paymentProvider,
  };
}

/**
 * 저장 payload 의 필드 화이트리스트 — 단일 출처.
 *   백엔드가 forbidNonWhitelisted: true 라 응답에 딸려온 id·createdAt 같은 메타 필드가
 *   섞이면 400 이 난다. 보낼 필드를 늘릴 때는 이 함수만 고치면 된다.
 */
function buildUpdatePayload(
  settings: AppSettingsData,
): Partial<AppSettingsData> {
  // 빈 문자열은 아예 보내지 않는다 — 백엔드 검증이 빈 값을 거절한다.
  const orUndefined = (value: string) => value.trim() || undefined;
  return {
    maintenanceMode: settings.maintenanceMode,
    maintenanceMessage: orUndefined(settings.maintenanceMessage),
    debugMode: settings.debugMode,
    minimumAppVersionIos: settings.minimumAppVersionIos.trim(),
    minimumAppVersionAnd: settings.minimumAppVersionAnd.trim(),
    forceUpdateMessage: orUndefined(settings.forceUpdateMessage),
    signupEnabled: settings.signupEnabled,
    socialLoginEnabled: settings.socialLoginEnabled,
    maxLoginAttempts: settings.maxLoginAttempts,
    sessionTimeout: settings.sessionTimeout,
    creditExpireDays: settings.creditExpireDays,
    qrExpireMinutes: settings.qrExpireMinutes,
    supportEmail: orUndefined(settings.supportEmail),
    supportPhone: orUndefined(settings.supportPhone),
    supportHours: orUndefined(settings.supportHours),
    termsVersion: settings.termsVersion.trim(),
    privacyVersion: settings.privacyVersion.trim(),
    paymentProvider: settings.paymentProvider,
  };
}

const DEFAULT_SETTINGS: AppSettingsData = {
  maintenanceMode: false,
  maintenanceMessage: "",
  debugMode: false,
  minimumAppVersionIos: "1.0.0",
  minimumAppVersionAnd: "1.0.0",
  forceUpdateMessage: "새 버전이 출시되었습니다. 업데이트 후 이용해주세요.",
  signupEnabled: true,
  socialLoginEnabled: true,
  maxLoginAttempts: 5,
  sessionTimeout: 60,
  creditExpireDays: 90,
  qrExpireMinutes: 5,
  supportEmail: "",
  supportPhone: "",
  supportHours: "",
  termsVersion: "1.0",
  privacyVersion: "1.0",
  paymentProvider: "toss",
};

type TabId = "operation" | "version" | "auth" | "service" | "payment";

interface Tab {
  id: TabId;
  label: string;
  icon: typeof Settings;
}

const TABS: Tab[] = [
  { id: "operation", label: "운영 설정", icon: Settings },
  { id: "version", label: "앱 버전", icon: Smartphone },
  { id: "auth", label: "회원/인증", icon: Shield },
  { id: "service", label: "서비스 설정", icon: Server },
  { id: "payment", label: "결제", icon: CreditCard },
];

// ==================== API Functions ====================

async function fetchSettings(): Promise<AppSettingsData> {
  const data = await api.get<AppSettingsData>("/app/settings");
  return normalizeSettings(data);
}

async function fetchPaymentProviders(): Promise<PaymentProviderOption[]> {
  return api.get<PaymentProviderOption[]>("/payments/providers");
}

/** payload 구성은 buildUpdatePayload 가 책임진다 — 여기서 다시 걸러내면 필드 누락이 생긴다. */
async function updateSettings(
  payload: Partial<AppSettingsData>,
): Promise<AppSettingsData> {
  const data = await api.patch<AppSettingsData>("/app/settings", payload);
  return normalizeSettings(data);
}

// ==================== Toggle Switch Component ====================

function ToggleSwitch({
  checked,
  onChange,
  danger = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors motion-reduce:transition-none ${
        checked
          ? danger
            ? "bg-red-600"
            : "bg-primary"
          : "bg-slate-300 dark:bg-slate-600"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white transition-transform motion-reduce:transition-none ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

// ==================== Inner Page (with TanStack Query context) ====================

function AppSettingsContent() {
  const queryClient = useQueryClient();
  const maintenanceMessageId = useId();
  const iosMinVersionId = useId();
  const andMinVersionId = useId();
  const forceUpdateMessageId = useId();
  const maxLoginAttemptsId = useId();
  const sessionTimeoutId = useId();
  const creditExpireDaysId = useId();
  const qrExpireMinutesId = useId();
  const supportEmailId = useId();
  const supportPhoneId = useId();
  const supportHoursId = useId();
  const termsVersionId = useId();
  const privacyVersionId = useId();
  const [activeTab, setActiveTab] = useState<TabId>("operation");
  const [formData, setFormData] = useState<AppSettingsData>(DEFAULT_SETTINGS);
  const [isDirty, setIsDirty] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // 설정 조회
  const {
    data: settings,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["app-settings"],
    queryFn: fetchSettings,
    staleTime: 60 * 1000,
    retry: 1,
  });

  // 결제사 목록 — 선택 가능 여부를 서버가 판정하므로 화면에 하드코딩하지 않는다.
  const { data: providers } = useQuery({
    queryKey: ["payment-providers"],
    queryFn: fetchPaymentProviders,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // 설정 저장
  const saveMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      setStatusMsg({ type: "success", text: "설정이 저장되었습니다." });
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ["app-settings"] });
      setTimeout(() => setStatusMsg(null), 3000);
    },
    onError: (error: unknown) => {
      // 결제사처럼 서버가 거절 사유를 주는 항목은 그대로 보여준다 — 왜 저장이 안 됐는지
      //   알 수 없으면 관리자가 같은 시도를 반복하게 된다.
      const res = (
        error as { response?: { data?: { message?: string } } } | undefined
      )?.response?.data?.message;
      setStatusMsg({
        type: "error",
        text: res ?? "설정 저장 중 오류가 발생했습니다.",
      });
      setTimeout(() => setStatusMsg(null), 5000);
    },
  });

  // 서버 데이터 → 폼 동기화
  useEffect(() => {
    if (settings) {
      setFormData(normalizeSettings(settings));
    }
  }, [settings]);

  const updateField = useCallback(
    <K extends keyof AppSettingsData>(key: K, value: AppSettingsData[K]) => {
      setFormData((prev) => ({ ...prev, [key]: value }));
      setIsDirty(true);
      setStatusMsg(null);
    },
    [],
  );

  const handleSave = () => {
    saveMutation.mutate(buildUpdatePayload(formData));
  };

  const handleReset = () => {
    if (settings) {
      setFormData(normalizeSettings(settings));
    } else {
      setFormData(DEFAULT_SETTINGS);
    }
    setIsDirty(false);
    setStatusMsg(null);
  };

  if (isLoading) {
    return <LoadingSpinner message="설정을 불러오는 중..." />;
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="앱 설정" description="앱의 전체 설정을 관리합니다" />
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-8 text-center">
          <XCircle
            className="w-12 h-12 text-red-400 mx-auto mb-3"
            aria-hidden="true"
          />
          <p className="text-slate-700 dark:text-slate-300">
            설정을 불러오지 못했습니다.
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            백엔드 API 연결 상태를 확인해주세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <PageHeader title="앱 설정" description="앱의 전체 설정을 관리합니다" />

      {/* 점검 모드 경고 배너 */}
      {formData.maintenanceMode && (
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl shadow-sm">
          <AlertTriangle
            className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0"
            aria-hidden="true"
          />
          <div>
            <p className="font-medium text-red-700 dark:text-red-400">
              점검 모드가 활성화되어 있습니다
            </p>
            <p className="text-sm text-red-600 dark:text-red-400/80 mt-0.5">
              사용자 접근이 제한됩니다. 점검 완료 후 반드시 비활성화하세요.
            </p>
          </div>
        </div>
      )}

      {/* 탭 네비게이션 */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[44px] flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors motion-reduce:transition-none ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"
                }`}
              >
                <TabIcon className="w-4 h-4" aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {/* 운영 설정 탭 */}
          {activeTab === "operation" && (
            <div className="space-y-6">
              {/* 점검 모드 토글 */}
              <div
                className={`p-5 rounded-xl border ${
                  formData.maintenanceMode
                    ? "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10"
                    : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        formData.maintenanceMode
                          ? "bg-red-100 dark:bg-red-900/30"
                          : "bg-slate-200 dark:bg-slate-600"
                      }`}
                    >
                      <AlertTriangle
                        className={`w-5 h-5 ${
                          formData.maintenanceMode
                            ? "text-red-600 dark:text-red-400"
                            : "text-slate-500 dark:text-slate-400"
                        }`}
                        aria-hidden="true"
                      />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">
                        점검 모드
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        활성화 시 사용자 접근이 제한됩니다
                      </p>
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={formData.maintenanceMode}
                    onChange={(v) => updateField("maintenanceMode", v)}
                    danger
                  />
                </div>
              </div>

              {/* 점검 메시지 */}
              <div className="space-y-2">
                <label
                  htmlFor={maintenanceMessageId}
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  점검 메시지
                </label>
                <textarea
                  id={maintenanceMessageId}
                  value={formData.maintenanceMessage}
                  onChange={(e) =>
                    updateField("maintenanceMessage", e.target.value)
                  }
                  placeholder="서비스 점검 중입니다. 불편을 드려 죄송합니다."
                  aria-label="점검 모드 안내 메시지"
                  rows={3}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              {/* 디버그 모드 */}
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/30 rounded-xl border border-slate-200 dark:border-slate-700">
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">
                    디버그 모드
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    개발/테스트 시 상세 로그를 활성화합니다
                  </p>
                </div>
                <ToggleSwitch
                  checked={formData.debugMode}
                  onChange={(v) => updateField("debugMode", v)}
                />
              </div>
            </div>
          )}

          {/* 앱 버전 탭 */}
          {activeTab === "version" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label
                    htmlFor={iosMinVersionId}
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    iOS 최소 버전
                  </label>
                  <Input
                    id={iosMinVersionId}
                    value={formData.minimumAppVersionIos}
                    onChange={(e) =>
                      updateField("minimumAppVersionIos", e.target.value)
                    }
                    placeholder="예: 1.0.0"
                    aria-label="iOS 최소 지원 버전"
                    className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Semantic Versioning (예: 1.2.3)
                  </p>
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor={andMinVersionId}
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Android 최소 버전
                  </label>
                  <Input
                    id={andMinVersionId}
                    value={formData.minimumAppVersionAnd}
                    onChange={(e) =>
                      updateField("minimumAppVersionAnd", e.target.value)
                    }
                    placeholder="예: 1.0.0"
                    aria-label="Android 최소 지원 버전"
                    className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Semantic Versioning (예: 1.2.3)
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor={forceUpdateMessageId}
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  강제 업데이트 메시지
                </label>
                <textarea
                  id={forceUpdateMessageId}
                  value={formData.forceUpdateMessage}
                  onChange={(e) =>
                    updateField("forceUpdateMessage", e.target.value)
                  }
                  placeholder="새 버전이 출시되었습니다. 업데이트 후 이용해주세요."
                  aria-label="강제 업데이트 안내 메시지"
                  rows={3}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  최소 버전 미만 사용자에게 표시되는 메시지입니다
                </p>
              </div>
            </div>
          )}

          {/* 회원/인증 탭 */}
          {activeTab === "auth" && (
            <div className="space-y-6">
              {/* 토글 설정들 */}
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/30 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">
                      회원가입 허용
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      비활성화 시 신규 회원가입이 차단됩니다
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={formData.signupEnabled}
                    onChange={(v) => updateField("signupEnabled", v)}
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/30 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">
                      소셜 로그인 허용
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      카카오, 네이버 등 소셜 로그인 사용 여부
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={formData.socialLoginEnabled}
                    onChange={(v) => updateField("socialLoginEnabled", v)}
                  />
                </div>
              </div>

              {/* 수치 설정들 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label
                    htmlFor={maxLoginAttemptsId}
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    최대 로그인 시도 횟수
                  </label>
                  <Input
                    id={maxLoginAttemptsId}
                    type="number"
                    min={1}
                    max={10}
                    value={formData.maxLoginAttempts}
                    onChange={(e) =>
                      updateField(
                        "maxLoginAttempts",
                        parseInt(e.target.value) || 5,
                      )
                    }
                    placeholder="예: 5"
                    aria-label="최대 로그인 시도 횟수"
                    className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    초과 시 계정이 일시 잠금됩니다
                  </p>
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor={sessionTimeoutId}
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    세션 타임아웃 (분)
                  </label>
                  <Input
                    id={sessionTimeoutId}
                    type="number"
                    min={5}
                    max={480}
                    value={formData.sessionTimeout}
                    onChange={(e) =>
                      updateField(
                        "sessionTimeout",
                        parseInt(e.target.value) || 60,
                      )
                    }
                    placeholder="예: 60"
                    aria-label="세션 타임아웃 (분)"
                    className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    비활동 시 자동 로그아웃까지의 시간
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 서비스 설정 탭 */}
          {activeTab === "service" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label
                    htmlFor={creditExpireDaysId}
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    결제권 만료일 (일)
                  </label>
                  <Input
                    id={creditExpireDaysId}
                    type="number"
                    min={30}
                    max={365}
                    value={formData.creditExpireDays}
                    onChange={(e) =>
                      updateField(
                        "creditExpireDays",
                        parseInt(e.target.value) || 90,
                      )
                    }
                    placeholder="예: 90"
                    aria-label="결제권 만료일 (일)"
                    className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    구매 후 결제권이 만료되기까지의 기간
                  </p>
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor={qrExpireMinutesId}
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    QR 만료 시간 (분)
                  </label>
                  <Input
                    id={qrExpireMinutesId}
                    type="number"
                    min={1}
                    max={60}
                    value={formData.qrExpireMinutes}
                    onChange={(e) =>
                      updateField(
                        "qrExpireMinutes",
                        parseInt(e.target.value) || 5,
                      )
                    }
                    placeholder="예: 5"
                    aria-label="QR 만료 시간 (분)"
                    className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    출석 QR 코드 유효 시간
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label
                    htmlFor={supportEmailId}
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    운영 문의 이메일
                  </label>
                  <Input
                    id={supportEmailId}
                    type="email"
                    value={formData.supportEmail}
                    onChange={(e) =>
                      updateField("supportEmail", e.target.value)
                    }
                    placeholder="support@teamplus.com"
                    aria-label="운영 문의 이메일"
                    className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor={supportPhoneId}
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    운영 문의 전화
                  </label>
                  <Input
                    id={supportPhoneId}
                    value={formData.supportPhone}
                    onChange={(e) =>
                      updateField("supportPhone", e.target.value)
                    }
                    placeholder="02-1234-5678"
                    aria-label="운영 문의 전화번호"
                    className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor={supportHoursId}
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    고객센터 운영시간
                  </label>
                  <Input
                    id={supportHoursId}
                    value={formData.supportHours}
                    onChange={(e) =>
                      updateField("supportHours", e.target.value)
                    }
                    placeholder="평일 09:00~18:00"
                    aria-label="고객센터 운영시간"
                    className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label
                    htmlFor={termsVersionId}
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    이용약관 버전
                  </label>
                  <Input
                    id={termsVersionId}
                    value={formData.termsVersion}
                    onChange={(e) =>
                      updateField("termsVersion", e.target.value)
                    }
                    placeholder="예: 1.0"
                    aria-label="이용약관 버전"
                    className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                  />
                  <p className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                    v 없이 숫자만 입력
                  </p>
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor={privacyVersionId}
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    개인정보처리방침 버전
                  </label>
                  <Input
                    id={privacyVersionId}
                    value={formData.privacyVersion}
                    onChange={(e) =>
                      updateField("privacyVersion", e.target.value)
                    }
                    placeholder="예: 1.0"
                    aria-label="개인정보처리방침 버전"
                    className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                  />
                  <p className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                    v 없이 숫자만 입력
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 결제 탭 */}
          {activeTab === "payment" && (
            <div className="space-y-6">
              <div className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30">
                <AlertTriangle
                  className="w-5 h-5 text-slate-500 dark:text-slate-400 flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    새로 시작하는 결제에만 적용됩니다
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    이미 결제된 건의 취소·환불은 결제 당시 결제사로 처리되므로,
                    결제사를 바꿔도 기존 결제에는 영향이 없습니다.
                  </p>
                </div>
              </div>

              <div
                role="radiogroup"
                aria-label="결제사 선택"
                className="space-y-3"
              >
                {(providers ?? []).map((provider) => {
                  const isSelected =
                    formData.paymentProvider === provider.code;
                  return (
                    <label
                      key={provider.code}
                      className={`flex items-center gap-3 p-5 rounded-xl border transition-colors motion-reduce:transition-none ${
                        !provider.selectable
                          ? "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 cursor-not-allowed"
                          : isSelected
                            ? "border-primary bg-white dark:bg-slate-800 cursor-pointer"
                            : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 cursor-pointer"
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentProvider"
                        value={provider.code}
                        checked={isSelected}
                        disabled={!provider.selectable}
                        onChange={() =>
                          updateField("paymentProvider", provider.code)
                        }
                        className="w-5 h-5"
                      />
                      <div className="flex-1">
                        <p
                          className={`text-sm font-medium ${
                            provider.selectable
                              ? "text-slate-800 dark:text-slate-200"
                              : "text-slate-400 dark:text-slate-500"
                          }`}
                        >
                          {provider.label}
                        </p>
                        {provider.reason && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {provider.reason}
                          </p>
                        )}
                      </div>
                      {isSelected && (
                        <span className="text-xs font-medium text-primary">
                          사용 중
                        </span>
                      )}
                    </label>
                  );
                })}
                {(providers ?? []).length === 0 && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    결제사 목록을 불러오지 못했습니다. 백엔드 연결 상태를
                    확인해주세요.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 저장 버튼 영역 */}
      <div className="flex items-center justify-between gap-3">
        {/* 인라인 상태 메시지 */}
        <div className="flex-1">
          {statusMsg && (
            <div
              className={`flex items-center gap-2 text-sm font-medium ${
                statusMsg.type === "success"
                  ? "text-green-600 dark:text-green-400"
                  : statusMsg.type === "error"
                    ? "text-red-600 dark:text-red-400"
                    : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {statusMsg.type === "success" && (
                <CheckCircle className="w-4 h-4" aria-hidden="true" />
              )}
              {statusMsg.type === "error" && (
                <XCircle className="w-4 h-4" aria-hidden="true" />
              )}
              {statusMsg.text}
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={!isDirty}
            className="h-12 px-5 text-base font-bold gap-2 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            초기화
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saveMutation.isPending}
            className="h-12 px-5 text-base font-bold bg-primary hover:bg-primary-dark gap-2"
          >
            <Save className="w-4 h-4" aria-hidden="true" />
            {saveMutation.isPending ? "저장 중..." : "설정 저장하기"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ==================== Page ====================
// [2026-06-07 D-2] 페이지별 QueryClient 제거 → 루트 레이아웃 글로벌 QueryProvider 사용(캐시 공유)

export default function AppSettingsPage() {
  return <AppSettingsContent />;
}
