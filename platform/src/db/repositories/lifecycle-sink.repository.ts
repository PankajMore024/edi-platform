import { randomUUID } from 'crypto';
import { Kysely } from 'kysely';
import { DB } from '../schema';
import { LifecycleSink, InterchangeRecord, AckRecord, DeliveryRecord, DispatchRecord } from '../../intake/lifecycle-sink';

/** Durable implementation of LifecycleSink — writes the interchange / acknowledgment / delivery /
 * dispatch-queue rows. */
export class DbLifecycleSink extends LifecycleSink {
  constructor(private readonly db: Kysely<DB>) { super(); }

  async saveInterchange(r: InterchangeRecord): Promise<string> {
    const id = randomUUID();
    await this.db.insertInto('interchange').values({
      id, tenant_id: r.tenantId, relationship_id: r.relationshipId ?? null, artifact_id: r.artifactId, direction: r.direction,
      dedup_key: r.dedupKey, isa13: r.isa13, sender_id: r.senderId, receiver_id: r.receiverId, status: r.status,
      occurrence: r.occurrence, conflict: r.conflict ? 1 : 0, received_at: r.receivedAt,
    }).execute();
    return id;
  }

  async saveAck(r: AckRecord): Promise<string> {
    const id = randomUUID();
    await this.db.insertInto('acknowledgment').values({
      id, tenant_id: r.tenantId, relationship_id: r.relationshipId, interchange_id: r.interchangeId ?? null, ack_type: r.ackType,
      control_number: r.controlNumber, group_control_number: r.groupControlNumber, edi: r.edi, ak9: r.ak9 ?? null,
      dispatched: 0, dispatched_at: null, created_at: new Date().toISOString(),
    }).execute();
    return id;
  }

  async recordDelivery(r: DeliveryRecord): Promise<void> {
    await this.db.insertInto('delivery').values({
      id: randomUUID(), tenant_id: r.tenantId, transaction_id: r.transactionId, connector_instance_id: r.connectorInstanceId ?? null,
      format: r.format, payload: r.payload, delivered_at: r.deliveredAt, status: r.status,
    }).execute();
  }

  async enqueueDispatch(r: DispatchRecord): Promise<void> {
    await this.db.insertInto('dispatch_queue').values({
      id: randomUUID(), tenant_id: r.tenantId, ack_id: r.ackId ?? null, transaction_id: r.transactionId ?? null,
      transport_instance_id: r.transportInstanceId ?? null, status: r.status, attempts: 0, next_attempt_at: null, created_at: new Date().toISOString(),
    }).execute();
  }
}
