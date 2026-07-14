"use client";

import dynamic from "next/dynamic";

export const PiggyBankSidebar = dynamic(
  () =>
    import("@/components/piggybank-sidebar").then((m) => ({
      default: m.PiggyBankSidebar,
    })),
  { ssr: false },
);
