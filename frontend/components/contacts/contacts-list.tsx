"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus, SearchX, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ContactFormDialog } from "@/components/contacts/contact-form";
import { DataState, EmptyState } from "@/components/data-state";
import { ListToolbar, useListParams, usePageClamp, type ToolbarFilter } from "@/components/list-toolbar";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { ContactTypeBadge } from "@/components/contacts/contact-type-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { CONTACT_TYPES, type Option } from "@/lib/enums";
import { formatDateOnly, initials, localToday } from "@/lib/format";
import { keys } from "@/lib/keys";
import type { Contact, Paginated } from "@/lib/types";

const PAGE_SIZE = 20;

const FILTERS: ToolbarFilter[] = [
  { type: "select", key: "contact_type", label: "Type", options: CONTACT_TYPES },
  {
    type: "select",
    key: "entity_type",
    label: "Linked to",
    options: [
      { value: "job", label: "A job application" },
      { value: "research", label: "A research opportunity" },
    ],
  },
  { type: "select", key: "follow_up_due", label: "Follow-up", options: [{ value: "true", label: "Due or overdue" }] },
];

// Values match SORT_FIELDS in backend/app/modules/contacts/service.py. The first is the API default.
const SORT_OPTIONS: Option[] = [
  { value: "name", label: "Name A-Z" },
  { value: "-name", label: "Name Z-A" },
  { value: "organization", label: "Organization A-Z" },
  { value: "-created_at", label: "Newest added" },
  { value: "-updated_at", label: "Recently updated" },
  { value: "next_follow_up_at", label: "Follow-up, soonest" },
  { value: "-last_contacted_at", label: "Contacted, latest" },
];

function subtitle(c: Contact) {
  return [c.position, c.organization].filter(Boolean).join(" at ");
}

/** Needs a Suspense boundary above it: the toolbar reads the URL search parameters. */
export function ContactsList() {
  const { get, page, update } = useListParams();
  const [adding, setAdding] = useState(false);

  const filterValues = Object.fromEntries(["q", ...FILTERS.map((f) => f.key)].map((k) => [k, get(k)]));
  const sort = SORT_OPTIONS.some((o) => o.value === get("sort")) ? get("sort") : "";
  const filtersActive = Object.values(filterValues).some(Boolean);
  // "Due today" follows the browser's date, sent only when that filter is on.
  const params = { ...filterValues, sort, page, page_size: PAGE_SIZE, today: filterValues.follow_up_due ? localToday() : "" };

  const query = useQuery({
    queryKey: keys.list("contact", params),
    queryFn: () => api<Paginated<Contact>>("/contacts", { query: params }),
    placeholderData: keepPreviousData,
  });
  usePageClamp(query, page, update);

  const empty = filtersActive ? (
    <EmptyState icon={SearchX} title="No contacts match" description="Try different search words, or clear the filters." />
  ) : (
    <EmptyState
      icon={Users}
      title="No contacts yet"
      description="Keep track of recruiters, professors and anyone who can help, then link them to your applications."
      action={
        <Button onClick={() => setAdding(true)}>
          <Plus data-icon="inline-start" />
          Add your first contact
        </Button>
      }
    />
  );

  return (
    <>
      <PageHeader
        title="Contacts"
        icon={Users}
        description="People who can help with your search."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus data-icon="inline-start" />
            Add contact
          </Button>
        }
      />
      <ListToolbar filters={FILTERS} searchPlaceholder="Search name, email, organization or position" sortOptions={SORT_OPTIONS} />
      <DataState query={query} empty={empty}>
        {(data) => (
          <>
            <div className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Organization</TableHead>
                    <TableHead>Last contacted</TableHead>
                    <TableHead>Next follow-up</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2.5">
                          <Avatar size="sm" aria-hidden="true">
                            <AvatarFallback className="bg-accent font-medium text-accent-foreground">{initials(c.name)}</AvatarFallback>
                          </Avatar>
                          <Link href={`/contacts/${c.id}`} className="underline-offset-4 hover:text-link hover:underline">
                            {c.name}
                          </Link>
                        </span>
                      </TableCell>
                      <TableCell>{c.contact_type ? <ContactTypeBadge type={c.contact_type} /> : <span className="text-muted-foreground">-</span>}</TableCell>
                      <TableCell className="max-w-72 whitespace-normal text-muted-foreground">{subtitle(c) || "-"}</TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">{formatDateOnly(c.last_contacted_at) ?? "-"}</TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">{formatDateOnly(c.next_follow_up_at) ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:hidden">
              {data.items.map((c) => (
                <li key={c.id}>
                  <Link href={`/contacts/${c.id}`} className="block h-full rounded-2xl border bg-card p-4 shadow-card transition-shadow hover:shadow-lift">
                    <p className="font-semibold break-words">{c.name}</p>
                    {subtitle(c) ? <p className="text-sm break-words text-muted-foreground">{subtitle(c)}</p> : null}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {c.contact_type ? <ContactTypeBadge type={c.contact_type} /> : null}
                      {c.next_follow_up_at ? <span className="text-xs text-muted-foreground">Follow up {formatDateOnly(c.next_follow_up_at)}</span> : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPageChange={(p) => update({ page: String(p) })} />
          </>
        )}
      </DataState>
      <ContactFormDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}
