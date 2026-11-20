"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ClipboardCopy, Mail, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/form-controls";
import { saveWeeklyConfig } from "@/actions/weekly";
import { PRODUCT_DASH_CHOICES, formatEmail, type WeeklyConfig, type WeeklyDraft, type WeeklyItem, type WeeklyKind } from "@/lib/weekly";
import { cn } from "@/lib/utils";

interface Props {
  draft: WeeklyDraft;
  config: WeeklyConfig;
  displayName: string;
  prevKey: string;
  nextKey: string;
  defaultKey: string;
}

function legacyCopy(text: string): boolean {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(ta);
  }
}

export function WeeklyReport({ draft, config: initial, displayName, prevKey, nextKey, defaultKey }: Props) {
  const [cfg, setCfg] = useState<WeeklyConfig>(initial);
  const [items, setItems] = useState<Record<WeeklyKind, WeeklyItem[]>>({ done: draft.done, plan: draft.plan, blocked: draft.blocked });
  const [subjectEdit, setSubjectEdit] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof WeeklyConfig>(key: K, value: WeeklyConfig[K]) => setCfg((c) => ({ ...c, [key]: value }));

  const chosen = (kind: WeeklyKind) => items[kind].filter((i) => i.included).map((i) => i.text);
  const email = useMemo(
    () => formatEmail(cfg, draft.info, { done: chosen("done"), plan: chosen("plan"), blocked: chosen("blocked") }, displayName),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfg, items, draft.info, displayName],
  );
  const subject = subjectEdit ?? email.subject;

  const update = (kind: WeeklyKind, id: string, patch: Partial<WeeklyItem>) =>
    setItems((s) => ({ ...s, [kind]: s[kind].map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  const addLine = (kind: WeeklyKind) =>
    setItems((s) => ({ ...s, [kind]: [...s[kind], { id: `custom-${kind}-${Date.now()}-${s[kind].length}`, kind, ref: "Custom", text: "", included: true, source: "custom" }] }));
  const removeLine = (kind: WeeklyKind, id: string) => setItems((s) => ({ ...s, [kind]: s[kind].filter((i) => i.id !== id) }));

  async function copyRich() {
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([email.html], { type: "text/html" }), "text/plain": new Blob([email.text], { type: "text/plain" }) })]);
      } else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(email.text);
      else if (!legacyCopy(email.text)) throw new Error("copy failed");
      toast.success("Email copied. Paste it into your email.");
    } catch {
      toast.error(legacyCopy(email.text) ? "Copied as plain text." : "Could not copy. Select the preview text and copy it by hand.");
    }
  }
  async function copyPlain(text: string, what: string) {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else if (!legacyCopy(text)) throw new Error("copy failed");
      toast.success(`${what} copied`);
    } catch {
      toast.error("Could not copy. Select the text and copy it by hand.");
    }
  }
  async function saveTemplate() {
    setSaving(true);
    try {
      const r = await saveWeeklyConfig(cfg);
      if (r.ok) toast.success("Saved as your default template");
      else toast.error(r.error);
    } catch {
      toast.error("Could not reach the local server. Is `npm run dev` still running?");
    } finally {
      setSaving(false);
    }
  }

  const mailto = `mailto:${email.to.includes("@") ? email.to.replace(/\s*[;]\s*/g, ",") : ""}?${[
    email.cc.includes("@") ? `cc=${encodeURIComponent(email.cc)}` : "",
    `subject=${encodeURIComponent(subject)}`,
    `body=${encodeURIComponent(email.text.replace(/\n/g, "\r\n"))}`,
  ].filter(Boolean).join("&")}`;
  const tooLongForMailto = mailto.length > 1900;
  const sections: { kind: WeeklyKind; heading: string; hint: string }[] = [
    { kind: "done", heading: cfg.headingDone, hint: `Finished ${draft.info.last.range}` },
    { kind: "plan", heading: cfg.headingPlan, hint: `Planned for ${draft.info.plan.range}` },
    { kind: "blocked", heading: cfg.headingBlocked, hint: "Blockers, long waits, overdue work, serious issues" },
  ];
  const includedCount = (["done", "plan", "blocked"] as WeeklyKind[]).reduce((n, k) => n + items[k].filter((i) => i.included && i.text.trim()).length, 0);

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-lg font-semibold tracking-tight">{draft.info.plan.label} <span className="text-sm font-normal text-muted-foreground">· {draft.info.plan.range}</span></p>
          <p className="text-[13px] text-muted-foreground">Reporting on {draft.info.last.label} ({draft.info.last.range}) and planning {draft.info.plan.label}.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/weekly?week=${prevKey}`} className="inline-flex h-9 items-center gap-1 rounded-lg border border-input px-3 text-[13px] hover:bg-muted"><ChevronLeft className="size-4" />Previous week</Link>
          <Link href="/weekly" aria-current={draft.planStartKey === defaultKey ? "page" : undefined} className={cn("inline-flex h-9 items-center rounded-lg border border-input px-3 text-[13px] hover:bg-muted", draft.planStartKey === defaultKey && "bg-primary-soft text-primary")}>Auto</Link>
          <Link href={`/weekly?week=${nextKey}`} className="inline-flex h-9 items-center gap-1 rounded-lg border border-input px-3 text-[13px] hover:bg-muted">Next week<ChevronRight className="size-4" /></Link>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Card className="space-y-3 p-5">
            <h2 className="text-[15px] font-semibold tracking-tight">Email details</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-[13px] font-medium">To
                <Input value={cfg.to} onChange={(e) => set("to", e.target.value)} placeholder="name@company.com, name2@company.com" className="font-normal" />
              </label>
              <label className="space-y-1 text-[13px] font-medium">Cc
                <Input value={cfg.cc} onChange={(e) => set("cc", e.target.value)} className="font-normal" />
              </label>
              <label className="space-y-1 text-[13px] font-medium">Greet (names)
                <Input value={cfg.greetingNames} onChange={(e) => set("greetingNames", e.target.value)} placeholder="Mas Hizky, Mas Ari" className="font-normal" />
              </label>
              <label className="space-y-1 text-[13px] font-medium">{cfg.productDashLabel}
                <Select value={cfg.productDash} onChange={(e) => set("productDash", e.target.value as WeeklyConfig["productDash"])} className="font-normal">
                  {PRODUCT_DASH_CHOICES.map((c) => <option key={c} value={c}>{c === "Skip" ? "Do not include this line" : c}</option>)}
                </Select>
              </label>
            </div>
            <label className="block space-y-1 text-[13px] font-medium">Subject
              <div className="flex gap-2">
                <Input value={subject} onChange={(e) => setSubjectEdit(e.target.value)} className="font-normal" />
                {subjectEdit !== null && <Button variant="ghost" size="sm" onClick={() => setSubjectEdit(null)}>Reset</Button>}
              </div>
            </label>
          </Card>

          {sections.map((s) => (
            <Card key={s.kind} className="p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-semibold tracking-tight">{s.heading}</h2>
                  <p className="text-xs text-muted-foreground">{s.hint}. Untick a line to leave it out; edit any wording.</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => addLine(s.kind)}><Plus /> Add a line</Button>
              </div>
              {items[s.kind].length === 0 && <p className="text-[13px] text-muted-foreground">Nothing found automatically. Add a line if there is something to say.</p>}
              <ul className="space-y-2">
                {items[s.kind].map((it, idx) => (
                  <li key={it.id} className="flex items-start gap-2">
                    <input type="checkbox" className="mt-2.5" aria-label={`Include ${s.heading} item ${idx + 1}`} checked={it.included} onChange={(e) => update(s.kind, it.id, { included: e.target.checked })} />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <Textarea aria-label={`${s.heading} item ${idx + 1}`} rows={Math.max(1, Math.ceil(it.text.length / 52))} value={it.text} onChange={(e) => update(s.kind, it.id, { text: e.target.value })} className={cn("min-h-9 resize-none py-1.5", !it.included && "opacity-60")} />
                      <p className="text-[11px] text-muted-foreground">{it.ref}</p>
                    </div>
                    {it.source === "custom" && <Button size="icon" variant="ghost" aria-label={`Remove ${s.heading} item ${idx + 1}`} onClick={() => removeLine(s.kind, it.id)}><X /></Button>}
                  </li>
                ))}
              </ul>
            </Card>
          ))}

          <Card className="p-5">
            <details>
              <summary className="cursor-pointer select-none text-[15px] font-semibold tracking-tight">Template settings</summary>
              <div className="mt-4 space-y-3">
                <p className="text-xs text-muted-foreground">Wording you set up once. Placeholders: <code>{"{names}"}</code> <code>{"{name}"}</code> <code>{"{month}"}</code> <code>{"{week}"}</code> <code>{"{lastWeek}"}</code> <code>{"{thisWeek}"}</code>.</p>
                <label className="block space-y-1 text-[13px] font-medium">Greeting
                  <Input value={cfg.greeting} onChange={(e) => set("greeting", e.target.value)} className="font-normal" />
                </label>
                <label className="block space-y-1 text-[13px] font-medium">Opening sentence
                  <Textarea rows={2} value={cfg.intro} onChange={(e) => set("intro", e.target.value)} className="font-normal" />
                </label>
                <label className="block space-y-1 text-[13px] font-medium">Subject template
                  <Input value={cfg.subject} onChange={(e) => set("subject", e.target.value)} className="font-normal" />
                </label>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="space-y-1 text-[13px] font-medium">Heading: done
                    <Input value={cfg.headingDone} onChange={(e) => set("headingDone", e.target.value)} className="font-normal" />
                  </label>
                  <label className="space-y-1 text-[13px] font-medium">Heading: plan
                    <Input value={cfg.headingPlan} onChange={(e) => set("headingPlan", e.target.value)} className="font-normal" />
                  </label>
                  <label className="space-y-1 text-[13px] font-medium">Heading: blocked
                    <Input value={cfg.headingBlocked} onChange={(e) => set("headingBlocked", e.target.value)} className="font-normal" />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="space-y-1 text-[13px] font-medium">Name in subject and signature
                    <Input value={cfg.senderName} onChange={(e) => set("senderName", e.target.value)} placeholder={displayName || "Your name"} className="font-normal" />
                  </label>
                  <label className="space-y-1 text-[13px] font-medium">Text for an empty list
                    <Input value={cfg.emptyText} onChange={(e) => set("emptyText", e.target.value)} className="font-normal" />
                  </label>
                  <label className="space-y-1 text-[13px] font-medium">Label of the extra line
                    <Input value={cfg.productDashLabel} onChange={(e) => set("productDashLabel", e.target.value)} className="font-normal" />
                  </label>
                </div>
                <label className="block space-y-1 text-[13px] font-medium">Signature
                  <Textarea rows={4} value={cfg.signature} onChange={(e) => set("signature", e.target.value)} placeholder={"Regards,\n{name}\nCompany | Team"} className="font-normal" />
                </label>
                <label className="block space-y-1 text-[13px] font-medium">Lines ticked automatically in &ldquo;{cfg.headingPlan}&rdquo; (at most)
                  <Input type="number" min={1} max={40} value={cfg.maxPlanItems} onChange={(e) => set("maxPlanItems", Math.min(40, Math.max(1, Number(e.target.value) || 1)))} className="w-24 font-normal" />
                </label>
                <Button onClick={saveTemplate} disabled={saving}>{saving ? "Saving…" : "Save as my default"}</Button>
                <p className="text-xs text-muted-foreground">Saves the recipients, wording, signature and the Product Dash choice for next time. Line edits above are for this week only.</p>
              </div>
            </details>
          </Card>
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <Card className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold tracking-tight">Preview</h2>
              <span className="text-xs text-muted-foreground">{includedCount} {includedCount === 1 ? "line" : "lines"} in the email</span>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-lg bg-muted/50 px-3 py-2 text-[13px]">
              <dt className="text-muted-foreground">To</dt><dd className="truncate">{email.to || "—"}</dd>
              {email.cc && <><dt className="text-muted-foreground">Cc</dt><dd className="truncate">{email.cc}</dd></>}
              <dt className="text-muted-foreground">Subject</dt><dd className="font-medium">{subject}</dd>
            </dl>
            <pre data-testid="email-preview" className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-card p-4 font-sans text-[13px] leading-relaxed">{email.text}</pre>
            <div className="flex flex-wrap gap-2">
              <Button onClick={copyRich}><ClipboardCopy /> Copy email</Button>
              <Button variant="outline" onClick={() => copyPlain(email.text, "Plain text")}>Copy as plain text</Button>
              <Button variant="outline" onClick={() => copyPlain(subject, "Subject")}>Copy subject</Button>
              <a href={mailto} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-[13px] hover:bg-muted"><Mail className="size-4" /> Open in email app</a>
            </div>
            <p className="text-xs text-muted-foreground">
              &ldquo;Copy email&rdquo; keeps the bullet lists when you paste into Gmail or Outlook. {tooLongForMailto && <span className="text-amber-700 dark:text-amber-400">This email is long, and some email apps cut long links, so prefer Copy. </span>}
              &ldquo;Open in email app&rdquo; fills the recipients only if you typed email addresses.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
