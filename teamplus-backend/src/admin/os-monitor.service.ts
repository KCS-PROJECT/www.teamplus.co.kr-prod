import { Injectable, Logger } from "@nestjs/common";
import { execFile } from "child_process";
import { promisify } from "util";
import * as os from "os";

const execFileAsync = promisify(execFile);

export interface OsLogEntry {
  timestamp: string | null;
  level: "ERROR" | "WARN" | "INFO" | "DEBUG";
  source: string;
  message: string;
}

/** systemd PRIORITY(0~7) → 로그 레벨 */
function priorityToLevel(priority?: string | number): OsLogEntry["level"] {
  const p = Number(priority);
  if (Number.isNaN(p)) return "INFO";
  if (p <= 3) return "ERROR"; // 0 emerg ~ 3 err
  if (p === 4) return "WARN";
  if (p <= 6) return "INFO"; // 5 notice, 6 info
  return "DEBUG"; // 7 debug
}

/** journalctl MESSAGE 는 문자열 또는 byte 배열(비ASCII) 로 올 수 있다 */
function decodeMessage(msg: unknown): string {
  if (typeof msg === "string") return msg;
  if (Array.isArray(msg)) {
    try {
      return Buffer.from(msg as number[]).toString("utf8");
    } catch {
      return String(msg);
    }
  }
  return msg == null ? "" : String(msg);
}

/** /var/log/syslog 라인 파싱 (RFC + ISO 혼용 대응, best-effort) */
function parseSyslogLine(line: string): OsLogEntry {
  // 예) 2026-07-24T14:00:43.674+09:00 HOST proc[pid]: message
  const m = line.match(/^(\S+)\s+(\S+)\s+([^:]+):\s*(.*)$/);
  if (m) {
    return {
      timestamp: /^\d{4}-\d{2}-\d{2}T/.test(m[1]) ? m[1] : null,
      level: /err|fail|critical|fatal/i.test(m[4])
        ? "ERROR"
        : /warn/i.test(m[4])
          ? "WARN"
          : "INFO",
      source: m[3].replace(/\[\d+\]$/, ""),
      message: m[4],
    };
  }
  return { timestamp: null, level: "INFO", source: "system", message: line };
}

/**
 * OsMonitorService — 서버(OS) 리소스 상태 + 리눅스 시스템 로그(journalctl/syslog) 제공.
 *
 *   - 서비스(애플리케이션) 로그(SystemLogService, platform='backend')와 별개.
 *   - execFile 고정 인자만 사용(사용자 입력 미주입) → 명령 인젝션 불가.
 *   - journalctl 우선, 실패 시 /var/log/syslog tail 로 폴백. 둘 다 실패 시 빈 목록.
 *   - 운영 리눅스 서버 기준. 개발 WSL 에서도 동작.
 */
@Injectable()
export class OsMonitorService {
  private readonly logger = new Logger(OsMonitorService.name);

  /** 서버 리소스 현황 (CPU 부하·메모리·디스크·업타임 등) */
  async getResources() {
    const total = os.totalmem();
    const free = os.freemem();
    const [load1, load5, load15] = os.loadavg();
    const cpus = os.cpus();

    let disk: {
      totalGb: number;
      usedGb: number;
      availGb: number;
      usedPercent: number;
    } | null = null;
    try {
      const { stdout } = await execFileAsync("df", ["-kP", "/"]);
      const cols = stdout.trim().split("\n")[1]?.trim().split(/\s+/);
      if (cols && cols.length >= 5) {
        const totalKb = Number(cols[1]);
        const usedKb = Number(cols[2]);
        const availKb = Number(cols[3]);
        disk = {
          totalGb: +(totalKb / 1024 / 1024).toFixed(1),
          usedGb: +(usedKb / 1024 / 1024).toFixed(1),
          availGb: +(availKb / 1024 / 1024).toFixed(1),
          usedPercent: totalKb ? Math.round((usedKb / totalKb) * 100) : 0,
        };
      }
    } catch (e) {
      this.logger.warn(`df 실패: ${(e as Error).message}`);
    }

    return {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      uptimeSec: Math.round(os.uptime()),
      loadavg: {
        "1m": +load1.toFixed(2),
        "5m": +load5.toFixed(2),
        "15m": +load15.toFixed(2),
      },
      cpu: {
        cores: cpus.length,
        model: cpus[0]?.model?.trim() ?? "unknown",
      },
      memory: {
        totalMb: Math.round(total / 1024 / 1024),
        usedMb: Math.round((total - free) / 1024 / 1024),
        freeMb: Math.round(free / 1024 / 1024),
        usedPercent: total ? Math.round(((total - free) / total) * 100) : 0,
      },
      process: {
        pid: process.pid,
        rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        nodeUptimeSec: Math.round(process.uptime()),
      },
      disk,
      collectedAt: new Date().toISOString(),
    };
  }

  /** 리눅스 시스템 로그 (journalctl 우선, syslog 폴백) */
  async getLogs(params: {
    lines?: number;
    level?: string;
  }): Promise<{ source: string; logs: OsLogEntry[] }> {
    const lines = Math.min(Math.max(Number(params.lines) || 100, 1), 500);
    const level = (params.level ?? "ALL").toUpperCase();

    // 1) journalctl -o json (구조화, PRIORITY 기반 level)
    try {
      const args = ["-n", String(lines), "--no-pager", "-o", "json"];
      if (level === "ERROR") args.push("-p", "err");
      else if (level === "WARN") args.push("-p", "warning");
      const { stdout } = await execFileAsync("journalctl", args, {
        maxBuffer: 20 * 1024 * 1024,
      });
      const logs = stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((l): OsLogEntry | null => {
          try {
            const j = JSON.parse(l);
            const usec = Number(j.__REALTIME_TIMESTAMP);
            return {
              timestamp: Number.isFinite(usec)
                ? new Date(usec / 1000).toISOString()
                : null,
              level: priorityToLevel(j.PRIORITY),
              source: j.SYSLOG_IDENTIFIER || j._COMM || "system",
              message: decodeMessage(j.MESSAGE),
            };
          } catch {
            return null;
          }
        })
        .filter((x): x is OsLogEntry => x !== null)
        .reverse(); // 최신순
      return { source: "journalctl", logs };
    } catch (e) {
      this.logger.warn(
        `journalctl 조회 실패 → syslog 폴백: ${(e as Error).message}`,
      );
    }

    // 2) 폴백: /var/log/syslog tail
    try {
      const { stdout } = await execFileAsync(
        "tail",
        ["-n", String(lines), "/var/log/syslog"],
        { maxBuffer: 20 * 1024 * 1024 },
      );
      let logs = stdout.trim().split("\n").filter(Boolean).map(parseSyslogLine);
      if (level === "ERROR") logs = logs.filter((l) => l.level === "ERROR");
      else if (level === "WARN")
        logs = logs.filter((l) => l.level === "ERROR" || l.level === "WARN");
      return { source: "syslog", logs: logs.reverse() };
    } catch (e) {
      this.logger.warn(`syslog 폴백 실패: ${(e as Error).message}`);
      return { source: "unavailable", logs: [] };
    }
  }
}
