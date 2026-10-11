"use client";

import { useEffect } from "react";
import { recordProductView } from "@/lib/commerce/recently-viewed";

// Adds this product to recently viewed (with preferences consent).
export function RecordProductView({ handle }: { handle: string }) {
  useEffect(() => {
    void recordProductView(handle);
  }, [handle]);
  return null;
}
