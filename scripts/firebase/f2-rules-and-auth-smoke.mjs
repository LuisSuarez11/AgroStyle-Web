import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-agrostyle';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;

const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`${status} ${name}${detail ? ` - ${detail}` : ''}`);
}

async function expectSucceeds(name, promise) {
  try {
    await assertSucceeds(promise);
    record(name, true);
  } catch (error) {
    record(name, false, error.message);
  }
}

async function expectFails(name, promise) {
  try {
    await assertFails(promise);
    record(name, true);
  } catch (error) {
    record(name, false, error.message);
  }
}

function baseProfile({ uid, email, fullName, role, approvalStatus, accountStatus }) {
  return {
    uid,
    email,
    fullName,
    role,
    approvalStatus,
    accountStatus,
    profileVersion: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

async function main() {
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: FIRESTORE_HOST,
      port: FIRESTORE_PORT,
      rules,
    },
  });

  try {
    await testEnv.clearFirestore();

    // Contextos autenticados
    const buyerCtx = testEnv.authenticatedContext('buyer_uid', { email: 'buyer@test.local' });
    const producerCtx = testEnv.authenticatedContext('producer_uid', { email: 'producer@test.local' });
    const transporterCtx = testEnv.authenticatedContext('transporter_uid', { email: 'transporter@test.local' });
    const otherCtx = testEnv.authenticatedContext('other_uid', { email: 'other@test.local' });

    const buyerDb = buyerCtx.firestore();
    const producerDb = producerCtx.firestore();
    const transporterDb = transporterCtx.firestore();
    const otherDb = otherCtx.firestore();

    // Positivas: creacion valida
    await expectSucceeds('create buyer valido', setDoc(doc(buyerDb, 'users/buyer_uid'), baseProfile({
      uid: 'buyer_uid', email: 'buyer@test.local', fullName: 'Buyer Test', role: 'buyer', approvalStatus: 'approved', accountStatus: 'active',
    })));

    await expectSucceeds('create producer valido pending', setDoc(doc(producerDb, 'users/producer_uid'), baseProfile({
      uid: 'producer_uid', email: 'producer@test.local', fullName: 'Producer Test', role: 'producer', approvalStatus: 'pending', accountStatus: 'active',
    })));

    await expectSucceeds('create transporter valido pending', setDoc(doc(transporterDb, 'users/transporter_uid'), baseProfile({
      uid: 'transporter_uid', email: 'transporter@test.local', fullName: 'Transporter Test', role: 'transporter', approvalStatus: 'pending', accountStatus: 'active',
    })));

    await expectSucceeds('owner puede leer su perfil', getDoc(doc(buyerDb, 'users/buyer_uid')));

    // Negativas: campos adicionales / no autorizados
    await expectFails('rechaza campo extra no autorizado en create', setDoc(doc(otherDb, 'users/other_uid'), {
      ...baseProfile({ uid: 'other_uid', email: 'other@test.local', fullName: 'Other', role: 'buyer', approvalStatus: 'approved', accountStatus: 'active' }),
      isAdmin: true,
    }));

    await expectFails('rechaza campo admin approvedBy en create', setDoc(doc(testEnv.authenticatedContext('u2', { email: 'u2@test.local' }).firestore(), 'users/u2'), {
      ...baseProfile({ uid: 'u2', email: 'u2@test.local', fullName: 'U2', role: 'buyer', approvalStatus: 'approved', accountStatus: 'active' }),
      approvedBy: 'admin',
    }));

    // Negativas: admin/roles/estados
    await expectFails('rechaza create con role admin', setDoc(doc(testEnv.authenticatedContext('u3', { email: 'u3@test.local' }).firestore(), 'users/u3'), baseProfile({
      uid: 'u3', email: 'u3@test.local', fullName: 'U3', role: 'admin', approvalStatus: 'approved', accountStatus: 'active',
    })));

    await expectFails('rechaza producer autoaprobado', setDoc(doc(testEnv.authenticatedContext('u4', { email: 'u4@test.local' }).firestore(), 'users/u4'), baseProfile({
      uid: 'u4', email: 'u4@test.local', fullName: 'U4', role: 'producer', approvalStatus: 'approved', accountStatus: 'active',
    })));

    await expectFails('rechaza buyer pending', setDoc(doc(testEnv.authenticatedContext('u5', { email: 'u5@test.local' }).firestore(), 'users/u5'), baseProfile({
      uid: 'u5', email: 'u5@test.local', fullName: 'U5', role: 'buyer', approvalStatus: 'pending', accountStatus: 'active',
    })));

    await expectFails('rechaza transporter con accountStatus disabled en create', setDoc(doc(testEnv.authenticatedContext('u6', { email: 'u6@test.local' }).firestore(), 'users/u6'), baseProfile({
      uid: 'u6', email: 'u6@test.local', fullName: 'U6', role: 'transporter', approvalStatus: 'pending', accountStatus: 'disabled',
    })));

    // Negativa: email no coincide con token
    await expectFails('rechaza email distinto al token', setDoc(doc(testEnv.authenticatedContext('u7', { email: 'real@test.local' }).firestore(), 'users/u7'), baseProfile({
      uid: 'u7', email: 'otro@test.local', fullName: 'U7', role: 'buyer', approvalStatus: 'approved', accountStatus: 'active',
    })));

    // Negativa: crear doc de otro usuario
    await expectFails('rechaza crear perfil de otro uid', setDoc(doc(buyerDb, 'users/otro_uid'), baseProfile({
      uid: 'otro_uid', email: 'buyer@test.local', fullName: 'Otro', role: 'buyer', approvalStatus: 'approved', accountStatus: 'active',
    })));

    // Negativa: leer/escribir doc de otro usuario
    await expectFails('rechaza leer perfil ajeno', getDoc(doc(otherDb, 'users/buyer_uid')));
    await expectFails('rechaza escribir perfil ajeno', updateDoc(doc(otherDb, 'users/buyer_uid'), { fullName: 'Hack' }));

    // Positiva: owner puede editar campo personal permitido
    await expectSucceeds('owner puede actualizar fullName', updateDoc(doc(buyerDb, 'users/buyer_uid'), {
      fullName: 'Buyer Updated',
      updatedAt: serverTimestamp(),
    }));

    // Negativas: cambios de rol/approval/accountStatus/protegidos
    await expectFails('rechaza cambio de role', updateDoc(doc(buyerDb, 'users/buyer_uid'), { role: 'admin' }));
    await expectFails('rechaza cambio de approvalStatus', updateDoc(doc(producerDb, 'users/producer_uid'), { approvalStatus: 'approved' }));
    await expectFails('rechaza cambio de accountStatus', updateDoc(doc(buyerDb, 'users/buyer_uid'), { accountStatus: 'disabled' }));
    await expectFails('rechaza cambio de uid', updateDoc(doc(buyerDb, 'users/buyer_uid'), { uid: 'otro' }));
    await expectFails('rechaza cambio de email', updateDoc(doc(buyerDb, 'users/buyer_uid'), { email: 'nuevo@test.local' }));
    await expectFails('rechaza cambio de profileVersion', updateDoc(doc(buyerDb, 'users/buyer_uid'), { profileVersion: 99 }));
    await expectFails('rechaza agregar campo protegido approvedBy', setDoc(doc(buyerDb, 'users/buyer_uid'), {
      uid: 'buyer_uid', email: 'buyer@test.local', fullName: 'Buyer Updated', role: 'buyer', approvalStatus: 'approved', accountStatus: 'active', profileVersion: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), approvedBy: 'x',
    }, { merge: true }));
    await expectFails('rechaza eliminar/modificar via set con campo faltante protegido', setDoc(doc(buyerDb, 'users/buyer_uid'), {
      uid: 'buyer_uid', email: 'buyer@test.local', fullName: 'Buyer Updated', role: 'buyer', approvalStatus: 'approved', accountStatus: 'active', profileVersion: 1, updatedAt: serverTimestamp(),
    }));
    await expectFails('rechaza delete de documento propio', deleteDoc(doc(buyerDb, 'users/buyer_uid')));
    await expectFails('rechaza delete de documento ajeno', deleteDoc(doc(otherDb, 'users/buyer_uid')));

    // Negativa: coleccion no contemplada
    await expectFails('rechaza escritura en coleccion no contemplada', setDoc(doc(buyerDb, 'orders/order1'), { ok: true }));
    await expectFails('rechaza lectura en coleccion no contemplada', getDoc(doc(buyerDb, 'orders/order1')));

  } finally {
    await testEnv.cleanup();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nRESULTADO: ${results.length - failed.length}/${results.length} PASS`);
  if (failed.length) {
    console.log('FALLAS:');
    for (const f of failed) console.log(`- ${f.name}: ${f.detail}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});