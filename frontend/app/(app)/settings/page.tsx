import { EmptyState } from "@/components/data-state";
import { PageHeader } from "@/components/page-header";

export default function Page() {
  return (
    <>
      <PageHeader title="Settings" description="Your profile and password." />
      <EmptyState title="Coming soon" description="This page is not built yet." />
    </>
  );
}
