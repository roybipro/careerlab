import { EmptyState } from "@/components/data-state";
import { PageHeader } from "@/components/page-header";

export default function Page() {
  return (
    <>
      <PageHeader title="Contacts" description="People who can help with your search." />
      <EmptyState title="Coming soon" description="This page is not built yet." />
    </>
  );
}
