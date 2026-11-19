import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHEAT_SHEET } from "@/lib/bulk-parse";
import { NAV_ITEMS } from "@/lib/nav";

/** Keeps the READMEs honest: everything they point at must really exist in the app. */
const read = (f: string) => fs.readFileSync(path.resolve(f), "utf8");
const docs = { "README.md": read("README.md"), "README.id.md": read("README.id.md") };

function routeExists(route: string): boolean {
  const segs = route.split("?")[0].replace(/\/$/, "").split("/").filter(Boolean);
  const walk = (dir: string, i: number): boolean => {
    if (i === segs.length) return fs.existsSync(path.join(dir, "page.tsx")) || fs.existsSync(path.join(dir, "route.ts"));
    return fs.readdirSync(dir, { withFileTypes: true }).some((e) => e.isDirectory() && (e.name === segs[i] || e.name.startsWith("[")) && walk(path.join(dir, e.name), i + 1));
  };
  return walk(path.resolve("src/app"), 0);
}
const codeSpans = (md: string) => [...md.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);

describe.each(Object.entries(docs))("%s", (name, md) => {
  it("every /route it mentions is a real page or API route", () => {
    const routes = codeSpans(md).filter((c) => /^\/[a-z0-9][a-z0-9\-/[\]?=&._%]*$/i.test(c) && !c.includes("<"));
    expect(routes.length).toBeGreaterThan(0);
    for (const r of routes) expect(routeExists(r), `${name}: ${r}`).toBe(true);
  });
  it("every npm script it tells you to run exists", () => {
    const scripts = JSON.parse(read("package.json")).scripts as Record<string, string>;
    const used = [...md.matchAll(/npm(?:\.cmd)? run ([\w:-]+)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const s of used) expect(scripts[s], `${name}: npm run ${s}`).toBeTruthy();
    for (const bare of [...md.matchAll(/npm(?:\.cmd)? (test|start)\b/g)].map((m) => m[1])) expect(scripts[bare], `${name}: npm ${bare}`).toBeTruthy();
  });
  it("every file it names exists", () => {
    const files = codeSpans(md).filter((c) => /^[\w./-]+\.(bat|sh|ps1|mjs|md|json)$/.test(c) && !c.startsWith("backup") && !c.includes("auto-") && !c.startsWith("pre-restore") && c !== "backup.json" && !(c.endsWith(".sh") && !/^(\.\/)?scripts\//.test(c)));
    for (const f of files) expect(fs.existsSync(path.resolve(f)) || fs.existsSync(path.resolve("scripts", f)), `${name}: ${f}`).toBe(true);
  });
});

describe("README.id.md covers the whole app", () => {
  const md = docs["README.id.md"];
  it("explains every sidebar menu by its real name", () => {
    for (const item of NAV_ITEMS) expect(md, item.label).toContain(item.label);
  });
  it("lists every Brain Dump shortcut with the same examples the app shows", () => {
    for (const c of CHEAT_SHEET) expect(md, c.example).toContain(c.example);
  });
  it("links to the English README and back", () => {
    expect(md).toContain("[README.md](README.md)");
    expect(docs["README.md"]).toContain("[README.id.md](README.id.md)");
  });
  it("mentions the key screens' buttons and the safety rules", () => {
    for (const phrase of ["Already done", "Mark action complete", "Request sign-off", "Replace everything", "REPLACE", "Preview what will happen", "Carried over", "Add my daily routine", "start-taskpilot.bat", "npm.cmd"]) expect(md, phrase).toContain(phrase);
  });
});
