import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} belum dikonfigurasi di environment variables.`);
  }
  return value;
}

export function getAdminApp() {
  const existingApp = getApps()[0];
  if (existingApp) {
    return existingApp;
  }

  return initializeApp({
    credential: cert({
      projectId: getRequiredEnv("FIREBASE_ADMIN_PROJECT_ID"),
      clientEmail: getRequiredEnv("FIREBASE_ADMIN_CLIENT_EMAIL"),
      privateKey: getRequiredEnv("FIREBASE_ADMIN_PRIVATE_KEY").replace(
        /\\n/g,
        "\n"
      ),
    }),
  });
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}

export { FieldValue };
