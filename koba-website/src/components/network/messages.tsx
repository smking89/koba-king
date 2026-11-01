import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Bookmark, Camera, ChevronLeft, Film, Image as ImageIcon, MapPin, Pencil, Plus, Search, Sticker as StickerIcon, X } from "lucide-react";
import { BadgeRow } from "@/components/network/badges";
import { NAME_VERIFIED } from "@/site/badges";
import { useResolvedBadges } from "@/components/network/badge-state";
import { PlayerFace } from "@/components/network/shared";
import type { Identity } from "@/platform/engine";
import { useCommunity, type DirectMessage } from "@/site/community";
import { klipyConfigured, klipySearchGifs, klipySearchStickers, klipyTrendingGifs, klipyTrendingStickers, type KlipyItem } from "@/site/klipy";
import { loadMyThreads, openThread as openThreadReal, sendDirect as sendDirectReal } from "@/lib/messaging/api";

const EFFECTS = ["None", "Night", "Heat", "Mono"];

type Sheet = "plus" | "stickers" | "gifs" | "camera" | "draw" | "saved" | null;

/** Live Klipy search/trending grid, shared by the Stickers and GIFs sheets. */
function KlipyGrid({ mode, query, onPick }: { mode: "stickers" | "gifs"; query: string; onPick: (item: KlipyItem) => void }) {
  const [items, setItems] = useState<KlipyItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!klipyConfigured()) return;
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      const fetcher = query.trim()
        ? mode === "stickers" ? klipySearchStickers(query) : klipySearchGifs(query)
        : mode === "stickers" ? klipyTrendingStickers() : klipyTrendingGifs();
      fetcher.then((result) => {
        if (!cancelled) {
          setItems(result);
          setLoading(false);
        }
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mode, query]);

  if (!klipyConfigured()) return <p className="text-sm text-muted">Klipy isn't configured on this build yet.</p>;
  if (loading && items.length === 0) return <p className="text-sm text-muted">Loading…</p>;
  if (items.length === 0) return <p className="text-sm text-muted">{query.trim() ? "No results." : "Nothing trending right now."}</p>;

  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map((item) => (
        <button key={item.id} type="button" onClick={() => onPick(item)} aria-label={`Send ${item.title}`}>
          <img src={item.previewUrl} alt={item.title} className="h-16 w-16 rounded-2xl object-cover" loading="lazy" />
        </button>
      ))}
    </div>
  );
}

function ago(at?: number) {
  if (!at) return "Earlier";
  const mins = Math.max(1, Math.round((Date.now() - at) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return "Yesterday";
}

function StickerTile({ name, url }: { name: string; url?: string }) {
  if (url) return <img src={url} alt={name} className="h-16 w-16 rounded-2xl object-contain" loading="lazy" />;
  return (
    <span className="grid h-16 w-16 place-items-center rounded-2xl bg-bg text-center text-[10px] font-medium tracking-wide uppercase">
      {name}
    </span>
  );
}

export function MessagesPage({
  viewer,
  identities,
}: {
  viewer: Identity;
  identities: Identity[];
}) {
  const directs = useCommunity((s) => s.directs);
  const activeThread = useCommunity((s) => s.activeThread);
  const setActiveThread = useCommunity((s) => s.setActiveThread);
  const sendDirectLocal = useCommunity((s) => s.sendDirect);
  const hydrateDirects = useCommunity((s) => s.hydrateDirects);
  const [text, setText] = useState("");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [query, setQuery] = useState("");
  const [box, setBox] = useState<"inbox" | "requests">("inbox");
  const [focus, setFocus] = useState(false);
  const [note, setNote] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [compose, setCompose] = useState(false);
  const [stickerQuery, setStickerQuery] = useState("");
  const [gifQuery, setGifQuery] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [effect, setEffect] = useState("None");
  const [caption, setCaption] = useState("");
  // Was "callNote" when it also carried voice/video call status text; now
  // just a generic transient composer notice (e.g. a failed gift purchase).
  const [callNote, setCallNote] = useState("");
  const badgeMap = useResolvedBadges(identities);

  const mine = directs.filter((thread) => thread.a === viewer.id || thread.b === viewer.id);
  const thread = mine.find((item) => item.id === activeThread) ?? null;
  const others = identities.filter((identity) => identity.id !== viewer.id);
  const nameFor = (id: string) => identities.find((identity) => identity.id === id)?.name ?? id;
  const handleFor = (id: string) => identities.find((identity) => identity.id === id)?.handle ?? id;
  const otherId = thread ? (thread.a === viewer.id ? thread.b : thread.a) : "";
  const threaded = new Set(mine.flatMap((item) => [item.a, item.b]));
  const requests = others.filter((identity) => !threaded.has(identity.id));
  const needle = query.trim().toLowerCase();
  const rows = mine.filter((item) => nameFor(item.a === viewer.id ? item.b : item.a).toLowerCase().includes(needle));

  useEffect(() => {
    let cancelled = false;
    loadMyThreads().then((threads) => {
      if (!cancelled) hydrateDirects(threads);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrateDirects]);

  const send = (body: string, sticker?: { name: string; packTitle: string; url?: string }, extra?: { kind?: DirectMessage["kind"]; payload?: string }) => {
    if (!thread) return;
    sendDirectLocal(thread.id, viewer.id, body, sticker, extra);
    setText("");
    setSheet(null);
    setCallNote("");
    void sendDirectReal({ data: { threadId: thread.id, text: body, sticker: sticker ? { name: sticker.name, packTitle: sticker.packTitle } : undefined, kind: extra?.kind, payload: extra?.payload ?? sticker?.url } });
  };

  const open = async (id: string) => {
    const existing = directs.find((item) => (item.a === viewer.id && item.b === id) || (item.b === viewer.id && item.a === id));
    if (existing) {
      setActiveThread(existing.id);
      setFocus(true);
      setCompose(false);
      setSheet(null);
      return;
    }
    const result = await openThreadReal({ data: { otherId: id } });
    if (!result.ok) {
      setCallNote(result.reason);
      return;
    }
    hydrateDirects([...directs, { id: result.threadId, a: viewer.id, b: id, messages: [] }]);
    setActiveThread(result.threadId);
    setFocus(true);
    setCompose(false);
    setSheet(null);
  };

  return (
    <div className="grid min-h-[70dvh] min-w-0 gap-3 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <section className={`${focus ? "hidden lg:grid" : "grid"} content-start gap-3`}>
        <div className="flex items-center gap-3">
          <h1 className="text-xl">Messages</h1>
          <button type="button" aria-label="New message" aria-expanded={compose} className="ml-auto grid h-10 w-10 place-items-center rounded-full bg-fg text-bg" onClick={() => setCompose((open) => !open)}>
            <Plus size={18} />
          </button>
        </div>
        <label className="flex h-10 items-center gap-2 rounded-full bg-bg-subtle px-3">
          <Search size={16} className="shrink-0 text-muted" aria-hidden />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" aria-label="Search messages" className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none sm:text-sm" />
        </label>
        <div className="flex gap-3 overflow-x-auto" data-noswipe>
          <button type="button" className="w-16 shrink-0 text-center" onClick={() => setEditingNote(true)}>
            <PlayerFace name={viewer.name} id={viewer.id} avatarUrl={viewer.avatarUrl} />
            <span className="mt-1 block truncate text-xs text-muted">Your note</span>
          </button>
          {others.slice(0, 6).map((identity) => (
            <button key={identity.id} type="button" className="w-16 shrink-0 text-center" onClick={() => open(identity.id)}>
              <PlayerFace name={identity.name} id={identity.id} avatarUrl={identity.avatarUrl} />
              <span className="mt-1 block truncate text-xs text-muted">{identity.name.split(" ")[0]}</span>
            </button>
          ))}
        </div>
        {editingNote ? (
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setEditingNote(false);
            }}
          >
            <input value={note} onChange={(event) => setNote(event.target.value)} aria-label="Your note" className="h-10 min-w-0 flex-1 rounded-full bg-bg-subtle px-3 text-base outline-none sm:text-sm" />
            <button type="submit" aria-label="Save note" className="grid h-10 w-10 place-items-center rounded-full bg-fg text-bg"><Plus size={16} /></button>
          </form>
        ) : (
          <p className="text-xs text-muted">{note}</p>
        )}
        <div className="flex gap-4">
          <button type="button" className={`h-10 text-sm ${box === "inbox" ? "border-b border-fg" : "text-muted"}`} onClick={() => setBox("inbox")}>Messages</button>
          <button type="button" className={`h-10 text-sm ${box === "requests" ? "border-b border-fg" : "text-muted"}`} onClick={() => setBox("requests")}>Requests</button>
        </div>
        {box === "inbox" ? (
          <ul>
            {rows.map((item) => {
              const other = item.a === viewer.id ? item.b : item.a;
              const last = item.messages[item.messages.length - 1];
              return (
                <li key={item.id}>
                  <button type="button" onClick={() => { setActiveThread(item.id); setFocus(true); }} className="flex w-full items-center gap-3 py-3 text-left">
                    <PlayerFace name={nameFor(other)} id={other} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{nameFor(other)}</span>
                      <span className="flex items-center gap-1 truncate text-xs text-muted">
                        @{handleFor(other)}
                        <BadgeRow pins={badgeMap[other]?.verified ? [NAME_VERIFIED] : []} size={14} />
                      </span>
                      <span className="block truncate text-xs text-muted">{last ? last.text || last.sticker || last.kind : "No messages yet"} · {ago(last?.at)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
            {rows.length === 0 ? (
              <li className="py-4">
                <p className="text-sm text-muted">{query ? "No conversations match that search." : "No conversations yet."}</p>
                {!query ? (
                  <button type="button" onClick={() => setCompose(true)} className="mt-3 h-11 rounded-full bg-fg px-4 text-sm font-semibold text-bg">
                    Start a message
                  </button>
                ) : null}
              </li>
            ) : null}
          </ul>
        ) : (
          <ul>
            {requests.map((identity) => (
              <li key={identity.id}>
                <button type="button" onClick={() => open(identity.id)} className="flex w-full items-center gap-3 py-3 text-left">
                  <PlayerFace name={identity.name} id={identity.id} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{identity.name}</span>
                    <span className="block text-xs text-muted">Wants to message you</span>
                  </span>
                </button>
              </li>
            ))}
            {requests.length === 0 ? <li className="py-4 text-sm text-muted">No requests. New conversations show up here first.</li> : null}
          </ul>
        )}
        {compose ? (
          <div className="rounded-3xl bg-bg-subtle p-3">
            <p className="text-sm">New message</p>
            <ul className="mt-2">
              {others.map((identity) => (
                <li key={identity.id}>
                  <button type="button" className="flex min-h-11 w-full items-center gap-3 text-left text-sm" onClick={() => open(identity.id)}>
                    <PlayerFace name={identity.name} id={identity.id} size="sm" />
                    {identity.name}
                  </button>
                </li>
              ))}
            </ul>
            {others.length === 0 ? <p className="mt-2 text-sm text-muted">No one else is here yet. Players show up once they join.</p> : null}
          </div>
        ) : null}
      </section>

      <section className={`relative flex min-h-[70dvh] min-w-0 flex-col bg-bg ${focus ? "" : "hidden lg:flex"}`}>
        {thread ? (
          <>
            <header className="flex items-center gap-2 px-2 py-2">
              <button type="button" aria-label="Back" className="grid h-10 w-10 place-items-center lg:hidden" onClick={() => setFocus(false)}>
                <ChevronLeft size={20} />
              </button>
              <PlayerFace name={nameFor(otherId)} id={otherId} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 truncate text-sm">
                  {nameFor(otherId)}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted">
                  @{handleFor(otherId)}
                  <BadgeRow pins={badgeMap[otherId]?.verified ? [NAME_VERIFIED] : []} size={14} />
                </span>
              </span>
              {/* Voice/video calls disabled for now - comes later as the platform grows. */}
            </header>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
              {thread.messages.map((message) => {
                const mine = message.authorId === viewer.id;
                const bareMedia = (message.kind === "sticker" || message.kind === "gif") && !message.text;
                return (
                  <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={bareMedia ? "max-w-[80%]" : `max-w-[80%] rounded-3xl px-3 py-2 text-sm ${mine ? "rounded-br-md bg-fg text-bg" : "rounded-bl-md bg-bg-subtle"}`}>
                      {message.kind === "draw" && message.payload ? <img src={message.payload} alt="Drawing" className="mb-1 max-h-32 rounded-2xl" /> : null}
                      {message.kind === "photo" ? <span className="mb-1 block rounded-2xl bg-bg/20 px-2 py-6 text-center text-xs">Photo · {effect}</span> : null}
                      {message.kind === "location" ? <span className="mb-1 flex items-center gap-1 text-xs"><MapPin size={12} /> Pinned spot</span> : null}
                      {message.kind === "gif" && message.payload ? <img src={message.payload} alt={message.text || "GIF"} className="mb-1 max-h-40 rounded-2xl" /> : null}
                      {message.sticker ? <StickerTile name={message.sticker} url={message.kind === "sticker" ? message.payload : undefined} /> : null}
                      {message.kind === "gift" ? <p className="font-medium">{message.text}</p> : null}
                      {message.text && message.kind !== "gif" && message.kind !== "gift" ? <p>{message.text}</p> : null}
                    </div>
                  </div>
                );
              })}
              {callNote ? <p className="text-center text-xs text-muted">{callNote}</p> : null}
            </div>
            <form
              className="flex items-center gap-2 px-3 py-2"
              onSubmit={(event) => {
                event.preventDefault();
                send(text);
              }}
            >
              <button type="button" aria-label="Camera" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fg text-bg" onClick={() => setSheet("camera")}>
                <Camera size={18} />
              </button>
              <div className="flex min-w-0 flex-1 items-center rounded-full bg-bg-subtle px-3">
                <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Message" className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none sm:text-sm" />
                <button type="button" aria-label="Photo" className="grid h-9 w-9 place-items-center text-muted" onClick={() => setSheet("camera")}>
                  <ImageIcon size={18} />
                </button>
                <button type="button" aria-label="Stickers" className="grid h-9 w-9 place-items-center text-muted" onClick={() => setSheet("stickers")}>
                  <StickerIcon size={18} />
                </button>
                <button type="button" aria-label="GIFs" className="grid h-9 w-9 place-items-center text-muted" onClick={() => setSheet("gifs")}>
                  <Film size={18} />
                </button>
              </div>
              <button type="button" aria-label="More" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted" onClick={() => setSheet(sheet === "plus" ? null : "plus")}>
                {sheet === "plus" ? <X size={18} /> : <Plus size={18} />}
              </button>
            </form>
            {sheet ? (
              <>
              <button type="button" aria-label="Close" className="absolute inset-0 z-30 bg-black/70" onClick={() => setSheet(null)} />
              <div className="absolute inset-x-0 bottom-16 z-40 max-h-[60dvh] overflow-y-auto rounded-t-3xl border-t border-border bg-bg-elevated p-3 lg:bottom-0 xl:rounded-none" data-noswipe>
                {sheet === "plus" ? (
                  <ul className="grid gap-1">
                    <li><button type="button" className="flex min-h-11 w-full items-center gap-3 text-sm" onClick={() => setSheet("saved")}><Bookmark size={18} /> Saved</button></li>
                    <li><button type="button" className="flex min-h-11 w-full items-center gap-3 text-sm" onClick={() => send("Pinned location", undefined, { kind: "location" })}><MapPin size={18} /> Location</button></li>
                    <li><button type="button" className="flex min-h-11 w-full items-center gap-3 text-sm" onClick={() => setSheet("stickers")}><StickerIcon size={18} /> Stickers</button></li>
                    <li><button type="button" className="flex min-h-11 w-full items-center gap-3 text-sm" onClick={() => setSheet("gifs")}><Film size={18} /> GIFs</button></li>
                    <li><button type="button" className="flex min-h-11 w-full items-center gap-3 text-sm" onClick={() => setSheet("draw")}><Pencil size={18} /> Draw</button></li>
                  </ul>
                ) : null}
                {sheet === "saved" ? (
                  <div>
                    <p className="text-sm">Saved</p>
                    {saved.length === 0 ? <p className="mt-3 text-sm text-muted">When you save an effect, it shows up here.</p> : null}
                    <ul className="mt-2">
                      {saved.map((item) => (
                        <li key={item}><button type="button" className="min-h-11 text-sm" onClick={() => { setEffect(item); setSheet("camera"); }}>{item}</button></li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {sheet === "stickers" ? (
                  <div className="grid gap-3">
                    <label className="flex h-10 items-center gap-2 rounded-full bg-bg px-3">
                      <Search size={16} className="shrink-0 text-muted" aria-hidden />
                      <input value={stickerQuery} onChange={(event) => setStickerQuery(event.target.value)} placeholder="Search stickers" aria-label="Search stickers" className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none sm:text-sm" />
                    </label>
                    <KlipyGrid
                      mode="stickers"
                      query={stickerQuery}
                      onPick={(item) => send("", { name: item.title, packTitle: "Klipy", url: item.fullUrl }, { kind: "sticker" })}
                    />
                  </div>
                ) : null}
                {sheet === "gifs" ? (
                  <div className="grid gap-3">
                    <label className="flex h-10 items-center gap-2 rounded-full bg-bg px-3">
                      <Search size={16} className="shrink-0 text-muted" aria-hidden />
                      <input value={gifQuery} onChange={(event) => setGifQuery(event.target.value)} placeholder="Search GIFs" aria-label="Search GIFs" className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none sm:text-sm" />
                    </label>
                    <KlipyGrid mode="gifs" query={gifQuery} onPick={(item) => send(item.title, undefined, { kind: "gif", payload: item.fullUrl })} />
                  </div>
                ) : null}
                {sheet === "camera" ? (
                  <CameraSheet
                    effect={effect}
                    caption={caption}
                    saved={saved}
                    onEffect={setEffect}
                    onCaption={setCaption}
                    onSave={(name) => setSaved((current) => (current.includes(name) ? current : [...current, name]))}
                    onSend={() => send(caption || "Photo", undefined, { kind: "photo", payload: effect })}
                    onClose={() => setSheet(null)}
                  />
                ) : null}
                {sheet === "draw" ? <DrawSheet onSend={(url) => send("Sketch", undefined, { kind: "draw", payload: url })} /> : null}
              </div>
              </>
            ) : null}
          </>
        ) : (
          <p className="p-4 text-sm text-muted">{callNote || "Pick a message."}</p>
        )}
      </section>
    </div>
  );
}

function CameraSheet({
  effect,
  caption,
  saved,
  onEffect,
  onCaption,
  onSave,
  onSend,
  onClose,
}: {
  effect: string;
  caption: string;
  saved: string[];
  onEffect: (effect: string) => void;
  onCaption: (caption: string) => void;
  onSave: (name: string) => void;
  onSend: () => void;
  onClose: () => void;
}) {
  const filter = effect === "Night" ? "brightness(0.45)" : effect === "Heat" ? "sepia(0.8)" : effect === "Mono" ? "grayscale(1)" : "none";
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm">Camera</p>
        <button type="button" aria-label="Close" className="grid h-9 w-9 place-items-center text-muted" onClick={onClose}><X size={18} /></button>
      </div>
      <div className="grid h-40 place-items-center rounded-3xl bg-bg text-sm" style={{ filter }}>{caption || "Tap to add text"}</div>
      <input value={caption} onChange={(event) => onCaption(event.target.value)} placeholder="Text" className="h-10 rounded-full bg-bg px-3 text-sm" />
      <div className="flex flex-wrap gap-2">
        {EFFECTS.map((item) => (
          <button key={item} type="button" className={`h-9 rounded-full px-3 text-xs ${effect === item ? "bg-fg text-bg" : "bg-bg text-muted"}`} onClick={() => onEffect(item)}>{item}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <button type="button" className="h-10 rounded-full bg-bg px-3 text-sm" disabled={saved.includes(effect) || effect === "None"} onClick={() => onSave(effect)}>Save effect</button>
        <button type="button" className="h-10 rounded-full bg-fg px-3 text-sm text-bg" onClick={onSend}>Send</button>
      </div>
    </div>
  );
}

function DrawSheet({ onSend }: { onSend: (url: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
  }, []);

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = ref.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * canvas.width, y: ((event.clientY - rect.top) / rect.height) * canvas.height };
  };

  return (
    <div className="grid gap-2">
      <p className="text-sm">Draw on the message</p>
      <canvas
        ref={ref}
        width={320}
        height={160}
        className="h-40 w-full touch-none rounded-3xl"
        onPointerDown={(event) => {
          drawing.current = true;
          const ctx = ref.current?.getContext("2d");
          const p = point(event);
          ctx?.beginPath();
          ctx?.moveTo(p.x, p.y);
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return;
          const ctx = ref.current?.getContext("2d");
          const p = point(event);
          ctx?.lineTo(p.x, p.y);
          ctx?.stroke();
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
      />
      <button type="button" className="h-10 bg-fg text-sm text-bg" onClick={() => onSend(ref.current?.toDataURL("image/png") ?? "")}>
        Send drawing
      </button>
    </div>
  );
}
