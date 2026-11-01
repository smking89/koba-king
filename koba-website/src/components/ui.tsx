import { cn } from "@/lib/cn";
import { ChevronDown } from "lucide-react";
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

export function Button({
  variant = "ghost",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "quiet" }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-medium transition-[opacity,transform] duration-150 ease-out active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100",
        variant === "primary" && "fire-btn",
        variant === "ghost" && "border border-border bg-bg-subtle text-fg hover:bg-bg-elevated",
        variant === "quiet" && "text-muted hover:text-fg",
        className,
      )}
      {...props}
    />
  );
}

export function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "warn" | "danger" | "ok" | "cyan";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-1 font-mono text-xs",
        tone === "neutral" && "border-border text-muted",
        tone === "warn" && "border-warn/40 text-warn",
        tone === "danger" && "border-danger/40 text-danger",
        tone === "ok" && "border-ok/40 text-ok",
        tone === "cyan" && "border-cyan/40 text-cyan",
      )}
    >
      {children}
    </span>
  );
}

export function Meter({ label, value }: { label: string; value: number }) {
  const width = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        <span className="font-mono">{width}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-bg-subtle">
        <div className="h-1 rounded-full bg-fg" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-bg-elevated p-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function ChoiceSheet({
  label,
  value,
  options,
  onChange,
  radios = false,
}: {
  label: string;
  value: string;
  options: { id: string; label: string; detail?: string }[];
  onChange: (id: string) => void;
  radios?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const current = options.find((option) => option.id === value);
  const picked = radios ? draft : value;
  return (
    <div className="relative">
      <button
        type="button"
        className="flex h-12 items-center gap-2 text-sm"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setDraft(value);
          setOpen(true);
        }}
      >
        <span className="text-muted">{label}</span>
        <span className="font-medium text-fg">{current?.label ?? "Choose"}</span>
        <ChevronDown size={14} aria-hidden className="text-muted" />
      </button>
      {open ? (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-40 bg-scrim/60" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            aria-label={label}
            className="menu-pop fixed inset-x-0 bottom-16 z-50 max-h-[70dvh] overflow-y-auto rounded-2xl border border-border p-1.5 shadow-2xl lg:absolute lg:inset-x-auto lg:bottom-auto lg:left-0 lg:z-50 lg:mt-2 lg:w-72 lg:border"
          >
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={option.id === picked}
                className={`flex min-h-12 w-full items-center gap-3 rounded-xl border-l-2 px-3 py-1.5 text-left transition-colors ${
                  option.id === picked
                    ? "border-fg bg-bg-subtle font-semibold text-fg"
                    : "border-transparent font-normal text-fg/80 hover:bg-bg-subtle hover:text-fg"
                }`}
                onClick={() => {
                  if (radios) {
                    setDraft(option.id);
                    return;
                  }
                  onChange(option.id);
                  setOpen(false);
                }}
              >
                {radios ? (
                  <span className={`h-4 w-4 shrink-0 rounded-full border ${option.id === picked ? "border-fg bg-fg" : "border-border"}`} />
                ) : null}
                <span className="min-w-0">
                  <span className="block text-sm">{option.label}</span>
                  {option.detail ? <span className="mt-0.5 block text-xs font-normal text-muted">{option.detail}</span> : null}
                </span>
              </button>
            ))}
            {radios ? (
              <button
                type="button"
                className="mx-1.5 mt-2 mb-1 h-11 w-[calc(100%-0.75rem)] rounded-xl bg-fg text-sm font-medium text-bg"
                onClick={() => {
                  if (draft) onChange(draft);
                  setOpen(false);
                }}
              >
                Use {options.find((option) => option.id === draft)?.label ?? "this"}
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-4 overflow-x-auto" data-noswipe>
      {options.map((option) => (
        <button key={option.id} type="button" role="tab" aria-selected={value === option.id} onClick={() => onChange(option.id)} className={`h-11 shrink-0 text-sm ${value === option.id ? "font-medium text-fg" : "text-muted"}`}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

// Above this many options a horizontally-scrolling chip row reads as "cut
// off" rather than "scrollable" - there's no visible affordance that more
// options exist past the edge on desktop (no touch swipe hint, no fade,
// no arrows). A real dropdown doesn't have that problem, so a long option
// list (the Game filter, once every supported game is listed) renders as
// a <select> instead; a short one (Region, Style) keeps the chip row,
// which reads fine and shows every option at a glance.
const CHIP_ROW_DROPDOWN_THRESHOLD = 8;

export function ChipRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  if (options.length > CHIP_ROW_DROPDOWN_THRESHOLD) {
    return (
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-10 shrink-0 rounded-full border border-border bg-bg-elevated px-3 text-sm text-fg outline-none"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <div role="listbox" aria-label={label} className="flex gap-2 overflow-x-auto" data-noswipe>
      {options.map((option) => (
        <button key={option.id} type="button" role="option" aria-selected={value === option.id} onClick={() => onChange(option.id)} className={`h-10 shrink-0 rounded-full px-3 text-sm ${value === option.id ? "bg-accent text-bg" : "text-muted"}`}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex min-h-12 w-full items-center gap-3 text-left text-sm">
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-fg" : "bg-bg-subtle"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-bg shadow-sm ${on ? "left-5" : "left-0.5"}`} />
      </span>
      <span>{label}</span>
    </button>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirm,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  confirm: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-scrim/70 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-sm rounded-2xl border border-border bg-bg-elevated p-5">
        <h2 id="confirm-title" className="text-lg">{title}</h2>
        <p className="mt-2 text-sm text-muted">{body}</p>
        <div className="mt-4 flex gap-3">
          <button type="button" className="h-12 flex-1 text-sm text-muted" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="h-12 flex-1 rounded-xl bg-fg text-sm font-medium text-bg" onClick={onConfirm}>
            {confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FadeNote({ text }: { text: string }) {
  const [shown, setShown] = useState(text);
  useEffect(() => {
    if (!text) return;
    setShown(text);
    const timer = window.setTimeout(() => setShown(""), 2400);
    return () => window.clearTimeout(timer);
  }, [text]);
  if (!shown) return null;
  return (
    <p className="text-sm" role="status">
      {shown}
    </p>
  );
}
