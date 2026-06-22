import { EventEnvelopeSchema, type EventEnvelope, type EventType, type ServiceSource } from "./events";
import { HUB_URL } from "./services";
import { signPayload } from "./signature";

export interface PublishOptions {
  priority?: EventEnvelope["priority"];
  idempotencyKey?: string;
}

/**
 * Minimal Nous client — publishes events to the orchestrator.
 * Fault-tolerant by design: a failed publish never throws into business logic
 * unless `throwOnError` is set (principle: connectors are optional).
 */
export class HubClient {
  constructor(
    private opts: { source: ServiceSource; hubUrl?: string; secret?: string; throwOnError?: boolean } = { source: "hub" }
  ) {}

  private envelope(eventType: EventType | string, data: Record<string, unknown>, o: PublishOptions = {}): EventEnvelope {
    const env: EventEnvelope = {
      eventId: `evt_${Math.round(performance.now())}_${Math.floor(Math.random() * 1e6)}`,
      eventType,
      timestamp: new Date().toISOString(),
      source: this.opts.source,
      data,
      priority: o.priority || "normal",
      idempotencyKey: o.idempotencyKey,
    };
    if (this.opts.secret) env.signature = signPayload(env.data, this.opts.secret);
    return EventEnvelopeSchema.parse(env);
  }

  async publish(eventType: EventType | string, data: Record<string, unknown>, o: PublishOptions = {}): Promise<boolean> {
    const env = this.envelope(eventType, data, o);
    try {
      const res = await fetch(`${this.opts.hubUrl || HUB_URL}/webhooks/nous`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(env.signature ? { "x-prizma-signature": env.signature } : {}),
        },
        body: JSON.stringify(env),
      });
      if (!res.ok && this.opts.throwOnError) throw new Error(`Hub publish failed: ${res.status}`);
      return res.ok;
    } catch (err) {
      if (this.opts.throwOnError) throw err;
      // optional connector: swallow & let the local system keep working
      console.warn(`[prizma] hub publish "${eventType}" failed (non-fatal):`, (err as Error).message);
      return false;
    }
  }
}
