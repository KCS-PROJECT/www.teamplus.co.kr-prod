# Shared Resources

Flutter와 Next.js 간 공유되는 리소스들입니다.

## 디렉토리 구조

```
shared/
├── assets/           # 공통 에셋 파일
│   ├── images/       # 이미지 파일
│   ├── svg/          # SVG 파일
│   └── fonts/        # 폰트 파일
└── types/            # TypeScript 타입 정의
    ├── api.ts        # API 관련 타입
    ├── identity.ts   # 본인인증 관련 타입
    └── index.ts      # 타입 인덱스
```

## 사용법

### Next.js에서 사용

```typescript
// tsconfig.json에 path alias 설정됨
import { UserType, ApiResponse } from '@shared/types';
import { IdentityProvider, IdentityInitiateResult } from '@shared/types/identity';
```

### Flutter에서 참조

Flutter는 Dart 타입 시스템을 사용하므로, TypeScript 타입을 직접 import할 수 없습니다.
대신 `lib/core/identity/identity_service.dart` 등에서 동일한 구조로 Dart 타입을 정의합니다.

## 타입 동기화 규칙

1. **API 타입 변경 시**: `shared/types/`의 TypeScript 타입과 Flutter의 Dart 타입을 동시에 업데이트
2. **새 enum 추가 시**: 양쪽에 동일한 값으로 정의
3. **필드명 규칙**: TypeScript는 camelCase, Dart도 camelCase 사용
