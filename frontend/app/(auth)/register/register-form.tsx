"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { TextField } from "@/components/text-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WakingHint } from "@/components/waking-hint";
import { ApiError, api, applyServerErrors } from "@/lib/api";
import { safeNextPath } from "@/lib/auth";
import { hardNavigate } from "@/lib/navigation";
import type { User } from "@/lib/types";

// Mirrors the backend: name 1-120 characters after trimming, password 10-128.
const schema = z.object({
  full_name: z.string().trim().min(1, "Enter your name").max(120, "Name must be 120 characters or fewer"),
  email: z.string().trim().min(1, "Enter your email").pipe(z.email("Enter a valid email address")),
  password: z.string().min(10, "Use at least 10 characters").max(128, "Use 128 characters or fewer"),
});
type Values = z.infer<typeof schema>;

export function RegisterForm() {
  const next = useSearchParams().get("next");
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { full_name: "", email: "", password: "" } });

  const signUp = useMutation({
    mutationFn: (values: Values) => api<User>("/auth/register", { method: "POST", body: values }),
    // Full page load: starts the new session with empty caches (see hardNavigate).
    onSuccess: () => hardNavigate(safeNextPath(next)),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        // A taken email is a problem with the email field, not the whole form.
        setError("email", { type: "server", message: error.message });
        return;
      }
      setFormError(applyServerErrors(error, setError, ["full_name", "email", "password"]));
    },
  });

  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Create your account</CardTitle>
        <CardDescription>Start tracking applications and research opportunities.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          // Before hydration a native submit must not put credentials in the URL: POST to this page.
          method="post"
          action="/register"
          className="space-y-4"
          onSubmit={handleSubmit((values) => {
            setFormError(null);
            signUp.mutate(values);
          })}
        >
          {formError ? (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}
          <TextField label="Full name" autoComplete="name" error={errors.full_name?.message} {...register("full_name")} />
          <TextField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            hint="10 to 128 characters."
            error={errors.password?.message}
            {...register("password")}
          />
          <p className="text-sm text-muted-foreground">
            There is no password reset yet, so keep your password somewhere safe. If you lose it, you lose access to your data.
          </p>
          <Button type="submit" className="w-full" size="lg" disabled={signUp.isPending || signUp.isSuccess}>
            {signUp.isPending ? "Creating account..." : "Create account"}
          </Button>
          {signUp.isPending ? <WakingHint className="text-center text-sm text-muted-foreground" /> : null}
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href={loginHref} className="font-medium text-foreground underline underline-offset-4">
            Log in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
