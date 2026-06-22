import { z } from "zod";

/**
 * Canonical event catalog for the Prizma ecosystem (orchestrated by Nous).
 * Derived from the 7 business flows. Each event has a Zod payload schema.
 */

export const EVENTS = {
  // --- Hermes (e-commerce, SSOT: online orders/catalog/online customers) ---
  ORDER_PAID: "pedido.pagado",
  ORDER_PENDING_APPROVAL: "pedido.pendiente_aprobacion",
  ORDER_APPROVED: "pedido.aprobado",
  CUSTOMER_CREATED: "cliente.creado",
  // --- Talanton POS (SSOT: physical inventory + in-store sales) ---
  POS_SALE_CREATED: "venta_pos.creada",
  // --- Inventory sync (Hermes <-> Talanton) ---
  INVENTORY_UPDATE: "inventory.update",
  INVENTORY_SYNC_FROM_HERMES: "inventory.sync_from_hermes",
  INVENTORY_SYNC_FROM_POS: "inventory.sync_from_pos",
  INVENTORY_SYNCED: "inventory.synced",
  // --- Talaria (SSOT: delivery state) ---
  DELIVERY_CREATE: "delivery.create",
  DELIVERY_CREATED: "delivery.created",
  DELIVERY_STATUS_UPDATE: "delivery.status_update",
  DELIVERY_COMPLETED: "delivery.completed",
  // --- Logos (e-invoicing) ---
  INVOICE_CREATE: "invoice.create",
  INVOICE_SENT: "invoice.sent",
  // --- Mnemosyne (CRM) ---
  CUSTOMER_UPDATE: "customer.update",
  // --- Iris (WhatsApp notifications/campaigns) ---
  NOTIFICATION_WHATSAPP: "notification.whatsapp",
  MESSAGE_SENT: "message.sent",
  // --- Pistis (credit, SSOT: credit/debt/quota) ---
  CREDIT_CHECK: "credit.check",
  CREDIT_APPROVED: "credit.approved",
  PAYMENT_RECEIVED: "payment.received",
  // --- Pagos Mercado Pago (SSOT: pasarela de pagos online) ---
  // Nota: `pedido.pagado` es el evento downstream de negocio que se dispara
  // cuando `pago.aprobado` corresponde a un pedido de Hermes.
  PAGO_INICIADO: "pago.iniciado",
  PAGO_APROBADO: "pago.aprobado",
  PAGO_RECHAZADO: "pago.rechazado",
  SUSCRIPCION_ACTIVADA: "suscripcion.activada",
  SUSCRIPCION_CANCELADA: "suscripcion.cancelada",
} as const;

export type EventType = (typeof EVENTS)[keyof typeof EVENTS];

export const ServiceSourceSchema = z.enum([
  "nous", "hermes", "iris", "pistis", "talanton", "talaria", "logos", "mnemosyne", "peitho", "talos",
  "hermes", "talanton", "talaria", "pistis", "iris",
  "logos", "mnemosyne", "hub", "comercial", "automatizacion", "portal",
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
  [EVENTS.INVENTORY_SYNC_FROM_HERMES]: z.object({ items: z.array(z.object({ sku: z.string(), stock: z.number().int() })) }),
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

  // --- Pagos Mercado Pago ---
  /**
   * pago.iniciado — se emite al crear la preferencia/preaprobación en MP.
   * La llave `externalReference` transporta el identificador de negocio del
   * recurso que origina el pago (orderId, storeId, userId, etc.).
   */
  [EVENTS.PAGO_INICIADO]: z.object({
    paymentRef: z.string(),
    gateway: z.literal("mercadopago"),
    tipo: z.enum(["checkout", "preapproval"]),
    monto: z.number().nonnegative(),
    moneda: z.string().default("COP"),
    externalReference: z.string(),
    preferenceId: z.string(),
  }),

  /**
   * pago.aprobado — se emite al recibir la notificación de pago aprobado de MP.
   * Cuando el recurso es un pedido de Hermes, Nous dispara también
   * `pedido.pagado` como evento downstream de negocio.
   */
  [EVENTS.PAGO_APROBADO]: z.object({
    paymentRef: z.string(),
    gateway: z.string(),
    monto: z.number().nonnegative(),
    moneda: z.string().default("COP"),
    externalReference: z.string(),
    mpPaymentId: z.string(),
    status: z.string(),
  }),

  /**
   * pago.rechazado — se emite cuando MP notifica que el pago no fue aprobado.
   */
  [EVENTS.PAGO_RECHAZADO]: z.object({
    paymentRef: z.string(),
    gateway: z.string(),
    externalReference: z.string(),
    motivo: z.string(),
  }),

  /**
   * suscripcion.activada — se emite cuando una preaprobación de MP queda activa.
   * `mpPreapprovalId` es el ID de la suscripción en Mercado Pago.
   */
  [EVENTS.SUSCRIPCION_ACTIVADA]: z.object({
    subRef: z.string(),
    plan: z.string(),
    monto: z.number().nonnegative(),
    moneda: z.string().default("COP"),
    externalReference: z.string(),
    mpPreapprovalId: z.string(),
  }),

  /**
   * suscripcion.cancelada — se emite cuando se cancela una suscripción (por el
   * usuario, por el sistema, o por notificación de MP).
   */
  [EVENTS.SUSCRIPCION_CANCELADA]: z.object({
    subRef: z.string(),
    externalReference: z.string(),
    motivo: z.string(),
  }),
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

// ---------------------------------------------------------------------------
// Tipos derivados para los payloads de Mercado Pago
// ---------------------------------------------------------------------------

/** Payload de `pago.iniciado` */
export type PagoIniciadoPayload = z.infer<typeof Payloads[typeof EVENTS.PAGO_INICIADO]>;

/** Payload de `pago.aprobado` */
export type PagoAprobadoPayload = z.infer<typeof Payloads[typeof EVENTS.PAGO_APROBADO]>;

/** Payload de `pago.rechazado` */
export type PagoRechazadoPayload = z.infer<typeof Payloads[typeof EVENTS.PAGO_RECHAZADO]>;

/** Payload de `suscripcion.activada` */
export type SuscripcionActivadaPayload = z.infer<typeof Payloads[typeof EVENTS.SUSCRIPCION_ACTIVADA]>;

/** Payload de `suscripcion.cancelada` */
export type SuscripcionCanceladaPayload = z.infer<typeof Payloads[typeof EVENTS.SUSCRIPCION_CANCELADA]>;
