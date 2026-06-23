"use client";

import { useState, useCallback, useRef } from "react";
import { MESSAGES } from "@/lib/messages";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  Upload,
  FileSpreadsheet,
  Check,
  AlertCircle,
  Trash2,
  Users,
  Trophy,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Info,
  FileDown,
} from "lucide-react";
import { api } from "@/services/api-client";
// ⚡ xlsx는 ~430KB로 번들 사이즈 이슈 — dynamic import로 전환하여 초기 로드 시 제외
// 타입은 컴파일 타임에만 필요하므로 유지, 실제 모듈은 사용 시점에 로드

/**
 * TEAMPLUS 대량 엑셀 업로드 페이지
 *
 * 지원 데이터:
 *   1. 팀 목록 (teams)
 *   2. 선수 목록 (players)
 *   3. 경기 일정 (schedules)
 *
 * 워크플로우:
 *   파일 드래그&드롭 → 엑셀 파싱 → 미리보기 → 유효성 검증 → 서버 전송
 */

// ── 타입 정의 ──────────────────────────────────────
type ImportType = "teams" | "players" | "schedules";

interface ImportTypeConfig {
  key: ImportType;
  label: string;
  description: string;
  icon: typeof Users;
  columns: ColumnDef[];
  apiEndpoint: string;
  templateFileName: string;
}

interface ColumnDef {
  key: string;
  label: string;
  required: boolean;
  type: "string" | "number" | "date" | "email";
}

interface ParsedRow {
  _rowIndex: number;
  _errors: string[];
  _isValid: boolean;
  [key: string]: string | number | boolean | string[];
}

interface ImportResult {
  success: boolean;
  totalRows: number;
  successCount: number;
  failCount: number;
  errors?: Array<{ row: number; message: string }>;
}

// ── 임포트 타입 설정 ────────────────────────────────
const IMPORT_CONFIGS: ImportTypeConfig[] = [
  {
    key: "teams",
    label: "팀 목록",
    description: "클럽 내 팀 정보를 일괄 등록합니다.",
    icon: Users,
    apiEndpoint: "/admin/import/teams",
    templateFileName: "teamplus_teams_template.xlsx",
    columns: [
      { key: "name", label: "팀명", required: true, type: "string" },
      { key: "division", label: "디비전", required: false, type: "string" },
      { key: "ageGroup", label: "연령대", required: false, type: "string" },
      { key: "coachName", label: "담당코치", required: false, type: "string" },
      { key: "maxMembers", label: "최대인원", required: false, type: "number" },
      { key: "description", label: "비고", required: false, type: "string" },
    ],
  },
  {
    key: "players",
    label: "선수 목록",
    description: "선수 정보를 일괄 등록합니다.",
    icon: Trophy,
    apiEndpoint: "/admin/import/players",
    templateFileName: "teamplus_players_template.xlsx",
    columns: [
      { key: "name", label: "선수명", required: true, type: "string" },
      { key: "birthDate", label: "생년월일", required: true, type: "date" },
      { key: "parentName", label: "보호자명", required: false, type: "string" },
      {
        key: "parentPhone",
        label: "보호자 연락처",
        required: false,
        type: "string",
      },
      {
        key: "parentEmail",
        label: "보호자 이메일",
        required: false,
        type: "email",
      },
      { key: "teamName", label: "소속팀", required: false, type: "string" },
      { key: "position", label: "포지션", required: false, type: "string" },
      { key: "jerseyNumber", label: "등번호", required: false, type: "number" },
    ],
  },
  {
    key: "schedules",
    label: "경기 일정",
    description: "대회/경기 일정을 일괄 등록합니다.",
    icon: Calendar,
    apiEndpoint: "/admin/import/schedules",
    templateFileName: "teamplus_schedules_template.xlsx",
    columns: [
      { key: "title", label: "경기명", required: true, type: "string" },
      { key: "date", label: "경기일", required: true, type: "date" },
      { key: "time", label: "시작시간", required: false, type: "string" },
      { key: "venue", label: "경기장", required: false, type: "string" },
      { key: "homeTeam", label: "홈팀", required: false, type: "string" },
      { key: "awayTeam", label: "원정팀", required: false, type: "string" },
      { key: "tournament", label: "대회명", required: false, type: "string" },
      { key: "description", label: "비고", required: false, type: "string" },
    ],
  },
];

// ── 유효성 검증 ──────────────────────────────────────
function validateRow(
  row: Record<string, unknown>,
  columns: ColumnDef[],
  rowIndex: number,
): ParsedRow {
  const errors: string[] = [];

  columns.forEach((col) => {
    const value = row[col.label] ?? row[col.key] ?? "";
    const strValue = String(value).trim();

    // 필수 필드 검증
    if (col.required && (!strValue || strValue === "undefined")) {
      errors.push(`${col.label} 항목은 필수입니다.`);
      return;
    }

    if (!strValue || strValue === "undefined") return;

    // 타입 검증
    if (col.type === "number" && isNaN(Number(strValue))) {
      errors.push(`${col.label} 항목은 숫자여야 합니다.`);
    }

    if (
      col.type === "email" &&
      strValue &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strValue)
    ) {
      errors.push(`${col.label} 항목의 이메일 형식이 올바르지 않습니다.`);
    }

    if (col.type === "date" && strValue) {
      const dateVal = new Date(strValue);
      if (isNaN(dateVal.getTime())) {
        errors.push(`${col.label} 항목의 날짜 형식이 올바르지 않습니다.`);
      }
    }
  });

  const parsedRow: ParsedRow = {
    _rowIndex: rowIndex,
    _errors: errors,
    _isValid: errors.length === 0,
  };

  columns.forEach((col) => {
    const value = row[col.label] ?? row[col.key] ?? "";
    parsedRow[col.key] = String(value).trim();
  });

  return parsedRow;
}

// ── 엑셀 날짜 시리얼 → 문자열 변환 ─────────────────
function excelDateToString(serial: number): string {
  const utcDays = Math.floor(serial - 25569);
  const date = new Date(utcDays * 86400 * 1000);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ── 미리보기 페이지네이션 ────────────────────────────
const PREVIEW_PAGE_SIZE = 10;

export default function BulkImportPage() {
  const [selectedType, setSelectedType] = useState<ImportType>("teams");
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<ImportResult | null>(null);
  const [previewPage, setPreviewPage] = useState(1);
  const [dragActive, setDragActive] = useState(false);
  const [actionMsg, setActionMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const config = IMPORT_CONFIGS.find((c) => c.key === selectedType)!;
  const validCount = parsedData.filter((r) => r._isValid).length;
  const errorCount = parsedData.filter((r) => !r._isValid).length;
  const totalPages = Math.ceil(parsedData.length / PREVIEW_PAGE_SIZE);
  const pageData = parsedData.slice(
    (previewPage - 1) * PREVIEW_PAGE_SIZE,
    previewPage * PREVIEW_PAGE_SIZE,
  );

  // ── 파일 파싱 ──────────────────────────────────────
  const parseFile = useCallback(
    async (selectedFile: File) => {
      setIsParsing(true);
      setUploadResult(null);
      setParsedData([]);
      setPreviewPage(1);

      try {
        // ⚡ dynamic import — xlsx 번들 지연 로드 (초기 번들 -430KB)
        const XLSX = await import("xlsx");
        const buffer = await selectedFile.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });

        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          setActionMsg({ type: "error", text: MESSAGES.systemImport.noSheets });
          setFile(null);
          return;
        }

        const sheet = workbook.Sheets[firstSheetName];
        const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(
          sheet,
          { defval: "" },
        );

        if (rawData.length === 0) {
          setActionMsg({
            type: "error",
            text: "엑셀 파일에 데이터가 없습니다. 헤더 행 다음에 데이터를 입력해주세요.",
          });
          setFile(null);
          return;
        }

        // 날짜 시리얼 넘버 → 문자열 변환
        const dateColumns = config.columns.filter((c) => c.type === "date");
        const processed = rawData.map((row) => {
          const processedRow = { ...row };
          dateColumns.forEach((col) => {
            const headerKey = col.label in processedRow ? col.label : col.key;
            const val = processedRow[headerKey];
            if (typeof val === "number" && val > 10000) {
              processedRow[headerKey] = excelDateToString(val);
            }
          });
          return processedRow;
        });

        const validated = processed.map((row, idx) =>
          validateRow(row, config.columns, idx + 2),
        );

        setParsedData(validated);
        setFile(selectedFile);

        const vCount = validated.filter((r) => r._isValid).length;
        const eCount = validated.filter((r) => !r._isValid).length;

        if (eCount > 0) {
          setActionMsg({
            type: "error",
            text: `파일 분석 완료: 총 ${validated.length}행 중 ${eCount}행에 오류가 있습니다. 오류 행은 업로드 시 제외됩니다.`,
          });
        } else {
          setActionMsg({
            type: "success",
            text: `파일 분석 완료: ${vCount}행 모두 정상입니다.`,
          });
        }
      } catch (err) {
        console.error("[Import] 파일 파싱 실패:", err);
        setActionMsg({
          type: "error",
          text: "파일을 읽는 중 오류가 발생했습니다. 올바른 엑셀 파일(.xlsx, .xls)인지 확인해주세요.",
        });
        setFile(null);
      } finally {
        setIsParsing(false);
        setTimeout(() => setActionMsg(null), 5000);
      }
    },
    [config],
  );

  // ── 드래그 앤 드롭 ────────────────────────────────
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile) {
        const ext = droppedFile.name.split(".").pop()?.toLowerCase();
        if (ext === "xlsx" || ext === "xls") {
          parseFile(droppedFile);
        } else {
          setActionMsg({
            type: "error",
            text: "엑셀 파일(.xlsx, .xls)만 업로드할 수 있습니다.",
          });
          setTimeout(() => setActionMsg(null), 3000);
        }
      }
    },
    [parseFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) {
        parseFile(selectedFile);
      }
      // 같은 파일 재선택 허용
      e.target.value = "";
    },
    [parseFile],
  );

  // ── 파일 제거 ──────────────────────────────────────
  const handleRemoveFile = () => {
    setFile(null);
    setParsedData([]);
    setUploadResult(null);
    setPreviewPage(1);
    setActionMsg(null);
  };

  // ── 서버 업로드 ────────────────────────────────────
  const handleUpload = async () => {
    const validRows = parsedData.filter((r) => r._isValid);
    if (validRows.length === 0) {
      setActionMsg({
        type: "error",
        text: "업로드할 유효한 데이터가 없습니다.",
      });
      setTimeout(() => setActionMsg(null), 3000);
      return;
    }

    setIsUploading(true);
    setUploadResult(null);

    try {
      // 메타데이터 제거 후 순수 데이터만 전송
      const cleanData = validRows.map((row) => {
        const clean: Record<string, unknown> = {};
        config.columns.forEach((col) => {
          clean[col.key] = row[col.key];
        });
        return clean;
      });

      const result = await api.post<ImportResult>(config.apiEndpoint, {
        type: selectedType,
        data: cleanData,
      });

      setUploadResult(
        result ?? {
          success: true,
          totalRows: cleanData.length,
          successCount: cleanData.length,
          failCount: 0,
        },
      );

      setActionMsg({
        type: "success",
        text: `${cleanData.length}건의 데이터가 성공적으로 업로드되었습니다.`,
      });
    } catch (err) {
      console.error("[Import] 업로드 실패:", err);
      setUploadResult({
        success: false,
        totalRows: validRows.length,
        successCount: 0,
        failCount: validRows.length,
        errors: [
          { row: 0, message: "서버 오류가 발생했습니다. 다시 시도해주세요." },
        ],
      });
      setActionMsg({
        type: "error",
        text: "업로드에 실패했습니다. 다시 시도해주세요.",
      });
    } finally {
      setIsUploading(false);
      setTimeout(() => setActionMsg(null), 5000);
    }
  };

  // ── 템플릿 다운로드 ────────────────────────────────
  const handleDownloadTemplate = async () => {
    // ⚡ dynamic import — xlsx 번들 지연 로드 (초기 번들 -430KB)
    const XLSX = await import("xlsx");
    const headers = config.columns.map((c) => c.label);
    const ws = XLSX.utils.aoa_to_sheet([headers]);

    // 열 너비 설정
    ws["!cols"] = config.columns.map((c) => ({
      wch: Math.max(c.label.length * 2, 12),
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, config.label);
    XLSX.writeFile(wb, config.templateFileName);
  };

  // ── 타입 변경 시 초기화 ────────────────────────────
  const handleTypeChange = (type: ImportType) => {
    setSelectedType(type);
    handleRemoveFile();
  };

  return (
    <div className="p-6 space-y-6">
      {/* 인라인 메시지 */}
      {actionMsg && (
        <div
          role="status"
          aria-live="polite"
          className={`px-4 py-3 rounded-lg text-sm font-medium border ${
            actionMsg.type === "success"
              ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800"
              : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-800"
          }`}
        >
          {actionMsg.text}
        </div>
      )}

      <PageHeader
        title="대량 데이터 업로드"
        description="엑셀 파일로 팀 · 선수 · 경기 일정을 일괄 등록합니다"
      />

      {/* 안내 카드 */}
      <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <Info
            className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <div className="text-sm text-blue-800 dark:text-blue-300 leading-relaxed">
            <p>
              엑셀 파일(.xlsx, .xls)을 업로드하면 데이터를 자동으로 분석합니다.
              아래 템플릿을 다운로드하여 양식에 맞게 작성해주세요.
            </p>
            <p className="mt-1 text-blue-700/80 dark:text-blue-400">
              필수 항목이 누락된 행은 자동으로 제외됩니다. 미리보기에서 오류
              내용을 확인할 수 있습니다.
            </p>
          </div>
        </div>
      </Card>

      {/* 데이터 유형 선택 */}
      <div
        role="radiogroup"
        aria-label="데이터 유형"
        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
      >
        {IMPORT_CONFIGS.map((cfg) => {
          const Icon = cfg.icon;
          const isSelected = selectedType === cfg.key;
          return (
            <button
              key={cfg.key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => handleTypeChange(cfg.key)}
              className={`min-h-[44px] p-4 rounded-xl border-2 text-left motion-reduce:transition-none transition-colors ${
                isSelected
                  ? "border-primary bg-blue-50 dark:bg-blue-900/20"
                  : "border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-lg shrink-0 ${
                    isSelected
                      ? "bg-blue-100 dark:bg-blue-900/40"
                      : "bg-slate-100 dark:bg-slate-700"
                  }`}
                >
                  <Icon
                    className={`h-5 w-5 ${
                      isSelected
                        ? "text-primary dark:text-blue-400"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                    aria-hidden="true"
                  />
                </div>
                <div className="min-w-0">
                  <p
                    className={`font-semibold text-sm truncate ${
                      isSelected
                        ? "text-primary dark:text-blue-300"
                        : "text-slate-900 dark:text-white"
                    }`}
                  >
                    {cfg.label}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {cfg.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* 필수 컬럼 안내 + 템플릿 다운로드 */}
      <Card className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {config.label} 입력 항목
          </h3>
          <Button
            variant="outline"
            onClick={handleDownloadTemplate}
            className="text-sm h-9 border-slate-200 dark:border-slate-600"
          >
            <FileDown className="h-4 w-4 mr-2" />
            템플릿 다운로드
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {config.columns.map((col) => (
            <Badge
              key={col.key}
              variant="outline"
              className={`text-xs ${
                col.required
                  ? "border-red-300 text-red-600 dark:border-red-700 dark:text-red-400"
                  : "border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-400"
              }`}
            >
              {col.label}
              {col.required && <span className="ml-1 text-red-500">*</span>}
              <span className="ml-1 text-slate-400">
                (
                {col.type === "date"
                  ? "날짜"
                  : col.type === "number"
                    ? "숫자"
                    : col.type === "email"
                      ? "이메일"
                      : "텍스트"}
                )
              </span>
            </Badge>
          ))}
        </div>
      </Card>

      {/* 파일 업로드 영역 */}
      {!file ? (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
            dragActive
              ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400"
              : "border-slate-300 bg-white dark:bg-slate-800 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileInput}
            className="hidden"
          />
          <div className="flex flex-col items-center gap-4">
            <div
              className={`p-4 rounded-full ${
                dragActive
                  ? "bg-blue-100 dark:bg-blue-900/30"
                  : "bg-slate-100 dark:bg-slate-700"
              }`}
            >
              <Upload
                className={`h-8 w-8 ${
                  dragActive
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-slate-400 dark:text-slate-500"
                }`}
              />
            </div>
            <div>
              <p className="text-slate-700 dark:text-slate-300 font-medium">
                엑셀 파일을 여기에 드래그하거나
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-blue-600 dark:text-blue-400 hover:underline font-medium mt-1"
              >
                파일을 선택해주세요
              </button>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              지원 형식: .xlsx, .xls (최대 5,000행)
            </p>
          </div>
        </div>
      ) : (
        /* 파일 선택됨 - 파일 정보 표시 */
        <Card className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <FileSpreadsheet className="h-5 w-5 text-green-700 dark:text-green-400" />
              </div>
              <div>
                <p className="font-medium text-slate-900 dark:text-white text-sm">
                  {file.name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {(file.size / 1024).toFixed(1)} KB
                  {parsedData.length > 0 && ` / ${parsedData.length}행`}
                </p>
              </div>
              {parsedData.length > 0 && (
                <div className="flex items-center gap-2 ml-4">
                  <Badge
                    variant="outline"
                    className="text-xs border-green-300 text-green-600 dark:border-green-700 dark:text-green-400"
                  >
                    <Check className="h-3 w-3 mr-1" />
                    정상 {validCount}건
                  </Badge>
                  {errorCount > 0 && (
                    <Badge
                      variant="outline"
                      className="text-xs border-red-300 text-red-600 dark:border-red-700 dark:text-red-400"
                    >
                      <AlertCircle className="h-3 w-3 mr-1" />
                      오류 {errorCount}건
                    </Badge>
                  )}
                </div>
              )}
            </div>
            <Button
              variant="outline"
              onClick={handleRemoveFile}
              className="h-9 text-sm border-slate-200 dark:border-slate-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              제거
            </Button>
          </div>
        </Card>
      )}

      {/* 파싱 로딩 */}
      {isParsing && (
        <LoadingSpinner
          message="파일을 분석하고 있습니다..."
          size="sm"
          minHeight={120}
        />
      )}

      {/* 미리보기 테이블 */}
      {parsedData.length > 0 && !isParsing && (
        <Card className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden rounded-xl">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              데이터 미리보기
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {previewPage} / {totalPages} 페이지
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 w-12">
                    행
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 w-16">
                    상태
                  </th>
                  {config.columns.map((col) => (
                    <th
                      key={col.key}
                      className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 min-w-[100px]"
                    >
                      {col.label}
                      {col.required && (
                        <span className="text-red-500 ml-0.5">*</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {pageData.map((row, idx) => (
                  <tr
                    key={idx}
                    className={`${
                      row._isValid
                        ? "hover:bg-slate-50 dark:hover:bg-slate-700/50"
                        : "bg-red-50/50 dark:bg-red-900/10 hover:bg-red-50 dark:hover:bg-red-900/20"
                    } transition-colors`}
                  >
                    <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
                      {row._rowIndex}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {row._isValid ? (
                        <Check className="h-4 w-4 text-green-500 mx-auto" />
                      ) : (
                        <div className="group relative">
                          <AlertCircle className="h-4 w-4 text-red-500 mx-auto cursor-help" />
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20">
                            <div className="bg-slate-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap max-w-xs">
                              {(row._errors as string[]).map((err, i) => (
                                <p key={`row-err-${i}-${err.slice(0, 16)}`}>
                                  {err}
                                </p>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </td>
                    {config.columns.map((col) => (
                      <td
                        key={col.key}
                        className="px-3 py-2.5 text-sm text-slate-700 dark:text-slate-300 truncate max-w-[200px]"
                        title={String(row[col.key] ?? "")}
                      >
                        {String(row[col.key] ?? "-")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                disabled={previewPage <= 1}
                className="h-8 w-8 p-0 border-slate-200 dark:border-slate-600"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-slate-600 dark:text-slate-400 px-3">
                {previewPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                onClick={() =>
                  setPreviewPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={previewPage >= totalPages}
                className="h-8 w-8 p-0 border-slate-200 dark:border-slate-600"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* 업로드 결과 */}
      {uploadResult && (
        <Card
          className={`p-4 border ${
            uploadResult.success
              ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800"
              : "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800"
          }`}
        >
          <div className="flex items-start gap-3">
            {uploadResult.success ? (
              <Check className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
            )}
            <div className="text-sm">
              <p
                className={`font-medium ${
                  uploadResult.success
                    ? "text-green-800 dark:text-green-300"
                    : "text-red-800 dark:text-red-300"
                }`}
              >
                {uploadResult.success ? "업로드 완료" : "업로드 실패"}
              </p>
              <p
                className={`mt-1 ${
                  uploadResult.success
                    ? "text-green-700 dark:text-green-400"
                    : "text-red-700 dark:text-red-400"
                }`}
              >
                전체 {uploadResult.totalRows}건 중 성공{" "}
                {uploadResult.successCount}건
                {uploadResult.failCount > 0 &&
                  `, 실패 ${uploadResult.failCount}건`}
              </p>
              {uploadResult.errors && uploadResult.errors.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {uploadResult.errors.slice(0, 5).map((err, i) => (
                    <li
                      key={`upload-err-${i}-${err.row}-${err.message.slice(0, 8)}`}
                      className="text-xs text-red-600 dark:text-red-400"
                    >
                      {err.row > 0 && `행 ${err.row}: `}
                      {err.message}
                    </li>
                  ))}
                  {uploadResult.errors.length > 5 && (
                    <li className="text-xs text-red-500 dark:text-red-500">
                      외 {uploadResult.errors.length - 5}건의 오류
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* 업로드 버튼 */}
      {parsedData.length > 0 && !isParsing && !uploadResult?.success && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            <span className="font-semibold text-slate-900 dark:text-white tabular-nums">
              {validCount}건
            </span>
            의 유효한 데이터를 서버에 업로드합니다.
            {errorCount > 0 && (
              <span className="text-red-600 dark:text-red-400 ml-1">
                (오류 <span className="tabular-nums">{errorCount}건</span> 제외)
              </span>
            )}
          </p>
          <Button
            type="button"
            onClick={() => handleUpload()}
            disabled={isUploading || validCount === 0}
            className="h-11 px-5 text-sm font-semibold bg-primary hover:bg-primary-dark text-white motion-reduce:transition-none"
          >
            <Upload className="h-4 w-4 mr-2" aria-hidden="true" />
            {isUploading ? "업로드 중..." : `${validCount}건 업로드하기`}
          </Button>
        </div>
      )}

      {/* 업로드 완료 후 액션 */}
      {uploadResult?.success && (
        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleRemoveFile()}
            className="h-11 px-5 text-sm font-semibold motion-reduce:transition-none"
          >
            새 파일 업로드
          </Button>
        </div>
      )}
    </div>
  );
}
