// Pruebas unitarias: carrito (CART-01, CART-02)
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { CartProvider, useCart } from '../../src/context/CartContext.jsx';

const wrapper = ({ children }) => <CartProvider>{children}</CartProvider>;
const tomate = { id: 'p1', name: 'Tomate', price: 10, producerId: 'A', producerName: 'Finca A' };
const cebolla = { id: 'p2', name: 'Cebolla', price: '2.5', producerId: 'A', producerName: 'Finca A' };
const maiz = { id: 'p3', name: 'Maíz', price: 7, producerId: 'B', producerName: 'Finca B' };

describe('CartContext', () => {
  beforeEach(() => window.localStorage.clear()); // aislamiento entre pruebas

  it('inicia vacío', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    expect(result.current.items).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.count).toBe(0);
  });

  it('calcula subtotal y total (incluye precios como texto)', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => { result.current.addItem(tomate, 3); });
    act(() => { result.current.addItem(cebolla, 2); });
    expect(result.current.total).toBe(3 * 10 + 2 * 2.5);
    expect(result.current.count).toBe(5);
  });

  it('suma cantidad si el producto ya existe', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => { result.current.addItem(tomate, 1); });
    act(() => { result.current.addItem(tomate, 4); });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].qty).toBe(5);
  });

  it('CART-01: rechaza productos de otro productor y no modifica el carrito', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => { result.current.addItem(tomate, 1); });
    let res;
    act(() => { res = result.current.addItem(maiz, 1); });
    expect(res.error).toMatch(/Finca A/);
    expect(result.current.items).toHaveLength(1);
    expect(result.current.producerId).toBe('A');
  });

  it('updateQty con cantidad 0 o negativa elimina la línea', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => { result.current.addItem(tomate, 2); });
    act(() => { result.current.updateQty('p1', 0); });
    expect(result.current.items).toHaveLength(0);
  });

  it('removeItem y clearCart vacían el carrito', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => { result.current.addItem(tomate, 1); });
    act(() => { result.current.addItem(cebolla, 1); });
    act(() => { result.current.removeItem('p1'); });
    expect(result.current.items).toHaveLength(1);
    act(() => { result.current.clearCart(); });
    expect(result.current.items).toHaveLength(0);
  });

  it('CART-02 (requisito deseado): el carrito persiste al remontar la app', () => {
    const first = renderHook(() => useCart(), { wrapper });
    act(() => { first.result.current.addItem(tomate, 2); });
    first.unmount(); // equivale a recargar la página
    const second = renderHook(() => useCart(), { wrapper });
    // Falla mientras el carrito viva solo en useState (BUG-02).
    expect(second.result.current.items).toHaveLength(1);
  });
});
