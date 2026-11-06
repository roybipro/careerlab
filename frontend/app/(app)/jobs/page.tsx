import { Suspense } from "react";
import { DataSkeleton } from "@/components/data-state";
import { JobsList } from "@/components/jobs/jobs-list";

export const metadata = { title: "Job Applications" };

export default function Page() {
  // JobsList reads the URL search parameters, which needs a Suspense boundary.
  return (
    <Suspense fallback={<DataSkeleton />}>
      <JobsList />
    </Suspense>
  );
}
