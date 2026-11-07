import { Suspense } from "react";
import { DataSkeleton } from "@/components/data-state";
import { ProjectsList } from "@/components/projects/projects-list";

export const metadata = { title: "Research Projects" };

export default function Page() {
  // ProjectsList reads the URL search parameters, which needs a Suspense boundary.
  return (
    <Suspense fallback={<DataSkeleton />}>
      <ProjectsList />
    </Suspense>
  );
}
