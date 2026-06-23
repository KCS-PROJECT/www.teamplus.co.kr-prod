# NestJS DI Doctor

NestJS의 의존성 주입(DI) 그래프를 **빌드/런타임 이전에** 정적 분석하여
`Nest can't resolve dependencies of the XxxService (?)` 같은 부팅 시점 에러를
사전에 차단하고 자동 수정하는 도구입니다.

## 해결하는 문제

```
Error: Nest can't resolve dependencies of the ViewCounterService (?).
Please make sure that the argument PrismaService at index [0] is
available in the ViewCounterModule context.
```

이런 에러는 TypeScript 컴파일에서는 잡히지 않고, 오직 NestJS 부팅 시점에만
발견됩니다. 프로젝트 규모가 커질수록 수동 DI 그래프 관리는 실수가 잦습니다.

DI Doctor는 `typescript` Compiler API로 AST를 파싱해:

1. 모든 `@Injectable()` 서비스의 **생성자 의존성**을 추출
2. 모든 `@Module()`의 **imports / providers / exports**를 인덱싱
3. 각 서비스가 속한 모듈의 **스코프에서 의존성이 해결 가능한지** 검증
   - 같은 모듈 내부 provider
   - 직접 `imports`한 모듈의 `exports`
   - `@Global()` 모듈의 `exports`
4. 해결 불가 시 어떤 모듈을 import 하면 되는지 **역추적해서 제안**
5. `--fix` 모드에서는 `imports: [...]`에 **자동으로 추가**

## 사용법

```bash
# 전체 검증 (CI에서도 사용 가능 — 문제 있으면 exit 1)
npm run di:verify

# 자동 수정 (로컬 개발 루프에서 사용)
npm run di:fix

# Claude Code 에이전트용 JSON 출력
npm run di:verify:json
```

### 출력 예시

**문제 발견 시**:

```
❌ [di-doctor] Found 1 DI issue(s):

  • ViewCounterModule  (src/common/view-counter/view-counter.module.ts)
      ViewCounterService → PrismaService  [unreachable]
      💡 add to imports: PrismaModule
```

**정상**:

```
✅ [di-doctor] No DI issues found.
```

### 자동 수정 동작

1. 감지된 각 문제마다 **누락된 import**를 해당 `.module.ts`에 주입:
   - ES `import { XxxModule } from "@/..."` 문 추가 (중복 방지)
   - `@Module({ imports: [...] })`의 배열에 `XxxModule` 삽입
2. 수정 후 **재검증**하여 모든 문제 해소 여부 확인
3. 해소 못 한 항목은 명확히 보고

## 아키텍처

```
di-doctor.ts
├── collectSourceFiles()       # src/**/*.ts 재귀 수집 (dist, node_modules 제외)
├── analyze()                  # AST 파싱 → Service/Module 인덱스 구축
│   ├── @Module 데코레이터     # imports/providers/exports/@Global 추출
│   └── @Injectable 데코레이터 # 생성자 파라미터 타입 추출
├── detectProblems()           # 각 서비스의 의존성 스코프 검증
│   ├── 같은 모듈 providers
│   ├── imports[].exports
│   └── @Global exports → globalScope
└── applyFixes()               # .module.ts 에 import 문 + imports 배열 편집
```

## 한계 & 설계 결정

| 제외                                      | 이유                                                             |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `forRoot()` / `forRootAsync()`            | 동적 모듈은 callee 이름으로 매핑 (XxxModule.forRoot → XxxModule) |
| `{ provide: TOKEN, useClass/useFactory }` | provide 키가 식별자인 경우만 처리                                |
| 서드파티 토큰 (Logger, ConfigService 등)  | `WHITELIST`에 등록하여 무시                                      |
| 인터페이스 기반 토큰 (`@Inject('TOKEN')`) | 문자열 토큰은 지원하지 않음 (추후 확장 가능)                     |
| 순환 참조 (`forwardRef()`)                | 감지 대상 아님                                                   |

## CI 연동

`.github/workflows/backend-ci.yml` (예시):

```yaml
- name: Verify NestJS DI graph
  run: npm run di:verify
  working-directory: teamplus-backend
```

## 언제 자동 호출되는가

Claude Code 환경에서는 `.claude/agents/nest-di-doctor.md` 에이전트가 등록되어
있어 다음 상황에서 자동으로 DI Doctor를 호출합니다:

- 새 NestJS 모듈/서비스를 생성한 직후
- `@Module()` / `@Injectable()` 데코레이터를 수정한 직후
- `Nest can't resolve dependencies` 에러 메시지가 관찰됐을 때

---

**작성일**: 2026-04-11
**관리**: `tools/di-doctor/di-doctor.ts`
