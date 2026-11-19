import { toInputDate } from "./dates";
import type { TaskFormValues } from "./validators";

export const EMPTY_TASK_FORM: TaskFormValues = {
  title: "",
  description: "",
  projectId: "",
  category: "Other",
  priority: "Medium",
  status: "To Do",
  startDate: "",
  dueDate: "",
  assignee: "",
  stakeholder: "",
  estimatedHours: "",
  actualHours: "",
  progress: "0",
  businessImportance: "3",
  nextAction: "",
  nextActionDue: "",
  blockerDescription: "",
  waitingFor: "",
  followUpDate: "",
  tags: "",
  notes: "",
};

interface TaskLike {
  title: string;
  description: string | null;
  projectId: string | null;
  category: string;
  priority: string;
  status: string;
  startDate: Date | null;
  dueDate: Date | null;
  assignee: string | null;
  stakeholder: string | null;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  progress: number;
  businessImportance: number;
  nextAction: string | null;
  nextActionDue: Date | null;
  blockerDescription: string | null;
  waitingFor: string | null;
  followUpDate: Date | null;
  notes: string | null;
  tags: { tag: { name: string } }[];
}

const hours = (m: number | null) => (m ? String(Math.round((m / 60) * 100) / 100) : "");

export function taskToFormValues(t: TaskLike): TaskFormValues {
  return {
    title: t.title,
    description: t.description ?? "",
    projectId: t.projectId ?? "",
    category: t.category as TaskFormValues["category"],
    priority: t.priority as TaskFormValues["priority"],
    status: t.status as TaskFormValues["status"],
    startDate: toInputDate(t.startDate),
    dueDate: toInputDate(t.dueDate),
    assignee: t.assignee ?? "",
    stakeholder: t.stakeholder ?? "",
    estimatedHours: hours(t.estimatedMinutes),
    actualHours: hours(t.actualMinutes),
    progress: String(t.progress),
    businessImportance: String(t.businessImportance),
    nextAction: t.nextAction ?? "",
    nextActionDue: toInputDate(t.nextActionDue),
    blockerDescription: t.blockerDescription ?? "",
    waitingFor: t.waitingFor ?? "",
    followUpDate: toInputDate(t.followUpDate),
    tags: t.tags.map((x) => x.tag.name).join(", "),
    notes: t.notes ?? "",
  };
}
