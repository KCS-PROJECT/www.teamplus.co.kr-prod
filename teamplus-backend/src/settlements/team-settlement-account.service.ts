import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, TeamSettlementAccountStatus } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { JwtUserPayload } from "@/common/interfaces/authenticated-request.interface";
import { isAdminRole } from "@/auth/constants/chldiv.constants";
import { encryptField } from "@/common/utils/field-encryption.util";
import { nowKstParts } from "@/common/utils/kst-date.util";
import { UpsertTeamSettlementAccountDto } from "./dto/upsert-team-settlement-account.dto";
import { UpdateAccountRegistrationDto } from "./dto/update-account-registration.dto";
import { QuerySettlementAccountsDto } from "./dto/query-settlement-accounts.dto";
import {
  decryptOrRaw,
  formatBusinessNumber,
  maskBankAccount,
  maskBusinessNumber,
} from "./utils/account-mask.util";
import {
  buildNiceXlsx,
  digitsOnly,
  truncateUtf8Bytes,
} from "./utils/nice-xlsx.util";
import { resolveNiceAction } from "./utils/nice-account-state.util";
import { NicePayoutApiService } from "./nice-payout-api.service";
import { resolvePayoutApiMode } from "./payout-mode.util";
import type { PayoutApiMode } from "./constants/payout-mode.constant";
import type {
  NiceSubMallRequest,
  NiceSubMallResult,
} from "./gateway/nice-payout.types";
import {
  describePayoutCallForOperator,
  describePayoutResCode,
} from "./gateway/payout-res-code.util";

export const BANK_CODE_GROUP = "BANK_CODE";

const ACCOUNT_CHANGED_MESSAGE =
  "계좌 정보가 변경되었습니다. 새로고침 후 다시 확인해주세요.";

export const SUBMALL_WINDOW_CLOSED_MESSAGE =
  "23:00~01:00에는 은행 시스템 전환으로 정산 계좌를 등록할 수 없습니다. 01시 이후 다시 저장해주세요.";

const SUBMALL_SID = "0105001";

/** 초기화로 물러난 서브몰 ID 기록 — 나이스 호출이 아니라 "이 ID 는 이미 썼다"는 장부 한 줄이다. */
const SUBMALL_RETIRE_SID = "RETIRE";

/** 나이스 관리자 서브ID 다량등록 양식 — 상호 40바이트, 한 번에 500건. */
const NICE_REGISTRATION_HEADER = [
  "ID",
  "상호",
  "사업자번호",
  "예금주",
  "은행",
  "계좌번호",
] as const;
const NICE_REGISTRATION_NAME_BYTES = 40;
const NICE_REGISTRATION_MAX_ROWS = 500;

/**
 * 등록 호출 진행 표시가 이보다 오래되면 서버가 도중에 멈춘 것으로 보고 다시 잡을 수 있다.
 * 게이트웨이 타임아웃(10초) × 교차 재요청 1회보다 충분히 길다.
 */
const REGISTRATION_STALE_MS = 60_000;

export function isSubMallRegistrationInProgress(
  startedAt: Date | null,
): boolean {
  return (
    !!startedAt && Date.now() - startedAt.getTime() < REGISTRATION_STALE_MS
  );
}

const ACCOUNT_SELECT = {
  teamId: true,
  businessNumber: true,
  bankCode: true,
  bankAccount: true,
  accountHolder: true,
  status: true,
  submittedAt: true,
  registeredAt: true,
  createdAt: true,
  updatedAt: true,
  subMallId: true,
  lastResCode: true,
  lastResMsg: true,
  lastAttemptedAt: true,
  registrationStartedAt: true,
  registeredBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.TeamSettlementAccountSelect;

type AccountRow = Prisma.TeamSettlementAccountGetPayload<{
  select: typeof ACCOUNT_SELECT;
}>;

/** 지급 처리(payout)가 게이트·스냅샷에 쓰는 계좌 정보 — 계좌번호는 암호문 그대로. */
export interface PayoutAccount {
  status: TeamSettlementAccountStatus;
  bankName: string;
  bankAccount: string;
  accountHolder: string;
  updatedAt: Date;
}

/**
 * 감독 입력 자체가 틀려 거절된 코드 — 이 경우만 저장을 되돌린다(감독이 고쳐 다시 입력할 수 있다).
 * 그 밖의 거절은 감독이 고칠 수 없어 등록 실패로 남겨 운영자가 보게 한다.
 */
const INPUT_REJECT_CODES: ReadonlySet<string> = new Set(["1003"]);

/** 입력 오류로 거절됐을 때 되돌릴 이전 값. */
const PREVIOUS_ACCOUNT_SELECT = {
  bankCode: true,
  bankAccount: true,
  accountHolder: true,
  status: true,
  submittedById: true,
  submittedAt: true,
  registeredById: true,
  registeredAt: true,
  lastResCode: true,
  lastResMsg: true,
  lastAttemptedAt: true,
} satisfies Prisma.TeamSettlementAccountSelect;

type PreviousAccount = Prisma.TeamSettlementAccountGetPayload<{
  select: typeof PREVIOUS_ACCOUNT_SELECT;
}>;

/** 감독 저장 문맥 — 결과에 따라 되돌릴지 정하는 데 쓴다. */
interface RegistrationDraft {
  isNew: boolean;
  /** 저장된 내용과 같은 재시도 — 거절되면 저장된 계좌 자체가 거절된 것이다 */
  unchanged: boolean;
  previous: PreviousAccount | null;
}

interface RegistrationOutcome {
  /** 나이스가 확정 거절해 감독 저장을 되돌렸다 */
  rejected: boolean;
  message: string | null;
}

/** 운영자 화면용 마지막 나이스 서브몰 등록 호출. */
export interface LastNiceCall {
  outcome: string;
  resCode: string | null;
  /** 운영자용 원인 설명(통신 원인·코드 설명·나이스 원문) */
  detail: string;
  at: Date;
}

/** 감독 화면이 저장 가능 여부·결과 문구를 정하는 데 쓰는 현재 운영 방식. */
export interface AccountRegistrationPolicy {
  /** manual = 운영자가 나이스에 직접 등록 / api = 저장 시 나이스에 자동 등록 */
  registrationMode: "manual" | "api";
  /** 지금 저장할 수 없는 이유(없으면 null) */
  saveBlockedReason: string | null;
}

/** 23:00~01:00(KST)은 나이스가 서브몰 등록을 받지 않는다. */
export function isSubMallWindowClosed(): boolean {
  const hour = Number(nowKstParts().hour);
  return hour === 23 || hour === 0;
}

/**
 * 팀 정산 수취 계좌 — 팀 소유 감독만 입력한다. 사업자번호·계좌번호는 암호화 저장, 감독 응답은 항상 마스킹, 관리자 응답은 평문.
 * 지급대행 모드가 live 면 저장 직후 나이스 서브몰 등록 API 결과로 상태가 정해지고,
 * 그 외 모드에서는 운영자가 나이스 관리자에 직접 등록한 뒤 등록 완료로 표시한다.
 */
@Injectable()
export class TeamSettlementAccountService {
  private readonly logger = new Logger(TeamSettlementAccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly payoutApi: NicePayoutApiService,
  ) {}

  async getForTeam(teamId: string, requester: JwtUserPayload) {
    await this.assertReadAccess(teamId, requester);
    const account = await this.prisma.teamSettlementAccount.findUnique({
      where: { teamId },
      select: ACCOUNT_SELECT,
    });
    if (!account) return null;
    const bankNames = await this.loadBankNames();
    return isAdminRole(requester.userType)
      ? this.toAdminView(account, bankNames)
      : this.toDirectorView(account, bankNames);
  }

  async getRegistrationPolicyForTeam(
    teamId: string,
    requester: JwtUserPayload,
  ): Promise<AccountRegistrationPolicy> {
    await this.assertReadAccess(teamId, requester);
    return this.getRegistrationPolicy();
  }

  async getRegistrationPolicy(): Promise<AccountRegistrationPolicy> {
    const live = (await this.currentMode()) === "live";
    return {
      registrationMode: live ? "api" : "manual",
      saveBlockedReason:
        live && isSubMallWindowClosed() ? SUBMALL_WINDOW_CLOSED_MESSAGE : null,
    };
  }

  async upsert(
    teamId: string,
    dto: UpsertTeamSettlementAccountDto,
    requester: JwtUserPayload,
  ) {
    await this.assertTeamDirector(teamId, requester, undefined, true);

    const live = (await this.currentMode()) === "live";
    if (live && isSubMallWindowClosed()) throw this.windowClosed();

    const existing = await this.prisma.teamSettlementAccount.findUnique({
      where: { teamId },
      select: {
        businessNumber: true,
        updatedAt: true,
        ...PREVIOUS_ACCOUNT_SELECT,
      },
    });

    if (!existing && !dto.businessNumber) {
      throw new BadRequestException("사업자등록번호를 입력해주세요.");
    }
    // 복호화에 실패한 값(키 불일치·손상)을 "변경됨"으로 오판해 저장·상태를 바꾸지 않는다.
    const storedBusinessNumber = existing
      ? this.decryptStored(teamId, existing.businessNumber)
      : null;
    const storedBankAccount = existing
      ? this.decryptStored(teamId, existing.bankAccount)
      : null;
    if (dto.businessNumber && storedBusinessNumber !== null) {
      if (storedBusinessNumber !== dto.businessNumber) {
        throw new BadRequestException(
          "사업자등록번호는 변경할 수 없습니다. 운영자에게 문의해주세요.",
        );
      }
    }

    const bankNames = await this.loadBankNames(true);
    if (!bankNames.has(dto.bankCode)) {
      throw new BadRequestException("선택할 수 없는 은행입니다.");
    }

    // 같은 내용을 다시 저장하면 등록 완료 상태를 풀지 않는다 — 재등록이 필요한 건 내용이 바뀔 때뿐이다.
    const unchanged =
      !!existing &&
      existing.bankCode === dto.bankCode &&
      storedBankAccount === dto.bankAccount &&
      existing.accountHolder === dto.accountHolder;

    const now = new Date();
    const changedData = {
      bankCode: dto.bankCode,
      bankAccount: encryptField(dto.bankAccount),
      accountHolder: dto.accountHolder,
      status: TeamSettlementAccountStatus.SUBMITTED,
      submittedById: requester.id,
      submittedAt: now,
      registeredById: null,
      registeredAt: null,
      lastResCode: null,
      lastResMsg: null,
    };

    if (live) {
      // 등록 완료 상태에서 같은 내용을 다시 저장하면 나이스를 다시 부르지 않는다.
      //   실패·확인 중 상태의 같은 내용 저장은 재시도로 본다.
      const skipCall =
        unchanged &&
        existing?.status === TeamSettlementAccountStatus.REGISTERED;
      if (!skipCall) {
        const claimAt = new Date();
        // 새 내용을 먼저 확인 중(SUBMITTED)으로 쓴 뒤 나이스를 부른다 — 호출 중에는 지급이 막히고,
        //   나이스 반영 뒤 서버가 멈춰도 DB 가 나이스보다 옛 계좌로 남지 않는다.
        //   입력 오류로 거절되면 아래 registerWithNice 가 이전 값으로 되돌린다(첫 저장이면 행 삭제).
        await this.mapWriteRace(async () => {
          if (existing) {
            // 읽어 둔 값이 그대로일 때만 잡는다 — 입력 오류로 되돌릴 때 이 값을 쓰므로, 그 사이 끝난
            //   다른 변경을 옛 값으로 덮어쓰지 않게 한다.
            const claimed = await this.prisma.teamSettlementAccount.updateMany({
              where: {
                teamId,
                updatedAt: existing.updatedAt,
                ...this.claimableWhere(claimAt),
              },
              data: unchanged
                ? { registrationStartedAt: claimAt }
                : { ...changedData, registrationStartedAt: claimAt },
            });
            if (claimed.count === 0) throw await this.claimConflict(teamId);
          } else {
            await this.prisma.teamSettlementAccount.create({
              data: {
                teamId,
                businessNumber: encryptField(dto.businessNumber as string),
                ...changedData,
                registrationStartedAt: claimAt,
              },
            });
          }
        });
        this.logger.log(
          `팀 정산 계좌 저장(나이스 등록 진행): teamId=${teamId}, userId=${requester.id}`,
        );
        const outcome = await this.registerWithNice(
          teamId,
          claimAt,
          requester.id,
          { isNew: !existing, unchanged, previous: existing },
        );
        if (outcome.rejected) {
          throw new BadRequestException({
            message: outcome.message,
            errorCode: "SUBMALL_REJECTED",
          });
        }
      }
    } else if (
      !unchanged ||
      existing?.status === TeamSettlementAccountStatus.FAILED
    ) {
      // live 에서 나이스가 거절한 계좌는 수동 운영으로 돌아온 뒤 같은 내용을 다시 저장해도
      //   운영자 확인 대기로 되돌린다 — 그대로 두면 운영자가 풀 방법이 없어 지급이 막힌다.
      await this.mapWriteRace(async () => {
        if (existing) {
          await this.prisma.teamSettlementAccount.update({
            where: { teamId },
            data: changedData,
          });
        } else {
          await this.prisma.teamSettlementAccount.create({
            data: {
              teamId,
              businessNumber: encryptField(dto.businessNumber as string),
              ...changedData,
            },
          });
        }
      });
      this.logger.log(
        `팀 정산 계좌 저장: teamId=${teamId}, userId=${requester.id}`,
      );
    }

    const saved = await this.prisma.teamSettlementAccount.findUnique({
      where: { teamId },
      select: ACCOUNT_SELECT,
    });
    if (!saved) throw new ConflictException(ACCOUNT_CHANGED_MESSAGE);
    return this.toDirectorView(saved, bankNames);
  }

  /** 운영자 — 나이스 서브몰 등록 재시도(live 전용). 등록 완료 상태면 현재 내용으로 나이스 정보를 다시 맞춘다. */
  async registerByAdmin(teamId: string, adminId: string) {
    if ((await this.currentMode()) !== "live") {
      throw new ConflictException({
        message:
          "지급대행 API 사용(live) 중에만 나이스 재등록을 할 수 있습니다.",
        errorCode: "PAYOUT_API_NOT_LIVE",
      });
    }
    if (isSubMallWindowClosed()) throw this.windowClosed();

    const claimAt = new Date();
    const claimed = await this.prisma.teamSettlementAccount.updateMany({
      where: { teamId, ...this.claimableWhere(claimAt) },
      data: { registrationStartedAt: claimAt },
    });
    if (claimed.count === 0) throw await this.claimConflict(teamId, true);

    this.logger.log(
      `팀 정산 계좌 나이스 재등록: teamId=${teamId}, adminId=${adminId}`,
    );
    await this.registerWithNice(teamId, claimAt, adminId);

    const [account, bankNames, lastCalls] = await Promise.all([
      this.prisma.teamSettlementAccount.findUnique({
        where: { teamId },
        select: ACCOUNT_SELECT,
      }),
      this.loadBankNames(),
      this.loadLastSubMallCalls([teamId]),
    ]);
    if (!account) throw new ConflictException(ACCOUNT_CHANGED_MESSAGE);
    return {
      ...this.toAdminView(account, bankNames),
      lastNiceCall: lastCalls.get(teamId) ?? null,
    };
  }

  /**
   * 팀별 마지막 서브몰 등록 호출 — 운영자가 실패 원인(통신·키·코드·나이스 원문)을 보도록 호출 기록에서 읽는다.
   * 감독 화면은 계좌 행의 사용자용 문구(last_res_msg)만 쓴다.
   */
  private async loadLastSubMallCalls(
    teamIds: string[],
  ): Promise<Map<string, LastNiceCall>> {
    if (teamIds.length === 0) return new Map();
    const logs = await this.prisma.nicePayoutApiLog.findMany({
      where: { teamId: { in: teamIds }, sid: SUBMALL_SID },
      orderBy: { createdAt: "desc" },
      distinct: ["teamId"],
      select: {
        teamId: true,
        resCode: true,
        resMsg: true,
        error: true,
        outcome: true,
        createdAt: true,
      },
    });
    return new Map(
      logs
        .filter((log) => log.teamId)
        .map((log) => [
          log.teamId as string,
          {
            outcome: log.outcome,
            resCode: log.resCode,
            detail: describePayoutCallForOperator(log),
            at: log.createdAt,
          },
        ]),
    );
  }

  /**
   * 진행 표시를 잡은 요청만 나이스를 부른다 — 같은 팀 등록이 동시에 나가면
   * 늦게 도착한 옛 요청이 나이스에 옛 계좌를 남길 수 있다.
   */
  private claimableWhere(
    claimAt: Date,
  ): Prisma.TeamSettlementAccountWhereInput {
    return {
      OR: [
        { registrationStartedAt: null },
        {
          registrationStartedAt: {
            lt: new Date(claimAt.getTime() - REGISTRATION_STALE_MS),
          },
        },
      ],
    };
  }

  private async claimConflict(teamId: string, missingAsNotFound = false) {
    const row = await this.prisma.teamSettlementAccount.findUnique({
      where: { teamId },
      select: { registrationStartedAt: true },
    });
    if (!row) {
      return missingAsNotFound
        ? new NotFoundException("정산 계좌가 등록되지 않은 팀입니다.")
        : new ConflictException(ACCOUNT_CHANGED_MESSAGE);
    }
    // 진행 중이 아니면 읽은 뒤 다른 변경이 끝난 경우다.
    const inProgress =
      !!row.registrationStartedAt &&
      Date.now() - row.registrationStartedAt.getTime() < REGISTRATION_STALE_MS;
    if (!inProgress) return new ConflictException(ACCOUNT_CHANGED_MESSAGE);
    return new ConflictException({
      message:
        "정산 계좌를 나이스에 등록하고 있습니다. 잠시 후 다시 확인해주세요.",
      errorCode: "SUBMALL_REGISTRATION_IN_PROGRESS",
    });
  }

  /**
   * 나이스 서브몰 등록/수정 호출과 결과 반영. 진행 표시(claimAt)를 잡은 요청에서만 부른다.
   * 결과를 반영할 때도 진행 표시가 그대로인지 확인해, 그 사이 초기화·인계된 계좌를 덮어쓰지 않는다.
   * 요청 내용은 항상 DB 에 저장된 값이다(감독 저장은 호출 전에 새 내용을 이미 썼다).
   */
  private async registerWithNice(
    teamId: string,
    claimAt: Date,
    requestedBy: string,
    draft?: RegistrationDraft,
  ): Promise<RegistrationOutcome> {
    try {
      const row = await this.prisma.teamSettlementAccount.findUnique({
        where: { teamId },
        select: {
          businessNumber: true,
          bankCode: true,
          bankAccount: true,
          accountHolder: true,
          subMallId: true,
          status: true,
          createdAt: true,
          registrationStartedAt: true,
          team: { select: { name: true } },
        },
      });
      if (!row || row.registrationStartedAt?.getTime() !== claimAt.getTime()) {
        return { rejected: false, message: null };
      }

      const subId =
        row.subMallId ?? (await this.nextSubMallId(teamId, row.createdAt));
      const base: Omit<NiceSubMallRequest, "reqType"> = {
        subId,
        subNm: truncateUtf8Bytes(row.team.name, 50),
        subCoNo: this.decryptStored(teamId, row.businessNumber),
        bankCd: row.bankCode,
        accntNo: this.decryptStored(teamId, row.bankAccount),
        accntNm: row.accountHolder,
      };
      const ctx = { teamId, requestedBy };

      let reqType: 0 | 1 = row.subMallId ? 1 : 0;
      let result = await this.payoutApi.upsertSubMall(
        { ...base, reqType },
        ctx,
      );
      // 신규인데 이미 있음(1106) / 수정인데 없음(1105) — 응답을 못 받은 이전 호출이 실제로는 처리됐거나
      //   나이스 쪽 상태가 우리 기록과 어긋난 경우다. 반대 방식으로 한 번만 다시 맞춘다.
      const code = result.meta.resCode;
      const missingAtNice = reqType === 1 && code === "1105";
      if ((reqType === 0 && code === "1106") || missingAtNice) {
        reqType = reqType === 0 ? 1 : 0;
        result = await this.payoutApi.upsertSubMall({ ...base, reqType }, ctx);
      }

      // 이미 나이스에 등록된 계좌를 같은 내용으로 다시 맞추다 거절되면, 나이스에는 이전 등록이 남아 있어
      //   지급이 가능하다 — 등록 완료를 실패로 내리지 않고 사유만 남긴다.
      const keepRegistered =
        row.status === TeamSettlementAccountStatus.REGISTERED &&
        !!row.subMallId;
      return await this.applyRegistrationResult(
        teamId,
        claimAt,
        subId,
        result,
        { keepRegistered, missingAtNice, draft },
      );
    } catch (error) {
      try {
        await this.prisma.teamSettlementAccount.updateMany({
          where: { teamId, registrationStartedAt: claimAt },
          data: { registrationStartedAt: null },
        });
      } catch {
        /* 풀지 못해도 진행 표시는 REGISTRATION_STALE_MS 뒤 만료된다 */
      }
      throw error;
    }
  }

  /**
   * 결과 반영.
   *  - 성공: 등록 완료.
   *  - 감독이 바꾼 내용이 입력 오류(INPUT_REJECT_CODES)로 거절: 저장하지 않은 것으로 되돌린다 —
   *    첫 저장이면 행을 지우고, 기존 계좌는 이전 값·상태로 복원한다(나이스에 없음이 확인됐으면 확인 중으로).
   *  - 그 밖의 확정 거절(같은 내용 재시도, 입력과 무관한 코드, 운영자 재등록): 등록 실패 + 사유
   *    (이미 등록된 계좌의 재동기화면 유지).
   *  - 결과 불명·설정 오류: 상태를 바꾸지 않는다(새 내용은 이미 확인 중으로 저장됨).
   */
  private async applyRegistrationResult(
    teamId: string,
    claimAt: Date,
    subId: string,
    result: NiceSubMallResult,
    opts: {
      keepRegistered: boolean;
      missingAtNice: boolean;
      draft?: RegistrationDraft;
    },
  ): Promise<RegistrationOutcome> {
    const now = new Date();
    const message =
      result.outcome === "SUCCESS"
        ? null
        : describePayoutResCode(result.meta.resCode).slice(0, 200);
    const common = {
      lastResCode: result.meta.resCode?.slice(0, 10) ?? null,
      lastResMsg: message,
      lastAttemptedAt: now,
      registrationStartedAt: null,
    };
    const where = { teamId, registrationStartedAt: claimAt };
    const { draft } = opts;

    const inputRejected =
      result.outcome === "TERMINAL" &&
      !!draft &&
      !draft.unchanged &&
      INPUT_REJECT_CODES.has(result.meta.resCode ?? "");
    if (inputRejected && draft) {
      if (draft.isNew || !draft.previous) {
        await this.prisma.teamSettlementAccount.deleteMany({ where });
      } else {
        const prev = draft.previous;
        const restoredStatus =
          opts.missingAtNice &&
          prev.status === TeamSettlementAccountStatus.REGISTERED
            ? TeamSettlementAccountStatus.SUBMITTED
            : prev.status;
        await this.prisma.teamSettlementAccount.updateMany({
          where,
          data: {
            bankCode: prev.bankCode,
            bankAccount: prev.bankAccount,
            accountHolder: prev.accountHolder,
            status: restoredStatus,
            submittedById: prev.submittedById,
            submittedAt: prev.submittedAt,
            registeredById: prev.registeredById,
            registeredAt: prev.registeredAt,
            // 되돌린 계좌의 마지막 결과를 유지한다. 나이스에 없음이 확인됐으면 그 사유로 바꿔 운영자가 재등록하게 한다.
            ...(opts.missingAtNice
              ? {
                  lastResCode: "1105",
                  lastResMsg: describePayoutResCode("1105").slice(0, 200),
                  lastAttemptedAt: now,
                }
              : {
                  lastResCode: prev.lastResCode,
                  lastResMsg: prev.lastResMsg,
                  lastAttemptedAt: prev.lastAttemptedAt,
                }),
            registrationStartedAt: null,
          },
        });
      }
      return { rejected: true, message };
    }

    let data: Prisma.TeamSettlementAccountUncheckedUpdateManyInput;
    switch (result.outcome) {
      case "SUCCESS":
        // 운영자 이름이 아니라 나이스 응답으로 등록된 것이라 registeredById 는 비운다.
        data = {
          ...common,
          status: TeamSettlementAccountStatus.REGISTERED,
          subMallId: subId,
          registeredAt: now,
          registeredById: null,
        };
        break;
      case "TERMINAL":
        data = opts.keepRegistered
          ? common
          : { ...common, status: TeamSettlementAccountStatus.FAILED };
        break;
      default:
        data = common;
        if (result.outcome === "CONFIG") {
          this.logger.error(
            `지급대행 설정 오류로 서브몰 등록 실패: teamId=${teamId}, resCode=${result.meta.resCode ?? "-"}, error=${result.meta.error ?? "-"}`,
          );
        }
    }

    const applied = await this.prisma.teamSettlementAccount.updateMany({
      where,
      data,
    });
    if (applied.count === 0) {
      this.logger.warn(
        `서브몰 등록 결과를 반영하지 못함(계좌 초기화 또는 진행 표시 만료): teamId=${teamId}, subId=${subId}, outcome=${result.outcome}`,
      );
    }
    return { rejected: false, message };
  }

  /**
   * 서브몰 ID = 팀 ID. 나이스는 사업자번호를 바꿀 수 없어, 초기화 뒤 새로 등록할 때는 `-2`, `-3`… 을 붙인다.
   * 초기화하면 계좌 행이 지워지므로 이미 쓴 ID 는 호출 기록에서 찾는다.
   * 지금 계좌가 만들어지기 전의 호출만 본다 — 성공뿐 아니라 결과 불명도 나이스에 만들어졌을 수 있어 쓴 것으로 친다.
   * 지금 계좌의 결과 불명 호출은 같은 ID 로 다시 요청해야 1106 → 수정으로 맞춰진다.
   */
  private async nextSubMallId(
    teamId: string,
    accountCreatedAt: Date,
  ): Promise<string> {
    const ids = await this.resolveNextSubMallIds([
      { teamId, createdAt: accountCreatedAt },
    ]);
    return ids.get(teamId) as string;
  }

  /** nextSubMallId 의 여러 팀 버전 — 초기화로 물러난 ID(RETIRE)도 이미 쓴 것으로 친다. */
  private async resolveNextSubMallIds(
    accounts: { teamId: string; createdAt: Date }[],
  ): Promise<Map<string, string>> {
    if (accounts.length === 0) return new Map();
    const used = await this.prisma.nicePayoutApiLog.findMany({
      where: {
        teamId: { in: accounts.map((a) => a.teamId) },
        subId: { not: null },
        OR: [
          { sid: SUBMALL_SID, outcome: { in: ["SUCCESS", "AMBIGUOUS"] } },
          { sid: SUBMALL_RETIRE_SID },
        ],
      },
      select: { teamId: true, subId: true, createdAt: true },
    });
    const result = new Map<string, string>();
    for (const account of accounts) {
      const usedIds = new Set(
        used
          .filter(
            (u) =>
              u.teamId === account.teamId && u.createdAt < account.createdAt,
          )
          .map((u) => u.subId),
      );
      let n = 1;
      let candidate = account.teamId;
      while (usedIds.has(candidate)) {
        n += 1;
        candidate = `${account.teamId}-${n}`;
      }
      result.set(account.teamId, candidate);
    }
    return result;
  }

  private windowClosed() {
    return new ConflictException({
      message: SUBMALL_WINDOW_CLOSED_MESSAGE,
      errorCode: "SUBMALL_WINDOW_CLOSED",
    });
  }

  private currentMode(): Promise<PayoutApiMode> {
    return resolvePayoutApiMode(this.prisma, this.redis);
  }

  /**
   * 저장 중 다른 요청과 겹친 경우를 409 로 통일한다 — 운영자 초기화로 행이 사라진 뒤의 update(P2025),
   * 동시에 두 번 들어온 첫 저장의 create(team_id 유니크, P2002).
   */
  private async mapWriteRace(write: () => Promise<void>) {
    try {
      await write();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2025" || error.code === "P2002")
      ) {
        throw new ConflictException(ACCOUNT_CHANGED_MESSAGE);
      }
      throw error;
    }
  }

  /** 저장된 암호문 복호화 — 실패하면 값을 추측하지 않고 운영자 확인이 필요한 오류로 멈춘다. */
  private decryptStored(teamId: string, value: string): string {
    const plain = decryptOrRaw(value);
    if (plain === null) {
      this.logger.error(`팀 정산 계좌 복호화 실패: teamId=${teamId}`);
      throw new InternalServerErrorException(
        "저장된 정산 계좌 정보를 읽을 수 없습니다. 운영자에게 문의해주세요.",
      );
    }
    return plain;
  }

  /** 운영자 — 팀별 계좌 목록(계좌 미입력 팀 포함), 평문. */
  async listForAdmin(query: QuerySettlementAccountsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.TeamWhereInput = { isActive: true };
    if (query.status === "NONE") {
      where.settlementAccount = { is: null };
    } else if (query.status) {
      where.settlementAccount = { is: { status: query.status } };
    }
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: "insensitive" } },
        { teamCode: { contains: query.q, mode: "insensitive" } },
      ];
    }

    const [teams, total, bankNames, mode] = await Promise.all([
      this.prisma.team.findMany({
        where,
        select: {
          id: true,
          name: true,
          teamCode: true,
          settlementAccount: { select: ACCOUNT_SELECT },
        },
        orderBy: { name: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.team.count({ where }),
      this.loadBankNames(),
      this.currentMode(),
    ]);
    const [lastCalls, nextSubIds] = await Promise.all([
      this.loadLastSubMallCalls(teams.map((t) => t.id)),
      this.resolveNextSubMallIds(
        teams.flatMap((t) =>
          t.settlementAccount && !t.settlementAccount.subMallId
            ? [{ teamId: t.id, createdAt: t.settlementAccount.createdAt }]
            : [],
        ),
      ),
    ]);

    return {
      data: teams.map((t) => ({
        teamId: t.id,
        teamName: t.name,
        teamCode: t.teamCode,
        account: t.settlementAccount
          ? this.toAdminView(t.settlementAccount, bankNames)
          : null,
        lastNiceCall: lastCalls.get(t.id) ?? null,
        niceAction: t.settlementAccount
          ? resolveNiceAction(t.settlementAccount)
          : null,
        niceSubId: t.settlementAccount
          ? (t.settlementAccount.subMallId ?? nextSubIds.get(t.id) ?? null)
          : null,
      })),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        payoutApiMode: mode,
      },
    };
  }

  /**
   * 운영자 — 나이스 서브몰 등록 완료 표시/해제(수동 운영 전용). 화면에서 본 버전과 다르면 409.
   * 등록 완료는 나이스에 올린 서브몰 ID 를 함께 남기고(지급 엑셀이 이 값을 쓴다), 해제는 그 기록을 지운다.
   */
  async updateRegistration(
    teamId: string,
    dto: UpdateAccountRegistrationDto,
    adminId: string,
  ) {
    // live 에서는 등록 상태가 나이스 응답으로만 정해진다 — 수동 표시가 섞이면 실제 등록 여부와 어긋난다.
    if ((await this.currentMode()) === "live") {
      throw new ConflictException({
        message:
          "지급대행 API 사용 중에는 등록 상태를 직접 바꿀 수 없습니다. 나이스 재등록을 이용해주세요.",
        errorCode: "PAYOUT_API_LIVE",
      });
    }

    const registered = dto.status === TeamSettlementAccountStatus.REGISTERED;
    const current = await this.prisma.teamSettlementAccount.findUnique({
      where: { teamId },
      select: { subMallId: true, createdAt: true },
    });
    if (!current) {
      throw new NotFoundException("정산 계좌가 등록되지 않은 팀입니다.");
    }
    const subMallId = registered
      ? (current.subMallId ??
        (await this.nextSubMallId(teamId, current.createdAt)))
      : null;

    let result: Prisma.BatchPayload;
    try {
      result = await this.prisma.teamSettlementAccount.updateMany({
        where: { teamId, updatedAt: new Date(dto.expectedUpdatedAt) },
        data: {
          status: dto.status,
          registeredById: registered ? adminId : null,
          registeredAt: registered ? new Date() : null,
          lastResCode: null,
          lastResMsg: null,
          subMallId,
        },
      });
    } catch (error) {
      // sub_mall_id 유니크 위반 — 같은 서브몰 ID 를 다른 계좌가 이미 갖고 있다(계좌 변경과는 다른 원인).
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException({
          message: `서브ID(${subMallId})가 다른 팀 계좌와 겹칩니다. 개발팀에 확인을 요청해주세요.`,
          errorCode: "SUB_MALL_ID_CONFLICT",
        });
      }
      throw error;
    }

    if (result.count === 0) {
      const exists = await this.prisma.teamSettlementAccount.findUnique({
        where: { teamId },
        select: { id: true },
      });
      if (!exists) {
        throw new NotFoundException("정산 계좌가 등록되지 않은 팀입니다.");
      }
      throw new ConflictException(ACCOUNT_CHANGED_MESSAGE);
    }

    this.logger.log(
      `팀 정산 계좌 등록 상태 변경: teamId=${teamId}, status=${dto.status}, adminId=${adminId}`,
    );
    const [account, bankNames] = await Promise.all([
      this.prisma.teamSettlementAccount.findUniqueOrThrow({
        where: { teamId },
        select: ACCOUNT_SELECT,
      }),
      this.loadBankNames(),
    ]);
    return this.toAdminView(account, bankNames);
  }

  /**
   * 운영자 — 계좌 초기화(행 삭제). 사업자번호가 바뀐 팀은 운영자가 확인 후 초기화하고 감독이 새로 입력한다.
   * 지급 완료 정산은 계좌를 스냅샷으로 갖고 있어 영향이 없다. 나이스 서브몰은 사업자번호를 바꿀 수 없어 남고,
   * 다음 등록은 새 서브몰 ID 로 한다 — 그래서 이 계좌가 쓰던(또는 등록 엑셀에 실렸을) ID 를 물러난 ID 로 남긴다.
   */
  async reset(teamId: string, adminId: string) {
    const current = await this.prisma.teamSettlementAccount.findUnique({
      where: { teamId },
      select: { subMallId: true, createdAt: true },
    });
    if (!current) {
      throw new NotFoundException("정산 계좌가 등록되지 않은 팀입니다.");
    }
    const retiredSubId =
      current.subMallId ??
      (await this.nextSubMallId(teamId, current.createdAt));

    const deleted = await this.prisma.$transaction(async (tx) => {
      const result = await tx.teamSettlementAccount.deleteMany({
        where: { teamId, createdAt: current.createdAt },
      });
      if (result.count > 0) {
        await tx.nicePayoutApiLog.create({
          data: {
            sid: SUBMALL_RETIRE_SID,
            teamId,
            subId: retiredSubId,
            outcome: "RETIRED",
            durationMs: 0,
            requestedBy: adminId,
          },
        });
      }
      return result.count;
    });
    if (deleted === 0) {
      throw new NotFoundException("정산 계좌가 등록되지 않은 팀입니다.");
    }
    this.logger.warn(
      `팀 정산 계좌 초기화: teamId=${teamId}, adminId=${adminId}`,
    );
    return { teamId, reset: true };
  }

  /**
   * 운영자 — 나이스 관리자 "서브ID등록 > 다량등록"에 그대로 올리는 xlsx.
   * 나이스에 등록한 적 없는(서브몰 ID 기록이 없는) 활성 팀 계좌만 담는다. 이미 등록된 팀의 계좌 변경은 나이스 화면에서 직접 고친다.
   */
  async buildNiceRegistrationFile(adminId: string): Promise<Buffer> {
    const targets = await this.prisma.teamSettlementAccount.findMany({
      where: {
        subMallId: null,
        team: { isActive: true },
        OR: [
          { registrationStartedAt: null },
          {
            registrationStartedAt: {
              lt: new Date(Date.now() - REGISTRATION_STALE_MS),
            },
          },
        ],
      },
      select: {
        teamId: true,
        businessNumber: true,
        bankCode: true,
        bankAccount: true,
        accountHolder: true,
        createdAt: true,
        registrationStartedAt: true,
        team: { select: { name: true } },
      },
      orderBy: { team: { name: "asc" } },
      take: NICE_REGISTRATION_MAX_ROWS,
    });
    if (targets.length === 0) {
      throw new ConflictException({
        message: "나이스에 새로 등록할 팀이 없습니다.",
        errorCode: "NICE_REGISTRATION_EMPTY",
      });
    }

    const subIds = await this.resolveNextSubMallIds(targets);
    const rows = targets.map((a) => [
      subIds.get(a.teamId) as string,
      truncateUtf8Bytes(a.team.name ?? "", NICE_REGISTRATION_NAME_BYTES),
      digitsOnly(this.decryptStored(a.teamId, a.businessNumber)),
      a.accountHolder,
      a.bankCode,
      digitsOnly(this.decryptStored(a.teamId, a.bankAccount)),
    ]);
    this.logger.log(
      `나이스 서브ID 등록 엑셀 생성: count=${rows.length}, adminId=${adminId}`,
    );
    return buildNiceXlsx(NICE_REGISTRATION_HEADER, rows);
  }

  /** 지급 게이트·스냅샷용 — 없으면 null. */
  async getPayoutAccount(teamId: string): Promise<PayoutAccount | null> {
    const account = await this.prisma.teamSettlementAccount.findUnique({
      where: { teamId },
      select: {
        status: true,
        bankCode: true,
        bankAccount: true,
        accountHolder: true,
        updatedAt: true,
      },
    });
    if (!account) return null;
    const bankNames = await this.loadBankNames();
    return {
      status: account.status,
      bankName: bankNames.get(account.bankCode) ?? account.bankCode,
      bankAccount: account.bankAccount,
      accountHolder: account.accountHolder,
      updatedAt: account.updatedAt,
    };
  }

  /**
   * 은행코드 → 은행명. activeOnly=true 는 선택지 API(common-codes group)와 같은 조건(그룹·코드 모두 활성),
   * false 는 이미 저장된 계좌 라벨용이라 비활성 코드도 포함한다.
   */
  async loadBankNames(activeOnly = false): Promise<Map<string, string>> {
    const codes = await this.prisma.commonCode.findMany({
      where: activeOnly
        ? {
            isActive: true,
            group: { groupCode: BANK_CODE_GROUP, isActive: true },
          }
        : { group: { groupCode: BANK_CODE_GROUP } },
      select: { code: true, name: true },
    });
    return new Map(codes.map((c) => [c.code, c.name]));
  }

  private isRegistrationInProgress(account: AccountRow): boolean {
    return isSubMallRegistrationInProgress(account.registrationStartedAt);
  }

  private toDirectorView(account: AccountRow, bankNames: Map<string, string>) {
    return {
      teamId: account.teamId,
      status: account.status,
      businessNumber: maskBusinessNumber(decryptOrRaw(account.businessNumber)),
      bankCode: account.bankCode,
      bankName: bankNames.get(account.bankCode) ?? account.bankCode,
      bankAccount: maskBankAccount(decryptOrRaw(account.bankAccount)),
      accountHolder: account.accountHolder,
      submittedAt: account.submittedAt,
      registeredAt: account.registeredAt,
      lastResultMessage: account.lastResMsg,
      registrationInProgress: this.isRegistrationInProgress(account),
    };
  }

  private toAdminView(account: AccountRow, bankNames: Map<string, string>) {
    const registeredBy = account.registeredBy;
    return {
      teamId: account.teamId,
      status: account.status,
      businessNumber: formatBusinessNumber(
        decryptOrRaw(account.businessNumber),
      ),
      bankCode: account.bankCode,
      bankName: bankNames.get(account.bankCode) ?? account.bankCode,
      bankAccount: decryptOrRaw(account.bankAccount),
      accountHolder: account.accountHolder,
      submittedAt: account.submittedAt,
      registeredAt: account.registeredAt,
      registeredBy: registeredBy
        ? {
            id: registeredBy.id,
            name: `${registeredBy.lastName ?? ""}${registeredBy.firstName ?? ""}`,
          }
        : null,
      updatedAt: account.updatedAt,
      subMallId: account.subMallId,
      lastResCode: account.lastResCode,
      lastResMsg: account.lastResMsg,
      lastAttemptedAt: account.lastAttemptedAt,
      registrationInProgress: this.isRegistrationInProgress(account),
    };
  }

  /** 조회 — 관리자급 또는 팀 소유 감독. */
  private async assertReadAccess(teamId: string, requester: JwtUserPayload) {
    if (isAdminRole(requester.userType)) {
      await this.assertTeamExists(teamId);
      return;
    }
    await this.assertTeamDirector(
      teamId,
      requester,
      "이 팀의 감독만 정산 계좌를 조회할 수 있습니다.",
    );
  }

  /**
   * 저장 — 팀 소유 감독만. 팀 관리 권한(코치·매니저 포함)보다 좁고, 관리자도 거부한다
   * (계좌·사업자 정보의 입력 책임은 팀에 있다).
   */
  private async assertTeamDirector(
    teamId: string,
    requester: JwtUserPayload,
    message = "이 팀의 감독만 정산 계좌를 등록할 수 있습니다.",
    requireActive = false,
  ) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { coachId: true, isActive: true },
    });
    if (!team) throw new NotFoundException("팀을 찾을 수 없습니다.");
    if (requester.userType !== "DIRECTOR" || team.coachId !== requester.id) {
      throw new ForbiddenException(message);
    }
    // 운영자 계좌 목록은 활성 팀만 보여준다 — 비활성 팀 계좌는 확인·등록될 수 없어 저장을 막는다.
    if (requireActive && !team.isActive) {
      throw new BadRequestException(
        "운영 중이 아닌 팀은 정산 계좌를 등록할 수 없습니다.",
      );
    }
  }

  private async assertTeamExists(teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true },
    });
    if (!team) throw new NotFoundException("팀을 찾을 수 없습니다.");
  }
}
