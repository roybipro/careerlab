"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LogOut, Menu, Moon, Plus, Search, Settings, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CommandPalette, useCommandPaletteShortcut } from "@/components/command-palette";
import { LogoMark } from "@/components/logo";
import { NAV_GROUPS, SETTINGS_ITEM, isActive, type NavItem } from "@/components/nav-items";
import { CREATE_ITEMS, QuickCreateProvider, useQuickCreate } from "@/components/quick-create";
import { ReminderBell } from "@/components/reminder-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth";
import { initials } from "@/lib/format";
import { hardNavigate } from "@/lib/navigation";
import { markSessionEnding } from "@/lib/query";
import { cn } from "@/lib/utils";

export { NAV_ITEMS } from "@/components/nav-items";

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 rounded-lg px-2 py-1 text-[0.9375rem] font-semibold tracking-tight text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <LogoMark className="size-7.5" />
      CareerLab
    </Link>
  );
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group/nav relative flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-9",
        active && "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground",
      )}
    >
      {active ? <span className="absolute top-2 bottom-2 -left-3 w-1 rounded-r-full bg-primary" aria-hidden="true" /> : null}
      <Icon className={cn("size-4.5 shrink-0 text-muted-foreground transition-colors group-hover/nav:text-current", active && "text-primary group-hover/nav:text-primary")} aria-hidden="true" />
      {item.label}
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {NAV_GROUPS.map((group, i) => (
        <div key={group.label ?? i} className="flex flex-col gap-0.5">
          {group.label ? <p className="px-3 pb-1.5 text-[0.6875rem] font-semibold tracking-wider text-muted-foreground uppercase">{group.label}</p> : null}
          {group.items.map((item) => (
            <NavLink key={item.href} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
  );
}

/** The "New" menu: every kind of record, one click away on every page. */
function NewMenu({ className, side = "bottom", align = "start", label, children }: { className?: string; side?: "top" | "bottom"; align?: "start" | "end" | "center"; /** Accessible name, only for an icon-only trigger. */ label?: string; children: ReactNode }) {
  const create = useQuickCreate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button className={className} aria-label={label} />}>{children}</DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={align} sideOffset={8} className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Create new</DropdownMenuLabel>
          {CREATE_ITEMS.map(({ kind, label, hint, icon: Icon }) => (
            <DropdownMenuItem key={kind} onClick={() => create(kind)} className="items-start gap-3 py-2">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-muted-foreground">{hint}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SearchButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Search and commands"
      aria-keyshortcuts="Meta+K Control+K"
      className="group/search hidden h-9 w-full max-w-md items-center gap-2.5 rounded-lg border bg-muted/60 px-3 text-sm text-muted-foreground outline-none transition-colors hover:border-input hover:bg-card focus-visible:ring-3 focus-visible:ring-ring/50 md:flex"
    >
      <Search className="size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1 truncate text-left">Search jobs, contacts, pages…</span>
      <kbd className="rounded-md border bg-card px-1.5 py-0.5 font-sans text-[0.6875rem] font-medium shadow-card">⌘K</kbd>
    </button>
  );
}

function UserMenu({ compact }: { compact?: boolean }) {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { resolvedTheme, setTheme } = useTheme();

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
      <DropdownMenuTrigger render={<Button variant="ghost" className="min-w-10 gap-2 px-1.5" aria-label="Account menu" />}>
        <Avatar size="sm">
          <AvatarFallback className="bg-linear-to-br from-brand-from to-brand-to text-[0.6875rem] font-semibold text-white">{initials(user?.full_name)}</AvatarFallback>
        </Avatar>
        {compact ? null : (
          <>
            <span className="hidden max-w-36 truncate text-sm font-medium lg:inline">{user?.full_name ?? "Account"}</span>
            <ChevronDown className="hidden size-3.5 text-muted-foreground lg:block" aria-hidden="true" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-60">
        {user ? (
          <>
            <div className="flex items-center gap-3 px-2 py-2">
              <Avatar>
                <AvatarFallback className="bg-linear-to-br from-brand-from to-brand-to text-xs font-semibold text-white">{initials(user.full_name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
            </div>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem render={<Link href="/settings" />}>
          <Settings /> Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          <Sun className="hidden dark:block" />
          <Moon className="dark:hidden" />
          <span className="dark:hidden">Dark mode</span>
          <span className="hidden dark:inline">Light mode</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => logout.mutate()} disabled={logout.isPending}>
          <LogOut /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Phones: the four most used places, a big "+" in the middle and "More" for the rest. */
function TabBar({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const tabs = [NAV_GROUPS[0].items[0], NAV_GROUPS[1].items[0], NAV_GROUPS[2].items[1], NAV_GROUPS[1].items[1]];
  const tab = (item: NavItem) => {
    const active = isActive(pathname, item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn("flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[0.6875rem] font-medium text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50", active && "text-primary")}
      >
        <Icon className="size-5" aria-hidden="true" />
        {item.short ?? item.label}
      </Link>
    );
  };
  return (
    <nav aria-label="Quick" className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden">
      <div className="mx-auto flex max-w-lg items-center gap-1 px-2 py-1.5">
        {tabs.slice(0, 2).map(tab)}
        <div className="flex flex-1 justify-center">
          <NewMenu side="top" align="center" label="Create new" className="size-12 rounded-2xl shadow-lift">
            <Plus className="size-6" aria-hidden="true" />
          </NewMenu>
        </div>
        {tabs.slice(2, 3).map(tab)}
        <button
          type="button"
          onClick={onMore}
          className="flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[0.6875rem] font-medium text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Menu className="size-5" aria-hidden="true" />
          More
        </button>
      </div>
    </nav>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const togglePalette = useCallback(() => setPaletteOpen((v) => !v), []);
  const showPalette = useCallback(() => setPaletteOpen(true), []);
  useCommandPaletteShortcut(togglePalette, showPalette);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="hidden border-r border-sidebar-border bg-sidebar md:block">
        <div className="sticky top-0 flex h-screen flex-col gap-6 overflow-y-auto px-3 py-5">
          <Brand />
          <NewMenu className="h-10 w-full justify-start gap-2 md:h-10">
            <Plus data-icon="inline-start" aria-hidden="true" />
            <span className="flex-1 text-left">New</span>
            <ChevronDown className="size-4 opacity-80" aria-hidden="true" />
          </NewMenu>
          <NavList />
          <div className="mt-auto flex flex-col gap-3">
            <NavLink item={SETTINGS_ITEM} />
            <div className="rounded-xl border bg-muted/50 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Tip</p>
              <p className="mt-0.5">
                Press <kbd className="rounded border bg-card px-1 font-sans">⌘K</kbd> or <kbd className="rounded border bg-card px-1 font-sans">/</kbd> to search and create from anywhere.
              </p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur-lg md:h-16 md:px-6">
          <span className="flex items-center gap-2 text-base font-semibold tracking-tight md:hidden">
            <LogoMark className="size-7" />
            CareerLab
          </span>
          <SearchButton onOpen={showPalette} />
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Search and commands" onClick={showPalette}>
              <Search />
            </Button>
            <ReminderBell />
            <span className="hidden md:block">
              <ThemeToggle />
            </span>
            <span className="mx-1 hidden h-6 w-px bg-border md:block" aria-hidden="true" />
            <UserMenu />
          </div>
        </header>
        <main className="app-glow flex-1 max-md:pb-tabbar">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">{children}</div>
        </main>
      </div>

      <TabBar onMore={() => setMenuOpen(true)} />
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 gap-6 border-sidebar-border bg-sidebar px-3 py-5">
          <SheetTitle className="flex items-center gap-2.5 px-2 text-base font-semibold tracking-tight">
            <LogoMark className="size-7.5" />
            CareerLab
          </SheetTitle>
          <SheetDescription className="sr-only">Main navigation</SheetDescription>
          <NavList onNavigate={() => setMenuOpen(false)} />
          <div className="mt-auto">
            <NavLink item={SETTINGS_ITEM} onNavigate={() => setMenuOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <QuickCreateProvider>
      <Shell>{children}</Shell>
    </QuickCreateProvider>
  );
}
