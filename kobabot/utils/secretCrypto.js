"use strict";

/**
 * AES-256-GCM helpers for storing a standalone directory listing's WebRCON
 * password at rest (see database/schema.sql's directory_servers.
 * rcon_password_encrypted) - these listings have zero other connection to
 * KOBA Bot (no Discord guild, no license), so their RCON password is a raw
 * secret submitted straight from a public web form and genuinely needs
 * encryption, unlike every other RCON credential in this codebase (those
 * are all guild-owner-entered via a Discord slash command already gated
 * behind requirePremiumOwner, a materially different trust boundary).
 *
 * Requires RCON_ENCRYPTION_KEY in .env - any passphrase works, it's hashed
 * into a real 32-byte AES key below rather than needing to be exactly 32
 * bytes itself.
 */

const crypto = require("crypto");

function getKey() {
  const raw = process.env.RCON_ENCRYPTION_KEY;
  if (!raw) throw new Error("RCON_ENCRYPTION_KEY is missing from .env - required to store/read standalone directory listings' WebRCON passwords.");
  return crypto.createHash("sha256").update(raw).digest();
}

function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

function decryptSecret(encoded) {
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

module.exports = { encryptSecret, decryptSecret };
