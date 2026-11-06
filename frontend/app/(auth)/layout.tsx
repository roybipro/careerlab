export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12">
      <div className="text-center">
        <p className="text-xl font-semibold tracking-tight">CareerLab</p>
        <p className="mt-1 text-sm text-muted-foreground">Job and research opportunity tracker</p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
