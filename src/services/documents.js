import { supabase } from './supabase';

const SELECT = `
  id,
  producerId:producer_id,
  producerName:producer_name,
  title,
  description,
  fileName:file_name,
  fileUrl:file_url,
  status,
  rejectionReason:rejection_reason,
  reviewedAt:reviewed_at,
  uploadedAt:uploaded_at
`;

export async function listProducerDocuments(producerId) {
  const { data, error } = await supabase
    .from('documents')
    .select(SELECT)
    .eq('producer_id', producerId)
    .order('uploaded_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listAllDocuments() {
  const { data, error } = await supabase
    .from('documents')
    .select(SELECT)
    .order('uploaded_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listPendingDocuments() {
  const { data, error } = await supabase
    .from('documents')
    .select(SELECT)
    .eq('status', 'pending')
    .order('uploaded_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createDocument(payload) {
  const row = {
    producer_id: payload.producerId,
    producer_name: payload.producerName,
    title: payload.title,
    description: payload.description,
    file_name: payload.fileName,
    file_url: payload.fileUrl,
    status: payload.status || 'pending',
  };
  const { data, error } = await supabase
    .from('documents')
    .insert(row)
    .select(SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function approveDocument(docId) {
  const { error } = await supabase.rpc('admin_review_document', {
    p_doc_id: docId,
    p_approve: true,
    p_reason: null,
  });
  if (error) throw error;
}

export async function rejectDocument(docId, _adminId, reason) {
  const { error } = await supabase.rpc('admin_review_document', {
    p_doc_id: docId,
    p_approve: false,
    p_reason: reason || '',
  });
  if (error) throw error;
}
