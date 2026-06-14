import type { ServiceSource } from "./events";

/** Canonical service registry: ports, dev URLs, health paths, SSOT ownership. */
export interface ServiceDef {
  key: ServiceSource;
  name: string;
  port: number;
  kind: "backend" | "frontend" | "mobile" | "static" | "worker";
  healthPath?: string;
  ownerOf?: string[]; // SSOT data domains this service owns
  db?: "postgres" | "mysql" | "none";
}

export const SERVICES: Record<string, ServiceDef> = {
  hub:        { key: "hub", name: "HubCentral", port: 3007, kind: "backend", healthPath: "/health", db: "mysql" },
  graf:       { key: "graf", name: "Graf Backend", port: 3000, kind: "backend", healthPath: "/health", ownerOf: ["online_order", "catalog", "online_customer"], db: "postgres" },
  emw:        { key: "emw", name: "EMW Backend", port: 3001, kind: "backend", healthPath: "/health", ownerOf: ["campaign", "whatsapp_template"], db: "postgres" },
  sinergia:   { key: "sinergia", name: "Sinergia POS", port: 3002, kind: "backend", healthPath: "/health", ownerOf: ["physical_inventory", "pos_sale"], db: "postgres" },
  apisigo:    { key: "apisigo", name: "ApiSigo", port: 3004, kind: "backend", healthPath: "/health", ownerOf: ["invoice"], db: "mysql" },
  apisoftia:  { key: "apisoftia", name: "ApiSoftia", port: 3005, kind: "backend", healthPath: "/health", ownerOf: ["crm_customer"], db: "none" },
  meravuelta: { key: "meravuelta", name: "MeraVuelta API", port: 3006, kind: "backend", healthPath: "/health", ownerOf: ["delivery"], db: "postgres" },
  fiar:       { key: "fiar", name: "Fiar API", port: 8090, kind: "backend", healthPath: "/health", ownerOf: ["credit", "debt", "quota"], db: "postgres" },
};

/** Frontends (dev ports chosen to avoid backend collisions). */
export const FRONTENDS: Record<string, { name: string; port: number; module: string }> = {
  portal:           { name: "Olympo Portal", port: 4000, module: "portal" },
  web:              { name: "Olympo Web", port: 4001, module: "portal" },
  "graf-client":    { name: "Graf Client", port: 4010, module: "graf" },
  "graf-admin":     { name: "Graf Admin", port: 4011, module: "graf" },
  "emw-frontend":   { name: "EMW Frontend", port: 4020, module: "emw" },
  "fiar-front":     { name: "Fiar Front", port: 4030, module: "fiar" },
  "meravuelta-front": { name: "MeraVuelta Front", port: 4040, module: "meravuelta" },
  "sinergia-pos":   { name: "Sinergia POS Front", port: 4050, module: "sinergia" },
};

export const HUB_URL = (process?.env?.CAUCE_HUB_URL as string) || "http://localhost:3007";
export const serviceUrl = (key: keyof typeof SERVICES) =>
  (process?.env?.[`CAUCE_${key.toUpperCase()}_URL`] as string) || `http://localhost:${SERVICES[key].port}`;
