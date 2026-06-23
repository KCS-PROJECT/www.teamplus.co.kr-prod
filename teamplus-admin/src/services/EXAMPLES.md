# TEAMPLUS API Client - 실전 사용 예시

React 컴포넌트에서 API 서비스를 사용하는 실전 예시 모음입니다.

---

## 📋 목차

1. [기본 컴포넌트 예시](#1-기본-컴포넌트-예시)
2. [React Query 통합](#2-react-query-통합)
3. [Context API 전역 상태 관리](#3-context-api-전역-상태-관리)
4. [에러 처리 패턴](#4-에러-처리-패턴)
5. [로딩 상태 관리](#5-로딩-상태-관리)
6. [폼 처리](#6-폼-처리)
7. [페이지 예시](#7-페이지-예시)

---

## 1. 기본 컴포넌트 예시

### 로그인 컴포넌트

```typescript
// src/components/LoginForm.tsx
'use client';

import { useState } from 'react';
import { authService } from '@/services';
import { useRouter } from 'next/navigation';

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authService.login(email, password);
      console.log('로그인 성공:', response.user);

      // 대시보드로 리다이렉트
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || '로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          이메일
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mt-1 block w-full rounded-md border px-3 py-2"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          비밀번호
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="mt-1 block w-full rounded-md border px-3 py-2"
        />
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
      >
        {loading ? '로그인 중...' : '로그인하기'}
      </button>
    </form>
  );
}
```

---

### 클럽 목록 컴포넌트

```typescript
// src/components/ClubList.tsx
'use client';

import { useEffect, useState } from 'react';
import { clubService, Club } from '@/services';

export default function ClubList() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchClubs = async () => {
      try {
        const data = await clubService.getMyClubs();
        setClubs(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchClubs();
  }, []);

  if (loading) {
    return <div className="text-center py-8">데이터를 불러오는 중입니다...</div>;
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4 text-red-800">
        {error}
      </div>
    );
  }

  if (clubs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        등록된 클럽이 없습니다.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {clubs.map((club) => (
        <div
          key={club.id}
          className="rounded-lg border bg-white p-6 shadow-sm hover:shadow-md"
        >
          <h3 className="text-lg font-semibold">{club.clubName}</h3>
          <p className="mt-2 text-sm text-gray-600">
            클럽 코드: {club.clubCode}
          </p>
          {club.memberCount && (
            <p className="mt-1 text-sm text-gray-600">
              멤버 수: {club.memberCount}명
            </p>
          )}
          <button className="mt-4 rounded-md bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700">
            자세히 보기
          </button>
        </div>
      ))}
    </div>
  );
}
```

---

## 2. React Query 통합

### 설치

```bash
npm install @tanstack/react-query
```

### Query Provider 설정

```typescript
// src/app/providers.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

```typescript
// src/app/layout.tsx
import Providers from './providers';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

---

### Custom Hooks

```typescript
// src/hooks/useClubs.ts
import { useQuery } from '@tanstack/react-query';
import { clubService } from '@/services';

export function useClubs() {
  return useQuery({
    queryKey: ['clubs'],
    queryFn: () => clubService.getMyClubs(),
    staleTime: 5 * 60 * 1000, // 5분
  });
}

export function useClub(clubId: string) {
  return useQuery({
    queryKey: ['club', clubId],
    queryFn: () => clubService.getClub(clubId),
    enabled: !!clubId,
  });
}
```

```typescript
// src/hooks/useClasses.ts
import { useQuery } from '@tanstack/react-query';
import { classService } from '@/services';

export function useClasses(clubId: string) {
  return useQuery({
    queryKey: ['classes', clubId],
    queryFn: () => classService.getClasses(clubId),
    enabled: !!clubId,
  });
}

export function useClass(classId: string) {
  return useQuery({
    queryKey: ['class', classId],
    queryFn: () => classService.getClass(classId),
    enabled: !!classId,
  });
}
```

```typescript
// src/hooks/usePayments.ts
import { useQuery } from '@tanstack/react-query';
import { paymentService } from '@/services';

export function useMyPayments() {
  return useQuery({
    queryKey: ['payments', 'my'],
    queryFn: () => paymentService.getMyPaymentHistory(),
  });
}
```

---

### 컴포넌트에서 사용

```typescript
// src/components/ClubListWithQuery.tsx
'use client';

import { useClubs } from '@/hooks/useClubs';

export default function ClubListWithQuery() {
  const { data: clubs, isLoading, error } = useClubs();

  if (isLoading) {
    return <div>데이터를 불러오는 중입니다...</div>;
  }

  if (error) {
    return <div>에러: {error.message}</div>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {clubs?.map((club) => (
        <div key={club.id} className="rounded-lg border p-4">
          <h3 className="font-semibold">{club.clubName}</h3>
          <p className="text-sm text-gray-600">{club.clubCode}</p>
        </div>
      ))}
    </div>
  );
}
```

---

## 3. Context API 전역 상태 관리

### Auth Context

```typescript
// src/contexts/AuthContext.tsx
'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { authService, User } from '@/services';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 초기 로드 시 사용자 정보 가져오기
    const currentUser = authService.getCurrentUser();
    setUser(currentUser);
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const response = await authService.login(email, password);
    setUser(response.user);
  };

  const logout = () => {
    authService.logout();
    setUser(null);
  };

  const isAuthenticated = !!user && authService.isAuthenticated();

  return (
    <AuthContext.Provider
      value={{ user, loading, login, logout, isAuthenticated }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

---

### 사용 예시

```typescript
// src/components/Header.tsx
'use client';

import { useAuth } from '@/contexts/AuthContext';

export default function Header() {
  const { user, logout, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return null;
  }

  return (
    <header className="border-b bg-white px-6 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">TEAMPLUS</h1>

        <div className="flex items-center gap-4">
          <span className="text-sm">
            {user?.name || user?.email}님 환영합니다
          </span>
          <button
            onClick={logout}
            className="rounded-md bg-gray-600 px-4 py-2 text-sm text-white hover:bg-gray-700"
          >
            로그아웃
          </button>
        </div>
      </div>
    </header>
  );
}
```

---

## 4. 에러 처리 패턴

### 에러 바운더리

```typescript
// src/components/ErrorBoundary.tsx
'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('[Error Boundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="rounded-md bg-red-50 p-4 text-red-800">
            <h2 className="text-lg font-semibold">오류가 발생했습니다</h2>
            <p className="mt-2 text-sm">{this.state.error?.message}</p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="mt-4 rounded-md bg-red-600 px-4 py-2 text-white"
            >
              다시 시도
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
```

---

### Toast 알림

```typescript
// src/hooks/useToast.ts
import { useState } from 'react';

export function useToast() {
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'success' | 'error' | 'info'>('info');

  const showSuccess = (msg: string) => {
    setMessage(msg);
    setType('success');
    setTimeout(() => setMessage(''), 3000);
  };

  const showError = (msg: string) => {
    setMessage(msg);
    setType('error');
    setTimeout(() => setMessage(''), 3000);
  };

  return { message, type, showSuccess, showError };
}
```

---

## 5. 로딩 상태 관리

### Skeleton 컴포넌트

```typescript
// src/components/Skeleton.tsx
export function ClubCardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border bg-white p-6">
      <div className="h-6 w-3/4 rounded bg-gray-200"></div>
      <div className="mt-2 h-4 w-1/2 rounded bg-gray-200"></div>
      <div className="mt-4 h-10 w-24 rounded bg-gray-200"></div>
    </div>
  );
}

export function ClubListSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[...Array(6)].map((_, i) => (
        <ClubCardSkeleton key={i} />
      ))}
    </div>
  );
}
```

---

## 6. 폼 처리

### React Hook Form 통합

```bash
npm install react-hook-form zod @hookform/resolvers
```

```typescript
// src/components/JoinClubForm.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { clubService } from '@/services';
import { useState } from 'react';

const schema = z.object({
  clubCode: z.string().min(1, '클럽 코드를 입력해주세요'),
  playerName: z.string().min(2, '선수 이름을 입력해주세요'),
  playerAge: z.number().min(4, '나이는 4세 이상이어야 합니다').max(18),
});

type FormData = z.infer<typeof schema>;

export default function JoinClubForm() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      await clubService.joinClub(data.clubCode, data.playerName, data.playerAge);
      setSuccess(true);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="rounded-md bg-green-50 p-4 text-green-800">
        클럽 가입 신청이 완료되었습니다. 코치의 승인을 기다려주세요.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium">클럽 코드</label>
        <input
          {...register('clubCode')}
          placeholder="ACE-hockey"
          className="mt-1 block w-full rounded-md border px-3 py-2"
        />
        {errors.clubCode && (
          <p className="mt-1 text-sm text-red-600">{errors.clubCode.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium">선수 이름</label>
        <input
          {...register('playerName')}
          placeholder="홍길동"
          className="mt-1 block w-full rounded-md border px-3 py-2"
        />
        {errors.playerName && (
          <p className="mt-1 text-sm text-red-600">{errors.playerName.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium">선수 나이</label>
        <input
          type="number"
          {...register('playerAge', { valueAsNumber: true })}
          placeholder="10"
          className="mt-1 block w-full rounded-md border px-3 py-2"
        />
        {errors.playerAge && (
          <p className="mt-1 text-sm text-red-600">{errors.playerAge.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
      >
        {loading ? '가입 신청 중...' : '클럽 가입 신청하기'}
      </button>
    </form>
  );
}
```

---

## 7. 페이지 예시

### 대시보드 페이지

```typescript
// src/app/dashboard/page.tsx
'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useClubs } from '@/hooks/useClubs';
import { useMyPayments } from '@/hooks/usePayments';
import { ClubListSkeleton } from '@/components/Skeleton';

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: clubs, isLoading: clubsLoading } = useClubs();
  const { data: payments, isLoading: paymentsLoading } = useMyPayments();

  return (
    <div className="container mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold">대시보드</h1>
      <p className="mt-2 text-gray-600">
        {user?.name || user?.email}님 환영합니다
      </p>

      <div className="mt-8">
        <h2 className="text-xl font-semibold">내 클럽</h2>
        {clubsLoading ? (
          <ClubListSkeleton />
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {clubs?.map((club) => (
              <div key={club.id} className="rounded-lg border p-4">
                <h3 className="font-semibold">{club.clubName}</h3>
                <p className="text-sm text-gray-600">{club.clubCode}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-semibold">최근 결제 내역</h2>
        {paymentsLoading ? (
          <div>데이터를 불러오는 중입니다...</div>
        ) : (
          <div className="mt-4 space-y-2">
            {payments?.slice(0, 5).map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div>
                  <p className="font-medium">₩{payment.amount.toLocaleString()}</p>
                  <p className="text-sm text-gray-600">
                    {new Date(payment.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-sm ${
                    payment.paymentStatus === 'completed'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {payment.paymentStatus}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

---

**마지막 업데이트**: 2026-01-04
