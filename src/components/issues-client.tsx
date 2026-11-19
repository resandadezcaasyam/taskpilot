"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ArrowUpCircle, CheckCircle2, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, Textarea, Input } from "@/components/ui/form-controls";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EscalateDialog, IssueFormDialog, ResolveDialog, type IssueLike } from "@/components/issue-dialogs";
import { postIssueUpdate, deleteIssue, setIssueStatus } from "@/actions/issues";
import { ISSUE_STATUSES } from "@/lib/issues";
import type { ActionResult } from "@/lib/validators";

const OFFLINE = "Could not reach the local server. Is `npm run dev` still running?";

export function NewIssueButton({ projects }: { projects: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus /> Report issue</Button>
      <IssueFormDialog open={open} onOpenChange={setOpen} projects={projects} />
    </>
  );
}

export function IssueDetailActions({
  issue, status, projects, followUpDefault,
}: { issue: IssueLike; status: string; projects: { id: string; name: string }[]; followUpDefault: string }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [esc, setEsc] = useState(false);
  const [resolve, setResolve] = useState(false);
  const [del, setDel] = useState(false);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult<unknown>>, ok: string, after?: () => void) =>
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) toast.error(r.error);
        else {
          toast.success(ok);
          after?.();
        }
      } catch {
        toast.error(OFFLINE);
      }
    });
  const open = status !== "Resolved" && status !== "Closed";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Issue status" value={status} disabled={pending} onChange={(e) => run(() => setIssueStatus(issue.id, e.target.value), "Status updated")} className="h-9 w-48">
          {ISSUE_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </Select>
        {open && <Button variant="outline" onClick={() => setEsc(true)}><ArrowUpCircle /> Escalate</Button>}
        {open && <Button variant="outline" onClick={() => setResolve(true)}><CheckCircle2 /> Record fix</Button>}
        {status === "Resolved" && <Button variant="outline" disabled={pending} onClick={() => run(() => setIssueStatus(issue.id, "Closed"), "Issue closed")}>Close issue</Button>}
        <Button variant="outline" onClick={() => setEdit(true)}><Pencil /> Edit</Button>
        <Button variant="outline" onClick={() => setDel(true)}><Trash2 /> Delete</Button>
      </div>
      <IssueFormDialog open={edit} onOpenChange={setEdit} projects={projects} issue={issue} />
      <EscalateDialog open={esc} onOpenChange={setEsc} issueId={issue.id} currentPic={issue.responsiblePic ?? ""} followUpDefault={followUpDefault} />
      <ResolveDialog open={resolve} onOpenChange={setResolve} issueId={issue.id} rootCause={issue.rootCause ?? ""} />
      <ConfirmDialog
        open={del} onOpenChange={setDel} title="Delete this issue?" description="The issue, its update history and attachments will be permanently removed." pending={pending}
        onConfirm={() => run(() => deleteIssue(issue.id), "Issue deleted", () => router.push("/issues"))}
      />
    </div>
  );
}

export function UpdateComposer({ issueId }: { issueId: string }) {
  const [message, setMessage] = useState("");
  const [date, setDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return void toast.error("Write the update first");
    if (file && file.size > 15 * 1024 * 1024) return void toast.error("The file is larger than 15 MB");
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set("message", message);
      fd.set("nextFollowUp", date);
      if (file) fd.set("file", file);
      const r = await postIssueUpdate(issueId, fd);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Update posted");
      setMessage("");
      setDate("");
      setFile(null);
    } catch {
      toast.error(OFFLINE);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="space-y-3">
        <label htmlFor="issue-update" className="text-sm font-medium">Post an update</label>
        <Textarea id="issue-update" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Latest findings, what engineering said, what you tried…" />
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" className="sr-only" tabIndex={-1} aria-label="Screenshot or file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Paperclip /> {file ? file.name : "Attach screenshot"}</Button>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">Next follow-up<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-40" /></label>
          <Button type="submit" size="sm" className="ml-auto" disabled={saving || !message.trim()}>{saving ? "Posting…" : "Post update"}</Button>
        </div>
      </form>
    </Card>
  );
}
