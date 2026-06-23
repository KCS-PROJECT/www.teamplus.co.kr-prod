'use client';

import { Input } from '@/components/ui/input';
import { Search, Users, CheckCircle } from 'lucide-react';

// ==================== 타입 정의 ====================

type TargetType = 'all' | 'club' | 'class' | 'individual';

interface Member {
  id: string;
  name: string;
  phone: string;
  club: string;
  class: string;
}

interface RecipientSelectorProps {
  targetType: TargetType;
  searchMember: string;
  selectedMembers: string[];
  members: Member[];
  onTargetTypeChange: (type: TargetType) => void;
  onSearchMemberChange: (value: string) => void;
  onToggleMember: (memberId: string) => void;
}

// ==================== 컴포넌트 ====================

export default function RecipientSelector({
  targetType,
  searchMember,
  selectedMembers,
  members,
  onTargetTypeChange,
  onSearchMemberChange,
  onToggleMember,
}: RecipientSelectorProps) {
  const filteredMembers = members.filter(
    (m) =>
      m.name.toLowerCase().includes(searchMember.toLowerCase()) ||
      m.phone.includes(searchMember)
  );

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
        발송 대상 <span className="text-red-500">*</span>
      </label>
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { value: 'all', label: '전체 회원', icon: Users },
          { value: 'club', label: '클럽별', icon: Users },
          { value: 'class', label: '수업별', icon: Users },
          { value: 'individual', label: '개별 선택', icon: Users },
        ].map((option) => (
          <button
            key={option.value}
            onClick={() => {
              onTargetTypeChange(option.value as TargetType);
            }}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${
              targetType === option.value
                ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-500'
            }`}
          >
            <option.icon className="w-4 h-4" />
            {option.label}
          </button>
        ))}
      </div>

      {/* Individual Member Selection */}
      {targetType === 'individual' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="회원 이름 또는 전화번호로 검색..."
              value={searchMember}
              onChange={(e) => onSearchMemberChange(e.target.value)}
              className="pl-10 h-10 bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600"
            />
          </div>
          <div className="border border-slate-200 dark:border-slate-600 rounded-lg divide-y divide-slate-100 dark:divide-slate-700 max-h-48 overflow-y-auto">
            {filteredMembers.map((member) => (
              <button
                key={member.id}
                onClick={() => onToggleMember(member.id)}
                className={`w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${
                  selectedMembers.includes(member.id) ? 'bg-amber-50 dark:bg-amber-900/20' : ''
                }`}
              >
                <div className="text-left">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{member.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {member.phone} • {member.class}
                  </p>
                </div>
                {selectedMembers.includes(member.id) && (
                  <CheckCircle className="w-5 h-5 text-amber-500" />
                )}
              </button>
            ))}
          </div>
          {selectedMembers.length > 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              {selectedMembers.length}명 선택됨
            </p>
          )}
        </div>
      )}

      {/* Target Summary */}
      {targetType !== 'individual' && (
        <div className="p-3 bg-primary/5 dark:bg-primary/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-700 dark:text-primary-light">
            {targetType === 'all'
              ? `전체 ${members.length}명에게 발송됩니다.`
              : targetType === 'club'
                ? 'ACE Hockey 클럽 회원에게 발송됩니다.'
                : '선택한 수업 회원에게 발송됩니다.'}
          </p>
        </div>
      )}
    </div>
  );
}
