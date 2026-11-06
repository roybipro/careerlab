import { Suspense } from "react";
import { ContactsList } from "@/components/contacts/contacts-list";
import { DataSkeleton } from "@/components/data-state";

export const metadata = { title: "Contacts" };

export default function Page() {
  // ContactsList reads the URL search parameters, which needs a Suspense boundary.
  return (
    <Suspense fallback={<DataSkeleton />}>
      <ContactsList />
    </Suspense>
  );
}
