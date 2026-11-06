"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { NativeSelect } from "@/components/native-select";
import { TextAreaField } from "@/components/textarea-field";
import { TextField } from "@/components/text-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, applyServerErrors } from "@/lib/api";
import { CONTACT_TYPES } from "@/lib/enums";
import { invalidateContacts } from "@/lib/keys";
import type { Contact, ContactDetail } from "@/lib/types";

const url = z
  .string()
  .trim()
  .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Enter a link starting with http:// or https://");
const short = z.string().max(200, "At most 200 characters");

const schema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(200, "At most 200 characters"),
  contact_type: z.string(),
  email: z.string().max(320, "At most 320 characters"),
  organization: short,
  position: short,
  linkedin_url: url,
  website: url,
  last_contacted_at: z.string(),
  next_follow_up_at: z.string(),
  notes: z.string().max(50_000, "At most 50,000 characters"),
});

type Values = z.infer<typeof schema>;
type Field = keyof Values;
const FIELDS = Object.keys(schema.shape) as Field[];

const EMPTY: Values = {
  name: "",
  contact_type: "",
  email: "",
  organization: "",
  position: "",
  linkedin_url: "",
  website: "",
  last_contacted_at: "",
  next_follow_up_at: "",
  notes: "",
};

function toValues(c: Contact): Values {
  return {
    name: c.name,
    contact_type: c.contact_type ?? "",
    email: c.email ?? "",
    organization: c.organization ?? "",
    position: c.position ?? "",
    linkedin_url: c.linkedin_url ?? "",
    website: c.website ?? "",
    last_contacted_at: c.last_contacted_at ?? "",
    next_follow_up_at: c.next_follow_up_at ?? "",
    notes: c.notes ?? "",
  };
}

/** "" becomes null, which clears an optional field on edit. Name is required and never null. */
function buildBody(values: Values, fields: Field[], isCreate: boolean) {
  const body: Record<string, string | null> = {};
  for (const field of fields) {
    const v = values[field].trim();
    if (field === "name") body[field] = v;
    else if (v === "") {
      if (!isCreate) body[field] = null;
    } else body[field] = v;
  }
  return body;
}

function ContactFormBody({ contact, onDone }: { contact?: Contact; onDone: () => void }) {
  const client = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, dirtyFields },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: contact ? toValues(contact) : EMPTY });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      contact ? api<ContactDetail>(`/contacts/${contact.id}`, { method: "PATCH", body }) : api<ContactDetail>("/contacts", { method: "POST", body }),
    onSuccess: async () => {
      await invalidateContacts(client);
      toast.success(contact ? "Contact updated" : "Contact added");
      onDone();
    },
    onError: (e) => setFormError(applyServerErrors(e, setError, FIELDS)),
  });

  function onSubmit(values: Values) {
    setFormError(null);
    if (!contact) return save.mutate(buildBody(values, FIELDS, true));
    const changed = FIELDS.filter((f) => dirtyFields[f]);
    if (changed.length === 0) return onDone();
    save.mutate(buildBody(values, changed, false));
  }

  const err = (f: Field) => errors[f]?.message;

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Name" error={err("name")} {...register("name")} />
        <NativeSelect label="Contact type" options={CONTACT_TYPES} placeholder="Not set" error={err("contact_type")} {...register("contact_type")} />
        <TextField label="Email" type="email" autoComplete="off" error={err("email")} {...register("email")} />
        <TextField label="Organization" error={err("organization")} {...register("organization")} />
        <TextField label="Position" error={err("position")} {...register("position")} />
        <TextField label="LinkedIn URL" type="url" placeholder="https://" error={err("linkedin_url")} {...register("linkedin_url")} />
        <TextField label="Website" type="url" placeholder="https://" error={err("website")} {...register("website")} />
        <TextField label="Last contacted" type="date" error={err("last_contacted_at")} {...register("last_contacted_at")} />
        <TextField label="Next follow-up" type="date" error={err("next_follow_up_at")} {...register("next_follow_up_at")} />
      </div>
      <TextAreaField label="Notes" error={err("notes")} {...register("notes")} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving..." : contact ? "Save changes" : "Add contact"}
        </Button>
      </div>
    </form>
  );
}

/** Add (no `contact`) or edit (with `contact`) dialog. */
export function ContactFormDialog({ open, onOpenChange, contact }: { open: boolean; onOpenChange: (open: boolean) => void; contact?: Contact }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{contact ? "Edit contact" : "Add a contact"}</DialogTitle>
          <DialogDescription>{contact ? "Clear a field to remove its value." : "Only the name is required."}</DialogDescription>
        </DialogHeader>
        <ContactFormBody contact={contact} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
