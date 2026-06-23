'use client';

/**
 * 링크장 관리 페이지 - TEAMPLUS
 *
 * [재작성 2026-05-22] mock 하드코딩 제거 → 백엔드 /venues API 연동.
 *   - 목록: GET /venues
 *   - 등록: POST /venues
 *   - 수정: PATCH /venues/:id
 *   - 삭제: DELETE /venues/:id
 *   링크장 마스터는 Venue 모델로 통일 (web 수업/대회/팀 폼이 동일 소스 사용).
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageHeader, StatsGrid } from '@/components/ui/page-header';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { FilterTabs } from '@/components/ui/admin-tabs';
import { Modal, ConfirmModal } from '@/components/ui/modal';
import { api } from '@/services/api-client';
import {
  MapPin, Search, Plus, Phone, Clock, Info,
  Building2, Edit2, Trash2, X, CheckCircle2, Wrench,
} from 'lucide-react';

// ─── 타입 ──────────────────────────────────────────
interface OperatingHours {
  open: string;
  close: string;
}

interface Venue {
  id: string;
  name: string;
  address: string | null;
  addressDetail: string | null;
  city: string | null;
  phone: string | null;
  capacity: number | null;
  rinkSize: string | null;
  amenities: string[] | null;
  operatingHours: OperatingHours | null;
  status: string;
  hourlyRate: number | null;
  description: string | null;
  imageUrl: string | null;
}

interface VenueForm {
  name: string;
  city: string;
  address: string;
  phone: string;
  rinkSize: string;
  capacity: string;
  openTime: string;
  closeTime: string;
  hourlyRate: string;
  status: string;
  description: string;
}

const RINK_SIZE_OPTIONS = [
  { value: '', label: '선택 안 함' },
  { value: 'NHL', label: 'NHL 규격' },
  { value: 'International', label: '국제 규격' },
  { value: 'Olympic', label: '올림픽 규격' },
  { value: 'Custom', label: '기타' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: '운영중' },
  { value: 'maintenance', label: '점검중' },
  { value: 'closed', label: '운영종료' },
];

const REGIONS = ['전체', '서울', '경기', '인천', '강원', '기타'];

const EMPTY_FORM: VenueForm = {
  name: '', city: '', address: '', phone: '', rinkSize: '',
  capacity: '', openTime: '', closeTime: '', hourlyRate: '',
  status: 'active', description: '',
};

function statusLabel(status: string): string {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}

function rinkSizeLabel(size: string | null): string {
  if (!size) return '';
  return RINK_SIZE_OPTIONS.find((s) => s.value === size)?.label ?? size;
}

export default function RinksPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('전체');

  // 등록/수정 모달
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Venue | null>(null);
  const [form, setForm] = useState<VenueForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 삭제 확인 모달
  const [deleteTarget, setDeleteTarget] = useState<Venue | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ─── 목록 조회 ──────────────────────────────────
  const fetchVenues = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await api.get<{ data: Venue[] }>('/venues', {
        params: { limit: 100 },
      });
      setVenues(Array.isArray(res?.data) ? res.data : []);
    } catch (error) {
      console.error('링크장 목록 조회 실패:', error);
      setVenues([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVenues();
  }, [fetchVenues]);

  // ─── 통계 ──────────────────────────────────────
  const stats = useMemo(() => ({
    total: venues.length,
    active: venues.filter((v) => v.status === 'active').length,
    maintenance: venues.filter((v) => v.status === 'maintenance').length,
    seoul: venues.filter((v) => v.city === '서울').length,
  }), [venues]);

  // ─── 필터링 ────────────────────────────────────
  const filteredVenues = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return venues.filter((v) => {
      const matchesSearch = !q ||
        v.name.toLowerCase().includes(q) ||
        (v.address?.toLowerCase().includes(q) ?? false);
      const matchesRegion = selectedRegion === '전체' || v.city === selectedRegion;
      return matchesSearch && matchesRegion;
    });
  }, [venues, searchTerm, selectedRegion]);

  // ─── 모달 열기 ──────────────────────────────────
  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (venue: Venue) => {
    setEditTarget(venue);
    setForm({
      name: venue.name,
      city: venue.city ?? '',
      address: venue.address ?? '',
      phone: venue.phone ?? '',
      rinkSize: venue.rinkSize ?? '',
      capacity: venue.capacity != null ? String(venue.capacity) : '',
      openTime: venue.operatingHours?.open ?? '',
      closeTime: venue.operatingHours?.close ?? '',
      hourlyRate: venue.hourlyRate != null ? String(venue.hourlyRate) : '',
      status: venue.status || 'active',
      description: venue.description ?? '',
    });
    setFormError('');
    setFormOpen(true);
  };

  const closeForm = () => {
    if (isSubmitting) return;
    setFormOpen(false);
  };

  // ─── 등록/수정 제출 ─────────────────────────────
  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setFormError('링크장명을 입력해주세요.');
      return;
    }
    if ((form.openTime && !form.closeTime) || (!form.openTime && form.closeTime)) {
      setFormError('운영 시간은 오픈/마감을 모두 입력해주세요.');
      return;
    }

    // payload — 빈 값은 제외 (PATCH 시 미전송 필드는 기존 값 유지)
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      status: form.status,
    };
    payload.city = form.city.trim() || undefined;
    payload.address = form.address.trim() || undefined;
    payload.phone = form.phone.trim() || undefined;
    payload.rinkSize = form.rinkSize || undefined;
    payload.capacity = form.capacity ? Number(form.capacity) : undefined;
    payload.hourlyRate = form.hourlyRate ? Number(form.hourlyRate) : undefined;
    payload.description = form.description.trim() || undefined;
    payload.operatingHours = form.openTime && form.closeTime
      ? { open: form.openTime, close: form.closeTime }
      : undefined;

    try {
      setIsSubmitting(true);
      setFormError('');
      if (editTarget) {
        await api.patch(`/venues/${editTarget.id}`, payload);
      } else {
        await api.post('/venues', payload);
      }
      setFormOpen(false);
      await fetchVenues();
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      setFormError(msg || '저장에 실패했습니다. 입력값을 확인해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── 삭제 ──────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      await api.delete(`/venues/${deleteTarget.id}`);
      setDeleteTarget(null);
      await fetchVenues();
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      alert(msg || '삭제에 실패했습니다. 진행 중인 예약/계약이 있을 수 있습니다.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <LoadingSpinner message="링크장 정보를 불러오는 중..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="링크장 관리"
        description="아이스링크 정보를 등록·수정·삭제합니다"
        action={{ label: '링크장 등록', onClick: openCreate, icon: Plus }}
      />

      <StatsGrid
        stats={[
          { label: '전체 링크장', value: stats.total, icon: Building2 },
          { label: '운영중', value: stats.active, icon: CheckCircle2 },
          { label: '점검중', value: stats.maintenance, icon: Wrench },
          { label: '서울 지역', value: stats.seoul, icon: MapPin },
        ]}
      />

      {/* 필터 & 검색 */}
      <div className="flex flex-col sm:flex-row gap-4">
        <FilterTabs
          options={REGIONS}
          selected={selectedRegion}
          onChange={setSelectedRegion}
        />
        <div className="flex-1 sm:max-w-xs ml-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="링크장명, 주소 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-11 bg-white dark:bg-slate-800"
            />
          </div>
        </div>
      </div>

      {/* 링크장 목록 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {filteredVenues.map((venue) => (
          <div
            key={venue.id}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden transition-colors motion-reduce:transition-none"
          >
            <div className="p-5">
              <div className="flex justify-between items-start gap-3 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {venue.city && (
                      <Badge variant="secondary" className="font-medium text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        {venue.city}
                      </Badge>
                    )}
                    <Badge
                      variant="secondary"
                      className={`font-medium text-xs ${
                        venue.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : venue.status === 'maintenance'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                      }`}
                    >
                      {statusLabel(venue.status)}
                    </Badge>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate">
                    {venue.name}
                  </h3>
                </div>
              </div>

              {venue.address && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{venue.address}</span>
                </p>
              )}

              <div className="space-y-2 mb-4">
                {venue.operatingHours && (
                  <div className="flex items-center text-sm">
                    <Clock className="w-4 h-4 text-slate-400 mr-2.5 shrink-0" aria-hidden="true" />
                    <span className="text-slate-700 dark:text-slate-300 tabular-nums">
                      {venue.operatingHours.open} - {venue.operatingHours.close}
                    </span>
                  </div>
                )}
                {venue.phone && (
                  <div className="flex items-center text-sm">
                    <Phone className="w-4 h-4 text-slate-400 mr-2.5 shrink-0" aria-hidden="true" />
                    <span className="text-slate-700 dark:text-slate-300 tabular-nums">{venue.phone}</span>
                  </div>
                )}
                {(venue.rinkSize || venue.capacity != null) && (
                  <div className="flex items-center text-sm">
                    <Info className="w-4 h-4 text-slate-400 mr-2.5 shrink-0" aria-hidden="true" />
                    <span className="text-slate-700 dark:text-slate-300">
                      {[rinkSizeLabel(venue.rinkSize), venue.capacity != null ? `수용 ${venue.capacity.toLocaleString()}명` : '']
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                )}
              </div>

              {venue.description && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-2">
                  {venue.description}
                </p>
              )}

              <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-primary dark:text-primary-light tabular-nums min-w-0 truncate">
                  {venue.hourlyRate != null ? `시간당 ${venue.hourlyRate.toLocaleString()}원` : '대관료 미설정'}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEdit(venue)}
                    className="min-h-[44px] min-w-[44px] h-11 w-11 flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-primary hover:text-primary hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors motion-reduce:transition-none"
                    aria-label={`${venue.name} 수정`}
                  >
                    <Edit2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(venue)}
                    className="min-h-[44px] min-w-[44px] h-11 w-11 flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-red-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors motion-reduce:transition-none"
                    aria-label={`${venue.name} 삭제`}
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}

        {filteredVenues.length === 0 && (
          <div className="lg:col-span-2 text-center py-16 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <MapPin className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" aria-hidden="true" />
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              {venues.length === 0 ? '등록된 링크장이 없습니다.' : '검색 결과가 없습니다.'}
            </p>
          </div>
        )}
      </div>

      {/* ── 등록/수정 모달 ── */}
      <Modal isOpen={formOpen} onClose={closeForm} size="lg" className="max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-800 flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {editTarget ? '링크장 수정' : '링크장 등록'}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                aria-label="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <Field label="링크장명" required>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="예: 목동 아이스링크"
                  maxLength={100}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="지역">
                  <select
                    value={form.city}
                    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                    className="w-full h-11 px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="">선택 안 함</option>
                    {REGIONS.filter((r) => r !== '전체').map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </Field>
                <Field label="운영 상태">
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full h-11 px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="주소">
                <Input
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="예: 서울특별시 양천구 목동동로 99"
                  maxLength={200}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="전화번호">
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="02-0000-0000"
                  />
                </Field>
                <Field label="링크 규격">
                  <select
                    value={form.rinkSize}
                    onChange={(e) => setForm((f) => ({ ...f, rinkSize: e.target.value }))}
                    className="w-full h-11 px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
                  >
                    {RINK_SIZE_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="오픈 시간">
                  <Input
                    type="time"
                    value={form.openTime}
                    onChange={(e) => setForm((f) => ({ ...f, openTime: e.target.value }))}
                  />
                </Field>
                <Field label="마감 시간">
                  <Input
                    type="time"
                    value={form.closeTime}
                    onChange={(e) => setForm((f) => ({ ...f, closeTime: e.target.value }))}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="수용 인원">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={form.capacity}
                    onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value.replace(/[^0-9]/g, '') }))}
                    placeholder="명"
                  />
                </Field>
                <Field label="시간당 대관료">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={form.hourlyRate}
                    onChange={(e) => setForm((f) => ({ ...f, hourlyRate: e.target.value.replace(/[^0-9]/g, '') }))}
                    placeholder="원"
                  />
                </Field>
              </div>

              <Field label="시설 안내">
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="규격·시설·이용 안내 등"
                  maxLength={2000}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white resize-none"
                />
              </Field>

              {formError && (
                <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
              )}
            </div>

            <div className="sticky bottom-0 bg-white dark:bg-slate-800 flex gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700">
              <Button
                type="button"
                variant="outline"
                onClick={closeForm}
                disabled={isSubmitting}
                className="flex-1 h-11"
              >
                취소
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 h-11"
              >
                {isSubmitting ? '저장 중...' : editTarget ? '수정하기' : '등록하기'}
              </Button>
            </div>
      </Modal>

      {/* ── 삭제 확인 모달 ── */}
      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        variant="danger"
        title="링크장 삭제"
        description={
          deleteTarget
            ? `${deleteTarget.name} 링크장을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`
            : ''
        }
        confirmText="삭제하기"
        cancelText="취소"
        isLoading={isDeleting}
      />
    </div>
  );
}

// ─── 폼 필드 래퍼 ──────────────────────────────────
function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}
