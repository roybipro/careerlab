import { ArrowLeft, Compass } from "lucide-react";
import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-24 text-center">
      <span className="mb-8 flex items-center gap-2 text-base font-semibold tracking-tight">
        <LogoMark className="size-7" />
        CareerLab
      </span>
      <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
        <Compass className="size-5" aria-hidden="true" />
      </span>
      <p className="mt-2 text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">The page you are looking for does not exist or has moved.</p>
      <Link href="/dashboard" className={`mt-3 ${buttonVariants()}`}>
        <ArrowLeft data-icon="inline-start" aria-hidden="true" />
        Back to dashboard
      </Link>
    </main>
  );
}
