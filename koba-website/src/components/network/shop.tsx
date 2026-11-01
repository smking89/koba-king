import { useEffect, useRef, useState, type ReactNode } from "react";
import { BadgeIcon } from "@/components/network/badges";
import { Button, ChipRow, ChoiceSheet, FadeNote, Segmented } from "@/components/ui";
import { MysteryPerson, PulseFrame } from "@/components/network/shared";
import { useCommunity } from "@/site/community";
import type { Identity } from "@/platform/engine";
import { usePlatform } from "@/platform/store";
import {
  accountFor,
  ASTRO_PRICE,
  COIN_PACKS,
  formatUsd,
  ASTRO_SPECS,
  auditUploads,
  formatBytes,
  formatCoins,
  quote,
  RARITY_TIERS,
  rarityTier,
  sizeWindow,
  specFor,
  themeError,
  type AstroAccount,
  type AstroGroup,
  type AstroKind,
  type AstroSpec,
  type ListedFile,
  type MeasuredFile,
  type Rarity,
  type ShopProduct,
} from "@/site/astro";
import { measureFile } from "@/site/measure";

const GROUPS: { id: "all" | AstroGroup; label: string }[] = [
  { id: "all", label: "All sizes" },
  { id: "decoration", label: "Profile decoration" },
  { id: "profile", label: "Profile and client" },
  { id: "chat", label: "Chat and voice" },
];

type UploadRow = MeasuredFile & { preview: string | null };

function release(rows: Array<UploadRow | null>) {
  for (const row of rows) {
    if (row?.preview) URL.revokeObjectURL(row.preview);
  }
}

function CanvasMark({ spec }: { spec: AstroSpec }) {
  const slot = spec.slots.length === 1 ? spec.slots[0] : null;
  if (!slot?.maxWidth || !slot.maxHeight || !slot.minWidth || !slot.minHeight) {
    return (
      <div className="grid h-16 place-items-center rounded-lg border border-dashed border-border bg-bg">
        <p className="font-mono text-xs text-muted">{spec.canvas}</p>
      </div>
    );
  }
  const scale = Math.min(220 / slot.maxWidth, 64 / slot.maxHeight);
  const maxWidth = Math.max(16, Math.round(slot.maxWidth * scale));
  const maxHeight = Math.max(12, Math.round(slot.maxHeight * scale));
  const minWidth = Math.max(8, Math.round(slot.minWidth * scale));
  const minHeight = Math.max(8, Math.round(slot.minHeight * scale));
  const ranged = slot.minWidth !== slot.maxWidth || slot.minHeight !== slot.maxHeight;
  return (
    <div className="grid h-36 place-items-center">
      {spec.id === "avatar-frame" ? (
        <span className="grid h-28 w-28 place-items-center rounded-full border border-white/70" style={{ borderRadius: "50%" }}>
          <span className="h-14 w-14 rounded-full bg-black" style={{ borderRadius: "50%" }} />
        </span>
      ) : (
      <div
        className="relative border border-white/40"
        style={{ width: maxWidth, height: maxHeight }}
      >
        {ranged ? (
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border border-white/50"
            style={{ width: minWidth, height: minHeight }}
          />
        ) : null}
      </div>
      )}
    </div>
  );
}

export function MotionPreview({ motion, title, compact = false }: { motion?: string; title: string; compact?: boolean }) {
  const stage = compact ? "astro-stage is-mini" : "astro-stage";
  if (motion === "ring") {
    return (
      <div className={`${stage} is-circle`} aria-hidden>
        <span className="astro-ring" />
        <span className="astro-face">{title.slice(0, 1)}</span>
      </div>
    );
  }
  if (motion === "plate") {
    return (
      <div className={stage} aria-hidden>
        <span className="astro-plate flex items-center gap-2 text-sm">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-bg text-xs">{title.slice(0, 1)}</span>
          {title}
        </span>
      </div>
    );
  }
  if (motion === "burst") {
    return (
      <div className={`${stage} is-circle`} aria-hidden>
        <span className="astro-burst" />
        <span className="relative z-10 text-sm">{title}</span>
      </div>
    );
  }
  if (motion === "banner") {
    return (
      <div className={stage} aria-hidden>
        <span className="astro-banner" />
        <span className="relative z-10 text-sm">{title}</span>
      </div>
    );
  }
  if (motion === "stickers") {
    return (
      <div className={stage} aria-hidden>
        <span className="astro-sticker" />
        <span className="astro-sticker" style={{ animationDelay: "120ms" }} />
        <span className="astro-sticker" style={{ animationDelay: "240ms" }} />
      </div>
    );
  }
  return null;
}

export function ProfileWear({
  name,
  handle,
  motion,
  badges,
  verified = false,
  avatarUrl,
  bannerUrl,
}: {
  name: string;
  handle: string;
  motion?: string;
  badges?: ReactNode;
  verified?: boolean;
  /** Uploaded profile picture (data URL or provider image). */
  avatarUrl?: string | null;
  /** Uploaded profile banner; takes over the shop's decorative banner slot. */
  bannerUrl?: string | null;
}) {
  const banner = bannerUrl ?? null;

  const bannerArt = banner ? (
    <img src={banner} alt="" className="h-full w-full object-cover" />
  ) : motion === "banner" ? (
    <span className="astro-banner" />
  ) : (
    <span className="absolute inset-0 grid place-items-center">
      <img
        src="/brand/koba-wordmark.png"
        alt=""
        className="profile-banner-mark h-7 w-auto max-w-[48%] -translate-y-1 object-contain sm:h-10"
      />
    </span>
  );

  return (
    <div className="overflow-visible rounded-3xl border border-border bg-bg-elevated">
      <div
        className={`group/banner relative h-40 overflow-hidden rounded-t-3xl sm:h-52 ${
          banner || motion === "banner" ? "bg-bg-subtle" : "profile-banner-empty"
        }`}
      >
        {bannerArt}
      </div>
      <div className="overflow-visible px-5 pb-4">
        <div
          className="relative z-20 -mt-12 grid h-24 w-24 place-items-center overflow-visible sm:-mt-16 sm:h-32 sm:w-32"
          style={{ borderRadius: "50%" }}
        >
          {motion === "ring" ? <span className="astro-ring" style={{ borderRadius: "50%" }} /> : null}
          {motion === "burst" ? <span className="astro-burst" style={{ borderRadius: "50%" }} /> : null}
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full rounded-full border border-border bg-bg-subtle object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center overflow-hidden rounded-full border border-border bg-bg-subtle text-faint">
              <MysteryPerson className="h-[62%] w-[62%] translate-y-[15%]" />
            </span>
          )}
        </div>
        {motion === "plate" ? (
          <span className="astro-plate text-sm font-medium">{name}</span>
        ) : (
          <p className="text-xl font-semibold tracking-tight">{name}</p>
        )}
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
          {handle}
          {verified ? <VerifiedSeal /> : null}
        </p>
        {badges ? <div className="mt-3">{badges}</div> : null}
      </div>
    </div>
  );
}

function VerifiedSeal() {
  return (
    <svg width={18} height={18} viewBox="0 0 64 64" aria-label="Verified" className="shrink-0">
      <path d="M32 2 38.5 7.9 47 6 49.7 14.3 58 17 56.1 25.5 62 32 56.1 38.5 58 47 49.7 49.7 47 58 38.5 56.1 32 62 25.5 56.1 17 58 14.3 49.7 6 47 7.9 38.5 2 32 7.9 25.5 6 17 14.3 14.3 17 6 25.5 7.9Z" fill="#0095F6" />
      <path d="M22 33.5 29.2 41.2 43.5 23.5" fill="none" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RarityMark({ rarity, size = 56 }: { rarity: Rarity; size?: number }) {
  const tier = rarityTier(rarity);
  return (
    <img src={`/rarity/${tier.id}.png`} alt={tier.label} width={size} height={size} className="shrink-0 object-contain" style={{ width: size, height: size }} />
  );
}
function Heart({ on }: { on: boolean }) {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" aria-hidden className={on ? "fill-white" : "fill-none"}>
      <path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9Z" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function VerifiedMark({ verified }: { verified: boolean }) {
  if (verified) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs">
        <BadgeIcon icon="seal" color="cyan" size={18} />
        Verified
      </span>
    );
  }
  return <span className="text-xs text-muted">Unverified</span>;
}

export function ShopPage({
  viewer,
  identities,
  products,
  opened,
  onOpenBusiness,
  onCreate,
  onBuy,
  onGift,
  onOpenPlayer,
  subscribed,
  owned,
  equipped,
  onSubscribe,
  onEndPass,
  onEquip,
  panel = "store",
}: {
  viewer: Identity;
  identities: Identity[];
  products: ShopProduct[];
  opened: Record<string, string>;
  onOpenBusiness: (name: string) => void;
  onCreate: (draft: { title: string; detail: string; price: number; kind: AstroKind; files: ListedFile[]; rarity: Rarity; bundle?: boolean }) => void;
  onBuy: (product: ShopProduct, seller: AstroAccount) => string | null;
  onGift?: (product: ShopProduct) => void;
  onOpenPlayer: (id: string) => void;
  subscribed: boolean;
  owned: string[];
  equipped: string | null;
  onSubscribe: () => void;
  onEndPass: () => void;
  onEquip: (productId: string) => boolean;
  panel?: "store" | "desk";
}) {
  const standing = accountFor(viewer.id, opened);
  const fee = quote(100, standing.verified);
  const [businessName, setBusinessName] = useState("");
  const [businessError, setBusinessError] = useState("");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [price, setPrice] = useState("25");
  const [kind, setKind] = useState<AstroKind>("avatar-frame");
  const [rarity, setRarity] = useState<Rarity | null>(null);
  const [group, setGroup] = useState<"all" | AstroGroup>("all");
  const [formError, setFormError] = useState("");
  const [flash, setFlash] = useState(0);
  const [result, setResult] = useState("");
  const [lane, setLane] = useState<"shop" | "wish">("shop");
  const [rarityFilter, setRarityFilter] = useState<"all" | Rarity>("all");
  const [rows, setRows] = useState<Array<UploadRow | null>>([]);
  const [busy, setBusy] = useState(false);
  const [fileEpoch, setFileEpoch] = useState(0);
  const rowsRef = useRef<Array<UploadRow | null>>([]);
  const gen = useRef(0);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    gen.current += 1;
    setRows([]);
    setBusy(false);
    return () => release(rowsRef.current);
  }, [kind]);

  const [picked, setPicked] = useState<string | null>(null);
  const wishlist = useCommunity((s) => s.wishlist);
  const toggleWish = useCommunity((s) => s.toggleWish);
  const creditCoins = usePlatform((s) => s.creditCoins);
  const buyBoost = usePlatform((s) => s.buyBoost);
  const boostUntil = usePlatform((s) => s.boostUntil[viewer.id] ?? 0);
  const saved = wishlist[viewer.id] ?? [];
  const priceNumber = Number(price);
  const preview = Number.isFinite(priceNumber) && priceNumber > 0 ? quote(priceNumber, standing.verified) : null;

  const openBusiness = () => {
    const name = businessName.trim();
    if (name.length < 2 || name.length > 32) {
      setBusinessError("Use 2–32 characters.");
      return;
    }
    setBusinessError("");
    onOpenBusiness(name);
    setResult(`${name} can list on the Official shop. Verification did not change.`);
    setFlash((value) => value + 1);
  };

  const spec = specFor(kind);
  const visible = ASTRO_SPECS.filter((item) => group === "all" || item.group === group);
  const bounds = sizeWindow(spec);
  const uploads = rows.filter((row): row is UploadRow => row != null);
  const liveIssue = spec.slots.length === 0 ? null : auditUploads(spec, uploads);

  const ingest = async (list: File[], index: number | null) => {
    const token = gen.current + 1;
    gen.current = token;
    setBusy(true);
    setFormError("");
    try {
      const measured = await Promise.all(
        list.map(async (file) => {
          const row = await measureFile(file);
          const preview = row.type.startsWith("image/") ? URL.createObjectURL(file) : null;
          return { ...row, preview };
        }),
      );
      if (gen.current !== token) {
        release(measured);
        return;
      }
      setRows((current) => {
        if (index === null) {
          release(current);
          return measured;
        }
        const next = [...current];
        if (next[index]?.preview) URL.revokeObjectURL(next[index].preview);
        next[index] = measured[0];
        return next;
      });
    } catch {
      if (gen.current !== token) return;
      setFormError("That file could not be read. Check the format and export it again.");
    } finally {
      if (gen.current === token) setBusy(false);
    }
  };

  const create = () => {
    const nextTitle = title.trim();
    const nextDetail = detail.trim();
    if (nextTitle.length < 3 || nextTitle.length > 48) {
      setFormError("Title needs 3–48 characters.");
      return;
    }
    if (nextDetail.length < 8 || nextDetail.length > 140) {
      setFormError("Detail needs 8–140 characters.");
      return;
    }
    if (!Number.isInteger(priceNumber) || priceNumber < 1 || priceNumber > 500) {
      setFormError("Price is a whole number of coins, from 1 to 500.");
      return;
    }
    if (!rarity) {
      setFormError("Choose a rarity before publishing.");
      return;
    }
    const tier = rarityTier(rarity);
    if (priceNumber < tier.coins[0] || priceNumber > tier.coins[1]) {
      setFormError(`${tier.label} price is ${tier.coins[0]}–${tier.coins[1]} coins. Quality ${tier.quality[0]}–${tier.quality[1]}.`);
      return;
    }
    if (tier.bundle && uploads.length < 2 && spec.maxCount < 2) {
      setFormError("Relic is always a bundle. Add at least two files, or pick a type that takes more than one.");
      return;
    }
    const colors = themeError(spec, nextDetail);
    if (colors) {
      setFormError(colors);
      return;
    }
    if (spec.slots.length > 0) {
      if (busy) {
        setFormError("Still checking the file size.");
        return;
      }
      const issue = auditUploads(spec, uploads);
      if (issue) {
        setFormError(issue);
        return;
      }
    }
    const files: ListedFile[] = uploads.map((row) => ({
      name: row.name,
      bytes: row.bytes,
      width: row.width,
      height: row.height,
      seconds: row.seconds,
    }));
    setFormError("");
    onCreate({ title: nextTitle, detail: nextDetail, price: priceNumber, kind, files, rarity, bundle: tier.bundle });
    setTitle("");
    setDetail("");
    release(rows);
    setRows([]);
    setFileEpoch((value) => value + 1);
    setResult(`${nextTitle} is listed. Buyers pay ${formatCoins(priceNumber)}. You receive ${formatCoins(quote(priceNumber, standing.verified).payout)} after the ${fee.label} Astro fee.`);
    setFlash((value) => value + 1);
  };

  const openProduct = products.find((item) => item.id === picked) ?? null;

  return (
    <div className="grid gap-5">
      {panel === "store" ? (
        <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{openProduct ? openProduct.title : "What players are buying"}</h1>
        <span className="font-mono text-xs">{formatCoins(viewer.coins)} KOBA coins</span>
      </div>
      {openProduct ? null : (
        <>
          <Segmented
            label="Shop"
            value={lane}
            options={[
              { id: "shop", label: "Shop" },
              { id: "wish", label: "Wishlist" },
            ]}
            onChange={setLane}
          />
          <ChipRow
            label="Rarity"
            value={rarityFilter}
            options={[{ id: "all", label: "All" }, ...RARITY_TIERS.map((tier) => ({ id: tier.id, label: tier.label }))]}
            onChange={setRarityFilter}
          />
        </>
      )}

      {openProduct ? (
        <ShopDetail
          product={openProduct}
          viewer={viewer}
          identities={identities}
          opened={opened}
          subscribed={subscribed}
          owned={owned}
          equipped={equipped}
          saved={saved.includes(openProduct.id)}
          onBack={() => setPicked(null)}
          onSave={() => toggleWish(viewer.id, openProduct.id)}
          onBuy={onBuy}
          onGift={onGift}
          onEquip={onEquip}
          onNote={(message) => {
            setResult(message);
            setFlash((value) => value + 1);
          }}
        />
      ) : (
        <>
        <CoinPacks
          onBuy={(pack) => {
            const price = pack.usd === pack.high ? formatUsd(pack.usd) : `${formatUsd(pack.usd)}–${formatUsd(pack.high)}`;
            const added = creditCoins(viewer.id, pack.coins, `${formatCoins(pack.coins)} KOBA coins`, `${price} USD. Not a cryptocurrency.`);
            setResult(added ? `${formatCoins(pack.coins)} KOBA coins added. ${price} USD.` : "That pack did not add.");
            setFlash((value) => value + 1);
          }}
          boostUntil={boostUntil}
          onBoost={() => {
            const bought = buyBoost(viewer.id);
            setResult(bought.ok ? "Boost is on for 10 minutes. 50 KOBA coins." : bought.reason);
            setFlash((value) => value + 1);
          }}
        />
        {result ? <FadeNote text={result} /> : null}
        <ShopShelf
          products={products.filter((product) => (lane === "shop" || saved.includes(product.id)) && (rarityFilter === "all" || product.rarity === rarityFilter))}
          saved={saved}
          onOpen={setPicked}
          onSave={(id) => toggleWish(viewer.id, id)}
          onGift={onGift}
          onBuy={(product) => {
            const sellerAccount = accountFor(product.sellerId, opened);
            const error = onBuy(product, sellerAccount);
            setResult(error ?? `Bought ${product.title}. You paid ${formatCoins(product.price)}.`);
            setFlash((value) => value + 1);
          }}
        />
        </>
      )}
        </>
      ) : null}

      {panel === "desk" ? (
        <>
      <PulseFrame key={flash} live={flash > 0} className="border border-border bg-bg-elevated p-4">
        <h2 className="text-sm font-medium">The fee most sellers skip</h2>
        <ul className="mt-3 grid gap-3 text-sm text-muted">
          <li>Verified sellers pay 2.5%. The blue mark is the only sign.</li>
          <li>Unverified sellers pay 3.5%. No mark.</li>
          <li>The buyer pays the listed price. The cut comes off the seller.</li>
          <li>You do not need the mark to list. A business account is enough.</li>
          <li>Stay inside the file size for that product, then publish.</li>
          <li>Cosmetic prices are KOBA coins. KOBA coins are not a cryptocurrency.</li>
          <li>Astro is {ASTRO_PRICE} a month. You can buy a cosmetic without it. You cannot wear it without it.</li>
        </ul>
      </PulseFrame>

      <section className="rounded-3xl border border-border bg-bg-elevated p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-faint">This identity</p>
            <p className="mt-1 text-sm">
              {viewer.name}
              {standing.business && standing.businessName ? ` · ${standing.businessName}` : ""}
            </p>
          </div>
          <VerifiedMark verified={standing.verified} />
        </div>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted">Astro fee</dt>
            <dd className="mt-1 font-mono text-xs">{fee.label}</dd>
          </div>
          <div>
            <dt className="text-muted">Can list</dt>
            <dd className="mt-1 font-mono text-xs">{standing.business ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt className="text-muted">Coins</dt>
            <dd className="mt-1 font-mono text-xs">{formatCoins(viewer.coins)}</dd>
          </div>
        </dl>
        {result ? (
          <p className="mt-3 text-sm text-fg" role="status">
            {result}
          </p>
        ) : null}
      </section>

      <section className="rounded-3xl border border-border bg-bg-elevated p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">Astro pass</h2>
            <p className="mt-1 text-sm text-muted">
              {ASTRO_PRICE} a month. Level 1 opens at the first month. The gem climbs at 2, 3, 6, 9, 12, 15, 18, and 24 months. Stopping the pass hides the gem. The month count stays.
            </p>
          </div>
          {subscribed ? (
            <button type="button" onClick={onEndPass} className="min-h-11 text-sm text-muted">
              End Astro
            </button>
          ) : (
            <Button type="button" variant="primary" onClick={onSubscribe}>
              Start Astro · {ASTRO_PRICE}
            </Button>
          )}
        </div>
        <p className="mt-3 text-sm" role="status">
          {subscribed ? "Astro is active. The stipend and clan banner are armed." : "Astro is not active. Apply stays locked."}
        </p>
      </section>

      <section className="grid gap-3">
        <div>
          <h2 className="text-sm font-medium">File sizes</h2>
          <p className="mt-1 text-sm text-muted">Product types for the Official shop. The canvas is the file you export. Select one to build it.</p>
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {GROUPS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={group === item.id}
              onClick={() => {
                setGroup(item.id);
                const matched = ASTRO_SPECS.filter((specRow) => item.id === "all" || specRow.group === item.id);
                if (!matched.some((specRow) => specRow.id === kind)) setKind(matched[0].id);
              }}
              className="tab-plain"
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {visible.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={kind === item.id}
              onClick={() => setKind(item.id)}
              className={`p-4 text-left ${kind === item.id ? "text-white" : "text-[#8d8d8d]"}`}
            >
              <p className="font-mono text-xs text-faint">{item.groupLabel}</p>
              <p className="mt-1 text-sm">{item.name}</p>
              {item.id === "avatar-frame" ? (
                <span className="mt-3 grid h-24 w-24 place-items-center rounded-full border border-white/70" style={{ borderRadius: "50%" }}>
                  <span className="h-12 w-12 rounded-full bg-black" style={{ borderRadius: "50%" }} />
                </span>
              ) : null}
              <p className="mt-2 font-mono text-lg text-ok">{item.canvas}</p>
              <p className="mt-1 text-sm text-muted">{item.formats}</p>
              <p className="mt-2 font-mono text-xs text-muted">Min {sizeWindow(item).min}</p>
              <p className="font-mono text-xs text-muted">Max {sizeWindow(item).max}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-3 rounded-3xl border border-border bg-bg-elevated p-4">
        <div>
          <p className="font-mono text-xs text-faint">{spec.groupLabel}</p>
          <h2 className="mt-1 text-base font-medium">{spec.name}</h2>
          <p className="mt-2 font-mono text-2xl text-ok">{spec.canvas}</p>
          <p className="mt-1 text-sm text-muted">
            {spec.formats}. {spec.limit}.
          </p>
        </div>
        <CanvasMark spec={spec} />
        {spec.slots.length === 1 && spec.slots[0].minWidth !== spec.slots[0].maxWidth ? (
          <p className="text-sm text-muted">Outer line is the maximum. Inner line is the minimum.</p>
        ) : null}
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Where it shows</dt>
            <dd className="mt-1">{spec.where}</dd>
          </div>
          <div>
            <dt className="text-muted">Minimum</dt>
            <dd className="mt-1">{bounds.min}</dd>
          </div>
          <div>
            <dt className="text-muted">Maximum</dt>
            <dd className="mt-1">{bounds.max}</dd>
          </div>
          <div>
            <dt className="text-muted">How to make it</dt>
            <dd className="mt-1">{spec.make}</dd>
          </div>
          <div>
            <dt className="text-muted">Do not</dt>
            <dd className="mt-1">{spec.avoid}</dd>
          </div>
        </dl>
      </section>

      {standing.business ? (
        <form
          className="grid gap-3 rounded-3xl border border-border bg-bg-elevated p-4"
          onSubmit={(event) => {
            event.preventDefault();
            create();
          }}
        >
          <h2 className="text-sm font-medium">List this {spec.name.toLowerCase()}</h2>
          <div className="flex items-center gap-3">
            {rarity ? <RarityMark rarity={rarity} size={72} /> : null}
            <ChoiceSheet
              label="Rarity"
              value={rarity ?? ""}
              radios
              options={RARITY_TIERS.map((tier) => ({
                id: tier.id,
                label: tier.label,
                detail: `Quality ${tier.quality[0]}–${tier.quality[1]} · ${tier.coins[0]}–${tier.coins[1]} coins${tier.bundle ? " · bundle" : ""}`,
              }))}
              onChange={(id) => setRarity(id as Rarity)}
            />
          </div>
          <p className="text-sm text-muted">
            {standing.businessName} lists at {fee.label}.{" "}
            {spec.slots.length > 0
              ? "The file has to land between the minimum and the maximum. KOBA does not rescale."
              : "This type has no image. Put two hex colors in the detail."}{" "}
            {standing.verified ? "The blue badge is already on this account." : "This business is unverified, so the higher fee applies."}
          </p>
          {spec.slots.length === 0 ? null : spec.slots.length === 1 ? (
            <label className="grid gap-1">
              <span className="font-mono text-xs text-faint">{spec.maxCount > 1 ? `Upload ${spec.minCount} to ${spec.maxCount} files` : "Upload"}</span>
              <input
                key={`${kind}-${fileEpoch}`}
                type="file"
                accept={spec.slots[0].accept}
                multiple={spec.maxCount > 1}
                aria-label={spec.maxCount > 1 ? "Upload sticker files" : "Upload cosmetic file"}
                onChange={(event) => {
                  const list = event.target.files;
                  if (!list?.length) return;
                  void ingest(Array.from(list), null);
                }}
                className="block w-full text-sm file:mr-3 file:h-11 file:rounded-lg file:border file:border-border file:bg-bg file:px-3 file:text-sm file:text-fg"
              />
            </label>
          ) : (
            spec.slots.map((slot, index) => (
              <label key={slot.id} className="grid gap-1">
                <span className="font-mono text-xs text-faint">
                  {slot.label} · min {slot.minWidth}×{slot.minHeight} · max {slot.maxWidth}×{slot.maxHeight}
                </span>
                <input
                  key={`${kind}-${slot.id}-${fileEpoch}`}
                  type="file"
                  accept={slot.accept}
                  aria-label={`Upload ${slot.label}`}
                  onChange={(event) => {
                    const list = event.target.files;
                    if (!list?.length) return;
                    void ingest([list[0]], index);
                  }}
                  className="block w-full text-sm file:mr-3 file:h-11 file:rounded-lg file:border file:border-border file:bg-bg file:px-3 file:text-sm file:text-fg"
                />
              </label>
            ))
          )}
          {busy ? <p className="text-sm text-muted">Checking size…</p> : null}
          {uploads.map((row, index) => (
            <p key={`${row.name}-${index}`} className="flex items-center gap-3 text-sm text-muted">
              {row.preview ? <img src={row.preview} alt="" className="h-11 w-11 rounded-lg border border-border object-contain" /> : null}
              <span>
                {row.name} · {row.width && row.height ? `${row.width} × ${row.height}` : "audio"} · {formatBytes(row.bytes)}
                {row.seconds != null ? ` · ${row.seconds.toFixed(1)} s` : ""}
              </span>
            </p>
          ))}
          {!busy && uploads.length > 0 && liveIssue ? <p className="text-sm text-danger">{liveIssue}</p> : null}
          {!busy && uploads.length > 0 && !liveIssue ? <p className="text-sm text-ok">In range.</p> : null}
          <label className="grid gap-1">
            <span className="font-mono text-xs text-faint">Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-11 rounded-lg border border-border bg-bg px-3 text-sm" />
          </label>
          <label className="grid gap-1">
            <span className="font-mono text-xs text-faint">Detail</span>
            <input value={detail} onChange={(event) => setDetail(event.target.value)} className="h-11 rounded-lg border border-border bg-bg px-3 text-sm" />
          </label>
          <label className="grid gap-1">
            <span className="font-mono text-xs text-faint">Price in coins</span>
            <input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="numeric" className="h-11 rounded-lg border border-border bg-bg px-3 text-sm" />
          </label>
          {preview ? (
            <p className="text-sm text-muted">
              Buyer pays {formatCoins(priceNumber)}. You receive {formatCoins(preview.payout)}. Astro keeps {formatCoins(preview.fee)} ({preview.label}).
            </p>
          ) : (
            <p className="text-sm text-muted">Enter a price to see the fee.</p>
          )}
          {formError ? <p className="text-sm text-danger">{formError}</p> : null}
          <Button type="submit" variant="primary" className="w-full sm:w-auto">
            List on the Official shop
          </Button>
        </form>
      ) : (
        <form
          className="grid gap-3 rounded-3xl border border-border bg-bg-elevated p-4"
          onSubmit={(event) => {
            event.preventDefault();
            openBusiness();
          }}
        >
          <h2 className="text-sm font-medium">Open a business account</h2>
          <p className="text-sm text-muted">
            {viewer.name.split(" ")[0]} is {standing.verified ? "verified" : "unverified"} and not a business yet. Players can buy. Only a business can create products. Your fee stays {fee.label}.
          </p>
          <label className="grid gap-1">
            <span className="font-mono text-xs text-faint">Business name</span>
            <input value={businessName} onChange={(event) => setBusinessName(event.target.value)} className="h-11 rounded-lg border border-border bg-bg px-3 text-sm" />
          </label>
          {businessError ? <p className="text-sm text-danger">{businessError}</p> : null}
          <Button type="submit" variant="primary" className="w-full sm:w-auto">
            Open business account
          </Button>
        </form>
      )}

      {result ? <p className="text-sm" role="status">{result}</p> : null}
        </>
      ) : null}
    </div>
  );
}

function BoostOffer({ until, onBuy }: { until: number; onBuy: () => void }) {
  const live = until > Date.now();
  return (
    <section className="flex items-center gap-3 border-b border-border py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-sm">Boost</span>
        <span className="block text-xs text-muted">{live ? `On until ${new Date(until).toLocaleTimeString()}` : "10 minutes · 50 KOBA coins"}</span>
      </span>
      <button type="button" className="h-10 text-sm" onClick={onBuy}>
        Boost
      </button>
    </section>
  );
}

function CoinPacks({
  onBuy,
  onBoost,
  boostUntil,
}: {
  onBuy: (pack: (typeof COIN_PACKS)[number]) => void;
  onBoost: () => void;
  boostUntil: number;
}) {
  const [id, setId] = useState<string>(COIN_PACKS[0].id);
  const pack = COIN_PACKS.find((item) => item.id === id) ?? COIN_PACKS[0];
  const price = pack.usd === pack.high ? formatUsd(pack.usd) : `${formatUsd(pack.usd)}–${formatUsd(pack.high)}`;
  const live = boostUntil > Date.now();
  return (
    <section className="grid gap-3 pb-16">
      <div>
        <h2 className="text-sm font-medium">KOBA coins</h2>
        <p className="mt-1 text-sm text-muted">About $0.01 a coin. Paid in USD. The coins buy ads, boosts, and cosmetics. They are not a cryptocurrency.</p>
      </div>
      <ChoiceSheet
        label="Coin pack"
        value={id}
        options={COIN_PACKS.map((item) => ({
          id: item.id,
          label: `${formatCoins(item.coins)} KOBA coins`,
          detail: item.usd === item.high ? formatUsd(item.usd) : `${formatUsd(item.usd)}–${formatUsd(item.high)} USD`,
        }))}
        onChange={setId}
      />
      <p className="text-xs text-muted">{live ? `Boost on until ${new Date(boostUntil).toLocaleTimeString()}` : "Boost is 10 minutes · 50 KOBA coins"}</p>
      <div className="fixed inset-x-0 bottom-16 z-20 flex items-center gap-3 border-t border-white bg-black px-3 py-2 xl:static xl:border-0 xl:px-0">
        <button type="button" className="h-12 text-sm" onClick={onBoost}>
          Boost
        </button>
        <button type="button" className="h-12 flex-1 bg-white text-sm font-medium text-black" onClick={() => onBuy(pack)}>
          Buy {price}
        </button>
      </div>
    </section>
  );
}

function ShopShelf({
  products,
  saved,
  onOpen,
  onSave,
  onGift,
  onBuy,
}: {
  products: ShopProduct[];
  saved: string[];
  onOpen: (id: string) => void;
  onSave: (id: string) => void;
  onGift?: (product: ShopProduct) => void;
  onBuy: (product: ShopProduct) => void;
}) {
  const featured = products.find((product) => product.motion === "banner") ?? products[0];
  return (
    <div className="grid gap-4">
      {products.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted">
          No products listed yet. Verified sellers can publish a cosmetic from the business desk.
        </p>
      ) : null}
      {featured ? (
        <button type="button" onClick={() => onOpen(featured.id)} className="rounded-3xl bg-black text-left">
          <div className="relative h-44">
            <span className="astro-banner" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
            <div className="absolute bottom-4 left-4">
              <p className="text-xs tracking-widest text-white/70 uppercase">Featured</p>
              <p className="mt-1 text-2xl font-semibold">{featured.title}</p>
            </div>
          </div>
        </button>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        {products.map((product) => (
          <article key={product.id} className="relative rounded-3xl bg-black">
            <button type="button" onClick={() => onOpen(product.id)} className="block w-full text-left">
              <div className="grid h-40 place-items-center">
                <MotionPreview motion={product.motion} title={product.title} />
              </div>
              <p className="flex items-center gap-2 px-3 text-sm font-medium">
                <RarityMark rarity={product.rarity} size={64} />
                {product.title}
              </p>
            </button>
            <div className="flex items-center gap-4 px-3 pb-3">
              <button type="button" className="h-11 text-sm" onClick={() => onGift?.(product)}>
                Gift
              </button>
              <button type="button" className="h-11 text-sm text-white" onClick={() => onBuy(product)}>
                Buy
              </button>
            </div>
            <button
              type="button"
              aria-label={saved.includes(product.id) ? "Remove from wishlist" : "Add to wishlist"}
              aria-pressed={saved.includes(product.id)}
              onClick={() => onSave(product.id)}
              className="absolute top-2 right-2 grid h-11 w-11 place-items-center text-white"
            >
              <Heart on={saved.includes(product.id)} />
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

function ShopDetail({
  product,
  viewer,
  identities,
  opened,
  subscribed,
  owned,
  equipped,
  saved,
  onBack,
  onSave,
  onBuy,
  onGift,
  onEquip,
  onNote,
}: {
  product: ShopProduct;
  viewer: Identity;
  identities: Identity[];
  opened: Record<string, string>;
  subscribed: boolean;
  owned: string[];
  equipped: string | null;
  saved: boolean;
  onBack: () => void;
  onSave: () => void;
  onBuy: (product: ShopProduct, seller: AstroAccount) => string | null;
  onGift?: (product: ShopProduct) => void;
  onEquip: (productId: string) => boolean;
  onNote: (message: string) => void;
}) {
  const seller = identities.find((identity) => identity.id === product.sellerId);
  const sellerAccount = accountFor(product.sellerId, opened);
  const own = product.sellerId === viewer.id;
  const short = viewer.coins < product.price;
  const has = owned.includes(product.id);
  const applied = equipped === product.id;
  const cosmetic = product.kind !== "sticker-pack";
  const buy = () => {
    const error = onBuy(product, sellerAccount);
    onNote(error ?? `Bought ${product.title}. You paid ${formatCoins(product.price)}.`);
  };
  return (
    <div className="grid gap-4">
      <button type="button" onClick={onBack} className="w-fit text-sm text-muted">
        Back
      </button>
      <ProfileWear name={viewer.name} handle={`@${viewer.handle}`} motion={product.motion} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <RarityMark rarity={product.rarity} size={96} />
            {product.title}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {rarityTier(product.rarity).label} · quality {rarityTier(product.rarity).quality[0]}–{rarityTier(product.rarity).quality[1]}
            {product.bundle ? " · bundle" : ""}
          </p>
          <p className="mt-1 text-sm text-muted">{product.detail}</p>
          <p className="mt-2 text-sm text-muted">{sellerAccount.businessName ?? seller?.name}</p>
        </div>
        <button type="button" onClick={onSave} aria-pressed={saved} aria-label="Add to wishlist" className="grid h-11 w-11 place-items-center text-white">
          <Heart on={saved} />
        </button>
      </div>
      <p className="font-mono text-sm">{formatCoins(product.price)} KOBA coins</p>
      <div className="fixed inset-x-0 bottom-16 z-20 flex items-center gap-3 border-t border-white bg-black px-3 py-2 xl:static xl:border-0 xl:px-0">
        <button type="button" onClick={onSave} aria-pressed={saved} aria-label="Add to wishlist" className="grid h-12 w-12 place-items-center text-white">
          <Heart on={saved} />
        </button>
        <button type="button" className="h-12 text-sm" disabled={own} onClick={() => onGift?.(product)}>
          Gift
        </button>
        <Button variant="primary" className="min-w-0 flex-1" disabled={own || short || has} onClick={buy}>
          {has ? "Owned" : own ? "Your listing" : "Buy"}
        </Button>
      </div>
      {cosmetic && has ? (
        <Button
          disabled={!subscribed || applied}
          onClick={() => onNote(onEquip(product.id) ? `${product.title} is applied. Open your profile to see it.` : `Start Astro (${ASTRO_PRICE}) before applying cosmetics.`)}
        >
          {applied ? "Applied" : "Apply"}
        </Button>
      ) : null}
      {!subscribed ? <p className="text-sm text-muted">Buying is open. Applying a cosmetic needs Astro, {ASTRO_PRICE}.</p> : null}
    </div>
  );
}
