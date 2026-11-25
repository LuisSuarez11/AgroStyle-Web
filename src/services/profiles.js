import { supabase } from './supabase';

const SELECT = `
  id,
  fullName:full_name,
  email,
  role,
  status,
  rejectionReason:rejection_reason,
  approvedAt:approved_at,
  rejectedAt:rejected_at,
  createdAt:created_at
`;

export async function listProfiles({ status, excludeRole } = {}) {
  let q = supabase.from('profiles').select(SELECT).order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  if (excludeRole) q = q.neq('role', excludeRole);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function approveProfile(profileId) {
  const { error } = await supabase.rpc('admin_approve_profile', { target_id: profileId });
  if (error) throw error;
}

export async function rejectProfile(profileId, _adminId, reason) {
  const { error } = await supabase.rpc('admin_reject_profile', {
    target_id: profileId,
    reason: reason || '',
  });
  if (error) throw error;
}
