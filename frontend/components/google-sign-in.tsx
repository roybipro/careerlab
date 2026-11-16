"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api } from "@/lib/api";
import { safeNextPath } from "@/lib/auth";
import { hardNavigate } from "@/lib/navigation";
import type { User } from "@/lib/types";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

type GoogleId = {
  initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

/** Google Identity Services button. Renders nothing unless NEXT_PUBLIC_GOOGLE_CLIENT_ID is set. */
export function GoogleSignIn({ next, text = "signin_with" }: { next: string | null; text?: "signin_with" | "signup_with" }) {
  const buttonRef = useRef<HTMLDivElement>(null);

  const signIn = useMutation({
    mutationFn: (credential: string) => api<User>("/auth/google", { method: "POST", body: { credential } }),
    onSuccess: () => hardNavigate(safeNextPath(next)),
  });
  const { mutate } = signIn;

  useEffect(() => {
    if (!CLIENT_ID) return;
    const render = () => {
      const id = window.google?.accounts.id;
      if (!id || !buttonRef.current) return;
      id.initialize({ client_id: CLIENT_ID, callback: (response) => mutate(response.credential) });
      id.renderButton(buttonRef.current, { text, size: "large", width: buttonRef.current.offsetWidth || 320 });
    };
    if (window.google) return render();
    let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", render);
    return () => script.removeEventListener("load", render);
  }, [mutate, text]);

  if (!CLIENT_ID) return null;
  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      {signIn.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{signIn.error.message}</AlertDescription>
        </Alert>
      ) : null}
      <div ref={buttonRef} className="flex min-h-10 justify-center" />
    </div>
  );
}
