# SSL Certificate Pinning — 인증서 배치 가이드

## 개요

TEAMPLUS 앱은 MITM 공격 차단을 위해 SSL Certificate Pinning을 구현합니다.
`lib/core/security/ssl_pinning_service.dart`가 인증서를 로드하며, 인증서가 없거나
플레이스홀더인 경우 **경고 로그 후 Pinning 없이 앱을 정상 실행**합니다.

## 인증서 파일 배치

| 환경              | 파일 경로                | 비고                             |
| ----------------- | ------------------------ | -------------------------------- |
| 개발(DEBUG)       | `dev/teamplus_dev.pem`   | Pinning 자동 비활성 (kDebugMode) |
| 프로덕션(RELEASE) | `prod/teamplus_prod.pem` | **실제 인증서 필수**             |

## 인증서 획득 방법

```bash
# 서버 인증서 추출 (openssl 사용)
openssl s_client -connect 211.236.174.230:5003 -showcerts </dev/null 2>/dev/null \
  | openssl x509 -outform PEM > assets/certificates/prod/teamplus_prod.pem

# 개발 서버 (선택)
openssl s_client -connect 211.236.174.115:5003 -showcerts </dev/null 2>/dev/null \
  | openssl x509 -outform PEM > assets/certificates/dev/teamplus_dev.pem
```

## 활성화 절차

1. 위 명령어로 실제 인증서 파일 생성
2. 파일 내용 확인: `cat prod/teamplus_prod.pem` (반드시 `-----BEGIN CERTIFICATE-----`로 시작)
3. `flutter pub get && flutter run --release`로 Pinning 활성화 확인
4. 로그에서 `[SSL Pinning] 인증서 로드 완료` 확인

## 현재 상태

- `dev/teamplus_dev.pem`: 플레이스홀더 (개발 모드에서는 Pinning 비활성이므로 무관)
- `prod/teamplus_prod.pem`: 플레이스홀더 → **Phase 7 배포 전 실제 인증서로 교체 필수**

## 주의사항

- 인증서 갱신 시 앱 업데이트 필요 (Let's Encrypt 90일 만료 주의)
- `.gitignore`에 실제 인증서를 추가하지 말 것 — `assets/` 폴더는 앱 번들에 포함
- 인증서 없이 릴리즈 빌드 시 `[SSL Pinning] 유효한 인증서가 없음` 경고가 출력되며 앱은 정상 동작
