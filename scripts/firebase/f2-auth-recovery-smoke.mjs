import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  USER_PROFILE_OWNER_EDITABLE_KEYS,
  getInitialAccountStatus,
  getInitialApprovalStatus,
  isPublicRegisterRole,
  normalizeRole,
} from '../../src/domain/userModel.js';

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
}

function buildProfile({ uid, email, fullName, role }) {
  const normalizedRole = normalizeRole(role);
  return {
    uid,
    email,
    fullName: String(fullName || '').trim(),
    role: normalizedRole,
    approvalStatus: getInitialApprovalStatus(normalizedRole),
    accountStatus: getInitialAccountStatus(),
    profileVersion: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

async function main() {
  const app = initializeApp({ apiKey: 'demo-api-key', projectId: 'demo-agrostyle', appId: 'demo-app-id' }, 'f2-smoke');
  const auth = getAuth(app);
  const db = getFirestore(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);

  try {
    // Registro buyer simulado como flujo auth+perfil
    const buyerEmail = `buyer-flow-${Date.now()}@test.local`;
    const buyerCred = await createUserWithEmailAndPassword(auth, buyerEmail, 'Test1234!');
    const buyerProfile = buildProfile({ uid: buyerCred.user.uid, email: buyerEmail, fullName: 'Buyer Flow', role: 'buyer' });
    await setDoc(doc(db, 'users', buyerCred.user.uid), buyerProfile);
    const buyerSnap = await getDoc(doc(db, 'users', buyerCred.user.uid));
    record('flujo buyer crea auth+perfil', buyerSnap.exists() && buyerSnap.data().role === 'buyer' && buyerSnap.data().approvalStatus === 'approved', `role=${buyerSnap.data()?.role}`);

    // Registro producer pending
    await signOut(auth);
    const producerEmail = `producer-flow-${Date.now()}@test.local`;
    const producerCred = await createUserWithEmailAndPassword(auth, producerEmail, 'Test1234!');
    const producerProfile = buildProfile({ uid: producerCred.user.uid, email: producerEmail, fullName: 'Producer Flow', role: 'producer' });
    await setDoc(doc(db, 'users', producerCred.user.uid), producerProfile);
    const producerSnap = await getDoc(doc(db, 'users', producerCred.user.uid));
    record('flujo producer crea perfil pending', producerSnap.exists() && producerSnap.data().approvalStatus === 'pending', `approval=${producerSnap.data()?.approvalStatus}`);

    // Servicio/regla de negocio: admin no es rol público
    record('dominio rechaza registro publico admin', isPublicRegisterRole('admin') === false);
    record('dominio acepta roles publicos', isPublicRegisterRole('buyer') && isPublicRegisterRole('producer') && isPublicRegisterRole('transporter'));

    // Recovery: usuario Auth sin perfil
    await signOut(auth);
    const orphanEmail = `orphan-${Date.now()}@test.local`;
    const orphanCred = await createUserWithEmailAndPassword(auth, orphanEmail, 'Test1234!');
    const before = await getDoc(doc(db, 'users', orphanCred.user.uid));
    const recovered = buildProfile({ uid: orphanCred.user.uid, email: orphanEmail, fullName: 'Orphan User', role: 'transporter' });
    await setDoc(doc(db, 'users', orphanCred.user.uid), recovered);
    const after = await getDoc(doc(db, 'users', orphanCred.user.uid));
    record('recovery crea perfil faltante', !before.exists() && after.exists() && after.data().role === 'transporter' && after.data().approvalStatus === 'pending', `role=${after.data()?.role}`);

    // Login con perfil existente
    await signOut(auth);
    await signInWithEmailAndPassword(auth, buyerEmail, 'Test1234!');
    const loggedSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
    record('login lee perfil propio', loggedSnap.exists() && loggedSnap.id === auth.currentUser.uid);

    // Modelo limita campos owner-editables
    record('owner editable whitelist solo fullName+updatedAt', USER_PROFILE_OWNER_EDITABLE_KEYS.length === 2 && USER_PROFILE_OWNER_EDITABLE_KEYS.includes('fullName') && USER_PROFILE_OWNER_EDITABLE_KEYS.includes('updatedAt'));

  } finally {
    await deleteApp(app);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nRESULTADO: ${results.length - failed.length}/${results.length} PASS`);
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });