"use client";

import { SWRConfig } from "swr";
import { SWR_CONFIG } from "@/lib/cache/tabCache";
import type { ReactNode } from "react";

/**
 * Envelopa a app com a config global do SWR.
 * Inserir no layout (ou direto em /panorama, /pipeline, /marketing).
 */
export default function SwrProvider({ children }: { children: ReactNode }) {
  return <SWRConfig value={SWR_CONFIG}>{children}</SWRConfig>;
}
