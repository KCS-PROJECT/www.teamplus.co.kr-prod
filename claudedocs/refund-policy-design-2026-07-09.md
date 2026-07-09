# 수업 결제 환불 정책 설계 (2026-07-09 확정)

> **상태**: 1단계 구현 완료 · **2단계 설계 확정 대기(본 문서가 SoT)**
> **발단**: 장보고 사례 — 7/8 결제(14:40) → 학부모 버튼 출석(14:47, 크레딧 차감) → 수업 상세 셀프
> 결제취소로 **전액 환불(16:16) 통과**. 이용 여부 검증이 전무했음.

---

## 1. 확정 정책 (사용자 합의 2026-07-09)

**"개시 전 셀프 전액환불 / 개시 후 감독·관리자 승인 부분환불" 2단계 구조.**

### 이용 개시 판정 (SoT)

해당 수강(Enrollment)의 자녀가 **결제일(KST 달력일) 이후 일정에 `present` 출석 ≥ 1회**면 "개시".

- 결제일 **이전** 일정의 출석(과거 재수강분)은 이 결제의 사용분이 아니므로 제외 — 재결제 직후 취소가 과거 출석으로 오차단되지 않게 함.
- 노쇼(일정 경과·미출석)는 소진으로 보지 않음 — 분쟁 여지 커서 초기엔 출석 기준만. 필요 시 "첫 일정 경과" 기준으로 강화 가능(미결 §6-1).

### 상품 유형별 규칙

| 유형 | 개시 전 | 개시 후 |
|---|---|---|
| 정기권 (MONTHLY_FIXED, 선불) | 학부모 셀프 결제취소 = 전액 환불 | 셀프 차단(1단계 ✅) → 감독/관리자 승인 부분환불(2단계) |
| 회차권 (크레딧) | **비환불** (enrollment SoT 재설계 v2 기확정) — 셀프 취소 진입점 미노출 | 동일 |
| 후불 (POSTPAID) | 환불 개념 없음 — "신청취소(수강 종료)"만. 기출석분은 월말 정산 청구 유지 | 동일 |
| 무료/0원 | 취소만 | — |

---

## 2. 1단계 구현 내역 (2026-07-09 완료 — 참조용)

| 위치 | 내용 |
|---|---|
| `payments/services/payment-refund.service.ts` → `assertEnrollmentNotUsed()` | 서버 최종 가드. `cancelPayment()` 초입(소유권·completed 검증 뒤, PG 호출 전)에서 호출. PARENT 셀프만 적용, `isAdminRole`·`trusted`는 우회 |
| 동일 파일 spec | 가드 4케이스 활성 테스트 (차단/통과/ADMIN 우회/비수강 결제 제외) |
| `classes/[id]/page.tsx` `handleCancelPayment` | 403 응답 시 모달("결제취소 불가")로 서버 사유 안내 |
| `messages.ts` | `enrollment.cancelBlockedTitle` |

- 거절 메시지: `이미 N회 출석한 수업의 결제는 앱에서 직접 취소할 수 없습니다. 환불은 감독에게 문의해주세요.`
- 판정 쿼리: `classAttendance.count({ memberId, attendanceStatus:'present', schedule:{ classId, scheduledDate:{ gte: instantToKstDateOnly(payment.completedAt ?? createdAt) } } })`
- 수강 미연결 결제(쇼핑몰·대회·픽업매치)는 `enrollment.findMany({ paymentId })` 빈 배열 → 가드 미적용.

---

## 3. 2단계 설계 — 감독/관리자 승인 부분환불

### 3-1. 환불액 산식

```
환불액 = 결제액 − (개시 판정과 동일 기준의 present 출석 회수 × 회당 단가)   (음수면 0)
```

**회당 단가 우선순위**:
1. 해당 수업의 `ClassProduct(feeType='PER_SESSION')` 단가 — 선불 수업에도 "1회 수업료"가 비판매(isActive:false) 참고용으로 보존되는 구조(`classes.service.ts buildClassProducts`)라 대부분 존재
2. 폴백: `결제액 ÷ 결제 상품의 sessionsPerMonth(패키지 총 회수)`

> ⚠️ `sessionsPerMonth` 는 컬럼명과 달리 **"패키지 총 회수"**(발급 크레딧 수량) — 월 회수 아님.
> 산정에 쓴 단가·회수·산식은 RefundLog 스냅샷으로 보존(§3-4).

### 3-2. API / 권한

- 현행 `POST /payments/:paymentId/cancel` 은 `@Roles("PARENT","ADMIN")` + 소유권 검증이
  `payment.userId === requester.id`(본인) 또는 `isAdminRole`(SYSTEM/OPER/ADMIN)뿐 —
  **DIRECTOR/COACH 는 타인 결제를 취소할 수 없음**. 감독 환불은 별도 경로 필요:
  - 신설 제안: `POST /payments/:paymentId/refund-by-manager` (`@Roles("DIRECTOR","ACADEMY_DIRECTOR","ADMIN")`)
  - 소유권 검증: 결제의 Enrollment.classId → Class.teamId/academyId 가 요청 감독의 관리
    범위(`resolveManagedTeamIds` / Academy.directorId)에 속하는지 확인
  - 내부적으로 `PaymentRefundService.cancelPayment(..., { trusted: true })` 재사용 —
    부분취소 배관(`cancelAmount` → KG `cancelAmount+totalAmount` / 토스 `cancelAmount`)은 **이미 존재**
- 응답에 산정 내역(출석 회수·단가·공제액·환불액) 포함 — 프론트 확인 화면과 동일 값.
- 사전 조회용 `GET /payments/:paymentId/refund-preview` (동일 권한) — 확정 전 산정 미리보기.

### 3-3. 크레딧 처리 (검증 필수)

- 현행 `$transaction` 은 "부분 환불 시 환불 비율에 따라 크레딧 **비례 복원**" 로직
  (`payment-refund.service.ts` 트랜잭션 내 `relatedCredits`) — **개시 후 환불의 의도와 다름**.
  개시 후 환불은 수강 종료이므로 **잔여 크레딧 전액 소멸(회수)** + CreditTransaction 기록이 맞음.
- 2단계에서 manager 환불 경로는 소멸 정책으로 분기하고, 기존 셀프 전액취소(개시 전)는
  현행 복원 로직 유지.
- Enrollment `refunded` 전환·출석 레코드 보존(감사·집계용)은 현행과 동일.

### 3-4. RefundLog 스냅샷

현행 RefundLog 는 `refundAmount·refundReason·processedAt` 뿐. 추가 검토:
`attendedCount`, `unitFee`, `deductedAmount`, `calculationNote`(산식 문자열), `approvedBy`.
컬럼 추가가 부담이면 `refundReason` 에 구조화 문자열로 병기하는 절충도 가능(비권장).

### 3-5. 프론트

- **감독**: `/director-payments`(결제관리) 결제 행에 [환불] 진입 → 산정 미리보기
  (출석 N회 · 공제 X원 · 환불 예정 Y원) → 확정. 버튼 라벨 "환불하기".
- **학부모**: 수업 상세의 결제취소 버튼 — 개시 후에는 서버 403 모달 안내(1단계 완료).
  2단계에서 enrollment 응답에 `usedAttendanceCount` 를 실어 버튼 자체를 "환불 문의" 안내로
  선치환하는 개선 가능(서버 가드는 그대로 최종 방어선).

### 3-6. 알림

환불 확정 시 학부모 알림(인앱 + 알림톡 검토): 수업명·공제 내역·환불액.

---

## 4. 약관 반영 (정식 서비스 전 — 버전 인상 부담 없음, pre-launch 메모리 참조)

환불 조항에 명시할 골자:

1. 이용 개시 전(출석 이력 없음): 앱에서 전액 결제취소 가능
2. 이용 개시 후: 앱 내 직접 취소 불가, 감독/운영자 승인 환불 — 결제액에서 이용분
   (출석 회수 × 회당 단가) 공제 후 환불
3. 회차권: 구매 후 환불 불가 (구매 화면 고지 병행)
4. 후불 수강: 신청취소 시에도 기출석분은 정산 청구
5. (참고) 사용분 공제 후 잔액 환불 구조는 소비자분쟁해결기준(체육/교습 계열)과 동일 방향

---

## 5. 함정 / 주의 (구현 시 필독)

- **가상계좌 환불**: `cancelPayment` 의 `refundBankCode/refundAccount/refundAccountHolder`
  파라미터 — 가상계좌 결제 환불 시 필수. 감독 환불 UI 에서 입력 케이스 고려.
- **부분취소 멱등성**: 같은 결제에 부분취소 반복 가능(`partially_refunded`) — 누적 환불액이
  결제액을 넘지 않도록 기환불 합산 검증 필요 (현행은 단건 금액만 검증).
- **BOTH 수업**: 선불 선택자만 결제취소 대상. 후불 선택자는 Enrollment 삭제(신청취소) 경로
  (`DELETE /enrollments/:id`)로 분리되어 있음 — 혼동 금지.
- **mock 결제 경로**: DEV mockPay 로 만든 결제도 동일 가드/산식 적용 확인 (mock 이 정책 진화
  누락 상습 — 정기권 월말 만료 정합화 사례).
- **출석 레코드는 환불 후에도 보존** — 출석이력 집계에 계속 포함됨. 상품 라벨(2026-07-09
  개선)로 활성 수강생 여부는 구분되나, 집계 제외가 필요해지면 별도 결정.

---

## 6. 미결 사항 (2단계 착수 시 결정)

1. **노쇼 처리**: 출석 기준 유지 vs 첫 일정 경과 시 개시 간주 — 현재는 출석 기준(관대안)
2. **위약금/수수료**: 사용분 공제 외 별도 취소 수수료 부과 여부 — 현재 없음 전제
3. **부분취소 반복 정책**: manager 환불 후 재환불 허용 여부
4. **크레딧 소멸 vs 비례 복원** 분기 확정 (§3-3)
5. RefundLog 스냅샷을 컬럼 추가로 할지 여부 (§3-4)

---

**관련**: `claudedocs/enrollment-sot-redesign-plan-v2.md`(회차권 비환불 확정) ·
`claudedocs/class-package-billing-redesign-analysis.md`(billingMode 3-mode) ·
약관 §13(정기권 달력 월말 만료)
