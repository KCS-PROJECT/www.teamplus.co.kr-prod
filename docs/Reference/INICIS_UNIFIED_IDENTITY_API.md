# KG이니시스 통합인증서비스 연동 규격

> **출처**: <https://manual.inicis.com/sa/auth.html> · 공식 샘플 `SaSample.zip` (JSP/PHP) 원문 대조 2026-09-18
> **적용 대상**: 회원가입 본인인증 (PARENT / DIRECTOR / ACADEMY_DIRECTOR 강제 인증)
> **현재 상태**: 포트원(PortOne) 테스트 채널 경유 → KG 직계약 전환 예정
> **기술문의**: `ts@kggroup.co.kr` · **계약/키 발급**: `pdev@kggroup.co.kr`

---

## 1. 연동 준비물

| 항목 | 값 / 확인처 |
| --- | --- |
| `mid` | 상점아이디. 계약 완료 시 발급 (`CIC` 로 시작) |
| `apikey` | 대칭키. 계약 시 안내 |
| SEED IV | **상점별 발급값** — 계약 시 KG 가 "SEED" 라는 이름으로 함께 준다. 공식 샘플의 `SASKGINICIS00000` 은 테스트 MID(`INIiasTest`)의 짝이며, MID 와 IV 는 같은 쪽 짝을 써야 한다 |

세 값(`mid` · `apikey` · SEED IV)은 **`.env` 가 유일한 출처**다. 코드 폴백을 두지 않아 `.env` 로딩 실패가 테스트 키로 위장되지 않으며, 하나라도 비면 Gateway 가 인증 요청 시점에 `INICIS_CREDENTIALS_NOT_CONFIGURED` 로 거부한다(부팅은 막지 않는다).
| 샘플 코드 | `manual.inicis.com` → 샘플 다운로드 (MID + 상점 비밀번호 로그인 필요). JSP·PHP 2종, KISA_SEED_CBC 구현 포함 |

**공식 샘플의 테스트 계정** — 샘플 코드에 그대로 들어 있어 계약 전 연동 검증에 쓸 수 있다.

```
mid    = INIiasTest
apiKey = TGdxb2l3enJDWFRTbTgvREU3MGYwUT09
```

**방화벽 (OUTBOUND 허용 필요)**

| 항목 | 값 |
| --- | --- |
| 도메인 | `fcsa.inicis.com` · `kssa.inicis.com` |
| IP | `118.129.210.217` · `183.109.71.217` |
| 포트 | 443 |
| 프로토콜 | TLS 1.2 이상 |

---

## 2. 서비스 구분 (`reqSvcCd`) — 제공 필드가 다르다

| 코드 | 서비스 | 제공 필드 |
| --- | --- | --- |
| `01` | 간편인증 | `userName` · `userPhone` · `userBirthday` · `userCi` |
| `02` | 전자서명 | 위 + `signedData` (`identifier` 파라미터 필수) |
| `03` | **본인확인** | 위 + **`userDi` · `userCi2` · `userGender` · `isForeign`** |

**DI 가 필요하면 `reqSvcCd=03` 이어야 한다.** 매뉴얼 원문: "`userDi` / `userCi2` / `userGender` / `isForeign` 는 본인확인의 경우에만 제공". 요청 URL 도 `03` 만 다르다.

카카오 인증은 CI 가 "제한적 제공"이므로 CI 부재 케이스를 정상 흐름으로 다뤄야 한다.

---

## 3. 전체 흐름

```
STEP1  가맹점 → KG    인증창 호출 (폼 POST, 브라우저)
STEP2  KG → 가맹점    successUrl / failUrl 로 결과 수신 (폼 POST, 브라우저)
                      → authRequestUrl · txId · token 취득
STEP3  가맹점 → KG    결과조회 (JSON POST, SERVER to SERVER)
STEP4  KG → 가맹점    개인정보 수신 (SEED 암호문)
                      → token 으로 복호화
```

- 통합인증 서비스는 **반드시 HTTPS** 로 통신한다.
- 인증창 호출은 **팝업이 기본**(최적 400 × 640).
- **앱 내 웹뷰는 팝업 제한이 있으므로 페이지 전환 방식으로 연동**한다 (매뉴얼 명시).

---

## 4. STEP1 — 통합인증 요청

**요청 URL**

| 서비스 | URL |
| --- | --- |
| 간편인증 · 전자서명 | `https://sa.inicis.com/auth` |
| 본인확인 | `https://sa.inicis.com/id/auth` |

`Method: POST` · `Content-Type: application/x-www-form-urlencoded;charset=utf-8`

**파라미터** (`*` = 필수)

| 파라미터 | 설명 | 크기 |
| --- | --- | --- |
| `mid`* | 상점아이디 | 10 byte |
| `reqSvcCd`* | `01` 간편인증 / `02` 전자서명 / `03` 본인확인 | 2 byte |
| `mTxId`* | 가맹점 트랜잭션 ID. 요청마다 유일값 | 20 byte |
| `successUrl`* | 인증성공 결과수신 URL | 128 byte |
| `failUrl`* | 인증실패 결과수신 URL | 128 byte |
| `authHash`* | `SHA256(mid + mTxId + apikey)` | hash |
| `flgFixedUser`* | 특정 사용자 지정 여부 `Y` / `N` | 1 byte |
| `reservedMsg`* | **`isUseToken=Y` 고정** | 40 byte |
| `identifier` | 서명할 내용. `reqSvcCd=02` 일 때만 필수. `/ ' < >` 사용불가 | - |
| `DI_CODE` | 웹사이트 코드 (DI 생성에 사용). 본인확인 선택사항 | 12 byte |
| `userName` | `flgFixedUser=Y` 일 때 필수 | 25 byte |
| `userPhone` | `flgFixedUser=Y` 일 때 필수 | 11 byte |
| `userBirth` | `YYYYMMDD`. `flgFixedUser=Y` 일 때 필수 | 8 byte |
| `userHash` | `SHA256(userName + mid + userPhone + mTxId + userBirth + reqSvcCd)`. `flgFixedUser=Y` 일 때 필수 | hash |
| `directAgency` | 특정 제휴사만 노출 (제휴사코드) | - |
| `logoUrl` | 로고 이미지 전체 도메인주소 (164 × 28) | - |

**해시 규칙** — 두 해시 모두 SHA256, **소문자 hex**.

```
authHash = SHA256(mid + mTxId + apikey)
userHash = SHA256(userName + mid + userPhone + mTxId + userBirth + reqSvcCd)
```

---

## 5. STEP2 — 통합인증 응답

`successUrl` / `failUrl` 로 **브라우저 폼 POST** 수신.

| 파라미터 | 설명 | 크기 |
| --- | --- | --- |
| `resultCode` | `0000` 성공, 이외 실패 | 4 byte |
| `resultMsg` | 결과메시지 (UTF-8 urlEncoding) | 500 byte |
| `authRequestUrl` | 결과조회 요청 URL. **이니시스 제공 URL 이 맞는지 필수 검증** | 200 byte |
| `txId` | 통합인증 트랜잭션 ID | 40 byte |
| `token` | `reservedMsg=isUseToken=Y` 일 때만 전달. Base64 | - |

`resultCode` 가 `0000` 이 아니면 `resultCode` · `resultMsg` 외의 값은 오지 않을 수 있다.

**`authRequestUrl` 검증** — 공식 샘플이 필수 사항으로 표시한 항목이다. 검증 없이 호출하면 SSRF 가 된다.

```java
// JSP 샘플
if (authRequestUrl.startsWith("https://kssa.inicis.com")
 || authRequestUrl.startsWith("https://fcsa.inicis.com")) { ... }
```

> PHP 샘플은 같은 검증을 `strpos(...) == 0` 으로 작성했는데, `strpos` 가 미발견 시 `false` 를 반환해 `== 0` 이 참이 되므로 그대로 옮기면 검증이 무력화된다. JSP 샘플처럼 **prefix 일치**로 구현한다.

---

## 6. STEP3 — 결과조회 요청 (SERVER to SERVER)

- **요청 URL**: STEP2 에서 받은 `authRequestUrl` (검증 후 사용)
- `Method: POST` · `Content-Type: application/json;charset=utf-8` · `Accept: application/json`
- **HTTPS 필수**, 매뉴얼 권고 타임아웃 5초 (샘플의 connect timeout 은 10초)

| 파라미터 | 설명 |
| --- | --- |
| `mid`* | 상점아이디 |
| `txId`* | STEP2 에서 받은 통합인증 트랜잭션 ID |

```json
{ "mid": "INIiasTest", "txId": "<STEP2 txId>" }
```

---

## 7. STEP4 — 결과조회 응답

| 파라미터 | 설명 | SEED 암호화 |
| --- | --- | --- |
| `resultCode`* | `0000` 성공 | - |
| `resultMsg`* | 결과메시지 (UTF-8 urlEncoding) | - |
| `txId` | 통합인증 트랜잭션 ID | - |
| `mTxId` | 요청 시 보낸 가맹점 트랜잭션 ID | - |
| `svcCd` | 요청구분코드 | - |
| `providerDevCd` | 제휴사코드 | - |
| `userName` | 사용자 이름 | O |
| `userPhone` | 사용자 전화번호 | O |
| `userBirthday` | 생년월일 | O |
| `userCi` | CI. 카카오는 제한적 제공 | O |
| `userDi` | DI. **본인확인만** | O |
| `userCi2` | CI2. **본인확인만** | O |
| `userGender` | `M` / `F`. **본인확인만** | O |
| `isForeign` | `0` 내국인 / `1` 외국인. **본인확인만** | O |
| `signedData` | 서명데이터. 전자서명만 (복호화 결과 Base64) | O |

---

## 8. SEED 복호화

**규격**: `SEED / CBC / PKCS5Padding`

| 항목 | 값 |
| --- | --- |
| KEY | STEP2 응답의 `token` 을 **Base64 Decoding 한 16 byte** |
| IV | 상점별 발급값 16 byte — `.env` 의 `INICIS_IDENTITY_SEED_IV`. 테스트 MID 는 `SASKGINICIS00000`, 운영은 KG 발급 "SEED" 값 |
| 대상 | 암호화 대상 필드는 Base64 문자열로 오므로 디코딩 후 복호화한다 |

공식 샘플은 JSP·PHP 모두 KISA_SEED_CBC 구현을 동봉하며, 다른 언어 구현체는 <https://seed.kisa.or.kr> 에서 제공된다.

### Node.js 구현 (검증 완료)

Node 22.18 / OpenSSL 3.0.16 기준, 표준 `crypto` 에 `seed-cbc` 가 **기본 제공되지 않는다**(`getCiphers()` 결과 없음). `--openssl-legacy-provider` 플래그를 주면 `seed` · `seed-cbc` · `seed-cfb` · `seed-ecb` · `seed-ofb` 가 노출된다. 샘플과 동일한 키·IV 구성으로 한글 평문 왕복이 정상 동작하는 것을 확인했다.

```js
// node --openssl-legacy-provider
const key = Buffer.from(token, "base64");                              // 16 byte, 건별 token
const iv = Buffer.from(process.env.INICIS_IDENTITY_SEED_IV, "utf8");  // 16 byte, 상점별 발급값
const d = crypto.createDecipheriv("seed-cbc", key, iv); // PKCS5 = 기본 패딩
const plain = Buffer.concat([
  d.update(Buffer.from(field, "base64")),
  d.final(),
]).toString("utf8");
```

**적용 시 필요한 변경**: `ecosystem.config.cjs` 의 `node_args` 에 `--openssl-legacy-provider` 추가 (dev · prod 양쪽).
플래그 사용이 어려우면 npm `kisa-seed`(TypeScript 구현, MIT) 등 순수 JS 구현이 대안이다.

---

## 9. 제휴사 코드

| 코드 | 제휴사 | 간편인증 | 전자서명 | 본인확인 |
| --- | --- | --- | --- | --- |
| `PASS` | 패스 (통신사) | O | O | - |
| `TOSS` | 토스 | O | O | O |
| `KFTC` | 금융결제원 | O | O | O |
| `KAKAO` | 카카오 | O | O | - |
| `NAVER` | 네이버 | O | O | - |
| `SAMSUNG` | 삼성패스 | O | O | - |
| `SHINHAN` | 신한은행 | O | O | O |
| `KB` | 국민은행 | O | O | O |
| `HANA` | 하나은행 | O | O | O |
| `WOORI` | 우리은행 | O | O | O |
| `NH` | 농협은행 | O | O | - |
| `KAKAOBANK` | 카카오뱅크 | O | O | O |
| `IBK` | 기업은행 | O | O | O |
| `SMS` | 휴대폰 인증 | O | - | O (별도 제휴) |

`directAgency` 에 코드를 지정하면 해당 제휴사만 노출된다.

---

## 10. 위변조 대비 — 최초 요청자 일치 확인

공식 샘플이 두 곳(`request`·`success`)에 주석으로 강조하는 항목이다.

1. STEP1 에서 `flgFixedUser=Y` + `userName` / `userPhone` / `userBirth` / `userHash` 를 지정해 **가맹점이 아는 사용자로 고정**한다.
2. STEP4 복호화 결과를 **가맹점 세션 또는 DB 의 최초 요청자 정보(이름 · 휴대폰 · 생년월일 · 보유 CI)와 대조**한 뒤에만 인증 성공으로 처리한다.

TEAMPLUS 적용 시: `IdentityVerification` 레코드(`requestId` · `clientIp` · 요청 시 입력값)와 STEP4 결과를 대조하는 단계를 `processCallback` 에 둔다. 회원가입 단계의 이름 대조(`auth.service.ts`)는 그 다음 방어선이다.

---

## 11. TEAMPLUS 현재 구현과의 차이

현재 운영 경로는 포트원 테스트 채널 경유이고, `kg-inicis-identity.gateway.ts` 는 실연동된 적이 없다.

| 항목 | 현재 코드 | 실제 규격 |
| --- | --- | --- |
| 요청 URL | `testpg.inicis.com/auth/auth` | `sa.inicis.com/id/auth` (본인확인) |
| `reqSvcCd` | `"Auth"` | `"03"` |
| 리턴 URL | `returnUrl` / `closeUrl` | `successUrl` / `failUrl` |
| 서명 | `HMAC-SHA256(merchantKey, 정렬결합)` | `SHA256(mid + mTxId + apikey)` |
| `userHash` | 없음 | `flgFixedUser=Y` 시 필수 |
| `reservedMsg` | 없음 | `isUseToken=Y` 필수 |
| 결과 취득 | 콜백 1-step | 4-step (서버-서버 결과조회) |
| 복호화 | AES-256-CBC (merchantKey slice) | SEED/CBC/PKCS5 (token 기반 key) |
| 설정 키 | `storeId` / `merchantKey` / `serviceId` | `mid` / `apikey` / `seediv` |

**변경 대상**

| 파일 | 작업 |
| --- | --- |
| `identity/gateways/kg-inicis-identity.gateway.ts` | 재작성 (4-step · SHA256 해시 2종 · SEED 복호화 · `authRequestUrl` 검증) |
| `identity/identity.controller.ts` | `successUrl` / `failUrl` 수신 엔드포인트 신설 (폼 POST → 리다이렉트 응답) |
| `config/identity.config.ts` · `.env` | `mid` / `apikey` / `seediv` 로 정리 |
| `teamplus-backend/ecosystem.config.cjs` | `node_args` 에 `--openssl-legacy-provider` |
| `components/identity/IdentityVerifyInput.tsx` | PortOne SDK 호출 → 폼 POST |
| `app/identity/callback/page.tsx` · `services/identity.ts` | KG 결과 수신 흐름으로 교체 |
| 인프라 | 운영 서버 OUTBOUND 방화벽 허용 |

**변경 불필요**

- `identity_verifications` 스키마 (`provider` 값만 `kg_inicis`)
- `identity.service.ts` 공통 흐름 (`authHtml` 로 자동 submit 폼 전달 가능)
- `auth.service.ts` 회원가입 로직 (`requestId` 계약 유지)
- CSP — `*.inicis.com` 이 `script-src` · `frame-src` · `form-action` · `connect-src` 에 등록됨
- Flutter 앱 — 도메인 화이트리스트 없이 http(s) 허용

---

## 12. 미확인 항목

| 항목 | 확인처 |
| --- | --- |
| 계약 서비스 범위에 본인확인(`03`) 포함 여부 | 계약 담당자 — 미포함이면 DI 를 받을 수 없다 |
| 운영 SEED IV — 계약 시 KG 가 "SEED" 값으로 발급함(해소). 운영 `.env` 의 `INICIS_IDENTITY_SEED_IV` 에 설정 · 16 byte 여부만 확인 | 발급 완료 |
| 오류 `resultCode` 목록 | 연동정의서 (샘플에는 없음) |
| 웹뷰 페이지 전환 방식의 PASS 앱 전환 동작 | 실기기 검증 필요. 앱 `webview_screen_url_handlers.dart` 의 외부 스킴 목록에 통신사 PASS 스킴 미등록 |

테스트 MID(`INIiasTest`)가 샘플에 포함되어 있으므로, 계약 MID 없이도 STEP1~4 연동 검증은 착수할 수 있다.
