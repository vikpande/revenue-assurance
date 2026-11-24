import { useEffect, useState } from "react";
import type { CaseInput } from "./engine";

export type Section = "availability" | "findings" | "claim";

export interface Route {
  name: "home" | "fleet" | "site" | "docs";
  id?: string;
  section: Section;
}

export function parseHash(hash: string): Route {
  const parts = (hash.replace(/^#/, "") || "/").split("/").filter(Boolean);
  if (parts.length === 0) return { name: "home", section: "availability" };
  if (parts[0] === "portfolio") return { name: "fleet", section: "availability" };
  if (parts[0] === "docs") return { name: "docs", section: "availability" };
  const section: Section =
    parts[1] === "findings" || parts[1] === "claim" ? parts[1] : "availability";
  return { name: "site", id: parts[0], section };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function siteHref(id: string, section: Section = "availability"): string {
  if (section === "availability") return `#/${id}`;
  return `#/${id}/${section}`;
}

export function snapshotText(input: CaseInput): string {
  return JSON.stringify({
    id: input.id,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    guarantee: input.guarantee,
    pricePerMwh: input.pricePerMwh,
    measuredProductionMwh: input.measuredProductionMwh,
    allowanceHours: input.allowanceHours,
    events: [...input.events].sort((a, b) => a.id.localeCompare(b.id)),
    outages: input.outages,
  });
}

export function useSha256(text: string): string {
  const [hash, setHash] = useState("Calculating");
  useEffect(() => {
    let cancel = false;
    const bytes = new TextEncoder().encode(text);
    crypto.subtle.digest("SHA-256", bytes).then((buffer) => {
      if (cancel) return;
      const hex = [...new Uint8Array(buffer)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      setHash(hex);
    });
    return () => {
      cancel = true;
    };
  }, [text]);
  return hash;
}
