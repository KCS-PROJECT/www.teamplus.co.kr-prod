'use client';

export interface ActionNoticeValue {
  type: 'success' | 'error';
  text: string;
}

/**
 * 처리 결과 알림 — 화면 오른쪽 위에 겹쳐 띄운다. 목록 위에 끼워 넣으면 나타나고 사라질 때
 * 표가 밀려, 운영자가 누르려던 행 대신 다른 팀 행을 여는 실수가 생긴다.
 */
export function ActionNotice({ notice }: { notice: ActionNoticeValue | null }) {
  if (!notice) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed right-6 top-20 z-50 max-w-sm rounded-lg p-3 text-sm shadow-lg ${
        notice.type === 'success'
          ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'
          : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
      }`}
    >
      {notice.text}
    </div>
  );
}
