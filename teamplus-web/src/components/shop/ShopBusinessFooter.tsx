import { COMPANY_INFO } from "@/lib/legal/policy-content";

/**
 * 쇼핑몰 전용 사업자정보 푸터 — 전자상거래법 §10조 통신판매업자 정보 표시 의무.
 *
 * GlobalMenu 전역 푸터(사업자정보)와 달리 **통신판매업 신고번호**를 포함한다.
 * 통신판매업 신고번호는 통신판매(쇼핑몰) 운영 시에만 표시 의무가 발생하므로
 * (shop) 라우트 그룹 내에서만 사용한다 — 쇼핑몰은 1차 오픈 시 메뉴 진입점이
 * 제거되어 미노출이며, 2~3차 쇼핑몰 정식 오픈 시 자동으로 노출된다.
 *
 * 재사용: shop-profile · home · shop-checkout 등 쇼핑몰 거래 화면에 배치 가능.
 * 디자인: GlobalMenu 푸터 토큰 체계(text-card-meta · text-wtext-4) 준수.
 * 구분자는 RULE-D04(literal `|` 금지)에 따라 가운뎃점(·) 사용.
 */
export function ShopBusinessFooter() {
  return (
    <div className="text-card-meta text-wtext-4 dark:text-rink-300 leading-relaxed space-y-0.5">
      <p>
        <span className="font-semibold">{COMPANY_INFO.name}</span>
        <span className="mx-1.5 text-wline-2 dark:text-rink-600" aria-hidden="true">
          ·
        </span>
        대표 {COMPANY_INFO.ceo}
      </p>
      <p>사업자등록번호 {COMPANY_INFO.businessNumber}</p>
      <p>통신판매업 신고번호 {COMPANY_INFO.mailOrderRegNumber}</p>
      <p>{COMPANY_INFO.address}</p>
      <p>
        고객센터 {COMPANY_INFO.csPhone}
        <span className="mx-1.5 text-wline-2 dark:text-rink-600" aria-hidden="true">
          ·
        </span>
        {COMPANY_INFO.csEmail}
      </p>
      <p className="opacity-80">운영시간 {COMPANY_INFO.csHours}</p>
      <p className="opacity-80">개인정보 보호책임자 {COMPANY_INFO.privacyOfficer}</p>
    </div>
  );
}

export default ShopBusinessFooter;
