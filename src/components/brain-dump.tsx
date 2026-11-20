"use client";

import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, Eraser, ListPlus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/form-controls";
import { PromptDialog } from "@/components/prompt-dialogs";
import { applyBrainDump, type BrainDumpRow } from "@/actions/tasks";
import { saveRoutine } from "@/actions/capture";
import { buildIndex, buildUpdate, planBrainDump, type KnownData, type PlannedAction, type UpdatePatch } from "@/lib/brain-plan";
import { CHEAT_SHEET } from "@/lib/bulk-parse";
import { TASK_PRIORITIES } from "@/lib/constants";
import { taskFormSchema, type TaskFormValues } from "@/lib/validators";
import { cn } from "@/lib/utils";

const DRAFT_KEY = "taskpilot.brain-dump.draft";
const EXAMPLE = `Follow up Andi about the API timestamp tomorrow !h @booking ~15m
[x] Sent weekly report to Budi
doing: Review PRD %40
blocked: Vendor compliance => backend timestamp missing
Prepare slides for Friday ~1h => collect numbers first`;
const STATUS_CHOICES = [["To Do", "To do"], ["In Progress", "Doing"], ["Done", "Already done"]] as const;
const ROW_STATUSES = ["Backlog", "To Do", "In Progress", "Waiting for Others", "Blocked", "In Review", "Done"] as const;
const short = (s: string, n = 42) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

type Edits = Record<string, Partial<TaskFormValues>>;
type ActionChoice = "create" | "skip" | `update:${string}`;

export function BrainDump({ known, routine: initialRoutine, recentTitles }: { known: KnownData; routine: string; recentTitles: string[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<TaskFormValues["status"]>("To Do");
  const [priority, setPriority] = useState<TaskFormValues["priority"]>("Medium");
  const [projectId, setProjectId] = useState("");
  const [edits, setEdits] = useState<Edits>({});
  const [choices, setChoices] = useState<Record<string, ActionChoice>>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [routine, setRoutine] = useState(initialRoutine);
  const [routineOpen, setRoutineOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const loaded = useRef(false);
  const projects = known.projects;

  // an unsent draft survives a refresh (a convenience only; saved tasks live in the database)
  useEffect(() => {
    try {
      const d = localStorage.getItem(DRAFT_KEY);
      if (d) setText(d);
    } catch { /* storage may be unavailable */ }
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      if (text) localStorage.setItem(DRAFT_KEY, text);
      else localStorage.removeItem(DRAFT_KEY);
    } catch { /* ignore */ }
  }, [text]);

  const index = useMemo(() => buildIndex(known.tasks), [known.tasks]);
  const deferred = useDeferredValue(text);
  const plan = useMemo(
    () => planBrainDump(deferred, known, { status, priority, category: "Other", projectId }, new Date(), index),
    [deferred, known, status, priority, projectId, index],
  );
  const taskById = useMemo(() => new Map(known.tasks.map((t) => [t.id, t])), [known.tasks]);

  const rows = plan.rows.map((p) => {
    const values: TaskFormValues = { ...p.values, ...edits[p.key] };
    const explicit = new Set<string>([...p.explicit, ...Object.keys(edits[p.key] ?? {})]);
    const choice = choices[p.key];
    let action: PlannedAction = p.action;
    if (choice === "create") action = { kind: "create" };
    else if (choice === "skip") action = { kind: "skip", reason: "Skipped by you" };
    else if (choice?.startsWith("update:")) action = { kind: "update", taskId: choice.slice(7) };
    const target = action.kind === "update" ? taskById.get(action.taskId) : undefined;
    let error: string | null = serverErrors[p.key] ?? null;
    let summary: string[] = [];
    let patch: UpdatePatch = {};
    if (action.kind === "create") {
      const check = taskFormSchema.safeParse({ ...values, projectId: values.projectId.startsWith("new:") ? "" : values.projectId });
      if (!check.success) error ??= check.error.issues[0]?.message ?? "Invalid";
    } else if (action.kind === "update" && target) {
      const u = buildUpdate(values, explicit, target);
      patch = u.patch;
      summary = u.summary;
      if (Object.keys(patch).length === 0) error ??= "Nothing would change on that task. Choose Skip or Create new task.";
      else if (u.problem) error ??= u.problem;
    }
    return { ...p, values, action, target, patch, summary, error };
  });
  const ready = rows.filter((r) => r.action.kind !== "skip" && !r.error);
  const creates = ready.filter((r) => r.action.kind === "create");
  const updates = ready.filter((r) => r.action.kind === "update");
  const needsFix = rows.filter((r) => r.action.kind !== "skip" && r.error).length;
  const skipped = rows.filter((r) => r.action.kind === "skip").length;
  const newProjects = [...new Set(ready.map((r) => r.values.projectId).filter((id) => id.startsWith("new:")).map((id) => id.slice(4)))];

  const edit = (key: string, patch: Partial<TaskFormValues>) => {
    setEdits((e) => ({ ...e, [key]: { ...e[key], ...patch } }));
    setServerErrors((e) => { const n = { ...e }; delete n[key]; return n; });
  };
  const append = (line: string) => setText((t) => (t && !t.endsWith("\n") ? `${t}\n${line}` : `${t}${line}`));
  const reset = () => { setText(""); setEdits({}); setChoices({}); setServerErrors({}); };
  const label = creates.length && updates.length
    ? `Save changes (${creates.length} new, ${updates.length} ${updates.length === 1 ? "update" : "updates"})`
    : updates.length ? `Update ${updates.length} ${updates.length === 1 ? "task" : "tasks"}` : `Create ${creates.length} ${creates.length === 1 ? "task" : "tasks"}`;

  async function submit() {
    if (busy || ready.length === 0) return;
    setBusy(true);
    try {
      const payload: BrainDumpRow[] = ready.map((r) =>
        r.action.kind === "update" ? { kind: "update", taskId: r.action.taskId, patch: r.patch } : { kind: "create", values: r.values },
      );
      const res = await applyBrainDump(payload);
      if (!res.ok) return void toast.error(res.error);
      const done = new Set<string>();
      const failed: Record<string, string> = {};
      let made = 0;
      let changed = 0;
      for (const r of res.data.rows) {
        const key = ready[r.index].key;
        if ("error" in r) failed[key] = r.error;
        else {
          done.add(key);
          if (r.kind === "created") made++;
          else changed++;
        }
      }
      const seen = new Map<string, number>();
      const kept = text.split(/\r?\n/).filter((line) => {
        const n = (seen.get(line) ?? 0) + 1;
        seen.set(line, n);
        return !done.has(`${line}#${n}`);
      });
      setText(kept.join("\n").replace(/^\s+$/g, ""));
      setEdits((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !done.has(k))));
      setChoices((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !done.has(k))));
      setServerErrors(failed);
      const parts = [made && `${made} created`, changed && `${changed} updated`, res.data.newProjects.length && `${res.data.newProjects.length} new ${res.data.newProjects.length === 1 ? "project" : "projects"}`].filter(Boolean).join(", ");
      if (Object.keys(failed).length) toast.error(`${parts || "Nothing saved"}. ${Object.keys(failed).length} could not be saved. Fix them in the list.`);
      else toast.success(parts || "Saved", { action: { label: "Open My Tasks", onClick: () => router.push("/tasks") } });
      router.refresh();
    } catch {
      toast.error("Could not reach the local server. Is `npm run dev` still running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div>
            <p className="mb-1.5 text-[13px] font-medium">These are…</p>
            <div className="flex rounded-lg border border-input bg-card p-0.5" role="group" aria-label="Default status">
              {STATUS_CHOICES.map(([value, name]) => (
                <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value)} className={cn("rounded-md px-3 py-1 text-[13px]", status === value ? "bg-primary-soft font-medium text-primary" : "text-muted-foreground hover:text-foreground")}>{name}</button>
              ))}
            </div>
          </div>
          <label className="space-y-1.5 text-[13px] font-medium">Default project
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-52 font-normal">
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </label>
          <label className="space-y-1.5 text-[13px] font-medium">Default priority
            <Select value={priority} onChange={(e) => setPriority(e.target.value as TaskFormValues["priority"])} className="w-36 font-normal">
              {TASK_PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </Select>
          </label>
        </div>

        <div className="space-y-2">
          <label htmlFor="brain-dump" className="text-[13px] font-medium">One line per activity</label>
          <Textarea
            id="brain-dump"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void submit(); } }}
            placeholder={EXAMPLE}
            rows={9}
            className="font-mono text-[13px] leading-relaxed"
            spellCheck={false}
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{rows.length} {rows.length === 1 ? "line" : "lines"} read. Typos are fine; existing tasks, projects and names are recognised. <kbd className="rounded border border-border bg-muted px-1">Ctrl</kbd>+<kbd className="rounded border border-border bg-muted px-1">Enter</kbd> saves.</span>
            {plan.truncated > 0 && <span className="text-amber-700 dark:text-amber-400">Only the first 100 lines are used ({plan.truncated} more were ignored).</span>}
            <span className="ml-auto flex flex-wrap gap-2">
              {!text && <Button size="sm" variant="ghost" onClick={() => setText(EXAMPLE)}><Sparkles /> Try an example</Button>}
              {routine.trim() && <Button size="sm" variant="outline" onClick={() => routine.split("\n").forEach((l) => l.trim() && append(l))}><ListPlus /> Add my daily routine</Button>}
              <Button size="sm" variant="ghost" onClick={() => setRoutineOpen(true)}>{routine.trim() ? "Edit routine" : "Set up a daily routine"}</Button>
              {text && <Button size="sm" variant="ghost" onClick={reset}><Eraser /> Clear</Button>}
            </span>
          </div>
        </div>

        {recentTitles.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Often used:</span>
            {recentTitles.map((t) => (
              <button key={t} type="button" onClick={() => append(t)} className="rounded-full border border-border px-2.5 py-0.5 text-xs hover:border-primary hover:text-primary">{t}</button>
            ))}
          </div>
        )}

        <details className="rounded-lg bg-muted/50 px-4 py-3 text-[13px]">
          <summary className="cursor-pointer select-none font-medium">Shortcuts (all optional)</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left">
              <tbody>
                {CHEAT_SHEET.map((c) => (
                  <tr key={c.token} className="border-t border-border first:border-0">
                    <td className="py-1.5 pr-4 align-top"><code className="font-mono text-xs">{c.token}</code></td>
                    <td className="py-1.5 pr-4 align-top text-muted-foreground">{c.meaning}</td>
                    <td className="py-1.5 align-top"><button type="button" className="text-left text-primary hover:underline" onClick={() => append(c.example)}>{c.example}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>

      {rows.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight">Preview</h2>
              <p className="text-[13px] text-muted-foreground">
                {creates.length} to create · {updates.length} to update{needsFix > 0 && ` · ${needsFix} need attention`}{skipped > 0 && ` · ${skipped} skipped`}. Change anything below before saving.
              </p>
              {newProjects.length > 0 && <p role="status" className="mt-1 text-[13px] text-primary">New {newProjects.length === 1 ? "project" : "projects"} will be created: {newProjects.join(", ")}</p>}
            </div>
            <Button onClick={submit} disabled={busy || ready.length === 0}>{busy ? "Saving…" : label}</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-y border-border text-left text-xs text-muted-foreground">
                  <th className="w-52 px-4 py-2 font-medium">Action</th><th className="min-w-[340px] px-2 py-2 font-medium">Title</th><th className="px-2 py-2 font-medium">Project</th>
                  <th className="px-2 py-2 font-medium">Priority</th><th className="px-2 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const value: ActionChoice = r.action.kind === "update" ? `update:${r.action.taskId}` : r.action.kind;
                  const best = r.matches[0];
                  const unselectedMatch = r.action.kind !== "update" ? best : undefined;
                  return (
                    <tr key={r.key} className={cn("border-b border-border align-top last:border-0", r.action.kind === "skip" && "opacity-60", r.action.kind !== "skip" && r.error && "bg-red-50/60 dark:bg-red-950/20")}>
                      <td className="px-4 py-2.5">
                        <Select aria-label={`Action for line ${i + 1}`} value={value} onChange={(e) => setChoices((c) => ({ ...c, [r.key]: e.target.value as ActionChoice }))} className="h-8 py-0 text-xs">
                          <option value="create">Create new task</option>
                          {r.matches.map((m) => <option key={m.task.id} value={`update:${m.task.id}`}>Update {m.task.code} · {short(m.task.title, 26)}</option>)}
                          {r.action.kind === "update" && !r.matches.some((m) => m.task.id === (r.action as { taskId: string }).taskId) && r.target && <option value={value}>Update {r.target.code}</option>}
                          <option value="skip">Skip</option>
                        </Select>
                        {r.action.kind === "skip" && <p className="mt-1 text-[11px] text-muted-foreground">{r.action.reason}</p>}
                      </td>
                      <td className="space-y-1.5 px-2 py-2">
                        <Input aria-label={`Title for line ${i + 1}`} value={r.values.title} onChange={(e) => edit(r.key, { title: e.target.value })} className="h-8" />
                        {r.values.status === "Blocked" && <Input aria-label={`Blocker for line ${i + 1}`} placeholder="What is blocking this?" value={r.values.blockerDescription} onChange={(e) => edit(r.key, { blockerDescription: e.target.value })} className="h-8" />}
                        {r.values.status === "Waiting for Others" && <Input aria-label={`Waiting for, line ${i + 1}`} placeholder="Waiting for…" value={r.values.waitingFor} onChange={(e) => edit(r.key, { waitingFor: e.target.value })} className="h-8" />}
                        {r.action.kind === "update" && r.target && (
                          <p className="text-[11px] text-primary">
                            Matches {r.target.code} “{short(r.target.title, 50)}” ({r.target.status}). {r.summary.length ? `Will change: ${r.summary.join(" · ")}` : ""}
                          </p>
                        )}
                        {unselectedMatch && r.action.kind === "create" && (
                          <p className="text-[11px] text-amber-700 dark:text-amber-400">
                            Looks like {unselectedMatch.task.code} “{short(unselectedMatch.task.title, 50)}” ({Math.round(unselectedMatch.score * 100)}% similar).{" "}
                            <button type="button" className="underline" onClick={() => setChoices((c) => ({ ...c, [r.key]: `update:${unselectedMatch.task.id}` }))}>Update that one instead</button>
                          </p>
                        )}
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="space-y-0.5 text-[11px] text-muted-foreground">Due
                            <Input type="date" aria-label={`Due date for line ${i + 1}`} value={r.values.dueDate} onChange={(e) => edit(r.key, { dueDate: e.target.value })} className="h-7 w-32 px-2 text-xs" />
                          </label>
                          <label className="space-y-0.5 text-[11px] text-muted-foreground">Follow-up
                            <Input type="date" aria-label={`Follow-up date for line ${i + 1}`} value={r.values.followUpDate} onChange={(e) => edit(r.key, { followUpDate: e.target.value })} className="h-7 w-32 px-2 text-xs" />
                          </label>
                          <label className="space-y-0.5 text-[11px] text-muted-foreground">Est. (h)
                            <Input inputMode="decimal" aria-label={`Estimate in hours for line ${i + 1}`} value={r.values.estimatedHours} onChange={(e) => edit(r.key, { estimatedHours: e.target.value })} className="h-7 w-16 px-2 text-xs" />
                          </label>
                        </div>
                        <p className="flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                          {r.detected.map((d) => <span key={d}>{d}</span>)}
                          {r.values.nextAction && <span>Next: {r.values.nextAction}</span>}
                        </p>
                        {r.didYouMean && !r.values.projectId && (
                          <p className="text-[11px] text-amber-700 dark:text-amber-400">
                            Did you mean the project “{r.didYouMean.name}”?{" "}
                            <button type="button" className="underline" onClick={() => edit(r.key, { projectId: (r.didYouMean as { id: string }).id })}>Use it</button>
                          </p>
                        )}
                        {r.warnings.filter((w) => !w.startsWith("No project called") && !(r.error && w.includes(r.error))).map((w) => <p key={w} className="text-[11px] text-amber-700 dark:text-amber-400">{w}</p>)}
                        {r.action.kind !== "skip" && r.error && <p role="alert" className="flex items-center gap-1 text-[11px] text-destructive"><CircleAlert className="size-3" />{r.error}</p>}
                      </td>
                      <td className="px-2 py-2">
                        <Select aria-label={`Project for line ${i + 1}`} value={r.values.projectId} onChange={(e) => edit(r.key, { projectId: e.target.value })} className="h-8 w-40 py-0 text-xs">
                          <option value="">No project</option>
                          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          {r.values.projectId.startsWith("new:") && <option value={r.values.projectId}>+ New: {r.values.projectId.slice(4)}</option>}
                        </Select>
                      </td>
                      <td className="px-2 py-2">
                        <Select aria-label={`Priority for line ${i + 1}`} value={r.values.priority} onChange={(e) => edit(r.key, { priority: e.target.value as TaskFormValues["priority"] })} className="h-8 w-28 py-0 text-xs">
                          {TASK_PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                        </Select>
                      </td>
                      <td className="px-2 py-2">
                        <Select aria-label={`Status for line ${i + 1}`} value={r.values.status} onChange={(e) => edit(r.key, { status: e.target.value as TaskFormValues["status"] })} className="h-8 w-36 py-0 text-xs">
                          {ROW_STATUSES.map((s) => <option key={s}>{s}</option>)}
                        </Select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <PromptDialog
        open={routineOpen}
        onOpenChange={setRoutineOpen}
        title="My daily routine"
        description="Lines you do most days (stand-up, checking UAT, reviewing issues). One click adds them to Brain Dump. You can use all the shortcuts here too."
        label="One activity per line"
        kind="textarea"
        initial={routine}
        submitLabel="Save routine"
        onSubmit={async (v) => {
          const r = await saveRoutine(v);
          if (r.ok) setRoutine(v.trim());
          return r;
        }}
      />
    </div>
  );
}
