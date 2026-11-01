import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clanTier,
  ingest,
  nextCapacity,
  routeCommand,
  signPacket,
  UNLINKED_STEAM,
  type Identity,
  type PlatformData,
  type RawPacket,
} from "./engine.ts";

const NOW = 1_800_000_000_000;

function identity(partial: Pick<Identity, "id" | "name" | "handle" | "steamId"> & Partial<Identity>): Identity {
  return {
    region: "NA",
    score: 1840,
    form: "steady",
    scoreDelta: 0,
    badges: [],
    coins: 240,
    claimed: false,
    warnings: 0,
    strikes: 0,
    status: "clear",
    homes: [],
    rivals: [],
    ...partial,
  };
}

/** Minimal platform fixture: two real-shaped identities and one licensed server. */
function fixture(): PlatformData {
  return {
    identities: [
      identity({ id: "koba_alpha", name: "Alpha", handle: "alpha", steamId: "76561198000001840" }),
      identity({ id: "koba_beta", name: "Beta", handle: "beta", steamId: "76561198000002144" }),
    ],
    clans: [],
    servers: [
      {
        id: "srv-test",
        name: "Test Server",
        game: "RUST_CONSOLE",
        guildId: "guild-test",
        license: "active",
        hostKey: "hk_test",
        pluginKey: "vk_test",
      },
    ],
    events: [],
    provisional: [],
    attempts: [],
    feed: [],
    audit: [],
    blacklist: [],
    viewerId: "koba_alpha",
    seq: 10,
  };
}

async function combat(partial: Partial<Omit<RawPacket, "plugin_signature" | "hostKey">> = {}, forge = false) {
  const data = fixture();
  const server = data.servers[0]!;
  const body = {
    serverId: server.id,
    kind: "combat" as const,
    at: NOW,
    attackerSteam: "76561198000001840",
    attackerName: "Alpha",
    victimSteam: "76561198000002144",
    victimName: "Beta",
    weapon: "rifle.ak",
    distance: 40,
    hitZone: "head",
    pve: false,
    ...partial,
  };
  const plugin_signature = forge ? "deadbeef" : await signPacket(server.pluginKey, body);
  return ingest(data, { ...body, hostKey: server.hostKey, plugin_signature }, NOW);
}

describe("koba core", () => {
  it("commits a signed combat packet and drops a forgery", async () => {
    const good = await combat();
    assert.equal(good.result.disposition, "commit");
    assert.equal(good.result.gates.every((gate) => gate.pass), true);
    const bad = await combat({}, true);
    assert.equal(bad.result.disposition, "drop");
    assert.equal(bad.result.gates.find((gate) => gate.gate === "signature")?.pass, false);
    assert.equal(bad.data.events.length, 0);
  });

  it("holds an unlinked steam id, then back-dates it on /link", async () => {
    const held = await combat({ attackerSteam: UNLINKED_STEAM, attackerName: "Unlinked rifle" });
    assert.equal(held.result.disposition, "provisional");
    const linked = routeCommand(held.data, `/link steam ${UNLINKED_STEAM}`, "player", false, "RUST_CONSOLE", NOW);
    assert.equal(linked.data.provisional.length, 0);
    assert.equal(linked.data.events.length, 1);
    assert.match(linked.embed.description, /76561198999900001/);
  });

  it("rate-limits the ninth packet inside ten seconds", async () => {
    let data = fixture();
    const server = data.servers[0]!;
    let last = "commit";
    for (let i = 0; i < 9; i++) {
      const body = {
        serverId: server.id,
        kind: "combat" as const,
        at: NOW + i,
        attackerSteam: "76561198000001840",
        attackerName: "Alpha",
        victimSteam: "76561198000002144",
        victimName: "Beta",
        weapon: "rifle.ak",
        distance: 20,
        hitZone: "chest",
        pve: false,
      };
      const packet = { ...body, hostKey: server.hostKey, plugin_signature: await signPacket(server.pluginKey, body) };
      const ingested = await ingest(data, packet, NOW + i);
      data = ingested.data;
      last = ingested.result.disposition;
    }
    assert.equal(last, "drop");
    assert.equal(data.events.length, 8);
  });

  it("rejects a raid that is not a cupboard or external wall", async () => {
    const data = fixture();
    const server = data.servers[0]!;
    const body = {
      serverId: server.id,
      kind: "raid" as const,
      at: NOW,
      attackerSteam: "76561198000001840",
      attackerName: "Alpha",
      entity: "foundation",
      damage: 20,
      weapon: "explosive.timed",
    };
    const packet = { ...body, hostKey: server.hostKey, plugin_signature: await signPacket(server.pluginKey, body) };
    const result = await ingest(data, packet, NOW);
    assert.equal(result.result.disposition, "drop");
    assert.match(result.result.gates.find((gate) => gate.gate === "sanity")!.note, /cupboard/);
  });

  it("shape-shifts /shop and locks the third strike", () => {
    const rust = routeCommand(fixture(), "/shop", "player", false, "RUST_CONSOLE", NOW);
    const dayz = routeCommand(fixture(), "/shop", "player", false, "DAYZ", NOW);
    assert.equal(rust.embed.color, "green");
    assert.match(rust.embed.fields[0]!.name, /kit/i);
    assert.equal(dayz.embed.color, "cyan");
    assert.match(dayz.embed.description, /Medical/);

    let data = fixture();
    for (let i = 0; i < 3; i++) {
      const result = routeCommand(data, "/mod strike beta", "admin", false, "RUST_CONSOLE", NOW);
      data = result.data;
    }
    const beta = data.identities.find((row) => row.handle === "beta")!;
    assert.equal(beta.strikes, 3);
    assert.equal(beta.status, "under_review");
    const player = routeCommand(fixture(), "/mod strike beta", "player", false, "RUST_CONSOLE", NOW);
    assert.match(player.embed.title, /Staff only/);
  });

  it("refuses /nuke until confirm, and keeps the audit", () => {
    const preview = routeCommand(fixture(), "/nuke", "owner", false, "RUST_CONSOLE", NOW);
    assert.equal(preview.data.identities.find((row) => row.handle === "alpha")!.coins, 240);
    const done = routeCommand(fixture(), "/nuke confirm", "owner", false, "RUST_CONSOLE", NOW);
    assert.equal(done.data.identities.find((row) => row.handle === "alpha")!.coins, 0);
    assert.ok(done.data.audit.some((row) => row.action === "nuke"));
    assert.equal(done.data.audit.some((row) => row.action === "seed"), false);
  });

  it("hysteresis-protects capacity", () => {
    assert.equal(nextCapacity(44, "nominal"), "strained");
    assert.equal(nextCapacity(50, "strained"), "strained");
    assert.equal(nextCapacity(56, "strained"), "nominal");
    assert.equal(nextCapacity(24, "strained"), "critical");
    assert.equal(nextCapacity(30, "critical"), "critical");
    assert.equal(nextCapacity(36, "critical"), "strained");
    assert.equal(clanTier(3), "SQUAD");
    assert.equal(clanTier(9), "ZERG");
  });
});
