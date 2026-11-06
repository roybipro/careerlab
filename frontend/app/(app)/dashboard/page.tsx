"use client";

import { DataState, EmptyState } from "@/components/data-state";
import { PageHeader } from "@/components/page-header";
import { useCurrentUser } from "@/lib/auth";

export default function DashboardPage() {
  const user = useCurrentUser();
  return (
    <>
      <DataState query={user}>
        {(u) => <PageHeader title={`Welcome, ${u.full_name.split(" ")[0]}`} description="Your pipeline at a glance." />}
      </DataState>
      <EmptyState title="Dashboard coming soon" description="Summary cards, pipelines and deadlines arrive in a later release." />
    </>
  );
}
