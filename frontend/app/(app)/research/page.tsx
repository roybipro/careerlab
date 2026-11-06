import { Suspense } from "react";
import { DataSkeleton } from "@/components/data-state";
import { ResearchList } from "@/components/research/research-list";

export const metadata = { title: "Research Opportunities" };

export default function Page() {
  // ResearchList reads the URL search parameters, which needs a Suspense boundary.
  return (
    <Suspense fallback={<DataSkeleton />}>
      <ResearchList />
    </Suspense>
  );
}
