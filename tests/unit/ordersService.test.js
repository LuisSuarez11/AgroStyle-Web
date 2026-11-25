// Pruebas unitarias del servicio de pedidos (ORD-02 lado cliente, transiciones por RPC).
// Se simula supabase: NO se contacta ningún backend real.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpc, maybeSingle } = vi.hoisted(() => ({ rpc: vi.fn(), maybeSingle: vi.fn() }));
vi.mock('../../src/services/supabase.js', () => {
  const chain = { select: () => chain, eq: () => chain, order: () => chain, maybeSingle };
  return { supabase: { rpc: (...a) => rpc(...a), from: () => chain } };
});

import { createOrder, confirmOrder, rejectOrder, payOrder } from '../../src/services/orders.js';

beforeEach(() => {
  rpc.mockReset();
  maybeSingle.mockReset();
});

describe('createOrder', () => {
  it('ORD-02 (cliente): envía solo productId y quantity; nunca precio ni total', async () => {
    rpc.mockResolvedValue({ data: 'order-1', error: null });
    maybeSingle.mockResolvedValue({ data: { id: 'order-1' }, error: null });

    await createOrder({
      notes: 'hola',
      items: [{ productId: 'p1', quantity: '3', price: 1, total: 1, subtotal: 1 }],
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe('create_order_atomic');
    expect(args.p_items).toEqual([{ productId: 'p1', quantity: 3 }]);
    expect(JSON.stringify(args)).not.toMatch(/price|total|subtotal/);
  });

  it('propaga el error de la RPC (stock insuficiente) sin consultar un pedido', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('Stock insuficiente') });
    await expect(createOrder({ items: [{ productId: 'p1', quantity: 99 }] }))
      .rejects.toThrow('Stock insuficiente');
    expect(maybeSingle).not.toHaveBeenCalled();
  });
});

describe('transiciones por RPC (no UPDATE directo)', () => {
  it('confirmar, rechazar y pagar llaman a su función RPC con el id del pedido', async () => {
    rpc.mockResolvedValue({ data: { id: 'o1' }, error: null });
    maybeSingle.mockResolvedValue({ data: { id: 'o1' }, error: null });
    await confirmOrder('o1');
    await rejectOrder('o1', 'sin stock');
    await payOrder('o1');
    expect(rpc.mock.calls.map((c) => c[0])).toEqual([
      'producer_confirm_order', 'producer_reject_order', 'simulate_pay_order',
    ]);
    expect(rpc.mock.calls[1][1]).toEqual({ p_order_id: 'o1', p_reason: 'sin stock' });
  });

  it('un error de la RPC de pago (ej. pedido ajeno) se propaga', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('No autorizado') });
    await expect(payOrder('o9')).rejects.toThrow('No autorizado');
  });
});
