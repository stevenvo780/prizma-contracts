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
  hub:        { key: "hub", name: "Nous", port: 3007, kind: "backend", healthPath: "/health", db: "mysql" },
  hermes:       { key: "hermes", name: "Hermes Backend", port: 3000, kind: "backend", healthPath: "/health", ownerOf: ["online_order", "catalog", "online_customer"], db: "postgres" },
  iris:       { key: "iris", name: "Iris Backend", port: 3001, kind: "backend", healthPath: "/health", ownerOf: ["campaign", "whatsapp_template"], db: "postgres" },
  talanton:   { key: "talanton", name: "Talanton POS", port: 3002, kind: "backend", healthPath: "/health", ownerOf: ["physical_inventory", "pos_sale"], db: "postgres" },
  logos:    { key: "logos", name: "Logos", port: 3004, kind: "backend", healthPath: "/health", ownerOf: ["invoice"], db: "mysql" },
  mnemosyne:  { key: "mnemosyne", name: "Mnemosyne", port: 3005, kind: "backend", healthPath: "/health", ownerOf: ["crm_customer"], db: "none" },
  talaria: { key: "talaria", name: "Talaria API", port: 3006, kind: "backend", healthPath: "/health", ownerOf: ["delivery"], db: "postgres" },
  pistis:       { key: "pistis", name: "Pistis API", port: 8090, kind: "backend", healthPath: "/health", ownerOf: ["credit", "debt", "quota"], db: "postgres" },
};

/** Frontends (dev ports chosen to avoid backend collisions). */
export const FRONTENDS: Record<string, { name: string; port: number; module: string }> = {
  portal:           { name: "Prizma Portal", port: 4000, module: "portal" },
  web:              { name: "Prizma Web", port: 4001, module: "portal" },
  "hermes-client":    { name: "Hermes Client", port: 4010, module: "hermes" },
  "hermes-admin":     { name: "Hermes Admin", port: 4011, module: "hermes" },
  "iris-frontend":  { name: "Iris Frontend", port: 4020, module: "iris" },
  "pistis-front":     { name: "Pistis Front", port: 4030, module: "pistis" },
  "talaria-front": { name: "Talaria Front", port: 4040, module: "talaria" },
  "talanton-pos":   { name: "Talanton POS Front", port: 4050, module: "talanton" },
};

export const HUB_URL =
  (process?.env?.PRIZMA_HUB_URL as string) ||
  (process?.env?.NOUS_HUB_URL as string) ||
  "http://localhost:3007";
export const serviceUrl = (key: keyof typeof SERVICES) =>
  (process?.env?.[`PRIZMA_${key.toUpperCase()}_URL`] as string) ||
  `http://localhost:${SERVICES[key].port}`;
