"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { TextField } from "@/components/text-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, applyServerErrors } from "@/lib/api";

const schema = z
  .object({
    current_password: z.string().min(1, "Enter your current password").max(128, "Password is too long"),
    new_password: z.string().min(10, "Use at least 10 characters").max(128, "Use at most 128 characters"),
    confirm_password: z.string(),
  })
  .refine((v) => v.new_password === v.confirm_password, { path: ["confirm_password"], message: "The passwords do not match" });
type Values = z.infer<typeof schema>;

export function PasswordForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { current_password: "", new_password: "", confirm_password: "" } });

  // A wrong current password is a 422 on that field, not a 401, so it never signs the user out.
  // On success the API sends a fresh session cookie, so this browser stays signed in.
  const change = useMutation({
    mutationFn: (v: Values) => api<void>("/auth/change-password", { method: "POST", body: { current_password: v.current_password, new_password: v.new_password } }),
    onSuccess: () => {
      reset();
      toast.success("Password changed. Other devices are signed out.");
    },
    onError: (e) => setFormError(applyServerErrors(e, setError, ["current_password", "new_password"])),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>Use 10 to 128 characters. Changing it signs out your other devices.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          // Before hydration a native submit must not put a password in the URL: POST to this page.
          method="post"
          action="/settings"
          className="space-y-4"
          onSubmit={handleSubmit((values) => {
            setFormError(null);
            change.mutate(values);
          })}
        >
          {formError ? (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}
          <TextField label="Current password" type="password" autoComplete="current-password" error={errors.current_password?.message} {...register("current_password")} />
          <TextField label="New password" type="password" autoComplete="new-password" error={errors.new_password?.message} {...register("new_password")} />
          <TextField label="Confirm new password" type="password" autoComplete="new-password" error={errors.confirm_password?.message} {...register("confirm_password")} />
          <Button type="submit" disabled={change.isPending}>
            {change.isPending ? "Changing..." : "Change password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
