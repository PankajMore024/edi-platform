/**
 * Domain types for the certification/onboarding plane — the negotiated agreement reaching "certified".
 * Durable + bilateral (see docs/design/onboarding-certification.md). Distinct from runtime lifecycle.
 */
import { FormatAuthority } from './config.types';

export type SessionStatus = 'draft' | 'in_certification' | 'holding' | 'certified' | 'active' | 'superseded';
export type CertDocRole = 'anchor' | 'response' | 'standalone';
export type CertDocStatus = 'awaiting' | 'validating' | 'passed' | 'issues' | 'warning' | 'waived';
export type Verdict = 'passed' | 'issues' | 'warning';
export type Party = 'client' | 'partner' | 'system';
export type IssueStatus = 'open' | 'resolved' | 'waived';
export type IssueKind = 'conformance' | 'correlation' | 'ambiguity' | 'code-value';
export type IssueSeverity = 'error' | 'warning' | 'info';

export interface CertificationSession {
  id: string;
  tenantId: string;
  relationshipId: string;
  formatAuthority: FormatAuthority;
  status: SessionStatus;
  specVersion?: string;
  createdAt: string;
  certifiedAt?: string;
  certifiedBy?: string;
}

export interface CertificationDoc {
  id: string;
  tenantId: string;
  sessionId: string;
  docType: string;
  role: CertDocRole;
  direction: string;
  producedBy: Party;
  validatedBy: Party;
  referenceArtifactId?: string;
  status: CertDocStatus;
  blocking: boolean;
  attemptCount: number;
  updatedAt: string;
}

export interface CertificationIssue {
  id: string;
  tenantId: string;
  testFileId: string;
  segment?: string;
  element?: string;
  kind: IssueKind;
  severity: IssueSeverity;
  code?: string;
  message: string;
  aiSuggestion?: string;
  directedTo: Party;
  status: IssueStatus;
}

export interface CertificationTestFile {
  id: string;
  tenantId: string;
  certDocId: string;
  rawArtifactId: string;
  uploadedBy: Party;
  attemptNo: number;
  verdict: Verdict;
  correlated: boolean;
  createdAt: string;
  issues: CertificationIssue[];
}

export interface CertificationMessage {
  id: string;
  tenantId: string;
  sessionId: string;
  certDocId?: string;
  relatedIssueId?: string;
  authorRole: Party;
  authorUserId?: string;
  body: string;
  createdAt: string;
  deliveredAt?: string;
}

export interface CertificationEvent {
  id: string;
  tenantId: string;
  sessionId: string;
  actor: Party;
  verb: string;
  docType?: string;
  detail?: string;
  createdAt: string;
  seq: number;
}

/** Input to record a validated test-file attempt (verdict + its issues), the board's core write. */
export interface RecordTestFileInput {
  tenantId: string;
  certDocId: string;
  rawArtifactId: string;
  uploadedBy: Party;
  verdict: Verdict;
  correlated: boolean;
  issues: Array<Omit<CertificationIssue, 'id' | 'tenantId' | 'testFileId'>>;
}

/** A blocking doc counts as satisfied only when passed or explicitly waived. */
export const isDocSatisfied = (status: CertDocStatus): boolean => status === 'passed' || status === 'waived';
