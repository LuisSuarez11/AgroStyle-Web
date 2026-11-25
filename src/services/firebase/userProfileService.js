import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './client';
import {
  APPROVAL_STATUSES,
  ACCOUNT_STATUSES,
  USER_PROFILE_VERSION,
  getInitialAccountStatus,
  getInitialApprovalStatus,
  isPublicRegisterRole,
  normalizeUserProfile,
} from '../../domain/userModel';

function assertFirebaseReady() {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase no esta inicializado.');
  }
}

export function getProfileIncompleteState(user) {
  return {
    uid: user?.uid ?? null,
    email: user?.email ?? null,
    reason: 'PROFILE_INCOMPLETE',
  };
}

export async function getUserProfile(uid) {
  assertFirebaseReady();
  if (!uid) return null;
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return normalizeUserProfile(snap.data());
}

export async function createUserProfile({
  uid,
  email,
  fullName,
  role,
  approvalStatus,
  accountStatus,
}) {
  assertFirebaseReady();
  if (!uid) throw new Error('uid es obligatorio.');
  if (!email) throw new Error('email es obligatorio.');
  if (!fullName || !String(fullName).trim()) throw new Error('fullName es obligatorio.');
  if (!isPublicRegisterRole(role)) throw new Error('Rol no permitido para registro publico.');
  if (!Object.values(APPROVAL_STATUSES).includes(approvalStatus)) {
    throw new Error('approvalStatus invalido.');
  }
  if (!Object.values(ACCOUNT_STATUSES).includes(accountStatus)) {
    throw new Error('accountStatus invalido.');
  }

  const expectedApproval = getInitialApprovalStatus(role);
  const expectedAccount = getInitialAccountStatus();
  if (approvalStatus !== expectedApproval || accountStatus !== expectedAccount) {
    throw new Error('Estado inicial invalido para el rol solicitado.');
  }

  const ref = doc(db, 'users', uid);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    return normalizeUserProfile(existing.data());
  }

  const payload = {
    uid,
    email: String(email).trim().toLowerCase(),
    fullName: String(fullName).trim(),
    role,
    approvalStatus,
    accountStatus,
    profileVersion: USER_PROFILE_VERSION,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(ref, payload);
  const created = await getDoc(ref);
  return normalizeUserProfile(created.data());
}

export async function recoverIncompleteProfile({ user, fullName, role }) {
  assertFirebaseReady();
  if (!user?.uid) throw new Error('Usuario Auth invalido para recuperacion.');
  const existing = await getUserProfile(user.uid);
  if (existing) return { profile: existing, recovered: false };

  const approvalStatus = getInitialApprovalStatus(role);
  const accountStatus = getInitialAccountStatus();
  const profile = await createUserProfile({
    uid: user.uid,
    email: user.email,
    fullName,
    role,
    approvalStatus,
    accountStatus,
  });
  return { profile, recovered: true };
}