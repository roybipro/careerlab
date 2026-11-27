import type { Metadata } from "next";
import { Inter, Rubik } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { QueryProvider } from "@/lib/query";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Rubik for headings (friendly, rounded), Inter for everything else.
const display = Rubik({
  variable: "--font-display",
  subsets: ["latin"],
});

const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "CareerLab", template: "%s | CareerLab" },
  description: "Track job applications and research opportunities in one place.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Everyone starts in light mode; dark mode is one click away and remembered once chosen. */}
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          <QueryProvider>
            {children}
            <Toaster />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
