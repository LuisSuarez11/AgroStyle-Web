import process from 'node:process';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const REQUIRED_PROJECT_ID = 'demo-agrostyle';

function isLocalHost(value) {
  if (!value) return false;
  const host = String(value).trim().toLowerCase();
  return (
    host.startsWith('127.0.0.1:') ||
    host.startsWith('localhost:') ||
    host.startsWith('[::1]:') ||
    host === '127.0.0.1' ||
    host === 'localhost' ||
    host === '::1'
  );
}

function fail(message) {
  console.error(`[seed-admin] BLOQUEADO: ${message}`);
  process.exit(1);
}

function validateEnvironment() {
  const authEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const firestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST;
  const projectId =
    process.env.GCLOUD_PROJECT ||
    process.env.FIREBASE_PROJECT ||
    process.env.FIREBASE_PROJECT_ID ||
    '';

  if (!isLocalHost(authEmulator)) {
    fail('FIREBASE_AUTH_EMULATOR_HOST debe apuntar a un emulador local (127.0.0.1/localhost/[::1]).');
  }
  if (!isLocalHost(firestoreEmulator)) {
    fail('FIRESTORE_EMULATOR_HOST debe apuntar a un emulador local (127.0.0.1/localhost/[::1]).');
  }
  if (projectId !== REQUIRED_PROJECT_ID) {
    fail(`projectId debe ser exactamente "${REQUIRED_PROJECT_ID}". Valor actual: "${projectId || '(vacio)'}".`);
  }

  const blockedEnvVars = [
    'GOOGLE_APPLICATION_CREDENTIALS',
    'FIREBASE_SERVICE_ACCOUNT',
    'FIREBASE_SERVICE_ACCOUNT_KEY',
    'GOOGLE_CLOUD_PROJECT',
  ];
  for (const name of blockedEnvVars) {
    if (process.env[name]) {
      fail(`Variable ${name} detectada. No se permiten credenciales/config de cloud en seed de emulador.`);
    }
  }

  if (process.env.FIRESTORE_EMULATOR_HOST && !isLocalHost(process.env.FIRESTORE_EMULATOR_HOST)) {
    fail('FIRESTORE_EMULATOR_HOST no es local.');
  }
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST && !isLocalHost(process.env.FIREBASE_AUTH_EMULATOR_HOST)) {
    fail('FIREBASE_AUTH_EMULATOR_HOST no es local.');
  }

  return { authEmulator, firestoreEmulator, projectId };
}

async function main() {
  const { projectId } = validateEnvironment();

  // Seguridad: inicializar Admin SDK solo con projectId demo, sin credenciales.
  const app = getApps().length
    ? getApps()[0]
    : initializeApp({ projectId });

  // Guardia adicional: nunca usar cert/applicationDefault en este script.
  void cert;
  void applicationDefault;

  const email = process.env.SEED_ADMIN_EMAIL || 'admin.emulator@agrostyle.test';
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin123!';
  const fullName = process.env.SEED_ADMIN_NAME || 'Administrador Emulador';

  const auth = getAuth(app);
  const db = getFirestore(app);

  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(email);
    console.log(`[seed-admin] Usuario admin ya existe en Auth Emulator: ${userRecord.uid}`);
  } catch {
    userRecord = await auth.createUser({
      email,
      password,
      displayName: fullName,
      emailVerified: true,
    });
    console.log(`[seed-admin] Usuario admin creado en Auth Emulator: ${userRecord.uid}`);
  }

  await db.doc(`users/${userRecord.uid}`).set({
    uid: userRecord.uid,
    email,
    fullName,
    role: 'admin',
    approvalStatus: 'approved',
    accountStatus: 'active',
    profileVersion: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: false });

  console.log(`[seed-admin] Perfil admin creado/actualizado en Firestore Emulator: users/${userRecord.uid}`);
  console.log('[seed-admin] Completado solo en emuladores locales.');
}

main().catch((error) => {
  console.error('[seed-admin] Error:', error);
  process.exit(1);
});