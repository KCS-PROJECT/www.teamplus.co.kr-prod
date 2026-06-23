import React, { useState } from 'react';
import { UserRole } from '../types';

interface SignUpProps {
  onBack: () => void;
}

const SignUp: React.FC<SignUpProps> = ({ onBack }) => {
  const [role, setRole] = useState<UserRole>('PARENT');
  const [agreements, setAgreements] = useState({
    all: false,
    terms: false,
    privacy: false,
    marketing: false,
  });

  const handleRoleChange = (newRole: UserRole) => {
    setRole(newRole);
  };

  const toggleAll = () => {
    const newValue = !agreements.all;
    setAgreements({
      all: newValue,
      terms: newValue,
      privacy: newValue,
      marketing: newValue,
    });
  };

  const toggleSingle = (key: keyof typeof agreements) => {
    if (key === 'all') return;
    const newState = { ...agreements, [key]: !agreements[key] };
    const allChecked = newState.terms && newState.privacy && newState.marketing;
    setAgreements({ ...newState, all: allChecked });
  };

  return (
    <div className="flex flex-col min-h-screen bg-white max-w-md mx-auto w-full relative">
        <header className="sticky top-0 z-50 bg-white border-b border-gray-100">
            <div className="flex items-center justify-between px-4 py-3">
                <div className="w-10 flex justify-start">
                    <button type="button"                         onClick={onBack}
                        className="flex items-center justify-center rounded-full p-2 -ml-2 hover:bg-gray-50 transition-colors"
                    >
                        <span className="material-symbols-outlined text-2xl text-gray-800">arrow_back_ios_new</span>
                    </button>
                </div>
                <h2 className="text-lg font-bold leading-tight tracking-tight flex-1 text-center text-gray-900">회원가입</h2>
                <div className="w-10"></div>
            </div>
            
            {/* Role Tabs */}
            <div className="flex w-full">
                {(['PARENT', 'DIRECTOR', 'COACH'] as UserRole[]).map((r) => (
                    <button type="button"                         key={r}
                        onClick={() => handleRoleChange(r)}
                        className={`flex-1 relative py-3 text-sm transition-colors text-center ${role === r ? 'font-bold text-ice-500' : 'font-medium text-gray-400 hover:text-gray-600'}`}
                    >
                        {r === 'PARENT' && '학부모'}
                        {r === 'DIRECTOR' && '감독'}
                        {r === 'COACH' && '코치'}
                        {role === r && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-ice-500"></span>}
                    </button>
                ))}
            </div>
        </header>

        <main className="flex-1 px-5 py-6 pb-30 overflow-y-auto no-scrollbar">
            <div className="mb-8 text-center">
                <h1 className="text-2xl font-bold mb-2 text-gray-900">
                    {role === 'PARENT' && '학부모 회원가입'}
                    {role === 'DIRECTOR' && '감독 회원가입'}
                    {role === 'COACH' && '코치 회원가입'}
                </h1>
                <p className="text-gray-500 text-sm">자녀의 활동을 관리하고 소통해보세요.</p>
            </div>

            <form className="flex flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-sm font-bold text-gray-700 ml-1">이름</label>
                        <input 
                            type="text" 
                            className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white focus:ring-1 focus:ring-ice-500 focus:border-ice-500 text-base placeholder:text-gray-400 text-gray-900 transition-all shadow-sm outline-none" 
                            placeholder="실명을 입력해주세요" 
                        />
                    </div>
                    
                    <div className="space-y-1.5">
                        <label className="text-sm font-bold text-gray-700 ml-1">휴대폰 번호</label>
                        <div className="grid grid-cols-[1fr_auto] gap-2">
                            <input 
                                type="tel" 
                                className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white focus:ring-1 focus:ring-ice-500 focus:border-ice-500 text-base placeholder:text-gray-400 text-gray-900 transition-all shadow-sm outline-none" 
                                placeholder="'-' 없이 입력" 
                            />
                            <button
                                type="button"
                                className="px-4 bg-ice-500 hover:bg-blue-800 text-white text-sm font-bold rounded-xl transition-colors shadow-sm active:brightness-95"
                            >
                                인증요청
                            </button>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-bold text-gray-700 ml-1">비밀번호</label>
                        <input 
                            type="password" 
                            className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white focus:ring-1 focus:ring-ice-500 focus:border-ice-500 text-base placeholder:text-gray-400 text-gray-900 transition-all shadow-sm outline-none font-sans" 
                            placeholder="영문, 숫자, 특수문자 포함 8자 이상" 
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-bold text-gray-700 ml-1">비밀번호 확인</label>
                        <input 
                            type="password" 
                            className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white focus:ring-1 focus:ring-ice-500 focus:border-ice-500 text-base placeholder:text-gray-400 text-gray-900 transition-all shadow-sm outline-none font-sans" 
                            placeholder="비밀번호를 다시 입력해주세요" 
                        />
                    </div>
                </div>

                <div className="h-px bg-gray-100 my-2"></div>

                {/* Terms */}
                <div className="space-y-3">
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-gray-50 border border-gray-100 hover:border-ice-500/30 transition-colors">
                        <div className="flex items-center h-5 mt-0.5">
                             <input 
                                id="terms-all" 
                                type="checkbox" 
                                checked={agreements.all}
                                onChange={toggleAll}
                                className="w-5 h-5 rounded border-gray-300 text-ice-500 focus:ring-ice-500 bg-white cursor-pointer"
                             />
                        </div>
                        <div className="flex-1">
                            <label htmlFor="terms-all" className="font-bold text-gray-900 cursor-pointer select-none text-sm block">전체 동의하기</label>
                            <p className="text-xs text-gray-500 mt-1">선택 항목 포함 모든 약관에 동의합니다.</p>
                        </div>
                    </div>

                    <div className="space-y-3 px-1">
                        {[
                            { id: 'terms', label: '[필수] 서비스 이용약관 동의', key: 'terms' },
                            { id: 'privacy', label: '[필수] 개인정보 수집 및 이용 동의', key: 'privacy' },
                            { id: 'marketing', label: '[선택] 마케팅 정보 수신 동의', key: 'marketing' }
                        ].map((item) => (
                             <div key={item.id} className="flex items-center justify-between">
                                <label className="flex items-center gap-3 cursor-pointer select-none group">
                                    <input 
                                        type="checkbox" 
                                        checked={agreements[item.key as keyof typeof agreements]}
                                        onChange={() => toggleSingle(item.key as keyof typeof agreements)}
                                        className="w-5 h-5 rounded border-gray-300 text-ice-500 focus:ring-ice-500 bg-white transition-all"
                                    />
                                    <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors font-medium">{item.label}</span>
                                </label>
                                <button type="button" className="text-xs text-gray-400 underline decoration-gray-300 underline-offset-2 hover:text-gray-600">보기</button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mt-4">
                    <button type="button"                         className="w-full bg-ice-500 hover:bg-blue-800 text-white font-bold py-4 px-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 active:brightness-95"
                    >
                        <span>가입 완료하기</span>
                    </button>
                </div>
            </form>
        </main>
    </div>
  );
};

export default SignUp;