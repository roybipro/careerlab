import { EmptyState } from "@/components/data-state";
import { PageHeader } from "@/components/page-header";

export default function Page() {
  return (
    <>
      <PageHeader title="Reminders" description="Deadlines and follow-ups." />
      <EmptyState title="Coming soon" description="This page is not built yet." />
    </>
  );
}
