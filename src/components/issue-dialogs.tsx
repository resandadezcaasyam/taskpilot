"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { createIssue, escalateIssue, resolveIssue, updateIssue } from "@/actions/issues";
import { dateKey, toInputDate } from "@/lib/dates";
import { ISSUE_CATEGORIES, ISSUE_SEVERITIES } from "@/lib/issues";
import { issueFormSchema, type IssueFormValues } from "@/lib/validators";

export interface IssueLike {
  id: string; title: string; description: string | null; projectId: string | null; category: string | null; severity: string;
  reportedBy: string | null; responsiblePic: string | null; reportedDate: Date; rootCause: string | null; impact: string | null;
  workaround: string | null; expectedResolution: Date | null; nextFollowUpDate: Date | null;
}

const EMPTY = (): IssueFormValues => ({
  title: "", description: "", projectId: "", category: "Bug", severity: "Medium", reportedBy: "", responsiblePic: "",
  reportedDate: dateKey(new Date()), rootCause: "", impact: "", workaround: "", expectedResolution: "", nextFollowUpDate: "",
});
const toForm = (i: IssueLike): IssueFormValues => ({
  title: i.title, description: i.description ?? "", projectId: i.projectId ?? "",
  category: ((ISSUE_CATEGORIES as readonly string[]).includes(i.category ?? "") ? i.category : "Other") as IssueFormValues["category"],
  severity: i.severity as IssueFormValues["severity"], reportedBy: i.reportedBy ?? "", responsiblePic: i.responsiblePic ?? "",
  reportedDate: toInputDate(i.reportedDate), rootCause: i.rootCause ?? "", impact: i.impact ?? "", workaround: i.workaround ?? "",
  expectedResolution: toInputDate(i.expectedResolution), nextFollowUpDate: toInputDate(i.nextFollowUpDate),
});

export function IssueFormDialog({
  open, onOpenChange, projects, issue,
}: { open: boolean; onOpenChange: (o: boolean) => void; projects: { id: string; name: string }[]; issue?: IssueLike | null }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<IssueFormValues>({ resolver: zodResolver(issueFormSchema), defaultValues: EMPTY() });
  useEffect(() => {
    if (open) reset(issue ? toForm(issue) : EMPTY());
  }, [open, issue, reset]);

  async function onSubmit(v: IssueFormValues) {
    setSaving(true);
    try {
      const r = issue ? await updateIssue(issue.id, v) : await createIssue(v);
      if (!r.ok) return void toast.error(r.error);
      onOpenChange(false);
      toast.success(issue ? "Issue saved" : "Issue reported");
      if (!issue) router.push(`/issues/${(r as { data: { id: string } }).data.id}`);
    } catch {
      toast.error("Could not reach the local server. Is `npm run dev` still running?");
    } finally {
      setSaving(false);
    }
  }
  const err = (k: keyof IssueFormValues) => errors[k]?.message as string | undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={issue ? "Edit issue" : "Report an issue"} description={issue ? undefined : "Status starts as Reported. Escalate it later from the issue page."}>
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <div className="grid gap-4 overflow-y-auto px-6 py-5 sm:grid-cols-2">
            <Field label="Title" error={err("title")} className="sm:col-span-2"><Input autoFocus {...register("title")} /></Field>
            <Field label="Description" error={err("description")} className="sm:col-span-2"><Textarea {...register("description")} /></Field>
            <Field label="Related project">
              <Select {...register("projectId")}><option value="">No project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            </Field>
            <Field label="Category"><Select {...register("category")}>{ISSUE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Severity"><Select {...register("severity")}>{ISSUE_SEVERITIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Reported date" error={err("reportedDate")}><Input type="date" {...register("reportedDate")} /></Field>
            <Field label="Reported by"><Input {...register("reportedBy")} /></Field>
            <Field label="Responsible PIC"><Input {...register("responsiblePic")} /></Field>
            <Field label="Expected resolution date" error={err("expectedResolution")}><Input type="date" {...register("expectedResolution")} /></Field>
            <Field label="Next follow-up date" error={err("nextFollowUpDate")}><Input type="date" {...register("nextFollowUpDate")} /></Field>
            <Field label="Impact" className="sm:col-span-2"><Textarea {...register("impact")} /></Field>
            <Field label="Workaround" className="sm:col-span-2"><Textarea {...register("workaround")} /></Field>
            <Field label="Root cause" className="sm:col-span-2"><Textarea {...register("rootCause")} /></Field>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-6 py-3.5">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : issue ? "Save changes" : "Report issue"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EscalateDialog({ open, onOpenChange, issueId, currentPic, followUpDefault }: { open: boolean; onOpenChange: (o: boolean) => void; issueId: string; currentPic: string; followUpDefault: string }) {
  const [to, setTo] = useState(currentPic);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(followUpDefault);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setTo(currentPic);
      setReason("");
      setDate(followUpDefault);
    }
  }, [open, currentPic, followUpDefault]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await escalateIssue(issueId, { to, reason, followUpDate: date });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Issue escalated");
      onOpenChange(false);
    } catch {
      toast.error("Could not reach the local server. Is `npm run dev` still running?");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Escalate issue" description="Sets the status to Escalated and records it in the escalation history." className="max-w-md">
        <form onSubmit={submit}>
          <div className="space-y-4 px-6 py-5">
            <Field label="Escalate to"><Input autoFocus value={to} onChange={(e) => setTo(e.target.value)} placeholder="Person or team, e.g. Backend team" /></Field>
            <Field label="Reason / what you need"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            <Field label="Follow up on"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-6 py-3.5">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Escalate"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ResolveDialog({ open, onOpenChange, issueId, rootCause }: { open: boolean; onOpenChange: (o: boolean) => void; issueId: string; rootCause: string }) {
  const [cause, setCause] = useState(rootCause);
  const [resolution, setResolution] = useState("");
  const [verify, setVerify] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setCause(rootCause);
      setResolution("");
      setVerify(true);
    }
  }, [open, rootCause]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await resolveIssue(issueId, { rootCause: cause, resolution, pendingVerification: verify });
      if (!r.ok) return void toast.error(r.error);
      toast.success(verify ? "Marked as pending verification" : "Issue resolved");
      onOpenChange(false);
    } catch {
      toast.error("Could not reach the local server. Is `npm run dev` still running?");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Record the fix" className="max-w-md">
        <form onSubmit={submit}>
          <div className="space-y-4 px-6 py-5">
            <Field label="Root cause"><Textarea autoFocus value={cause} onChange={(e) => setCause(e.target.value)} /></Field>
            <Field label="What was done"><Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} /></Field>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={verify} onChange={(e) => setVerify(e.target.checked)} />
              <span>The fix still needs to be verified. Keep the issue as <strong>Pending Verification</strong> until it is confirmed.</span>
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-6 py-3.5">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : verify ? "Mark pending verification" : "Mark resolved"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
