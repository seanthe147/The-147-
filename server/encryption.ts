import { createCipheriv, createDecipheriv, randomBytes, createHash, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }
  return createHash("sha256").update(key).digest();
}

export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext;
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return "enc:" + combined.toString("base64");
}

export function decrypt(ciphertext: string): string {
  if (!ciphertext) return ciphertext;
  if (!ciphertext.startsWith("enc:")) {
    return ciphertext;
  }
  const key = getEncryptionKey();
  const combined = Buffer.from(ciphertext.slice(4), "base64");
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

export function isEncrypted(value: string): boolean {
  return value?.startsWith("enc:");
}

export function hashEmail(email: string): string {
  return createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
}

export function hashPin(pin: string, salt?: string): { hash: string; salt: string } {
  const useSalt = salt || randomBytes(SALT_LENGTH).toString("hex");
  const derived = scryptSync(pin, useSalt, 64);
  return { hash: derived.toString("hex"), salt: useSalt };
}

export function verifyPin(pin: string, storedHash: string, salt: string): boolean {
  const { hash } = hashPin(pin, salt);
  if (hash.length !== storedHash.length) return false;
  const bufA = Buffer.from(hash);
  const bufB = Buffer.from(storedHash);
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) {
    diff |= bufA[i] ^ bufB[i];
  }
  return diff === 0;
}
