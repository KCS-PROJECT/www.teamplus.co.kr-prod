"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Icon } from "@/components/ui/Icon";
import { useNavigation } from "@/components/ui/NavLink";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { useNativeUI } from "@/hooks/useNativeUI";
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { usePageReady } from "@/hooks/usePageReady";
import { MESSAGES } from "@/lib/messages";

const GlobalMenu = dynamic(
  () =>
    import("@/components/layout/GlobalMenu").then((mod) => ({
      default: mod.GlobalMenu,
    })),
  { ssr: false },
);

interface CartItem {
  id: string;
  name: string;
  brand?: string;
  option: string;
  price: number;
  quantity: number;
}

type PaymentMethod = "card" | "bank" | "kakao" | "naver" | "samsung";

const CART_STORAGE_KEY = "teamplus_cart";

const deliveryOptions = [
  MESSAGES.delivery.requestFront,
  "직접 받고 부재 시 문 앞",
  MESSAGES.delivery.requestSecurity,
  MESSAGES.delivery.requestBox,
];

const paymentMethods: {
  id: PaymentMethod;
  label: string;
  icon: string;
  bgColor: string;
  textColor: string;
  fullWidth?: boolean;
  badge?: string;
}[] = [
  {
    id: "card",
    label: "신용카드",
    icon: "credit_card",
    bgColor: "bg-it-blue-50",
    textColor: "text-it-blue-500",
  },
  {
    id: "bank",
    label: "무통장입금",
    icon: "account_balance",
    bgColor: "bg-it-fill dark:bg-rink-800",
    textColor: "text-it-ink-600 dark:text-rink-300",
  },
  {
    id: "kakao",
    label: "카카오페이",
    icon: "chat_bubble",
    bgColor: "bg-brand-kakao",
    textColor: "text-brand-kakao-text-2",
    fullWidth: true,
    badge: "EASY",
  },
  {
    id: "naver",
    label: "네이버페이",
    icon: "near_me",
    bgColor: "bg-brand-naver",
    textColor: "text-white",
  },
  {
    id: "samsung",
    label: "삼성페이",
    icon: "nfc",
    bgColor: "bg-brand-samsung",
    textColor: "text-white",
  },
];

function OrderItemCard({ item }: { item: CartItem }) {
  return (
    <div className="flex gap-4">
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-w-md bg-it-fill dark:bg-rink-800 border border-it-line dark:border-white/5 flex items-center justify-center">
        <Icon
          name="shopping_bag"
          className="text-3xl text-it-ink-400 dark:text-rink-500"
        />
      </div>
      <div className="flex flex-1 flex-col justify-between py-1">
        <div>
          {item.brand && (
            <p className="text-it-ink-400 dark:text-rink-300 text-w-caption mb-1">
              {item.brand}
            </p>
          )}
          <h3 className="text-it-ink-800 dark:text-white text-w-small font-medium line-clamp-2">
            {item.name}
          </h3>
          <p className="text-it-ink-400 dark:text-rink-300 text-w-caption mt-1">
            옵션: {item.option}
          </p>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-it-ink-400 text-w-small">{item.quantity}개</span>
          <span className="text-it-ink-800 dark:text-white font-bold text-right tabular-nums">
            {item.price.toLocaleString()}원
          </span>
        </div>
      </div>
    </div>
  );
}

function PaymentMethodButton({
  method,
  selected,
  onSelect,
}: {
  method: (typeof paymentMethods)[0];
  selected: boolean;
  onSelect: () => void;
}) {
  const baseClasses = `flex items-center justify-start gap-3 p-4 rounded-w-md border-[1.5px] transition-all motion-reduce:transition-none ${
    method.fullWidth ? "col-span-2" : ""
  }`;

  const selectedClasses = selected
    ? `${method.bgColor} border-it-blue-500`
    : `${method.bgColor} border-transparent hover:border-it-line-strong dark:hover:border-white/10`;

  return (
    <button
      type="button"
      onClick={onSelect}
      role="radio"
      aria-checked={selected}
      aria-label={`${method.label} 결제`}
      className={`${baseClasses} ${selectedClasses}`}
    >
      <div
        className={`flex items-center justify-center w-10 h-10 rounded-w-pill ${
          selected
            ? "bg-it-blue-100"
            : method.id === "card"
              ? "bg-it-blue-50"
              : "bg-black/10"
        }`}
      >
        <Icon
          name={method.icon}
          className={`text-xl ${selected ? "text-it-blue-500" : method.textColor} ${
            method.id === "naver" ? "rotate-45" : ""
          }`}
        />
      </div>
      <span
        className={`text-w-small font-bold flex-1 text-left ${method.textColor}`}
      >
        {method.label}
      </span>
      {method.badge && (
        <span className="bg-black/20 text-brand-kakao-text-2 text-w-caption px-1.5 py-0.5 rounded font-bold">
          {method.badge}
        </span>
      )}
      {selected && (
        <div className="w-4 h-4 rounded-w-pill border-2 border-it-blue-500 flex items-center justify-center">
          <div className="w-2 h-2 bg-it-blue-500 rounded-w-pill" />
        </div>
      )}
    </button>
  );
}

export default function ShopCheckoutPage() {
  const { back } = useNavigation();
  const { user: authUser } = useSessionAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [orderItems, setOrderItems] = useState<CartItem[]>([]);
  const [deliveryOption, setDeliveryOption] = useState(deliveryOptions[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
  });
  usePageReady(true); // localStorage 기반 즉시 ready

  const [pointsToUse, setPointsToUse] = useState("");
  const [installment, setInstallment] = useState("일시불");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => {
    // localStorage에서 카트 아이템 로드
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CartItem[];
        setOrderItems(parsed.filter((item) => item.quantity > 0));
      }
    } catch {
      setOrderItems([]);
    }
    // 사용자 이름으로 수령인 초기값 설정
    if (authUser?.name) setRecipientName(authUser.name);
  }, [authUser]);

  const subtotal = orderItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const shipping = 0;
  const usedPoints = parseInt(pointsToUse) || 0;
  const total = subtotal + shipping - usedPoints;

  const handleUseAllPoints = () => {
    setPointsToUse("0");
  };

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar
        title="주문/결제"
        // [appbar-harness-v4 분류 C 정당화] "취소" 텍스트 버튼은 결제 플로우 중 명시적 이탈 액션으로
        //   icon-based extraActions (HeaderAction = {icon, label, onClick}) 형태로 변환 불가.
        //   결제 플로우 핵심 인터랙션이므로 우측 3 액션(시계/종/메뉴) 대체가 의도된 디자인.
        rightAction={
          <button
            type="button"
            onClick={() => back()}
            className="flex h-10 items-center justify-end px-2"
            aria-label="취소"
          >
            <p className="text-it-ink-500 dark:text-rink-300 text-w-body-lg font-bold">
              취소
            </p>
          </button>
        }
      />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck pb-30">
        {/* Shipping Address — flat 흰 섹션 */}
        <section className="mt-2 bg-it-surface dark:bg-rink-800 px-4 py-5">
          <h2 className="text-it-ink-800 dark:text-white text-xl font-bold pb-3">
            배송지 정보
          </h2>
          <div className="space-y-3">
            <div>
              <label
                htmlFor="checkout-recipient-name"
                className="block text-w-caption font-semibold text-it-ink-500 dark:text-rink-300 mb-1"
              >
                수령인
              </label>
              <input
                id="checkout-recipient-name"
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder={MESSAGES.placeholders.enterRecipientName}
                autoComplete="name"
                required
                aria-required="true"
                aria-label="수령인 이름 (필수)"
                className="w-full bg-it-fill dark:bg-rink-900 border-[1.5px] border-it-line-strong dark:border-rink-700 text-it-ink-800 dark:text-white text-w-small rounded-w-md focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500 p-3 outline-none transition-colors"
              />
            </div>
            <div>
              <label
                htmlFor="checkout-recipient-phone"
                className="block text-w-caption font-semibold text-it-ink-500 dark:text-rink-300 mb-1"
              >
                연락처
              </label>
              <input
                id="checkout-recipient-phone"
                type="tel"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="010-0000-0000"
                autoComplete="tel"
                required
                aria-required="true"
                aria-label="수령인 연락처 (필수)"
                inputMode="tel"
                className="w-full bg-it-fill dark:bg-rink-900 border-[1.5px] border-it-line-strong dark:border-rink-700 text-it-ink-800 dark:text-white text-w-small rounded-w-md focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500 p-3 outline-none transition-colors"
              />
            </div>
            <div>
              <label
                htmlFor="checkout-address"
                className="block text-w-caption font-semibold text-it-ink-500 dark:text-rink-300 mb-1"
              >
                주소
              </label>
              <input
                id="checkout-address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={MESSAGES.placeholders.enterAddress}
                autoComplete="street-address"
                required
                aria-required="true"
                aria-label="배송지 주소 (필수)"
                className="w-full bg-it-fill dark:bg-rink-900 border-[1.5px] border-it-line-strong dark:border-rink-700 text-it-ink-800 dark:text-white text-w-small rounded-w-md focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500 p-3 outline-none transition-colors"
              />
            </div>
            <select
              value={deliveryOption}
              onChange={(e) => setDeliveryOption(e.target.value)}
              aria-label="배송 요청사항 선택"
              className="w-full bg-it-fill dark:bg-rink-900 border-[1.5px] border-it-line-strong dark:border-rink-700 text-it-ink-800 dark:text-white text-w-small rounded-w-md focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500 p-3 outline-none transition-colors"
            >
              {deliveryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Order Items — flat 흰 섹션 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
        <section className="bg-it-surface dark:bg-rink-800 px-4 py-5">
          <h2 className="text-it-ink-800 dark:text-white text-xl font-bold pb-4">
            주문 상품{" "}
            <span className="text-it-blue-500 text-w-title ml-1">
              {orderItems.length}
            </span>
          </h2>
          {orderItems.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2 text-it-ink-400">
              <Icon name="shopping_cart" className="text-4xl" />
              <p className="text-w-small">장바구니가 비어있습니다.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {orderItems.map((item) => (
                <OrderItemCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>

        {/* Discount / Points — flat 흰 섹션 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
        <section className="bg-it-surface dark:bg-rink-800 px-4 py-5">
          <h2 className="text-it-ink-800 dark:text-white text-xl font-bold pb-4">
            할인 / 포인트
          </h2>
          <div className="bg-it-fill dark:bg-rink-700/40 p-4 rounded-w-md border border-it-line dark:border-white/5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-it-ink-800 dark:text-white font-medium">
                포인트 사용
              </span>
              <span className="text-it-ink-400 dark:text-rink-300 text-w-caption">
                보유 0 P
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                value={pointsToUse}
                onChange={(e) => setPointsToUse(e.target.value)}
                placeholder={MESSAGES.placeholders.enterUsePoint}
                min={0}
                aria-label="사용할 포인트 금액"
                aria-valuemin={0}
                inputMode="numeric"
                className="flex-1 bg-it-surface dark:bg-rink-900 border-[1.5px] border-it-line-strong dark:border-rink-700 rounded-w-md px-3 py-2.5 text-right text-it-ink-800 dark:text-white focus:outline-none focus:border-it-blue-500 placeholder:text-it-ink-400 tabular-nums"
              />
              <button
                type="button"
                onClick={handleUseAllPoints}
                className="bg-it-surface dark:bg-rink-700 text-it-ink-800 dark:text-white px-4 py-2.5 rounded-w-md text-w-small font-medium border-[1.5px] border-it-line-strong dark:border-white/10 hover:bg-it-fill dark:hover:bg-rink-500 transition-colors motion-reduce:transition-none whitespace-nowrap"
              >
                전액사용
              </button>
            </div>
          </div>
        </section>

        {/* Payment Methods — flat 흰 섹션 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
        <section className="bg-it-surface dark:bg-rink-800 px-4 py-5" aria-labelledby="payment-methods-heading">
          <h2
            id="payment-methods-heading"
            className="text-it-ink-800 dark:text-white text-xl font-bold pb-4"
          >
            결제 수단 <span className="sr-only">(필수)</span>
          </h2>
          <div
            className="grid grid-cols-2 gap-3"
            role="radiogroup"
            aria-label="결제 수단 선택 (필수)"
            aria-required="true"
          >
            {paymentMethods.map((method) => (
              <PaymentMethodButton
                key={method.id}
                method={method}
                selected={paymentMethod === method.id}
                onSelect={() => setPaymentMethod(method.id)}
              />
            ))}
          </div>
          {paymentMethod === "card" && (
            <div className="mt-4 p-4 bg-it-fill dark:bg-rink-700/40 rounded-w-md border border-it-line dark:border-white/5">
              <label
                htmlFor="checkout-installment"
                className="text-w-caption text-it-ink-400 dark:text-rink-300 block mb-2"
              >
                할부기간
              </label>
              <select
                id="checkout-installment"
                value={installment}
                onChange={(e) => setInstallment(e.target.value)}
                aria-label="신용카드 할부 기간 선택"
                className="w-full bg-it-surface dark:bg-rink-900 border-[1.5px] border-it-line-strong dark:border-rink-700 text-it-ink-800 dark:text-white text-w-small rounded-w-md focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500 p-2.5 outline-none transition-colors"
              >
                <option>일시불</option>
                <option>2개월 (무이자)</option>
                <option>3개월 (무이자)</option>
                <option>6개월 (부분무이자)</option>
              </select>
            </div>
          )}
        </section>

        {/* Final Amount — flat 흰 섹션 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
        <section className="bg-it-surface dark:bg-rink-800 px-4 py-5">
          <h2 className="text-it-ink-800 dark:text-white text-xl font-bold pb-4">
            최종 결제 금액
          </h2>
          <div className="flex flex-col gap-3 text-w-small">
            <div className="flex justify-between items-center text-it-ink-600 dark:text-rink-100">
              <span>총 상품 금액</span>
              <span className="font-medium text-it-ink-800 dark:text-white tabular-nums">
                {subtotal.toLocaleString()}원
              </span>
            </div>
            <div className="flex justify-between items-center text-it-ink-600 dark:text-rink-100">
              <span>배송비</span>
              <span className="font-medium text-it-ink-800 dark:text-white">
                {shipping > 0 ? `${shipping.toLocaleString()}원` : "무료"}
              </span>
            </div>
            {usedPoints > 0 && (
              <div className="flex justify-between items-center text-it-blue-500">
                <span>포인트 할인</span>
                <span className="font-bold tabular-nums">
                  - {usedPoints.toLocaleString()}원
                </span>
              </div>
            )}
            <div className="h-px bg-it-line dark:bg-white/10 my-1" />
            <div className="flex justify-between items-end pt-1">
              <span className="text-it-ink-800 dark:text-white text-w-body-lg font-bold">
                총 결제 금액
              </span>
              <span className="text-it-blue-500 text-2xl font-bold tracking-tight tabular-nums">
                {total.toLocaleString()}원
              </span>
            </div>
          </div>
          <div className="mt-6 flex items-start gap-2 bg-it-blue-50 dark:bg-it-blue-900/20 p-3 rounded-w-md border border-it-blue-100 dark:border-it-blue-500/20">
            <Icon name="verified" className="text-it-blue-500 text-xl mt-0.5" />
            <p className="text-w-caption text-it-ink-600 dark:text-blue-200/80 leading-relaxed">
              구매 조건 및 결제 진행 동의를 포함하여 모든 약관에 동의합니다.
            </p>
          </div>
        </section>

        {/* Spacer */}
        <div className="h-10 bg-it-canvas dark:bg-puck" />
      </div>

      {/* Fixed Bottom CTA */}
      <div className="fixed bottom-0 fixed-center-x bg-it-surface dark:bg-rink-900 border-t border-it-line dark:border-white/10 p-4 pb-8 z-50">
        <button
          type="button"
          disabled={orderItems.length === 0}
          className="w-full bg-it-blue-500 hover:bg-it-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xl font-bold py-5 rounded-w-md transition-all motion-reduce:transition-none active:brightness-95 flex items-center justify-center gap-2"
        >
          <span>
            {total > 0 ? `${total.toLocaleString()}원 결제하기` : "결제하기"}
          </span>
          <Icon name="arrow_forward" className="text-xl" />
        </button>
      </div>
      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </MobileContainer>
  );
}
