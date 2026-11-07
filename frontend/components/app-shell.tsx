"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Bell, Briefcase, FlaskConical, FolderKanban, LayoutDashboard, LogOut, Menu, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ReminderBell } from "@/components/reminder-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoMark } from "@/components/logo";
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
import { initials } from "@/lib/format";
import { markSessionEnding } from "@/lib/query";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Job Applications", icon: Briefcase },
  { href: "/research", label: "Research Opportunities", icon: FlaskConical },
  { href: "/projects", label: "Research Projects", icon: FolderKanban },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/reminders", label: "Reminders", icon: Bell },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 rounded-lg px-2 py-1 text-base font-semibold tracking-tight text-white outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring">
      <LogoMark />
      CareerLab
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring",
              active && "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
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
        render={<Button variant="ghost" className="min-w-10 gap-2 px-1.5" aria-label="Account menu" />}
      >
        <Avatar size="sm">
          <AvatarFallback className="bg-accent font-medium text-accent-foreground">{initials(user?.full_name)}</AvatarFallback>
        </Avatar>
        <span className="hidden max-w-40 truncate text-sm md:inline">{user?.full_name ?? "Account"}</span>
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
      <aside className="hidden border-sidebar-border bg-sidebar md:block dark:border-r">
        <div className="sticky top-0 flex h-screen flex-col gap-7 px-3 py-5">
          <Brand />
          <NavList />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-card/90 px-3 backdrop-blur md:px-6">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger
              render={<Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" />}
            >
              <Menu />
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-64 gap-6 border-sidebar-border bg-sidebar px-3 py-5 text-sidebar-foreground [&_[data-slot=sheet-close]:hover]:bg-sidebar-accent [&_[data-slot=sheet-close]:hover]:text-white"
            >
              <SheetTitle className="flex items-center gap-2.5 px-2 text-base font-semibold tracking-tight text-white">
                <LogoMark />
                CareerLab
              </SheetTitle>
              <SheetDescription className="sr-only">Main navigation</SheetDescription>
              <NavList onNavigate={() => setMenuOpen(false)} />
            </SheetContent>
          </Sheet>
          <span className="flex items-center gap-2 text-base font-semibold tracking-tight md:hidden">
            <LogoMark className="size-7" />
            CareerLab
          </span>
          <div className="ml-auto flex items-center gap-1">
            <ReminderBell />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
