"use strict";

/**
 * FIXED (2026-09-16): a live incident showed a single Discord API call
 * (guild.roles.create(), then later a channel.send()) just... never
 * settling - not rejecting, not resolving, no retry logged, nothing -
 * which hung whatever called it forever with zero feedback, not even an
 * error (a stuck slash command interaction just sits on "thinking..."
 * until Discord's own ~15-minute webhook token expiry). Wraps any promise
 * in a hard ceiling so a single stuck request can never again block a
 * whole command/provisioning run - it fails loud instead of hanging
 * silently, letting the caller's own error handling (or the caller's
 * per-item try/catch, for a loop) take over from there.
 */
const DEFAULT_TIMEOUT_MS = 15_000;

function withTimeout(promise, label, ms = DEFAULT_TIMEOUT_MS) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${ms / 1000}s: ${label}`)), ms))]);
}

module.exports = { withTimeout, DEFAULT_TIMEOUT_MS };
