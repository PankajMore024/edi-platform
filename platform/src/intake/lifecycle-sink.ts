import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

/** The write-side lifecycle records the inbound pipeline produces alongside the transaction itself:
 * the interchange envelope, the generated 997, what was delivered, and the outbound send queue. */
export interface InterchangeRecord {
  tenantId: string; relationshipId?: string; artifactId: string; direction: string; dedupKey: string;
  isa13: string; senderId: string; receiverId: string; status: string; occurrence: number; conflict: boolean; receivedAt: string;
}
export interface AckRecord {
  tenantId: string; relationshipId: string; interchangeId?: string; ackType: string;
  controlNumber: string; groupControlNumber: string; edi: string; ak9?: string;
}
export interface DeliveryRecord {
  tenantId: string; transactionId: string; connectorInstanceId?: string; format: string; payload: string; status: string; deliveredAt: string;
}
export interface DispatchRecord { tenantId: string; ackId?: string; transactionId?: string; transportInstanceId?: string; status: string; }

/**
 * Persists the write-side lifecycle records. Bundled because the inbound pipeline is their single
 * producer; a durable DB impl and an in-memory impl (for unit tests) satisfy the same contract.
 */
export abstract class LifecycleSink {
  abstract saveInterchange(r: InterchangeRecord): Promise<string>;
  abstract saveAck(r: AckRecord): Promise<string>;
  abstract recordDelivery(r: DeliveryRecord): Promise<void>;
  abstract enqueueDispatch(r: DispatchRecord): Promise<void>;
}

@Injectable()
export class InMemoryLifecycleSink extends LifecycleSink {
  readonly interchanges: Array<InterchangeRecord & { id: string }> = [];
  readonly acks: Array<AckRecord & { id: string; dispatched: boolean }> = [];
  readonly deliveries: DeliveryRecord[] = [];
  readonly dispatches: Array<DispatchRecord & { id: string }> = [];

  async saveInterchange(r: InterchangeRecord): Promise<string> { const id = randomUUID(); this.interchanges.push({ ...r, id }); return id; }
  async saveAck(r: AckRecord): Promise<string> { const id = randomUUID(); this.acks.push({ ...r, id, dispatched: false }); return id; }
  async recordDelivery(r: DeliveryRecord): Promise<void> { this.deliveries.push(r); }
  async enqueueDispatch(r: DispatchRecord): Promise<void> { this.dispatches.push({ ...r, id: randomUUID() }); }
}
