import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { CertificationRepository } from '../db/repositories/certification.repository';
import { RawArtifactRepository } from '../db/repositories/raw-artifact.repository';
import { RelationshipRepository } from '../db/repositories/relationship.repository';
import { DocSpecRepository, PartnerMapRepository } from '../db/repositories/config-repositories';
import { X12Service } from '../x12/x12.service';
import { IngestService } from '../mapping/engine/ingest.service';
import { EmitService } from '../mapping/engine/emit.service';
import { ConformanceValidator } from '../validation/conformance-validator';
import { HOUSE_SPECS } from '../validation/specs/house-registry';
import { correlateToOrder } from '../validation/correlation';
import { suggestConformance, suggestCorrelation } from './suggestion';
import { REFERENCE_TEMPLATES } from './reference-templates';
import {
  CertificationSession, CertificationDoc, CertificationTestFile, CertDocRole, Party, Verdict,
} from '../control-plane/certification.types';

/**
 * Certification service — orchestrates the board's core flow by composing the durable repository
 * (D90) with the inbound validation layer (D88/D89): store the dropped bytes, parse, validate
 * conformance against the house spec, ingest + correlate to the anchor order when a map is configured,
 * derive a verdict, and record it durably. All engine calls are the same ones the runtime uses.
 */
@Injectable()
export class CertificationService {
  constructor(
    private readonly repo: CertificationRepository,
    private readonly rawArtifacts: RawArtifactRepository,
    private readonly relationships: RelationshipRepository,
    private readonly specs: DocSpecRepository,
    private readonly maps: PartnerMapRepository,
    private readonly x12: X12Service,
    private readonly ingest: IngestService,
    private readonly emit: EmitService,
    private readonly conformance: ConformanceValidator,
  ) {}

  /** Open a session for a relationship and seed a card per configured document flow. */
  async openSession(tenantId: string, relationshipId: string): Promise<{ session: CertificationSession; docs: CertificationDoc[] }> {
    const rel = await this.relationships.get(tenantId, relationshipId);
    if (!rel) throw new NotFoundException(`relationship ${relationshipId} not found`);
    const session = await this.repo.createSession({ tenantId, relationshipId, formatAuthority: rel.formatAuthority, specVersion: rel.version });

    const authoritative: Party = rel.formatAuthority === 'client' ? 'client' : 'partner';
    const other: Party = authoritative === 'client' ? 'partner' : 'client';
    const docs: CertificationDoc[] = [];
    for (const d of rel.documents) {
      const role: CertDocRole = d.docType === '850' ? 'anchor' : d.docType === '846' ? 'standalone' : 'response';
      // Anchor is the reference the authoritative side provides; responses are produced by the other side.
      const producedBy = role === 'anchor' ? authoritative : other;
      const validatedBy = role === 'anchor' ? other : authoritative;
      docs.push(await this.repo.addDoc({
        tenantId, sessionId: session.id, docType: d.docType, role, direction: d.direction,
        producedBy, validatedBy, blocking: role === 'response',
      }));
    }
    return { session, docs };
  }

  /**
   * Auto-generate the authoritative side's reference sample: emit a representative canonical for the
   * doc's type through the configured map, and store it as the reference. Deterministic (no hand-upload).
   */
  async generateReference(tenantId: string, certDocId: string): Promise<string> {
    const doc = await this.repo.getDoc(tenantId, certDocId);
    if (!doc) throw new NotFoundException(`certification doc ${certDocId} not found`);
    const session = await this.repo.getSession(tenantId, doc.sessionId);
    const map = session && (await this.resolveMap(tenantId, session.relationshipId, doc.docType));
    if (!map) throw new NotFoundException(`no map configured for ${doc.docType} — cannot generate a reference`);
    const template = REFERENCE_TEMPLATES[doc.docType];
    if (!template) throw new NotFoundException(`no reference template for ${doc.docType}`);
    const bytes = this.x12.serialize(this.emit.emit(template, map));
    await this.setReference(tenantId, certDocId, bytes);
    return bytes;
  }

  /** Store the authoritative side's reference sample bytes for a doc (e.g. our gold 850 the anchor). */
  async setReference(tenantId: string, certDocId: string, bytes: string): Promise<void> {
    const doc = await this.repo.getDoc(tenantId, certDocId);
    if (!doc) throw new NotFoundException(`certification doc ${certDocId} not found`);
    const artifact = await this.rawArtifacts.put(tenantId, `cert-ref:${certDocId}`, bytes, new Date());
    await this.repo.setDocReference(tenantId, certDocId, artifact.id);
    await this.repo.logEvent({ tenantId, sessionId: doc.sessionId, actor: doc.producedBy, verb: 'reference_set', docType: doc.docType });
  }

  /**
   * Validate a dropped test file and record the attempt. Conformance always runs (house spec or the
   * tenant's override); correlation runs additionally when an inbound map + anchor order are available.
   */
  async dropFile(tenantId: string, certDocId: string, bytes: string, uploadedBy: Party): Promise<CertificationTestFile> {
    const doc = await this.repo.getDoc(tenantId, certDocId);
    if (!doc) throw new NotFoundException(`certification doc ${certDocId} not found`);
    const session = await this.repo.getSession(tenantId, doc.sessionId);
    if (!session) throw new NotFoundException(`certification session not found`);

    const artifact = await this.rawArtifacts.put(tenantId, `cert:${certDocId}`, bytes, new Date());
    const segments = this.x12.parse(bytes);

    const issues: RecordedIssue[] = [];

    // 1) conformance against the house/tenant spec for this doc type.
    const spec = (await this.resolveSpecId(session.relationshipId, tenantId, doc.docType))
      ?? HOUSE_SPECS[doc.docType];
    if (spec) {
      const conf = this.conformance.validate(segments, spec);
      for (const i of conf.issues) {
        issues.push({
          segment: i.segmentTag, element: i.elementPosition != null ? String(i.elementPosition) : undefined,
          kind: 'conformance', severity: 'error', code: i.errorCode, message: i.message,
          aiSuggestion: suggestConformance(i), directedTo: doc.producedBy, status: 'open',
        });
      }
    }

    // 2) correlation to the anchor order, when a map is configured and this doc correlates to an order.
    let correlated = true;
    const map = await this.resolveMap(tenantId, session.relationshipId, doc.docType);
    if (map && doc.role === 'response') {
      const order = await this.resolveAnchorOrder(tenantId, session.id, session.relationshipId);
      if (order) {
        const canonical = this.ingest.ingest(segments, map);
        const corr = correlateToOrder(doc.docType, canonical, order);
        if (corr) {
          correlated = corr.correlated;
          for (const c of corr.issues) {
            issues.push({ kind: 'correlation', severity: 'error', code: c.kind, message: c.message, aiSuggestion: suggestCorrelation(c.kind, c.ref), directedTo: doc.producedBy, status: 'open', segment: c.ref });
          }
        }
      }
    }

    const verdict: Verdict = issues.some((i) => i.severity === 'error') ? 'issues'
      : issues.some((i) => i.severity === 'warning') ? 'warning' : 'passed';

    return this.repo.recordTestFile({
      tenantId, certDocId, rawArtifactId: artifact.id, uploadedBy, verdict, correlated,
      issues: issues.map((i) => ({ ...i })),
    });
  }

  // ── reads + lifecycle pass-throughs (error mapping lives here, not the controller) ──
  listSessions(tenantId: string): Promise<CertificationSession[]> { return this.repo.listSessions(tenantId); }

  async getSessionDetail(tenantId: string, id: string): Promise<{ session: CertificationSession; docs: CertificationDoc[]; canCertify: boolean }> {
    const session = await this.repo.getSession(tenantId, id);
    if (!session) throw new NotFoundException(`certification session ${id} not found`);
    const docs = await this.repo.listDocs(tenantId, id);
    return { session, docs, canCertify: await this.repo.canCertify(tenantId, id) };
  }

  listEvents(tenantId: string, sessionId: string) { return this.repo.listEvents(tenantId, sessionId); }
  listMessages(tenantId: string, sessionId: string) { return this.repo.listMessages(tenantId, sessionId); }
  addMessage(tenantId: string, sessionId: string, body: { authorRole: Party; authorUserId?: string; body: string; certDocId?: string; relatedIssueId?: string }) {
    return this.repo.addMessage({ tenantId, sessionId, ...body });
  }
  listFiles(tenantId: string, certDocId: string): Promise<CertificationTestFile[]> { return this.repo.listTestFiles(tenantId, certDocId); }
  waive(tenantId: string, certDocId: string): Promise<void> { return this.repo.setDocStatus(tenantId, certDocId, 'waived'); }

  /** The relationship a session belongs to (for scope checks), or undefined if not found in the tenant. */
  async relationshipForSession(tenantId: string, sessionId: string): Promise<string | undefined> {
    return (await this.repo.getSession(tenantId, sessionId))?.relationshipId;
  }

  /** Resolve a doc to its session + relationship (for scope checks). */
  async sessionForDoc(tenantId: string, certDocId: string): Promise<{ sessionId: string; relationshipId: string } | undefined> {
    const doc = await this.repo.getDoc(tenantId, certDocId);
    if (!doc) return undefined;
    const relationshipId = await this.relationshipForSession(tenantId, doc.sessionId);
    return relationshipId ? { sessionId: doc.sessionId, relationshipId } : undefined;
  }

  /** Certify + activate — maps the repo's gate failure to a 409 for the API. */
  async certify(tenantId: string, sessionId: string, certifiedBy: string): Promise<CertificationSession> {
    if (!(await this.repo.canCertify(tenantId, sessionId))) {
      throw new ConflictException('cannot certify: a blocking document is still unsatisfied');
    }
    return this.repo.certify(tenantId, sessionId, certifiedBy);
  }

  // ── config resolution ──
  private async relationshipDoc(tenantId: string, relationshipId: string, docType: string) {
    const rel = await this.relationships.get(tenantId, relationshipId);
    return rel?.documents.find((d) => d.docType === docType);
  }

  private async resolveSpecId(relationshipId: string, tenantId: string, docType: string) {
    const rd = await this.relationshipDoc(tenantId, relationshipId, docType);
    if (rd?.specId) return this.specs.get(tenantId, rd.specId);
    return undefined;
  }

  private async resolveMap(tenantId: string, relationshipId: string, docType: string) {
    const rd = await this.relationshipDoc(tenantId, relationshipId, docType);
    if (rd?.mapId) return this.maps.get(tenantId, rd.mapId);
    return undefined;
  }

  /** Ingest the anchor 850's stored reference bytes into a canonical order for correlation. */
  private async resolveAnchorOrder(tenantId: string, sessionId: string, relationshipId: string): Promise<unknown | undefined> {
    const docs = await this.repo.listDocs(tenantId, sessionId);
    const anchor = docs.find((d) => d.role === 'anchor');
    if (!anchor?.referenceArtifactId) return undefined;
    const artifact = await this.rawArtifacts.get(tenantId, anchor.referenceArtifactId);
    const map = await this.resolveMap(tenantId, relationshipId, anchor.docType);
    if (!artifact || !map) return undefined;
    return this.ingest.ingest(this.x12.parse(artifact.bytes), map);
  }
}

interface RecordedIssue {
  segment?: string; element?: string;
  kind: 'conformance' | 'correlation' | 'ambiguity' | 'code-value';
  severity: 'error' | 'warning' | 'info';
  code?: string; message: string; aiSuggestion?: string; directedTo: Party; status: 'open' | 'resolved' | 'waived';
}
