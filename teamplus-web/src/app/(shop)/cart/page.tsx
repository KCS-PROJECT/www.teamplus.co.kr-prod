"use client";

import { useState, useEffect, useCallback } from "react";
import { NavLink, useNavigation } from "@/components/ui/NavLink";
import { Icon } from "@/components/ui/Icon";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { usePageReady } from "@/hooks/usePageReady";
import { useNativeUI } from "@/hooks/useNativeUI";
import { api } from "@/services/api-client";
import { MESSAGES } from "@/lib/messages";

interface CartItem {
  id: string;
  name: string;
  option: string;
  price: number;
  quantity: number;
  selected: boolean;
}

interface ApiCartItem {
  id: string;
  productId: string;
  optionId?: string | null;
  quantity: number;
  unitPrice: number;
  product?: {
    id: string;
    name: string;
    price: number;
  };
  option?: {
    optionName: string;
    optionValue: string;
  } | null;
}

const SHIPPING_FEE = 3000;
const DISCOUNT = 5000;
const FREE_SHIPPING_THRESHOLD = 50000;

function QuantityControl({
  quantity,
  onIncrease,
  onDecrease,
  itemName,
}: {
  quantity: number;
  onIncrease: () => void;
  onDecrease: () => void;
  itemName?: string;
}) {
  const labelSuffix = itemName ? ` (${itemName})` : "";
  return (
    <div
      className="flex items-center gap-3 bg-it-fill dark:bg-rink-800/50 rounded-w-pill px-1.5 py-1 border border-it-line-strong dark:border-rink-700"
      role="group"
      aria-label={`수량 조절${labelSuffix}`}
    >
      <button
        type="button"
        onClick={onDecrease}
        disabled={quantity <= 1}
        aria-label={`수량 1 감소${labelSuffix}`}
        className="flex size-7 items-center justify-center rounded-w-pill bg-it-surface dark:bg-rink-800 border border-it-line-strong dark:border-rink-700 text-it-ink-600 dark:text-rink-100 hover:text-it-blue-500 hover:border-it-blue-500 disabled:opacity-50 disabled:cursor-not-allowed active:brightness-95 transition-all motion-reduce:transition-none"
      >
        <Icon
          name="remove"
          className="text-card-emphasis font-bold"
          aria-hidden="true"
        />
      </button>
      <span
        className="w-6 text-center text-card-body font-bold text-it-ink-800 dark:text-white tabular-nums"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label={`현재 수량 ${quantity}개`}
      >
        {quantity}
      </span>
      <button
        type="button"
        onClick={onIncrease}
        aria-label={`수량 1 증가${labelSuffix}`}
        className="flex size-7 items-center justify-center rounded-w-pill bg-it-blue-500 text-white hover:bg-it-blue-600 active:brightness-95 transition-all motion-reduce:transition-none"
      >
        <Icon
          name="add"
          className="text-card-emphasis font-bold"
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

function CartItemCard({
  item,
  onSelect,
  onRemove,
  onQuantityChange,
}: {
  item: CartItem;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onQuantityChange: (id: string, delta: number) => void;
}) {
  return (
    <div
      className="relative flex flex-col gap-3 py-4 border-b border-it-line dark:border-rink-700 last:border-b-0"
      role="group"
      aria-labelledby={`cart-item-${item.id}-name`}
      aria-describedby={`cart-item-${item.id}-price`}
    >
      <div className="flex items-start gap-3">
        <div className="pt-1 flex items-center">
          <input
            type="checkbox"
            checked={item.selected}
            onChange={() => onSelect(item.id)}
            aria-label={`${item.name} 선택`}
            className="h-5 w-5 rounded-w-pill border-it-line-strong dark:border-rink-700 border-2 bg-transparent text-it-blue-500 checked:bg-it-blue-500 checked:border-it-blue-500 focus:ring-0 focus:ring-offset-0 transition-all motion-reduce:transition-none cursor-pointer"
          />
        </div>
        <div className="aspect-square rounded-w-md size-24 shrink-0 border border-it-line dark:border-white/5 bg-it-fill dark:bg-rink-700 flex items-center justify-center">
          <Icon
            name="checkroom"
            className="text-3xl text-it-ink-400 dark:text-rink-300"
          />
        </div>
        <div className="flex flex-1 flex-col justify-between min-h-24">
          <div className="flex justify-between items-start gap-2">
            <div>
              <h3
                id={`cart-item-${item.id}-name`}
                className="text-card-title font-bold text-it-ink-800 dark:text-white line-clamp-2 leading-snug"
              >
                {item.name}
              </h3>
              <p className="text-it-ink-500 dark:text-rink-300 text-card-meta mt-1.5 font-medium">
                옵션: {item.option}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="text-it-ink-400 hover:text-it-red-500 transition-colors motion-reduce:transition-none -mt-1 -mr-2 p-2 group"
              aria-label={`${item.name} 장바구니에서 삭제`}
            >
              <Icon
                name="close"
                className="text-[22px] group-hover:rotate-12 transition-transform motion-reduce:transition-none"
                aria-hidden="true"
              />
            </button>
          </div>
          <div className="flex items-end justify-between mt-3">
            <QuantityControl
              quantity={item.quantity}
              onIncrease={() => onQuantityChange(item.id, 1)}
              onDecrease={() => onQuantityChange(item.id, -1)}
              itemName={item.name}
            />
            <p
              id={`cart-item-${item.id}-price`}
              className="text-card-emphasis font-extrabold text-it-ink-800 dark:text-white text-right tabular-nums"
              aria-label={`소계 ${(item.price * item.quantity).toLocaleString()}원`}
            >
              {(item.price * item.quantity).toLocaleString()}원
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderSummary({
  subtotal,
  shipping,
  discount,
  total,
}: {
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
}) {
  return (
    <section className="bg-it-surface dark:bg-rink-800 px-5 py-6">
      <div className="flex justify-between gap-x-6 py-2">
        <p className="text-it-ink-600 dark:text-rink-300 text-card-title font-medium">
          총 상품 금액
        </p>
        <p className="text-it-ink-800 dark:text-white text-card-title font-semibold text-right">
          {subtotal.toLocaleString()}원
        </p>
      </div>
      <div className="flex justify-between gap-x-6 py-2">
        <p className="text-it-ink-600 dark:text-rink-300 text-card-title font-medium">
          배송비
        </p>
        <p className="text-it-ink-800 dark:text-white text-card-title font-semibold text-right">
          {shipping > 0 ? `${shipping.toLocaleString()}원` : "무료"}
        </p>
      </div>
      {discount > 0 && (
        <div className="flex justify-between gap-x-6 py-2 border-b border-dashed border-it-line dark:border-white/10 pb-4">
          <p className="text-it-blue-500 text-card-title font-medium">할인 금액</p>
          <p className="text-it-blue-500 text-card-title font-bold text-right">
            -{discount.toLocaleString()}원
          </p>
        </div>
      )}
      <div className="flex justify-between gap-x-6 pt-5 items-center">
        <p className="text-it-ink-800 dark:text-white text-card-emphasis font-bold">
          결제 예정 금액
        </p>
        <p className="text-it-blue-500 text-2xl font-black text-right tracking-tight tabular-nums">
          {total.toLocaleString()}원
        </p>
      </div>
    </section>
  );
}

const CART_STORAGE_KEY = "teamplus_cart";

export default function CartPage() {
  const { back, navigate } = useNavigation();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  // 네이티브 앱에서 UI 설정 (Flutter BottomNav 숨김 → 웹 BottomNav만 사용)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
  });

  /** 서버 장바구니 로드 + localStorage 병합 */
  const loadCart = useCallback(async () => {
    setIsLoading(true);
    try {
      // localStorage에 로컬 장바구니가 있으면 서버에 병합
      const localRaw = localStorage.getItem(CART_STORAGE_KEY);
      if (localRaw) {
        try {
          const localItems = JSON.parse(localRaw) as {
            id: string;
            quantity: number;
          }[];
          if (localItems.length > 0) {
            await api.post("/shop/cart/merge", {
              items: localItems.map((item) => ({
                productId: item.id,
                quantity: item.quantity,
              })),
            });
            localStorage.removeItem(CART_STORAGE_KEY);
          }
        } catch {
          /* 병합 실패는 무시 */
        }
      }

      // 서버 장바구니 조회
      const res = await api.get<{ items?: ApiCartItem[] }>("/shop/cart");
      if (res.success && res.data) {
        const items = (res.data as { items?: ApiCartItem[] }).items ?? [];
        setCartItems(
          items.map((item) => ({
            id: item.id,
            name: item.product?.name ?? "상품",
            option: item.option
              ? `${item.option.optionName}: ${item.option.optionValue}`
              : "-",
            price: item.unitPrice,
            quantity: item.quantity,
            selected: true,
          })),
        );
      }
    } catch {
      // 비로그인 시 localStorage fallback
      const localRaw = localStorage.getItem(CART_STORAGE_KEY);
      if (localRaw) {
        try {
          const localItems = JSON.parse(localRaw) as CartItem[];
          setCartItems(localItems.map((item) => ({ ...item, selected: true })));
        } catch {
          /* ignore */
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCart();
  }, [loadCart]);

  const selectedItems = cartItems.filter((item) => item.selected);
  const allSelected =
    cartItems.length > 0 && selectedItems.length === cartItems.length;
  const totalQuantity = selectedItems.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  const subtotal = selectedItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  const discount = subtotal >= FREE_SHIPPING_THRESHOLD ? DISCOUNT : 0;
  const total = subtotal + shipping - discount;

  const handleSelectAll = () => {
    const newSelected = !allSelected;
    setCartItems((prev) =>
      prev.map((item) => ({ ...item, selected: newSelected })),
    );
  };

  const handleSelectItem = (id: string) => {
    setCartItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, selected: !item.selected } : item,
      ),
    );
  };

  const handleRemoveItem = async (id: string) => {
    setCartItems((prev) => prev.filter((item) => item.id !== id));
    await api.delete(`/shop/cart/${id}`);
  };

  const handleQuantityChange = async (id: string, delta: number) => {
    const item = cartItems.find((i) => i.id === id);
    if (!item) return;
    const newQty = Math.max(1, item.quantity + delta);
    setCartItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, quantity: newQty } : i)),
    );
    await api.patch(`/shop/cart/${id}`, { quantity: newQty });
  };

  const handleRemoveSelected = async () => {
    const selected = cartItems.filter((item) => item.selected);
    setCartItems((prev) => prev.filter((item) => !item.selected));
    await Promise.all(
      selected.map((item) => api.delete(`/shop/cart/${item.id}`)),
    );
  };

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar
        title={`장바구니${cartItems.length > 0 ? ` (${cartItems.length})` : ""}`}
        subtitle={
          selectedItems.length > 0
            ? `${selectedItems.length}개 선택됨`
            : undefined
        }
        // [appbar-harness-v4 분류 C 정당화] "편집/완료" 토글 텍스트 버튼은 stateful UX 패턴으로
        //   icon-based extraActions (HeaderAction = {icon, label, onClick}) 형태로 변환 불가.
        //   장바구니 핵심 인터랙션이므로 우측 3 액션(시계/종/메뉴) 대체가 의도된 디자인.
        rightAction={
          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            className="flex h-9 items-center justify-center px-3 rounded-w-pill text-card-body font-bold text-it-ink-800 dark:text-white hover:bg-it-fill dark:hover:bg-rink-800 transition-colors"
          >
            {isEditing ? "완료" : "편집"}
          </button>
        }
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col bg-it-canvas dark:bg-puck pb-30">
        {/* Select All — flat 흰 섹션 */}
        <div className="px-4 sticky top-[60px] z-40 bg-it-surface dark:bg-rink-800 transition-colors motion-reduce:transition-none border-b border-it-line dark:border-rink-700">
          <label className="flex items-center gap-x-3 py-3 cursor-pointer group select-none">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={handleSelectAll}
              aria-label="전체 상품 선택"
              className="h-5 w-5 rounded-w-pill border-it-line-strong dark:border-rink-700 border-2 bg-it-surface dark:bg-rink-800 text-it-blue-500 checked:bg-it-blue-500 checked:border-it-blue-500 focus:ring-0 focus:ring-offset-0 transition-all motion-reduce:transition-none"
            />
            <span className="text-card-title font-semibold text-it-ink-700 dark:text-rink-100 group-hover:text-it-blue-500 transition-colors motion-reduce:transition-none">
              전체 선택 ({selectedItems.length}/{cartItems.length})
            </span>
            {isEditing && selectedItems.length > 0 && (
              <button
                onClick={handleRemoveSelected}
                className="ml-auto text-card-body text-it-red-500 font-medium hover:underline"
              >
                선택 삭제
              </button>
            )}
          </label>
        </div>

        {/* Cart Items */}
        {isLoading ? null : cartItems.length > 0 ? (
          <>
            {/* 상품 목록 — flat 흰 섹션 (8px 회색 갭) */}
            <section className="flex flex-col px-4 bg-it-surface dark:bg-rink-800 mt-2">
              {cartItems.map((item) => (
                <CartItemCard
                  key={item.id}
                  item={item}
                  onSelect={handleSelectItem}
                  onRemove={handleRemoveItem}
                  onQuantityChange={handleQuantityChange}
                />
              ))}
            </section>

            {/* 8px 회색 갭 */}
            <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

            {/* Order Summary */}
            <OrderSummary
              subtotal={subtotal}
              shipping={shipping}
              discount={discount}
              total={total}
            />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center py-20">
            <Icon
              name="shopping_cart"
              className="text-6xl text-it-ink-400 dark:text-rink-500 mb-4"
            />
            <p className="text-it-ink-500 dark:text-rink-300 text-card-title font-medium">
              장바구니가 비어있습니다
            </p>
            <NavLink
              href="/products"
              className="mt-4 px-6 py-3 bg-it-blue-500 text-white rounded-w-md font-bold hover:bg-it-blue-600 transition-colors motion-reduce:transition-none"
            >
              쇼핑하러 가기
            </NavLink>
          </div>
        )}
      </main>

      {/* Fixed Bottom CTA */}
      {cartItems.length > 0 && (
        <div className="fixed bottom-0 fixed-center-x bg-it-surface dark:bg-rink-900 border-t border-it-line dark:border-white/10 px-4 pt-4 pb-8 z-50">
          <div className="flex items-center justify-between mb-4">
            <span className="text-card-title font-semibold text-it-ink-700 dark:text-rink-100">
              총 주문금액
            </span>
            <span className="text-2xl font-bold text-it-blue-500 tracking-tight tabular-nums">
              {total.toLocaleString()}원
            </span>
          </div>
          <button
            disabled={selectedItems.length === 0}
            onClick={() => {
              try {
                localStorage.setItem(
                  CART_STORAGE_KEY,
                  JSON.stringify(
                    selectedItems.map(
                      ({ id, name, option, price, quantity }) => ({
                        id,
                        name,
                        option,
                        price,
                        quantity,
                      }),
                    ),
                  ),
                );
              } catch {
                /* ignore */
              }
              navigate("/shop-checkout");
            }}
            className={`w-full text-white text-card-title font-bold py-4 rounded-w-md flex items-center justify-center gap-2 transition-all motion-reduce:transition-none ${
              selectedItems.length > 0
                ? "bg-it-blue-500 hover:bg-it-blue-600 active:brightness-95"
                : "bg-it-line-strong cursor-not-allowed"
            }`}
          >
            <Icon name="shopping_bag" className="text-[22px]" />
            <span>구매하기 ({totalQuantity}개)</span>
          </button>
        </div>
      )}
    </MobileContainer>
  );
}
