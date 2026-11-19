import type { Metadata } from "next";
import { CalendarView } from "@/components/calendar-view";
import { isValidKey, rangeFor, type CalView } from "@/lib/calendar";
import { getCalendarEvents } from "@/lib/calendar-data";
import { dateKey } from "@/lib/dates";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const sp = await searchParams;
  const today = dateKey(new Date());
  const view: CalView = sp.view === "week" || sp.view === "day" ? sp.view : "month";
  const key = isValidKey(sp.date) ? sp.date : today;
  const { from, to } = rangeFor(view, key);
  const events = await getCalendarEvents(from, to);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
        <p className="mt-1 text-sm text-muted-foreground">Deadlines, follow-ups, UAT targets, milestones and planned work, in Jakarta time. Drag an item to another day to reschedule it, or click it for details.</p>
      </div>
      <CalendarView events={events} view={view} dateKey={key} todayKey={today} />
    </div>
  );
}
