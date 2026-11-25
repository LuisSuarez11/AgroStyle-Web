import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const CartContext = createContext();

export function useCart() {
  return useContext(CartContext);
}

const CART_STORAGE_KEY = 'agrostyle.cart.v1';

function loadStoredItems() {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((i) => i?.product?.id != null && Number(i.qty) > 0)
      : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }) {
  // { product, qty } - persistido en localStorage (corrige BUG-02: carrito perdido al recargar)
  const [items, setItems] = useState(loadStoredItems);

  useEffect(() => {
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch { /* almacenamiento no disponible: se mantiene en memoria */ }
  }, [items]);
  const [isOpen, setIsOpen] = useState(false);

  const producerId   = items[0]?.product.producerId   || null;
  const producerName = items[0]?.product.producerName || null;
  const total = items.reduce((sum, { product, qty }) => sum + Number(product.price) * qty, 0);
  const count = items.reduce((sum, { qty }) => sum + qty, 0);

  const addItem = useCallback((product, qty) => {
    // Restrict to 1 producer
    if (items.length > 0 && product.producerId !== producerId) {
      return { error: `El carrito ya tiene productos de ${producerName}. Vacía el carrito para agregar de otro productor.` };
    }
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.product.id === product.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], qty: updated[idx].qty + qty };
        return updated;
      }
      return [...prev, { product, qty }];
    });
    return { error: null };
  }, [items, producerId, producerName]);

  const removeItem = useCallback((productId) => {
    setItems((prev) => prev.filter((i) => i.product.id !== productId));
  }, []);

  const updateQty = useCallback((productId, qty) => {
    if (qty <= 0) {
      setItems((prev) => prev.filter((i) => i.product.id !== productId));
    } else {
      setItems((prev) =>
        prev.map((i) => i.product.id === productId ? { ...i, qty } : i)
      );
    }
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  return (
    <CartContext.Provider value={{
      items, total, count, producerId, producerName,
      addItem, removeItem, updateQty, clearCart,
      isOpen, openCart: () => setIsOpen(true), closeCart: () => setIsOpen(false),
    }}>
      {children}
    </CartContext.Provider>
  );
}
