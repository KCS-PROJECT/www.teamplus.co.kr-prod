'use client';

import { useEffect, useState, useId } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { MESSAGES } from '@/lib/messages';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/admin-tabs';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { clubService } from '@/services/club.service';
import { communityService } from '@/services/community.service';
import type { Club, TeamPost, TeamEvent } from '@/types';
import {
  CalendarDays,
  MessageCircle,
  Newspaper,
  Plus,
  Pin,
  Users,
  Clock,
  MapPin,
  Edit2,
  ArrowLeft,
  Heart,
  Eye,
  Building2,
  Copy,
  Check,
  Hash,
  BadgeCheck,
} from 'lucide-react';

/**
 * TEAMPLUS 클럽 상세 페이지
 *
 * Design 7 Principles:
 * 1. 화면 분석 - 히어로 프로필 + 탭 (개요/피드/이벤트)
 * 2. 휴먼 디자인 - 읽기 편한 정보 계층, 액션 우선 배치
 * 3. AI 스타일 금지 - solid primary, no gradient/blur
 * 4. 페르소나 - frontend + architect
 * 5. 명령어 - frontend-design 스킬
 * 6. 결과 보고 - 7원칙 적용
 * 7. Tone & Manner - 한국어 존댓말
 */

const POST_TYPES = [
  { value: 'announcement', label: '공지' },
  { value: 'lesson', label: '수업' },
  { value: 'tournament', label: '대회' },
  { value: 'friendly', label: '친선' },
  { value: 'survey', label: '설문' },
];

const EVENT_TYPES = [
  { value: 'clinic', label: '클리닉' },
  { value: 'trial', label: '체험' },
  { value: 'tournament', label: '대회' },
  { value: 'friendly', label: '친선' },
  { value: 'meeting', label: '모임' },
];

const EVENT_STATUS = [
  { value: 'draft', label: '준비중' },
  { value: 'published', label: '모집중' },
  { value: 'closed', label: '마감' },
];

export default function ClubDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clubId = params?.clubId as string | undefined;
  const postTitleId = useId();
  const postContentId = useId();
  const postTypeId = useId();
  const postTargetId = useId();
  const postPinId = useId();
  const eventTitleId = useId();
  const eventTypeSelId = useId();
  const eventStatusId = useId();
  const eventStartId = useId();
  const eventEndId = useId();
  const eventCapId = useId();
  const eventTargetId = useId();
  const eventDescId = useId();

  const [isLoading, setIsLoading] = useState(true);
  const [club, setClub] = useState<Club | null>(null);
  const [posts, setPosts] = useState<TeamPost[]>([]);
  const [events, setEvents] = useState<TeamEvent[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'feed' | 'events'>('overview');
  const [codeCopied, setCodeCopied] = useState(false);

  // Post Modal State
  const [showPostModal, setShowPostModal] = useState(false);
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);
  const [postForm, setPostForm] = useState({
    title: '',
    content: '',
    postType: 'announcement',
    targetLevel: '',
    isPinned: false,
  });

  // Event Modal State
  const [showEventModal, setShowEventModal] = useState(false);
  const [isSubmittingEvent, setIsSubmittingEvent] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: '',
    description: '',
    eventType: 'clinic',
    targetLevel: '',
    capacity: '',
    startAt: '',
    endAt: '',
    status: 'draft',
  });
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!clubId) return;

    const loadData = async () => {
      try {
        const [clubData, postData, eventData] = await Promise.all([
          clubService.getClub(clubId),
          communityService.getClubPosts(clubId, { limit: 20 }),
          communityService.getClubEvents(clubId),
        ]);

        setClub(clubData);
        setPosts(postData);
        setEvents(eventData);
      } catch (error) {
        console.error('[ClubDetail] 데이터 로드 실패:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [clubId]);

  const handleCopyCode = () => {
    if (!club) return;
    const code = club.clubCode ?? club.teamCode ?? '';
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const handleCreatePost = async () => {
    if (!clubId || !postForm.title || !postForm.content) {
      setActionMsg({ type: 'error', text: MESSAGES.clubBoard.postRequired });
      setTimeout(() => setActionMsg(null), 3000);
      return;
    }

    setIsSubmittingPost(true);
    try {
      const newPost = await communityService.createClubPost(clubId, {
        title: postForm.title,
        content: postForm.content,
        postType: postForm.postType,
        targetLevel: postForm.targetLevel || undefined,
        isPinned: postForm.isPinned,
      });

      setPosts([newPost, ...posts]);
      setShowPostModal(false);
      setPostForm({
        title: '',
        content: '',
        postType: 'announcement',
        targetLevel: '',
        isPinned: false,
      });
      setActionMsg({ type: 'success', text: MESSAGES.clubBoard.postCreated });
      setTimeout(() => setActionMsg(null), 3000);
    } catch (error) {
      console.error('[ClubDetail] 게시글 생성 실패:', error);
      setActionMsg({ type: 'error', text: MESSAGES.clubBoard.postCreateError });
      setTimeout(() => setActionMsg(null), 3000);
    } finally {
      setIsSubmittingPost(false);
    }
  };

  const handleCreateEvent = async () => {
    if (!clubId || !eventForm.title || !eventForm.startAt || !eventForm.endAt) {
      setActionMsg({ type: 'error', text: MESSAGES.clubBoard.eventRequired });
      setTimeout(() => setActionMsg(null), 3000);
      return;
    }

    setIsSubmittingEvent(true);
    try {
      const newEvent = await communityService.createClubEvent(clubId, {
        title: eventForm.title,
        description: eventForm.description || undefined,
        eventType: eventForm.eventType,
        targetLevel: eventForm.targetLevel || undefined,
        capacity: eventForm.capacity ? parseInt(eventForm.capacity) : undefined,
        startAt: new Date(eventForm.startAt).toISOString(),
        endAt: new Date(eventForm.endAt).toISOString(),
        status: eventForm.status,
      });

      setEvents([newEvent, ...events]);
      setShowEventModal(false);
      setEventForm({
        title: '',
        description: '',
        eventType: 'clinic',
        targetLevel: '',
        capacity: '',
        startAt: '',
        endAt: '',
        status: 'draft',
      });
      setActionMsg({ type: 'success', text: MESSAGES.clubBoard.eventCreated });
      setTimeout(() => setActionMsg(null), 3000);
    } catch (error) {
      console.error('[ClubDetail] 이벤트 생성 실패:', error);
      setActionMsg({ type: 'error', text: MESSAGES.clubBoard.eventCreateError });
      setTimeout(() => setActionMsg(null), 3000);
    } finally {
      setIsSubmittingEvent(false);
    }
  };

  const handleToggleLike = async (postId: string) => {
    if (!clubId) return;

    try {
      const result = await communityService.toggleLike(clubId, postId);
      setPosts((prevPosts) =>
        prevPosts.map((post) =>
          post.id === postId
            ? { ...post, isLikedByMe: result.liked, likeCount: result.likeCount }
            : post
        )
      );
    } catch (error) {
      console.error('[ClubDetail] 좋아요 토글 실패:', error);
    }
  };

  const getPostTypeLabel = (type: string) => {
    const found = POST_TYPES.find((t) => t.value === type);
    return found ? found.label : type;
  };

  const getEventTypeLabel = (type: string) => {
    const found = EVENT_TYPES.find((t) => t.value === type);
    return found ? found.label : type;
  };

  const getStatusLabel = (status: string) => {
    const found = EVENT_STATUS.find((s) => s.value === status);
    return found ? found.label : status;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published':
        return 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800';
      case 'closed':
        return 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800';
      case 'cancelled':
        return 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800';
      default:
        return 'bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600';
    }
  };

  if (!clubId) {
    return <LoadingSpinner message="클럽 정보를 불러오는 중입니다..." />;
  }

  if (isLoading) {
    return <LoadingSpinner message="클럽 상세 정보를 불러오는 중입니다..." />;
  }

  if (!club) {
    return (
      <Card className="p-8 text-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <p className="text-slate-500 dark:text-slate-400">클럽 정보를 찾을 수 없습니다.</p>
        <Button
          type="button"
          className="mt-4"
          variant="outline"
          onClick={() => router.push('/dashboard/clubs')}
        >
          목록으로 돌아가기
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {actionMsg && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-lg px-4 py-3 text-sm font-medium motion-reduce:transition-none ${
            actionMsg.type === 'success'
              ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-200 dark:border-green-800'
              : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-800'
          }`}
        >
          {actionMsg.text}
        </div>
      )}

      {/* Back Button */}
      <button
        type="button"
        onClick={() => router.push('/dashboard/clubs')}
        aria-label="클럽 목록으로 돌아가기"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-blue-300 motion-reduce:transition-none transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        클럽 목록으로
      </button>

      {/* Hero Profile */}
      <section className="relative overflow-hidden rounded-2xl bg-primary text-white shadow-md">
        <div className="absolute top-0 right-0 w-72 h-72 rounded-full bg-white/5 -translate-y-24 translate-x-24" aria-hidden="true" />
        <div className="absolute bottom-0 right-32 w-48 h-48 rounded-full bg-white/5 translate-y-12" aria-hidden="true" />
        <div className="relative z-10 p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div className="flex items-start gap-4 min-w-0">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                <Building2 className="w-8 h-8 sm:w-10 sm:h-10 text-white" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="bg-white/15 text-white border-white/25 text-xs">
                    CLUB
                  </Badge>
                  <BadgeCheck className="w-4 h-4 text-white/80" aria-hidden="true" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate">
                  {club.clubName}
                </h1>
                <div className="flex items-center gap-2 mt-2">
                  <Hash className="w-3.5 h-3.5 text-white/70" aria-hidden="true" />
                  <code className="px-2 py-0.5 bg-white/15 text-white text-xs rounded font-mono tabular-nums">
                    {club.clubCode}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopyCode()}
                    aria-label="클럽 코드 복사"
                    className="min-w-[32px] min-h-[32px] rounded hover:bg-white/10 flex items-center justify-center motion-reduce:transition-none transition-colors"
                  >
                    {codeCopied ? (
                      <Check className="w-4 h-4 text-white" aria-hidden="true" />
                    ) : (
                      <Copy className="w-4 h-4 text-white/80" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <Button
              type="button"
              onClick={() => router.push('/dashboard/classes')}
              className="h-11 bg-white hover:bg-slate-100 text-primary font-semibold shadow-sm motion-reduce:transition-none"
            >
              <CalendarDays className="w-4 h-4 mr-1.5" aria-hidden="true" />
              수업 관리
            </Button>
          </div>
        </div>
      </section>

      {/* Summary Cards */}
      <section aria-label="클럽 요약" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
              <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 dark:text-slate-400">회원</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                {(club.memberCount ?? 0).toLocaleString('ko-KR')}명
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
              <Newspaper className="w-5 h-5 text-primary dark:text-blue-300" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 dark:text-slate-400">게시글</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                {posts.length.toLocaleString('ko-KR')}건
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-900/30 flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-green-600 dark:text-green-400" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 dark:text-slate-400">이벤트</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                {events.length.toLocaleString('ko-KR')}건
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
              <Pin className="w-5 h-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 dark:text-slate-400">고정 게시글</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                {posts.filter((p) => p.isPinned).length.toLocaleString('ko-KR')}건
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="overview">기본 정보</TabsTrigger>
          <TabsTrigger value="feed">피드 ({posts.length})</TabsTrigger>
          <TabsTrigger value="events">이벤트 ({events.length})</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card className="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-3">클럽 정보</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400 mb-1">담당 코치</dt>
                <dd className="font-medium text-slate-900 dark:text-white">
                  {club.coach?.username || club.coachId || '미지정'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400 mb-1">회원 수</dt>
                <dd className="font-semibold text-primary dark:text-blue-300 tabular-nums">
                  {(club.memberCount ?? 0).toLocaleString('ko-KR')}명
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400 mb-1">등록일</dt>
                <dd className="font-medium text-slate-700 dark:text-slate-200 tabular-nums">
                  {new Date(club.createdAt).toLocaleDateString('ko-KR')}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400 mb-1">최근 수정</dt>
                <dd className="font-medium text-slate-700 dark:text-slate-200 tabular-nums">
                  {club.updatedAt ? new Date(club.updatedAt).toLocaleDateString('ko-KR') : '-'}
                </dd>
              </div>
            </dl>
          </Card>

          <Card className="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-3">안내</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              클럽 피드와 이벤트 탭에서 공지, 모집, 체험 수업, 대회 일정 등을 한 곳에서 관리할 수 있습니다.
              상단 고정 기능으로 중요한 공지를 돋보이게 할 수 있고, 대상 레벨을 지정해 맞춤 안내를 전달할 수 있습니다.
            </p>
          </Card>
        </TabsContent>

        {/* Feed Tab */}
        <TabsContent value="feed" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Newspaper className="w-4 h-4" aria-hidden="true" />
              클럽 피드
            </h2>
            <Button
              type="button"
              size="sm"
              className="h-10 gap-1 bg-primary hover:bg-primary-dark text-white motion-reduce:transition-none"
              onClick={() => setShowPostModal(true)}
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              새 게시글
            </Button>
          </div>

          {posts.length === 0 ? (
            <Card className="p-8 text-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
                <Newspaper className="w-7 h-7 text-slate-400 dark:text-slate-500" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                등록된 게시글이 없습니다
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                첫 번째 공지를 작성해보세요.
              </p>
              <Button
                type="button"
                className="bg-primary hover:bg-primary-dark text-white motion-reduce:transition-none"
                onClick={() => setShowPostModal(true)}
              >
                첫 게시글 작성하기
              </Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {posts.map((post) => (
                <Card
                  key={post.id}
                  className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/40 motion-reduce:transition-none transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className="text-xs bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600"
                        >
                          {getPostTypeLabel(post.postType)}
                        </Badge>
                        {post.isPinned && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[11px] font-medium">
                            <Pin className="w-3 h-3" aria-hidden="true" />
                            상단 고정
                          </span>
                        )}
                        {post.targetLevel && (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            대상: {post.targetLevel}
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        {post.title}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                        {post.content}
                      </p>
                      <div className="flex items-center gap-4 pt-2 text-xs text-slate-400 dark:text-slate-500">
                        <button
                          type="button"
                          onClick={() => handleToggleLike(post.id)}
                          aria-label={post.isLikedByMe ? '좋아요 취소' : '좋아요'}
                          className={`flex items-center gap-1 motion-reduce:transition-none transition-colors ${
                            post.isLikedByMe
                              ? 'text-red-500 hover:text-red-600'
                              : 'hover:text-red-500'
                          }`}
                        >
                          <Heart
                            className={`w-3.5 h-3.5 ${post.isLikedByMe ? 'fill-current' : ''}`}
                            aria-hidden="true"
                          />
                          <span className="tabular-nums">{post.likeCount ?? 0}</span>
                        </button>
                        <span className="flex items-center gap-1">
                          <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span className="tabular-nums">{post.commentCount ?? 0}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                          <span className="tabular-nums">{post.viewCount ?? 0}</span>
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                        {new Date(post.createdAt).toLocaleDateString('ko-KR')}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-xs text-slate-500 hover:text-primary motion-reduce:transition-none"
                      >
                        <MessageCircle className="w-3 h-3 mr-1" aria-hidden="true" />
                        상세
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Events Tab */}
        <TabsContent value="events" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <CalendarDays className="w-4 h-4" aria-hidden="true" />
              이벤트
            </h2>
            <Button
              type="button"
              size="sm"
              className="h-10 gap-1 bg-primary hover:bg-primary-dark text-white motion-reduce:transition-none"
              onClick={() => setShowEventModal(true)}
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              새 이벤트
            </Button>
          </div>

          {events.length === 0 ? (
            <Card className="p-8 text-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
                <CalendarDays className="w-7 h-7 text-slate-400 dark:text-slate-500" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                등록된 이벤트가 없습니다
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                클리닉, 체험 수업, 친선 경기 등을 등록해보세요.
              </p>
              <Button
                type="button"
                className="bg-primary hover:bg-primary-dark text-white motion-reduce:transition-none"
                onClick={() => setShowEventModal(true)}
              >
                첫 이벤트 만들기
              </Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {events.map((event) => (
                <Card
                  key={event.id}
                  className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/40 motion-reduce:transition-none transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className="text-xs bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600"
                        >
                          {getEventTypeLabel(event.eventType)}
                        </Badge>
                        <Badge variant="outline" className={`text-xs border ${getStatusColor(event.status)}`}>
                          {getStatusLabel(event.status)}
                        </Badge>
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        {event.title}
                      </h3>
                      <div className="flex items-center gap-4 flex-wrap text-xs text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1 tabular-nums">
                          <Clock className="w-3 h-3" aria-hidden="true" />
                          {new Date(event.startAt).toLocaleDateString('ko-KR')}{' '}
                          {new Date(event.startAt).toLocaleTimeString('ko-KR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {event.capacity && (
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" aria-hidden="true" />
                            정원 <span className="tabular-nums">{event.capacity}</span>명
                          </span>
                        )}
                        {event.targetLevel && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" aria-hidden="true" />
                            {event.targetLevel}
                          </span>
                        )}
                      </div>
                      {event.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                          {event.description}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-9 px-3 text-xs text-slate-500 hover:text-primary motion-reduce:transition-none"
                    >
                      <Edit2 className="w-3 h-3 mr-1" aria-hidden="true" />
                      관리
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Post Modal */}
      <Modal isOpen={showPostModal} onClose={() => setShowPostModal(false)} size="md">
        <ModalHeader title="새 게시글 작성" />
        <ModalBody>
          <div className="space-y-4">
            <div>
              <label htmlFor={postTitleId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                제목 <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <Input
                id={postTitleId}
                placeholder="게시글 제목을 입력해주세요"
                value={postForm.title}
                onChange={(e) => setPostForm({ ...postForm, title: e.target.value })}
                aria-required="true"
                className="h-11 bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor={postContentId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                내용 <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <textarea
                id={postContentId}
                placeholder="게시글 내용을 입력해주세요"
                value={postForm.content}
                onChange={(e) => setPostForm({ ...postForm, content: e.target.value })}
                rows={5}
                aria-required="true"
                className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor={postTypeId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  게시글 유형
                </label>
                <select
                  id={postTypeId}
                  value={postForm.postType}
                  onChange={(e) => setPostForm({ ...postForm, postType: e.target.value })}
                  className="w-full h-11 px-3 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {POST_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={postTargetId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  대상 레벨 (선택)
                </label>
                <Input
                  id={postTargetId}
                  placeholder="예: U8, 초급"
                  value={postForm.targetLevel}
                  onChange={(e) => setPostForm({ ...postForm, targetLevel: e.target.value })}
                  className="h-11 bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={postPinId}
                checked={postForm.isPinned}
                onChange={(e) => setPostForm({ ...postForm, isPinned: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
              />
              <label htmlFor={postPinId} className="text-sm text-slate-700 dark:text-slate-300">
                상단 고정
              </label>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            onClick={() => setShowPostModal(false)}
            variant="outline"
            className="flex-1 h-11 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-500 motion-reduce:transition-none"
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={() => handleCreatePost()}
            disabled={isSubmittingPost}
            className="flex-1 h-11 bg-primary hover:bg-primary-dark text-white font-semibold motion-reduce:transition-none"
          >
            {isSubmittingPost ? '저장 중...' : '등록하기'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Event Modal */}
      <Modal isOpen={showEventModal} onClose={() => setShowEventModal(false)} size="lg">
        <ModalHeader title="새 이벤트 만들기" />
        <ModalBody>
          <div className="space-y-4">
            <div>
              <label htmlFor={eventTitleId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                이벤트 제목 <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <Input
                id={eventTitleId}
                placeholder="이벤트 제목을 입력해주세요"
                value={eventForm.title}
                onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                aria-required="true"
                className="h-11 bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor={eventTypeSelId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  이벤트 유형
                </label>
                <select
                  id={eventTypeSelId}
                  value={eventForm.eventType}
                  onChange={(e) => setEventForm({ ...eventForm, eventType: e.target.value })}
                  className="w-full h-11 px-3 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {EVENT_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={eventStatusId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  상태
                </label>
                <select
                  id={eventStatusId}
                  value={eventForm.status}
                  onChange={(e) => setEventForm({ ...eventForm, status: e.target.value })}
                  className="w-full h-11 px-3 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {EVENT_STATUS.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor={eventStartId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  시작 일시 <span className="text-red-500" aria-hidden="true">*</span>
                </label>
                <Input
                  id={eventStartId}
                  type="datetime-local"
                  value={eventForm.startAt}
                  onChange={(e) => setEventForm({ ...eventForm, startAt: e.target.value })}
                  aria-required="true"
                  className="h-11 bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor={eventEndId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  종료 일시 <span className="text-red-500" aria-hidden="true">*</span>
                </label>
                <Input
                  id={eventEndId}
                  type="datetime-local"
                  value={eventForm.endAt}
                  onChange={(e) => setEventForm({ ...eventForm, endAt: e.target.value })}
                  aria-required="true"
                  className="h-11 bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor={eventCapId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  정원 (선택)
                </label>
                <Input
                  id={eventCapId}
                  type="number"
                  placeholder="예: 20"
                  value={eventForm.capacity}
                  onChange={(e) => setEventForm({ ...eventForm, capacity: e.target.value })}
                  className="h-11 bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white tabular-nums"
                />
              </div>
              <div>
                <label htmlFor={eventTargetId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  대상 레벨 (선택)
                </label>
                <Input
                  id={eventTargetId}
                  placeholder="예: U10, 중급"
                  value={eventForm.targetLevel}
                  onChange={(e) => setEventForm({ ...eventForm, targetLevel: e.target.value })}
                  className="h-11 bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                />
              </div>
            </div>
            <div>
              <label htmlFor={eventDescId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                상세 설명 (선택)
              </label>
              <textarea
                id={eventDescId}
                placeholder="이벤트 상세 설명을 입력해주세요"
                value={eventForm.description}
                onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            onClick={() => setShowEventModal(false)}
            variant="outline"
            className="flex-1 h-11 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-500 motion-reduce:transition-none"
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={() => handleCreateEvent()}
            disabled={isSubmittingEvent}
            className="flex-1 h-11 bg-primary hover:bg-primary-dark text-white font-semibold motion-reduce:transition-none"
          >
            {isSubmittingEvent ? '생성 중...' : '등록하기'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
