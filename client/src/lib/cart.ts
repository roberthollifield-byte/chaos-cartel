// ============================================================
// Chaos Cartel — client-side cart (localStorage backed)
// ============================================================
// The cart lives in the browser only. No server-side cart table.
// On checkout we POST the cart contents to /api/cart-checkout which
// snapshots the whole cart into an Order + OrderItems.
// ============================================================
import { useEffect, useState, useCallback } from "react";

export interface CartLine {
  productId: number;
  productSlug: string;
  productName: string;
  imageUrl: string | null;
  category: string;
  size: string | null;
  quantity: number;
  unitPriceCents: number;
}

const STORAGE_KEY = "cc.cart.v1";
const EVENT_NAME = "cc:cart-changed";

function readCart(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x: any) =>
      x && typeof x.productId === "number" && typeof x.quantity === "number" && x.quantity > 0
    ) as CartLine[];
  } catch {
    return [];
  }
}

function writeCart(lines: CartLine[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // localStorage might be full or blocked; fail silent, in-memory only for this tab.
  }
}

// Two items are the SAME cart line if same product AND same size.
function sameLine(a: CartLine, b: Pick<CartLine, "productId" | "size">) {
  return a.productId === b.productId && (a.size || null) === (b.size || null);
}

export function addToCart(line: Omit<CartLine, "quantity"> & { quantity?: number }) {
  const qty = line.quantity ?? 1;
  const current = readCart();
  const existing = current.find(l => sameLine(l, line));
  if (existing) {
    existing.quantity = Math.min(20, existing.quantity + qty);
    writeCart(current);
  } else {
    writeCart([...current, { ...line, quantity: qty }]);
  }
}

export function updateQuantity(productId: number, size: string | null, quantity: number) {
  const current = readCart();
  const next = current
    .map(l => sameLine(l, { productId, size }) ? { ...l, quantity } : l)
    .filter(l => l.quantity > 0);
  writeCart(next);
}

export function removeFromCart(productId: number, size: string | null) {
  const current = readCart();
  writeCart(current.filter(l => !sameLine(l, { productId, size })));
}

export function clearCart() {
  writeCart([]);
}

export function cartSubtotalCents(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
}

export function cartItemCount(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}

export function cartCategories(lines: CartLine[]): string[] {
  return lines.map(l => l.category);
}

// React hook: subscribes to cart changes across tabs + within the same tab.
export function useCart() {
  const [lines, setLines] = useState<CartLine[]>(() => readCart());

  const refresh = useCallback(() => setLines(readCart()), []);

  useEffect(() => {
    const onChange = () => refresh();
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) refresh(); };
    window.addEventListener(EVENT_NAME, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  return {
    lines,
    itemCount: cartItemCount(lines),
    subtotalCents: cartSubtotalCents(lines),
    categories: cartCategories(lines),
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
  };
}
