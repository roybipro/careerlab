"use client";

import { UserRound } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { DataState } from "@/components/data-state";
import { TextField } from "@/components/text-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError, applyServerErrors } from "@/lib/api";
import { ME_KEY, useCurrentUser } from "@/lib/auth";
import type { User } from "@/lib/types";

const schema = z.object({
  full_name: z.string().trim().min(1, "Enter your name").max(120, "At most 120 characters"),
  email: z.string().trim().min(1, "Enter your email").pipe(z.email("Enter a valid email address")),
});
type Values = z.infer<typeof schema>;

function ProfileFormBody({ user }: { user: User }) {
  const client = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, dirtyFields },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { full_name: user.full_name, email: user.email } });

  const save = useMutation({
    mutationFn: (body: Partial<Values>) => api<User>("/auth/me", { method: "PATCH", body }),
    onSuccess: (saved) => {
      client.setQueryData(ME_KEY, saved);
      reset({ full_name: saved.full_name, email: saved.email });
      toast.success("Profile saved");
    },
    onError: (e) => {
      // 409: the email belongs to another account. It has no field details, so place it on the email field.
      if (e instanceof ApiError && e.status === 409) return setError("email", { type: "server", message: e.message });
      setFormError(applyServerErrors(e, setError, ["full_name", "email"]));
    },
  });

  return (
    <form
      noValidate
      // Before hydration a native submit must stay on this page and out of the URL.
      method="post"
      action="/settings"
      className="space-y-4"
      onSubmit={handleSubmit((values) => {
        setFormError(null);
        const body: Partial<Values> = {};
        if (dirtyFields.full_name) body.full_name = values.full_name;
        if (dirtyFields.email) body.email = values.email;
        if (Object.keys(body).length === 0) return toast.info("Nothing to save");
        save.mutate(body);
      })}
    >
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <TextField label="Full name" autoComplete="name" error={errors.full_name?.message} {...register("full_name")} />
      <TextField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? "Saving..." : "Save profile"}
      </Button>
    </form>
  );
}

export function ProfileForm() {
  const user = useCurrentUser();
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <UserRound aria-hidden="true" />
          Profile
        </CardTitle>
        <CardDescription>Your name and the email you log in with.</CardDescription>
      </CardHeader>
      <CardContent>
        <DataState query={user} isEmpty={() => false}>
          {(u) => <ProfileFormBody user={u} />}
        </DataState>
      </CardContent>
    </Card>
  );
}
