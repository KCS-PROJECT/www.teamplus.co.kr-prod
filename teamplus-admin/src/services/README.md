# TEAMPLUS React Web API Client

React Web 애플리케이션을 위한 완전한 API 클라이언트 라이브러리입니다.

## 📁 파일 구조

```
src/services/
├── api-client.ts          # Axios 기반 HTTP 클라이언트 (JWT 자동 첨부, 에러 핸들링)
├── auth.service.ts        # 인증 서비스 (로그인, 회원가입, 토큰 관리)
├── club.service.ts        # 클럽 서비스 (클럽 관리, 멤버 승인)
├── class.service.ts       # 수업 서비스 (수업 조회, 등록, 일정 관리)
├── payment.service.ts     # 결제 서비스 (결제 생성, 검증, 이력 조회)
├── attendance.service.ts  # 출석 서비스 (체크인, 이력 조회, 크레딧 관리)
├── index.ts               # Barrel export (중앙 관리)
└── README.md              # 본 문서

src/types/
└── index.ts               # 모든 API 타입 정의
```

## 🚀 시작하기

### 1. 설치

```bash
npm install axios
# or
yarn add axios
```

### 2. 환경 변수 설정

`.env.local` 파일에 API URL을 설정합니다:

```env
NEXT_PUBLIC_API_URL=http://localhost:5003
```

### 3. 사용 예시

#### 기본 사용법

```typescript
import { authService, clubService, classService } from "@/services";

// 로그인
const response = await authService.login("user@example.com", "password123");
console.log(response.user);

// 클럽 목록 조회
const clubs = await clubService.getClubs();
console.log(clubs);

// 수업 등록
await classService.enrollClass(classId, memberId, productId);
```

#### 통합 서비스 객체 사용

```typescript
import { services } from "@/services";

const user = await services.auth.login(email, password);
const clubs = await services.club.getMyClubs();
const classes = await services.class.getClasses(clubId);
```

## 📚 API 서비스 가이드

### 1. Auth Service (인증)

**주요 기능**:

- 로그인/회원가입
- 토큰 관리 (자동 갱신)
- 사용자 프로필 조회/수정
- 비밀번호 변경

**사용 예시**:

```typescript
import { authService } from "@/services";

// 로그인
const { user, accessToken } = await authService.login(
  "user@example.com",
  "password123",
);

// 회원가입
const response = await authService.register({
  email: "user@example.com",
  password: "password123",
  phone: "010-1234-5678",
  userType: UserType.PARENT,
  name: "홍길동",
});

// 현재 사용자 정보 가져오기
const currentUser = authService.getCurrentUser();

// 로그인 여부 확인
const isLoggedIn = authService.isAuthenticated();

// 로그아웃
authService.logout();

// 프로필 조회 (API 호출)
const profile = await authService.getProfile();

// 프로필 수정
const updatedUser = await authService.updateProfile({
  name: "김철수",
  phone: "010-9876-5432",
});

// 비밀번호 변경
await authService.changePassword("current_password", "new_password");
```

---

### 2. Club Service (클럽 관리)

**주요 기능**:

- 클럽 조회/생성/수정
- 클럽 가입 (초대 코드)
- 멤버 관리 및 승인
- 대량 멤버 승인

**사용 예시**:

```typescript
import { clubService, Status } from "@/services";

// 모든 클럽 조회
const clubs = await clubService.getClubs();

// 내가 속한 클럽 조회
const myClubs = await clubService.getMyClubs();

// 코치가 관리하는 클럽 조회
const managedClubs = await clubService.getManagedClubs();

// 단일 클럽 조회
const club = await clubService.getClub(clubId);

// 클럽 생성 (코치 전용)
const newClub = await clubService.createClub({
  clubName: "ACE Hockey Club",
  description: "어린이 아이스하키 클럽",
});

// 클럽 정보 수정 (코치 전용)
const updatedClub = await clubService.updateClub(clubId, {
  clubName: "ACE Hockey Club Pro",
});

// 클럽 가입 (초대 코드 사용)
const member = await clubService.joinClub("ACE-hockey", "김선수", 10);

// 멤버 목록 조회
const members = await clubService.getMembers(clubId);

// 승인 대기 중인 멤버 조회
const pendingMembers = await clubService.getPendingMembers(clubId);

// 승인된 멤버 조회
const approvedMembers = await clubService.getApprovedMembers(clubId);

// 멤버 승인 (코치 전용)
const approvedMember = await clubService.approveMember(memberId);

// 멤버 거절 (코치 전용)
const rejectedMember = await clubService.rejectMember(memberId);

// 대량 멤버 승인 (코치 전용)
const approvedMembers = await clubService.bulkApproveMembers([
  "member1",
  "member2",
  "member3",
]);

// 멤버 삭제 (코치 전용)
await clubService.deleteMember(memberId);
```

---

### 3. Class Service (수업 관리)

**주요 기능**:

- 수업 조회/생성/수정/삭제
- 수업 일정 관리
- 수업 상품(가격) 관리
- 수업 등록

**사용 예시**:

```typescript
import { classService } from "@/services";

// 클럽의 모든 수업 조회
const classes = await classService.getClasses(clubId);

// 단일 수업 조회 (일정 및 상품 포함)
const classData = await classService.getClass(classId);

// 수업 생성 (코치 전용)
const newClass = await classService.createClass(clubId, {
  className: "초급반",
  description: "4-7세 아이스하키 입문 과정",
  ageMin: 4,
  ageMax: 7,
  capacity: 20,
});

// 수업 정보 수정 (코치 전용)
const updatedClass = await classService.updateClass(classId, {
  capacity: 25,
});

// 수업 삭제 (코치 전용)
await classService.deleteClass(classId);

// 수업 일정 조회
const schedules = await classService.getClassSchedules(
  classId,
  "2024-01-01",
  "2024-01-31",
);

// 수업 일정 생성 (코치 전용)
const schedule = await classService.createClassSchedule(
  classId,
  "2024-01-15T10:00:00Z",
);

// 수업 일정 취소 (코치 전용)
const cancelledSchedule = await classService.cancelClassSchedule(scheduleId);

// 수업 상품 조회 (가격 정보)
const products = await classService.getClassProducts(classId);

// 수업 상품 생성 (코치 전용)
const product = await classService.createClassProduct(classId, {
  productName: "주 2회 (월 8회)",
  price: 240000,
  sessionsPerMonth: 8,
  description: "월수 오후 5시",
});

// 수업 상품 수정 (코치 전용)
const updatedProduct = await classService.updateClassProduct(productId, {
  price: 250000,
});

// 수업 등록 (결제 필요)
const result = await classService.enrollClass(classId, memberId, productId);
console.log(result.message); // "수업이 등록되었습니다."

// 내가 등록한 수업 조회
const myEnrolledClasses = await classService.getMyEnrolledClasses();
```

---

### 4. Payment Service (결제)

**주요 기능**:

- 결제 생성 (KG이니시스)
- 결제 검증
- 결제 이력 조회
- 결제 취소 (환불)
- 결제 통계

**사용 예시**:

```typescript
import { paymentService } from "@/services";

// 결제 생성 (KG이니시스 결제 페이지로 리다이렉트)
const result = await paymentService.createPayment({
  memberId: "member123",
  productId: "product456",
  amount: 240000,
  returnUrl: "https://teamplus.com/payment/success",
  cancelUrl: "https://teamplus.com/payment/cancel",
});

if (result.success && result.redirectUrl) {
  window.location.href = result.redirectUrl; // 결제 페이지로 이동
}

// 결제 검증 (KG이니시스 콜백 후)
const verifyResult = await paymentService.verifyPayment(tid, orderNumber);

// 단일 결제 조회
const payment = await paymentService.getPayment(paymentId);

// 주문 번호로 결제 조회
const paymentByOrder =
  await paymentService.getPaymentByOrderNumber(orderNumber);

// 내 결제 이력 조회
const myPayments = await paymentService.getMyPaymentHistory({
  startDate: "2024-01-01",
  endDate: "2024-01-31",
  status: Status.COMPLETED,
});

// 사용자 결제 이력 조회 (관리자)
const userPayments = await paymentService.getPaymentHistory(userId);

// 멤버별 결제 이력 조회
const memberPayments = await paymentService.getPaymentHistoryByMember(memberId);

// 클럽별 결제 이력 조회 (코치/관리자)
const clubPayments = await paymentService.getPaymentHistoryByClub(clubId);

// 결제 취소 (환불)
const cancelledPayment = await paymentService.cancelPayment(
  paymentId,
  "고객 요청에 의한 환불",
);

// 결제 통계 조회 (관리자/코치)
const stats = await paymentService.getPaymentStatistics(
  clubId,
  "2024-01-01",
  "2024-01-31",
);
console.log(`총 결제 금액: ₩${stats.totalAmount.toLocaleString()}`);
console.log(`평균 결제 금액: ₩${stats.averageAmount.toLocaleString()}`);
```

---

### 5. Attendance Service (출석)

**주요 기능**:

- 출석 체크인 (QR 코드)
- 출석 이력 조회
- 크레딧 관리
- 출석 통계

**사용 예시**:

```typescript
import { attendanceService, Status } from "@/services";

// 출석 체크인 (QR 코드 스캔)
const attendance = await attendanceService.checkIn(
  scheduleId,
  memberId,
  qrCodeData,
);
console.log("출석이 확인되었습니다.");

// 출석 이력 조회 (필터)
const attendances = await attendanceService.getAttendanceHistory({
  memberId: "member123",
  startDate: "2024-01-01",
  endDate: "2024-01-31",
  status: Status.PRESENT,
});

// 멤버별 출석 이력 조회
const memberAttendances = await attendanceService.getAttendanceByMember(
  memberId,
  "2024-01-01",
  "2024-01-31",
);

// 수업 일정별 출석 조회 (코치)
const scheduleAttendances =
  await attendanceService.getAttendanceBySchedule(scheduleId);

// 단일 출석 조회
const attendance = await attendanceService.getAttendance(attendanceId);

// 출석 상태 수정 (코치 전용)
const updatedAttendance = await attendanceService.updateAttendanceStatus(
  attendanceId,
  Status.ABSENT,
);

// 출석 취소 (코치 전용)
const cancelledAttendance =
  await attendanceService.cancelAttendance(attendanceId);

// 멤버 크레딧 조회
const credit = await attendanceService.getMemberCredit(memberId);
console.log(`잔여 크레딧: ${credit.remainingCredits}회`);
console.log(`만료일: ${new Date(credit.expiresAt).toLocaleDateString()}`);

// 모든 멤버 크레딧 조회 (코치/관리자)
const allCredits = await attendanceService.getAllMemberCredits(clubId);

// 출석 통계 조회 (멤버별)
const stats = await attendanceService.getAttendanceStatistics(
  memberId,
  "2024-01-01",
  "2024-01-31",
);
console.log(`출석률: ${stats.attendanceRate}%`);
console.log(`출석: ${stats.presentCount}회`);
console.log(`결석: ${stats.absentCount}회`);

// 클럽별 출석 통계 조회 (코치/관리자)
const clubStats = await attendanceService.getClubAttendanceStatistics(
  clubId,
  "2024-01-01",
  "2024-01-31",
);
console.log(`평균 출석률: ${clubStats.averageAttendanceRate}%`);
clubStats.memberStatistics.forEach((member) => {
  console.log(`${member.playerName}: ${member.attendanceRate}%`);
});
```

---

## 🔐 인증 및 토큰 관리

### JWT 자동 첨부

모든 API 요청에 JWT 토큰이 자동으로 첨부됩니다 (Interceptor).

```typescript
// 요청 헤더에 자동 추가됨
Authorization: Bearer<accessToken>;
```

### 토큰 갱신 (자동)

401 Unauthorized 응답 시 자동으로 토큰을 갱신합니다:

1. Refresh token으로 새 access token 발급
2. 실패한 요청 재시도
3. 갱신 실패 시 로그인 페이지로 리다이렉트

### 토큰 저장소

토큰은 `localStorage`에 저장됩니다:

```typescript
localStorage.getItem("teamplus_access_token");
localStorage.getItem("teamplus_refresh_token");
localStorage.getItem("teamplus_user"); // 사용자 정보 (JSON)
```

---

## ⚠️ 에러 핸들링

### 자동 에러 처리

API 클라이언트는 다음 에러를 자동으로 처리합니다:

- **401 Unauthorized**: 토큰 갱신 시도 → 실패 시 로그인 페이지 리다이렉트
- **403 Forbidden**: "접근 권한이 없습니다." 경고
- **404 Not Found**: "리소스를 찾을 수 없습니다." 로그
- **500 Internal Server Error**: "서버 오류가 발생했습니다." 경고
- **Network Error**: "네트워크 연결을 확인해주세요." 경고

### 수동 에러 처리

서비스별로 구체적인 에러 메시지를 제공합니다:

```typescript
try {
  const user = await authService.login(email, password);
} catch (error: any) {
  console.error(error.message);
  // "로그인에 실패했습니다. 이메일과 비밀번호를 확인해주세요."
}
```

### 에러 응답 타입

```typescript
interface ApiError {
  success: false;
  error: {
    code: string; // ErrorCode enum
    message: string;
    details?: any;
  };
}
```

---

## 🔧 고급 사용법

### API 클라이언트 직접 사용

```typescript
import { api } from "@/services";

// GET 요청
const data = await api.get<User>("/users/me");

// POST 요청
const newUser = await api.post<User>("/users", { name: "John" });

// PUT 요청
const updatedUser = await api.put<User>("/users/123", { name: "Jane" });

// PATCH 요청
const patchedUser = await api.patch<User>("/users/123", { name: "Jane" });

// DELETE 요청
await api.delete("/users/123");
```

### Axios 인스턴스 직접 사용

```typescript
import apiClient from "@/services";

const response = await apiClient.get("/custom-endpoint");
console.log(response.data);
```

### 토큰 수동 관리

```typescript
import { setTokens, clearTokens, getAccessToken } from "@/services";

// 토큰 저장
setTokens("access_token_here", "refresh_token_here");

// 토큰 가져오기
const token = getAccessToken();

// 토큰 삭제
clearTokens();
```

---

## 📝 타입 정의

모든 타입은 `/src/types/index.ts`에 정의되어 있습니다.

**주요 타입**:

- `User`, `UserType`
- `Club`, `TeamMember`
- `Class`, `ClassSchedule`, `ClassProduct`
- `Payment`, `PaymentResult`
- `Attendance`, `MemberCredit`
- `ApiResponse<T>`, `ApiError`
- `PaginatedResponse<T>`, `PaginationParams`
- `ErrorCode`

**사용 예시**:

```typescript
import type { User, Club, Payment, ErrorCode } from '@/services';

const user: User = { ... };
const club: Club = { ... };
```

---

## 🎯 개발 환경 설정

### 환경 변수

`.env.local` 파일에 다음을 설정합니다:

```env
# API URL
NEXT_PUBLIC_API_URL=http://localhost:5003

# 개발 모드 (디버그 로그 활성화)
NODE_ENV=development
```

### 디버그 로그

개발 환경(`NODE_ENV=development`)에서는 모든 API 요청/응답이 콘솔에 출력됩니다:

```
[API Request] GET /clubs
[API Response] /clubs { data: [...] }
[API Error] { url: '/clubs', method: 'GET', status: 404, ... }
```

---

## 🧪 테스트

### 서비스 테스트 예시

```typescript
import { authService } from "@/services";

describe("Auth Service", () => {
  it("should login successfully", async () => {
    const response = await authService.login("test@test.com", "password");
    expect(response.user).toBeDefined();
    expect(response.accessToken).toBeDefined();
  });

  it("should throw error on invalid credentials", async () => {
    await expect(authService.login("wrong@test.com", "wrong")).rejects.toThrow(
      "로그인에 실패했습니다",
    );
  });
});
```

---

## 📚 참고 자료

- **Axios 문서**: https://axios-http.com/
- **TypeScript 문서**: https://www.typescriptlang.org/
- **TEAMPLUS PRD**: `/docs/PRD.md`
- **TEAMPLUS PLAN**: `/docs/PLAN.md`

---

## 🚀 다음 단계

1. **React 컴포넌트에서 사용하기**

   ```typescript
   import { useEffect, useState } from 'react';
   import { clubService, Club } from '@/services';

   function ClubList() {
     const [clubs, setClubs] = useState<Club[]>([]);

     useEffect(() => {
       const fetchClubs = async () => {
         const data = await clubService.getClubs();
         setClubs(data);
       };
       fetchClubs();
     }, []);

     return (
       <div>
         {clubs.map((club) => (
           <div key={club.id}>{club.clubName}</div>
         ))}
       </div>
     );
   }
   ```

2. **React Query 통합 (추천)**

   ```typescript
   import { useQuery } from "@tanstack/react-query";
   import { clubService } from "@/services";

   function useClubs() {
     return useQuery({
       queryKey: ["clubs"],
       queryFn: () => clubService.getClubs(),
     });
   }
   ```

3. **Context API/Zustand로 전역 상태 관리**

   ```typescript
   import { create } from "zustand";
   import { User } from "@/services";

   interface AuthStore {
     user: User | null;
     setUser: (user: User | null) => void;
   }

   export const useAuthStore = create<AuthStore>((set) => ({
     user: null,
     setUser: (user) => set({ user }),
   }));
   ```

---

**마지막 업데이트**: 2026-01-04
**버전**: 1.0
**작성자**: Claude Code
