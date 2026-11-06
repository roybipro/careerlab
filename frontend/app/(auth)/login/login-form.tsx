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
import { WakingHint } from "@/components/waking-hint";
import { api, applyServerErrors } from "@/lib/api";
import { safeNextPath } from "@/lib/auth";
import { hardNavigate } from "@/lib/navigation";
import type { User } from "@/lib/types";

const schema = z.object({
  email: z.string().trim().min(1, "Enter your email").pipe(z.email("Enter a valid email address")),
  password: z.string().min(1, "Enter your password").max(128, "Password is too long"),
});
type Values = z.infer<typeof schema>;

export function LoginForm() {
  const next = useSearchParams().get("next");
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  const login = useMutation({
    mutationFn: (values: Values) => api<User>("/auth/login", { method: "POST", body: values }),
    // Full page load: starts the new session with empty caches (see hardNavigate).
    onSuccess: () => hardNavigate(safeNextPath(next)),
    onError: (error) => setFormError(applyServerErrors(error, setError, ["email", "password"])),
  });

  const registerHref = next ? `/register?next=${encodeURIComponent(next)}` : "/register";

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">Welcome back. Enter your details to continue.</p>
      <div>
        <form
          noValidate
          // Before hydration a native submit must not put credentials in the URL: POST to this page.
          method="post"
          action="/login"
          className="space-y-4"
          onSubmit={handleSubmit((values) => {
            setFormError(null);
            login.mutate(values);
          })}
        >
          {formError ? (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}
          <TextField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register("password")}
          />
          <Button type="submit" className="w-full" size="lg" disabled={login.isPending || login.isSuccess}>
            {login.isPending ? "Logging in..." : "Log in"}
          </Button>
          {login.isPending ? <WakingHint className="text-center text-sm text-muted-foreground" /> : null}
        </form>
        <p className="mt-3 text-center text-sm text-muted-foreground">
          No account yet?{" "}
          <Link href={registerHref} className="inline-flex min-h-10 items-center font-medium text-link underline underline-offset-4">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
