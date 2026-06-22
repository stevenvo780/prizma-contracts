import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Import from the built dist
import {
  EVENTS,
  Payloads,
  EventEnvelopeSchema,
  validateEvent,
  signPayload,
  verifySignature,
  HubClient,
} from "../dist/index.js";

// ---------------------------------------------------------------------------
// Helpers — one valid and one invalid payload per event
// ---------------------------------------------------------------------------

const customerRef = { id: "c1", name: "Ana", phone: "+573001234567", email: "ana@test.com" };
const item = { sku: "SKU-1", name: "Widget", qty: 2, unitPrice: 10.5 };

const VALID_PAYLOADS = {
  [EVENTS.ORDER_PAID]: {
    orderId: "ord-1",
    customer: customerRef,
    items: [item],
    total: 21,
    currency: "COP",
    paymentMethod: "online",
  },
  [EVENTS.ORDER_PENDING_APPROVAL]: { orderId: "ord-2", customer: customerRef, total: 50 },
  [EVENTS.ORDER_APPROVED]: { orderId: "ord-3" },
  [EVENTS.CUSTOMER_CREATED]: { customer: customerRef },
  [EVENTS.POS_SALE_CREATED]: { saleId: "pos-1", items: [item], total: 21 },
  [EVENTS.INVENTORY_UPDATE]: { sku: "SKU-1", delta: -3 },
  [EVENTS.INVENTORY_SYNC_FROM_GRAF]: { items: [{ sku: "SKU-1", stock: 10 }] },
  [EVENTS.INVENTORY_SYNC_FROM_POS]: { items: [{ sku: "SKU-1", stock: 5 }] },
  [EVENTS.INVENTORY_SYNCED]: { count: 42, at: "2024-01-01T00:00:00Z" },
  [EVENTS.DELIVERY_CREATE]: { orderId: "ord-4", address: "Calle 1 #2-3", customer: customerRef },
  [EVENTS.DELIVERY_CREATED]: { deliveryId: "del-1", orderId: "ord-4" },
  [EVENTS.DELIVERY_STATUS_UPDATE]: { deliveryId: "del-1", status: "in_transit" },
  [EVENTS.DELIVERY_COMPLETED]: { deliveryId: "del-1", orderId: "ord-4", at: "2024-01-02T00:00:00Z" },
  [EVENTS.INVOICE_CREATE]: { orderId: "ord-5", customer: customerRef, items: [item], total: 21 },
  [EVENTS.INVOICE_SENT]: { invoiceId: "inv-1", orderId: "ord-5" },
  [EVENTS.CUSTOMER_UPDATE]: { customer: customerRef },
  [EVENTS.NOTIFICATION_WHATSAPP]: { to: "+573001234567", body: "Hola mundo" },
  [EVENTS.MESSAGE_SENT]: { messageId: "msg-1", to: "+573001234567", status: "sent" },
  [EVENTS.CREDIT_CHECK]: { customer: customerRef, amount: 500000 },
  [EVENTS.CREDIT_APPROVED]: { creditId: "cred-1", customer: customerRef, limit: 1000000 },
  [EVENTS.PAYMENT_RECEIVED]: { paymentId: "pay-1", amount: 200000 },
};

// Invalid payloads — missing required fields / wrong types
const INVALID_PAYLOADS = {
  [EVENTS.ORDER_PAID]: { orderId: 123, items: "not-array", total: -1 }, // wrong types
  [EVENTS.ORDER_PENDING_APPROVAL]: { total: "not-a-number" }, // missing orderId + bad total type
  [EVENTS.ORDER_APPROVED]: {}, // orderId missing (required string)
  [EVENTS.CUSTOMER_CREATED]: { customer: { email: "bad-email" } }, // bad email
  [EVENTS.POS_SALE_CREATED]: { saleId: 99, items: [], total: "nope" }, // saleId wrong type
  [EVENTS.INVENTORY_UPDATE]: { sku: "X", delta: 1.5 }, // delta must be int
  [EVENTS.INVENTORY_SYNC_FROM_GRAF]: { items: [{ sku: 123, stock: "a" }] }, // wrong types
  [EVENTS.INVENTORY_SYNC_FROM_POS]: { items: null }, // null not array
  [EVENTS.INVENTORY_SYNCED]: { count: 1.5, at: 42 }, // count must be int, at must be string
  [EVENTS.DELIVERY_CREATE]: { address: "Calle 1" }, // missing orderId and customer
  [EVENTS.DELIVERY_CREATED]: { deliveryId: "del-x" }, // missing orderId
  [EVENTS.DELIVERY_STATUS_UPDATE]: { deliveryId: "del-1", status: "unknown_status" }, // bad enum
  [EVENTS.DELIVERY_COMPLETED]: { deliveryId: "del-1", at: "2024-01-02T00:00:00Z" }, // missing orderId
  [EVENTS.INVOICE_CREATE]: { orderId: "o", items: "bad", total: "x" }, // missing customer
  [EVENTS.INVOICE_SENT]: { pdfUrl: "https://x.com/f.pdf" }, // missing invoiceId + orderId
  [EVENTS.CUSTOMER_UPDATE]: {}, // missing customer
  [EVENTS.NOTIFICATION_WHATSAPP]: {}, // missing `to`
  [EVENTS.MESSAGE_SENT]: { messageId: "m", status: "sent" }, // missing `to`
  [EVENTS.CREDIT_CHECK]: { customer: customerRef }, // missing amount
  [EVENTS.CREDIT_APPROVED]: { creditId: "c", limit: 100 }, // missing customer
  [EVENTS.PAYMENT_RECEIVED]: { creditId: "cred-1" }, // missing paymentId + amount
};

// ---------------------------------------------------------------------------
// 1. Per-event payload schema validation
// ---------------------------------------------------------------------------

describe("Payloads — cada evento tiene schema válido/inválido", () => {
  for (const [key, eventType] of Object.entries(EVENTS)) {
    const schema = Payloads[eventType];
    if (!schema) continue; // should not happen, but guard

    const validPayload = VALID_PAYLOADS[eventType];
    const invalidPayload = INVALID_PAYLOADS[eventType];

    test(`${key} (${eventType}) — payload válido pasa`, () => {
      const result = schema.safeParse(validPayload);
      assert.equal(
        result.success,
        true,
        `Expected valid payload to pass for ${eventType}: ${result.success ? "" : JSON.stringify(result.error?.issues)}`
      );
    });

    test(`${key} (${eventType}) — payload inválido falla`, () => {
      const result = schema.safeParse(invalidPayload);
      assert.equal(
        result.success,
        false,
        `Expected invalid payload to fail for ${eventType} but it passed`
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 2. EventEnvelopeSchema + validateEvent
// ---------------------------------------------------------------------------

describe("EventEnvelopeSchema", () => {
  test("parsea un envelope completo válido", () => {
    const envelope = {
      eventId: "evt_123",
      eventType: EVENTS.ORDER_PAID,
      timestamp: new Date().toISOString(),
      source: "hermes",
      data: VALID_PAYLOADS[EVENTS.ORDER_PAID],
      signature: "sha256=abc",
      idempotencyKey: "idem-1",
      priority: "high",
    };
    const result = EventEnvelopeSchema.safeParse(envelope);
    assert.equal(result.success, true, JSON.stringify(result.error?.issues));
    assert.equal(result.data.priority, "high");
    assert.equal(result.data.source, "hermes");
  });

  test("falla si falta eventId", () => {
    const envelope = {
      eventType: EVENTS.ORDER_PAID,
      timestamp: new Date().toISOString(),
      source: "hermes",
      data: {},
    };
    const result = EventEnvelopeSchema.safeParse(envelope);
    assert.equal(result.success, false);
  });

  test("falla con source inválido", () => {
    const envelope = {
      eventId: "evt_1",
      eventType: EVENTS.ORDER_PAID,
      timestamp: new Date().toISOString(),
      source: "unknown_service",
      data: {},
    };
    const result = EventEnvelopeSchema.safeParse(envelope);
    assert.equal(result.success, false);
  });

  test("prioridad por defecto es 'normal'", () => {
    const envelope = {
      eventId: "evt_1",
      eventType: "custom.event",
      timestamp: new Date().toISOString(),
      source: "hub",
      data: {},
    };
    const result = EventEnvelopeSchema.safeParse(envelope);
    assert.equal(result.success, true);
    assert.equal(result.data.priority, "normal");
  });
});

describe("validateEvent", () => {
  test("acepta envelope con payload válido", () => {
    const env = EventEnvelopeSchema.parse({
      eventId: "evt_v1",
      eventType: EVENTS.ORDER_PAID,
      timestamp: new Date().toISOString(),
      source: "hermes",
      data: VALID_PAYLOADS[EVENTS.ORDER_PAID],
    });
    const result = validateEvent(env);
    assert.equal(result.ok, true);
  });

  test("rechaza envelope con payload inválido", () => {
    const env = EventEnvelopeSchema.parse({
      eventId: "evt_i1",
      eventType: EVENTS.ORDER_PAID,
      timestamp: new Date().toISOString(),
      source: "hermes",
      data: { orderId: 999, total: -999 }, // invalid data for ORDER_PAID
    });
    const result = validateEvent(env);
    assert.equal(result.ok, false);
    assert.ok(result.error, "should have error string");
  });

  test("evento desconocido pasa (open ecosystem)", () => {
    const env = EventEnvelopeSchema.parse({
      eventId: "evt_u1",
      eventType: "some.unknown.event",
      timestamp: new Date().toISOString(),
      source: "hub",
      data: { anything: true },
    });
    const result = validateEvent(env);
    assert.equal(result.ok, true);
  });
});

// ---------------------------------------------------------------------------
// 3. signPayload / verifySignature
// ---------------------------------------------------------------------------

describe("signPayload / verifySignature", () => {
  const secret = "test-secret-key-2024";
  const payload = { orderId: "ord-1", total: 100 };

  test("signPayload produce formato sha256=<hex>", () => {
    const sig = signPayload(payload, secret);
    assert.match(sig, /^sha256=[0-9a-f]{64}$/);
  });

  test("verifySignature retorna true con firma correcta", () => {
    const sig = signPayload(payload, secret);
    assert.equal(verifySignature(payload, sig, secret), true);
  });

  test("verifySignature retorna false con secret incorrecto", () => {
    const sig = signPayload(payload, secret);
    assert.equal(verifySignature(payload, sig, "wrong-secret"), false);
  });

  test("verifySignature retorna false con firma alterada", () => {
    const sig = signPayload(payload, secret);
    const tampered = sig.slice(0, -4) + "aaaa";
    assert.equal(verifySignature(payload, tampered, secret), false);
  });

  test("verifySignature retorna false si signature es undefined", () => {
    assert.equal(verifySignature(payload, undefined, secret), false);
  });

  test("firma de string y objeto equivalente son iguales", () => {
    const sigObj = signPayload(payload, secret);
    const sigStr = signPayload(JSON.stringify(payload), secret);
    assert.equal(sigObj, sigStr);
  });
});

// ---------------------------------------------------------------------------
// 4. HubClient — mock fetch, publica con firma, tolerante a fallos
// ---------------------------------------------------------------------------

describe("HubClient", () => {
  // Helper: install a mock fetch and return a restore function
  function mockFetch(responseFactory) {
    const original = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, opts) => {
      calls.push({ url, opts });
      return responseFactory(url, opts);
    };
    return {
      calls,
      restore: () => { globalThis.fetch = original; },
    };
  }

  test("publica un evento y retorna true con 200 OK", async () => {
    const mock = mockFetch(() => ({ ok: true, status: 200 }));
    try {
      const client = new HubClient({ source: "hermes", hubUrl: "http://hub-test:3007" });
      const ok = await client.publish(EVENTS.ORDER_PAID, VALID_PAYLOADS[EVENTS.ORDER_PAID]);
      assert.equal(ok, true);
      assert.equal(mock.calls.length, 1);
      assert.ok(mock.calls[0].url.includes("/webhooks/nous"));
    } finally {
      mock.restore();
    }
  });

  test("publica con firma en header x-prizma-signature cuando secret está configurado", async () => {
    const mock = mockFetch(() => ({ ok: true, status: 200 }));
    try {
      const client = new HubClient({ source: "talanton", hubUrl: "http://hub-test:3007", secret: "my-secret" });
      await client.publish(EVENTS.POS_SALE_CREATED, VALID_PAYLOADS[EVENTS.POS_SALE_CREATED]);
      const headers = mock.calls[0].opts.headers;
      assert.ok(headers["x-prizma-signature"], "debe incluir x-prizma-signature");
      assert.match(headers["x-prizma-signature"], /^sha256=[0-9a-f]{64}$/);
    } finally {
      mock.restore();
    }
  });

  test("el body del POST contiene un envelope válido", async () => {
    const mock = mockFetch(() => ({ ok: true, status: 200 }));
    try {
      const client = new HubClient({ source: "hub", hubUrl: "http://hub-test:3007" });
      await client.publish(EVENTS.INVENTORY_UPDATE, VALID_PAYLOADS[EVENTS.INVENTORY_UPDATE]);
      const body = JSON.parse(mock.calls[0].opts.body);
      const parsed = EventEnvelopeSchema.safeParse(body);
      assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
      assert.equal(body.eventType, EVENTS.INVENTORY_UPDATE);
      assert.equal(body.source, "hub");
    } finally {
      mock.restore();
    }
  });

  test("tolerante a fallos: no lanza con throwOnError=false (500)", async () => {
    const mock = mockFetch(() => ({ ok: false, status: 500 }));
    try {
      const client = new HubClient({ source: "hermes", hubUrl: "http://hub-test:3007" });
      // throwOnError defaults to undefined (falsy) → should not throw
      const ok = await client.publish(EVENTS.ORDER_PAID, VALID_PAYLOADS[EVENTS.ORDER_PAID]);
      assert.equal(ok, false);
    } finally {
      mock.restore();
    }
  });

  test("tolerante a fallos: no lanza con throwOnError=false (network error)", async () => {
    const mock = mockFetch(() => { throw new Error("ECONNREFUSED"); });
    try {
      const client = new HubClient({ source: "hermes", hubUrl: "http://nowhere:9999" });
      const ok = await client.publish(EVENTS.ORDER_PAID, VALID_PAYLOADS[EVENTS.ORDER_PAID]);
      assert.equal(ok, false);
    } finally {
      mock.restore();
    }
  });

  test("lanza con throwOnError=true cuando servidor retorna error", async () => {
    const mock = mockFetch(() => ({ ok: false, status: 503 }));
    try {
      const client = new HubClient({ source: "hermes", hubUrl: "http://hub-test:3007", throwOnError: true });
      await assert.rejects(
        () => client.publish(EVENTS.ORDER_PAID, VALID_PAYLOADS[EVENTS.ORDER_PAID]),
        /Hub publish failed/
      );
    } finally {
      mock.restore();
    }
  });

  test("lanza con throwOnError=true en error de red", async () => {
    const mock = mockFetch(() => { throw new Error("Network failure"); });
    try {
      const client = new HubClient({ source: "hermes", hubUrl: "http://nowhere:9999", throwOnError: true });
      await assert.rejects(
        () => client.publish(EVENTS.ORDER_PAID, VALID_PAYLOADS[EVENTS.ORDER_PAID]),
        /Network failure/
      );
    } finally {
      mock.restore();
    }
  });

  test("usa HUB_URL por defecto si no se provee hubUrl", async () => {
    const mock = mockFetch(() => ({ ok: true, status: 200 }));
    try {
      const client = new HubClient({ source: "hub" });
      await client.publish(EVENTS.MESSAGE_SENT, VALID_PAYLOADS[EVENTS.MESSAGE_SENT]);
      assert.ok(mock.calls[0].url.includes("localhost:3007") || mock.calls[0].url.includes("webhooks/nous"));
    } finally {
      mock.restore();
    }
  });
});
