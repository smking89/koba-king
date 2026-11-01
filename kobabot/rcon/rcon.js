"use strict";

const WebSocket = require("ws");

/**
 * Thin WebRCON client for Rust Console Edition.
 * Rust's WebRCON multiplexes all request/response traffic over one socket,
 * matched by an integer `Identifier` - so every call gets a unique id and
 * we resolve the matching pending promise when a response with that id
 * comes back. Broadcast messages from the server (chat, kills, etc.) arrive
 * with Identifier 0 / -1 and are routed to `onBroadcast` listeners instead.
 */
class RconClient {
  constructor({ host, port, password }) {
    this.host = host;
    this.port = port;
    this.password = password;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map(); // id -> { resolve, reject, timeout }
    this.broadcastListeners = [];
    this.connected = false;
  }

  /**
   * @param {number} timeoutMs how long to wait for "open"/"error" before
   * giving up - a wrong host/port/firewall drop doesn't always fire a fast
   * "error" event (some just never respond at all), so without this a bad
   * /add-server set or a dead RCON connection hangs the caller forever
   * with no error and no timeout of its own to fall back on. Confirmed
   * (2026-09-04): this was exactly why /add-server set could sit on
   * Discord's "thinking..." spinner indefinitely with nothing logged.
   */
  connect(timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const url = `ws://${this.host}:${this.port}/${this.password}`;
      this.ws = new WebSocket(url);

      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.ws.terminate();
        reject(new Error(`RCON connection timed out after ${timeoutMs}ms - check the host/port and that the server is reachable`));
      }, timeoutMs);

      this.ws.once("open", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.connected = true;
        resolve();
      });

      this.ws.once("error", (err) => {
        if (settled) {
          // Already resolved/rejected (e.g. our own timeout fired first) -
          // still need a listener here so this event doesn't crash the
          // process as an unhandled 'error' on the EventEmitter.
          return;
        }
        settled = true;
        clearTimeout(timeout);
        this.connected = false;
        reject(err);
      });

      this.ws.on("close", () => {
        this.connected = false;
        // Reject anything still waiting so callers don't hang forever.
        for (const [, entry] of this.pending) {
          clearTimeout(entry.timeout);
          entry.reject(new Error("RCON connection closed"));
        }
        this.pending.clear();
      });

      this.ws.on("message", (raw) => this._handleMessage(raw));
    });
  }

  _handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return; // ignore malformed frames
    }

    const id = msg.Identifier;
    if (id && this.pending.has(id)) {
      const entry = this.pending.get(id);
      clearTimeout(entry.timeout);
      this.pending.delete(id);
      entry.resolve(msg.Message);
      return;
    }

    // Unmatched / broadcast traffic (chat, kill feed, etc.)
    for (const listener of this.broadcastListeners) listener(msg);
  }

  onBroadcast(fn) {
    this.broadcastListeners.push(fn);
  }

  /**
   * Send a raw RCON command and resolve with the raw string response.
   * @param {string} command
   * @param {number} timeoutMs
   */
  send(command, timeoutMs = 10000) {
    if (!this.connected) return Promise.reject(new Error("RCON not connected"));

    const id = this.nextId++;
    const payload = JSON.stringify({ Identifier: id, Message: command, Name: "WebRcon" });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RCON command timed out: ${command}`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timeout });
      this.ws.send(payload);
    });
  }

  /** Convenience wrapper for commands that return JSON payloads (e.g. --json variants). */
  async sendJson(command, timeoutMs = 10000) {
    const raw = await this.send(command, timeoutMs);
    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new Error(`Expected JSON from "${command}" but got: ${raw}`);
    }
  }

  /**
   * In-game chat broadcast. RCE can't render emoji - unsupported unicode
   * falls back to a garbled glyph in-game (CONFIRMED 2026-09-07: reported as
   * "shows stars"). Discord embeds are a separate rendering path and keep
   * their emoji fine - Discord-bound text built elsewhere never goes through
   * this method, only what's actually broadcast in-game does. Stripped here
   * rather than at each call site/template so it's impossible for a future
   * admin-typed custom message (lootbox claim, ad, etc.) to reintroduce the
   * same bug.
   */
  say(message) {
    const sanitized = message
      .replace(/\p{Extended_Pictographic}(?:\uFE0F)?|\uFE0F|\u200D/gu, "")
      .replace(/ {2,}/g, " ")
      .trim();
    return this.send(`global.say "${sanitized.replace(/"/g, "'")}"`);
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

/** Small delay helper used between looped RCON calls (rcon_wipe_delay, etc.). */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { RconClient, sleep };
