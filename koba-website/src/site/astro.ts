export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "relic";

export const RARITY_TIERS: {
  id: Rarity;
  label: string;
  quality: [number, number];
  coins: [number, number];
  bundle: boolean;
}[] = [
  { id: "common", label: "Common", quality: [1, 20], coins: [1, 19], bundle: false },
  { id: "uncommon", label: "Uncommon", quality: [21, 40], coins: [20, 34], bundle: false },
  { id: "rare", label: "Rare", quality: [41, 60], coins: [35, 69], bundle: false },
  { id: "epic", label: "Epic", quality: [61, 80], coins: [70, 119], bundle: false },
  { id: "legendary", label: "Legendary", quality: [81, 95], coins: [120, 199], bundle: false },
  { id: "relic", label: "Relic", quality: [96, 100], coins: [200, 500], bundle: true },
];

export function rarityTier(id: Rarity) {
  return RARITY_TIERS.find((tier) => tier.id === id) ?? RARITY_TIERS[0];
}

export type ShopGame = "Rust Console" | "DayZ" | "Network";

export type AstroKind =
  | "avatar-frame"
  | "profile-effect"
  | "nameplate"
  | "animated-avatar"
  | "profile-banner"
  | "profile-theme"
  | "client-theme"
  | "home-icon"
  | "server-look"
  | "entrance-sound"
  | "burst-reaction"
  | "call-background"
  | "sticker-pack";

export type AstroGroup = "decoration" | "profile" | "chat";

export type UploadMedia = "image" | "audio" | "video" | "visual";

export interface UploadSlot {
  id: string;
  label: string;
  accept: string;
  types: string[];
  media: UploadMedia;
  minWidth: number | null;
  maxWidth: number | null;
  minHeight: number | null;
  maxHeight: number | null;
  minBytes: number;
  maxBytes: number;
  minSeconds: number | null;
  maxSeconds: number | null;
  square: boolean;
  aspect: number | null;
}

export interface AstroSpec {
  id: AstroKind;
  group: AstroGroup;
  groupLabel: string;
  name: string;
  where: string;
  width: number | null;
  height: number | null;
  canvas: string;
  formats: string;
  limit: string;
  make: string;
  avoid: string;
  minCount: number;
  maxCount: number;
  slots: UploadSlot[];
}

export interface MeasuredFile {
  name: string;
  bytes: number;
  width: number | null;
  height: number | null;
  seconds: number | null;
  type: string;
}

const KB = 1024;
const MB = 1024 * 1024;

const TYPE_LABEL: Record<string, string> = {
  "image/png": "PNG",
  "image/gif": "GIF",
  "image/jpeg": "JPG",
  "video/webm": "WebM",
  "video/mp4": "MP4",
  "audio/mpeg": "MP3",
  "audio/ogg": "OGG",
};

const TYPE_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/gif": ".gif",
  "image/jpeg": ".jpg,.jpeg",
  "video/webm": ".webm",
  "video/mp4": ".mp4",
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
};

function acceptFor(types: string[]): string {
  const extras = types.flatMap((type) => (TYPE_EXT[type] ?? "").split(",").filter(Boolean));
  return [...types, ...extras].join(",");
}

function slot(input: {
  id: string;
  label: string;
  types: string[];
  media?: UploadMedia;
  minWidth?: number | null;
  maxWidth?: number | null;
  minHeight?: number | null;
  maxHeight?: number | null;
  minBytes: number;
  maxBytes: number;
  minSeconds?: number | null;
  maxSeconds?: number | null;
  square?: boolean;
  aspect?: number | null;
}): UploadSlot {
  const square = input.square ?? false;
  return {
    id: input.id,
    label: input.label,
    accept: acceptFor(input.types),
    types: input.types,
    media: input.media ?? "image",
    minWidth: input.minWidth ?? null,
    maxWidth: input.maxWidth ?? null,
    minHeight: input.minHeight ?? null,
    maxHeight: input.maxHeight ?? null,
    minBytes: input.minBytes,
    maxBytes: input.maxBytes,
    minSeconds: input.minSeconds ?? null,
    maxSeconds: input.maxSeconds ?? null,
    square,
    aspect: square ? 1 : (input.aspect ?? null),
  };
}

const PNG_GIF = ["image/png", "image/gif"];

export const ASTRO_SPECS: AstroSpec[] = [
  {
    id: "avatar-frame",
    group: "decoration",
    groupLabel: "Profile decoration",
    name: "Avatar frame",
    where: "Draws on top of the profile photo wherever that photo shows.",
    width: 288,
    height: 288,
    canvas: "288 × 288",
    formats: "PNG or GIF, transparent",
    limit: "Circle. Center hole about 148 px stays empty.",
    make: "Draw the frame in the outer ring. The photo is a circle in the center, about 148 px across. Leave that hole empty.",
    avoid: "Do not fill the center, and do not run type across the face.",
    minCount: 1,
    maxCount: 1,
    slots: [
      slot({
        id: "frame",
        label: "Frame",
        types: PNG_GIF,
        minWidth: 256,
        maxWidth: 288,
        minHeight: 256,
        maxHeight: 288,
        minBytes: 2 * KB,
        maxBytes: MB,
        square: true,
      }),
    ],
  },
  {
    id: "profile-effect",
    group: "decoration",
    groupLabel: "Profile decoration",
    name: "Profile effect",
    where: "Plays once across the whole profile card when someone opens it.",
    width: 960,
    height: 540,
    canvas: "960 × 540",
    formats: "GIF or WebM",
    limit: "16:9. Plays once. No audio.",
    make: "Animate the full card. Keep the middle band light so the name and bio stay readable.",
    avoid: "No endless loop, no solid shape over the name, no audio.",
    minCount: 1,
    maxCount: 1,
    slots: [
      slot({
        id: "effect",
        label: "Effect",
        types: ["image/gif", "video/webm"],
        media: "visual",
        minWidth: 960,
        maxWidth: 1920,
        minHeight: 540,
        maxHeight: 1080,
        minBytes: 8 * KB,
        maxBytes: 8 * MB,
        minSeconds: 0.5,
        maxSeconds: 6,
        aspect: 16 / 9,
      }),
    ],
  },
  {
    id: "nameplate",
    group: "decoration",
    groupLabel: "Profile decoration",
    name: "Nameplate",
    where: "Sits behind the display name in member lists, DMs, and voice.",
    width: 320,
    height: 96,
    canvas: "320 × 96",
    formats: "PNG or GIF",
    limit: "Same shape as 320 × 96. GIF loop under 4 seconds.",
    make: "Art goes behind the name. Keep the left 72 px quieter so the avatar still reads.",
    avoid: "No tiny type. It also shows about 32 px tall.",
    minCount: 1,
    maxCount: 1,
    slots: [
      slot({
        id: "plate",
        label: "Nameplate",
        types: PNG_GIF,
        minWidth: 320,
        maxWidth: 640,
        minHeight: 96,
        maxHeight: 192,
        minBytes: KB,
        maxBytes: 500 * KB,
        aspect: 320 / 96,
      }),
    ],
  },
  {
    id: "animated-avatar",
    group: "profile",
    groupLabel: "Profile and client",
    name: "Animated avatar",
    where: "The profile photo itself. Astro players can equip a GIF.",
    width: 512,
    height: 512,
    canvas: "512 × 512",
    formats: "GIF",
    limit: "Square. Subject stays inside the center 80%.",
    make: "KOBA crops a circle. Keep the subject inside the center 80%.",
    avoid: "Corners get cut off. JPG will not animate.",
    minCount: 1,
    maxCount: 1,
    slots: [
      slot({
        id: "avatar",
        label: "Avatar",
        types: ["image/gif"],
        minWidth: 256,
        maxWidth: 512,
        minHeight: 256,
        maxHeight: 512,
        minBytes: 4 * KB,
        maxBytes: 8 * MB,
        square: true,
      }),
    ],
  },
  {
    id: "profile-banner",
    group: "profile",
    groupLabel: "Profile and client",
    name: "Profile banner",
    where: "Wide image at the top of the profile card.",
    width: 680,
    height: 240,
    canvas: "680 × 240",
    formats: "PNG, JPG, or GIF",
    limit: "Same shape as 680 × 240. Avatar covers the bottom-left.",
    make: "Keep the subject in the upper two-thirds. The avatar covers the bottom-left.",
    avoid: "Do not put type or a face along the bottom edge.",
    minCount: 1,
    maxCount: 1,
    slots: [
      slot({
        id: "banner",
        label: "Banner",
        types: ["image/png", "image/jpeg", "image/gif"],
        minWidth: 680,
        maxWidth: 1360,
        minHeight: 240,
        maxHeight: 480,
        minBytes: 4 * KB,
        maxBytes: 8 * MB,
        aspect: 680 / 240,
      }),
    ],
  },
  {
    id: "profile-theme",
    group: "profile",
    groupLabel: "Profile and client",
    name: "Profile theme",
    where: "Recolors the profile card behind the banner and bio.",
    width: null,
    height: null,
    canvas: "Two hex colors",
    formats: "No image",
    limit: "Two 6-digit hex colors in the detail.",
    make: "KOBA paints a left-to-right gradient. List both hex codes in the detail.",
    avoid: "Both colors must stay readable under light text (#e8edf2).",
    minCount: 0,
    maxCount: 0,
    slots: [],
  },
  {
    id: "client-theme",
    group: "profile",
    groupLabel: "Profile and client",
    name: "Client theme",
    where: "Recolors the app for that player: accent on actions, surface on cards.",
    width: null,
    height: null,
    canvas: "Accent + surface",
    formats: "Two hex colors",
    limit: "No image. Two 6-digit hex colors in the detail.",
    make: "Accent is buttons and the active tab. Surface is cards. List both hex codes.",
    avoid: "Accent has to show on near-black (#07080b).",
    minCount: 0,
    maxCount: 0,
    slots: [],
  },
  {
    id: "home-icon",
    group: "profile",
    groupLabel: "Profile and client",
    name: "Home icon",
    where: "Replaces the app icon on a phone home screen for that player.",
    width: 1024,
    height: 1024,
    canvas: "1024 × 1024",
    formats: "PNG",
    limit: "Square. KOBA masks a squircle.",
    make: "KOBA masks a squircle. Keep the mark inside the center 80%.",
    avoid: "No thin lines, no edge transparency, no type smaller than 80 px.",
    minCount: 1,
    maxCount: 1,
    slots: [
      slot({
        id: "icon",
        label: "Icon",
        types: ["image/png"],
        minWidth: 512,
        maxWidth: 1024,
        minHeight: 512,
        maxHeight: 1024,
        minBytes: 4 * KB,
        maxBytes: 2 * MB,
        square: true,
      }),
    ],
  },
  {
    id: "server-look",
    group: "profile",
    groupLabel: "Profile and client",
    name: "Server look",
    where: "A second avatar, banner, and bio used in one server only.",
    width: null,
    height: null,
    canvas: "512² + 680 × 240",
    formats: "PNG or GIF, plus a bio",
    limit: "Avatar and banner are separate files. Bio stays in the detail, 190 characters or less.",
    make: "Ship both files. Avatar follows the animated-avatar rules. Banner follows the profile-banner rules.",
    avoid: "One square cannot be both the avatar and the banner.",
    minCount: 2,
    maxCount: 2,
    slots: [
      slot({
        id: "server-avatar",
        label: "Avatar",
        types: PNG_GIF,
        minWidth: 256,
        maxWidth: 512,
        minHeight: 256,
        maxHeight: 512,
        minBytes: 2 * KB,
        maxBytes: 8 * MB,
        square: true,
      }),
      slot({
        id: "server-banner",
        label: "Banner",
        types: ["image/png", "image/jpeg", "image/gif"],
        minWidth: 680,
        maxWidth: 1360,
        minHeight: 240,
        maxHeight: 480,
        minBytes: 4 * KB,
        maxBytes: 8 * MB,
        aspect: 680 / 240,
      }),
    ],
  },
  {
    id: "entrance-sound",
    group: "chat",
    groupLabel: "Chat and voice",
    name: "Entrance sound",
    where: "Plays once in the voice channel when the player joins.",
    width: null,
    height: null,
    canvas: "Audio · 0.5–5 s",
    formats: "MP3 or OGG",
    limit: "256 kbps. A short sting, not a music bed.",
    make: "A short sting. It should finish as the player lands in the channel.",
    avoid: "No music beds, no clipping, nothing past 5 seconds.",
    minCount: 1,
    maxCount: 1,
    slots: [
      slot({
        id: "sting",
        label: "Sound",
        types: ["audio/mpeg", "audio/ogg"],
        media: "audio",
        minBytes: 4 * KB,
        maxBytes: 512 * KB,
        minSeconds: 0.5,
        maxSeconds: 5,
      }),
    ],
  },
  {
    id: "burst-reaction",
    group: "chat",
    groupLabel: "Chat and voice",
    name: "Burst reaction",
    where: "An oversized reaction that plays across a message.",
    width: 128,
    height: 128,
    canvas: "128 × 128",
    formats: "GIF, transparent",
    limit: "Square. Loop between 1.2 and 2.0 seconds. Must read at 32 px.",
    make: "It also has to read at 32 px in the reaction row. Use a bold silhouette.",
    avoid: "No fine detail and no opaque background.",
    minCount: 1,
    maxCount: 1,
    slots: [
      slot({
        id: "burst",
        label: "Reaction",
        types: ["image/gif"],
        minWidth: 96,
        maxWidth: 128,
        minHeight: 96,
        maxHeight: 128,
        minBytes: KB,
        maxBytes: 256 * KB,
        square: true,
      }),
    ],
  },
  {
    id: "call-background",
    group: "chat",
    groupLabel: "Chat and voice",
    name: "Call background",
    where: "Replaces the room behind the player on a camera call.",
    width: 1920,
    height: 1080,
    canvas: "1920 × 1080",
    formats: "PNG, JPG, or MP4 (H.264)",
    limit: "16:9. Video is 1–10 seconds. Leave the center third clear.",
    make: "Put scenery at the edges. The face sits in the center third.",
    avoid: "No vertical video and no type in the center.",
    minCount: 1,
    maxCount: 1,
    slots: [
      slot({
        id: "room",
        label: "Background",
        types: ["image/png", "image/jpeg", "video/mp4"],
        media: "visual",
        minWidth: 1280,
        maxWidth: 1920,
        minHeight: 720,
        maxHeight: 1080,
        minBytes: 8 * KB,
        maxBytes: 8 * MB,
        minSeconds: 1,
        maxSeconds: 10,
        aspect: 16 / 9,
      }),
    ],
  },
  {
    id: "sticker-pack",
    group: "chat",
    groupLabel: "Chat and voice",
    name: "Sticker pack",
    where: "Sent inside a DM. Each sticker is its own file in the pack.",
    width: 320,
    height: 320,
    canvas: "320 × 320",
    formats: "PNG or GIF, transparent",
    limit: "4 to 8 stickers. Each must read at 32 px.",
    make: "One file per sticker. Use a bold shape that still reads at 32 px in the picker. Put the sticker names in the detail.",
    avoid: "No opaque backgrounds and no type smaller than 40 px.",
    minCount: 4,
    maxCount: 8,
    slots: [
      slot({
        id: "sticker",
        label: "Sticker",
        types: PNG_GIF,
        minWidth: 160,
        maxWidth: 320,
        minHeight: 160,
        maxHeight: 320,
        minBytes: KB,
        maxBytes: 512 * KB,
        square: true,
      }),
    ],
  },
];

const SPEC_BY_ID = Object.fromEntries(ASTRO_SPECS.map((spec) => [spec.id, spec])) as Record<AstroKind, AstroSpec>;

export function specFor(id: AstroKind): AstroSpec {
  return SPEC_BY_ID[id];
}

export const ASTRO_PRICE = "$5.95";

export const COIN_PACKS = [
  { id: "pack-500", coins: 500, usd: 4.99, high: 4.99 },
  { id: "pack-1100", coins: 1100, usd: 8.9, high: 9.99 },
  { id: "pack-2250", coins: 2250, usd: 17.9, high: 19.99 },
  { id: "pack-4600", coins: 4600, usd: 28.99, high: 34.99 },
  { id: "pack-7800", coins: 7800, usd: 43.9, high: 49.99 },
] as const;

export function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= MB) {
    const value = bytes / MB;
    return `${trimNumber(value)} MB`;
  }
  if (bytes >= KB) {
    const value = bytes / KB;
    return `${trimNumber(value)} KB`;
  }
  return `${bytes} B`;
}

function trimNumber(value: number): string {
  if (value >= 10) return String(Math.round(value));
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatSeconds(value: number): string {
  return Number.isInteger(value) ? `${value} s` : `${value.toFixed(1)} s`;
}

function edgeSize(slotSpec: UploadSlot, edge: "min" | "max"): string {
  const width = edge === "min" ? slotSpec.minWidth : slotSpec.maxWidth;
  const height = edge === "min" ? slotSpec.minHeight : slotSpec.maxHeight;
  const bytes = formatBytes(edge === "min" ? slotSpec.minBytes : slotSpec.maxBytes);
  const seconds = edge === "min" ? slotSpec.minSeconds : slotSpec.maxSeconds;
  const pixels = width == null || height == null ? "audio" : slotSpec.square ? `${width} px square` : `${width} × ${height}`;
  const time =
    seconds == null ? "" : slotSpec.media === "audio" ? ` · ${formatSeconds(seconds)}` : ` · video ${formatSeconds(seconds)}`;
  return `${pixels} · ${bytes}${time}`;
}

export function sizeWindow(spec: AstroSpec): { min: string; max: string } {
  if (spec.slots.length === 0) return { min: "Two hex colors", max: "Two hex colors, no image" };
  if (spec.slots.length === 1 && spec.maxCount > 1) {
    const only = spec.slots[0];
    return {
      min: `${spec.minCount} files · ${edgeSize(only, "min")} each`,
      max: `${spec.maxCount} files · ${edgeSize(only, "max")} each`,
    };
  }
  if (spec.slots.length === 1) return { min: edgeSize(spec.slots[0], "min"), max: edgeSize(spec.slots[0], "max") };
  return {
    min: spec.slots.map((item) => `${item.label} ${edgeSize(item, "min")}`).join(" · "),
    max: spec.slots.map((item) => `${item.label} ${edgeSize(item, "max")}`).join(" · "),
  };
}

const EXT_TYPE: Record<string, string> = {
  png: "image/png",
  gif: "image/gif",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webm: "video/webm",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
};

export function fileType(file: { name: string; type: string }): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TYPE[ext] ?? "";
}

function typeLabel(type: string): string {
  return TYPE_LABEL[type] ?? type;
}

function auditOne(slotSpec: UploadSlot, file: MeasuredFile): string | null {
  if (!slotSpec.types.includes(file.type)) {
    const accepted = slotSpec.types.map(typeLabel).join(" or ");
    return `${file.name} is not an accepted file. Use ${accepted}.`;
  }
  if (slotSpec.minWidth != null && slotSpec.maxWidth != null && slotSpec.minHeight != null && slotSpec.maxHeight != null) {
    if (file.width == null || file.height == null) return `${file.name} has no pixel size.`;
    if (slotSpec.square && file.width !== file.height) {
      return `${file.name} is ${file.width} × ${file.height}. It must be square.`;
    }
    if (file.width < slotSpec.minWidth || file.height < slotSpec.minHeight) {
      return `${file.name} is ${file.width} × ${file.height}. Minimum is ${edgeSize(slotSpec, "min")}.`;
    }
    if (file.width > slotSpec.maxWidth || file.height > slotSpec.maxHeight) {
      return `${file.name} is ${file.width} × ${file.height}. Maximum is ${edgeSize(slotSpec, "max")}.`;
    }
    if (slotSpec.aspect && !slotSpec.square) {
      const got = file.width / file.height;
      if (Math.abs(got - slotSpec.aspect) / slotSpec.aspect > 0.04) {
        return `${file.name} is ${file.width} × ${file.height}. Keep the same shape as ${slotSpec.maxWidth} × ${slotSpec.maxHeight}.`;
      }
    }
  }
  if (file.bytes < slotSpec.minBytes) {
    return `${file.name} is ${formatBytes(file.bytes)}. Minimum is ${formatBytes(slotSpec.minBytes)}.`;
  }
  if (file.bytes > slotSpec.maxBytes) {
    return `${file.name} is ${formatBytes(file.bytes)}. Maximum is ${formatBytes(slotSpec.maxBytes)}.`;
  }
  const timed = slotSpec.media === "audio" || slotSpec.media === "video" || (slotSpec.media === "visual" && file.type.startsWith("video/"));
  if (timed && slotSpec.minSeconds != null && slotSpec.maxSeconds != null) {
    if (file.seconds == null || Number.isNaN(file.seconds)) return `${file.name} has no duration.`;
    if (file.seconds < slotSpec.minSeconds) {
      return `${file.name} is ${formatSeconds(file.seconds)}. Minimum is ${formatSeconds(slotSpec.minSeconds)}.`;
    }
    if (file.seconds > slotSpec.maxSeconds) {
      return `${file.name} is ${formatSeconds(file.seconds)}. Maximum is ${formatSeconds(slotSpec.maxSeconds)}.`;
    }
  }
  return null;
}

export function auditUploads(spec: AstroSpec, files: MeasuredFile[]): string | null {
  if (spec.slots.length === 0) return null;
  const min = spec.slots.length === 1 ? spec.minCount : spec.slots.length;
  const max = spec.slots.length === 1 ? spec.maxCount : spec.slots.length;
  if (files.length < min || files.length > max) {
    if (min === 1 && max === 1) return "Upload 1 file inside the minimum and maximum.";
    if (min === max) return `Upload ${min} files. You added ${files.length}.`;
    return `Upload ${min} to ${max} files. You added ${files.length}.`;
  }
  if (spec.slots.length === 1) {
    for (const file of files) {
      const issue = auditOne(spec.slots[0], file);
      if (issue) return issue;
    }
    return null;
  }
  for (let index = 0; index < spec.slots.length; index += 1) {
    const issue = auditOne(spec.slots[index], files[index]);
    if (issue) return `${spec.slots[index].label}: ${issue}`;
  }
  return null;
}

export function themeError(spec: AstroSpec, detail: string): string | null {
  if (spec.slots.length > 0) return null;
  const found = detail.match(/#(?:[0-9a-fA-F]{6})\b/g) ?? [];
  if (found.length < 2) return "List two hex colors in the detail, like #7CFF4F and #101614.";
  return null;
}

export interface AstroAccount {
  verified: boolean;
  business: boolean;
  businessName?: string;
}

export interface ListedFile {
  name: string;
  bytes: number;
  width: number | null;
  height: number | null;
  seconds: number | null;
}

export interface ShopProduct {
  id: string;
  sellerId: string;
  title: string;
  detail: string;
  price: number;
  game: ShopGame;
  kind: AstroKind;
  files?: ListedFile[];
  motion?: "ring" | "plate" | "burst" | "banner" | "stickers";
  rarity: Rarity;
  bundle?: boolean;
}

export interface SaleQuote {
  rate: number;
  fee: number;
  payout: number;
  label: "2.5%" | "3.5%";
}

export function accountFor(id: string, opened: Record<string, string>): AstroAccount {
  const openedName = opened[id];
  return { verified: false, business: Boolean(openedName), ...(openedName ? { businessName: openedName } : {}) };
}

export function money(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatCoins(value: number): string {
  const rounded = money(value);
  return rounded.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function quote(price: number, verified: boolean): SaleQuote {
  const rate = verified ? 0.025 : 0.035;
  const fee = money(price * rate);
  return {
    rate,
    fee,
    payout: money(price - fee),
    label: verified ? "2.5%" : "3.5%",
  };
}

