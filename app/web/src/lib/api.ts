import { hc } from "hono/client";
import type { AppType } from "@server/app";

/** Typed client for the server's routes (paths, bodies and responses come from the server code). */
export const api = hc<AppType>("/", { headers: { "x-app": "1" } }).api;

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
type Success<R> = R extends { ok: true; json(): Promise<infer T> } ? T : never;

/** Awaits a response; throws ApiError (with the server's message) unless it succeeded. */
export async function ok<R extends Response>(p: Promise<R>): Promise<Success<R>> {
  const res = await p;
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.clone().json() as { error?: unknown }; if (typeof j.error === "string") msg = j.error; } catch { /* not JSON */ }
    throw new ApiError(res.status, res.status === 403 ? "Kamu tidak punya izin untuk perubahan ini." : msg || "Permintaan gagal");
  }
  return res.json() as Promise<Success<R>>;
}

const fail = async (res: Response, fallback: string) =>
  new ApiError(res.status, ((await res.json().catch(() => ({}))) as { error?: string }).error ?? fallback);

/** Multipart upload (photo proof); the typed client does not model File parts well, so this one is plain fetch. */
export async function upload(path: string, form: FormData) {
  const res = await fetch(path, { method: "POST", body: form, headers: { "x-app": "1" } });
  if (!res.ok) throw await fail(res, "Gagal mengunggah");
}
export async function putImage(path: string, blob: Blob) {
  const res = await fetch(path, { method: "PUT", body: blob, headers: { "x-app": "1", "content-type": "image/jpeg" } });
  if (!res.ok) throw await fail(res, "Gagal mengunggah foto");
}
