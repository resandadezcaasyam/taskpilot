import { Badge } from "@/components/ui/misc";

const UAT: Record<string, string> = {
  "Not Started": "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  Preparing: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  "In Progress": "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  Blocked: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  Retesting: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "Ready for Sign-off": "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  Completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
};
const ISSUE: Record<string, string> = {
  Reported: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  Validating: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
  Escalated: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  Investigating: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "Fix In Progress": "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  "Pending Verification": "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  Resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  Closed: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};
const RESULT: Record<string, string> = {
  Pass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  Fail: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  Blocked: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "Not Run": "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};
const SIGNOFF: Record<string, string> = {
  Pending: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  Requested: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "Signed Off": "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  Rejected: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};
const pill = (map: Record<string, string>) => function Pill({ value }: { value: string }) {
  return <Badge className={map[value] ?? "bg-muted text-foreground"}>{value}</Badge>;
};
export const UatStatusPill = pill(UAT);
export const IssueStatusPill = pill(ISSUE);
export const ResultPill = pill(RESULT);
export const SignOffPill = pill(SIGNOFF);
