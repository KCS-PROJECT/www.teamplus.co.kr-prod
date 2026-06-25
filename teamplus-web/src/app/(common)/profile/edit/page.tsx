"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Script from "next/script";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { useNativeUI } from '@/hooks/useNativeUI';
import { FullModal } from "@/components/ui/Modal/FullModal";
import { Icon } from "@/components/ui/Icon";
import { useNavigation } from "@/components/ui/NavLink";
import { useToast } from "@/components/ui/Toast";
import { AvatarUploader } from "@/components/shared/AvatarUploader";
import { api } from "@/services/api-client";
import { MESSAGES } from "@/lib/messages";
import { useSessionAuth } from "@/hooks/useSessionAuth";
import type { UploadedFile } from "@/types/file";
import { usePageReady } from '@/hooks/usePageReady';

/**
 * ProfileEditPage — 공용 프로필 수정 화면 (모든 역할)
 * Route: /profile/edit
 *
 * 로드: GET /auth/profile (초기값)
 * 저장: PUT /users/me/profile (zipCode, address, addressDetail)
 * 아바타: 통합 Files 모듈 (category=AVATAR) — AvatarUploader 즉시 업로드
 *
 * 본인인증 기반 필드(성·이름·연락처)는 읽기 전용으로 표시.
 */

interface ProfileResponse {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  zipCode: string | null;
  address: string | null;
  addressDetail: string | null;
}

interface ProfileFormData {
  firstName: string;
  lastName: string;
  phone: string;
  avatarUrl: string | null;
  zipCode: string;
  address: string;
  addressDetail: string;
}

const EMPTY_FORM: ProfileFormData = {
  firstName: "",
  lastName: "",
  phone: "",
  avatarUrl: null,
  zipCode: "",
  address: "",
  addressDetail: "",
};

interface AddressSnapshot {
  zipCode: string;
  address: string;
  addressDetail: string;
}

export default function ProfileEditPage() {
  // 공통 AppBar 사용 — Flutter 네이티브 AppBar 비활성화 (중복 헤더 방지)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });


  const { back } = useNavigation();
  const { toast } = useToast();
  const { user, refreshUser } = useSessionAuth();
  const lastNameId = useId();
  const firstNameId = useId();
  const phoneId = useId();
  const zipCodeId = useId();
  const addressId = useId();
  const addressDetailId = useId();

  const [formData, setFormData] = useState<ProfileFormData>(EMPTY_FORM);
  const [initialAddress, setInitialAddress] = useState<AddressSnapshot>({
    zipCode: "",
    address: "",
    addressDetail: "",
  });
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [postcodeOpen, setPostcodeOpen] = useState(false);
  const postcodeContainerRef = useRef<HTMLDivElement>(null);

  // v16 (2026-05-16) 풀스크린 로더 hide 타이밍 정책:
  // 데이터 fetch 완료 + 화면 셋팅 완료 후에만 ready 신호.
  // 이전 `usePageReady(true)` 즉시 호출 → 비동기 fetch 진행 중에도 LoadingPuck 가 hide 되어
  // main 안에 spinner 만 표시되다 폼이 갑자기 마운트되며 페이지 reflow → 스크롤 영역이
  // 위로 한참 늘어나는 현상 발생. loadError 도 ready 조건에 포함하여 에러 상태도 즉시 노출.
  usePageReady(!isInitialLoading || loadError !== null);

  const isDirty =
    formData.zipCode !== initialAddress.zipCode ||
    formData.address !== initialAddress.address ||
    formData.addressDetail !== initialAddress.addressDetail;

  // 초기값 로드
  useEffect(() => {
    let cancelled = false;
    const fetchProfile = async () => {
      setIsInitialLoading(true);
      setLoadError(null);
      const response = await api.get<ProfileResponse>("/auth/profile");
      if (cancelled) return;

      if (response.success && response.data) {
        const snapshot: AddressSnapshot = {
          zipCode: response.data.zipCode ?? "",
          address: response.data.address ?? "",
          addressDetail: response.data.addressDetail ?? "",
        };
        setFormData({
          firstName: response.data.firstName ?? "",
          lastName: response.data.lastName ?? "",
          phone: response.data.phone ?? "",
          avatarUrl: response.data.avatarUrl ?? null,
          ...snapshot,
        });
        setInitialAddress(snapshot);
      } else {
        setLoadError(response.error?.message ?? MESSAGES.common.loadFailed);
      }
      setIsInitialLoading(false);
    };

    void fetchProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAddressDetailChange = useCallback((value: string) => {
    setFormData((prev) => ({ ...prev, addressDetail: value }));
  }, []);

  const handlePostcodeSearch = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const daum = (window as any).daum;
    if (!daum?.Postcode) {
      toast.error(MESSAGES.error.general);
      return;
    }
    setPostcodeOpen(true);
    // embed 렌더링을 위해 다음 틱에서 실행
    setTimeout(() => {
      if (!postcodeContainerRef.current) return;
      new daum.Postcode({
        oncomplete: (data: {
          zonecode: string;
          roadAddress: string;
          jibunAddress: string;
        }) => {
          setFormData((prev) => ({
            ...prev,
            zipCode: data.zonecode,
            address: data.roadAddress || data.jibunAddress,
          }));
          setPostcodeOpen(false);
        },
        width: "100%",
        height: "100%",
      }).embed(postcodeContainerRef.current);
    }, 100);
  }, [toast]);

  const handleAvatarUploaded = useCallback(
    async (file: UploadedFile) => {
      // 업로드 완료 즉시 서버에 avatarUrl 반영 (낙관적 업데이트)
      setFormData((prev) => ({ ...prev, avatarUrl: file.url }));

      const response = await api.put<ProfileResponse>("/users/me/profile", {
        avatarUrl: file.url,
      });
      if (response.success) {
        toast.success(MESSAGES.upload.success);
        // AuthContext 강제 재로드 → sessionStorage 캐시 + React state 동시 갱신.
        // 사이드메뉴(GlobalMenu) · 마이페이지 · 드로워 등 useAuth 를 쓰는 모든 곳에 즉시 반영.
        await refreshUser();
      } else {
        toast.error(response.error?.message ?? MESSAGES.save.fail);
      }
    },
    [toast, refreshUser],
  );

  const handleSubmit = useCallback(async () => {
    if (!isDirty || isSaving) return;

    setIsSaving(true);
    const response = await api.put<ProfileResponse>("/users/me/profile", {
      zipCode: formData.zipCode,
      address: formData.address,
      addressDetail: formData.addressDetail.trim(),
    });
    setIsSaving(false);

    if (response.success) {
      toast.success(MESSAGES.save.success);
      setInitialAddress({
        zipCode: formData.zipCode,
        address: formData.address,
        addressDetail: formData.addressDetail.trim(),
      });
      back();
    } else {
      toast.error(response.error?.message ?? MESSAGES.save.fail);
    }
  }, [
    back,
    formData.address,
    formData.addressDetail,
    formData.zipCode,
    isDirty,
    isSaving,
    toast,
  ]);

  return (
    <MobileContainer hasBottomNav={true}>
      <PageAppBar title="프로필 수정" forceNative />

      {/* Main Content — 단일 스크롤 컨테이너, 액션바는 컨텐츠 끝에 인라인 배치
          data-no-enter: globals.css §"페이지 진입 stagger 애니메이션" opt-out 마커.
          하단→위 slideUp(translateY 100%→0) 진입 효과 비활성 (사용자 직접 지시 2026-05-17). */}
      <main data-no-enter className="flex-1 overflow-y-auto overflow-x-hidden bg-it-canvas dark:bg-puck !pb-8">
        {isInitialLoading ? (
          <div
            role="status"
            aria-live="polite"
            className="flex flex-col items-center gap-3 py-16 text-it-ink-500 dark:text-rink-300"
          >
            <Icon
              name="progress_activity"
              className="text-2xl animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span className="text-w-small">{MESSAGES.common.loading}</span>
          </div>
        ) : loadError ? (
          <div className="px-4 py-16 text-center">
            <p className="text-w-small font-medium text-it-red-500">
              {loadError}
            </p>
          </div>
        ) : (
          <>
            {/* === Section 1: Avatar === */}
            <section className="flex flex-col items-center bg-it-surface dark:bg-rink-800 pt-7 px-6 pb-[22px]">
              <AvatarUploader
                currentUrl={formData.avatarUrl}
                size={92}
                label="프로필 사진 변경"
                onUploaded={handleAvatarUploaded}
                refType="user_avatar"
                refId={user?.id}
              />
            </section>

            {/* 8px 회색 구분선 */}
            <div aria-hidden="true" className="h-2 bg-it-canvas dark:bg-puck" />

            {/* === Section 2: Identity (성·이름 1fr 1.6fr 그리드) === */}
            <section className="bg-it-surface dark:bg-rink-800 pt-5 px-6 pb-[22px]">
              <h2 className="text-[11px] font-extrabold text-it-ink-400 dark:text-rink-300 tracking-[0.12em] mb-3.5">
                본인 정보
              </h2>

              <div className="grid grid-cols-[1fr_1.6fr] gap-3">
                {/* LastName (readonly) */}
                <div>
                  <label
                    htmlFor={lastNameId}
                    className="block text-[13px] font-extrabold text-it-ink-800 dark:text-rink-200 tracking-[-0.01em] mb-2"
                  >
                    성<span className="text-it-red-500 ml-[3px]">*</span>
                  </label>
                  <input
                    id={lastNameId}
                    type="text"
                    value={formData.lastName}
                    readOnly
                    aria-readonly="true"
                    autoComplete="family-name"
                    className={`w-full h-[50px] px-4 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-900 text-[14px] tracking-[-0.01em] cursor-not-allowed focus:outline-none ${
                      formData.lastName
                        ? "text-it-ink-800 dark:text-white font-bold"
                        : "text-it-ink-400 dark:text-rink-400 font-medium"
                    }`}
                  />
                </div>

                {/* FirstName (readonly) */}
                <div>
                  <label
                    htmlFor={firstNameId}
                    className="block text-[13px] font-extrabold text-it-ink-800 dark:text-rink-200 tracking-[-0.01em] mb-2"
                  >
                    이름<span className="text-it-red-500 ml-[3px]">*</span>
                  </label>
                  <input
                    id={firstNameId}
                    type="text"
                    value={formData.firstName}
                    readOnly
                    aria-readonly="true"
                    autoComplete="given-name"
                    className={`w-full h-[50px] px-4 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-900 text-[14px] tracking-[-0.01em] cursor-not-allowed focus:outline-none ${
                      formData.firstName
                        ? "text-it-ink-800 dark:text-white font-bold"
                        : "text-it-ink-400 dark:text-rink-400 font-medium"
                    }`}
                  />
                </div>
              </div>

              {/* Phone (readonly) — 숫자: tabular-nums */}
              <div className="mt-[18px]">
                <label
                  htmlFor={phoneId}
                  className="block text-[13px] font-extrabold text-it-ink-800 dark:text-rink-200 tracking-[-0.01em] mb-2"
                >
                  연락처<span className="text-it-red-500 ml-[3px]">*</span>
                </label>
                <input
                  id={phoneId}
                  type="tel"
                  value={formData.phone}
                  readOnly
                  aria-readonly="true"
                  autoComplete="tel"
                  inputMode="tel"
                  className={`w-full h-[50px] px-4 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-900 text-[14px] tracking-[-0.01em] cursor-not-allowed focus:outline-none tabular-nums ${
                    formData.phone
                      ? "text-it-ink-800 dark:text-white font-bold"
                      : "text-it-ink-400 dark:text-rink-400 font-medium"
                  }`}
                />
                <p className="mt-2 text-[11.5px] font-medium text-it-ink-500 dark:text-rink-400 tracking-[-0.01em]">
                  휴대폰 번호 변경시 본인인증이 필요합니다.
                </p>
              </div>

            </section>

            {/* 8px 회색 구분선 */}
            <div aria-hidden="true" className="h-2 bg-it-canvas dark:bg-puck" />

            {/* === Section 3: Address === */}
            {/* [수정 2026-05-13 D24] '우편번호 검색' 버튼 라벨 6글자 + 아이콘이
               좁은 폭(≤359px / [data-screen-bp="xs"]) 디바이스에서 잘림 보고.
               라벨을 '검색' 2글자로 단축하고 aria-label 로 의미는 유지.
               input min-w-0 로 좁은 화면에서 input 도 적절히 축소 가능하게 보정. */}
            <section className="bg-it-surface dark:bg-rink-800 pt-5 px-6 pb-6">
              <h2 className="text-[11px] font-extrabold text-it-ink-400 dark:text-rink-300 tracking-[0.12em] mb-3.5">
                주소
              </h2>

              {/* 우편번호 + 주소찾기 */}
              <div>
                <label
                  htmlFor={zipCodeId}
                  className="block text-[13px] font-extrabold text-it-ink-800 dark:text-rink-200 tracking-[-0.01em] mb-2"
                >
                  우편번호
                </label>
                <div className="flex gap-2">
                  <input
                    id={zipCodeId}
                    type="text"
                    value={formData.zipCode}
                    readOnly
                    aria-label="우편번호 (검색 후 자동 입력)"
                    placeholder="우편번호"
                    className={`flex-1 min-w-0 h-[50px] px-4 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-900 text-[14px] tracking-[-0.01em] cursor-default focus:outline-none tabular-nums ${
                      formData.zipCode
                        ? "text-it-ink-800 dark:text-white font-bold"
                        : "text-it-ink-400 dark:text-rink-400 font-medium"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={handlePostcodeSearch}
                    disabled={isSaving}
                    aria-label="우편번호 검색"
                    className="shrink-0 h-[50px] px-4 rounded-w-md bg-it-blue-500 hover:bg-it-blue-600 active:bg-it-blue-700 text-white text-[13px] font-extrabold tracking-[-0.01em] disabled:opacity-50 disabled:cursor-not-allowed transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Icon
                      name="search"
                      className="text-base"
                      aria-hidden="true"
                    />
                    검색
                  </button>
                </div>
              </div>

              {/* 주소 (readonly, 자동 입력) */}
              <div className="mt-[18px]">
                <label
                  htmlFor={addressId}
                  className="block text-[13px] font-extrabold text-it-ink-800 dark:text-rink-200 tracking-[-0.01em] mb-2"
                >
                  주소
                </label>
                <input
                  id={addressId}
                  type="text"
                  value={formData.address}
                  readOnly
                  aria-readonly="true"
                  placeholder={MESSAGES.placeholders.searchAddress}
                  className={`w-full h-[50px] px-4 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-900 text-[14px] tracking-[-0.01em] cursor-default focus:outline-none ${
                    formData.address
                      ? "text-it-ink-800 dark:text-white font-bold"
                      : "text-it-ink-400 dark:text-rink-400 font-medium"
                  }`}
                />
              </div>

              {/* 상세주소 (직접 입력) — focus glow를 ring으로 대체 */}
              <div className="mt-[18px]">
                <label
                  htmlFor={addressDetailId}
                  className="block text-[13px] font-extrabold text-it-ink-800 dark:text-rink-200 tracking-[-0.01em] mb-2"
                >
                  상세주소
                </label>
                <input
                  id={addressDetailId}
                  type="text"
                  value={formData.addressDetail}
                  onChange={(e) => handleAddressDetailChange(e.target.value)}
                  placeholder={MESSAGES.placeholders.enterDetailAddress}
                  maxLength={200}
                  className={`w-full h-[50px] px-4 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-900 text-[14px] tracking-[-0.01em] focus:outline-none focus-visible:border-it-blue-500 focus-visible:ring-2 focus-visible:ring-it-blue-500/30 focus:border-it-blue-500 transition-[border-color,box-shadow] motion-reduce:transition-none ${
                    formData.addressDetail
                      ? "text-it-ink-800 dark:text-white font-bold"
                      : "text-it-ink-400 dark:text-rink-400 font-medium"
                  }`}
                />
              </div>
            </section>

            {/* === Section 4: 액션 버튼 (배경 없음, 회색 캔버스 위에 부유) — 1fr 2fr 취소·저장하기 === */}
            <section className="px-6 pt-5 pb-6">
              <div className="grid grid-cols-[1fr_2fr] gap-2.5">
                <button
                  type="button"
                  onClick={() => back()}
                  disabled={isSaving}
                  className="h-[54px] rounded-w-md bg-it-surface dark:bg-rink-800 border-[1.5px] border-it-line-strong dark:border-rink-700 text-it-ink-800 dark:text-rink-200 text-[15px] font-bold tracking-[-0.02em] hover:bg-it-fill dark:hover:bg-rink-700 active:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-line-strong"
                >
                  {MESSAGES.common.cancel}
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!isDirty || isSaving}
                  aria-busy={isSaving}
                  className="h-[54px] rounded-w-md bg-it-blue-500 hover:bg-it-blue-600 active:bg-it-blue-700 text-white text-[16px] font-extrabold tracking-[-0.02em] disabled:opacity-50 disabled:cursor-not-allowed transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 inline-flex items-center justify-center gap-1.5"
                >
                  <Icon name="save" className="text-base" aria-hidden="true" />
                  {isSaving ? MESSAGES.common.saving : MESSAGES.common.save}
                </button>
              </div>
            </section>
          </>
        )}
      </main>

      {/* 카카오 우편번호 서비스 스크립트 */}
      <Script
        src="https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"
        strategy="afterInteractive"
      />

      {/* 우편번호 검색 모달 */}
      <FullModal
        isOpen={postcodeOpen}
        onClose={() => setPostcodeOpen(false)}
        title="주소 검색"
        variant="slide-up"
        className="flex flex-col"
        contentClassName="flex-1"
      >
        <div
          ref={postcodeContainerRef}
          className="w-full h-full min-h-[400px]"
        />
      </FullModal>
    </MobileContainer>
  );
}
