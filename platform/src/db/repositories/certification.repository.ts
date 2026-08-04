import { randomUUID } from 'crypto';
import { Kysely } from 'kysely';
import { DB } from '../schema';
import {
  CertificationSession, CertificationDoc, CertificationTestFile, CertificationIssue,
  CertificationMessage, CertificationEvent, RecordTestFileInput, SessionStatus, CertDocRole,
  CertDocStatus, Party, Verdict, IssueKind, IssueSeverity, IssueStatus, isDocSatisfied,
} from '../../control-plane/certification.types';
import { FormatAuthority } from '../../control-plane/config.types';

/**
 * Durable store for the certification/onboarding plane (see docs/design/onboarding-certification.md).
 * Everything the board does persists here — sessions, per-doc cards, dropped test-file attempts + their
 * segment/element issues, the bilateral message thread, and the append-only event feed. Tenant-scoped.
 * The certify GATE (a session can't be certified while a blocking doc is unsatisfied) lives here so it
 * is enforced in one place, not in the UI.
 */
export class CertificationRepository {
  constructor(private readonly db: Kysely<DB>) {}

  // Strictly-increasing stamp: wall-clock is ms-resolution, so a burst in one ms would tie and the
  // random-uuid tiebreak would reorder the thread/feed. Bump by 1ms on collision for a stable order.
  private lastStamp = 0;
  private now(): string {
    const t = Math.max(Date.now(), this.lastStamp + 1);
    this.lastStamp = t;
    return new Date(t).toISOString();
  }

  // ── sessions ──
  async createSession(input: { tenantId: string; relationshipId: string; formatAuthority: FormatAuthority; specVersion?: string }): Promise<CertificationSession> {
    const row = {
      id: randomUUID(), tenant_id: input.tenantId, relationship_id: input.relationshipId,
      format_authority: input.formatAuthority, status: 'draft', spec_version: input.specVersion ?? null,
      created_at: this.now(), certified_at: null, certified_by: null,
    };
    await this.db.insertInto('certification_session').values(row).execute();
    await this.logEvent({ tenantId: input.tenantId, sessionId: row.id, actor: 'system', verb: 'session_created' });
    return this.rowToSession(row);
  }

  async getSession(tenantId: string, id: string): Promise<CertificationSession | undefined> {
    const r = await this.db.selectFrom('certification_session').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    return r && this.rowToSession(r);
  }

  async getSessionByRelationship(tenantId: string, relationshipId: string): Promise<CertificationSession | undefined> {
    const r = await this.db.selectFrom('certification_session').selectAll()
      .where('tenant_id', '=', tenantId).where('relationship_id', '=', relationshipId)
      .orderBy('created_at', 'desc').executeTakeFirst();
    return r && this.rowToSession(r);
  }

  async listSessions(tenantId: string): Promise<CertificationSession[]> {
    const rows = await this.db.selectFrom('certification_session').selectAll().where('tenant_id', '=', tenantId).orderBy('created_at').execute();
    return rows.map((r) => this.rowToSession(r));
  }

  async setSessionStatus(tenantId: string, id: string, status: SessionStatus): Promise<void> {
    await this.db.updateTable('certification_session').set({ status }).where('tenant_id', '=', tenantId).where('id', '=', id).execute();
    await this.logEvent({ tenantId, sessionId: id, actor: 'system', verb: 'status_changed', detail: status });
  }

  // ── docs (cards) ──
  async addDoc(input: {
    tenantId: string; sessionId: string; docType: string; role: CertDocRole; direction: string;
    producedBy: Party; validatedBy: Party; referenceArtifactId?: string; blocking?: boolean;
  }): Promise<CertificationDoc> {
    const row = {
      id: randomUUID(), tenant_id: input.tenantId, session_id: input.sessionId, doc_type: input.docType,
      role: input.role, direction: input.direction, produced_by: input.producedBy, validated_by: input.validatedBy,
      reference_artifact_id: input.referenceArtifactId ?? null, status: 'awaiting',
      blocking: (input.blocking ?? true) ? 1 : 0, attempt_count: 0, updated_at: this.now(),
    };
    await this.db.insertInto('certification_doc').values(row).execute();
    return this.rowToDoc(row);
  }

  async listDocs(tenantId: string, sessionId: string): Promise<CertificationDoc[]> {
    const rows = await this.db.selectFrom('certification_doc').selectAll().where('tenant_id', '=', tenantId).where('session_id', '=', sessionId).execute();
    return rows.map((r) => this.rowToDoc(r));
  }

  async getDoc(tenantId: string, id: string): Promise<CertificationDoc | undefined> {
    const r = await this.db.selectFrom('certification_doc').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    return r && this.rowToDoc(r);
  }

  /** Waive a blocking doc (operator decision), so it no longer holds certification. */
  async setDocStatus(tenantId: string, id: string, status: CertDocStatus): Promise<void> {
    await this.db.updateTable('certification_doc').set({ status, updated_at: this.now() }).where('tenant_id', '=', tenantId).where('id', '=', id).execute();
  }

  /** Attach the authoritative side's reference sample artifact to a doc (e.g. the gold 850 on the anchor). */
  async setDocReference(tenantId: string, id: string, referenceArtifactId: string): Promise<void> {
    await this.db.updateTable('certification_doc').set({ reference_artifact_id: referenceArtifactId, updated_at: this.now() }).where('tenant_id', '=', tenantId).where('id', '=', id).execute();
  }

  // ── test files + issues ──
  /**
   * Record a validated attempt: insert the test file + its issues, bump the doc's attempt count and set
   * its status from the verdict, and log an event — atomically, so a card's state always matches its files.
   */
  async recordTestFile(input: RecordTestFileInput): Promise<CertificationTestFile> {
    return this.db.transaction().execute(async (trx) => {
      const doc = await trx.selectFrom('certification_doc').selectAll().where('tenant_id', '=', input.tenantId).where('id', '=', input.certDocId).executeTakeFirst();
      if (!doc) throw new Error(`certification_doc ${input.certDocId} not found`);
      const attemptNo = doc.attempt_count + 1;
      const createdAt = this.now();
      const fileId = randomUUID();
      await trx.insertInto('certification_test_file').values({
        id: fileId, tenant_id: input.tenantId, cert_doc_id: input.certDocId, raw_artifact_id: input.rawArtifactId,
        uploaded_by: input.uploadedBy, attempt_no: attemptNo, verdict: input.verdict, correlated: input.correlated ? 1 : 0, created_at: createdAt,
      }).execute();

      const issues: CertificationIssue[] = [];
      for (const i of input.issues) {
        const issueRow = {
          id: randomUUID(), tenant_id: input.tenantId, test_file_id: fileId, segment: i.segment ?? null, element: i.element ?? null,
          kind: i.kind, severity: i.severity, code: i.code ?? null, message: i.message, ai_suggestion: i.aiSuggestion ?? null,
          directed_to: i.directedTo, status: i.status,
        };
        await trx.insertInto('certification_issue').values(issueRow).execute();
        issues.push(this.rowToIssue(issueRow));
      }

      await trx.updateTable('certification_doc')
        .set({ status: input.verdict as CertDocStatus, attempt_count: attemptNo, updated_at: createdAt })
        .where('id', '=', input.certDocId).execute();

      await this.logEventTx(trx, { tenantId: input.tenantId, sessionId: doc.session_id, actor: input.uploadedBy, verb: 'file_validated', docType: doc.doc_type, detail: input.verdict });

      return {
        id: fileId, tenantId: input.tenantId, certDocId: input.certDocId, rawArtifactId: input.rawArtifactId,
        uploadedBy: input.uploadedBy, attemptNo, verdict: input.verdict, correlated: input.correlated, createdAt, issues,
      };
    });
  }

  async listTestFiles(tenantId: string, certDocId: string): Promise<CertificationTestFile[]> {
    const files = await this.db.selectFrom('certification_test_file').selectAll().where('tenant_id', '=', tenantId).where('cert_doc_id', '=', certDocId).orderBy('attempt_no').execute();
    const out: CertificationTestFile[] = [];
    for (const f of files) {
      const issues = await this.db.selectFrom('certification_issue').selectAll().where('test_file_id', '=', f.id).execute();
      out.push({
        id: f.id, tenantId: f.tenant_id, certDocId: f.cert_doc_id, rawArtifactId: f.raw_artifact_id, uploadedBy: f.uploaded_by as Party,
        attemptNo: f.attempt_no, verdict: f.verdict as Verdict, correlated: f.correlated === 1, createdAt: f.created_at,
        issues: issues.map((i) => this.rowToIssue(i)),
      });
    }
    return out;
  }

  // ── messages (bilateral thread) ──
  async addMessage(input: { tenantId: string; sessionId: string; certDocId?: string; relatedIssueId?: string; authorRole: Party; authorUserId?: string; body: string }): Promise<CertificationMessage> {
    const row = {
      id: randomUUID(), tenant_id: input.tenantId, session_id: input.sessionId, cert_doc_id: input.certDocId ?? null,
      related_issue_id: input.relatedIssueId ?? null, author_role: input.authorRole, author_user_id: input.authorUserId ?? null,
      body: input.body, created_at: this.now(), delivered_at: this.now(), // sent AND stored (no fire-and-forget)
    };
    await this.db.insertInto('certification_message').values(row).execute();
    await this.logEvent({ tenantId: input.tenantId, sessionId: input.sessionId, actor: input.authorRole, verb: 'message_sent', docType: undefined });
    return {
      id: row.id, tenantId: row.tenant_id, sessionId: row.session_id, certDocId: row.cert_doc_id ?? undefined,
      relatedIssueId: row.related_issue_id ?? undefined, authorRole: row.author_role as Party,
      authorUserId: row.author_user_id ?? undefined, body: row.body, createdAt: row.created_at, deliveredAt: row.delivered_at ?? undefined,
    };
  }

  async listMessages(tenantId: string, sessionId: string): Promise<CertificationMessage[]> {
    const rows = await this.db.selectFrom('certification_message').selectAll().where('tenant_id', '=', tenantId).where('session_id', '=', sessionId).orderBy('created_at').orderBy('id').execute();
    return rows.map((r) => ({
      id: r.id, tenantId: r.tenant_id, sessionId: r.session_id, certDocId: r.cert_doc_id ?? undefined,
      relatedIssueId: r.related_issue_id ?? undefined, authorRole: r.author_role as Party, authorUserId: r.author_user_id ?? undefined,
      body: r.body, createdAt: r.created_at, deliveredAt: r.delivered_at ?? undefined,
    }));
  }

  // ── events (append-only feed) ──
  async logEvent(input: { tenantId: string; sessionId: string; actor: Party; verb: string; docType?: string; detail?: string }): Promise<void> {
    await this.logEventTx(this.db, input);
  }

  private async logEventTx(db: Kysely<DB>, input: { tenantId: string; sessionId: string; actor: Party; verb: string; docType?: string; detail?: string }): Promise<void> {
    // Per-session monotonic seq (max+1) for stable ordering — robust across instances, unlike ms wall-clock.
    const max = await db.selectFrom('certification_event').select((eb) => eb.fn.max('seq').as('m')).where('session_id', '=', input.sessionId).executeTakeFirst();
    const seq = ((max?.m as number | null) ?? 0) + 1;
    await db.insertInto('certification_event').values({
      id: randomUUID(), tenant_id: input.tenantId, session_id: input.sessionId, actor: input.actor, verb: input.verb,
      doc_type: input.docType ?? null, detail: input.detail ?? null, created_at: this.now(), seq,
    }).execute();
  }

  async listEvents(tenantId: string, sessionId: string): Promise<CertificationEvent[]> {
    const rows = await this.db.selectFrom('certification_event').selectAll().where('tenant_id', '=', tenantId).where('session_id', '=', sessionId).orderBy('seq').execute();
    return rows.map((r) => ({
      id: r.id, tenantId: r.tenant_id, sessionId: r.session_id, actor: r.actor as Party, verb: r.verb,
      docType: r.doc_type ?? undefined, detail: r.detail ?? undefined, createdAt: r.created_at, seq: r.seq,
    }));
  }

  // ── the certify gate ──
  /** True only when every BLOCKING doc is satisfied (passed or waived). Non-blocking docs never hold. */
  async canCertify(tenantId: string, sessionId: string): Promise<boolean> {
    const docs = await this.listDocs(tenantId, sessionId);
    return docs.filter((d) => d.blocking).every((d) => isDocSatisfied(d.status));
  }

  /** Certify + activate — enforced by the gate. Throws if a blocking doc is still unsatisfied. */
  async certify(tenantId: string, sessionId: string, certifiedBy: string): Promise<CertificationSession> {
    if (!(await this.canCertify(tenantId, sessionId))) {
      throw new Error('cannot certify: a blocking document is still unsatisfied');
    }
    const at = this.now();
    await this.db.updateTable('certification_session').set({ status: 'certified', certified_at: at, certified_by: certifiedBy }).where('tenant_id', '=', tenantId).where('id', '=', sessionId).execute();
    await this.logEvent({ tenantId, sessionId, actor: 'client', verb: 'certified', detail: certifiedBy });
    const s = await this.getSession(tenantId, sessionId);
    return s!;
  }

  // ── row mappers ──
  private rowToSession(r: DB['certification_session']): CertificationSession {
    return {
      id: r.id, tenantId: r.tenant_id, relationshipId: r.relationship_id, formatAuthority: r.format_authority as FormatAuthority,
      status: r.status as SessionStatus, specVersion: r.spec_version ?? undefined, createdAt: r.created_at,
      certifiedAt: r.certified_at ?? undefined, certifiedBy: r.certified_by ?? undefined,
    };
  }
  private rowToDoc(r: DB['certification_doc']): CertificationDoc {
    return {
      id: r.id, tenantId: r.tenant_id, sessionId: r.session_id, docType: r.doc_type, role: r.role as CertDocRole,
      direction: r.direction, producedBy: r.produced_by as Party, validatedBy: r.validated_by as Party,
      referenceArtifactId: r.reference_artifact_id ?? undefined, status: r.status as CertDocStatus,
      blocking: r.blocking === 1, attemptCount: r.attempt_count, updatedAt: r.updated_at,
    };
  }
  private rowToIssue(r: DB['certification_issue']): CertificationIssue {
    return {
      id: r.id, tenantId: r.tenant_id, testFileId: r.test_file_id, segment: r.segment ?? undefined, element: r.element ?? undefined,
      kind: r.kind as IssueKind, severity: r.severity as IssueSeverity, code: r.code ?? undefined, message: r.message,
      aiSuggestion: r.ai_suggestion ?? undefined, directedTo: r.directed_to as Party, status: r.status as IssueStatus,
    };
  }
}
