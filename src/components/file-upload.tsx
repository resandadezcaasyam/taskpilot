"use client";

import { useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/validators";

export const formatBytes = (n?: number | null) => (!n ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);

/** Picks a file and uploads it straight away; failures are shown, never swallowed. */
export function UploadButton({ onUpload, label = "Attach file", accept }: { onUpload: (form: FormData) => Promise<ActionResult<unknown>>; label?: string; accept?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) return void toast.error("The file is larger than 15 MB");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const r = await onUpload(fd);
      if (!r.ok) toast.error(r.error);
      else toast.success(`${file.name} uploaded`);
    } catch {
      toast.error("Could not upload. Is `npm run dev` still running?");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <input ref={ref} type="file" accept={accept} className="sr-only" onChange={pick} aria-label={label} tabIndex={-1} />
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => ref.current?.click()}>
        <Paperclip /> {busy ? "Uploading…" : label}
      </Button>
    </>
  );
}

export function FileChip({ kind, id, name, size, onRemove }: { kind: "evidence" | "attachment" | "issue-update"; id: string; name: string; size?: number | null; onRemove?: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs">
      <Paperclip className="size-3 shrink-0 text-muted-foreground" />
      <a href={`/api/files/${kind}/${id}`} target="_blank" rel="noreferrer" className="truncate hover:text-primary">{name}</a>
      {size ? <span className="text-muted-foreground">{formatBytes(size)}</span> : null}
      {onRemove && (
        <button type="button" aria-label={`Remove ${name}`} onClick={onRemove} className="text-muted-foreground hover:text-destructive"><X className="size-3" /></button>
      )}
    </span>
  );
}
