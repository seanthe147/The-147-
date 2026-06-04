import React, { createContext, useContext, useState, useCallback } from "react";
import type { SelectedModifier } from "@/types/menu";

export interface CartItem {
  cartKey: string;
  variationId: string;
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  modifiers?: SelectedModifier[];
}

function makeCartKey(variationId: string, modifiers?: SelectedModifier[]): string {
  if (!modifiers || modifiers.length === 0) return variationId;
  return variationId + ":" + modifiers.map((m) => m.catalogObjectId).sort().join(",");
}

interface AddItemPayload {
  variationId: string;
  itemId: string;
  name: string;
  price: number;
  modifiers?: SelectedModifier[];
  quantity?: number;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: AddItemPayload) => void;
  removeItem: (cartKey: string) => void;
  updateQuantity: (cartKey: string, delta: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  getQuantity: (variationId: string) => number;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback((item: AddItemPayload) => {
    const cartKey = makeCartKey(item.variationId, item.modifiers);
    const addQty = Math.max(1, item.quantity ?? 1);
    setItems((prev) => {
      const existing = prev.find((i) => i.cartKey === cartKey);
      if (existing) {
        return prev.map((i) =>
          i.cartKey === cartKey ? { ...i, quantity: i.quantity + addQty } : i
        );
      }
      const { quantity: _q, ...rest } = item;
      return [...prev, { ...rest, cartKey, quantity: addQty }];
    });
  }, []);

  const removeItem = useCallback((cartKey: string) => {
    setItems((prev) => prev.filter((i) => i.cartKey !== cartKey));
  }, []);

  const updateQuantity = useCallback((cartKey: string, delta: number) => {
    setItems((prev) =>
      prev
        .map((i) => (i.cartKey === cartKey ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0)
    );
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalPrice = items.reduce(
    (sum, i) =>
      sum +
      (i.price + (i.modifiers?.reduce((ms, m) => ms + m.price, 0) ?? 0)) * i.quantity,
    0
  );

  const getQuantity = useCallback(
    (variationId: string) =>
      items
        .filter((i) => i.variationId === variationId)
        .reduce((sum, i) => sum + i.quantity, 0),
    [items]
  );

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        totalItems,
        totalPrice,
        getQuantity,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
