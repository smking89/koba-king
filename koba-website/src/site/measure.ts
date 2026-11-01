import { fileType, type MeasuredFile } from "@/site/astro";

function readMedia(file: File, kind: "audio" | "video"): Promise<{ width: number | null; height: number | null; seconds: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const element = document.createElement(kind);
    const finish = (ok: boolean, value?: { width: number | null; height: number | null; seconds: number }) => {
      URL.revokeObjectURL(url);
      element.removeAttribute("src");
      element.load();
      if (ok && value) resolve(value);
      else reject(new Error("unreadable"));
    };
    element.preload = "metadata";
    element.onloadedmetadata = () => {
      const video = element as HTMLVideoElement;
      finish(true, {
        width: kind === "video" ? video.videoWidth : null,
        height: kind === "video" ? video.videoHeight : null,
        seconds: element.duration,
      });
    };
    element.onerror = () => finish(false);
    element.src = url;
  });
}

export async function measureFile(file: File): Promise<MeasuredFile> {
  const type = fileType(file);
  const base: MeasuredFile = { name: file.name, bytes: file.size, width: null, height: null, seconds: null, type };
  if (type.startsWith("audio/")) {
    const media = await readMedia(file, "audio");
    return { ...base, seconds: media.seconds };
  }
  if (type.startsWith("video/")) {
    const media = await readMedia(file, "video");
    return { ...base, width: media.width, height: media.height, seconds: media.seconds };
  }
  if (type.startsWith("image/")) {
    const bitmap = await createImageBitmap(file);
    const width = bitmap.width;
    const height = bitmap.height;
    bitmap.close();
    return { ...base, width, height };
  }
  throw new Error("unsupported");
}
