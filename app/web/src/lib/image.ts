async function load(file: Blob) {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  } finally { URL.revokeObjectURL(url); }
}
const toBlob = (c: HTMLCanvasElement, q: number) => new Promise<Blob>((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error("no blob")), "image/jpeg", q));

/** Downscale a photo to JPEG (proof photos: max side `maxDim`). */
export async function shrink(file: Blob, maxDim: number, quality: number) {
  const img = await load(file);
  const sc = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return toBlob(c, quality);
}
/** Centre-crop to a 256px square JPEG (profile photos). */
export async function squarePhoto(file: Blob) {
  const img = await load(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight), out = 256;
  const c = document.createElement("canvas"); c.width = c.height = out;
  c.getContext("2d")!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
  return toBlob(c, 0.8);
}
