import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { IMAGE_ACCEPT, readImageFile } from "@/lib/images";

/**
 * Avatar / banner upload control. Picks a PNG, JPEG or GIF, checks it on the
 * device, and hands the caller a data URL to save. The server re-checks the
 * same rules, so this is convenience rather than the security boundary.
 */
export function ImagePicker({
  label,
  value,
  onChange,
  shape = "circle",
  hint,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  shape?: "circle" | "wide";
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  const read = (file: File | undefined) => {
    if (!file) return;
    readImageFile(file)
      .then((value) => {
        setError("");
        onChange(value);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "That file couldn't be read."));
  };

  return (
    <div className="grid gap-2">
      <span className="text-xs text-muted">{label}</span>
      <div className="flex items-center gap-3">
        <span
          className={`grid shrink-0 place-items-center overflow-hidden border border-border bg-bg-subtle text-faint ${
            shape === "circle" ? "h-16 w-16 rounded-full" : "h-16 w-28 rounded-xl"
          }`}
        >
          {value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus size={18} aria-hidden />
          )}
        </span>
        <div className="grid gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="h-9 rounded-full border border-border px-3 text-xs font-medium hover:bg-bg-subtle"
            >
              {value ? "Replace" : "Upload"}
            </button>
            {value ? (
              <button
                type="button"
                onClick={() => {
                  setError("");
                  onChange(null);
                }}
                className="inline-flex h-9 items-center gap-1 rounded-full px-2 text-xs text-muted hover:text-fg"
              >
                <Trash2 size={13} aria-hidden /> Remove
              </button>
            ) : null}
          </div>
          <span className="text-[11px] text-faint">{hint ?? "PNG, JPEG or GIF · up to 1 MB"}</span>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        className="sr-only"
        aria-label={label}
        onChange={(event) => {
          read(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {error ? <span className="text-[11px] text-danger">{error}</span> : null}
    </div>
  );
}
