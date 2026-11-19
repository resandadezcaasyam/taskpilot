"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { createUatFeature, updateUatFeature } from "@/actions/uat";
import { toInputDate } from "@/lib/dates";
import { SIGNOFF_STATUSES, UAT_STATUSES } from "@/lib/uat";
import { uatFeatureSchema, type UatFeatureValues } from "@/lib/validators";

export interface UatFeatureLike {
  id: string; name: string; projectId: string | null; releaseVersion: string | null; environment: string | null; owner: string | null;
  startDate: Date | null; targetDate: Date | null; status: string; signOffStatus: string; remarks: string | null;
  manualTotal: number | null; manualPassed: number | null; manualFailed: number | null; manualBlocked: number | null;
}

const EMPTY: UatFeatureValues = {
  name: "", projectId: "", releaseVersion: "", environment: "", owner: "", startDate: "", targetDate: "", status: "Not Started",
  signOffStatus: "Pending", remarks: "", manualTotal: "", manualPassed: "", manualFailed: "", manualBlocked: "",
};
const s = (n: number | null) => (n === null ? "" : String(n));
const toForm = (f: UatFeatureLike): UatFeatureValues => ({
  name: f.name, projectId: f.projectId ?? "", releaseVersion: f.releaseVersion ?? "", environment: f.environment ?? "", owner: f.owner ?? "",
  startDate: toInputDate(f.startDate), targetDate: toInputDate(f.targetDate), status: f.status as UatFeatureValues["status"],
  signOffStatus: f.signOffStatus as UatFeatureValues["signOffStatus"], remarks: f.remarks ?? "",
  manualTotal: s(f.manualTotal), manualPassed: s(f.manualPassed), manualFailed: s(f.manualFailed), manualBlocked: s(f.manualBlocked),
});

export function UatFeatureDialog({
  open, onOpenChange, projects, feature, defaultProjectId,
}: { open: boolean; onOpenChange: (o: boolean) => void; projects: { id: string; name: string }[]; feature?: UatFeatureLike | null; defaultProjectId?: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<UatFeatureValues>({ resolver: zodResolver(uatFeatureSchema), defaultValues: EMPTY });
  useEffect(() => {
    if (open) reset(feature ? toForm(feature) : { ...EMPTY, projectId: defaultProjectId ?? "" });
  }, [open, feature, defaultProjectId, reset]);

  async function onSubmit(v: UatFeatureValues) {
    setSaving(true);
    try {
      const r = feature ? await updateUatFeature(feature.id, v) : await createUatFeature(v);
      if (!r.ok) return void toast.error(r.error);
      onOpenChange(false);
      toast.success(feature ? "UAT feature saved" : "UAT feature created");
      if (!feature) router.push(`/uat/${(r as { data: { id: string } }).data.id}`);
    } catch {
      toast.error("Could not reach the local server. Is `npm run dev` still running?");
    } finally {
      setSaving(false);
    }
  }
  const err = (k: keyof UatFeatureValues) => errors[k]?.message as string | undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={feature ? "Edit UAT feature" : "New UAT feature"}>
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <div className="grid gap-4 overflow-y-auto px-6 py-5 sm:grid-cols-2">
            <Field label="Feature name" error={err("name")} className="sm:col-span-2"><Input autoFocus {...register("name")} /></Field>
            <Field label="Project" error={err("projectId")}>
              <Select {...register("projectId")}>
                <option value="">No project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Release version" error={err("releaseVersion")}><Input placeholder="e.g. v2.4.0" {...register("releaseVersion")} /></Field>
            <Field label="Test environment" error={err("environment")}><Input placeholder="e.g. Staging" {...register("environment")} /></Field>
            <Field label="UAT owner" error={err("owner")}><Input {...register("owner")} /></Field>
            <Field label="Start date" error={err("startDate")}><Input type="date" {...register("startDate")} /></Field>
            <Field label="Target completion date" error={err("targetDate")}><Input type="date" {...register("targetDate")} /></Field>
            <Field label="UAT status" error={err("status")}>
              <Select {...register("status")}>{UAT_STATUSES.map((x) => <option key={x}>{x}</option>)}</Select>
            </Field>
            <Field label="Sign-off status" error={err("signOffStatus")}>
              <Select {...register("signOffStatus")}>{SIGNOFF_STATUSES.map((x) => <option key={x}>{x}</option>)}</Select>
            </Field>
            <Field label="Remarks" error={err("remarks")} className="sm:col-span-2"><Textarea {...register("remarks")} /></Field>
            <details className="rounded-lg border border-border p-3 sm:col-span-2">
              <summary className="cursor-pointer text-[13px] font-medium">Track counts without individual test cases</summary>
              <p className="mt-2 text-xs text-muted-foreground">Only used while this feature has no test cases. Once you add or import test cases, they take over.</p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Total" error={err("manualTotal")}><Input inputMode="numeric" {...register("manualTotal")} /></Field>
                <Field label="Passed" error={err("manualPassed")}><Input inputMode="numeric" {...register("manualPassed")} /></Field>
                <Field label="Failed" error={err("manualFailed")}><Input inputMode="numeric" {...register("manualFailed")} /></Field>
                <Field label="Blocked" error={err("manualBlocked")}><Input inputMode="numeric" {...register("manualBlocked")} /></Field>
              </div>
            </details>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-6 py-3.5">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : feature ? "Save changes" : "Create feature"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
