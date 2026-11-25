export const USER_ROLES = Object.freeze({
  BUYER: 'buyer',
  PRODUCER: 'producer',
  TRANSPORTER: 'transporter',
  ADMIN: 'admin',
});

export const PUBLIC_REGISTER_ROLES = Object.freeze([
  USER_ROLES.BUYER,
  USER_ROLES.PRODUCER,
  USER_ROLES.TRANSPORTER,
]);

export const APPROVAL_STATUSES = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

export const ACCOUNT_STATUSES = Object.freeze({
  ACTIVE: 'active',
  DISABLED: 'disabled',
});

export const USER_PROFILE_VERSION = 1;

export const USER_PROFILE_CREATE_KEYS = Object.freeze([
  'uid',
  'email',
  'fullName',
  'role',
  'approvalStatus',
  'accountStatus',
  'profileVersion',
  'createdAt',
  'updatedAt',
]);

export const USER_PROFILE_OWNER_EDITABLE_KEYS = Object.freeze([
  'fullName',
  'updatedAt',
]);

export function normalizeRole(role) {
  return Object.values(USER_ROLES).includes(role) ? role : null;
}

export function isPublicRegisterRole(role) {
  return PUBLIC_REGISTER_ROLES.includes(role);
}

export function getInitialApprovalStatus(role) {
  if (role === USER_ROLES.BUYER) return APPROVAL_STATUSES.APPROVED;
  if (role === USER_ROLES.PRODUCER || role === USER_ROLES.TRANSPORTER) {
    return APPROVAL_STATUSES.PENDING;
  }
  return null;
}

export function getInitialAccountStatus() {
  return ACCOUNT_STATUSES.ACTIVE;
}

export function hasEffectiveAccess(profile) {
  return (
    profile?.approvalStatus === APPROVAL_STATUSES.APPROVED &&
    profile?.accountStatus === ACCOUNT_STATUSES.ACTIVE
  );
}

export function normalizeUserProfile(data) {
  if (!data) return null;
  const role = normalizeRole(data.role);
  const approvalStatus = Object.values(APPROVAL_STATUSES).includes(data.approvalStatus)
    ? data.approvalStatus
    : null;
  const accountStatus = Object.values(ACCOUNT_STATUSES).includes(data.accountStatus)
    ? data.accountStatus
    : null;
  return {
    uid: data.uid ?? null,
    email: data.email ?? null,
    fullName: data.fullName ?? '',
    role,
    approvalStatus,
    accountStatus,
    profileVersion: data.profileVersion ?? USER_PROFILE_VERSION,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    rejectionReason: data.rejectionReason ?? null,
  };
}