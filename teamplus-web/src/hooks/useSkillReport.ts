'use client';

import { useState, useEffect, useCallback } from 'react';
import { SkillData } from '@/components/report/RadarChart';
import { managementService } from '@/services/management';
import { devWarn } from '@/lib/logger';

interface CoachInfo {
  name: string;
  role: string;
  evaluationDate: string;
}

interface SkillComment {
  content: string;
  date: string;
}

export function useSkillReport() {
  const [data, setData] = useState<SkillData | null>(null);
  const [coachInfo, setCoachInfo] = useState<CoachInfo | null>(null);
  const [comment, setComment] = useState<SkillComment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isChartAnimated, setIsChartAnimated] = useState(false);

  const fetchReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await managementService.getSkillReport();
      if (response && response.data) {
        setData(response.data.skillData);
        setCoachInfo(response.data.coachInfo);
        setComment(response.data.comment);
      } else {
        throw new Error('No data');
      }
    } catch (error) {
      devWarn('Skill Report API failed, using fallback:', error);
      setData({ skating: 4.8, shooting: 4.5, passing: 4.2, agility: 4.7, teamwork: 5.0 });
      setCoachInfo({ name: '김코치', role: 'Head Coach', evaluationDate: '2023.10.25' });
      setComment({
        content: `지훈 선수는 오늘 엣지 컨트롤에서 눈부신 향상을 보여주었습니다.`,
        date: '2023.10.25 18:30',
      });
    } finally {
      setIsLoading(false);
      setTimeout(() => setIsChartAnimated(true), 100);
    }
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return { data, coachInfo, comment, isLoading, isChartAnimated, refresh: fetchReport };
}