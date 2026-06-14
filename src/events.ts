import { z } from "zod";

/**
 * Canonical event catalog for the Olympo ecosystem (orchestrated by HubCentral).
 * Derived from the 7 business flows. Each event has a Zod payload schema.
 */

export const EVENTS = {
  // --- Graf (e-commerce, SSOT: online orders/catalog/online customers) ---
  ORDER_PAID: "pedido.pagado",
  ORDER_PENDING_APPROVAL: "pedido.pendiente_aprobacion",
  ORDER_APPROVED: "pedido.aprobado",
  CUSTOMER_CREATED: "cliente.creado",
  // --- Sinergia POS (SSOT: physical inventory + in-store sales) ---
  POS_SALE_CREATED: "venta_pos.creada",
  // --- Inventory sync (Graf <-> Sinergia) ---
  INVENTORY_UPDATE: "inventory.update",
  INVENTORY_SYNC_FROM_GRAF: "inventory.sync_from_graf",
  INVENTORY_SYNC_FROM_POS: "inventory.sync_from_pos",
  INVENTORY_SYNCED: "inventory.synced",
  // --- MeraVuelta (SSOT: delivery state) ---
  DELIVERY_CREATE: "delivery.create",
  DELIVERY_CREATED: "delivery.created",
  DELIVERY_STATUS_UPDATE: "delivery.status_update",
  DELIVERY_COMPLETED: "delivery.completed",
  // --- ApiSigo (e-invoicing) ---
  INVOICE_CREATE: "invoice.create",
  INVOICE_SENT: "invoice.sent",
  // --- ApiSoftia (CRM) ---
  CUSTOMER_UPDATE: "customer.update",
  // --- EMW (WhatsApp notifications/campaigns) ---
  NOTIFICATION_WHATSAPP: "notification.whatsapp",
  MESSAGE_SENT: "message.sent",
  // --- Fiar (credit, SSOT: credit/debt/quota) ---
  CREDIT_CHECK: "credit.check",
  CREDIT_APPROVED: "credit.approved",
  PAYMENT_RECEIVED: "payment.received",
} as const;

export type EventType = (typeof EVENTS)[keyof typeof EVENTS];

export const ServiceSourceSchema = z.enum([
  "graf", "sinergia", "meravuelta", "fiar", "emw",
  "apisigo", "apisoftia", "hub", "comercial", "automatizacion", "portal",
]);
export type ServiceSource = z.infer<typeof ServiceSourceSchema>;

/** Shared order/line item shapes. */
export const MoneySchema = z.object({ amount: z.number().nonnegative(), currency: z.string().default("COP") });
export const OrderItemSchema = z.object({
  sku: z.string(), name: z.string().optional(),
  qty: z.number().int().positive(), unitPrice: z.number().nonnegative(),
});
export const CustomerRefSchema = z.object({
  id: z.string().optional(), name: z.string().optional(),
  phone: z.string().optional(), email: z.string().email().optional(),
});

/** Per-event payload schemas. */
export const Payloads = {
  [EVENTS.ORDER_PAID]: z.object({
    orderId: z.string(), customer: CustomerRefSchema,
    items: z.array(OrderItemSchema), total: z.number().nonnegative(),
    currency: z.string().default("COP"), paymentMethod: z.enum(["online", "offline"]).default("online"),
    store: z.string().optional(),
  }),
  [EVENTS.ORDER_PENDING_APPROVAL]: z.object({
    orderId: z.string(), customer: CustomerRefSchema, total: z.number(), store: z.string().optional(),
  }),
  [EVENTS.ORDER_APPROVED]: z.object({ orderId: z.string(), approvedBy: z.string().optional() }),
  [EVENTS.CUSTOMER_CREATED]: z.object({ customer: CustomerRefSchema }),
  [EVENTS.POS_SALE_CREATED]: z.object({
    saleId: z.string(), items: z.array(OrderItemSchema), total: z.number(),
    customer: CustomerRefSchema.optional(), store: z.string().optional(),
    delivery: z.boolean().default(false),
  }),
  [EVENTS.INVENTORY_UPDATE]: z.object({ sku: z.string(), delta: z.number().int(), store: z.string().optional() }),
  [EVENTS.INVENTORY_SYNC_FROM_GRAF]: z.object({ items: z.array(z.object({ sku: z.string(), stock: z.number().int() })) }),
  [EVENTS.INVENTORY_SYNC_FROM_POS]: z.object({ items: z.array(z.object({ sku: z.string(), stock: z.number().int() })) }),
  [EVENTS.INVENTORY_SYNCED]: z.object({ count: z.number().int(), at: z.string() }),
  [EVENTS.DELIVERY_CREATE]: z.object({
    orderId: z.string(), address: z.string(), customer: CustomerRefSchema,
    items: z.array(OrderItemSchema).optional(), notes: z.string().optional(),
  }),
  [EVENTS.DELIVERY_CREATED]: z.object({ deliveryId: z.string(), orderId: z.string() }),
  [EVENTS.DELIVERY_STATUS_UPDATE]: z.object({
    deliveryId: z.string(), status: z.enum(["assigned", "picked_up", "in_transit", "delivered", "failed"]),
    lat: z.number().optional(), lng: z.number().optional(),
  }),
  [EVENTS.DELIVERY_COMPLETED]: z.object({ deliveryId: z.string(), orderId: z.string(), at: z.string() }),
  [EVENTS.INVOICE_CREATE]: z.object({
    orderId: z.string(), customer: CustomerRefSchema, items: z.array(OrderItemSchema), total: z.number(),
  }),
  [EVENTS.INVOICE_SENT]: z.object({ invoiceId: z.string(), orderId: z.string(), pdfUrl: z.string().optional() }),
  [EVENTS.CUSTOMER_UPDATE]: z.object({ customer: CustomerRefSchema, source: ServiceSourceSchema.optional() }),
  [EVENTS.NOTIFICATION_WHATSAPP]: z.object({
    to: z.string(), template: z.string().optional(), body: z.string().optional(),
    variables: z.record(z.string()).optional(),
  }),
  [EVENTS.MESSAGE_SENT]: z.object({ messageId: z.string(), to: z.string(), status: z.string() }),
  [EVENTS.CREDIT_CHECK]: z.object({ customer: CustomerRefSchema, amount: z.number() }),
  [EVENTS.CREDIT_APPROVED]: z.object({ creditId: z.string(), customer: CustomerRefSchema, limit: z.number() }),
  [EVENTS.PAYMENT_RECEIVED]: z.object({ paymentId: z.string(), creditId: z.string().optional(), amount: z.number() }),
} as const;

/** Generic event envelope (matches the inter-service webhook contract). */
export const EventEnvelopeSchema = z.object({
  eventId: z.string(),
  eventType: z.string(),
  timestamp: z.string(),
  source: ServiceSourceSchema,
  data: z.record(z.any()),
  signature: z.string().optional(),
  idempotencyKey: z.string().optional(),
  priority: z.enum(["critical", "high", "normal", "low"]).default("normal"),
});
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

/** Validate an envelope's data against the schema for its eventType (if known). */
export function validateEvent(env: EventEnvelope): { ok: true } | { ok: false; error: string } {
  const schema = (Payloads as Record<string, z.ZodTypeAny>)[env.eventType];
  if (!schema) return { ok: true }; // unknown events pass through (open ecosystem)
  const res = schema.safeParse(env.data);
  return res.success ? { ok: true } : { ok: false, error: res.error.message };
}
