import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly MAX_RETRIES = 8;
  private readonly RETRY_DELAY_MS = 5000;
  private isConnected = false;

  constructor() {
    super({
      datasourceUrl: process.env.DATABASE_URL,
      log:
        process.env.NODE_ENV === "development"
          ? [
              { emit: "event", level: "warn" },
              { emit: "event", level: "error" },
            ]
          : [{ emit: "event", level: "error" }],
    });
  }

  async onModuleInit() {
    await this.connectWithRetry();
  }

  async onModuleDestroy() {
    this.isConnected = false;
    await this.$disconnect();
    this.logger.log("Database connection closed");
  }

  private async connectWithRetry(): Promise<void> {
    if (this.isConnected) return;
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        await this.$connect();
        this.isConnected = true;
        this.logger.log("✅ Database connection established");
        return;
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `⚠️ Database connection attempt ${attempt}/${this.MAX_RETRIES} failed: ${errorMessage}`,
        );

        if (attempt === this.MAX_RETRIES) {
          this.logger.error(
            `❌ Failed to connect to database after ${this.MAX_RETRIES} attempts`,
          );
          throw error;
        }

        const delay = this.RETRY_DELAY_MS * attempt;
        this.logger.log(`⏳ Retrying in ${delay / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  async ensureConnection(): Promise<void> {
    if (this.isConnected) return;
    await this.connectWithRetry();
  }
}
