"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useRef, useId } from "react";
import { NavLink, useNavigation } from "@/components/ui/NavLink";
import { Icon } from "@/components/ui/Icon";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { FullModal } from "@/components/ui/Modal/FullModal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { MESSAGES } from "@/lib/messages";
import { useGuestOnly } from "@/contexts/AuthContext";
import { usePageReady } from '@/hooks/usePageReady';
import { useSessionAuth } from "@/hooks/useSessionAuth";
import authService from "@/services/auth";
import IdentityVerifyInput, {
  type IdentityVerifyResult,
} from "@/components/identity/IdentityVerifyInput";
import {
  TeamPickerSheet,
  type TeamPickerSelection,
} from "@/components/team/TeamPickerSheet";
// [수정 2026-05-21] 팀 코드 텍스트 입력 + checkTeamCode 검증 → TeamPickerSheet 선택 방식으로 전환.
//  기존 GET /teams/check-code 호출은 제거하고, 모달이 백엔드 검증된 목록만 노출하므로
//  선택 즉시 teamCodeStatus='valid' 로 간주한다. 가입 페이로드의 teamCode 는 그대로 유지.
// [제거 2026-05-12] sendOtp/verifyOtp — 가입 인증을 이메일 OTP 로 전환.
import type { UserType } from "@/types/api";
import { useNativeUI } from "@/hooks/useNativeUI";
import { useKeyboardAvoidance } from "@/hooks/useKeyboardAvoidance";
import { TERMS_CONTENT } from "@/lib/terms-content";

// 약관 동의 row 의 chevron(>) 클릭 시 노출할 약관 키 — terms-content.ts 의 키와 매핑.
type TermsModalKey = "service" | "privacy" | "marketing";

// 아이디 규칙 — 백엔드 signup DTO @Matches 와 동일. 영문 소문자 시작, 영소문자·숫자·`_`, 8~20자.
// [2026-06-04] 아이디 길이 정책 4~20 → 8~20자 (첫글자 + 7~19).
const ID_REGEX = /^[a-z][a-z0-9_]{7,19}$/;
const ID_RULE_MESSAGE =
  "아이디는 영문 소문자로 시작하고, 영문 소문자·숫자·언더스코어(_)를 사용해 8~20자로 입력해주세요.";

// ========== 역할 타입 ==========
interface RoleOption {
  id: UserType;
  label: string;
  icon: string;
  desc: string;
}

// [수정 2026-06-02] 가입 유형: 감독 → 학부모. (코치 직접 가입 비활성화 — 감독이 팀에서 초대)
const roleOptions: RoleOption[] = [
  { id: "director", label: "감독", icon: "manage_accounts", desc: "팀 관리" },
  {
    id: "parent",
    label: "학부모",
    icon: "family_restroom",
    desc: "자녀 수업 관리",
  },
  // [제거 2026-06-02] 코치 — 직접 가입 비활성화. 감독이 팀 관리에서 코치 초대.
  // { id: 'coach', label: '코치', icon: 'sports', desc: '수업 진행' },
  // teen/child는 학부모가 자녀 등록 시 생성하는 계정이므로 직접 가입 비활성화
  // { id: 'teen', label: 'TEEN', icon: 'school', desc: '10세 이상 학생' },
  // { id: 'child', label: '어린이', icon: 'child_care', desc: '10세 미만' },
];

// ========== 역할 선택 카드 ==========
function RoleCard({
  role,
  selected,
  onClick,
}: {
  role: RoleOption;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        p-3 rounded-w-md border-2 transition-all motion-reduce:transition-none duration-200 text-center w-full
        ${
          selected
            ? "bg-ice-100 border-ice-500 dark:bg-ice-500/15 dark:border-ice-400"
            : "bg-wsurface dark:bg-rink-800 border-wline dark:border-rink-700 hover:border-wline-2"
        }
      `}
    >
      <div
        className={`
        w-10 h-10 mx-auto rounded-w-pill flex items-center justify-center mb-2
        ${selected ? "bg-ice-500 text-white dark:bg-ice-500" : "bg-wbg dark:bg-rink-700 text-wtext-3 dark:text-rink-300"}
      `}
      >
        <Icon name={role.icon} className="text-xl" />
      </div>
      <p
        className={`text-card-body font-semibold ${selected ? "text-ice-700 dark:text-ice-300" : "text-wtext-2 dark:text-rink-100"}`}
      >
        {role.label}
      </p>
      <p
        className={`text-[10px] mt-0.5 ${selected ? "text-ice-600 dark:text-ice-300" : "text-wtext-4 dark:text-rink-500"}`}
      >
        {role.desc}
      </p>
    </button>
  );
}

// ========== 감독 유형 ==========
type DirectorType = "team" | "academy";

// ========== 메인 컴포넌트 ==========
interface FormData {
  lastName: string;
  firstName: string;
  email: string;
  phone: string;
  password: string;
  passwordConfirm: string;
  // 감독 유형별 정보 (설계서 §4.5·§4.6) — 팀 코드는 가입 시 받지 않음(추후 팀 관리에서 등록)
  clubName: string;
  academyName: string;
  // 코치 가입 시 선택 — 감독에게 전달받은 팀 코드 (설계서 §4.5)
  coachTeamId: string;
}

interface FormErrors extends Partial<FormData> {
  general?: string;
  role?: string;
  directorType?: string;
}

interface Agreements {
  all: boolean;
  terms: boolean;
  privacy: boolean;
  marketing: boolean;
}

export default function SignupPage() {
  const { navigate } = useNavigation();
  const { toast } = useToast();
  const { signup, isLoading: authLoading } = useSessionAuth();
  useGuestOnly();
  // [수정 2026-05-22 v4] 사용자 스크린샷 확인 — statusbar 공간은 보이나 "< 회원가입" AppBar 가 없음.
  //   원인: v3(showAppBar:true + PageAppBar forceNative 없음)는 Native WebView 에서
  //         PageAppBar 가 null 반환되고, Flutter Native AppBar 적용 race/초기 상태에만 의존한다.
  //         그 결과 Native AppBar 가 적용되지 않는 경우 양쪽 AppBar 가 모두 사라진다.
  //   조치: find-id/awards-create 와 같은 표준으로 고정한다.
  //     · Native StatusBar 표시 (2026-06-15 사용자 직접 지시 — 회원가입은 상태바 노출)
  //     · Flutter Native AppBar 숨김
  //     · Web <PageAppBar forceNative /> 단일 노출
  //     · BottomNav 숨김
  // [정책 2026-06-15 사용자 직접 지시] 회원가입(/signup)은 AppStatus(상단 상태바)를 표시한다.
  //   (로그인/ID찾기/비번찾기는 2026-06-07 정책대로 숨김 유지.)
  //   상단 안전영역(노치/inset)은 APP 이 viewPadding.top 으로 항상 예약한다(webview_screen.dart).
  //   노출 정책 SoT 는 @/lib/app-status(AppStatusController) 가 단일 관리.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
  });

  // ─── Accessibility IDs ────────────────────────────
  const phoneId = useId();
  const passwordId = useId();
  const passwordConfirmId = useId();

  // 키보드 회피 — 회원가입 폼은 input 이 많아 (이메일/비밀번호/폰OTP/이름/주소) 키보드 가림
  // 가능성 높음. 활성 input 자동 스크롤 + 폼 컨테이너 padding-bottom 키보드 inset 만큼 확장.
  // SoT: docs/Architecture/SCREEN_METRICS.md, SPEC: docs/Planning/SPEC_LOGIN_KEYBOARD.md
  const formRef = useRef<HTMLFormElement>(null);
  useKeyboardAvoidance(formRef);

  // [수정 2026-05-28 사용자 요구] 회원가입 진입 시 '감독' 유형 기본 선택 + 입력 폼 펼침.
  //   기존 null(미선택)이면 역할 선택 카드만 노출되고 안내 문구만 보였음.
  //   director 기본값으로 진입 즉시 감독 입력 화면이 펼쳐진 상태로 표시된다.
  //   (코치/학부모 카드는 그대로 노출되어 사용자가 변경 가능.)
  const [selectedRole, setSelectedRole] = useState<UserType | null>("director");
  // 감독 가입은 기본적으로 '팀 감독'(team)으로 고정한다. 오픈클래스 감독(academy)은
  // 일반 가입 화면에 노출하지 않고, 별도 공유 URL(`/signup?director=academy`)로
  // 진입했을 때만 활성화한다(아래 isAcademyMode).
  const [directorType, setDirectorType] = useState<DirectorType | null>("team");
  // 오픈클래스 감독 전용 진입 여부 — `?director=academy` 쿼리 또는 본인인증 redirect
  // 복귀(sessionStorage 복원)로 결정된다. true 일 때만 ACADEMY_DIRECTOR 가입 폼 노출.
  const [isAcademyMode, setIsAcademyMode] = useState(false);
  // 본인인증(B안, 2026-05-26) — PARENT/COACH/DIRECTOR/ACADEMY_DIRECTOR 가입 시 필수.
  //   · IdentityVerifyInput 이 KG 통합인증 완료 후 requestId 를 콜백으로 회신.
  //   · 회원가입 호출 시 identityVerificationId 로 전달 → 백엔드 자동 채움.
  const [identityVerified, setIdentityVerified] =
    useState<IdentityVerifyResult | null>(null);

  // 오픈클래스 감독 진입 + 본인인증 redirect 복귀 복원.
  //  · `?director=academy` 쿼리로 진입한 경우에만 오픈클래스 감독(ACADEMY_DIRECTOR) 가입 활성화.
  //  · WebView 환경에서 PortOne 이 페이지 location 을 변경하면 React state 가 모두
  //    초기화되고 쿼리도 유실될 수 있으므로, sessionStorage 백업(directorType=academy)
  //    으로도 오픈클래스 모드를 복원해 사용자가 유형을 다시 선택할 필요 없게 한다.
  useEffect(() => {
    if (typeof window === "undefined") return;

    let academyFromQuery = false;
    try {
      academyFromQuery =
        new URLSearchParams(window.location.search).get("director") ===
        "academy";
    } catch {
      // ignore
    }

    let restored: { selectedRole?: UserType; directorType?: DirectorType } | null =
      null;
    try {
      const raw = window.sessionStorage.getItem("signup:role");
      if (raw) restored = JSON.parse(raw);
    } catch {
      // ignore
    }

    const academyMode =
      academyFromQuery || restored?.directorType === "academy";

    if (academyMode) {
      // 오픈클래스 감독 전용 진입 — 역할/유형 고정.
      setIsAcademyMode(true);
      setSelectedRole("director");
      setDirectorType("academy");
      return;
    }

    // 일반 진입 — 복원하되 오픈클래스 유형은 절대 복원하지 않는다(팀 감독 고정).
    if (restored?.selectedRole) setSelectedRole(restored.selectedRole);
    if (restored?.directorType && restored.directorType !== "academy") {
      setDirectorType(restored.directorType);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!selectedRole) return;
    try {
      window.sessionStorage.setItem(
        "signup:role",
        JSON.stringify({ selectedRole, directorType }),
      );
    } catch {
      // ignore
    }
  }, [selectedRole, directorType]);
  const [loading, setLoading] = useState(false);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!loading);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

  // 아이디 중복 확인 상태 (실시간 확인 버튼)
  const [isEmailChecking, setIsEmailChecking] = useState(false);
  const [emailDuplicateStatus, setEmailDuplicateStatus] = useState<
    "unchecked" | "available" | "duplicate"
  >("unchecked");

  // [수정 2026-05-21] 팀 선택 모달 방식 — 백엔드에서 검증된 목록만 노출하므로
  //  선택 즉시 teamCodeStatus='valid'. 기존 텍스트 입력+checkTeamCode 호출은 제거.
  //  invalid 상태는 더 이상 발생하지 않으나, 회귀를 위해 union 그대로 유지.
  const [teamCodeStatus, setTeamCodeStatus] = useState<
    "unchecked" | "valid" | "invalid"
  >("unchecked");
  const [verifiedTeamName, setVerifiedTeamName] = useState<string>("");
  const [isTeamPickerOpen, setIsTeamPickerOpen] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    lastName: "",
    firstName: "",
    email: "",
    phone: "",
    password: "",
    passwordConfirm: "",
    clubName: "",
    academyName: "",
    coachTeamId: "",
  });
  const [agreements, setAgreements] = useState<Agreements>({
    all: false,
    terms: false,
    privacy: false,
    marketing: false,
  });
  const [errors, setErrors] = useState<FormErrors>({});

  // [추가 2026-05-23] 약관 동의 row 의 chevron(>) 클릭 시 약관 본문 노출 모달 상태.
  //  기존: chevron 은 단순 장식이라 클릭해도 아무 일도 안 일어남 → 사용자 회귀.
  //  변경: chevron 을 button 으로 변경 + 클릭 시 TERMS_CONTENT 에서 해당 약관 본문 노출.
  const [termsModalKey, setTermsModalKey] = useState<TermsModalKey | null>(null);

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    // 아이디 변경 시 중복확인 상태 리셋.
    if (field === "email") {
      if (emailDuplicateStatus !== "unchecked") {
        setEmailDuplicateStatus("unchecked");
      }
    }
    // [수정 2026-05-21] 팀 선택 모달 방식 — 사용자 직접 타이핑 케이스는 발생하지 않으나,
    //  방어적으로 코드 필드가 변경되면 검증 상태도 리셋.
    if (field === "coachTeamId") {
      if (teamCodeStatus !== "unchecked") {
        setTeamCodeStatus("unchecked");
        setVerifiedTeamName("");
      }
    }
  };

  /**
   * TeamPickerSheet 에서 팀 선택 시 호출 (코치 가입 전용).
   *  모달이 /teams/public 응답 기반의 검증된 목록만 노출하므로 선택 즉시
   *  teamCodeStatus='valid' 로 간주. 팀의 불변 id(selection.id)를
   *  formData.coachTeamId 에 저장해 teamId 로 전송한다.
   */
  const handleTeamPicked = (selection: TeamPickerSelection) => {
    // 팀 선택은 코치 가입에서만 사용 (학부모는 자녀 등록 시점에 자녀별로 선택).
    setFormData((prev) => ({ ...prev, coachTeamId: selection.id }));
    setTeamCodeStatus("valid");
    setVerifiedTeamName(selection.name);
    setErrors((prev) => ({ ...prev, coachTeamId: undefined }));
    setIsTeamPickerOpen(false);
  };

  /**
   * 아이디 중복 확인 — 입력란 옆 [중복확인] 버튼.
   *  결과: available | duplicate. 백엔드 checkEmailExists 엔드포인트를 그대로 사용.
   */
  const handleCheckEmailDuplicate = async () => {
    const id = formData.email.trim();
    if (!ID_REGEX.test(id)) {
      setErrors({ email: ID_RULE_MESSAGE });
      return;
    }
    setIsEmailChecking(true);
    try {
      const result = await authService.checkEmailExists(id);
      if (result.success && result.data?.exists) {
        setEmailDuplicateStatus("duplicate");
        setErrors({ email: "이미 사용 중인 아이디입니다." });
      } else if (result.success) {
        setEmailDuplicateStatus("available");
        setErrors((prev) => ({ ...prev, email: undefined }));
      } else {
        setErrors({ email: result.error?.message ?? "중복 확인에 실패했습니다." });
      }
    } catch {
      setErrors({ email: "중복 확인에 실패했습니다." });
    } finally {
      setIsEmailChecking(false);
    }
  };

  const handleAllAgree = () => {
    const newValue = !agreements.all;
    setAgreements({
      all: newValue,
      terms: newValue,
      privacy: newValue,
      marketing: newValue,
    });
  };

  const handleAgreementChange = (field: keyof Omit<Agreements, "all">) => {
    const newAgreements = { ...agreements, [field]: !agreements[field] };
    newAgreements.all =
      newAgreements.terms && newAgreements.privacy && newAgreements.marketing;
    setAgreements(newAgreements);
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!selectedRole) {
      newErrors.role = "가입 유형을 선택해주세요.";
    }

    // 코치 선택 시: 팀 선택 필수 (설계서 §3.3 — 코치 권한은 팀 소속 전제).
    //  [수정 2026-05-21] 모달 선택 방식 — teamCodeStatus='valid' 게이트만 유지.
    //   모달이 백엔드 검증된 목록만 노출하므로 길이/포맷 체크는 불필요.
    if (selectedRole === "coach") {
      if (
        !formData.coachTeamId.trim() ||
        teamCodeStatus !== "valid"
      ) {
        newErrors.coachTeamId = MESSAGES.team.signupCoachTeamCodeRequired;
      }
    }

    // 감독 선택 시: 감독 유형 + 유형별 필수 정보 검증 (설계서 §4.5·§4.6)
    if (selectedRole === "director") {
      if (!directorType) {
        newErrors.directorType = MESSAGES.team.signupDirectorTypeRequired;
      } else if (directorType === "team") {
        if (!formData.clubName.trim()) {
          newErrors.clubName = MESSAGES.team.signupTeamNameRequired;
        } else if (formData.clubName.trim().length < 2) {
          newErrors.clubName = MESSAGES.team.signupTeamNameRequired;
        }
        // 팀 코드는 가입 시 받지 않음 — 추후 팀 관리에서 등록.
      } else if (directorType === "academy") {
        if (
          !formData.academyName.trim() ||
          formData.academyName.trim().length < 2
        ) {
          newErrors.academyName = MESSAGES.team.signupAcademyNameRequired;
        }
      }
    }

    // B안 (2026-05-26) — 본인인증 강제 대상은 이름/휴대폰을 verification 에서 자동 채움
    //   · IdentityVerifyInput 컴포넌트가 이름/휴대폰 입력란을 대체
    //   · identityVerified 가 null 이면 본인인증 미완료 에러
    const isIdentityRequired =
      selectedRole === "parent" ||
      selectedRole === "coach" ||
      selectedRole === "director";

    if (isIdentityRequired) {
      if (!identityVerified) {
        newErrors.general = "본인인증을 완료해주세요.";
      }
    } else {
      if (!formData.lastName.trim()) {
        newErrors.lastName = "성을 입력해주세요.";
      }
      if (!formData.firstName.trim()) {
        newErrors.firstName = "이름을 입력해주세요.";
      }
    }

    if (!formData.email.trim()) {
      newErrors.email = "아이디를 입력해주세요.";
    } else if (!ID_REGEX.test(formData.email.trim())) {
      newErrors.email = ID_RULE_MESSAGE;
    } else if (emailDuplicateStatus !== "available") {
      newErrors.email = "아이디 중복 확인이 필요합니다.";
    }

    if (!isIdentityRequired && !formData.phone.trim()) {
      newErrors.phone = "휴대폰 번호를 입력해주세요.";
    }

    if (!formData.password) {
      newErrors.password = "비밀번호를 입력해주세요.";
    } else if (formData.password.length < 8) {
      newErrors.password = "비밀번호는 8자 이상이어야 합니다.";
    }

    if (!formData.passwordConfirm) {
      newErrors.passwordConfirm = "비밀번호 확인을 입력해주세요.";
    } else if (formData.password !== formData.passwordConfirm) {
      newErrors.passwordConfirm = "비밀번호가 일치하지 않습니다.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (!validateForm()) return;

    if (!agreements.terms || !agreements.privacy) {
      setErrors({ general: "필수 약관에 동의해주세요." });
      return;
    }

    setLoading(true);

    try {
      const emailCheck = await authService.checkEmailExists(
        formData.email.trim(),
      );
      if (emailCheck.success && emailCheck.data?.exists) {
        setErrors({ email: MESSAGES.signupValidation.emailDuplicated });
        setLoading(false);
        return;
      }

      // 본인인증 강제 대상은 휴대폰을 사용자가 입력하지 않으므로 이 단계 스킵.
      //   · 백엔드 register() 가 verification.verifiedPhone 자동 채움 + 중복 재확인.
      const isIdentityRequiredForSubmit =
        selectedRole === "parent" ||
        selectedRole === "coach" ||
        selectedRole === "director";
      if (!isIdentityRequiredForSubmit) {
        const phoneCheck = await authService.checkPhoneExists(
          formData.phone.replace(/-/g, ""),
        );
        if (phoneCheck.success && phoneCheck.data?.exists) {
          setErrors({ phone: MESSAGES.signupValidation.phoneDuplicated });
          setLoading(false);
          return;
        }
      }

      // 감독 + 유형에 따라 백엔드 UserType 매핑 (설계서 §3.1)
      //  - 팀 감독 → DIRECTOR + clubInfo
      //  - 오픈클래스 감독 → ACADEMY_DIRECTOR + academyInfo
      //  - 그 외 역할은 기존 대문자 변환 사용
      //  - 백엔드 Prisma UserType 은 대문자이므로 SCREAMING_SNAKE_CASE 로 전송해야 함.
      const resolvedUserType: UserType =
        selectedRole === "director" && directorType === "academy"
          ? ("ACADEMY_DIRECTOR" as UserType)
          : (selectedRole!.toUpperCase() as UserType);

      const response = await signup({
        // B안 (2026-05-26) — 본인인증 강제 대상은 이름/휴대폰을 빈 값으로 전송 →
        //   백엔드 register() 가 verification 에서 자동 채움.
        //   사용자가 직접 입력한 케이스(비-IDENTITY 역할)는 기존 동작 유지.
        ...(isIdentityRequiredForSubmit
          ? { identityVerificationId: identityVerified?.requestId }
          : {
              firstName: formData.firstName.trim(),
              lastName: formData.lastName.trim(),
              phone: formData.phone.replace(/-/g, ""),
            }),
        email: formData.email.trim(),
        password: formData.password,
        userType: resolvedUserType,
        ...(selectedRole === "director" &&
          directorType === "team" && {
            clubInfo: {
              clubName: formData.clubName.trim(),
              // 가입 감독은 항상 팀 감독(HEAD_COACH) — 단장(MANAGER)은 감독이 코치 등록에서 생성.
            },
          }),
        ...(selectedRole === "director" &&
          directorType === "academy" && {
            academyInfo: {
              name: formData.academyName.trim(),
            },
          }),
        ...(selectedRole === "coach" &&
          formData.coachTeamId.trim() && {
            teamId: formData.coachTeamId.trim(),
          }),
        agreements: {
          terms: agreements.terms,
          privacy: agreements.privacy,
          marketing: agreements.marketing,
        },
      });

      if (response.success) {
        navigate("/login?signup=success");
      } else {
        const msg = response.error?.message || "회원가입에 실패했습니다.";
        // 팀 선택 관련 서버 에러는 해당 필드에도 매핑해 사용자가 어느 필드인지 즉시 인지하도록 한다.
        if (msg.includes("팀을 찾을 수 없") && selectedRole === "coach") {
          setErrors({ coachTeamId: msg });
        } else {
          setErrors({ general: msg });
        }
        toast.error(msg);
      }
    } catch {
      const msg = "회원가입 중 오류가 발생했습니다.";
      setErrors({ general: msg });
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const isSubmitting = loading;
  // 감독 선택 시 유형별 필수 정보가 채워졌는지 검사 (설계서 §4.5·§4.6)
  const directorInfoValid =
    selectedRole !== "director"
      ? true
      : directorType === "team"
        ? Boolean(formData.clubName.trim())
        : directorType === "academy"
          ? Boolean(formData.academyName.trim())
          : false;
  // 코치 선택 시 팀 코드 필수 + DB 실재 검증 통과 필수
  //  [수정 2026-05-13] teamCodeStatus === 'valid' 일 때만 가입 허용.
  const coachTeamIdValid =
    selectedRole !== "coach"
      ? true
      : Boolean(formData.coachTeamId.trim()) && teamCodeStatus === "valid";
  // B안 (2026-05-26) — 본인인증 강제 대상은 이름/휴대폰을 verification 에서 자동 채움.
  //   · UI 가 IdentityVerifyInput 으로 이름/휴대폰 input 을 대체하므로
  //     해당 필드 trim 체크 대신 identityVerified 존재 여부로 검사.
  const isIdentityRequiredRole =
    selectedRole === "parent" ||
    selectedRole === "coach" ||
    selectedRole === "director";
  const nameAndPhoneValid = isIdentityRequiredRole
    ? identityVerified !== null
    : Boolean(formData.lastName.trim()) &&
      Boolean(formData.firstName.trim()) &&
      Boolean(formData.phone.trim());

  const hasRequiredFields =
    Boolean(selectedRole) &&
    directorInfoValid &&
    coachTeamIdValid &&
    nameAndPhoneValid &&
    Boolean(formData.email.trim()) &&
    Boolean(formData.password) &&
    Boolean(formData.passwordConfirm);
  const hasValidRequiredFields =
    hasRequiredFields &&
    ID_REGEX.test(formData.email.trim()) &&
    emailDuplicateStatus === "available" &&
    formData.password.length >= 8 &&
    formData.password === formData.passwordConfirm &&
    agreements.terms &&
    agreements.privacy;
  const canSubmit = hasValidRequiredFields && !isSubmitting;

  return (
    <MobileContainer hasBottomNav={false} className="bg-wbg dark:bg-puck">
      {/* [수정 2026-06-15 사용자 직접 지시] 회원가입 헤더:
            · title='회원가입' + centerTitle → 화면 정중앙 타이틀
            · onBack=() => /login            → ← back 동작
            · showMenu={false}               → 비로그인 GlobalMenu(≡) 차단 (가입 폼 상태 보호)
            · showMy={false}                 → 우측 알림(종) 아이콘 제거 (사용자 요구)
            · forceNative                    → Native WebView 에서도 단일 노출 (Flutter AppBar 중복 방지) */}
      <PageAppBar
        title="회원가입"
        centerTitle
        showMy={false}
        onBack={() => {
          // [수정 2026-05-28 사용자 요구] 회원가입 화면 ← 버튼 → 로그인 화면으로 이동.
          //   Android 하드웨어 백키는 전역 AppBackHandlerSetup(useAppBack) 단일 핸들러가 처리
          //   (signup 이전 화면=로그인 → router.back / 직접 진입 시 /login fallback).
          //   페이지 레벨 useAppBack 중복 등록은 setHardwareBackEnabled 토글 충돌로
          //   진입 즉시 시스템 백이 발동하는 회귀를 유발하므로 추가하지 않는다.
          navigate("/login");
        }}
        showMenu={false}
        forceNative
      />

      {/* Content */}
      <main
        data-no-enter
        className="flex-1 overflow-y-auto scroll-keyboard-safe px-5 py-6 max-w-lg w-full mx-auto pb-keyboard-safe-8"
      >
        {/* Error Message */}
        {(errors.general || errors.role) && (
          <div className="mb-5 p-4 bg-flame-100 dark:bg-flame-500/15 border border-flame-500/40 rounded-w-md">
            <div className="flex items-center gap-2">
              <Icon
                name="error"
                className="text-flame-500 text-card-title flex-shrink-0"
              />
              <p className="text-flame-500 dark:text-flame-100 text-card-body">
                {errors.general || errors.role}
              </p>
            </div>
          </div>
        )}

        {/* Signup Form */}
        <form ref={formRef} onSubmit={handleSignup} className="space-y-6">
          {/* Role Selection */}
          <section>
            <h2 className="text-card-body font-semibold text-wtext-2 dark:text-rink-100 mb-1.5 flex items-center gap-1">
              가입 유형 <span className="text-flame-500">*</span>
            </h2>
            <p className="text-card-meta text-wtext-3 dark:text-rink-300 mb-3">
              {MESSAGES.team.signupRoleHelper}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {roleOptions.map((role) => (
                <RoleCard
                  key={role.id}
                  role={role}
                  selected={selectedRole === role.id}
                  onClick={() => {
                    setSelectedRole(role.id);
                    // 감독 선택 시 유형 자동 설정 — 오픈클래스 전용 진입(isAcademyMode)이면
                    // 'academy', 그 외엔 '팀 감독'(team)으로 고정. 다른 역할로 바꾸면 초기화.
                    if (role.id === "director") {
                      setDirectorType(isAcademyMode ? "academy" : "team");
                    } else {
                      setDirectorType(null);
                    }
                    // [추가 2026-05-13] 역할 변경 시 팀 코드 검증 상태 리셋.
                    setTeamCodeStatus("unchecked");
                    setVerifiedTeamName("");
                    if (errors.role)
                      setErrors((prev) => ({ ...prev, role: undefined }));
                  }}
                />
              ))}
            </div>
            {errors.directorType && (
              <p className="mt-2 text-card-body text-flame-500" role="alert">
                {errors.directorType}
              </p>
            )}
          </section>

          {/* 가입 유형 미선택 안내 — selectedRole 이 null 일 때만 안내 문구 노출.
              아래의 모든 입력 섹션(감독 유형/팀 선택/기본 정보/휴대폰/비밀번호/약관/가입 버튼)은
              selectedRole 선택 후에야 표시된다 (2026-05-26 사용자 요청). */}
          {!selectedRole && (
            <div className="rounded-w-xl border border-dashed border-wline dark:border-rink-700 px-5 py-8 text-center text-wtext-3 dark:text-rink-300">
              <p className="text-card-body">
                위에서 가입 유형을 선택하면<br />
                회원 정보 입력 화면이 나타납니다.
              </p>
            </div>
          )}

          {/* selectedRole 선택 후에만 입력 섹션 + 가입 버튼 노출 */}
          {selectedRole && (
          <div className="space-y-6">
          {/* 감독 정보 입력 — selectedRole === 'director' 일 때만 노출.
              감독 유형 선택 카드는 제거: 일반 가입은 '팀 감독'(team) 고정이며,
              오픈클래스 감독(academy)은 별도 공유 URL(`?director=academy`)로 진입한
              경우(isAcademyMode)에만 directorType='academy' 가 되어 폼이 노출된다. */}
          {selectedRole === "director" && (
            <section className="bg-wsurface dark:bg-rink-800 rounded-w-xl p-5 border border-wline dark:border-rink-700">
              {/* 모드별 헤더 — 팀 감독 / 오픈클래스 감독 */}
              <div className="mb-5 flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-w-pill bg-ice-500 text-white">
                  <Icon
                    name={directorType === "academy" ? "school" : "groups"}
                    className="text-card-title [color:inherit]"
                  />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-card-body font-semibold text-wtext-2 dark:text-rink-100">
                    {directorType === "academy"
                      ? MESSAGES.team.signupDirectorTypeAcademy
                      : MESSAGES.team.signupDirectorTypeTeam}
                  </p>
                  <p className="text-card-meta mt-0.5 text-wtext-3 dark:text-rink-300">
                    {directorType === "academy"
                      ? MESSAGES.team.signupDirectorTypeAcademyDesc
                      : MESSAGES.team.signupDirectorTypeTeamDesc}
                  </p>
                </div>
              </div>

              {/* 팀 감독 — 팀 정보 입력 (설계서 §4.5) */}
              {directorType === "team" && (
                <div className="border-t border-wline dark:border-rink-700 pt-5">
                  <p className="text-card-meta text-wtext-3 dark:text-rink-300 mb-4">
                    {MESSAGES.team.signupTeamSectionHelper}
                  </p>
                  <div className="space-y-4">
                    <Input
                      label={MESSAGES.team.signupTeamNameLabel}
                      placeholder={MESSAGES.team.signupTeamNamePlaceholder}
                      icon="groups"
                      value={formData.clubName}
                      onChange={(e) =>
                        handleInputChange("clubName", e.target.value)
                      }
                      error={errors.clubName}
                      maxLength={50}
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              )}

              {/* 오픈클래스 감독 — 오픈클래스 정보 입력 (설계서 §4.6, 별도 URL 진입 전용) */}
              {directorType === "academy" && (
                <div className="border-t border-wline dark:border-rink-700 pt-5">
                  <p className="text-card-meta text-wtext-3 dark:text-rink-300 mb-4">
                    {MESSAGES.team.signupAcademySectionHelper}
                  </p>
                  <div className="space-y-4">
                    <Input
                      label={MESSAGES.team.signupAcademyNameLabel}
                      placeholder={MESSAGES.team.signupAcademyNamePlaceholder}
                      icon="school"
                      value={formData.academyName}
                      onChange={(e) =>
                        handleInputChange("academyName", e.target.value)
                      }
                      error={errors.academyName}
                      maxLength={50}
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              )}
            </section>
          )}

          {/* 코치 가입 시 팀 선택 (필수) — 감독이 만든 팀에 가입 신청 (설계서 §4.5).
              학부모는 가입 시 팀을 선택하지 않고, 자녀 등록 시점에 자녀별로 팀을 고른다. */}
          {selectedRole === "coach" && (
            <section className="bg-wsurface dark:bg-rink-800 rounded-w-xl p-5 border border-wline dark:border-rink-700">
              {(() => {
                const currentCode = formData.coachTeamId;
                const errorMsg = errors.coachTeamId;
                const label = MESSAGES.team.signupCoachTeamCodeLabel;
                const placeholder = MESSAGES.team.signupCoachTeamCodePlaceholder;
                const helper = MESSAGES.team.signupCoachTeamCodeHelper;
                const isPicked =
                  teamCodeStatus === "valid" &&
                  Boolean(verifiedTeamName) &&
                  Boolean(currentCode);
                // 팀 식별은 내부 id 로 처리되므로 화면엔 팀 이름만 노출(코드/식별자 미노출).
                const displayValue = isPicked ? verifiedTeamName : "";
                const buttonLabel = isPicked
                  ? MESSAGES.team.pickerChangeAction
                  : MESSAGES.team.pickerOpenAction;
                const openPicker = () => {
                  if (isSubmitting) return;
                  setIsTeamPickerOpen(true);
                };
                return (
                  <>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Input
                          label={label}
                          placeholder={placeholder}
                          icon="badge"
                          value={displayValue}
                          readOnly
                          onClick={openPicker}
                          error={errorMsg}
                          required
                          disabled={isSubmitting}
                          aria-label={label}
                          className="cursor-pointer"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        onClick={openPicker}
                        disabled={isSubmitting}
                        className="shrink-0"
                      >
                        {buttonLabel}
                      </Button>
                    </div>
                    {isPicked && (
                      <p className="mt-1.5 text-card-meta text-mint-500">
                        {MESSAGES.team.codeVerified(verifiedTeamName)}
                      </p>
                    )}
                    <p className="mt-1.5 text-card-meta text-wtext-3 dark:text-rink-300">
                      {helper}
                    </p>
                  </>
                );
              })()}
            </section>
          )}

          {/* 기본 정보 */}
          <section className="bg-wsurface dark:bg-rink-800 rounded-w-xl p-5 border border-wline dark:border-rink-700">
            <h2 className="text-card-body font-semibold text-wtext-2 dark:text-rink-100 mb-4">
              기본 정보
            </h2>

            <div className="space-y-4">
              {/* B안 (2026-05-26) — 본인인증 강제 대상은 이름 입력란을 IdentityVerifyInput 으로 교체.
                  PARENT/COACH/DIRECTOR 선택 시 KG 통합인증 (PASS/SMS/카카오/네이버 등) 후
                  이름·휴대폰·생년월일·성별·통신사를 verification 에서 자동 채움. */}
              {isIdentityRequiredRole ? (
                <IdentityVerifyInput
                  label="이름 (본인인증 필수)"
                  verified={identityVerified}
                  onVerified={(result) => {
                    setIdentityVerified(result);
                    setErrors((prev) => ({
                      ...prev,
                      general: undefined,
                      lastName: undefined,
                      firstName: undefined,
                      phone: undefined,
                    }));
                  }}
                  onError={(msg) => setErrors((prev) => ({ ...prev, general: msg }))}
                  disabled={isSubmitting}
                />
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="성"
                    placeholder="홍"
                    icon="person"
                    value={formData.lastName}
                    onChange={(e) =>
                      handleInputChange("lastName", e.target.value)
                    }
                    error={errors.lastName}
                    disabled={isSubmitting}
                  />
                  <Input
                    label="이름"
                    placeholder="길동"
                    value={formData.firstName}
                    onChange={(e) =>
                      handleInputChange("firstName", e.target.value)
                    }
                    error={errors.firstName}
                    disabled={isSubmitting}
                  />
                </div>
              )}

              {/* 아이디 + 중복확인 버튼 */}
              <div>
                <label className="block text-card-body font-medium text-wtext-2 dark:text-rink-100 mb-1.5">
                  아이디 <span className="text-rose-500">*</span>
                  {emailDuplicateStatus === "available" && (
                    <span className="ml-2 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                      ✓ 사용 가능
                    </span>
                  )}
                </label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      type="text"
                      name="username"
                      autoComplete="username"
                      inputMode="text"
                      autoCapitalize="none"
                      autoCorrect="off"
                      aria-label="아이디"
                      aria-required="true"
                      placeholder="영문 소문자·숫자·_ 8~20자"
                      icon="person"
                      value={formData.email}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                      error={errors.email}
                      disabled={isSubmitting}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="md"
                    onClick={handleCheckEmailDuplicate}
                    disabled={
                      isSubmitting || isEmailChecking || !formData.email
                    }
                    className="whitespace-nowrap shrink-0"
                  >
                    {isEmailChecking ? "확인중..." : "중복확인"}
                  </Button>
                </div>
              </div>
            </div>
          </section>

          {/* B안 (2026-05-26) — 본인인증 강제 대상은 이름 영역에서 휴대폰까지 함께 인증되므로
              별도 휴대폰 섹션 숨김. (자동 채움된 휴대폰은 가입 완료 화면에서 마스킹 표시) */}
          {!isIdentityRequiredRole && (
          <section className="bg-wsurface dark:bg-rink-800 rounded-w-xl p-5 border border-wline dark:border-rink-700">
            <h2 className="text-card-body font-semibold text-wtext-2 dark:text-rink-100 mb-4">
              휴대폰 번호
            </h2>
            <div>
              <label
                htmlFor={phoneId}
                className="block text-card-body font-medium text-wtext-2 dark:text-rink-100 mb-1.5"
              >
                휴대폰 번호
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Icon name="phone_android" className="text-wtext-4" />
                </div>
                <input
                  id={phoneId}
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="010-1234-5678"
                  value={formData.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                  disabled={isSubmitting}
                  required
                  aria-required="true"
                  aria-invalid={!!errors.phone}
                  aria-describedby={errors.phone ? `${phoneId}-error` : undefined}
                  className={`block w-full pl-12 pr-4 py-3 bg-wbg dark:bg-puck border rounded-w-md text-wtext-1 dark:text-white placeholder-wtext-4 focus:outline-none focus:ring-2 focus:ring-ice-500/20 focus:border-ice-500 transition-all motion-reduce:transition-none disabled:opacity-60 disabled:cursor-not-allowed ${
                    errors.phone
                      ? "border-flame-500"
                      : "border-wline dark:border-rink-700"
                  }`}
                />
              </div>
              {errors.phone && (
                <p id={`${phoneId}-error`} role="alert" className="mt-1.5 text-card-body text-flame-500">
                  {errors.phone}
                </p>
              )}
            </div>
          </section>
          )}

          {/* 비밀번호 설정 */}
          <section className="bg-wsurface dark:bg-rink-800 rounded-w-xl p-5 border border-wline dark:border-rink-700">
            <h2 className="text-card-body font-semibold text-wtext-2 dark:text-rink-100 mb-4">
              비밀번호 설정
            </h2>

            <div className="space-y-4">
              {/* Password */}
              <div>
                <label
                  htmlFor={passwordId}
                  className="block text-card-body font-medium text-wtext-2 dark:text-rink-100 mb-1.5"
                >
                  비밀번호 <span className="text-rose-500">*</span>
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Icon
                      name="lock"
                      className="text-wtext-4 group-focus-within:text-ice-500 transition-colors motion-reduce:transition-none"
                    />
                  </div>
                  <input
                    id={passwordId}
                    name="new-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="8자 이상 입력"
                    value={formData.password}
                    onChange={(e) =>
                      handleInputChange("password", e.target.value)
                    }
                    disabled={isSubmitting}
                    required
                    aria-required="true"
                    aria-invalid={!!errors.password}
                    aria-describedby={errors.password ? `${passwordId}-error` : undefined}
                    autoComplete="new-password"
                    className={`block w-full pl-12 pr-12 py-3 bg-wbg dark:bg-puck border rounded-w-md text-wtext-1 dark:text-white placeholder-wtext-4 focus:outline-none focus:ring-2 focus:ring-ice-500/20 focus:border-ice-500 transition-all motion-reduce:transition-none disabled:opacity-50 ${
                      errors.password
                        ? "border-flame-500"
                        : "border-wline dark:border-rink-700"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={
                      showPassword ? "비밀번호 숨기기" : "비밀번호 표시"
                    }
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-wtext-4 hover:text-wtext-2"
                  >
                    <Icon
                      name={showPassword ? "visibility_off" : "visibility"}
                    />
                  </button>
                </div>
                {errors.password && (
                  <p id={`${passwordId}-error`} role="alert" className="mt-1.5 text-card-body text-flame-500">
                    {errors.password}
                  </p>
                )}
              </div>

              {/* Password Confirm */}
              <div>
                <label
                  htmlFor={passwordConfirmId}
                  className="block text-card-body font-medium text-wtext-2 dark:text-rink-100 mb-1.5"
                >
                  비밀번호 확인 <span className="text-rose-500">*</span>
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Icon
                      name="lock"
                      className="text-wtext-4 group-focus-within:text-ice-500 transition-colors motion-reduce:transition-none"
                    />
                  </div>
                  <input
                    id={passwordConfirmId}
                    name="new-password-confirm"
                    type={showPasswordConfirm ? "text" : "password"}
                    placeholder="비밀번호 재입력"
                    value={formData.passwordConfirm}
                    onChange={(e) =>
                      handleInputChange("passwordConfirm", e.target.value)
                    }
                    disabled={isSubmitting}
                    required
                    aria-required="true"
                    aria-invalid={!!errors.passwordConfirm}
                    aria-describedby={errors.passwordConfirm ? `${passwordConfirmId}-error` : undefined}
                    autoComplete="new-password"
                    className={`block w-full pl-12 pr-12 py-3 bg-wbg dark:bg-puck border rounded-w-md text-wtext-1 dark:text-white placeholder-wtext-4 focus:outline-none focus:ring-2 focus:ring-ice-500/20 focus:border-ice-500 transition-all motion-reduce:transition-none disabled:opacity-50 ${
                      errors.passwordConfirm
                        ? "border-flame-500"
                        : "border-wline dark:border-rink-700"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                    aria-label={
                      showPasswordConfirm
                        ? "비밀번호 확인 숨기기"
                        : "비밀번호 확인 표시"
                    }
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-wtext-4 hover:text-wtext-2"
                  >
                    <Icon
                      name={
                        showPasswordConfirm ? "visibility_off" : "visibility"
                      }
                    />
                  </button>
                </div>
                {errors.passwordConfirm && (
                  <p id={`${passwordConfirmId}-error`} role="alert" className="mt-1.5 text-card-body text-flame-500">
                    {errors.passwordConfirm}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Agreements */}
          <section className="bg-wsurface dark:bg-rink-800 rounded-w-xl p-5 border border-wline dark:border-rink-700">
            <h2 className="text-card-body font-semibold text-wtext-2 dark:text-rink-100 mb-4">
              약관 동의
            </h2>

            {/* All Agree */}
            <label className="flex items-center gap-3 pb-3 border-b border-wline dark:border-rink-700 cursor-pointer">
              <button
                type="button"
                onClick={handleAllAgree}
                className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all motion-reduce:transition-none ${
                  agreements.all
                    ? "bg-ice-500 border-ice-500"
                    : "border-wline dark:border-rink-700 hover:border-wline-2"
                }`}
              >
                {agreements.all && (
                  <Icon name="check" className="text-white text-card-body" />
                )}
              </button>
              <span className="text-wtext-1 dark:text-white font-semibold text-card-body">
                전체 약관에 동의합니다
              </span>
            </label>

            <div className="pt-3 space-y-1">
              {/* Terms */}
              <label className="flex items-center gap-3 py-2 cursor-pointer">
                <button
                  type="button"
                  onClick={() => handleAgreementChange("terms")}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all motion-reduce:transition-none flex-shrink-0 ${
                    agreements.terms
                      ? "bg-ice-500 border-ice-500"
                      : "border-wline dark:border-rink-700"
                  }`}
                >
                  {agreements.terms && (
                    <Icon name="check" className="text-white text-card-meta" />
                  )}
                </button>
                <span className="text-wtext-3 dark:text-rink-300 text-card-body flex-1">
                  <span className="text-flame-500 font-medium">[필수]</span>{" "}
                  서비스 이용약관
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    // label 의 default(체크박스 토글) 차단 — chevron 은 약관 본문 노출 전용.
                    e.preventDefault();
                    e.stopPropagation();
                    setTermsModalKey("service");
                  }}
                  className="p-1 -m-1 rounded-w-pill hover:bg-wbg dark:hover:bg-rink-700/40 transition-colors motion-reduce:transition-none"
                  aria-label="서비스 이용약관 보기"
                >
                  <Icon name="chevron_right" className="text-wtext-4 text-card-emphasis" />
                </button>
              </label>

              {/* Privacy */}
              <label className="flex items-center gap-3 py-2 cursor-pointer">
                <button
                  type="button"
                  onClick={() => handleAgreementChange("privacy")}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all motion-reduce:transition-none flex-shrink-0 ${
                    agreements.privacy
                      ? "bg-ice-500 border-ice-500"
                      : "border-wline dark:border-rink-700"
                  }`}
                >
                  {agreements.privacy && (
                    <Icon name="check" className="text-white text-card-meta" />
                  )}
                </button>
                <span className="text-wtext-3 dark:text-rink-300 text-card-body flex-1">
                  <span className="text-flame-500 font-medium">[필수]</span>{" "}
                  개인정보 처리방침
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setTermsModalKey("privacy");
                  }}
                  className="p-1 -m-1 rounded-w-pill hover:bg-wbg dark:hover:bg-rink-700/40 transition-colors motion-reduce:transition-none"
                  aria-label="개인정보 처리방침 보기"
                >
                  <Icon name="chevron_right" className="text-wtext-4 text-card-emphasis" />
                </button>
              </label>

              {/* Marketing */}
              <label className="flex items-center gap-3 py-2 cursor-pointer">
                <button
                  type="button"
                  onClick={() => handleAgreementChange("marketing")}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all motion-reduce:transition-none flex-shrink-0 ${
                    agreements.marketing
                      ? "bg-ice-500 border-ice-500"
                      : "border-wline dark:border-rink-700"
                  }`}
                >
                  {agreements.marketing && (
                    <Icon name="check" className="text-white text-card-meta" />
                  )}
                </button>
                <span className="text-wtext-3 dark:text-rink-300 text-card-body flex-1">
                  <span className="text-wtext-4">[선택]</span> 마케팅 정보 수신
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setTermsModalKey("marketing");
                  }}
                  className="p-1 -m-1 rounded-w-pill hover:bg-wbg dark:hover:bg-rink-700/40 transition-colors motion-reduce:transition-none"
                  aria-label="마케팅 정보 수신 약관 보기"
                >
                  <Icon name="chevron_right" className="text-wtext-4 text-card-emphasis" />
                </button>
              </label>
            </div>
          </section>

          {/* Submit Button */}
          <Button
            type="submit"
            fullWidth
            loading={isSubmitting}
            size="lg"
            disabled={!canSubmit}
          >
            가입하기
          </Button>
          </div>
          )}

          {/* [제거 2026-06-10] 소셜 가입 UI — 소셜 로그인 전면 제거(Apple 4.8 의무 해소)에 따라 dead-code 정리.
              복원 시 Apple 로그인(Sign in with Apple) 동시 제공 필수 — 3rd-party 로그인 단독 제공은 Apple 4.8 위반. */}

          {/* Login Link */}
          <div className="text-center pt-2 pb-4">
            <span className="text-wtext-3 dark:text-rink-300 text-card-body">
              이미 계정이 있으신가요?{" "}
            </span>
            <NavLink
              href="/login"
              className="text-ice-500 font-semibold text-card-body hover:underline"
            >
              로그인
            </NavLink>
          </div>
        </form>
      </main>

      {/* [추가 2026-05-23] 약관 본문 모달 — agreement row 의 chevron(>) 클릭 시 노출.
            서비스 이용약관 / 개인정보 처리방침 / 마케팅 정보 수신 3종.
            본문은 lib/terms-content.ts 의 TERMS_CONTENT 상수 (정적). */}
      {termsModalKey && (
        <FullModal
          isOpen={termsModalKey !== null}
          onClose={() => setTermsModalKey(null)}
          title={TERMS_CONTENT[termsModalKey]?.title ?? "약관"}
          variant="slide-up"
        >
          <div className="px-5 py-5 bg-wbg dark:bg-puck">
            <div className="mb-3 text-card-meta text-wtext-3 dark:text-rink-300">
              {TERMS_CONTENT[termsModalKey]?.version} ·{" "}
              {TERMS_CONTENT[termsModalKey]?.updatedAt}
            </div>
            <pre className="whitespace-pre-wrap break-words font-sans text-card-body leading-relaxed text-wtext-2 dark:text-rink-100">
              {TERMS_CONTENT[termsModalKey]?.content ?? "약관 내용을 불러올 수 없습니다."}
            </pre>
          </div>
        </FullModal>
      )}

      {/* 팀 선택 모달 — 학부모/코치 가입 공용 (2026-05-21 추가) */}
      <TeamPickerSheet
        isOpen={isTeamPickerOpen}
        onClose={() => setIsTeamPickerOpen(false)}
        onSelect={handleTeamPicked}
      />
    </MobileContainer>
  );
}
