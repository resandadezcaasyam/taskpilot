import { exportEntity, isExportEntity, type ExportFormat } from "@/lib/export";

export const dynamic = "force-dynamic";

const FORMATS: ExportFormat[] = ["csv", "json", "xlsx"];

/** GET /api/export/<entity>?format=csv|xlsx|json  (entity "all" = complete Excel workbook). */
export async function GET(req: Request, { params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  if (entity !== "all" && !isExportEntity(entity)) return new Response("Unknown export", { status: 404 });
  const wanted = new URL(req.url).searchParams.get("format") ?? (entity === "all" ? "xlsx" : "csv");
  if (!(FORMATS as string[]).includes(wanted)) return new Response("Unknown format. Use csv, xlsx or json.", { status: 400 });
  try {
    const out = await exportEntity(entity, wanted as ExportFormat);
    const body = typeof out.body === "string" ? out.body : new Uint8Array(out.body);
    return new Response(body, {
      headers: { "Content-Type": out.contentType, "Content-Disposition": `attachment; filename="${out.filename}"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Export failed", { status: 400 });
  }
}
