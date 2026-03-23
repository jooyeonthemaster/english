import { format } from "date-fns";
import { getCalendarEvents } from "@/actions/communication";
import CalendarClient from "./calendar-client";

export default async function CalendarPage() {
  const currentMonth = format(new Date(), "yyyy-MM");
  const events = await getCalendarEvents(currentMonth);

  return <CalendarClient initialEvents={events} initialMonth={currentMonth} />;
}
