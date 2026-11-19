"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Download, FileUp, Link2, MoreHorizontal, Paperclip, Pencil, Plus, RotateCcw, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FileChip } from "@/components/file-upload";
import { ResultPill } from "@/components/pills";
import { UatFeatureDialog, type UatFeatureLike } from "@/components/uat-feature-dialog";
import { addEvidence, deleteEvidence } from "@/actions/attachments";
import {
  createIssueFromTestCase, createTestCase, deleteTestCase, deleteUatFeature, importTestCases,
  linkTestCaseIssue, markFixDeployed, retestFailed, setSignOff, setTestResult, updateTestCase, updateUatFeature,
} from "@/actions/uat";
import { mapTestCaseRows, parseCsv, templateCsv, TEST_RESULTS, type ParsedCase } from "@/lib/csv";
import { issueCode } from "@/lib/issues";
import { toInputDate } from "@/lib/dates";
import { testCaseSchema, type ActionResult, type TestCaseValues } from "@/lib/validators";
import { cn } from "@/lib/utils";

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult<unknown>>, opts?: { ok?: string; after?: () => void }) =>
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) toast.error(r.error);
        else {
          if (opts?.ok) toast.success(opts.ok);
          opts?.after?.();
        }
      } catch {
        toast.error("Could not reach the local server. Is `npm run dev` still running?");
      }
    });
  return { pending, run };
}

export function NewUatButton({ projects }: { projects: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus /> New UAT feature</Button>
      <UatFeatureDialog open={open} onOpenChange={setOpen} projects={projects} />
    </>
  );
}

export function UatDetailActions({
  feature, projects, counts, fixDeployed, suggestedStatus,
}: {
  feature: UatFeatureLike & { signOffStatus: string };
  projects: { id: string; name: string }[];
  counts: { total: number; passed: number; failed: number };
  fixDeployed: boolean;
  suggestedStatus: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const { pending, run } = useRun();
  const allPassed = counts.total > 0 && counts.passed === counts.total;
  const applySuggestion = () =>
    suggestedStatus &&
    run(() => updateUatFeature(feature.id, {
      name: feature.name, projectId: feature.projectId ?? "", releaseVersion: feature.releaseVersion ?? "", environment: feature.environment ?? "",
      owner: feature.owner ?? "", startDate: toInputDate(feature.startDate), targetDate: toInputDate(feature.targetDate),
      status: suggestedStatus as never, signOffStatus: feature.signOffStatus as never, remarks: feature.remarks ?? "",
      manualTotal: feature.manualTotal === null ? "" : String(feature.manualTotal), manualPassed: feature.manualPassed === null ? "" : String(feature.manualPassed),
      manualFailed: feature.manualFailed === null ? "" : String(feature.manualFailed), manualBlocked: feature.manualBlocked === null ? "" : String(feature.manualBlocked),
    }), { ok: `Status set to ${suggestedStatus}` });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {counts.failed > 0 && !fixDeployed && (
          <Button variant="outline" disabled={pending} onClick={() => run(() => markFixDeployed(feature.id, true), { ok: "Fix marked as deployed" })}><Wrench /> Mark fix deployed</Button>
        )}
        {counts.failed > 0 && (
          <Button variant="outline" disabled={pending} onClick={() => run(() => retestFailed(feature.id), { ok: "Failed cases queued for retest" })}><RotateCcw /> Retest failed cases</Button>
        )}
        {allPassed && feature.signOffStatus !== "Requested" && feature.signOffStatus !== "Signed Off" && (
          <Button disabled={pending} onClick={() => run(() => setSignOff(feature.id, "Requested"), { ok: "Sign-off requested" })}>Request sign-off</Button>
        )}
        {feature.signOffStatus === "Requested" && (
          <>
            <Button disabled={pending} onClick={() => run(() => setSignOff(feature.id, "Signed Off"), { ok: "Signed off. UAT completed." })}>Mark signed off</Button>
            <Button variant="outline" disabled={pending} onClick={() => run(() => setSignOff(feature.id, "Rejected"), { ok: "Sign-off rejected" })}>Rejected</Button>
          </>
        )}
        <Button variant="outline" onClick={() => setEditing(true)}><Pencil /> Edit</Button>
        <Button variant="outline" onClick={() => setConfirm(true)}><Trash2 /> Delete</Button>
      </div>
      {suggestedStatus && suggestedStatus !== feature.status && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg bg-primary-soft px-3 py-2 text-[13px]">
          The data suggests the status should be <strong>{suggestedStatus}</strong>.
          <Button size="sm" variant="outline" disabled={pending} onClick={applySuggestion}>Apply</Button>
        </p>
      )}
      <UatFeatureDialog open={editing} onOpenChange={setEditing} projects={projects} feature={feature} />
      <ConfirmDialog
        open={confirm} onOpenChange={setConfirm} title="Delete this UAT feature?"
        description="Its test cases and evidence files will be permanently removed. This cannot be undone."
        pending={pending} onConfirm={() => run(() => deleteUatFeature(feature.id), { ok: "UAT feature deleted", after: () => router.push("/uat") })}
      />
    </div>
  );
}

// ---------------- test cases ----------------

export interface CaseRow {
  id: string; title: string; prerequisites: string | null; steps: string | null; expectedResult: string | null; actualResult: string | null;
  result: string; remarks: string | null; linkedBug: string | null; retestCount: number;
  evidence: { id: string; fileName: string; sizeBytes: number | null }[];
  linkedIssue: { id: string; seq: number; title: string; status: string } | null;
}

const EMPTY_CASE: TestCaseValues = { title: "", prerequisites: "", steps: "", expectedResult: "", actualResult: "", result: "Not Run", remarks: "", linkedBug: "" };
const caseToForm = (c: CaseRow): TestCaseValues => ({
  title: c.title, prerequisites: c.prerequisites ?? "", steps: c.steps ?? "", expectedResult: c.expectedResult ?? "", actualResult: c.actualResult ?? "",
  result: c.result as TestCaseValues["result"], remarks: c.remarks ?? "", linkedBug: c.linkedBug ?? "",
});

export function TestCasesPanel({ featureId, cases, issueOptions }: { featureId: string; cases: CaseRow[]; issueOptions: { id: string; seq: number; title: string }[] }) {
  const [editing, setEditing] = useState<CaseRow | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<CaseRow | null>(null);
  const [linking, setLinking] = useState<CaseRow | null>(null);
  const [filter, setFilter] = useState("");
  const { pending, run } = useRun();
  const fileRef = useRef<HTMLInputElement>(null);
  const evidenceFor = useRef<string | null>(null);

  const shown = filter ? cases.filter((c) => c.result === filter) : cases;

  async function onEvidence(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const id = evidenceFor.current;
    if (!file || !id) return;
    if (file.size > 15 * 1024 * 1024) return void toast.error("The file is larger than 15 MB");
    const fd = new FormData();
    fd.set("file", file);
    run(() => addEvidence(id, fd), { ok: `${file.name} attached` });
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">Test cases ({cases.length})</h2>
          <p className="text-[13px] text-muted-foreground">Set the result inline. Every change updates the metrics above.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Filter by result" value={filter} onChange={(e) => setFilter(e.target.value)} className="h-8 w-36 text-xs">
            <option value="">All results</option>
            {TEST_RESULTS.map((r) => <option key={r}>{r}</option>)}
          </Select>
          <Button size="sm" variant="outline" onClick={() => setImporting(true)}><FileUp /> Import CSV</Button>
          <Button size="sm" onClick={() => setEditing("new")}><Plus /> Add test case</Button>
        </div>
      </div>
      <input ref={fileRef} type="file" className="sr-only" tabIndex={-1} aria-label="Evidence file" onChange={onEvidence} />

      {cases.length === 0 ? (
        <EmptyState title="No test cases yet" description="Add test cases one by one, or import a CSV from your spreadsheet." action={<Button variant="outline" onClick={() => setImporting(true)}><FileUp /> Import CSV</Button>} />
      ) : shown.length === 0 ? (
        <p className="px-5 pb-6 text-[13px] text-muted-foreground">No test cases with this result.</p>
      ) : (
        <ul>
          {shown.map((c, i) => (
            <li key={c.id} className="border-t border-border px-5 py-3.5">
              <div className="flex items-start gap-3">
                <span className="mt-1.5 w-6 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">{c.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {c.linkedIssue ? (
                      <Link href={`/issues/${c.linkedIssue.id}`} className="inline-flex items-center gap-1 hover:text-primary"><Link2 className="size-3" />{issueCode(c.linkedIssue.seq)} · {c.linkedIssue.status}</Link>
                    ) : c.linkedBug ? (
                      <span className="inline-flex items-center gap-1"><Link2 className="size-3" />{c.linkedBug}</span>
                    ) : null}
                    {c.retestCount > 0 && <span>Retested {c.retestCount}×</span>}
                  </div>
                  {c.evidence.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {c.evidence.map((e) => <FileChip key={e.id} kind="evidence" id={e.id} name={e.fileName} size={e.sizeBytes} onRemove={() => run(() => deleteEvidence(e.id))} />)}
                    </div>
                  )}
                  {(c.prerequisites || c.steps || c.expectedResult || c.actualResult || c.remarks) && (
                    <details className="mt-2 text-[13px]">
                      <summary className="cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground">Details</summary>
                      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                        {([["Prerequisites", c.prerequisites], ["Steps", c.steps], ["Expected result", c.expectedResult], ["Actual result", c.actualResult], ["Remarks", c.remarks]] as const).map(([k, v]) =>
                          v ? <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="whitespace-pre-wrap">{v}</dd></div> : null,
                        )}
                      </dl>
                    </details>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Select aria-label={`Result for ${c.title}`} value={c.result} disabled={pending} onChange={(e) => run(() => setTestResult(c.id, e.target.value))} className="h-8 w-28 text-xs">
                    {TEST_RESULTS.map((r) => <option key={r}>{r}</option>)}
                  </Select>
                  <ResultPill value={c.result} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`Actions for ${c.title}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => setEditing(c)}><Pencil /> Edit</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => { evidenceFor.current = c.id; fileRef.current?.click(); }}><Paperclip /> Attach evidence</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setLinking(c)}><Link2 /> Link issue…</DropdownMenuItem>
                      {!c.linkedIssue && <DropdownMenuItem onSelect={() => run(() => createIssueFromTestCase(c.id), { ok: "Issue created and linked" })}><Plus /> Create issue from this case</DropdownMenuItem>}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem destructive onSelect={() => setDeleting(c)}><Trash2 /> Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <TestCaseDialog featureId={featureId} editing={editing} onClose={() => setEditing(null)} />
      <CsvImportDialog featureId={featureId} open={importing} onOpenChange={setImporting} />
      <LinkIssueDialog target={linking} issues={issueOptions} onClose={() => setLinking(null)} />
      <ConfirmDialog
        open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)} title="Delete this test case?"
        description={deleting ? `"${deleting.title}" and its evidence files will be permanently removed.` : ""} pending={pending}
        onConfirm={() => deleting && run(() => deleteTestCase(deleting.id), { ok: "Test case deleted", after: () => setDeleting(null) })}
      />
    </Card>
  );
}

function TestCaseDialog({ featureId, editing, onClose }: { featureId: string; editing: CaseRow | "new" | null; onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<TestCaseValues>({ resolver: zodResolver(testCaseSchema), defaultValues: EMPTY_CASE });
  const isNew = editing === "new";
  useEffect(() => {
    if (editing) reset(editing === "new" ? EMPTY_CASE : caseToForm(editing));
  }, [editing, reset]);

  async function onSubmit(v: TestCaseValues) {
    setSaving(true);
    try {
      const r = isNew ? await createTestCase(featureId, v) : await updateTestCase((editing as CaseRow).id, v);
      if (!r.ok) return void toast.error(r.error);
      toast.success(isNew ? "Test case added" : "Test case saved");
      onClose();
    } catch {
      toast.error("Could not reach the local server. Is `npm run dev` still running?");
    } finally {
      setSaving(false);
    }
  }
  const err = (k: keyof TestCaseValues) => errors[k]?.message as string | undefined;
  return (
    <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={isNew ? "Add test case" : "Edit test case"}>
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <div className="grid gap-4 overflow-y-auto px-6 py-5 sm:grid-cols-2">
            <Field label="Title" error={err("title")} className="sm:col-span-2"><Input autoFocus {...register("title")} /></Field>
            <Field label="Prerequisites" className="sm:col-span-2"><Textarea {...register("prerequisites")} /></Field>
            <Field label="Test steps" className="sm:col-span-2"><Textarea {...register("steps")} /></Field>
            <Field label="Expected result"><Textarea {...register("expectedResult")} /></Field>
            <Field label="Actual result"><Textarea {...register("actualResult")} /></Field>
            <Field label="Result"><Select {...register("result")}>{TEST_RESULTS.map((r) => <option key={r}>{r}</option>)}</Select></Field>
            <Field label="Bug reference" hint="Or link a tracked issue from the row menu."><Input {...register("linkedBug")} /></Field>
            <Field label="Remarks" className="sm:col-span-2"><Textarea {...register("remarks")} /></Field>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-6 py-3.5">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : isNew ? "Add test case" : "Save changes"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CsvImportDialog({ featureId, open, onOpenChange }: { featureId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<{ cases: ParsedCase[]; errors: string[]; warnings: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setFileName("");
      setParsed(null);
    }
  }, [open]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setFileName(f.name);
    setParsed(mapTestCaseRows(parseCsv(await f.text())));
  }
  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([templateCsv()], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "uat-test-cases-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  async function confirm() {
    if (!parsed) return;
    setSaving(true);
    try {
      const r = await importTestCases(featureId, parsed.cases);
      if (!r.ok) return void toast.error(r.error);
      toast.success(`${r.data.created} imported${r.data.skipped ? `, ${r.data.skipped} duplicates skipped` : ""}`);
      onOpenChange(false);
    } catch {
      toast.error("Could not reach the local server. Is `npm run dev` still running?");
    } finally {
      setSaving(false);
    }
  }
  const tally = (parsed?.cases ?? []).reduce<Record<string, number>>((a, c) => ({ ...a, [c.result]: (a[c.result] ?? 0) + 1 }), {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Import test cases from CSV" description="Preview first. Nothing is saved until you confirm. Titles that already exist are skipped.">
        <div className="space-y-4 overflow-y-auto px-6 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-3.5 text-sm font-medium hover:bg-muted">
              <FileUp className="size-4" /> Choose CSV file
              <input type="file" accept=".csv,text/csv,.txt" className="sr-only" onChange={onFile} />
            </label>
            <Button type="button" variant="ghost" size="sm" onClick={downloadTemplate}><Download /> Download template</Button>
            {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
          </div>
          <p className="text-xs text-muted-foreground">Columns: Title (required), Prerequisites, Steps, Expected Result, Actual Result, Result (Pass / Fail / Blocked / Not Run), Remarks, Bug. Comma, semicolon and tab separators all work.</p>
          {parsed && (
            <div className="space-y-3">
              {parsed.errors.length > 0 && (
                <ul role="alert" className="space-y-1 rounded-lg bg-red-50 p-3 text-[13px] text-red-800 dark:bg-red-950/40 dark:text-red-200">{parsed.errors.map((m) => <li key={m}>{m}</li>)}</ul>
              )}
              {parsed.warnings.length > 0 && (
                <ul className="max-h-24 space-y-1 overflow-y-auto rounded-lg bg-amber-50 p-3 text-[13px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{parsed.warnings.map((m) => <li key={m}>{m}</li>)}</ul>
              )}
              {parsed.cases.length > 0 && (
                <>
                  <p className="text-sm font-medium">{parsed.cases.length} test cases ready · {TEST_RESULTS.filter((r) => tally[r]).map((r) => `${tally[r]} ${r}`).join(", ")}</p>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-left text-[13px]">
                      <thead className="bg-muted text-xs text-muted-foreground"><tr><th className="px-3 py-2">Title</th><th className="px-3 py-2">Result</th><th className="px-3 py-2">Expected</th></tr></thead>
                      <tbody>
                        {parsed.cases.slice(0, 8).map((c, i) => (
                          <tr key={i} className="border-t border-border"><td className="px-3 py-1.5">{c.title}</td><td className="px-3 py-1.5"><ResultPill value={c.result} /></td><td className="max-w-[220px] truncate px-3 py-1.5 text-muted-foreground">{c.expectedResult}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {parsed.cases.length > 8 && <p className="text-xs text-muted-foreground">…and {parsed.cases.length - 8} more.</p>}
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-6 py-3.5">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={confirm} disabled={saving || !parsed || parsed.cases.length === 0}>{saving ? "Importing…" : `Import ${parsed?.cases.length ?? 0} test cases`}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LinkIssueDialog({ target, issues, onClose }: { target: CaseRow | null; issues: { id: string; seq: number; title: string }[]; onClose: () => void }) {
  const [choice, setChoice] = useState("");
  const { pending, run } = useRun();
  useEffect(() => setChoice(target?.linkedIssue?.id ?? ""), [target]);
  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Link an issue" description={target?.title} className="max-w-md">
        <div className="px-6 py-5">
          <Field label="Issue">
            <Select value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">No linked issue</option>
              {issues.map((i) => <option key={i.id} value={i.id}>{issueCode(i.seq)} {i.title}</option>)}
            </Select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-6 py-3.5">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={pending} onClick={() => target && run(() => linkTestCaseIssue(target.id, choice || null), { ok: "Saved", after: onClose })}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const barTone = (v: number) => cn(v >= 100 ? "bg-emerald-500" : "bg-primary");
