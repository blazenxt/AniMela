"use client";

import { LibraryProvider } from "@/lib/library";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <LibraryProvider>{children}</LibraryProvider>;
}
