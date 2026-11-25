import { supabase } from './supabase';

const ORDER_SELECT = `
  id,
  buyerId:buyer_id,
  buyerName:buyer_name,
  producerId:producer_id,
  producerName:producer_name,
  status,
  total,
  notes,
  rejectionReason:rejection_reason,
  qrCode:qr_code,
  createdAt:created_at,
  updatedAt:updated_at,
  items:order_items (
    id,
    productId:product_id,
    productName:product_name,
    unit,
    price,
    quantity,
    subtotal,
    isPreorder:is_preorder,
    availableDate:available_date
  )
`;

function mapOrder(row) {
  if (!row) return row;
  return {
    id: row.id,
    buyerId: row.buyer_id ?? row.buyerId,
    buyerName: row.buyer_name ?? row.buyerName,
    producerId: row.producer_id ?? row.producerId,
    producerName: row.producer_name ?? row.producerName,
    status: row.status,
    total: row.total,
    notes: row.notes,
    rejectionReason: row.rejection_reason ?? row.rejectionReason,
    qrCode: row.qr_code ?? row.qrCode,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
    items: (row.items || row.order_items || []).map((it) => ({
      id: it.id,
      productId: it.product_id ?? it.productId,
      productName: it.product_name ?? it.productName,
      unit: it.unit,
      price: it.price,
      quantity: it.quantity,
      subtotal: it.subtotal,
      isPreorder: it.is_preorder ?? it.isPreorder,
      availableDate: it.available_date ?? it.availableDate,
    })),
  };
}

export async function createOrder({ notes, items }) {
  const payloadItems = (items || []).map((it) => ({
    productId: it.productId,
    quantity: Number(it.quantity),
  }));

  const { data: orderId, error } = await supabase.rpc('create_order_atomic', {
    p_notes: notes || null,
    p_items: payloadItems,
  });
  if (error) throw error;
  return getOrder(orderId);
}

export async function getOrder(orderId) {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listBuyerOrders(buyerId) {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('buyer_id', buyerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listProducerOrders(producerId) {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('producer_id', producerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function confirmOrder(orderId) {
  const { data, error } = await supabase.rpc('producer_confirm_order', { p_order_id: orderId });
  if (error) throw error;
  return getOrder(data?.id || orderId);
}

export async function rejectOrder(orderId, reason) {
  const { data, error } = await supabase.rpc('producer_reject_order', {
    p_order_id: orderId,
    p_reason: reason,
  });
  if (error) throw error;
  return getOrder(data?.id || orderId);
}

export async function payOrder(orderId) {
  const { data, error } = await supabase.rpc('simulate_pay_order', { p_order_id: orderId });
  if (error) throw error;
  return getOrder(data?.id || orderId);
}

export const ORDER_STATUS_LABEL = {
  pending_confirmation: 'Pendiente confirmación',
  confirmed:  'Confirmado',
  rejected:   'Rechazado',
  paid:       'Pagado',
  delivered:  'Entregado',
};

export const ORDER_STATUS_COLOR = {
  pending_confirmation: 'warning',
  confirmed:  'info',
  rejected:   'danger',
  paid:       'success',
  delivered:  'success',
};
