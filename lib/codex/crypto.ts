import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for the subscription tokens at rest. The key is CODEX_TOKEN_KEY,
// 32 bytes as base64 (or 64 hex chars). Ciphertext format, one string per
// column: "v1.<iv>.<tag>.<data>", each segment base64url.
//
// Pure (no server-only import) so the import script and the tests can use it;
// it never sees a key unless the caller passes one.

const VERSION = "v1";
const IV_BYTES = 12;

/** Parses CODEX_TOKEN_KEY. Throws with the variable name when it is not 32 bytes. */
export function parseTokenKey(raw: string | undefined): Buffer {
  if (!raw) throw new Error("Missing environment variable CODEX_TOKEN_KEY");
  const value = raw.trim();
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error("CODEX_TOKEN_KEY must be 32 bytes (base64 or 64 hex characters)");
  }
  return key;
}

export function encryptToken(plain: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(".");
}

/** @throws when the payload was not written by encryptToken with this key (tampered or wrong key). */
export function decryptToken(payload: string, key: Buffer): string {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== VERSION || !iv || !tag || data === undefined) {
    throw new Error("Unreadable encrypted token");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
