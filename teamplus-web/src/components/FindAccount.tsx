import React, { useState, useEffect } from 'react';

interface FindAccountProps {
  initialMode: 'ID' | 'PW';
  onBack: () => void;
  onChangeMode: (mode: 'ID' | 'PW') => void;
}

const FindAccount: React.FC<FindAccountProps> = ({ initialMode, onBack, onChangeMode }) => {
  // Timer state for PW reset code
  const [timeLeft, setTimeLeft] = useState(180); // 3:00 minutes
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isTimerRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, timeLeft]);

  const handleVerifyRequest = () => {
    setShowCodeInput(true);
    setIsTimerRunning(true);
    setTimeLeft(179);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `0${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const isIdMode = initialMode === 'ID';

  return (
    <div className="flex flex-col min-h-screen bg-white max-w-md mx-auto w-full relative">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between px-4 h-14">
          <button type="button"             onClick={onBack}
            className="flex items-center justify-center w-10 h-10 -ml-2 rounded-full hover:bg-gray-100 transition-colors group"
          >
            <span className="material-symbols-outlined text-gray-900 text-2xl">arrow_back_ios_new</span>
          </button>
          <h1 className="text-base font-bold text-gray-900 flex-1 text-center pr-8">
            {isIdMode ? '아이디 찾기' : '계정 찾기'}
          </h1>
        </div>

        {/* Tabs */}
        <div className="flex w-full px-4 pt-2">
            <button type="button"                 onClick={() => onChangeMode('ID')}
                className={`flex flex-1 flex-col items-center pb-3 border-b-[2px] transition-colors ${isIdMode ? 'border-ice-500 text-ice-500' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
                <span className={`text-sm ${isIdMode ? 'font-bold' : 'font-medium'}`}>아이디 찾기</span>
            </button>
            <button type="button"                 onClick={() => onChangeMode('PW')}
                className={`flex flex-1 flex-col items-center pb-3 border-b-[2px] transition-colors ${!isIdMode ? 'border-ice-500 text-ice-500' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
                <span className={`text-sm ${!isIdMode ? 'font-bold' : 'font-medium'}`}>비밀번호 찾기</span>
            </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-30 px-6 py-8">
        <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3 tracking-tight">
                {isIdMode ? '계정을 잊으셨나요?' : '비밀번호 재설정'}
            </h2>
            <p className="text-gray-500 text-sm leading-relaxed mb-8">
                {isIdMode 
                    ? '가입 시 등록한 이름과 휴대폰 번호를 입력해 주세요.' 
                    : <>회원가입 시 등록한 이메일과 휴대폰 번호를 입력해 주세요.<br/>정보가 일치하면 인증번호를 발송해 드립니다.</>
                }
            </p>

            <form className="flex flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
                {/* ID Mode Fields */}
                {isIdMode && (
                    <>
                        <div className="flex flex-col gap-2 group">
                            <label className="text-sm font-bold text-gray-800 ml-1 group-focus-within:text-ice-500 transition-colors">이름</label>
                            <div className="relative">
                                <input 
                                    type="text" 
                                    placeholder="이름을 입력해 주세요" 
                                    className="w-full h-14 px-4 rounded-xl bg-gray-50 border border-transparent focus:border-ice-500 focus:ring-1 focus:ring-ice-500 focus:bg-white transition-all outline-none text-base placeholder-gray-400"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none opacity-0 group-focus-within:opacity-100 transition-opacity">
                                    <span className="material-symbols-outlined">person</span>
                                </span>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2 group">
                            <label className="text-sm font-bold text-gray-800 ml-1 group-focus-within:text-ice-500 transition-colors">휴대폰 번호</label>
                            <div className="relative">
                                <input 
                                    type="tel" 
                                    placeholder="하이픈(-) 없이 숫자만 입력" 
                                    className="w-full h-14 px-4 rounded-xl bg-gray-50 border border-transparent focus:border-ice-500 focus:ring-1 focus:ring-ice-500 focus:bg-white transition-all outline-none text-base placeholder-gray-400"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none opacity-0 group-focus-within:opacity-100 transition-opacity">
                                    <span className="material-symbols-outlined">smartphone</span>
                                </span>
                            </div>
                        </div>
                    </>
                )}

                {/* PW Mode Fields */}
                {!isIdMode && (
                    <>
                        <div className="flex flex-col gap-2 group">
                            <label className="text-sm font-bold text-gray-800 ml-1 group-focus-within:text-ice-500 transition-colors">이메일 주소</label>
                            <div className="relative">
                                <input 
                                    type="email" 
                                    placeholder="example@email.com" 
                                    className="w-full h-14 px-4 rounded-xl bg-gray-50 border border-transparent focus:border-ice-500 focus:ring-1 focus:ring-ice-500 focus:bg-white transition-all outline-none text-base placeholder-gray-400"
                                />
                            </div>
                        </div>
                        <div className="flex flex-col gap-2 group">
                            <label className="text-sm font-bold text-gray-800 ml-1 group-focus-within:text-ice-500 transition-colors">휴대폰 번호</label>
                            <div className="flex gap-3">
                                <input 
                                    type="tel" 
                                    placeholder="010-0000-0000" 
                                    className="flex-1 h-14 px-4 rounded-xl bg-gray-50 border border-transparent focus:border-ice-500 focus:ring-1 focus:ring-ice-500 focus:bg-white transition-all outline-none text-base placeholder-gray-400 tracking-wide"
                                />
                                <button
                                    type="button"
                                    onClick={handleVerifyRequest}
                                    className="h-14 px-5 bg-gray-800 text-white rounded-xl text-sm font-bold hover:bg-gray-700 transition-colors whitespace-nowrap shadow-sm active:brightness-95"
                                >
                                    인증요청
                                </button>
                            </div>
                        </div>

                        {showCodeInput && (
                            <div className="flex flex-col gap-2 pt-2">
                                <label className="text-sm font-bold text-gray-800 ml-1 flex justify-between items-end">
                                    <span>인증번호</span>
                                    <span className="text-ice-500 text-xs font-normal animate-pulse">문자가 발송되었습니다</span>
                                </label>
                                <div className="relative">
                                    <input 
                                        type="number" 
                                        placeholder="6자리 숫자" 
                                        defaultValue="829102"
                                        className="w-full h-14 px-4 rounded-xl bg-white border border-ice-500 ring-1 ring-ice-500/20 outline-none text-base text-gray-900 tracking-widest font-bold"
                                    />
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                        <span className="text-sm font-medium text-red-500 font-mono tabular-nums">{formatTime(timeLeft)}</span>
                                        <button type="button" onClick={() => setTimeLeft(180)} className="text-xs font-medium text-gray-500 underline hover:text-gray-800 ml-1">재발송</button>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-400 ml-1">3분 이내에 입력해주세요.</p>
                            </div>
                        )}
                    </>
                )}
            </form>
        </div>

        {!isIdMode && (
            <div className="mt-8 flex justify-center gap-4">
                <button type="button" className="text-xs text-gray-500 hover:text-ice-500 transition-colors">이메일이 기억나지 않나요?</button>
                <span className="w-[1px] h-3 bg-gray-300 self-center"></span>
                <button type="button" className="text-xs text-gray-500 hover:text-ice-500 transition-colors">고객센터 문의</button>
            </div>
        )}
      </main>

      {/* Sticky Bottom Button */}
      <div className="fixed bottom-0 fixed-center-x bg-white p-4 border-t border-gray-100 z-40">
        <button type="button" className="w-full h-14 bg-ice-500 hover:bg-blue-800 text-white text-base font-bold rounded-xl shadow-md transition-all active:brightness-95 flex items-center justify-center gap-2 group">
            <span>{isIdMode ? '아이디 찾기' : '비밀번호 재설정'}</span>
            <span className="material-symbols-outlined text-lg group-hover:translate-x-1 transition-transform">arrow_forward</span>
        </button>
        {isIdMode && (
             <div className="mt-4 flex items-center justify-center space-x-4 text-sm text-gray-500">
                <button type="button" onClick={onBack} className="hover:text-ice-500 transition-colors">로그인하기</button>
                <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                <button type="button" className="hover:text-ice-500 transition-colors">회원가입</button>
             </div>
        )}
      </div>
    </div>
  );
};

export default FindAccount;
