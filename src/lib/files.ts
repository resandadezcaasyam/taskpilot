import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/** Local file storage for evidence and attachments. Lives under ./uploads, never under .next or temp folders. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export function uploadsRoot(): string {
  const dir = process.env.UPLOADS_DIR ?? "./uploads";
  return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
}

export function safeName(name: string): string {
  const base = path.basename(name).replace(/[^\w.\- ()]+/g, "_").slice(0, 120);
  return base || "file";
}

export interface StoredFile {
  fileName: string;
  filePath: string; // relative to the uploads root, forward slashes
  mimeType: string | null;
  sizeBytes: number;
}

export function readFileFromForm(form: FormData, field = "file"): File | null {
  const v = form.get(field);
  if (!v || typeof v === "string") return null;
  const f = v as File;
  return f.size > 0 ? f : null;
}

export async function saveUpload(subdir: string, file: File): Promise<StoredFile> {
  if (file.size === 0) throw new Error("The file is empty");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("The file is larger than 15 MB");
  const name = safeName(file.name);
  const rel = `${subdir}/${crypto.randomUUID()}-${name}`;
  const abs = resolveStored(rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, Buffer.from(await file.arrayBuffer()));
  return { fileName: name, filePath: rel, mimeType: file.type || null, sizeBytes: file.size };
}

/** Resolves a stored relative path and refuses anything that escapes the uploads folder. */
export function resolveStored(rel: string): string {
  const root = uploadsRoot();
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error("Invalid file path");
  return abs;
}

export async function removeStored(rel: string | null | undefined): Promise<void> {
  if (!rel) return;
  try {
    await fs.unlink(resolveStored(rel));
  } catch {
    // already gone: nothing to clean up
  }
}
