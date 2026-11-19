import { z } from "zod";
import { ISSUE_CATEGORIES, ISSUE_SEVERITIES } from "./issues";
import { SIGNOFF_STATUSES, TEST_RESULT_VALUES, UAT_STATUSES } from "./uat";
import {
  PROJECT_STATUSES,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "./constants";

// Form values are plain strings so they map 1:1 onto <input> elements.
const optionalDate = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Use a valid date");
const optionalNumber = z.string().regex(/^(\d+(\.\d+)?)?$/, "Enter a positive number");

export const taskFormSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200, "Keep the title under 200 characters"),
    description: z.string().max(5000),
    projectId: z.string(),
    category: z.enum(TASK_CATEGORIES),
    priority: z.enum(TASK_PRIORITIES),
    status: z.enum(TASK_STATUSES),
    startDate: optionalDate,
    dueDate: optionalDate,
    assignee: z.string().max(120),
    stakeholder: z.string().max(120),
    estimatedHours: optionalNumber,
    actualHours: optionalNumber,
    progress: z.string().regex(/^(100|[1-9]?\d)$/, "Progress must be between 0 and 100"),
    businessImportance: z.string().regex(/^[1-5]$/, "Choose 1 to 5"),
    nextAction: z.string().max(500),
    nextActionDue: optionalDate,
    blockerDescription: z.string().max(2000),
    waitingFor: z.string().max(200),
    followUpDate: optionalDate,
    tags: z.string().max(300),
    notes: z.string().max(10000),
  })
  .superRefine((v, ctx) => {
    if (v.startDate && v.dueDate && v.dueDate < v.startDate) {
      ctx.addIssue({ code: "custom", path: ["dueDate"], message: "Due date cannot be before the start date" });
    }
    if (v.status === "Blocked" && !v.blockerDescription.trim()) {
      ctx.addIssue({ code: "custom", path: ["blockerDescription"], message: "Describe what is blocking this task" });
    }
    if (v.status === "Waiting for Others" && !v.waitingFor.trim()) {
      ctx.addIssue({ code: "custom", path: ["waitingFor"], message: "Say who or what you are waiting for" });
    }
  });
export type TaskFormValues = z.infer<typeof taskFormSchema>;

export const projectFormSchema = z
  .object({
    name: z.string().trim().min(1, "Project name is required").max(150),
    description: z.string().max(5000),
    owner: z.string().max(120),
    category: z.string().max(120),
    priority: z.enum(TASK_PRIORITIES),
    status: z.enum(PROJECT_STATUSES),
    startDate: optionalDate,
    targetDate: optionalDate,
    risks: z.string().max(5000),
    notes: z.string().max(10000),
  })
  .superRefine((v, ctx) => {
    if (v.startDate && v.targetDate && v.targetDate < v.startDate) {
      ctx.addIssue({ code: "custom", path: ["targetDate"], message: "Target date cannot be before the start date" });
    }
  });
export type ProjectFormValues = z.infer<typeof projectFormSchema>;

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

// ---------- UAT ----------
const optionalInt = z.string().regex(/^(\d{1,6})?$/, "Enter a whole number");

export const uatFeatureSchema = z
  .object({
    name: z.string().trim().min(1, "Feature name is required").max(200),
    projectId: z.string(),
    releaseVersion: z.string().max(60),
    environment: z.string().max(60),
    owner: z.string().max(120),
    startDate: optionalDate,
    targetDate: optionalDate,
    status: z.enum(UAT_STATUSES),
    signOffStatus: z.enum(SIGNOFF_STATUSES),
    remarks: z.string().max(5000),
    manualTotal: optionalInt,
    manualPassed: optionalInt,
    manualFailed: optionalInt,
    manualBlocked: optionalInt,
  })
  .superRefine((v, ctx) => {
    if (v.startDate && v.targetDate && v.targetDate < v.startDate) {
      ctx.addIssue({ code: "custom", path: ["targetDate"], message: "Target date cannot be before the start date" });
    }
    const n = (x: string) => (x ? Number(x) : 0);
    if (!v.manualTotal && (v.manualPassed || v.manualFailed || v.manualBlocked)) {
      ctx.addIssue({ code: "custom", path: ["manualTotal"], message: "Enter the total number of test cases" });
    }
    if (v.manualTotal && n(v.manualPassed) + n(v.manualFailed) + n(v.manualBlocked) > n(v.manualTotal)) {
      ctx.addIssue({ code: "custom", path: ["manualTotal"], message: "Passed + failed + blocked cannot exceed the total" });
    }
  });
export type UatFeatureValues = z.infer<typeof uatFeatureSchema>;

export const testCaseSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  prerequisites: z.string().max(5000),
  steps: z.string().max(5000),
  expectedResult: z.string().max(5000),
  actualResult: z.string().max(5000),
  result: z.enum(TEST_RESULT_VALUES),
  remarks: z.string().max(5000),
  linkedBug: z.string().max(200),
});
export type TestCaseValues = z.infer<typeof testCaseSchema>;

// ---------- Issues ----------
export const issueFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(250),
  description: z.string().max(10000),
  projectId: z.string(),
  category: z.enum(ISSUE_CATEGORIES),
  severity: z.enum(ISSUE_SEVERITIES),
  reportedBy: z.string().max(120),
  responsiblePic: z.string().max(120),
  reportedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date it was reported"),
  rootCause: z.string().max(5000),
  impact: z.string().max(5000),
  workaround: z.string().max(5000),
  expectedResolution: optionalDate,
  nextFollowUpDate: optionalDate,
});
export type IssueFormValues = z.infer<typeof issueFormSchema>;
