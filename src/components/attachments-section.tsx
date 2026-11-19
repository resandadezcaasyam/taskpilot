"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { FileChip, UploadButton } from "@/components/file-upload";
import { addTaskAttachment, deleteTaskAttachment } from "@/actions/attachments";

export function AttachmentsSection({ taskId, attachments }: { taskId: string; attachments: { id: string; fileName: string; sizeBytes: number | null }[] }) {
  const [pending, start] = useTransition();
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] font-medium">Attachments</p>
        <UploadButton onUpload={(fd) => addTaskAttachment(taskId, fd)} />
      </div>
      {attachments.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No files attached. Files are stored in the local uploads folder.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map((a) => (
            <FileChip key={a.id} kind="attachment" id={a.id} name={a.fileName} size={a.sizeBytes} onRemove={pending ? undefined : () => start(async () => { const r = await deleteTaskAttachment(a.id); if (!r.ok) toast.error(r.error); })} />
          ))}
        </div>
      )}
    </div>
  );
}
