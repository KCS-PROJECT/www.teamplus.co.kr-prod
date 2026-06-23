# TEAMPLUS Backend

Ice Hockey Club Management System - Backend API

**Tech Stack**: Node.js 20 LTS + NestJS 10.x + MariaDB 10.11 + Redis 7.x

---

## 📊 Current Status (2026-01-25)

| 항목               | 현황                                              |
| ------------------ | ------------------------------------------------- |
| **Database**       | 66 테이블 (Prisma)                                |
| **API Modules**    | 18개 모듈                                         |
| **Authentication** | JWT (15min access, 7day refresh)                  |
| **User Roles**     | 6개 (ADMIN, DIRECTOR, COACH, PARENT, TEEN, CHILD) |
| **Rate Limiting**  | Redis-based (100 req/min)                         |
| **API Docs**       | Swagger (http://localhost:5003/api/docs)          |

### Database Table Groups

| Group        | Tables | Description                                  |
| ------------ | ------ | -------------------------------------------- |
| Core         | 6      | users, profiles, clubs, members              |
| Class        | 7      | classes, schedules, enrollments, attendance  |
| Payment      | 6      | payments, credits, refunds, settlements      |
| Shop         | 12     | products, orders, shipping, reviews, coupons |
| Community    | 8      | posts, comments, events, invites             |
| Chat         | 3      | rooms, members, messages                     |
| Notification | 4      | notifications, alimtalk, templates           |
| Hockey       | 9      | tournaments, matches, teams, events          |
| Member       | 5      | parent-child, levels, points, badges         |
| System       | 6      | audit, webhooks, verifications, metrics      |

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20 LTS or higher
- Docker & Docker Compose
- MariaDB 10.11+
- Redis 7.x

### Installation

1. **Clone repository** (when ready)

```bash
git clone <repository-url>
cd teamplus-backend
```

2. **Install dependencies**

```bash
npm install
```

3. **Setup environment variables**

```bash
cp .env.example .env
# Edit .env with your local configuration
```

4. **Start development environment with Docker Compose**

```bash
docker-compose up -d
```

This will start:

- MariaDB 10.11 on port 3306
- Redis 7 on port 6379
- Backend API on port 5003 (hot-reload enabled)

5. **Initialize database**

```bash
# Run Prisma migrations
npm run db:migrate

# Optional: Seed database with sample data
npm run db:seed
```

6. **Start backend in development mode**

```bash
npm run start:dev
```

Server will be running at: **http://localhost:5003**

API Documentation: **http://localhost:5003/api/docs** (Swagger)

---

## 📁 Project Structure

```
src/
├── main.ts                    # Application entry point
├── app.module.ts             # Root module
├── app.controller.ts         # Root controller (health check)
├── app.service.ts            # Root service
│
├── prisma/
│   ├── prisma.module.ts      # Prisma database module
│   ├── prisma.service.ts     # Database connection service
│   └── schema.prisma         # Database schema (at root)
│
├── auth/
│   ├── auth.module.ts        # Authentication module
│   ├── auth.service.ts       # Auth business logic
│   ├── auth.controller.ts    # Register, login, refresh endpoints
│   ├── strategies/
│   │   └── jwt.strategy.ts   # JWT authentication strategy
│   └── dto/
│       ├── register.dto.ts   # Register request DTO
│       └── login.dto.ts      # Login request DTO
│
├── users/
│   ├── users.module.ts
│   ├── users.service.ts
│   └── dto/
│
├── clubs/
│   ├── clubs.module.ts
│   ├── clubs.service.ts
│   └── dto/
│
├── common/
│   ├── decorators/           # Custom decorators (future)
│   ├── filters/              # Exception filters (future)
│   ├── guards/               # Auth guards (future)
│   └── pipes/                # Validation pipes (future)
│
└── config/
    ├── database.config.ts    # Database config (future)
    └── jwt.config.ts         # JWT config (future)

test/
├── auth.spec.ts              # Auth module tests (future)
└── jest-e2e.json             # E2E test config (future)

prisma/
├── schema.prisma             # Database schema definition
├── migrations/               # Database migrations
└── seed.ts                   # Database seeding script (future)
```

---

## 🔧 Available Commands

```bash
# Development
npm run start:dev            # Start with hot-reload
npm run start                # Start production build
npm run build                # Compile TypeScript to dist/
npm run lint                 # Run ESLint
npm run format               # Format code with Prettier

# Database
npm run db:migrate           # Run pending migrations
npm run db:migrate:prod      # Deploy migrations to production
npm run db:seed              # Seed database with sample data
npm run db:studio            # Open Prisma Studio

# Testing
npm test                     # Run unit tests
npm test:watch              # Watch mode
npm test:cov                # Coverage report
npm test:e2e                # End-to-end tests

# Docker
docker-compose up -d        # Start all services
docker-compose down         # Stop all services
docker-compose logs backend # View backend logs
docker-compose exec backend npm run db:migrate  # Run migrations in container
```

---

## 🔐 Authentication

### Register

```bash
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "parent@example.com",
  "phone": "01012345678",
  "password": "SecurePassword123",
  "userType": "PARENT"
}

Response:
{
  "user": {
    "id": "...",
    "email": "parent@example.com",
    "phone": "01012345678",
    "userType": "PARENT",
    "createdAt": "2026-01-04T10:00:00Z"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Login

```bash
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "parent@example.com",
  "password": "SecurePassword123"
}

Response:
{
  "user": {
    "id": "...",
    "email": "parent@example.com",
    "userType": "PARENT"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Refresh Token

```bash
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}

Response:
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Protected Endpoints

Use Bearer token in Authorization header:

```bash
GET /api/v1/auth/profile
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

---

## 🗄️ Database

### Schema Overview (66 Tables)

**Core (6)**: users, parent_profiles, coach_profiles, child_profiles, clubs, club_members
**Class (7)**: classes, class_schedules, class_products, class_registrations, class_attendances, enrollments, attendance_qr_codes
**Payment (6)**: payments, member_credits, refund_logs, credit_transactions, settlements, settlement_transactions
**Shop (12)**: shop_categories, shop_products, shop_product_images, shop_product_options, shop_orders, shop_order_items, shop_shipping_companies, shop_shippings, shop_wishlists, shop_reviews, coupons, user_coupons
**Community (8)**: club_posts, club_post_comments, club_post_likes, club_post_attachments, club_events, club_event_registrations, club_invites, system_notices
**Chat (3)**: chat_rooms, chat_room_members, chat_messages
**Notification (4)**: notifications, alimtalk_logs, notification_templates, user_notification_preferences
**Hockey (9)**: rinks, venues, tournaments, hockey_matches, teams, team_rosters, match_periods, match_events
**Member (5)**: parent_children, member_levels, point_transactions, badges, child_badges
**System (6)**: audit_logs, payment_webhooks, identity_verifications, identity_webhook_logs, skill_evaluations, skill_dimensions, daily_metrics

> 전체 스키마: `/docs/DB/database_schema.sql` 참조

### Migrations

```bash
# Create new migration
npx prisma migrate dev --name feature_name

# View all migrations
npx prisma migrate status

# Reset database (⚠️ data loss!)
npx prisma migrate reset
```

---

## 📊 API Endpoints (Week 1-2)

### Health & Status

- `GET /` - Welcome message
- `GET /health` - Health check

### Authentication

- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/refresh` - Refresh token
- `POST /api/v1/auth/profile` - Get current user (protected)

### Coming Soon (Week 3+)

- Club management endpoints
- Class management endpoints
- Payment processing endpoints
- Attendance tracking endpoints
- Admin dashboard endpoints

---

## 🧪 Testing

### Unit Tests

```bash
npm test                # Run all tests
npm test auth.spec.ts   # Run specific test file
npm test:watch         # Watch mode
npm test:cov           # Coverage report
```

### E2E Tests

```bash
npm test:e2e           # Run end-to-end tests
```

### Coverage Goals

- **Unit tests**: >80%
- **Integration tests**: >70%
- **E2E tests**: Cover top 10 user flows

---

## 📖 Development Guidelines

### Code Style

- Follow NestJS conventions
- Use TypeScript strict mode
- Validate all inputs with DTOs
- Add API documentation with Swagger decorators

### Error Handling

```typescript
// Always provide descriptive error messages
throw new BadRequestException("유효한 이메일 주소를 입력해주세요.");
throw new UnauthorizedException("이메일 또는 비밀번호가 일치하지 않습니다.");
throw new ForbiddenException("권한이 없습니다.");
throw new InternalServerErrorException("서버 오류가 발생했습니다.");
```

### Security

- Never log sensitive data (passwords, tokens)
- Always hash passwords with bcrypt (10 salt rounds)
- Validate JWT tokens on protected routes
- Use HTTPS in production
- Implement rate limiting
- SQL injection prevention (use Prisma ORM)

### Database Best Practices

1. Always verify queries in local database first
2. Check table structure and relationships
3. Confirm target data exists before querying
4. Use indexes for frequently queried columns

---

## 🚨 Troubleshooting

### Database Connection Failed

```bash
# Check if MariaDB is running
docker ps | grep mariadb

# Check database logs
docker-compose logs mariadb

# Restart services
docker-compose down
docker-compose up -d
```

### Port Already in Use

```bash
# Change port in docker-compose.yml
# Or kill existing process
lsof -i :5003
kill -9 <PID>
```

### Prisma Client Not Generated

```bash
npx prisma generate
```

### Database Reset

```bash
npm run db:reset  # ⚠️ Will delete all data
```

---

## 📞 Support

For issues or questions:

1. Check logs: `docker-compose logs backend`
2. Review IMPLEMENTATION_WORKFLOW.md for Week 1-2 details
3. Check CLAUDE.md for development guidelines

---

## 📋 API Modules (18)

| Module        | Endpoints | Description                          |
| ------------- | --------- | ------------------------------------ |
| auth          | 8         | JWT 인증, 회원가입, 로그인, 토큰갱신 |
| users         | 12        | 사용자 프로필, 부모/코치/아이 관리   |
| clubs         | 10        | 클럽 CRUD, 가입코드, QR              |
| classes       | 15        | 수업, 스케줄, 상품, 용량관리         |
| attendance    | 8         | QR 출석, 기록, 통계                  |
| payments      | 12        | KG이니시스, 결제, 환불               |
| credits       | 6         | 크레딧 발급, 차감, 만료              |
| enrollments   | 8         | 수업 등록, 승인 워크플로우           |
| shop          | 20        | 상품, 주문, 배송, 리뷰, 쿠폰         |
| chat          | 8         | 채팅방, 메시지                       |
| notifications | 10        | 알림, 알림톡, 템플릿                 |
| community     | 12        | 게시글, 댓글, 이벤트                 |
| tournaments   | 8         | 대회, 매치, 팀                       |
| admin         | 15        | 관리자 기능                          |
| dashboard     | 6         | 대시보드 통계                        |
| websocket     | 4         | 실시간 기능                          |
| settlement    | 8         | 정산 관리                            |
| webhooks      | 4         | 외부 웹훅 처리                       |

---

**Version**: 2.0.0
**Last Updated**: 2026-01-25
**Status**: MVP 90% Complete
