import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BullModule } from "@nestjs/bull";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard } from "@nestjs/throttler";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { RolesGuard } from "./auth/roles.guard";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { RedisThrottlerStorage } from "./redis/redis-throttler.storage";
import { LoggerModule, LoggerInterceptor } from "./logger";
import { LoggingModule } from "./logging/logging.module";
import {
  InterceptorsModule,
  ApiLifecycleInterceptor,
  ResponseEnvelopeInterceptor,
  CacheControlInterceptor,
  AuditInterceptor,
} from "./common/interceptors";
import { AuthModule } from "./auth/auth.module";
import { MailModule } from "./mail/mail.module";
import { UsersModule } from "./users/users.module";
import { TeamsModule } from "./teams/teams.module";
import { ClassesModule } from "./classes/classes.module";
import { AttendanceModule } from "./attendance/attendance.module";
import { CreditsModule } from "./credits/credits.module";
import { PaymentsModule } from "./payments/payments.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { ShopModule } from "./shop/shop.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { NoticesModule } from "./notices/notices.module";
import { ContactInquiriesModule } from "./contact-inquiries/contact-inquiries.module";
import { CommunityModule } from "./community/community.module";
import { WebsocketModule } from "./websocket/websocket.module";
import { ChildrenModule } from "./children/children.module";
import { CalendarModule } from "./calendar/calendar.module";
import { EnrollmentsModule } from "./enrollments/enrollments.module";
import { SmsModule } from "./sms/sms.module";
import { AdminModule } from "./admin/admin.module";
import { MenusModule } from "./menus/menus.module";
import { TournamentsModule } from "./tournaments/tournaments.module";
// Phase 4 (2026-04-29): ClubsModule → TeamsModule rename 완료. API 경로 /api/v1/teams 단일 노출.
import { TeamGroupsModule } from "./team-groups/team-groups.module";
import { ReviewsModule } from "./reviews/reviews.module";
import { BadgesModule } from "./badges/badges.module";
import { SkillEvaluationsModule } from "./skill-evaluations/skill-evaluations.module";
import { ChatModule } from "./chat/chat.module";
import { SearchModule } from "./search/search.module";
import { PickupMatchesModule } from "./pickup-matches/pickup-matches.module";
import { IdentityModule } from "./identity/identity.module";
import { AppManagementModule } from "./app-management/app-management.module";
import { AwardsModule } from "./awards/awards.module";
import { CareersModule } from "./careers/careers.module";
import { AcademyPromotionsModule } from "./academy-promotions/academy-promotions.module";
import { AcademyModule } from "./academy/academy.module";
import { WaitlistModule } from "./waitlist/waitlist.module";
import { RsvpModule } from "./rsvp/rsvp.module";
import { CommonCodesModule } from "./common-codes/common-codes.module";
import { OverseasTripsModule } from "./overseas-trips/overseas-trips.module";
import { LeaguesModule } from "./leagues/leagues.module";
import { TmsModule } from "./tms/tms.module";
import { TrainingModule } from "./training/training.module";
import { VenuesModule } from "./venues/venues.module";
import { VideosModule } from "./videos/videos.module";
import { ModerationModule } from "./moderation/moderation.module";
import { MemberApprovalsModule } from "./member-approvals/member-approvals.module";
import { ConsultationsModule } from "./consultations/consultations.module";
import { WishlistsModule } from "./wishlists/wishlists.module";
import { SettlementsModule } from "./settlements/settlements.module";
import { GalleryModule } from "./gallery/gallery.module";
import { MainPopupsModule } from "./main-popups/main-popups.module";
import { ReminderScheduler } from "./common/schedulers/reminder.scheduler";
import { ViewCounterModule } from "./common/view-counter/view-counter.module";
import { StickersModule } from "./stickers/stickers.module";
import { RewardsModule } from "./rewards/rewards.module";
import { EquipmentChecklistModule } from "./equipment-checklist/equipment-checklist.module";
import { MatchScoreboardModule } from "./match-scoreboard/match-scoreboard.module";
import { TrainingStatsModule } from "./training-stats/training-stats.module";
import { ClassDiaryModule } from "./class-diary/class-diary.module";
import { WorkScheduleModule } from "./work-schedule/work-schedule.module";
import { FilesModule } from "./files/files.module";
import { MemberLevelModule } from "./member-level/member-level.module";
import { UserSafetyModule } from "./user-safety/user-safety.module";
import { DateTimeModule } from "./datetime/datetime.module";
import { EquipmentInspectionModule } from "./equipment-inspection/equipment-inspection.module";
import { HealthModule } from "./health/health.module";
import { TransactionLogModule } from "./transaction-log/transaction-log.module";

@Module({
  imports: [
    // Configuration module - load environment variables
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"],
    }),

    // Scheduled tasks (cron jobs)
    ScheduleModule.forRoot(),

    // Database (Prisma)
    PrismaModule,

    // 전역 조회수 카운터 (1일 1회 제한, DailyViewLog UNIQUE 기반)
    ViewCounterModule,

    // Redis (Global module for caching and session management)
    RedisModule,

    // API lifecycle interceptors (request-id, client platform, user activity throttle)
    InterceptorsModule,

    // Logger (Structured logging with Pino + SonicBoom + 10MB 회전)
    LoggerModule,

    // v8.6 (2026-05-20) — 클라이언트 활동 수신 endpoint (Flutter/Web/Admin/Home)
    LoggingModule,

    // Bull Queue (Redis-based persistent job queue)
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379", 10),
      },
    }),

    // Rate limiting - 100 requests per minute globally (Redis-based)
    ThrottlerModule.forRootAsync({
      useFactory: (redisThrottlerStorage: RedisThrottlerStorage) => ({
        throttlers: [
          {
            ttl: 60000, // 1 minute in milliseconds
            limit: 100, // 100 requests per minute
          },
        ],
        storage: redisThrottlerStorage,
      }),
      inject: [RedisThrottlerStorage],
    }),

    // Feature modules
    MailModule,
    AuthModule,
    UsersModule,
    TeamsModule,
    ClassesModule,
    AttendanceModule,
    CreditsModule,
    PaymentsModule,
    NotificationsModule,
    ShopModule,
    DashboardModule,
    NoticesModule,
    ContactInquiriesModule,
    CommunityModule,
    WebsocketModule,
    ChildrenModule,
    CalendarModule,
    EnrollmentsModule,
    SmsModule,
    AdminModule,
    MenusModule,
    TournamentsModule,
    TeamGroupsModule,
    ReviewsModule,
    BadgesModule,
    SkillEvaluationsModule,
    ChatModule,
    SearchModule,
    PickupMatchesModule,
    IdentityModule,
    AppManagementModule,
    AwardsModule,
    CareersModule,
    WaitlistModule,
    RsvpModule,
    AcademyPromotionsModule,
    AcademyModule,
    CommonCodesModule,
    OverseasTripsModule,
    LeaguesModule,
    TmsModule,
    TrainingModule,
    VenuesModule,
    VideosModule,
    ModerationModule,
    MemberApprovalsModule,
    ConsultationsModule,
    WishlistsModule,
    SettlementsModule,
    GalleryModule,
    MainPopupsModule,
    StickersModule,
    RewardsModule,
    EquipmentChecklistModule,
    MatchScoreboardModule,
    TrainingStatsModule,
    ClassDiaryModule,
    WorkScheduleModule,
    FilesModule,
    MemberLevelModule,
    UserSafetyModule,
    DateTimeModule,
    EquipmentInspectionModule,
    HealthModule,

    // 거래로그 — 모든 HTTP 요청/응답을 requestId 단위 1행 적재(@Global) + 90일 보관 배치
    TransactionLogModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    ReminderScheduler,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      // ApiLifecycleInterceptor가 먼저 실행되어 X-Request-ID를 context에 주입
      provide: APP_INTERCEPTOR,
      useClass: ApiLifecycleInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggerInterceptor,
    },
    {
      // [2026-05-13 Phase A-1] 성공 응답을 {success:true, data} 표준 envelope 으로 자동 래핑.
      //   이미 표준/페이지네이션/stream/file 응답은 통과. @SkipEnvelope() 로 opt-out 가능.
      //   클라이언트(web/admin/app) 가 res.success 분기를 일관되게 사용할 수 있도록 보장.
      provide: APP_INTERCEPTOR,
      useClass: ResponseEnvelopeInterceptor,
    },
    {
      // [2026-05-13 Phase D-7] @CacheControl('private, max-age=60') 데코레이터의 값을
      //   응답 헤더에 자동 부착. 미지정 핸들러는 무영향.
      provide: APP_INTERCEPTOR,
      useClass: CacheControlInterceptor,
    },
    {
      // [2026-05-13 Phase E-2] @AuditAction(...) 데코레이터가 부착된 메서드의 성공 응답
      //   직후 AuditLog 자동 생성. PrismaService 필요.
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
