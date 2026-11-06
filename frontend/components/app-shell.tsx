"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Bell, Briefcase, FlaskConical, LayoutDashboard, LogOut, Menu, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ReminderBell } from "@/components/reminder-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth";
import { hardNavigate } from "@/lib/navigation";
import { markSessionEnding } from "@/lib/query";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Job Applications", icon: Briefcase },
  { href: "/research", label: "Research Opportunities", icon: FlaskConical },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/reminders", label: "Reminders", icon: Bell },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function Brand() {
  return (
    <Link href="/dashboard" className="rounded-md px-2 text-base font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      CareerLab
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
              active && "bg-muted text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function initials(name: string | undefined) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

function UserMenu() {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();

  const logout = useMutation({
    mutationFn: () => api<void>("/auth/logout", { method: "POST" }),
    onSuccess: () => {
      // Stop the cleared "me" query from re-fetching into a 401 and redirecting with ?next=.
      markSessionEnding();
      queryClient.clear();
      hardNavigate("/login");
    },
    onError: () => toast.error("Could not log out. Try again."),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" className="h-9 gap-2 px-1.5" aria-label="Account menu" />}
      >
        <Avatar size="sm">
          <AvatarFallback>{initials(user?.full_name)}</AvatarFallback>
        </Avatar>
        <span className="hidden max-w-40 truncate text-sm sm:inline">{user?.full_name ?? "Account"}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {user ? (
          <>
            <div className="px-2 py-1.5">
              <p className="truncate text-sm font-medium">{user.full_name}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem render={<Link href="/settings" />}>
          <Settings /> Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => logout.mutate()} disabled={logout.isPending}>
          <LogOut /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col gap-6 border-r bg-sidebar px-3 py-4 md:flex">
        <Brand />
        <NavList />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur md:px-6">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger
              render={<Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" />}
            >
              <Menu />
            </SheetTrigger>
            <SheetContent side="left" className="w-64 gap-6 bg-sidebar px-3 py-4">
              <SheetTitle className="px-2">CareerLab</SheetTitle>
              <SheetDescription className="sr-only">Main navigation</SheetDescription>
              <NavList onNavigate={() => setMenuOpen(false)} />
            </SheetContent>
          </Sheet>
          <span className="text-base font-semibold tracking-tight md:hidden">CareerLab</span>
          <div className="ml-auto flex items-center gap-1">
            <ReminderBell />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6 md:py-8">{children}</main>
      </div>
    </div>
  );
}
