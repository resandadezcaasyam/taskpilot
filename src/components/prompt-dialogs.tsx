"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/form-controls";
import { overrideNextAction, recordFollowUp } from "@/actions/engine";
import type { ActionResult } from "@/lib/validators";

const OFFLINE = "Could not reach the local server. Is `npm run dev` still running?";

/** A one-field dialog (text, long text or date) that reports failed saves instead of closing. */
export function PromptDialog({
  open, onOpenChange, title, description, label, kind = "text", initial = "", submitLabel = "Save", required = false, onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  label: string;
  kind?: "text" | "textarea" | "date";
  initial?: string;
  submitLabel?: string;
  required?: boolean;
  onSubmit: (value: string) => Promise<ActionResult<unknown>>;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setValue(initial);
  }, [open, initial]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (required && !value.trim()) return void toast.error(`${label} is required`);
    setSaving(true);
    try {
      const r = await onSubmit(value);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Saved");
      onOpenChange(false);
    } catch {
      toast.error(OFFLINE);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description} className="max-w-md">
        <form onSubmit={submit}>
          <div className="px-6 py-5">
            <Field label={label}>
              {kind === "textarea" ? (
                <Textarea autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
              ) : (
                <Input autoFocus type={kind === "date" ? "date" : "text"} value={value} onChange={(e) => setValue(e.target.value)} />
              )}
            </Field>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-6 py-3.5">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : submitLabel}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function FollowUpDialog({
  open, onOpenChange, taskId, taskTitle, defaultDate, waitingFor,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  taskId: string;
  taskTitle: string;
  defaultDate: string;
  waitingFor?: string | null;
}) {
  const [note, setNote] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setNote("");
      setDate(defaultDate);
    }
  }, [open, defaultDate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await recordFollowUp(taskId, { note, nextDate: date });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Follow-up recorded");
      onOpenChange(false);
    } catch {
      toast.error(OFFLINE);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Record follow-up"
        description={`${taskTitle}${waitingFor ? ` · with ${waitingFor}` : ""}`}
        className="max-w-md"
      >
        <form onSubmit={submit}>
          <div className="space-y-4 px-6 py-5">
            <Field label="What did you ask or hear?" hint="Saved as a comment on the task. Optional.">
              <Textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Asked Andi for an ETA, expects an answer by Friday" />
            </Field>
            <Field label="Next follow-up date" hint="Leave empty if no further follow-up is needed.">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-6 py-3.5">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Record follow-up"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function OverrideDialog({
  open, onOpenChange, taskId, currentText, pinned, overridden,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  taskId: string;
  currentText: string;
  pinned: boolean;
  overridden: boolean;
}) {
  const [text, setText] = useState(currentText);
  const [pin, setPin] = useState(pinned);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setText(currentText);
      setPin(pinned);
    }
  }, [open, currentText, pinned]);

  async function save(next: { text: string; pinned: boolean }, message: string) {
    setSaving(true);
    try {
      const r = await overrideNextAction(taskId, next);
      if (!r.ok) return void toast.error(r.error);
      toast.success(message);
      onOpenChange(false);
    } catch {
      toast.error(OFFLINE);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Override recommendation" description="Write your own next action. You can also pin this task to the top of the list." className="max-w-md">
        <div className="space-y-4 px-6 py-5">
          <Field label="Your next action">
            <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} />
            Pin this task to the top (score 100)
          </label>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border px-6 py-3.5">
          {overridden ? (
            <Button variant="ghost" disabled={saving} onClick={() => save({ text: "", pinned: false }, "Override removed")}>
              Remove override
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button disabled={saving || (!text.trim() && !pin)} onClick={() => save({ text, pinned: pin }, "Override saved")}>
              {saving ? "Saving…" : "Save override"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
