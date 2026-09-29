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
import { JwtUserPayload } from "@/common/interfaces/authenticated-request.interface";
import { isAdminRole } from "@/auth/constants/chldiv.constants";
import { encryptField } from "@/common/utils/field-encryption.util";
import { UpsertTeamSettlementAccountDto } from "./dto/upsert-team-settlement-account.dto";
import { UpdateAccountRegistrationDto } from "./dto/update-account-registration.dto";
import { QuerySettlementAccountsDto } from "./dto/query-settlement-accounts.dto";
import {
  decryptOrRaw,
  formatBusinessNumber,
  maskBankAccount,
  maskBusinessNumber,
} from "./utils/account-mask.util";

export const BANK_CODE_GROUP = "BANK_CODE";

const ACCOUNT_CHANGED_MESSAGE =
  "계좌 정보가 변경되었습니다. 새로고침 후 다시 확인해주세요.";

const ACCOUNT_SELECT = {
  teamId: true,
  businessNumber: true,
  bankCode: true,
  bankAccount: true,
  accountHolder: true,
  status: true,
  submittedAt: true,
  registeredAt: true,
  updatedAt: true,
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
 * 팀 정산 수취 계좌 — 팀 소유 감독만 입력한다. 운영자는 조회·나이스 등록 완료 표시·초기화만 한다.
 * 사업자번호·계좌번호는 암호화 저장, 감독 응답은 항상 마스킹, 관리자 응답은 평문.
 */
@Injectable()
export class TeamSettlementAccountService {
  private readonly logger = new Logger(TeamSettlementAccountService.name);

  constructor(private readonly prisma: PrismaService) {}

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

  async upsert(
    teamId: string,
    dto: UpsertTeamSettlementAccountDto,
    requester: JwtUserPayload,
  ) {
    await this.assertTeamDirector(teamId, requester, undefined, true);

    const existing = await this.prisma.teamSettlementAccount.findUnique({
      where: { teamId },
      select: {
        businessNumber: true,
        bankCode: true,
        bankAccount: true,
        accountHolder: true,
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

    // 같은 내용을 다시 저장하면 나이스 등록 완료 상태를 풀지 않는다 — 재등록이 필요한 건 내용이 바뀔 때뿐이다.
    const unchanged =
      existing &&
      existing.bankCode === dto.bankCode &&
      storedBankAccount === dto.bankAccount &&
      existing.accountHolder === dto.accountHolder;

    if (!unchanged) {
      const now = new Date();
      await this.mapWriteRace(async () => {
        if (existing) {
          await this.prisma.teamSettlementAccount.update({
            where: { teamId },
            data: {
              bankCode: dto.bankCode,
              bankAccount: encryptField(dto.bankAccount),
              accountHolder: dto.accountHolder,
              status: TeamSettlementAccountStatus.SUBMITTED,
              submittedById: requester.id,
              submittedAt: now,
              registeredById: null,
              registeredAt: null,
            },
          });
        } else {
          await this.prisma.teamSettlementAccount.create({
            data: {
              teamId,
              businessNumber: encryptField(dto.businessNumber as string),
              bankCode: dto.bankCode,
              bankAccount: encryptField(dto.bankAccount),
              accountHolder: dto.accountHolder,
              status: TeamSettlementAccountStatus.SUBMITTED,
              submittedById: requester.id,
              submittedAt: now,
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

    const [teams, total, bankNames] = await Promise.all([
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
    ]);

    return {
      data: teams.map((t) => ({
        teamId: t.id,
        teamName: t.name,
        teamCode: t.teamCode,
        account: t.settlementAccount
          ? this.toAdminView(t.settlementAccount, bankNames)
          : null,
      })),
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  /** 운영자 — 나이스 서브몰 등록 완료 표시/해제. 화면에서 본 버전과 다르면 409. */
  async updateRegistration(
    teamId: string,
    dto: UpdateAccountRegistrationDto,
    adminId: string,
  ) {
    const registered = dto.status === TeamSettlementAccountStatus.REGISTERED;
    const result = await this.prisma.teamSettlementAccount.updateMany({
      where: { teamId, updatedAt: new Date(dto.expectedUpdatedAt) },
      data: {
        status: dto.status,
        registeredById: registered ? adminId : null,
        registeredAt: registered ? new Date() : null,
      },
    });

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
   * 지급 완료 정산은 계좌를 스냅샷으로 갖고 있어 영향이 없다.
   */
  async reset(teamId: string, adminId: string) {
    const result = await this.prisma.teamSettlementAccount.deleteMany({
      where: { teamId },
    });
    if (result.count === 0) {
      throw new NotFoundException("정산 계좌가 등록되지 않은 팀입니다.");
    }
    this.logger.warn(
      `팀 정산 계좌 초기화: teamId=${teamId}, adminId=${adminId}`,
    );
    return { teamId, reset: true };
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
