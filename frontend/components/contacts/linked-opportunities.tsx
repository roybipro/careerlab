"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Plus, Unlink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataState } from "@/components/data-state";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { invalidateContacts } from "@/lib/keys";
import { entityHref } from "@/lib/navigation";
import type { ContactDetail, ContactLink, Job, Paginated, Research } from "@/lib/types";
import { useDebounced } from "@/lib/use-debounced";

type Kind = "job" | "research";
type Option = { id: string; label: string };

const KINDS = [
  { value: "job", label: "Job application" },
  { value: "research", label: "Research opportunity" },
];

/** Jobs or research matching the search, as picker options. */
function useOptions(kind: Kind, search: string, enabled: boolean) {
  return useQuery({
    queryKey: ["link-options", kind, search],
    enabled,
    queryFn: async (): Promise<Paginated<Option>> => {
      if (kind === "job") {
        const r = await api<Paginated<Job>>("/jobs", { query: { q: search, page_size: 20 } });
        return { ...r, items: r.items.map((j) => ({ id: j.id, label: `${j.position_title} at ${j.company_name}` })) };
      }
      const r = await api<Paginated<Research>>("/research", { query: { q: search, page_size: 20 } });
      return { ...r, items: r.items.map((x) => ({ id: x.id, label: `${x.title} (${x.organization})` })) };
    },
  });
}

/** Jobs and research a contact is linked to, with link and unlink. The picker follows LinkedContacts. */
export function LinkedOpportunities({ contact }: { contact: ContactDetail }) {
  const client = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("job");
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search.trim(), 300);
  const options = useOptions(kind, debounced, pickerOpen);
  const [unlinking, setUnlinking] = useState<ContactLink | null>(null);

  // ["contacts"] covers this contact's detail and every record's linked-contacts panel; activity and dashboard follow.
  const refresh = () => invalidateContacts(client);
  const linkedIds = new Set(contact.links.filter((l) => l.entity_type === kind).map((l) => l.entity_id));

  const add = useMutation({
    mutationFn: (id: string) => api<ContactLink>(`/contacts/${contact.id}/links`, { method: "POST", body: { entity_type: kind, entity_id: id } }),
    onSuccess: () => {
      setPickerOpen(false);
      void refresh();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not link."),
  });

  const remove = useMutation({
    mutationFn: (link: ContactLink) => api<void>(`/contacts/${contact.id}/links/${link.id}`, { method: "DELETE" }),
    onSuccess: () => {
      setUnlinking(null);
      void refresh();
    },
    onError: (e) => {
      setUnlinking(null);
      toast.error(e instanceof ApiError ? e.message : "Could not remove the link.");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Link2 aria-hidden="true" />
          Linked opportunities
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setSearch("");
            setPickerOpen(true);
          }}
        >
          <Plus data-icon="inline-start" />
          Link to a job or research
        </Button>
        {contact.links.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not linked to any job or research opportunity yet. Use the button above to link one.</p>
        ) : (
          <ul className="divide-y">
            {contact.links.map((l) => (
              <li key={l.id} className="flex items-center gap-2 py-2.5">
                <Link href={entityHref(l.entity_type, l.entity_id)} className="flex min-w-0 flex-1 items-center gap-3 hover:underline">
                  <Badge variant="secondary">{l.entity_type === "job" ? "Job" : "Research"}</Badge>
                  <span className="min-w-0 flex-1 text-sm break-words">{l.label}</span>
                </Link>
                <Button variant="ghost" size="icon-xs" aria-label={`Remove link to ${l.label}`} onClick={() => setUnlinking(l)}>
                  <Unlink />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link to a job or research</DialogTitle>
            <DialogDescription>Pick a record to link {contact.name} to.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <NativeSelect label="Type" options={KINDS} value={kind} onChange={(e) => setKind(e.target.value as Kind)} />
            <Input type="search" aria-label="Search records" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
            <DataState
              query={options}
              empty={<p className="py-4 text-center text-sm text-muted-foreground">{debounced ? "Nothing matches." : kind === "job" ? "You have no jobs yet." : "You have no research opportunities yet."}</p>}
            >
              {(data) => (
                <ul className="max-h-72 space-y-1 overflow-y-auto">
                  {data.items.map((o) => (
                    <li key={o.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted">
                      <span className="min-w-0 flex-1 text-sm break-words">{o.label}</span>
                      {linkedIds.has(o.id) ? (
                        <span className="text-xs text-muted-foreground">Linked</span>
                      ) : (
                        <Button size="sm" variant="outline" disabled={add.isPending} aria-label={`Link ${o.label}`} onClick={() => add.mutate(o.id)}>
                          Link
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </DataState>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={unlinking !== null}
        onOpenChange={(open) => !open && setUnlinking(null)}
        title="Remove this link?"
        description="The contact is unlinked from this record. The contact and the record are both kept."
        confirmLabel="Remove link"
        pending={remove.isPending}
        onConfirm={() => unlinking && remove.mutate(unlinking)}
      />
    </Card>
  );
}
