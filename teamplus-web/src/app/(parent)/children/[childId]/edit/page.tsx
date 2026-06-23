'use client';

import { useState, useMemo, useEffect, useRef, useId } from 'react';
import {
  uploadFile,
  UploadValidationError,
  UploadNetworkError,
} from '@/services/upload.service';
import { useParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { DatePickerModal, formatDateLabel } from '@/components/ui/DatePickerModal';
import { useNavigation } from '@/components/ui/NavLink';
import { useToast } from '@/components/ui/Toast';
import { usePageReady } from '@/hooks/usePageReady';
import { useChildren, ChildApiItem } from '@/hooks/useChildren';
import { TeamPickerSheet, type TeamPickerSelection } from '@/components/team/TeamPickerSheet';
import { api } from '@/services/api-client';
import { getServerToday } from '@/services/server-time';
import { MESSAGES } from '@/lib/messages';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useModal } from '@/components/ui/Modal';
import { calculateKoreanAge, cn } from '@/lib/utils';
import { resolveImageSrc } from '@/lib/image-url';
import { emitRefresh, REFRESH_KEYS } from '@/lib/refresh-bus';
import dynamic from 'next/dynamic';
const GlobalMenu = dynamic(() => import('@/components/layout/GlobalMenu').then(mod => ({ default: mod.GlobalMenu })), { ssr: false });

// ========== 상수 ==========

const GENDER_OPTIONS = [
  { value: 'M', label: '남' },
  { value: 'F', label: '여' },
];

const MIN_AGE = 3;
const MAX_AGE = 18;
const CHILD_TEEN_BOUNDARY = 10;

// 나이 계산은 @/lib/utils 의 calculateKoreanAge 로 통합 (중복 제거)

// ========== 폼 상태 ==========

interface FormData {
  lastName: string;
  firstName: string;
  birthDate: string;
  gender: string;
  note: string;
  /** 업로드한 자녀 사진 URL (/uploads/avatar/...) — 빈 문자열이면 미설정/제거 */
  imageUrl: string;
}

interface FormErrors {
  lastName?: string;
  firstName?: string;
  birthDate?: string;
}

// ========== 연령 배지 ==========

function AgeBadge({ age }: { age: number }) {
  const isChild = age < CHILD_TEEN_BOUNDARY;
  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="text-card-body text-wtext-2 dark:text-rink-300">
        {age}세
      </span>
      <span
        className={`text-card-meta font-bold px-2 py-0.5 rounded-w-pill ${
          isChild
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
            : 'bg-blue-100 text-ice-500 dark:bg-blue-900/30 dark:text-blue-400'
        }`}
      >
        {isChild ? 'CHILD' : 'TEEN'}
      </span>
    </div>
  );
}

// ========== 메인 컴포넌트 ==========

export default function EditChildPage() {
  const params = useParams();
  const childId = params?.childId as string;
  // [appbar-harness-v3 / 2026-05-13] 이중 헤더 방지 — Web `<PageAppBar />` 단독 렌더.
  // useDetailUI 는 showAppBar:true 를 호출하므로 Flutter Native AppBar 가 Web 헤더를 덮어
  // 뒤로가기 버튼이 페이지 컨텍스트를 잃는 회귀 발생 → useNativeUI({showAppBar:false}) 명시.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
  });

  const { back, navigate } = useNavigation();
  const { toast } = useToast();
  const { modal } = useModal();
  // [2026-06-17] 선수정보수정 페이지 하단에 '선수삭제' 버튼 재도입 (사용자 직접 지시).
  const { getChild, updateChild, deleteChild } = useChildren();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    lastName: '',
    firstName: '',
    birthDate: '',
    gender: '',
    note: '',
    imageUrl: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // 거절된 자녀의 TeamMember PK — 존재 시 저장 동작이 update + 재신청으로 확장된다.
  const [rejectedMemberId, setRejectedMemberId] = useState<string | null>(null);
  // 팀 변경 (Phase 3) — 현재 소속 팀(approved 우선 → pending)과 선택 상태.
  //   initialTeamId 와 selectedTeam 이 다를 때만 저장 시 teamId 를 전송한다.
  const [selectedTeam, setSelectedTeam] = useState<{ id: string; name: string } | null>(null);
  const [initialTeamId, setInitialTeamId] = useState<string | null>(null);
  const [teamPending, setTeamPending] = useState(false);
  const [isTeamPickerOpen, setIsTeamPickerOpen] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 2026-05-16: 생년월일 DatePickerModal 통합 (add 페이지 패턴과 일치)
  //   기존 native <input type="date"> 제거 → 가운데 모달 팝업으로 통일.
  //   서버 시각 SoT 사용 (브라우저/OS 시계 조작 영향 차단).
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const birthDateId = useId();

  // 서버 시각 prefetch — DatePickerModal 이 열릴 때 클라이언트 fallback 없이 즉시 서버 기준 표시.
  useEffect(() => {
    void getServerToday();
  }, []);

  // 자녀 사진 업로드 — POST /api/v1/files/upload (AVATAR, 최대 5MB)
  // [수정 2026-05-23 Phase C] 업로드 직후 즉시 PATCH /children/:id 로 imageUrl 반영.
  //   사용자가 "저장하기" 버튼을 누르지 않고 페이지를 이탈해도 이미지가 손실되지 않도록
  //   team/[id]/edit 의 AvatarUploader.onUploaded 패턴을 그대로 적용.
  //   refresh-bus 로 children 리스트/대시보드 캐러셀도 즉시 갱신.
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    setIsUploadingImage(true);
    try {
      const result = await uploadFile(file, { category: 'AVATAR' });
      updateField('imageUrl', result.url);
      // 즉시 PATCH — 폼 저장 전 손실 차단
      try {
        await api.put(`/children/${childId}`, { imageUrl: result.url });
        emitRefresh(REFRESH_KEYS.CHILDREN);
      } catch {
        /* 즉시 반영 실패는 폼 저장 시 재시도되므로 swallow */
      }
    } catch (err) {
      if (err instanceof UploadValidationError || err instanceof UploadNetworkError) {
        toast.error(err.message);
      } else {
        toast.error(MESSAGES.error.network);
      }
    } finally {
      setIsUploadingImage(false);
    }
  };

  // [수정 2026-05-23 Phase C] 사진 제거 시에도 즉시 PATCH — 폼 저장 전 손실/잔존 방지.
  const handleImageRemove = async () => {
    updateField('imageUrl', '');
    try {
      await api.put(`/children/${childId}`, { imageUrl: null });
      emitRefresh(REFRESH_KEYS.CHILDREN);
    } catch {
      /* 즉시 반영 실패는 폼 저장 시 재시도되므로 swallow */
    }
  };

  const age = useMemo(() => calculateKoreanAge(formData.birthDate), [formData.birthDate]);

  // 팀 선택이 최초 소속과 달라졌는지 — 안내 문구·저장 시 teamId 전송 판정 공용.
  const teamChangedView = (selectedTeam?.id ?? null) !== initialTeamId;

  // 기존 데이터 로딩
  useEffect(() => {
    async function loadChild() {
      setIsLoading(true);
      setLoadError(null);

      const result = await getChild(childId);

      if (result.success) {
        const child = result.data as ChildApiItem;
        setFormData({
          lastName: child.lastName ?? '',
          firstName: child.firstName ?? '',
          birthDate: child.birthDate ? child.birthDate.split('T')[0] : '',
          gender: child.gender ?? '',
          note: child.note ?? '',
          imageUrl: child.imageUrl ?? '',
        });
        // approved/pending 이 없고 rejected 만 있는 자녀에 한해 재신청 대상으로 식별
        const memberships = child.clubMemberships ?? [];
        const hasApproved = memberships.some((m) => m.approvalStatus === 'approved');
        const hasPending = memberships.some((m) => m.approvalStatus === 'pending');
        const rejected =
          !hasApproved && !hasPending
            ? memberships.find((m) => m.approvalStatus === 'rejected')
            : undefined;
        setRejectedMemberId(rejected?.id ?? null);

        // 현재 소속 팀 — approved 우선, 없으면 pending. (rejected 는 '현재 소속' 아님)
        const currentMembership =
          memberships.find((m) => m.approvalStatus === 'approved') ??
          memberships.find((m) => m.approvalStatus === 'pending');
        if (currentMembership) {
          setSelectedTeam({
            id: currentMembership.teamId,
            name: currentMembership.clubName ?? '소속 팀',
          });
          setInitialTeamId(currentMembership.teamId);
          setTeamPending(currentMembership.approvalStatus === 'pending');
        } else if (rejected) {
          // [2026-06-17] 반려된 자녀 — 직전 신청 팀을 미리 선택해 '다시 신청하기' 클릭만으로
          //   동일 팀에 재신청되도록 한다. initialTeamId 는 null 로 유지 → handleSubmit 의
          //   teamChanged=true → updateChild 가 teamId 를 전송 → 백엔드 upsert(rejected→pending).
          //   (미선택 시 teamId 미전송으로 재신청이 무효화되던 회귀 수정)
          setSelectedTeam({
            id: rejected.teamId,
            name: rejected.clubName ?? '소속 팀',
          });
          setInitialTeamId(null);
          setTeamPending(false);
        } else {
          setSelectedTeam(null);
          setInitialTeamId(null);
          setTeamPending(false);
        }
      } else {
        setLoadError(result.error ?? '자녀 정보를 불러올 수 없습니다.');
      }
      setIsLoading(false);
    }

    if (childId) {
      loadChild();
    }
  }, [childId, getChild]);

  // 필드 업데이트
  const updateField = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  // 유효성 검사
  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.lastName.trim()) {
      newErrors.lastName = '성을 입력해주세요.';
    } else if (formData.lastName.trim().length > 10) {
      newErrors.lastName = '성은 최대 10자까지 입력 가능합니다.';
    }

    if (!formData.firstName.trim()) {
      newErrors.firstName = '이름을 입력해주세요.';
    } else if (formData.firstName.trim().length > 20) {
      newErrors.firstName = '이름은 최대 20자까지 입력 가능합니다.';
    }

    if (!formData.birthDate) {
      newErrors.birthDate = '생년월일을 선택해주세요.';
    } else if (age !== null) {
      if (age < MIN_AGE || age > MAX_AGE) {
        newErrors.birthDate = `${MIN_AGE}세~${MAX_AGE}세 범위만 등록 가능합니다.`;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 제출
  // - 일반: updateChild 만 호출.
  // - 거절된 자녀 재신청: 별도 reapply API 를 호출하지 않는다. 팀을 선택하면 updateChild 의
  //   teamId(upsert)가 같은 팀이면 기존 거절 레코드를 pending 으로 update, 다른 팀이면 새 레코드를
  //   insert 한다(다팀 거절도 선택 팀 기준 단일 처리). 과거의 reapply 추가 호출은 upsert 와 동일
  //   레코드를 중복 전환해 409 를 유발하던 레거시라 제거함. (감독/코치 알림은 백엔드 가입 경로에서 발송)
  const handleSubmit = async () => {
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      // 팀 변경 감지 — 현재 선택(selectedTeam)이 최초 소속(initialTeamId)과 다를 때만 전송.
      //   다른 팀 선택 → 해당 id (교체) · 소속 제거 → null (무소속) · 변경 없음 → 미전송.
      const nextTeamId = selectedTeam?.id ?? null;
      const teamChanged = nextTeamId !== initialTeamId;
      // 거절 자녀 재신청: 팀이 선택돼 있으면 변경 감지(teamChanged) 여부와 무관하게 항상
      //   teamId 를 전송해 동일 팀 재신청도 서버(upsert)에 반드시 도달하도록 한다.
      const isReapply = rejectedMemberId !== null && nextTeamId !== null;
      const shouldSendTeam = teamChanged || isReapply;

      const result = await updateChild(childId, {
        lastName: formData.lastName.trim(),
        firstName: formData.firstName.trim(),
        birthDate: formData.birthDate,
        gender: formData.gender || undefined,
        note: formData.note || undefined,
        imageUrl: formData.imageUrl,
        ...(shouldSendTeam && { teamId: nextTeamId }),
      });

      if (!result.success) {
        toast.error(result.error ?? MESSAGES.error.general);
        return;
      }

      // 거절 자녀가 실제로 팀을 선택해 재신청한 경우에만 '재신청' 문구 노출.
      const reapplied = isReapply;
      toast.success(
        reapplied ? MESSAGES.team.reapplySuccess : MESSAGES.save.success,
      );
      navigate('/children');
    } catch {
      toast.error(MESSAGES.error.general);
    } finally {
      setIsSubmitting(false);
    }
  };

  // [2026-06-17] 선수 삭제 — 하단 '선수삭제' 버튼. 위험 동작이므로 danger confirm 후 삭제.
  const handleDelete = async () => {
    if (isSubmitting || isDeleting) return;
    const childName = `${formData.lastName}${formData.firstName}`.trim() || '선수';
    const confirmed = await modal.confirm({
      title: '선수 삭제',
      message: `${childName} 정보를 삭제하시겠습니까? 삭제 후에는 되돌릴 수 없습니다.`,
      confirmText: '삭제하기',
      cancelText: '취소',
      variant: 'danger',
    });
    if (!confirmed) return;
    setIsDeleting(true);
    try {
      const result = await deleteChild(childId);
      if (result.success) {
        toast.success(MESSAGES.child.deleteSuccess);
        navigate('/children');
      } else {
        toast.error(result.error ?? MESSAGES.child.deleteError);
        setIsDeleting(false);
      }
    } catch {
      toast.error(MESSAGES.error.general);
      setIsDeleting(false);
    }
  };

  if (isLoading) return null;

  if (loadError) {
    return (
      <MobileContainer hasBottomNav>
        {/* [appbar-harness-v4 · parent-agent · 2026-05-12] showMenu={false} 제거 —
            에러 상태에서도 우측 3 액션(시계/종/메뉴) 유지하여 SPEC §7 통일성 준수. */}
        <PageAppBar title="선수 정보 수정" forceNative />
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <Icon name="error_outline" className="text-5xl text-wtext-4 dark:text-rink-500 mb-3" aria-hidden="true" />
          <p className="text-card-body text-wtext-3 dark:text-rink-300 font-medium text-center mb-4">
            {loadError}
          </p>
          <Button variant="outline" onClick={() => back()}>
            돌아가기
          </Button>
        </div>
      </MobileContainer>
    );
  }

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="선수 정보 수정" forceNative />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto hide-scrollbar">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="p-4 pb-6 space-y-6"
        >
          {/* 기본 정보 섹션 */}
          <section className="bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 shadow-sm p-4">
            <h3 className="text-card-body font-bold text-wtext-1 dark:text-white mb-4 flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-w-pill bg-ice-500/10 text-ice-500">
                <Icon name="person" className="text-[16px]" aria-hidden="true" />
              </span>
              기본 정보
            </h3>

            <div className="space-y-4">
              {/* 자녀 사진 — 클릭 시 file picker, 업로드 후 미리보기 */}
              <div className="flex justify-center">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSubmitting || isUploadingImage}
                    aria-label={
                      formData.imageUrl ? '자녀 사진 변경' : '자녀 사진 추가'
                    }
                    className={cn(
                      'w-20 h-20 rounded-full grid place-items-center overflow-hidden transition-opacity',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40',
                      formData.imageUrl
                        ? 'bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700'
                        : 'bg-ice-50 dark:bg-ice-500/15 border-2 border-dashed border-ice-200 dark:border-ice-500/40',
                      (isSubmitting || isUploadingImage) && 'opacity-60 cursor-not-allowed',
                    )}
                  >
                    {resolveImageSrc(formData.imageUrl) ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={resolveImageSrc(formData.imageUrl)}
                        alt="자녀 사진 미리보기"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Icon
                        name="person"
                        className="text-[36px] text-ice-400 dark:text-ice-500"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                  {isUploadingImage ? (
                    <div
                      className="absolute -right-0.5 -bottom-0.5 w-[26px] h-[26px] rounded-full bg-ice-500 text-white grid place-items-center border-[3px] border-white dark:border-rink-800"
                      aria-label="업로드 중"
                      role="status"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="animate-spin">
                        <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="6 4" strokeLinecap="round" />
                      </svg>
                    </div>
                  ) : (
                    <div
                      className="absolute -right-0.5 -bottom-0.5 w-[26px] h-[26px] rounded-full bg-ice-500 text-white grid place-items-center text-base font-bold border-[3px] border-white dark:border-rink-800 pointer-events-none"
                      aria-hidden="true"
                    >
                      +
                    </div>
                  )}
                  {formData.imageUrl && !isUploadingImage && (
                    <button
                      type="button"
                      onClick={handleImageRemove}
                      disabled={isSubmitting}
                      aria-label="자녀 사진 제거"
                      className="absolute -left-1 -top-1 w-6 h-6 rounded-full bg-wtext-2 dark:bg-rink-700 text-white grid place-items-center border-[2px] border-white dark:border-rink-800 hover:bg-wtext-1 dark:hover:bg-rink-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                        <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImageSelect}
                    className="hidden"
                    aria-hidden="true"
                    tabIndex={-1}
                  />
                </div>
              </div>

              {/* 성 + 이름 (2열) */}
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="성"
                  placeholder="홍"
                  value={formData.lastName}
                  onChange={(e) => updateField('lastName', e.target.value)}
                  error={errors.lastName}
                  maxLength={10}
                  required
                  disabled={isSubmitting}
                />
                <Input
                  label="이름"
                  placeholder="길동"
                  value={formData.firstName}
                  onChange={(e) => updateField('firstName', e.target.value)}
                  error={errors.firstName}
                  maxLength={20}
                  required
                  disabled={isSubmitting}
                />
              </div>

              {/* 생년월일 — [2026-05-16] native input[type=date] 제거 → DatePickerModal 통일.
                  add 페이지(/children/add)와 동일 패턴 — 클릭 시 가운데 모달 팝업으로 연/월/일 선택. */}
              <div className="w-full min-w-0">
                <label
                  htmlFor={birthDateId}
                  className="block text-card-body font-semibold text-wtext-2 dark:text-rink-100 mb-2"
                >
                  생년월일
                  <span className="text-red-600 ml-1" aria-hidden="true">*</span>
                </label>
                <button
                  id={birthDateId}
                  type="button"
                  onClick={() => setIsDatePickerOpen(true)}
                  disabled={isSubmitting}
                  aria-required="true"
                  aria-invalid={!!errors.birthDate}
                  aria-label="생년월일 선택"
                  aria-haspopup="dialog"
                  aria-expanded={isDatePickerOpen}
                  className={cn(
                    'w-full h-12 min-h-[48px] px-4 rounded-lg bg-white dark:bg-rink-800 border flex items-center gap-2.5 text-left transition-colors motion-reduce:transition-none',
                    errors.birthDate
                      ? 'border-red-600'
                      : 'border-wline dark:border-rink-700 hover:border-ice-500/40',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/30',
                    isSubmitting && 'opacity-60 cursor-not-allowed',
                  )}
                >
                  <span
                    className={cn(
                      'flex-1 text-card-title tracking-[-0.01em] truncate',
                      formData.birthDate
                        ? 'text-wtext-1 dark:text-white font-semibold'
                        : 'text-wtext-4 dark:text-wtext-4/80 font-medium',
                    )}
                  >
                    {formData.birthDate ? formatDateLabel(formData.birthDate) : '연도. 월. 일.'}
                  </span>
                  {/* 캘린더 trail icon — add 페이지와 동일 svg */}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                    className="text-wtext-3 dark:text-wtext-4 shrink-0"
                  >
                    <rect x="2" y="3" width="12" height="11" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M2 6h12M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </button>
                {errors.birthDate && (
                  <p className="mt-2 text-card-body text-red-600 flex items-center gap-1" role="alert">
                    <Icon name="error" className="text-[16px]" aria-hidden="true" />
                    {errors.birthDate}
                  </p>
                )}
                {age !== null && !errors.birthDate && <AgeBadge age={age} />}
              </div>

            </div>
          </section>

          {/* 추가 정보 섹션 */}
          <section className="bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 shadow-sm p-4">
            <h3 className="text-card-body font-bold text-wtext-1 dark:text-white mb-4 flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-w-pill bg-ice-500/10 text-ice-500">
                <Icon name="info" className="text-[16px]" aria-hidden="true" />
              </span>
              추가 정보
            </h3>

            <div className="space-y-4">
              {/* 성별 */}
              <div>
                <label className="block text-card-body font-semibold text-wtext-2 dark:text-rink-100 mb-2">
                  성별
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {GENDER_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => updateField('gender', formData.gender === opt.value ? '' : opt.value)}
                      disabled={isSubmitting}
                      className={`py-3 rounded-xl border-2 text-card-body font-semibold transition-all motion-reduce:transition-none duration-200 ${
                        formData.gender === opt.value
                          ? 'bg-blue-50 border-blue-500 text-ice-500 dark:bg-blue-900/20 dark:border-blue-400 dark:text-blue-300'
                          : 'bg-white dark:bg-rink-800 border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 hover:border-wline dark:hover:border-rink-700'
                      } disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* [제거 2026-06-17] 특이사항/메모 필드 삭제 (사용자 직접 지시) */}
            </div>
          </section>

          {/* 팀 정보 섹션 (Phase 3) — 소속 팀 변경 */}
          <section className="bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 shadow-sm p-4">
            <h3 className="text-card-body font-bold text-wtext-1 dark:text-white mb-1 flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-w-pill bg-ice-500/10 text-ice-500">
                <Icon name="groups" className="text-[16px]" aria-hidden="true" />
              </span>
              팀 정보
            </h3>
            <p className="text-card-meta text-wtext-3 dark:text-rink-300 mb-3 ml-9">
              {MESSAGES.team.childEditTeamSelectHelper}
            </p>

            <button
              type="button"
              onClick={() => !isSubmitting && setIsTeamPickerOpen(true)}
              disabled={isSubmitting}
              className="w-full flex items-center justify-between gap-2 px-3.5 py-3 rounded-xl bg-wbg dark:bg-rink-900 border border-wline-2 dark:border-rink-700 text-left transition-colors motion-reduce:transition-none hover:border-ice-300 dark:hover:border-ice-500/40 disabled:opacity-60"
            >
              <span className="min-w-0">
                <span className="block text-card-meta font-bold text-wtext-3 dark:text-wtext-4">
                  {MESSAGES.team.childEditTeamCurrentLabel}
                </span>
                <span
                  className={cn(
                    'mt-1 block truncate',
                    selectedTeam
                      ? 'text-card-title font-extrabold text-wtext-1 dark:text-white tracking-[-0.02em]'
                      : 'text-card-body font-semibold text-wtext-3 dark:text-wtext-4',
                  )}
                >
                  {selectedTeam ? selectedTeam.name : MESSAGES.team.childrenAddTeamNoneOption}
                </span>
              </span>
              <span className="shrink-0 inline-flex items-center gap-1 text-card-meta font-bold text-ice-600 dark:text-ice-500">
                {selectedTeam
                  ? MESSAGES.team.childrenAddTeamChangeAction
                  : MESSAGES.team.childrenAddTeamPickAction}
                <Icon name="chevron_right" className="text-[16px]" aria-hidden="true" />
              </span>
            </button>

            {selectedTeam ? (
              <button
                type="button"
                onClick={() => setSelectedTeam(null)}
                disabled={isSubmitting}
                className="mt-2 inline-flex items-center gap-1 text-card-meta font-semibold text-wtext-3 dark:text-wtext-4 underline disabled:opacity-60"
              >
                <Icon name="close" className="text-[14px]" aria-hidden="true" />
                {MESSAGES.team.childrenAddTeamClear}
              </button>
            ) : (
              <p className="mt-2 text-card-meta text-wtext-3 dark:text-wtext-4">
                {MESSAGES.team.childrenAddTeamNoneHint}
              </p>
            )}

            {/* 상태 안내 — 변경 감지 우선, 미변경 시 현재 승인 대기 안내 */}
            {teamChangedView ? (
              <p className="mt-2 text-card-meta font-semibold text-ice-600 dark:text-ice-500">
                {selectedTeam
                  ? MESSAGES.team.childEditTeamChangeNotice
                  : MESSAGES.team.childEditTeamRemoveNotice}
              </p>
            ) : (
              teamPending && (
                <p className="mt-2 text-card-meta font-semibold text-amber-600 dark:text-amber-400">
                  {MESSAGES.team.childEditTeamPendingHint}
                </p>
              )
            )}
          </section>

          {/* [제거 2026-05-12] 위험 영역(자녀 삭제) — 어드민 전용으로 이관 */}
        </form>
      </div>

      {/* [2026-06-17] 하단 버튼 바 — fixed → flex 푸터 전환.
          기존 `position: fixed` 가 일부 WebView 에서 스크롤을 따라 올라오는 회귀가 있어,
          MobileContainer(flex flex-col) 의 정상 흐름 푸터(shrink-0)로 변경해 스크롤 영역(flex-1)
          아래에 확실히 고정. safe-area 는 paddingBottom 으로 직접 보정. */}
      <div
        className="shrink-0 grid grid-cols-5 gap-2 px-4 pt-3 w-full min-w-0 border-t border-wline-2 dark:border-rink-700 bg-wbg dark:bg-puck"
        style={{
          paddingBottom:
            'calc(12px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))',
        }}
      >
        {/* [2026-06-17] 선수삭제 — 위험 동작(빨강 outline), 2:3 비율로 수정하기 옆 배치. */}
        <Button
          size="lg"
          variant="outline"
          onClick={handleDelete}
          disabled={isSubmitting || isDeleting}
          className="col-span-2 border-red-500 text-red-600 hover:border-red-500 hover:bg-red-50 dark:border-red-500 dark:text-red-400 dark:hover:bg-red-950/30"
        >
          {isDeleting ? (
            <span className="flex items-center justify-center gap-2">
              <Icon name="progress_activity" className="animate-spin text-card-title motion-reduce:animate-none" aria-hidden="true" />
              삭제 중...
            </span>
          ) : (
            '선수삭제'
          )}
        </Button>
        <Button
          size="lg"
          fullWidth
          onClick={handleSubmit}
          disabled={isSubmitting || isDeleting}
          className="col-span-3"
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <Icon name="progress_activity" className="animate-spin text-card-title motion-reduce:animate-none" aria-hidden="true" />
              {rejectedMemberId ? MESSAGES.team.reapplySubmitting : '수정 중...'}
            </span>
          ) : rejectedMemberId ? (
            MESSAGES.team.reapplyButton
          ) : (
            '수정하기'
          )}
        </Button>
      </div>
      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
      <DatePickerModal
        isOpen={isDatePickerOpen}
        value={formData.birthDate}
        maxDate={new Date()}
        ariaLabel="생년월일 선택"
        onClose={() => setIsDatePickerOpen(false)}
        onSelect={(iso) => updateField('birthDate', iso)}
      />
      <TeamPickerSheet
        isOpen={isTeamPickerOpen}
        onClose={() => setIsTeamPickerOpen(false)}
        onSelect={(selection: TeamPickerSelection) => {
          setSelectedTeam({ id: selection.id, name: selection.name });
          setIsTeamPickerOpen(false);
        }}
      />
    </MobileContainer>
  );
}
