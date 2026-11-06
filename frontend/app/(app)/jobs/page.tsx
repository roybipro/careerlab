import { EmptyState } from "@/components/data-state";
import { PageHeader } from "@/components/page-header";

export default function Page() {
  return (
    <>
      <PageHeader title="Job Applications" description="Track every application from saved to offer." />
      <EmptyState title="Coming soon" description="This page is not built yet." />
    </>
  );
}
