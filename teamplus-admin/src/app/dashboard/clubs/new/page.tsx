'use client';

import { useState, useId } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2, Check, FileText, Info, Hash } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { clubService } from '@/services/club.service';

type MessageState = { type: 'success' | 'error'; text: string } | null;

/**
 * TEAMPLUS 새 클럽 등록 페이지
 *
 * Design 7 Principles:
 * 1. 화면 분석 - 신규 등록 폼, 검증, 성공 피드백
 * 2. 휴먼 디자인 - 명확한 폼 레이아웃, 단계적 안내
 * 3. AI 스타일 금지 - solid 컬러만 사용
 * 4. 페르소나 - frontend + architect
 * 5. 명령어 - frontend-design 스킬
 * 6. 결과 보고 - 7원칙 적용
 * 7. Tone & Manner - 한국어 존댓말, 44px 터치
 */

export default function NewClubPage() {
  const router = useRouter();
  const clubNameId = useId();
  const descriptionId = useId();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdClubId, setCreatedClubId] = useState('');
  const [message, setMessage] = useState<MessageState>(null);
  const [formData, setFormData] = useState({
    clubName: '',
    description: '',
  });

  const handleSubmit = async () => {
    if (!formData.clubName.trim()) {
      setMessage({ type: 'error', text: '클럽명을 입력해주세요.' });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    try {
      const created = await clubService.createClub({
        clubName: formData.clubName.trim(),
        description: formData.description.trim() || undefined,
      });
      setCreatedClubId(created.id);
      setMessage({ type: 'success', text: '클럽이 등록되었습니다.' });
      setFormData({ clubName: '', description: '' });
    } catch (error) {
      const text = error instanceof Error ? error.message : '클럽 등록에 실패했습니다.';
      setMessage({ type: 'error', text });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back link */}
      <button
        type="button"
        onClick={() => router.push('/dashboard/clubs')}
        aria-label="클럽 목록으로 돌아가기"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-blue-300 motion-reduce:transition-none transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        클럽 목록으로
      </button>

      {/* Hero Header */}
      <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 sm:p-8 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-sm">
            <Building2 className="w-7 h-7 text-white" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">클럽 등록</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              새로운 아이스하키 클럽의 기본 정보를 등록합니다.
            </p>
          </div>
        </div>
      </section>

      {/* Form Card */}
      <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="p-6 sm:p-8 space-y-6">
          {/* Step Indicator */}
          <div className="flex items-center gap-2 text-sm">
            <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold tabular-nums" aria-hidden="true">
              1
            </div>
            <span className="font-medium text-slate-900 dark:text-white">기본 정보 입력</span>
          </div>

          {/* Club Name */}
          <div>
            <label htmlFor={clubNameId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              클럽명 <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
              <Input
                id={clubNameId}
                value={formData.clubName}
                onChange={(e) => setFormData((prev) => ({ ...prev, clubName: e.target.value }))}
                placeholder="예: 팀플러스 ACE 클럽"
                maxLength={60}
                aria-required="true"
                className="h-11 pl-10 bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
              />
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Info className="w-3 h-3" aria-hidden="true" />
                회원들에게 표시되는 클럽의 공식 명칭입니다.
              </p>
              <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                {formData.clubName.length}/60
              </span>
            </div>
          </div>

          {/* Description */}
          <div>
            <label htmlFor={descriptionId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              클럽 소개
            </label>
            <Textarea
              id={descriptionId}
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="클럽 운영 목적, 활동 내용, 주요 대상 등을 입력해주세요."
              rows={6}
              maxLength={500}
              className="bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white resize-none"
            />
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <FileText className="w-3 h-3" aria-hidden="true" />
                연습 장소, 연령대, 수업 일정 등을 포함하면 좋아요.
              </p>
              <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                {formData.description.length}/500
              </span>
            </div>
          </div>

          {/* Message */}
          {message && (
            <div
              role="status"
              aria-live="polite"
              className={`rounded-lg border px-4 py-3 text-sm font-medium ${
                message.type === 'success'
                  ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800'
                  : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800'
              }`}
            >
              <div className="flex items-start gap-2">
                {message.type === 'success' ? (
                  <Check className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                ) : (
                  <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                )}
                <span>{message.text}</span>
              </div>
            </div>
          )}

          {/* Success - Created Club ID */}
          {createdClubId && (
            <div className="rounded-lg border-2 border-primary/20 dark:border-primary/30 bg-blue-50/50 dark:bg-blue-900/10 p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm">
                  <Check className="w-5 h-5 text-white" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    클럽이 성공적으로 등록되었습니다.
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    등록된 클럽 ID
                  </p>
                  <p className="font-mono text-sm text-slate-800 dark:text-slate-100 break-all mt-1 tabular-nums">
                    {createdClubId}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => router.push(`/dashboard/clubs/${createdClubId}`)}
                      className="h-10 motion-reduce:transition-none"
                    >
                      클럽 상세 보기
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => router.push('/dashboard/clubs')}
                      className="h-10 motion-reduce:transition-none"
                    >
                      클럽 목록 보기
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 sm:px-8 py-4 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-200 dark:border-slate-700 rounded-b-2xl flex flex-col sm:flex-row gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/dashboard/clubs')}
            disabled={isSubmitting}
            className="h-11 px-6 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 font-medium motion-reduce:transition-none"
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting || !formData.clubName.trim()}
            className="h-11 px-6 bg-primary hover:bg-primary-dark disabled:bg-slate-300 disabled:dark:bg-slate-600 text-white font-semibold shadow-sm motion-reduce:transition-none"
          >
            {isSubmitting ? '등록 중...' : '등록하기'}
          </Button>
        </div>
      </section>
    </div>
  );
}
