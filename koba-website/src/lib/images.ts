/**
 * Uploaded profile / clan art arrives as a data URL from the browser's
 * FileReader. Both the client picker and the server functions validate against
 * these rules, so a request can never store anything but a small PNG, JPEG or
 * GIF in an avatar/banner column.
 */
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/gif";
export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/gif"] as const;

/** Raw file size the picker accepts. */
export const IMAGE_MAX_BYTES = 1024 * 1024;

/** Base64 grows by ~4/3; this is the ceiling a stored data URL may reach. */
const MAX_DATA_URL_LENGTH = 1_500_000;
const DATA_URL = /^data:image\/(?:png|jpeg|gif);base64,[A-Za-z0-9+/]+={0,2}$/;

export type ImageCheck = { ok: true; value: string | null } | { ok: false; error: string };

/** Browser-side: turns a picked file into a data URL, rejecting what the server would. */
export function readImageFile(file: File | undefined): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("No file picked."));
    if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
      return reject(new Error("Use a PNG, JPEG or GIF."));
    }
    if (file.size > IMAGE_MAX_BYTES) return reject(new Error("Keep the file under 1 MB."));
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      if (!value) return reject(new Error("That file couldn't be read."));
      resolve(value);
    };
    reader.onerror = () => reject(new Error("That file couldn't be read."));
    reader.readAsDataURL(file);
  });
}

/** null/empty clears the picture; anything else must be a small png/jpeg/gif data URL. */
export function checkImageDataUrl(value: string | null | undefined): ImageCheck {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  const text = String(value);
  if (text.length > MAX_DATA_URL_LENGTH) return { ok: false, error: "That picture is too big. Keep it under 1 MB." };
  if (!DATA_URL.test(text)) return { ok: false, error: "Use a PNG, JPEG or GIF under 1 MB." };
  return { ok: true, value: text };
}
