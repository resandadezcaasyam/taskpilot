import { describe, expect, it } from "vitest";
import { MAX_BRAIN_DUMP_LINES, matchProject, parseBrainDump, type BrainDumpContext } from "@/lib/bulk-parse";
import { taskFormSchema } from "@/lib/validators";

const now = new Date("2026-11-19T03:00:00Z"); // Thu 19 Nov 2026, Jakarta
const projects = [{ id: "p1", name: "UAT Booking" }, { id: "p2", name: "HSE Portal" }];
const ctx = (over: Partial<BrainDumpContext["defaults"]> = {}, ps = projects): BrainDumpContext => ({ projects: ps, defaults: { status: "To Do", priority: "Medium", category: "Other", projectId: "", ...over } });
const one = (line: string, c = ctx()) => {
  const r = parseBrainDump(line, c, now);
  expect(r.items).toHaveLength(1);
  return r.items[0];
};

describe("Brain Dump shortcuts", () => {
  it("reads many fields from one short line", () => {
    const l = one("Follow up Andi about timestamp tomorrow !h @booking ~15m #uat");
    expect(l.values).toMatchObject({ title: "Follow up Andi about timestamp", projectId: "p1", priority: "High", estimatedHours: "0.25", followUpDate: "2026-11-20", dueDate: "", category: "Stakeholder Follow-up", tags: "uat", status: "To Do" });
    expect(l.warnings).toEqual([]);
    expect(l.detected.join(" ")).toContain("Project: UAT Booking");
  });
  it("priority forms", () => {
    expect(one("a !").values.priority).toBe("High");
    expect(one("a !!").values.priority).toBe("Critical");
    expect(one("a !c").values.priority).toBe("Critical");
    expect(one("a !l").values.priority).toBe("Low");
    expect(one("a !medium").values.priority).toBe("Medium");
    expect(one("urgent fix").values.priority).toBe("High"); // plain words still work
    expect(one("a !h", ctx({ priority: "Low" })).values.priority).toBe("High"); // explicit beats the default
  });
  it("estimates in minutes and hours, English and Indonesian", () => {
    expect(one("a ~1.5h").values.estimatedHours).toBe("1.5");
    expect(one("a ~90m").values.estimatedHours).toBe("1.5");
    expect(one("a ~2jam").values.estimatedHours).toBe("2");
    expect(one("a ~30").values.estimatedHours).toBe("0.5");
    expect(one("a ~40h").warnings[0]).toMatch(/more than 24 hours/);
  });
  it("waiting, progress and next step", () => {
    expect(one("Operational issue update >Engineering").values).toMatchObject({ status: "Waiting for Others", waitingFor: "Engineering", title: "Operational issue update" });
    expect(one('API fix >"Backend team"').values.waitingFor).toBe("Backend team");
    expect(one("[~] Draft test plan %40").values).toMatchObject({ status: "In Progress", progress: "40" });
    expect(one("a %250").warnings[0]).toMatch(/cannot be more than 100/);
    expect(one("Prepare slides => collect numbers first").values).toMatchObject({ title: "Prepare slides", nextAction: "collect numbers first" });
  });
  it("status markers: finished work, in progress, blocked", () => {
    const done = one("[x] Retest booking cases @hse tomorrow");
    expect(done.values).toMatchObject({ status: "Done", progress: "100", projectId: "p2", dueDate: "", followUpDate: "" });
    expect(one("done: Sent release notes").values.status).toBe("Done");
    expect(one("✓ Sent weekly report").values.status).toBe("Done");
    expect(one("- [x] Sent weekly report").values.title).toBe("Sent weekly report");
    expect(one("doing: Review PRD").values.status).toBe("In Progress");
    const b = one("blocked: Vendor compliance => backend timestamp missing");
    expect(b.values).toMatchObject({ status: "Blocked", title: "Vendor compliance", blockerDescription: "backend timestamp missing", nextAction: "" });
    expect(b.warnings).toEqual([]);
    expect(one("blocked: Vendor compliance").warnings[0]).toMatch(/need a reason/);
  });
  it("ignores bullets, numbering, blank lines, headings and separators", () => {
    const r = parseBrainDump("# Monday\n\n- Task A\n2) Task B\n• Task C\n---\n// note to self\n   \n1. Task D", ctx(), now);
    expect(r.items.map((i) => i.values.title)).toEqual(["Task A", "Task B", "Task C", "Task D"]);
    expect(one("#uat check the dashboard").values).toMatchObject({ tags: "uat", title: "Check the dashboard" }); // "#word" is a tag, "# word" a heading
  });
  it("applies the page defaults, and explicit shortcuts override them", () => {
    const d = ctx({ status: "Done", priority: "High", category: "UAT / QA", projectId: "p2" });
    expect(one("Check dashboard", d).values).toMatchObject({ status: "Done", priority: "High", category: "UAT / QA", projectId: "p2", progress: "100" });
    expect(one("Check dashboard @booking", d).values.projectId).toBe("p1");
    expect(one("blocked: X => y", d).values.status).toBe("Blocked");
  });
  it("projects: unique partial match, quoted names, ambiguity and unknown names are explained, never guessed", () => {
    expect(matchProject("booking", projects)).toEqual({ id: "p1", name: "UAT Booking" });
    expect(matchProject("uat-booking", projects).id).toBe("p1");
    const two = [...projects, { id: "p3", name: "UAT Billing" }];
    expect(matchProject("uat", two).ambiguous).toEqual(["UAT Booking", "UAT Billing"]);
    expect(matchProject("uat booking", two).id).toBe("p1");
    expect(one("x @uat", ctx({}, two)).warnings[0]).toMatch(/matches several projects/);
    expect(one("x @uat", ctx({}, two)).values.projectId).toBe("");
    expect(one("x @zzz").warnings[0]).toMatch(/No project matches @zzz/);
    expect(one('x @"hse portal"').values.projectId).toBe("p2");
    expect(one("mail a@b.com about x").warnings).toEqual([]); // an email address is not a project
  });
  it("Indonesian works too", () => {
    const l = one("besok follow up Andi soal API !c");
    expect(l.values).toMatchObject({ followUpDate: "2026-11-20", priority: "Critical", category: "Stakeholder Follow-up" });
  });
  it("keeps identical lines apart and caps very long pastes", () => {
    const r = parseBrainDump("Same\nSame", ctx(), now);
    expect(new Set(r.items.map((i) => i.key)).size).toBe(2);
    const many = parseBrainDump(Array.from({ length: 130 }, (_, i) => `Task ${i}`).join("\n"), ctx(), now);
    expect(many.items).toHaveLength(MAX_BRAIN_DUMP_LINES);
    expect(many.truncated).toBe(30);
    expect(one("x".repeat(300)).values.title).toHaveLength(200);
  });
  it("every parsed line is a valid task form unless a warning says otherwise (no surprises at save time)", () => {
    const lines = ["Follow up Andi tomorrow !h @booking ~15m #uat", "[x] Sent weekly report", "doing: Review PRD %30 => finish section 3", "API fix >Andi", "Write PRD 25 Nov ~2h", "Buy coffee", "besok rapat dengan finance", "blocked: Vendor => timestamp"];
    for (const l of lines) {
      const p = one(l);
      expect(taskFormSchema.safeParse(p.values).success, l).toBe(true);
      expect(p.warnings, l).toEqual([]);
    }
    const bad = one("blocked: Vendor compliance");
    expect(taskFormSchema.safeParse(bad.values).success).toBe(false); // the warning is the same problem the form would report
  });
  it("never throws on odd input", () => {
    const pieces = ["!", "!!!", "@", '@"', ">", ">>", "~", "~~5", "%", "%999", "=>", "=> =>", "#", "##", "[x]", "[", "]", "😀", "\t", "\\", "'", '"', "tomorrow", "2026-02-31", "31/02", "next", "blocked:", "done:"];
    let seed = 7;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let n = 0; n < 400; n++) {
      const line = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => pieces[Math.floor(rnd() * pieces.length)]).join(rnd() < 0.5 ? " " : "");
      const r = parseBrainDump(line, ctx(), now);
      for (const i of r.items) {
        expect(i.values.title.length).toBeLessThanOrEqual(200);
        expect(Object.values(i.values).every((v) => typeof v === "string")).toBe(true);
      }
    }
  });
});
