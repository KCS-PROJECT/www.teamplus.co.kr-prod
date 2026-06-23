import { PAYMENT_SUCCESS_TEMPLATE } from "./payment-success.template";
import { MEMBERSHIP_APPROVED_TEMPLATE } from "./membership-approved.template";
import { CLASS_REMINDER_TEMPLATE } from "./class-reminder.template";
import { ATTENDANCE_CONFIRMED_TEMPLATE } from "./attendance-confirmed.template";
import { CREDIT_EXPIRY_TEMPLATE } from "./credit-expiry.template";
import * as Templates from "./index";

describe("Notification Templates", () => {
  describe("PAYMENT_SUCCESS_TEMPLATE", () => {
    it("should have correct template code", () => {
      expect(PAYMENT_SUCCESS_TEMPLATE.templateCode).toBe("PAYMENT_SUCCESS_001");
      expect(PAYMENT_SUCCESS_TEMPLATE.templateName).toBe("결제 완료 알림");
    });

    it("should have required fields", () => {
      expect(PAYMENT_SUCCESS_TEMPLATE.requiredFields).toContain("orderNumber");
      expect(PAYMENT_SUCCESS_TEMPLATE.requiredFields).toContain("className");
      expect(PAYMENT_SUCCESS_TEMPLATE.requiredFields).toContain("amount");
      expect(PAYMENT_SUCCESS_TEMPLATE.requiredFields).toContain("startDate");
    });

    it("should render template correctly", () => {
      const data = {
        orderNumber: "ORD-2026-001",
        className: "초급반 수업",
        amount: "240,000",
        startDate: "2026-01-10",
      };

      const rendered = PAYMENT_SUCCESS_TEMPLATE.render(data);

      expect(rendered).toContain("ORD-2026-001");
      expect(rendered).toContain("초급반 수업");
      expect(rendered).toContain("240,000");
      expect(rendered).toContain("2026-01-10");
      expect(rendered).toContain("결제가 완료되었습니다");
    });

    it("should validate correctly with all required fields", () => {
      const data = {
        orderNumber: "ORD-123",
        className: "테스트",
        amount: "100,000",
        startDate: "2026-01-01",
      };

      const result = PAYMENT_SUCCESS_TEMPLATE.validate(data);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should fail validation when missing required fields", () => {
      const data = {
        orderNumber: "ORD-123",
        // Missing className, amount, startDate
      };

      const result = PAYMENT_SUCCESS_TEMPLATE.validate(data);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("필수 필드 누락: className");
      expect(result.errors).toContain("필수 필드 누락: amount");
      expect(result.errors).toContain("필수 필드 누락: startDate");
    });
  });

  describe("MEMBERSHIP_APPROVED_TEMPLATE", () => {
    it("should have correct template code", () => {
      expect(MEMBERSHIP_APPROVED_TEMPLATE.templateCode).toBe(
        "MEMBERSHIP_APPROVED_001",
      );
      expect(MEMBERSHIP_APPROVED_TEMPLATE.templateName).toBe(
        "클럽 가입 승인 알림",
      );
    });

    it("should have required fields", () => {
      expect(MEMBERSHIP_APPROVED_TEMPLATE.requiredFields).toContain("name");
      expect(MEMBERSHIP_APPROVED_TEMPLATE.requiredFields).toContain(
        "coachName",
      );
    });

    it("should render template correctly", () => {
      const data = {
        name: "팀플러스 하키클럽",
        coachName: "김코치",
      };

      const rendered = MEMBERSHIP_APPROVED_TEMPLATE.render(data);

      expect(rendered).toContain("팀플러스 하키클럽");
      expect(rendered).toContain("김코치");
      expect(rendered).toContain("승인되었습니다");
    });

    it("should validate correctly", () => {
      const data = {
        name: "테스트 클럽",
        coachName: "홍코치",
      };

      const result = MEMBERSHIP_APPROVED_TEMPLATE.validate(data);

      expect(result.valid).toBe(true);
    });

    it("should fail validation when missing fields", () => {
      const data = {
        name: "테스트 클럽",
        // Missing coachName
      };

      const result = MEMBERSHIP_APPROVED_TEMPLATE.validate(data);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("필수 필드 누락: coachName");
    });
  });

  describe("CLASS_REMINDER_TEMPLATE", () => {
    it("should have correct template code", () => {
      expect(CLASS_REMINDER_TEMPLATE.templateCode).toBe("CLASS_REMINDER_001");
      expect(CLASS_REMINDER_TEMPLATE.templateName).toBe("수업 리마인더 알림");
    });

    it("should have required fields", () => {
      expect(CLASS_REMINDER_TEMPLATE.requiredFields).toContain("className");
      expect(CLASS_REMINDER_TEMPLATE.requiredFields).toContain("classDate");
      expect(CLASS_REMINDER_TEMPLATE.requiredFields).toContain("classTime");
    });

    it("should render template correctly", () => {
      const data = {
        className: "주말 초급반",
        classDate: "2026-01-05",
        classTime: "14:00",
      };

      const rendered = CLASS_REMINDER_TEMPLATE.render(data);

      expect(rendered).toContain("주말 초급반");
      expect(rendered).toContain("2026-01-05");
      expect(rendered).toContain("14:00");
      expect(rendered).toContain("내일 수업이 있습니다");
    });

    it("should validate correctly", () => {
      const data = {
        className: "테스트 수업",
        classDate: "2026-01-10",
        classTime: "10:00",
      };

      const result = CLASS_REMINDER_TEMPLATE.validate(data);

      expect(result.valid).toBe(true);
    });

    it("should fail validation when missing fields", () => {
      const data = {
        className: "테스트 수업",
        // Missing classDate, classTime
      };

      const result = CLASS_REMINDER_TEMPLATE.validate(data);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("ATTENDANCE_CONFIRMED_TEMPLATE", () => {
    it("should have correct template code", () => {
      expect(ATTENDANCE_CONFIRMED_TEMPLATE.templateCode).toBe(
        "ATTENDANCE_CONFIRMED_001",
      );
      expect(ATTENDANCE_CONFIRMED_TEMPLATE.templateName).toBe("출석 확인 알림");
    });

    it("should have required fields", () => {
      expect(ATTENDANCE_CONFIRMED_TEMPLATE.requiredFields).toContain(
        "className",
      );
      expect(ATTENDANCE_CONFIRMED_TEMPLATE.requiredFields).toContain(
        "attendanceDate",
      );
      expect(ATTENDANCE_CONFIRMED_TEMPLATE.requiredFields).toContain(
        "creditsRemaining",
      );
    });

    it("should render template correctly", () => {
      const data = {
        className: "중급반",
        attendanceDate: "2026-01-04",
        creditsRemaining: "7",
      };

      const rendered = ATTENDANCE_CONFIRMED_TEMPLATE.render(data);

      expect(rendered).toContain("중급반");
      expect(rendered).toContain("2026-01-04");
      expect(rendered).toContain("7");
      expect(rendered).toContain("출석이 확인되었습니다");
    });

    it("should validate correctly", () => {
      const data = {
        className: "테스트 수업",
        attendanceDate: "2026-01-05",
        creditsRemaining: "5",
      };

      const result = ATTENDANCE_CONFIRMED_TEMPLATE.validate(data);

      expect(result.valid).toBe(true);
    });

    it("should fail validation when missing fields", () => {
      const data = {
        className: "테스트 수업",
        // Missing attendanceDate, creditsRemaining
      };

      const result = ATTENDANCE_CONFIRMED_TEMPLATE.validate(data);

      expect(result.valid).toBe(false);
    });
  });

  describe("CREDIT_EXPIRY_TEMPLATE", () => {
    it("should have correct template code", () => {
      expect(CREDIT_EXPIRY_TEMPLATE.templateCode).toBe("CREDIT_EXPIRY_001");
      expect(CREDIT_EXPIRY_TEMPLATE.templateName).toBe("크레딧 만료 예정 알림");
    });

    it("should have required fields", () => {
      expect(CREDIT_EXPIRY_TEMPLATE.requiredFields).toContain("className");
      expect(CREDIT_EXPIRY_TEMPLATE.requiredFields).toContain(
        "creditsRemaining",
      );
      expect(CREDIT_EXPIRY_TEMPLATE.requiredFields).toContain("expiryDate");
    });

    it("should render template correctly", () => {
      const data = {
        className: "고급반",
        creditsRemaining: "3",
        expiryDate: "2026-01-31",
      };

      const rendered = CREDIT_EXPIRY_TEMPLATE.render(data);

      expect(rendered).toContain("고급반");
      expect(rendered).toContain("3");
      expect(rendered).toContain("2026-01-31");
      expect(rendered).toContain("만료");
    });

    it("should validate correctly", () => {
      const data = {
        className: "테스트 수업",
        creditsRemaining: "2",
        expiryDate: "2026-02-28",
      };

      const result = CREDIT_EXPIRY_TEMPLATE.validate(data);

      expect(result.valid).toBe(true);
    });

    it("should fail validation when missing fields", () => {
      const data = {
        className: "테스트 수업",
        // Missing creditsRemaining, expiryDate
      };

      const result = CREDIT_EXPIRY_TEMPLATE.validate(data);

      expect(result.valid).toBe(false);
    });
  });

  describe("Templates Index Export", () => {
    it("should export all templates", () => {
      expect(Templates.PAYMENT_SUCCESS_TEMPLATE).toBeDefined();
      expect(Templates.MEMBERSHIP_APPROVED_TEMPLATE).toBeDefined();
      expect(Templates.CLASS_REMINDER_TEMPLATE).toBeDefined();
      expect(Templates.ATTENDANCE_CONFIRMED_TEMPLATE).toBeDefined();
      expect(Templates.CREDIT_EXPIRY_TEMPLATE).toBeDefined();
    });

    it("should have correct template codes in index", () => {
      expect(Templates.PAYMENT_SUCCESS_TEMPLATE.templateCode).toBe(
        "PAYMENT_SUCCESS_001",
      );
      expect(Templates.MEMBERSHIP_APPROVED_TEMPLATE.templateCode).toBe(
        "MEMBERSHIP_APPROVED_001",
      );
      expect(Templates.CLASS_REMINDER_TEMPLATE.templateCode).toBe(
        "CLASS_REMINDER_001",
      );
      expect(Templates.ATTENDANCE_CONFIRMED_TEMPLATE.templateCode).toBe(
        "ATTENDANCE_CONFIRMED_001",
      );
      expect(Templates.CREDIT_EXPIRY_TEMPLATE.templateCode).toBe(
        "CREDIT_EXPIRY_001",
      );
    });
  });
});
