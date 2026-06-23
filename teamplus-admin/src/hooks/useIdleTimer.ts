import { useEffect, useRef, useState, useCallback } from 'react';

interface UseIdleTimerOptions {
  timeout: number; // 전체 타임아웃 시간 (밀리초)
  warningTime: number; // 경고 시작 시간 (밀리초)
  onIdle: () => void; // 타임아웃 시 실행
  onWarning: () => void; // 경고 시작 시 실행
  onActive?: () => void; // 활동 재개 시 실행
}

export function useIdleTimer({
  timeout,
  warningTime,
  onIdle,
  onWarning,
  onActive,
}: UseIdleTimerOptions) {
  const [isIdle, setIsIdle] = useState(false);
  const [isWarning, setIsWarning] = useState(false);
  const [remainingTime, setRemainingTime] = useState(0);

  const timeoutId = useRef<NodeJS.Timeout>();
  const warningTimeoutId = useRef<NodeJS.Timeout>();
  const countdownInterval = useRef<NodeJS.Timeout>();
  const lastActivityTime = useRef<number>(Date.now());
  // 경고 모달이 떠 있을 때 사용자 활동 무시를 위한 ref
  const isWarningRef = useRef<boolean>(false);

  const resetTimer = useCallback(() => {
    // 기존 타이머 모두 클리어
    if (timeoutId.current) clearTimeout(timeoutId.current);
    if (warningTimeoutId.current) clearTimeout(warningTimeoutId.current);
    if (countdownInterval.current) clearInterval(countdownInterval.current);

    // 상태 초기화
    setIsIdle(false);
    setIsWarning(false);
    isWarningRef.current = false;
    setRemainingTime(0);
    lastActivityTime.current = Date.now();

    // 경고 타이머 설정
    warningTimeoutId.current = setTimeout(() => {
      setIsWarning(true);
      isWarningRef.current = true;
      onWarning();

      // 카운트다운 시작
      const warningDuration = timeout - warningTime;
      setRemainingTime(Math.floor(warningDuration / 1000));

      countdownInterval.current = setInterval(() => {
        setRemainingTime((prev) => {
          if (prev <= 1) {
            if (countdownInterval.current) {
              clearInterval(countdownInterval.current);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, warningTime);

    // 자동 로그아웃 타이머 설정
    timeoutId.current = setTimeout(() => {
      setIsIdle(true);
      onIdle();
    }, timeout);

    // 활동 재개 콜백
    if (onActive) {
      onActive();
    }
  }, [timeout, warningTime, onIdle, onWarning, onActive]);

  useEffect(() => {
    // 사용자 활동 이벤트
    const events = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click',
    ];

    // 활동 감지 핸들러
    const handleActivity = () => {
      // 경고 모달이 떠 있을 때는 사용자 활동을 무시
      // 반드시 "세션 연장" 또는 "로그아웃" 버튼을 클릭해야 함
      if (isWarningRef.current) {
        return;
      }

      const now = Date.now();
      // 마지막 활동으로부터 1초 이상 경과한 경우에만 타이머 리셋 (너무 빈번한 리셋 방지)
      if (now - lastActivityTime.current > 1000) {
        resetTimer();
      }
    };

    // 이벤트 리스너 등록
    events.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    // 초기 타이머 설정
    resetTimer();

    // 클린업
    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      if (timeoutId.current) clearTimeout(timeoutId.current);
      if (warningTimeoutId.current) clearTimeout(warningTimeoutId.current);
      if (countdownInterval.current) clearInterval(countdownInterval.current);
    };
  }, [resetTimer]);

  return {
    isIdle,
    isWarning,
    remainingTime,
    resetTimer,
  };
}
