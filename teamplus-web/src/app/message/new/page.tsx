'use client';

/**
 * 새 메시지 작성 페이지 (팀 채팅 진입점 포함)
 *
 * [수정 2026-05-15 T05-E] 사용자 제보 — 수신자/주제/내용 입력 후
 *   1) "메시지 보내기" 버튼 클릭 시 전송 안됨 (form submit handler 누락)
 *   2) "발송 시간 설정하기" 버튼 클릭 시 동작 안함 (onClick 누락)
 *
 * 조치:
 *   - <form onSubmit> 으로 감싸 submit handler 명시
 *   - 메시지 보내기 = type="submit" + form-level onSubmit 단일 진입
 *   - 발송 시간 설정 = onClick 추가 (datetime-local Input 토글 → 예약 발송)
 *   - 모든 사용자 피드백은 messages.ts (MESSAGES.chat.*) 사용 (하드코딩 금지)
 *   - Backend chat API 미구현 상태 — POST /chat/messages 가 404 면 toast.info 로 안내
 */

import { useState, type FormEvent } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useNavigation } from '@/components/ui/NavLink';
import { useNativeUI } from '@/hooks/useNativeUI';
import { apiRequest } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { usePageReady } from '@/hooks/usePageReady';

interface SendMessagePayload {
  recipient: string;
  subject?: string;
  body: string;
  scheduledAt?: string;
}

export default function NewMessagePage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  const { back } = useNavigation();
  const { toast } = useToast();
  const [recipient, setRecipient] = useState('');
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [scheduledAt, setScheduledAt] = useState<string>('');
  const [showSchedule, setShowSchedule] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // 공통 PageAppBar 사용 — Flutter 네이티브 AppBar 비활성화 (중복 헤더 방지)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
    showBackButton: true,
  });

  /**
   * 폼 제출 — Backend chat 모듈 (POST /chat/messages) 가 아직 미구현이므로
   * 시도 후 응답 결과에 따라 적절한 토스트 노출. 성공 시 이전 페이지로 복귀.
   */
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSending) return;

    const trimmedRecipient = recipient.trim();
    const trimmedBody = content.trim();

    if (!trimmedRecipient) {
      toast.error(MESSAGES.chat.fillRecipient);
      return;
    }
    if (!trimmedBody) {
      toast.error(MESSAGES.chat.fillContent);
      return;
    }

    setIsSending(true);
    try {
      const payload: SendMessagePayload = {
        recipient: trimmedRecipient,
        subject: topic.trim() || undefined,
        body: trimmedBody,
        scheduledAt: scheduledAt || undefined,
      };
      const res = await apiRequest<{ id: string }>({
        method: 'POST',
        url: '/chat/messages',
        data: payload,
        retry: false,
      });

      if (res.success) {
        toast.success(
          scheduledAt
            ? MESSAGES.chat.scheduleConfirm(formatDateTimeLabel(scheduledAt))
            : MESSAGES.chat.sendSuccess,
        );
        back();
        return;
      }

      // Backend 미구현(404) — 사용자에게 명시적 안내.
      const status = res.error?.statusCode;
      if (status === 404 || status === 501) {
        toast.info(MESSAGES.chat.scheduleHelper);
        return;
      }
      toast.error(res.error?.message ?? MESSAGES.chat.sendFailed);
    } catch {
      toast.error(MESSAGES.chat.sendFailed);
    } finally {
      setIsSending(false);
    }
  };

  /**
   * 예약 발송 토글 — datetime-local 입력 영역을 펼친다.
   * 이미 펼쳐져 있으면 닫고 값 초기화.
   */
  const handleToggleSchedule = () => {
    setShowSchedule((prev) => {
      if (prev) setScheduledAt('');
      return !prev;
    });
  };

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="새 메시지" onBack={() => back()} showMenu forceNative />

      <form
        onSubmit={handleSubmit}
        className="flex-1 overflow-y-auto px-5 py-6"
        aria-label="새 메시지 작성 폼"
      >
        <div className="space-y-4">
          <Card className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="msg-recipient" className="block text-w-small font-semibold text-wtext-2 dark:text-rink-100">
                받는 사람
              </label>
              <input
                id="msg-recipient"
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder={MESSAGES.placeholders.enterRecipient}
                aria-required="true"
                className="w-full h-11 px-4 text-w-small text-wtext-1 dark:text-white bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-ice-500/30 placeholder:text-wtext-3 dark:placeholder:text-wtext-3"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="msg-subject" className="block text-w-small font-semibold text-wtext-2 dark:text-rink-100">
                주제
              </label>
              <input
                id="msg-subject"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder={MESSAGES.placeholders.enterMessageSubject}
                className="w-full h-11 px-4 text-w-small text-wtext-1 dark:text-white bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-ice-500/30 placeholder:text-wtext-3 dark:placeholder:text-wtext-3"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="msg-body" className="block text-w-small font-semibold text-wtext-2 dark:text-rink-100">
                내용
              </label>
              <textarea
                id="msg-body"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder={MESSAGES.placeholders.enterMessageBody}
                aria-required="true"
                className="w-full min-h-[140px] px-4 py-3 text-w-small text-wtext-1 dark:text-white bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-ice-500/30 placeholder:text-wtext-3 dark:placeholder:text-wtext-3"
              />
            </div>
          </Card>

          <Card className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-w-pill bg-ice-500/10 text-ice-500">
                <Icon name="schedule_send" className="text-xl" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-w-small font-semibold text-wtext-1 dark:text-white">{MESSAGES.chat.scheduleTitle}</p>
                <p className="text-w-caption text-wtext-3 dark:text-rink-300">{MESSAGES.chat.scheduleHint}</p>
              </div>
            </div>
            {showSchedule && (
              <div className="space-y-2">
                <label htmlFor="msg-scheduled-at" className="block text-w-caption font-semibold text-wtext-3 dark:text-rink-300">
                  발송 일시
                </label>
                <input
                  id="msg-scheduled-at"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(event) => setScheduledAt(event.target.value)}
                  min={getMinDateTimeLocal()}
                  className="w-full h-11 px-4 text-w-small text-wtext-1 dark:text-white bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-ice-500/30"
                />
              </div>
            )}
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={handleToggleSchedule}
              aria-expanded={showSchedule}
              aria-controls="msg-scheduled-at"
            >
              {showSchedule ? '예약 취소' : MESSAGES.chat.scheduleButton}
            </Button>
          </Card>

          <Button type="submit" className="w-full" disabled={isSending}>
            {isSending ? MESSAGES.chat.sending : MESSAGES.chat.sendButton}
          </Button>
        </div>
      </form>
    </MobileContainer>
  );
}

/** datetime-local input min 값 — 현재 시각 (5분 이후만 허용) */
function getMinDateTimeLocal(): string {
  const d = new Date(Date.now() + 5 * 60 * 1000);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

/** datetime-local 값 → 사용자 친화 라벨 (YYYY.MM.DD HH:mm) */
function formatDateTimeLabel(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd} ${hh}:${mi}`;
}
