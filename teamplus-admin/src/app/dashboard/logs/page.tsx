"use client";

/**
 * /dashboard/logs — 4개 프로젝트 통합 실시간 로그 뷰어 (v8.6, 2026-05-20)
 *
 * - 프로젝트 탭: backend · web · admin · home
 * - 카테고리 셀렉트: access · input · output · activity · auth · payment · database · system
 *                 + errors(_all 통합) · errors-server · errors-transaction · ...
 * - 자동 새로고침: 5초 polling (incremental — from=lastTimestamp)
 * - 키워드 필터 (클라이언트 사이드)
 * - 라인 클릭 → JSON 파싱 디테일 모달
 */
import { useCallback, useEffect, useMemo, useState } from "react";

const PROJECTS = ["backend", "web", "admin", "home"] as const;
type Project = (typeof PROJECTS)[number];

const NORMAL_CATEGORIES = [
  "access",
  "input",
  "output",
  "activity",
  "auth",
  "payment",
  "database",
  "system",
] as const;

const ERROR_CATEGORIES = [
  "errors",
  "errors-server",
  "errors-transaction",
  "errors-client",
  "errors-auth",
  "errors-database",
  "errors-external",
] as const;

const POLL_INTERVAL_MS = 5000;
const DEFAULT_LINES = 200;
const MAX_DISPLAY_LINES = 2000;

interface LogLine {
  raw: string;
  parsed?: Record<string, unknown>;
}

export default function LogsPage() {
  const [project, setProject] = useState<Project>("backend");
  const [category, setCategory] = useState<string>("system");
  const [lines, setLines] = useState<LogLine[]>([]);
  const [keyword, setKeyword] = useState("");
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ file?: string; total?: number; exists?: boolean }>({});
  // v8.6 P5-3 — SSE 실시간 push (toggle: 기본 ON, 끄면 polling으로 폴백)
  const [sseMode, setSseMode] = useState(true);
  const [sseConnected, setSseConnected] = useState(false);

  const fetchTail = useCallback(async () => {
    try {
      const url = `/api/logs/tail?project=${project}&category=${category}&lines=${DEFAULT_LINES}`;
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (!json.success) {
        setError(json.error ?? "FETCH_FAILED");
        return;
      }
      const newLines: LogLine[] = (json.lines as string[]).map((raw) => {
        try {
          return { raw, parsed: JSON.parse(raw) };
        } catch {
          return { raw };
        }
      });
      setLines(newLines);
      setMeta({ file: json.file, total: json.total, exists: json.exists });
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [project, category]);

  // 최초 + project/category 변경 시 (SSE OFF 또는 초기 로딩)
  useEffect(() => {
    if (!sseMode || paused) {
      void fetchTail();
    }
  }, [fetchTail, sseMode, paused, project, category]);

  // 5초 polling (SSE OFF일 때만)
  useEffect(() => {
    if (paused || sseMode) return;
    const id = setInterval(() => {
      void fetchTail();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchTail, paused, sseMode]);

  // v8.6 P5-3 — SSE 실시간 push
  useEffect(() => {
    if (!sseMode || paused) {
      setSseConnected(false);
      return;
    }
    const url = `/api/logs/stream?project=${project}&category=${category}`;
    const es = new EventSource(url);

    es.addEventListener("connected", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data);
        setMeta({ file: data.file, exists: true });
        setLines([]); // 새 스트림 시작 — 초기화
        setSseConnected(true);
        setError(null);
      } catch {
        /* swallow */
      }
    });

    es.addEventListener("line", (ev) => {
      try {
        const { line } = JSON.parse((ev as MessageEvent).data) as { line: string };
        const newLine: LogLine = (() => {
          try {
            return { raw: line, parsed: JSON.parse(line) };
          } catch {
            return { raw: line };
          }
        })();
        setLines((prev) => {
          const next = [...prev, newLine];
          return next.length > MAX_DISPLAY_LINES
            ? next.slice(-MAX_DISPLAY_LINES)
            : next;
        });
      } catch {
        /* swallow */
      }
    });

    es.addEventListener("warning", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data);
        setError(`경고: ${data.message ?? "UNKNOWN"}`);
      } catch {
        /* swallow */
      }
    });

    es.addEventListener("info", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data);
        if (data.message === "FILE_ROTATED") {
          setLines((prev) => [
            ...prev,
            { raw: `[INFO] 파일이 회전됐습니다. 새 파일 추적 시작.` },
          ]);
        }
      } catch {
        /* swallow */
      }
    });

    es.onerror = () => {
      setSseConnected(false);
      setError("SSE 연결 끊김 — 자동 재연결 시도");
    };

    return () => {
      es.close();
      setSseConnected(false);
    };
  }, [project, category, sseMode, paused]);

  // 키워드 필터 (클라이언트)
  const filteredLines = useMemo(() => {
    if (!keyword.trim()) return lines;
    const kw = keyword.toLowerCase();
    return lines.filter((l) => l.raw.toLowerCase().includes(kw));
  }, [lines, keyword]);

  const downloadFile = () => {
    const content = lines.map((l) => l.raw).join("\n");
    const blob = new Blob([content], { type: "application/x-jsonlines" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project}-${category}-${new Date().toISOString()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-screen flex-col bg-slate-50 p-4 dark:bg-slate-900">
      {/* 헤더 — 프로젝트 탭 */}
      <div className="mb-3 flex items-center gap-2">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">통합 로그 뷰어</h1>
        <span className="text-xs text-slate-500">
          v8.6 · {sseMode ? `SSE 실시간 ${sseConnected ? "🟢" : "🔴"}` : "5초 polling"}
        </span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-800">
        {/* 프로젝트 탭 */}
        <div className="flex gap-1">
          {PROJECTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProject(p)}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                project === p
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="mx-2 h-6 w-px bg-slate-300 dark:bg-slate-600" />

        {/* 카테고리 셀렉트 */}
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
        >
          <optgroup label="일반">
            {NORMAL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </optgroup>
          <optgroup label="오류">
            {ERROR_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c === "errors" ? "errors (통합)" : c}
              </option>
            ))}
          </optgroup>
        </select>

        {/* 키워드 필터 */}
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="키워드 필터 (클라이언트 사이드)"
          className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
        />

        {/* 모드 토글 */}
        <button
          type="button"
          onClick={() => setSseMode((m) => !m)}
          className="rounded bg-slate-200 px-3 py-1 text-sm font-medium hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          title="SSE: 실시간 push (fs.watch) ↔ Polling: 5초 간격"
        >
          {sseMode ? "📡 SSE" : "🔄 Polling"}
        </button>
        {/* 액션 */}
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="rounded bg-slate-200 px-3 py-1 text-sm font-medium hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
        >
          {paused ? "▶ 재개" : "⏸ 일시정지"}
        </button>
        <button
          type="button"
          onClick={() => void fetchTail()}
          className="rounded bg-slate-200 px-3 py-1 text-sm font-medium hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
        >
          🔄 새로고침
        </button>
        <button
          type="button"
          onClick={downloadFile}
          className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
        >
          ⬇ 다운로드
        </button>
      </div>

      {/* 메타 */}
      <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
        {meta.file && <span title={meta.file}>📄 {meta.file.split("/").slice(-4).join("/")}</span>}
        {meta.total !== undefined && (
          <span>
            · 전체 {meta.total.toLocaleString()}줄 · 표시 {filteredLines.length}줄
          </span>
        )}
        {meta.exists === false && <span className="text-amber-600">⚠ 파일 미존재</span>}
        {error && <span className="ml-auto text-red-600">에러: {error}</span>}
      </div>

      {/* 로그 라인 */}
      <div className="flex-1 overflow-auto rounded-md border border-slate-200 bg-slate-950 p-2 font-mono text-xs text-slate-200 dark:border-slate-700">
        {filteredLines.length === 0 ? (
          <div className="p-4 text-center text-slate-500">표시할 로그가 없습니다.</div>
        ) : (
          filteredLines.map((line, i) => (
            <LogRow key={`${i}-${line.raw.slice(0, 32)}`} line={line} />
          ))
        )}
      </div>
    </div>
  );
}

function LogRow({ line }: { line: LogLine }) {
  const [expanded, setExpanded] = useState(false);

  const level = (line.parsed?.level as string | number | undefined) ?? "";
  const time = (line.parsed?.time ?? line.parsed?.ts) as string | undefined;
  const msg = (line.parsed?.msg ?? line.parsed?.message) as string | undefined;
  const category = (line.parsed?.category as string | undefined) ?? "";
  const requestId = (line.parsed?.requestId as string | undefined) ?? "";

  // level → 색상
  const levelStr = String(level).toLowerCase();
  let levelColor = "text-slate-400";
  if (levelStr === "error" || levelStr === "50" || levelStr === "fatal") levelColor = "text-red-400";
  else if (levelStr === "warn" || levelStr === "40") levelColor = "text-amber-300";
  else if (levelStr === "info" || levelStr === "30") levelColor = "text-blue-300";
  else if (levelStr === "debug" || levelStr === "20") levelColor = "text-emerald-300";

  return (
    <div
      onClick={() => setExpanded((v) => !v)}
      className="cursor-pointer border-b border-slate-800 px-1 py-0.5 hover:bg-slate-900"
    >
      <div className="flex items-baseline gap-2">
        <span className="text-slate-500 text-[10px]">
          {time?.slice(11, 23) ?? "-"}
        </span>
        <span className={`w-12 font-bold ${levelColor}`}>{levelStr.toUpperCase()}</span>
        {category && <span className="text-purple-300 text-[10px]">[{category}]</span>}
        {requestId && (
          <span className="text-slate-500 text-[10px]">{requestId.slice(0, 8)}</span>
        )}
        <span className="flex-1 truncate text-slate-100">{msg ?? line.raw}</span>
      </div>
      {expanded && line.parsed && (
        <pre className="mt-1 max-h-64 overflow-auto rounded bg-slate-900 p-2 text-[11px] text-slate-300">
          {JSON.stringify(line.parsed, null, 2)}
        </pre>
      )}
    </div>
  );
}
