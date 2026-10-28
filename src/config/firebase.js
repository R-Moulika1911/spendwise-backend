import fs from 'fs';
import admin from 'firebase-admin';

let initialized = false;

export function initFirebase() {
  if (initialized) return admin;

  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (inline) {
    const json = JSON.parse(inline);
    admin.initializeApp({
      credential: admin.credential.cert(json),
    });
  } else if (credPath && fs.existsSync(credPath)) {
    const json = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(json),
    });
  } else {
    throw new Error(
      'Missing Firebase credentials. Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT in .env',
    );
  }

  initialized = true;
  return admin;
}

export function db() {
  return admin.firestore();
}

export { admin };
