"use client";

import { useEffect } from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";
import { setDateFormat, type DateFormat } from "@/lib/dates";

/** The theme lives in the database. This applies it on load and whenever it is saved. */
function ThemeSync({ theme }: { theme: string }) {
  const { setTheme } = useTheme();
  useEffect(() => {
    setTheme(theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);
  return null;
}

/** Sets the display date format for client components, before they render (the layout does the same on the server). */
export function DateFormatInit({ format }: { format: DateFormat }) {
  setDateFormat(format);
  return null;
}

export function Providers({ theme, children }: { theme: "system" | "light" | "dark"; children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme={theme} enableSystem disableTransitionOnChange>
      <ThemeSync theme={theme} />
      {children}
      <Toaster position="bottom-right" richColors closeButton />
    </ThemeProvider>
  );
}
