import { Suspense } from "react";
import { DataSkeleton } from "@/components/data-state";
import { RemindersList } from "@/components/reminders/reminders-list";

export const metadata = { title: "Reminders" };

export default function Page() {
  // RemindersList reads the URL search parameters, which needs a Suspense boundary.
  return (
    <Suspense fallback={<DataSkeleton />}>
      <RemindersList />
    </Suspense>
  );
}
