import { EmptyState } from "@/components/data-state";
import { PageHeader } from "@/components/page-header";

export default function Page() {
  return (
    <>
      <PageHeader title="Research Opportunities" description="Labs, fellowships and programs you are pursuing." />
      <EmptyState title="Coming soon" description="This page is not built yet." />
    </>
  );
}
