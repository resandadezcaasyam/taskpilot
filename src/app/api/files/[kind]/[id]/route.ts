import fs from "node:fs/promises";
import { db } from "@/lib/db";
import { resolveStored } from "@/lib/files";

export const dynamic = "force-dynamic";

// Only these are shown in the browser; anything else (html, svg, ...) is always downloaded.
const INLINE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);

async function lookup(kind: string, id: string) {
  if (kind === "evidence") return db.uatEvidence.findUnique({ where: { id } });
  if (kind === "attachment") return db.taskAttachment.findUnique({ where: { id } });
  if (kind === "issue-update") return db.issueUpdate.findUnique({ where: { id } });
  return null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  const row = await lookup(kind, id);
  if (!row || !row.filePath) return new Response("Not found", { status: 404 });
  try {
    const buf = await fs.readFile(resolveStored(row.filePath));
    const mime = row.mimeType ?? "application/octet-stream";
    const inline = INLINE.has(mime);
    const name = encodeURIComponent(row.fileName ?? "file");
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": inline ? mime : "application/octet-stream",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch {
    return new Response("The file is missing from the uploads folder", { status: 404 });
  }
}
