'use client';

import { useState, useCallback, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/services/api-client';
import { NavLink, useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { resolveImageSrc } from '@/lib/image-url';
import dynamic from 'next/dynamic';
import { usePageReady } from '@/hooks/usePageReady';
import { useFileUploadSync } from '@/hooks/useFileUploadSync';
const GlobalMenu = dynamic(() => import('@/components/layout/GlobalMenu').then(mod => ({ default: mod.GlobalMenu })), { ssr: false });

interface AlbumPhoto {
  id: string;
  url: string;
  thumbnail: string;
  caption?: string;
  likes: number;
  comments: number;
  uploadedAt: string;
}

interface Album {
  id: string;
  title: string;
  description: string;
  date: string;
  coverImage: string;
  photoCount: number;
  photos: AlbumPhoto[];
}

const EMPTY_ALBUM: Album = {
  id: '',
  title: '',
  description: '',
  date: '',
  coverImage: '',
  photoCount: 0,
  photos: [],
};

export default function AlbumDetailPage() {
  const params = useParams();
  const { back } = useNavigation();
  const { toast } = useToast();
  const albumId = (params?.albumId as string) || '';

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [album, setAlbum] = useState<Album>(EMPTY_ALBUM);

  // v18 (2026-05-20, audit §4 C #4): album.id !== '' (= 실제 데이터 도착) 후 ready.
  // EMPTY_ALBUM 으로 시작하여 빈 카드만 노출되는 갭 방지.
  usePageReady(album.id !== '');

  const loadAlbum = useCallback(async () => {
    if (!albumId) return;
    const res = await api.get<{
      id: string; title?: string; name?: string; description?: string;
      date?: string; createdAt?: string; coverImage?: string;
      photos?: {
        id: string; imageUrl?: string; url?: string; thumbnail?: string;
        caption?: string; likesCount?: number; likes?: number;
        commentsCount?: number; comments?: number; uploadedAt?: string; createdAt?: string;
      }[];
    }>(`/gallery/albums/${albumId}`);
    if (res.success && res.data) {
      const d = res.data;
      const photos: AlbumPhoto[] = (d.photos ?? []).map((p) => ({
        id: p.id,
        url: p.imageUrl ?? p.url ?? '',
        thumbnail: p.thumbnail ?? p.imageUrl ?? p.url ?? '',
        caption: p.caption,
        likes: p.likesCount ?? p.likes ?? 0,
        comments: p.commentsCount ?? (typeof p.comments === 'number' ? p.comments : 0),
        uploadedAt: p.uploadedAt ?? p.createdAt ?? '',
      }));
      setAlbum({
        id: d.id,
        title: d.title ?? d.name ?? '',
        description: d.description ?? '',
        date: d.date ?? (d.createdAt ? new Date(d.createdAt).toLocaleDateString('ko-KR') : ''),
        coverImage: d.coverImage ?? '',
        photoCount: photos.length,
        photos,
      });
    }
  }, [albumId]);

  useEffect(() => {
    void loadAlbum();
  }, [loadAlbum]);

  // SPEC_FILEUPLOAD_IMPECCABLE_2026-05-20 §5.2 / §9 — 실시간 사진 반영.
  // 다른 사용자가 같은 앨범에 사진을 업로드/삭제하면 1초 내 자동 갱신.
  // Backend NotificationsGateway.broadcastFileEvent emit 이 완료되면 즉시 동작.
  useFileUploadSync({
    refType: 'gallery',
    refId: albumId,
    enabled: !!albumId,
    onFilesChanged: () => {
      void loadAlbum();
    },
  });

  const handleBack = useCallback(() => {
    back();
  }, [back]);

  const toggleSelectMode = useCallback(() => {
    setIsSelectMode((prev) => !prev);
    setSelectedPhotos(new Set());
  }, []);

  const togglePhotoSelection = useCallback((photoId: string) => {
    setSelectedPhotos((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selectedPhotos.size === album.photos.length) {
      setSelectedPhotos(new Set());
    } else {
      setSelectedPhotos(new Set(album.photos.map((p) => p.id)));
    }
  }, [album.photos, selectedPhotos.size]);

  const handleDownloadSelected = useCallback(async () => {
    const photosToDownload = album.photos.filter((p) => selectedPhotos.has(p.id));
    if (photosToDownload.length === 0) return;

    toast.success(`${photosToDownload.length}장의 사진 다운로드를 시작합니다.`);

    for (const photo of photosToDownload) {
      try {
        const response = await fetch(photo.url, { mode: 'cors' });
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `photo-${photo.id}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      } catch {
        // CORS 제한 시 새 탭 열기로 폴백
        window.open(photo.url, '_blank');
      }
    }
  }, [album.photos, selectedPhotos, toast]);

  return (
    <MobileContainer hasBottomNav={false}>
      {/* [appbar-harness-v4 §3] 비선택 모드 → 분류 A (extraActions + 메뉴),
          선택 모드 → 분류 B (의도된 edit-mode rightAction 대체, 정당화: 다중선택 액션) */}
      {isSelectMode ? (
        <PageAppBar
          title={`${selectedPhotos.size}장 선택됨`}
          onBack={handleBack}
          rightAction={
            <div className="flex items-center gap-1">
              <button type="button" onClick={selectAll}
                className="px-3 py-1.5 text-card-body font-bold text-it-blue-500 hover:bg-it-blue-50 dark:hover:bg-it-blue-500/10 rounded-w-md transition-colors motion-reduce:transition-none"
              >
                {selectedPhotos.size === album.photos.length ? '전체 해제' : '전체 선택'}
              </button>
              <button type="button" onClick={toggleSelectMode}
                className="px-3 py-1.5 text-card-body font-medium text-it-ink-700 dark:text-rink-300 hover:bg-it-fill dark:hover:bg-rink-800 rounded-w-md transition-colors motion-reduce:transition-none"
              >
                취소
              </button>
            </div>
          }
        />
      ) : (
        <PageAppBar
          title={album.title}
          onBack={handleBack}
          extraActions={[
            {
              icon: 'checklist',
              label: '선택 모드',
              onClick: toggleSelectMode,
            },
          ]}
        />
      )}

      {/* Album Info — flat 흰 섹션 + hairline */}
      {!isSelectMode && (
        <div className="px-4 py-4 bg-it-surface dark:bg-it-blue-950 border-b border-it-line dark:border-rink-800">
          <p className="text-card-body text-it-ink-700 dark:text-rink-300 mb-2">
            {album.description}
          </p>
          <div className="flex items-center gap-4 text-card-meta text-it-ink-500 dark:text-rink-300">
            <span className="flex items-center gap-1">
              <Icon name="calendar_today" size={16} className="text-[16px] text-it-blue-500" />
              {album.date}
            </span>
            <span className="flex items-center gap-1">
              <Icon name="photo_library" size={16} className="text-[16px] text-it-blue-500" />
              {album.photoCount}장
            </span>
          </div>
        </div>
      )}

      {/* Photo Grid — 사진 이미지는 비주얼 결과물이라 골격 유지, 캔버스만 it-canvas */}
      <main className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck">
        <div className="grid grid-cols-3 gap-0.5 p-0.5">
          {album.photos.map((photo) => (
            <PhotoGridItem
              key={photo.id}
              photo={photo}
              albumId={albumId}
              imageUrl={photo.thumbnail || photo.url}
              isSelectMode={isSelectMode}
              isSelected={selectedPhotos.has(photo.id)}
              onSelect={() => togglePhotoSelection(photo.id)}
            />
          ))}
        </div>

        {/* Bottom Spacing */}
        <div className="h-20" />
      </main>

      {/* Selection Action Bar */}
      {isSelectMode && selectedPhotos.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-it-surface dark:bg-rink-900 border-t border-it-line dark:border-rink-700 px-4 py-3 z-30">
          <div className="max-w-md mx-auto flex items-center justify-around">
            <button type="button"               onClick={handleDownloadSelected}
              className="flex flex-col items-center gap-1 px-4 py-2 text-it-ink-800 dark:text-rink-100 hover:text-it-blue-500 transition-colors motion-reduce:transition-none"
            >
              <Icon name="download" />
              <span className="text-card-meta font-medium">다운로드</span>
            </button>
            <button type="button" className="flex flex-col items-center gap-1 px-4 py-2 text-it-ink-800 dark:text-rink-100 hover:text-it-blue-500 transition-colors motion-reduce:transition-none">
              <Icon name="share" />
              <span className="text-card-meta font-medium">공유</span>
            </button>
            <button type="button" className="flex flex-col items-center gap-1 px-4 py-2 text-it-ink-800 dark:text-rink-100 hover:text-it-red-500 transition-colors motion-reduce:transition-none">
              <Icon name="delete" />
              <span className="text-card-meta font-medium">삭제</span>
            </button>
          </div>
        </div>
      )}
      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </MobileContainer>
  );
}

// Photo Grid Item Component
interface PhotoGridItemProps {
  photo: {
    id: string;
    likes: number;
    comments: number;
  };
  albumId: string;
  imageUrl: string;
  isSelectMode: boolean;
  isSelected: boolean;
  onSelect: () => void;
}

function PhotoGridItem({
  photo,
  albumId,
  imageUrl,
  isSelectMode,
  isSelected,
  onSelect,
}: PhotoGridItemProps) {
  const handleClick = (e: React.MouseEvent) => {
    if (isSelectMode) {
      e.preventDefault();
      onSelect();
    }
  };

  const ariaLabel = isSelectMode
    ? `사진 선택, ${isSelected ? '선택됨' : '선택 안 됨'}`
    : `사진 자세히 보기, 좋아요 ${photo.likes}개, 댓글 ${photo.comments}개`;

  const content = (
    <div
      className={cn(
        'relative aspect-square bg-it-line dark:bg-rink-700 overflow-hidden group',
        isSelectMode && 'cursor-pointer',
        isSelected && 'ring-2 ring-it-blue-500 ring-inset'
      )}
      onClick={handleClick}
      role={isSelectMode ? 'checkbox' : undefined}
      aria-checked={isSelectMode ? isSelected : undefined}
      aria-label={ariaLabel}
      tabIndex={isSelectMode ? 0 : undefined}
      onKeyDown={
        isSelectMode
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
    >
      {/* Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolveImageSrc(imageUrl)}
        alt=""
        className={cn(
          'absolute inset-0 size-full object-cover transition-transform motion-reduce:transition-none duration-200',
          !isSelectMode && 'group-hover:scale-105'
        )}
      />

      {/* Select Mode Checkbox */}
      {isSelectMode && (
        <div className="absolute top-2 right-2 z-10">
          <div
            className={cn(
              'w-6 h-6 rounded-w-pill border-2 flex items-center justify-center transition-all motion-reduce:transition-none',
              isSelected
                ? 'bg-it-blue-500 border-it-blue-500 text-white'
                : 'bg-white/80 border-white/80 text-transparent'
            )}
          >
            <Icon name="check" size={16} className="text-[16px]" />
          </div>
        </div>
      )}

      {/* Hover Overlay - only in non-select mode */}
      {!isSelectMode && (
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors motion-reduce:transition-none flex items-center justify-center opacity-0 group-hover:opacity-100">
          <div className="flex items-center gap-4 text-white">
            <span className="flex items-center gap-1 text-card-body font-medium">
              <Icon name="favorite" filled size={18} className="text-[18px]" />
              {photo.likes}
            </span>
            <span className="flex items-center gap-1 text-card-body font-medium">
              <Icon name="chat_bubble" filled size={18} className="text-[18px]" />
              {photo.comments}
            </span>
          </div>
        </div>
      )}

      {/* Selection Overlay */}
      {isSelectMode && isSelected && (
        <div className="absolute inset-0 bg-it-blue-500/20" />
      )}
    </div>
  );

  if (isSelectMode) {
    return content;
  }

  return (
    <NavLink href={`/photos/${albumId}/${photo.id}`}>
      {content}
    </NavLink>
  );
}
