import { PrismaClient } from "@prisma/client";

/**
 * AlimtalkTemplate 시드 (2026-05-13 Phase D-9)
 *
 * 기존 `src/notifications/alimtalk.gateway.ts` 의 `getTemplateContent()` 하드코딩
 * stub 을 DB 로 이관. 운영팀이 카카오 비즈톡센터에 등록한 템플릿 코드와 1:1 매칭.
 *
 * upsert 패턴 — 본 시드를 반복 실행해도 동일한 결과. 운영팀이 content/variables 를
 * 수정한 경우 시드 실행 시 다시 덮어쓰지 않도록 `where` 조건으로 templateCode 만 사용.
 */
export async function seedAlimtalkTemplates(prisma: PrismaClient) {
  const templates = [
    {
      templateCode: "PAYMENT_SUCCESS_001",
      name: "결제 완료",
      category: "payment",
      variables: ["orderNumber", "className", "amount", "startDate"],
      content: `결제가 완료되었습니다.

주문번호: #{orderNumber}
수업: #{className}
금액: #{amount}원
시작일: #{startDate}

감사합니다.`,
    },
    {
      templateCode: "MEMBERSHIP_APPROVED_001",
      name: "클럽 가입 승인",
      category: "membership",
      variables: ["clubName", "coachName"],
      content: `#{clubName} 클럽 가입이 승인되었습니다!

담당 코치: #{coachName}

감사합니다.`,
    },
    {
      templateCode: "CLASS_REMINDER_001",
      name: "수업 리마인더",
      category: "class",
      variables: ["className", "classDate", "classTime"],
      content: `내일 수업이 있습니다!

수업: #{className}
일시: #{classDate} #{classTime}

잊지 말고 참석해주세요.`,
    },
    {
      templateCode: "ATTENDANCE_CONFIRMED_001",
      name: "출석 확인",
      category: "attendance",
      variables: ["className", "attendanceDate", "creditsRemaining"],
      content: `출석이 확인되었습니다.

수업: #{className}
날짜: #{attendanceDate}
잔여 크레딧: #{creditsRemaining}회

감사합니다.`,
    },
    {
      templateCode: "CREDIT_EXPIRY_001",
      name: "크레딧 만료 임박",
      category: "credit",
      variables: ["className", "creditsRemaining", "expiryDate"],
      content: `수업 크레딧 만료 예정 안내

수업: #{className}
잔여 크레딧: #{creditsRemaining}회
만료일: #{expiryDate}

만료 전에 사용해주세요.`,
    },
    {
      // [2026-05-14] 장비 점검 critical 발견 시 코치/감독에게 발송.
      templateCode: "EQUIPMENT_ISSUE_001",
      name: "장비 이상 발견 안내",
      category: "equipment",
      variables: ["coachName", "teamName"],
      content: `#{coachName} 코치님, #{teamName} 장비 점검에서 이상이 발견되었습니다.

앱에서 점검 리포트를 확인하고 조속히 조치해주세요.

감사합니다.`,
    },
  ];

  let created = 0;
  let updated = 0;
  for (const t of templates) {
    const existing = await prisma.alimtalkTemplate.findUnique({
      where: { templateCode: t.templateCode },
    });
    if (existing) {
      // 운영 중 변경된 content 를 시드가 덮어쓰지 않도록 name/category/variables 만 sync.
      await prisma.alimtalkTemplate.update({
        where: { templateCode: t.templateCode },
        data: {
          name: t.name,
          category: t.category,
          variables: t.variables,
        },
      });
      updated += 1;
    } else {
      await prisma.alimtalkTemplate.create({
        data: {
          templateCode: t.templateCode,
          name: t.name,
          category: t.category,
          variables: t.variables,
          content: t.content,
          isActive: true,
        },
      });
      created += 1;
    }
  }
  console.log(
    `✅ AlimtalkTemplate 시드 완료 — created=${created}, updated=${updated}`,
  );
}
