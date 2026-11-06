"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Unlink, Users } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataState, EmptyState } from "@/components/data-state";
import { NativeSelect } from "@/components/native-select";
import { TextField } from "@/components/text-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, applyServerErrors, ApiError } from "@/lib/api";
import { CONTACT_TYPES, optionLabel, type EntityType } from "@/lib/enums";
import { keys } from "@/lib/keys";
import type { Contact, ContactDetail, Paginated } from "@/lib/types";
import { useDebounced } from "@/lib/use-debounced";

type Linkable = Exclude<EntityType, "contact">;

function contactSubtitle(c: Contact) {
  return [optionLabel(CONTACT_TYPES, c.contact_type), c.position, c.organization].filter(Boolean).join(" · ");
}

function NewContactForm({ onCreate, pending, error }: { onCreate: (v: { name: string; contact_type: string }) => void; pending: boolean; error: string | null }) {
  const { register, handleSubmit, formState: { errors } } = useForm({ defaultValues: { name: "", contact_type: "other" } });
  return (
    <form noValidate className="space-y-3" onSubmit={handleSubmit((v) => onCreate({ name: v.name.trim(), contact_type: v.contact_type }))}>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <TextField label="Name" error={errors.name?.message} {...register("name", { validate: (v) => v.trim() !== "" || "Enter a name" })} />
      <NativeSelect label="Contact type" options={CONTACT_TYPES} {...register("contact_type")} />
      <Button type="submit" disabled={pending}>
        {pending ? "Creating..." : "Create and link"}
      </Button>
    </form>
  );
}

/**
 * Contacts linked to a job or research record. Link an existing contact from a searchable
 * list, or create a first one inline when the user has no contacts at all.
 */
export function LinkedContacts({ entityType, entityId }: { entityType: Linkable; entityId: string }) {
  const client = useQueryClient();
  const linkedKey = keys.linkedContacts(entityType, entityId);
  const linked = useQuery({
    queryKey: linkedKey,
    queryFn: () => api<Paginated<Contact>>("/contacts", { query: { entity_type: entityType, entity_id: entityId, page_size: 100 } }),
  });

  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search.trim(), 300);
  const options = useQuery({
    queryKey: keys.contactOptions(debounced),
    queryFn: () => api<Paginated<Contact>>("/contacts", { query: { q: debounced, page_size: 20 } }),
    enabled: pickerOpen,
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState<Contact | null>(null);

  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["contacts"] }),
      client.invalidateQueries({ queryKey: keys.activity(entityType, entityId) }),
      client.invalidateQueries({ queryKey: keys.dashboard }),
    ]);

  const link = (contactId: string) =>
    api<void>(`/contacts/${contactId}/links`, { method: "POST", body: { entity_type: entityType, entity_id: entityId } });

  const add = useMutation({
    mutationFn: (contact: Contact) => link(contact.id),
    onSuccess: () => {
      setPickerOpen(false);
      void refresh();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not link the contact."),
  });

  const create = useMutation({
    mutationFn: async (v: { name: string; contact_type: string }) => {
      const contact = await api<Contact>("/contacts", { method: "POST", body: v });
      await link(contact.id);
    },
    onSuccess: () => {
      setPickerOpen(false);
      setCreateError(null);
      void refresh();
    },
    onError: (e) => {
      setCreateError(applyServerErrors(e, () => undefined, []) ?? "Could not create the contact.");
      void refresh();
    },
  });

  const remove = useMutation({
    mutationFn: async (contact: Contact) => {
      // The list does not carry link ids, the contact's detail does.
      const detail = await api<ContactDetail>(`/contacts/${contact.id}`);
      const found = detail.links.find((l) => l.entity_type === entityType && l.entity_id === entityId);
      if (found) await api<void>(`/contacts/${contact.id}/links/${found.id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      setUnlinking(null);
      void refresh();
    },
    onError: (e) => {
      setUnlinking(null);
      toast.error(e instanceof ApiError ? e.message : "Could not remove the contact.");
    },
  });

  const linkedIds = new Set(linked.data?.items.map((c) => c.id));
  const noContactsAtAll = debounced === "" && options.data?.total === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Users aria-hidden="true" />
          Contacts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setSearch("");
            setCreateError(null);
            setPickerOpen(true);
          }}
        >
          <Plus data-icon="inline-start" />
          Add contact
        </Button>
        <DataState query={linked} empty={<p className="text-sm text-muted-foreground">No contacts linked yet.</p>}>
          {(data) => (
            <ul className="divide-y">
              {data.items.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{contactSubtitle(c) || "No details"}</p>
                  </div>
                  <Button variant="ghost" size="icon-xs" aria-label={`Remove ${c.name}`} onClick={() => setUnlinking(c)}>
                    <Unlink />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DataState>
      </CardContent>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a contact</DialogTitle>
            <DialogDescription>
              {noContactsAtAll ? "Contacts you create are saved to your contact list." : "Pick one of your contacts to link to this record."}
            </DialogDescription>
          </DialogHeader>
          {noContactsAtAll ? (
            <div className="space-y-3">
              <EmptyState title="You have no contacts yet" description="Create your first one here. It is linked to this record and saved to your contacts." />
              <NewContactForm onCreate={(v) => create.mutate(v)} pending={create.isPending} error={createError} />
            </div>
          ) : (
            <div className="space-y-3">
              <Input type="search" aria-label="Search contacts" placeholder="Search by name, email or organization" value={search} onChange={(e) => setSearch(e.target.value)} />
              <DataState query={options} empty={<p className="py-4 text-center text-sm text-muted-foreground">No contacts match.</p>}>
                {(data) => (
                  <ul className="max-h-72 space-y-1 overflow-y-auto">
                    {data.items.map((c) => (
                      <li key={c.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{c.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{contactSubtitle(c) || "No details"}</p>
                        </div>
                        {linkedIds.has(c.id) ? (
                          <span className="text-xs text-muted-foreground">Linked</span>
                        ) : (
                          <Button size="sm" variant="outline" disabled={add.isPending} aria-label={`Link ${c.name}`} onClick={() => add.mutate(c)}>
                            Link
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </DataState>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={unlinking !== null}
        onOpenChange={(open) => !open && setUnlinking(null)}
        title="Remove this contact?"
        description="The contact is unlinked from this record. The contact itself is kept."
        confirmLabel="Remove"
        pending={remove.isPending}
        onConfirm={() => unlinking && remove.mutate(unlinking)}
      />
    </Card>
  );
}
