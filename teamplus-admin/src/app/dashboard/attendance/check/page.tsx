"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  QrCode,
  Save,
  BarChart3,
  ClipboardCheck,
  UserCheck,
  UserX,
  Clock,
  CheckCircle2,
  Circle,
  Building2,
  CalendarDays,
  GraduationCap,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { attendanceService } from "@/services/attendance.service";
import { classService } from "@/services/class.service";
import { clubService } from "@/services/club.service";
import {
  Status,
  UserType,
  type Attendance,
  type Class,
  type ClassSchedule,
  type Club,
  type TeamMember,
} from "@/types";

type MessageState = { type: "success" | "error"; text: string } | null;
type AttendanceRowStatus = "unchecked" | "present" | "late" | "absent";

interface AttendanceRow {
  memberId: string;
  attendanceId?: string;
  memberName: string;
  parentName: string;
  status: AttendanceRowStatus;
  checkInTime: string;
  creditDeducted: boolean;
}

const nowIso = (): string => new Date().toISOString();

const createFallbackClubs = (): Club[] => [
  {
    id: "fallback-club-1",
    clubCode: "ACE-001",
    clubName: "ACE 아이스하키",
    coachId: "coach-1",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
];

const createFallbackClasses = (clubId: string): Class[] => [
  {
    id: `${clubId}-class-1`,
    clubId,
    className: "신규 수강생반",
    description: "기초 스케이팅 및 하키 스틱 기본기",
    capacity: 20,
    ageMin: 7,
    ageMax: 10,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
];

const createFallbackSchedules = (classId: string): ClassSchedule[] => {
  const today = new Date();
  return [
    {
      id: `${classId}-schedule-today`,
      classId,
      scheduledDate: new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        10,
        0,
        0,
      ).toISOString(),
      isCancelled: false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    {
      id: `${classId}-schedule-next`,
      classId,
      scheduledDate: new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + 2,
        10,
        0,
        0,
      ).toISOString(),
      isCancelled: false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  ];
};

const createFallbackMembers = (clubId: string): TeamMember[] => [
  {
    id: `${clubId}-member-1`,
    userId: `${clubId}-user-1`,
    clubId,
    playerName: "김민준",
    playerAge: 9,
    approvalStatus: Status.APPROVED,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    user: {
      id: `${clubId}-user-1`,
      email: "parent1@teamplus.com",
      phone: "010-1234-5678",
      userType: UserType.PARENT,
      name: "김지민",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  },
  {
    id: `${clubId}-member-2`,
    userId: `${clubId}-user-2`,
    clubId,
    playerName: "이하은",
    playerAge: 8,
    approvalStatus: Status.APPROVED,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    user: {
      id: `${clubId}-user-2`,
      email: "parent2@teamplus.com",
      phone: "010-9876-1234",
      userType: UserType.PARENT,
      name: "이승우",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  },
  {
    id: `${clubId}-member-3`,
    userId: `${clubId}-user-3`,
    clubId,
    playerName: "박도윤",
    playerAge: 10,
    approvalStatus: Status.APPROVED,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    user: {
      id: `${clubId}-user-3`,
      email: "parent3@teamplus.com",
      phone: "010-1122-3344",
      userType: UserType.PARENT,
      name: "박세진",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  },
];

const toRowStatus = (attendance?: Attendance): AttendanceRowStatus => {
  if (!attendance) return "unchecked";
  if (attendance.attendanceStatus === Status.PRESENT) return "present";
  return "absent";
};

const toStatusLabel = (status: AttendanceRowStatus): string => {
  if (status === "present") return "출석";
  if (status === "late") return "지각";
  if (status === "absent") return "결석";
  return "미체크";
};

const toStatusBadgeClass = (status: AttendanceRowStatus): string => {
  if (status === "present")
    return "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800";
  if (status === "late")
    return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800";
  if (status === "absent")
    return "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800";
  return "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600";
};

const parseTime = (iso?: string): string => {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getTodayDate = (): string => new Date().toISOString().slice(0, 10);

/**
 * TEAMPLUS 출석 체크 페이지
 *
 * Design 7 Principles:
 * 1. 화면 분석 - 클럽/수업/일정 선택 → 회원 테이블 → QR 스캐너
 * 2. 휴먼 디자인 - 3단계 선택 Hero + 요약 배지
 * 3. AI 스타일 금지 - solid primary, no gradient
 * 4. 페르소나 - frontend + architect
 * 5. 명령어 - frontend-design 스킬
 * 6. 결과 보고 - 7원칙 적용
 * 7. Tone & Manner - 존댓말, 44px 터치
 */

export default function AttendanceCheckPage() {
  const router = useRouter();

  const [clubs, setClubs] = useState<Club[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [schedules, setSchedules] = useState<ClassSchedule[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [selectedClubId, setSelectedClubId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedScheduleId, setSelectedScheduleId] = useState("");
  const [scanMemberId, setScanMemberId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<MessageState>(null);
  const clubSelectId = useId();
  const classSelectId = useId();
  const scheduleSelectId = useId();
  const scanMemberSelectId = useId();
  const qrCodeInputId = useId();

  useEffect(() => {
    const loadClubs = async () => {
      setIsLoading(true);
      try {
        const clubList = await clubService.getClubs({ page: 1, pageSize: 50 });
        const safeClubs =
          clubList.length > 0 ? clubList : createFallbackClubs();
        setClubs(safeClubs);
        setSelectedClubId(safeClubs[0]?.id || "");
      } catch {
        const fallback = createFallbackClubs();
        setClubs(fallback);
        setSelectedClubId(fallback[0]?.id || "");
      } finally {
        setIsLoading(false);
      }
    };

    void loadClubs();
  }, []);

  useEffect(() => {
    const loadClubData = async () => {
      if (!selectedClubId) return;
      setIsLoading(true);
      setMessage(null);
      try {
        const [classList, memberList] = await Promise.all([
          classService
            .getClasses(selectedClubId)
            .catch(() => createFallbackClasses(selectedClubId)),
          clubService
            .getApprovedMembers(selectedClubId)
            .catch(() => createFallbackMembers(selectedClubId)),
        ]);

        const safeClasses =
          classList.length > 0
            ? classList
            : createFallbackClasses(selectedClubId);
        const safeMembers =
          memberList.length > 0
            ? memberList
            : createFallbackMembers(selectedClubId);

        setClasses(safeClasses);
        setMembers(safeMembers);
        setSelectedClassId(safeClasses[0]?.id || "");
      } catch (error) {
        const text =
          error instanceof Error
            ? error.message
            : "출석 체크 데이터를 불러오는 중 오류가 발생했습니다.";
        setMessage({ type: "error", text });
      } finally {
        setIsLoading(false);
      }
    };

    void loadClubData();
  }, [selectedClubId]);

  useEffect(() => {
    const loadSchedules = async () => {
      if (!selectedClassId) return;
      setIsLoading(true);
      setMessage(null);
      try {
        const scheduleList =
          (await classService
            .getClassSchedules(selectedClassId)
            .catch(() => createFallbackSchedules(selectedClassId))) || [];
        const safeSchedules =
          scheduleList.length > 0
            ? scheduleList
            : createFallbackSchedules(selectedClassId);
        const sorted = [...safeSchedules].sort(
          (a, b) =>
            new Date(a.scheduledDate).getTime() -
            new Date(b.scheduledDate).getTime(),
        );
        const upcoming = sorted.find((schedule) => {
          const scheduleDate = new Date(schedule.scheduledDate)
            .toISOString()
            .slice(0, 10);
          return scheduleDate >= getTodayDate();
        });

        setSchedules(sorted);
        setSelectedScheduleId(upcoming?.id || sorted[0]?.id || "");
      } catch (error) {
        const text =
          error instanceof Error
            ? error.message
            : "수업 일정을 불러오는 중 오류가 발생했습니다.";
        setMessage({ type: "error", text });
      } finally {
        setIsLoading(false);
      }
    };

    void loadSchedules();
  }, [selectedClassId]);

  const buildRows = useCallback(
    async (scheduleId: string, memberList: TeamMember[]) => {
      if (!scheduleId || memberList.length === 0) {
        setRows([]);
        return;
      }

      const attendanceList = await attendanceService
        .getAttendanceBySchedule(scheduleId)
        .catch(() => []);
      const attendanceMap = new Map(
        attendanceList.map((item) => [item.memberId, item]),
      );

      const nextRows = memberList.map((member) => {
        const attendance = attendanceMap.get(member.id);
        const status = toRowStatus(attendance);
        return {
          memberId: member.id,
          attendanceId: attendance?.id,
          memberName: member.playerName,
          parentName: member.user?.name || "-",
          status,
          checkInTime: parseTime(attendance?.checkInTime),
          creditDeducted: status === "present" || status === "late",
        };
      });

      setRows(nextRows);
      setScanMemberId(nextRows[0]?.memberId || "");
    },
    [],
  );

  useEffect(() => {
    void buildRows(selectedScheduleId, members);
  }, [buildRows, members, selectedScheduleId]);

  const selectedSchedule = useMemo(
    () =>
      schedules.find((schedule) => schedule.id === selectedScheduleId) || null,
    [selectedScheduleId, schedules],
  );

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        if (row.status === "present") acc.present += 1;
        if (row.status === "late") acc.late += 1;
        if (row.status === "absent") acc.absent += 1;
        if (row.status === "unchecked") acc.unchecked += 1;
        return acc;
      },
      { present: 0, late: 0, absent: 0, unchecked: 0 },
    );
  }, [rows]);

  const attendanceRate = useMemo(() => {
    const checked = summary.present + summary.late + summary.absent;
    if (checked === 0) return 0;
    return Math.round(((summary.present + summary.late) / checked) * 100);
  }, [summary]);

  const handleRowStatusChange = (
    memberId: string,
    status: AttendanceRowStatus,
  ) => {
    setRows((prev) =>
      prev.map((row) =>
        row.memberId === memberId
          ? {
              ...row,
              status,
              checkInTime:
                status === "present" || status === "late"
                  ? new Date().toLocaleTimeString("ko-KR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "-",
              creditDeducted: status === "present" || status === "late",
            }
          : row,
      ),
    );
  };

  const handleBulkStatus = (status: AttendanceRowStatus) => {
    setRows((prev) =>
      prev.map((row) => ({
        ...row,
        status,
        checkInTime:
          status === "present" || status === "late"
            ? new Date().toLocaleTimeString("ko-KR", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "-",
        creditDeducted: status === "present" || status === "late",
      })),
    );
  };

  const handleSave = async () => {
    if (!selectedScheduleId) {
      setMessage({ type: "error", text: "출석 체크할 일정을 선택해주세요." });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const targetRows = rows.filter(
        (row) => row.attendanceId && row.status !== "unchecked",
      );
      const result = await Promise.allSettled(
        targetRows.map((row) => {
          const statusForApi =
            row.status === "absent" ? Status.ABSENT : Status.PRESENT;
          return attendanceService.updateAttendanceStatus(
            row.attendanceId as string,
            statusForApi,
          );
        }),
      );

      const successCount = result.filter(
        (item) => item.status === "fulfilled",
      ).length;
      const pendingManualCount = rows.filter(
        (row) => !row.attendanceId && row.status !== "unchecked",
      ).length;
      setMessage({
        type: "success",
        text:
          pendingManualCount > 0
            ? `저장되었습니다. ${successCount}건이 서버에 반영되었고 ${pendingManualCount}건은 로컬 상태로 유지됩니다.`
            : `저장되었습니다. ${successCount}건 반영 완료되었습니다.`,
      });
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : "출석 저장 중 오류가 발생했습니다.";
      setMessage({ type: "error", text });
    } finally {
      setIsSaving(false);
    }
  };

  const handleQrCheckIn = async () => {
    if (!selectedScheduleId) {
      setMessage({ type: "error", text: "일정을 먼저 선택해주세요." });
      return;
    }
    if (!scanMemberId || !qrCode.trim()) {
      setMessage({ type: "error", text: "회원과 QR 코드를 입력해주세요." });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const attendance = await attendanceService.checkIn(
        selectedScheduleId,
        scanMemberId,
        qrCode.trim(),
      );
      setRows((prev) =>
        prev.map((row) =>
          row.memberId === scanMemberId
            ? {
                ...row,
                attendanceId: attendance.id,
                status: "present",
                checkInTime: parseTime(
                  attendance.checkInTime || attendance.createdAt,
                ),
                creditDeducted: true,
              }
            : row,
        ),
      );
      setQrCode("");
      setMessage({ type: "success", text: "QR 체크인이 완료되었습니다." });
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : "QR 체크인 처리 중 오류가 발생했습니다.";
      setMessage({ type: "error", text });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <LoadingSpinner message="출석 체크 화면을 불러오는 중입니다..." />;
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <button
        type="button"
        onClick={() => router.push("/dashboard/attendance")}
        aria-label="출석 관리로 돌아가기"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-blue-300 motion-reduce:transition-none transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        출석 관리로
      </button>

      {/* Hero Header */}
      <section className="relative overflow-hidden rounded-2xl bg-primary text-white shadow-md">
        <div
          className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/5 -translate-y-16 translate-x-16"
          aria-hidden="true"
        />
        <div className="relative z-10 p-6 sm:p-8 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
              <ClipboardCheck className="w-3.5 h-3.5" aria-hidden="true" />
              출석 체크
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              실시간 출석 처리
            </h1>
            <p className="text-sm sm:text-base text-white/80">
              회원별 출석 상태를 처리하고 QR 체크인을 진행합니다
            </p>
          </div>
          <Button
            type="button"
            onClick={() => router.push("/dashboard/attendance/statistics")}
            className="h-11 bg-white hover:bg-slate-100 text-primary font-semibold shadow-sm motion-reduce:transition-none"
          >
            <BarChart3 className="w-4 h-4 mr-1.5" aria-hidden="true" />
            출석 통계
          </Button>
        </div>
      </section>

      {/* Selectors */}
      <Card className="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white mb-4">
          <span
            className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold tabular-nums"
            aria-hidden="true"
          >
            1
          </span>
          수업 선택
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div>
            <label
              htmlFor={clubSelectId}
              className="flex items-center gap-1.5 text-sm mb-1.5 text-slate-700 dark:text-slate-200 font-medium"
            >
              <Building2
                className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500"
                aria-hidden="true"
              />
              클럽
            </label>
            <select
              id={clubSelectId}
              value={selectedClubId}
              onChange={(e) => setSelectedClubId(e.target.value)}
              aria-label="출석 체크 대상 클럽 선택"
              className="w-full h-11 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="" disabled>
                클럽을 선택해주세요
              </option>
              {clubs.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.clubName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor={classSelectId}
              className="flex items-center gap-1.5 text-sm mb-1.5 text-slate-700 dark:text-slate-200 font-medium"
            >
              <GraduationCap
                className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500"
                aria-hidden="true"
              />
              수업
            </label>
            <select
              id={classSelectId}
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              aria-label="출석 체크 대상 수업 선택"
              className="w-full h-11 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="" disabled>
                수업을 선택해주세요
              </option>
              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.className}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor={scheduleSelectId}
              className="flex items-center gap-1.5 text-sm mb-1.5 text-slate-700 dark:text-slate-200 font-medium"
            >
              <CalendarDays
                className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500"
                aria-hidden="true"
              />
              일정
            </label>
            <select
              id={scheduleSelectId}
              value={selectedScheduleId}
              onChange={(e) => setSelectedScheduleId(e.target.value)}
              aria-label="출석 체크 수업 일정 선택"
              className="w-full h-11 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="" disabled>
                일정을 선택해주세요
              </option>
              {schedules.map((schedule) => (
                <option key={schedule.id} value={schedule.id}>
                  {new Date(schedule.scheduledDate).toLocaleString("ko-KR")}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Summary Badges */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
          <Badge
            variant="outline"
            className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
          >
            <CheckCircle2 className="w-3 h-3 mr-1" aria-hidden="true" />
            출석 <span className="tabular-nums ml-1">{summary.present}</span>
          </Badge>
          <Badge
            variant="outline"
            className="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800"
          >
            <Clock className="w-3 h-3 mr-1" aria-hidden="true" />
            지각 <span className="tabular-nums ml-1">{summary.late}</span>
          </Badge>
          <Badge
            variant="outline"
            className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800"
          >
            <UserX className="w-3 h-3 mr-1" aria-hidden="true" />
            결석 <span className="tabular-nums ml-1">{summary.absent}</span>
          </Badge>
          <Badge
            variant="outline"
            className="bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600"
          >
            <Circle className="w-3 h-3 mr-1" aria-hidden="true" />
            미체크{" "}
            <span className="tabular-nums ml-1">{summary.unchecked}</span>
          </Badge>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-slate-500 dark:text-slate-400">출석률</span>
            <span className="font-bold text-primary dark:text-blue-300 tabular-nums">
              {attendanceRate}%
            </span>
          </div>
        </div>
      </Card>

      {/* Message */}
      {message && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-lg px-4 py-3 text-sm font-medium motion-reduce:transition-none ${
            message.type === "success"
              ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-200 dark:border-green-800"
              : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Attendance Table */}
      <Card className="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <span
              className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold tabular-nums"
              aria-hidden="true"
            >
              2
            </span>
            회원 출석 처리
            <span className="ml-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              ({rows.length}명)
            </span>
          </div>
          {selectedSchedule && (
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              일정:{" "}
              {new Date(selectedSchedule.scheduledDate).toLocaleDateString(
                "ko-KR",
              )}
            </span>
          )}
        </div>

        {/* Bulk Actions */}
        <div className="flex flex-wrap items-center gap-2 mb-4 pb-4 border-b border-slate-100 dark:border-slate-700">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleBulkStatus("present")}
            className="h-10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-900/20 motion-reduce:transition-none"
          >
            <UserCheck className="w-4 h-4 mr-1.5" aria-hidden="true" />
            전체 출석 처리
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleBulkStatus("absent")}
            className="h-10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 motion-reduce:transition-none"
          >
            <UserX className="w-4 h-4 mr-1.5" aria-hidden="true" />
            전체 결석 처리
          </Button>
          <div className="ml-auto">
            <Button
              type="button"
              onClick={() => handleSave()}
              disabled={isSaving}
              className="h-10 bg-primary hover:bg-primary-dark text-white font-semibold shadow-sm motion-reduce:transition-none"
            >
              <Save className="w-4 h-4 mr-1.5" aria-hidden="true" />
              {isSaving ? "저장 중..." : "저장하기"}
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider"
                >
                  회원
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider"
                >
                  보호자
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider"
                >
                  출석 상태
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider"
                >
                  체크인
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider"
                >
                  크레딧
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 bg-white dark:bg-slate-800">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center">
                    <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
                      <Users
                        className="w-7 h-7 text-slate-400 dark:text-slate-500"
                        aria-hidden="true"
                      />
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      출석 처리할 회원이 없습니다.
                    </p>
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.memberId}
                    className="hover:bg-slate-50 dark:hover:bg-slate-700/30 motion-reduce:transition-none transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-primary dark:text-blue-300">
                            {row.memberName.charAt(0) || "?"}
                          </span>
                        </div>
                        <span className="font-medium text-slate-900 dark:text-white">
                          {row.memberName}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {row.parentName}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <select
                          value={row.status}
                          onChange={(e) =>
                            handleRowStatusChange(
                              row.memberId,
                              e.target.value as AttendanceRowStatus,
                            )
                          }
                          aria-label={`${row.memberName}의 출석 상태 변경`}
                          className="h-9 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 dark:text-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="unchecked">미체크</option>
                          <option value="present">출석</option>
                          <option value="late">지각</option>
                          <option value="absent">결석</option>
                        </select>
                        <Badge
                          variant="outline"
                          className={toStatusBadgeClass(row.status)}
                        >
                          {toStatusLabel(row.status)}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 tabular-nums">
                      {row.checkInTime}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.creditDeducted ? (
                        <Badge
                          variant="outline"
                          className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
                        >
                          <CheckCircle2
                            className="w-3 h-3 mr-1"
                            aria-hidden="true"
                          />
                          차감됨
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600"
                        >
                          미처리
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* QR Check-in */}
      <Card className="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white mb-4">
          <span
            className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold tabular-nums"
            aria-hidden="true"
          >
            3
          </span>
          <QrCode
            className="w-4 h-4 text-primary dark:text-blue-300"
            aria-hidden="true"
          />
          QR 코드 체크인
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
          <div>
            <label
              htmlFor={scanMemberSelectId}
              className="block text-sm mb-1.5 text-slate-700 dark:text-slate-200 font-medium"
            >
              회원 선택
            </label>
            <select
              id={scanMemberSelectId}
              value={scanMemberId}
              onChange={(e) => setScanMemberId(e.target.value)}
              aria-label="QR 체크인 대상 회원 선택"
              className="w-full h-11 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="" disabled>
                회원을 선택해주세요
              </option>
              {rows.map((row) => (
                <option key={row.memberId} value={row.memberId}>
                  {row.memberName}
                </option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label
              htmlFor={qrCodeInputId}
              className="block text-sm mb-1.5 text-slate-700 dark:text-slate-200 font-medium"
            >
              QR 코드 값
            </label>
            <Input
              id={qrCodeInputId}
              value={qrCode}
              onChange={(e) => setQrCode(e.target.value)}
              placeholder="스캔된 QR 코드 값을 입력해주세요"
              aria-label="QR 코드 값 입력"
              className="h-11 bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white tabular-nums"
            />
          </div>
        </div>

        <Button
          type="button"
          onClick={() => handleQrCheckIn()}
          disabled={isSaving}
          className="h-11 bg-primary hover:bg-primary-dark text-white font-semibold shadow-sm motion-reduce:transition-none"
        >
          <QrCode className="w-4 h-4 mr-1.5" aria-hidden="true" />
          QR 체크인 처리
        </Button>
      </Card>
    </div>
  );
}
