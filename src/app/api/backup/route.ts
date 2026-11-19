import { backupToBytes } from "@/lib/backup";
import { dateKey } from "@/lib/dates";

export const dynamic = "force-dynamic";

/** Full backup download. ?files=1 returns a ZIP that also contains attachments and evidence. */
export async function GET(req: Request) {
  const withFiles = new URL(req.url).searchParams.get("files") === "1";
  const { bytes, ext } = await backupToBytes(withFiles);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": ext === "zip" ? "application/zip" : "application/json",
      "Content-Disposition": `attachment; filename="taskpilot-backup-${dateKey(new Date())}.${ext}"`,
      "Cache-Control": "no-store",
    },
  });
}
