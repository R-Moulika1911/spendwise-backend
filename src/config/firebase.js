import fs from 'fs';
import admin from 'firebase-admin';

let initialized = false;

function normalizeServiceAccount(json) {
  if (!json || typeof json !== 'object') {
    throw new Error('Firebase service account must be a JSON object');
  }
  if (typeof json.private_key === 'string') {
    // Render / .env often turn real newlines into "\\n" literals.
    json.private_key = json.private_key.replace(/\\n/g, '\n');
  }
  return json;
}

function loadServiceAccountFromEnv() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();
  if (b64) {
    const decoded = Buffer.from(b64, 'base64').toString('utf8');
    return normalizeServiceAccount(JSON.parse(decoded));
  }

  const inline = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (inline) {
    return normalizeServiceAccount(JSON.parse(inline));
  }

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath && fs.existsSync(credPath)) {
    const json = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    return normalizeServiceAccount(json);
  }

  return null;
}

export function initFirebase() {
  if (initialized) return admin;

  const json = loadServiceAccountFromEnv();
  if (!json) {
    throw new Error(
      'Missing Firebase credentials. Set FIREBASE_SERVICE_ACCOUNT_BASE64 (recommended on Render), FIREBASE_SERVICE_ACCOUNT, or GOOGLE_APPLICATION_CREDENTIALS',
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert(json),
  });

  initialized = true;
  return admin;
}

export function db() {
  return admin.firestore();
}

export { admin };
