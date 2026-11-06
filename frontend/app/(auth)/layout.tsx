import { LogoMark } from "@/components/logo";
import { ProductPreview } from "./product-preview";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 lg:grid lg:min-h-screen lg:grid-cols-2">
      <main className="flex w-full flex-col items-center justify-center bg-card px-5 py-10 sm:px-8 lg:py-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 flex items-center gap-2.5">
            <LogoMark />
            <div>
              <p className="text-base leading-tight font-semibold tracking-tight">CareerLab</p>
              <p className="text-xs text-muted-foreground">Job and research opportunity tracker</p>
            </div>
          </div>
          {children}
        </div>
      </main>
      <ProductPreview />
    </div>
  );
}
