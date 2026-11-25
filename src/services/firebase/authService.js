import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth, isFirebaseConfigured, isUsingFirebaseEmulators } from './client';
import {
  getInitialAccountStatus,
  getInitialApprovalStatus,
  isPublicRegisterRole,
  normalizeRole,
} from '../../domain/userModel';
import {
  createUserProfile,
  getUserProfile,
  getProfileIncompleteState,
} from './userProfileService';

function assertFirebaseReady() {
  if (!isFirebaseConfigured()) {
    throw new Error(
      'Firebase no esta inicializado. Configura VITE_FIREBASE_TARGET y las variables VITE_FIREBASE_* requeridas.'
    );
  }
}

export function subscribeFirebaseAuth(callback) {
  assertFirebaseReady();
  return onAuthStateChanged(auth, callback);
}

export async function registerFirebaseUser({ email, password, fullName, role }) {
  assertFirebaseReady();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(fullName || '').trim();
  const normalizedRole = normalizeRole(role);

  if (!cleanName) throw new Error('El nombre completo es obligatorio.');
  if (!cleanEmail) throw new Error('El correo electronico es obligatorio.');
  if (!password || String(password).length < 6) {
    throw new Error('La contrasena debe tener al menos 6 caracteres.');
  }
  if (!isPublicRegisterRole(normalizedRole)) {
    throw new Error('Rol no permitido para registro publico.');
  }

  const approvalStatus = getInitialApprovalStatus(normalizedRole);
  const accountStatus = getInitialAccountStatus();
  if (!approvalStatus || !accountStatus) {
    throw new Error('No se pudo determinar el estado inicial del perfil.');
  }

  let credential = null;
  try {
    credential = await createUserWithEmailAndPassword(auth, cleanEmail, String(password));
    await createUserProfile({
      uid: credential.user.uid,
      email: cleanEmail,
      fullName: cleanName,
      role: normalizedRole,
      approvalStatus,
      accountStatus,
    });
    const profile = await getUserProfile(credential.user.uid);
    return { user: credential.user, profile, recoveryRequired: false };
  } catch (error) {
    if (credential?.user) {
      try {
        const profile = await getUserProfile(credential.user.uid);
        if (!profile) {
          // Intento de rollback para evitar cuenta Auth huerfana en flujo de registro.
          await deleteUser(credential.user);
        }
      } catch (cleanupError) {
        console.error('[Firebase Auth] No se pudo limpiar usuario huerfano tras fallo de perfil.', cleanupError);
        return {
          user: credential.user,
          profile: null,
          recoveryRequired: true,
          recovery: getProfileIncompleteState(credential.user),
          originalError: error,
        };
      }
    }
    throw error;
  }
}

export async function loginFirebaseUser({ email, password }) {
  assertFirebaseReady();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPassword = String(password || '');
  if (!cleanEmail || !cleanPassword) {
    throw new Error('Correo y contrasena son obligatorios.');
  }
  const credential = await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
  const profile = await getUserProfile(credential.user.uid);
  return {
    user: credential.user,
    profile,
    recoveryRequired: !profile,
    recovery: profile ? null : getProfileIncompleteState(credential.user),
  };
}

export async function logoutFirebaseUser() {
  assertFirebaseReady();
  await signOut(auth);
}

export function getFirebaseAuthDiagnostics() {
  return {
    configured: isFirebaseConfigured(),
    usingEmulators: isUsingFirebaseEmulators(),
    projectId: auth?.app?.options?.projectId ?? null,
  };
}