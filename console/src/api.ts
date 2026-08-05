// Typed client for the platform API. Auth is a Bearer credential kept in localStorage — either a tenant
// API key (client_admin) or a user session token from email/password login (usr_…). The backend derives
// the principal (tenant + role + scopes) from it, so there is no separate tenant selector.

const KEY_STORAGE = 'edi_api_key';
export const getKey = (): string => localStorage.getItem(KEY_STORAGE) ?? '';
export const setKey = (k: string): void => localStorage.setItem(KEY_STORAGE, k.trim());
export const clearKey = (): void => localStorage.removeItem(KEY_STORAGE);

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getKey()}`, ...(opts.headers ?? {}) },
  });
  if (!res.ok) throw new ApiError(res.status, (await res.text().catch(() => '')) || res.statusText);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// ── shapes (a lean mirror of the API responses) ──
export interface Descriptor { id: string; kind: string; name: string; description?: string; class?: string; mode?: string; }
export interface RelationshipDoc { docType: string; direction: string; mapId: string; specId?: string; connectorInstanceId?: string; enabled: boolean; }
export interface Envelope {
  senderQualifier: string; senderId: string; receiverQualifier: string; receiverId: string; gsVersion: string;
  usageIndicator?: string; [k: string]: unknown;
}
export interface Relationship {
  id: string; tenantId: string; partnerId: string; partnerName?: string; formatAuthority: string; tenantRole: string;
  version: string; mode: string; envelope: Envelope; documents: RelationshipDoc[]; active: boolean;
}
export interface MapRef { id: string; map: { partner: string; docType: string; direction: string } }
export interface SpecRef { id: string; spec: { docType: string; version: string; owner: string; name?: string } }
export interface ConnectorInstanceRef { id: string; connectorType: string; docTypes: string[]; trigger: string; }

// Mirror of the backend ConnectorFieldMap / ConnectorMap / ConnectorInstance (write side).
export interface ConnectorFieldMap { to: string; from?: string; const?: string | number | boolean; default?: string | number; decimal?: number; }
export interface ConnectorMap { connector: string; docType: string; direction: string; header: ConnectorFieldMap[]; lineTo?: string; lineOver?: string; lineFields?: ConnectorFieldMap[]; }
export interface ConnectorInstance { id: string; tenantId: string; connectorType: string; settings: Record<string, unknown>; connectorMap: ConnectorMap; docTypes: string[]; trigger: string; }
export interface TransportInstance { id: string; tenantId: string; transportType: string; settings: Record<string, unknown>; vaultRef?: string; direction: string; }

// Conformance spec (structured) — mirror of the backend DocSpec / SegmentSpec / ElementSpec.
export interface ElementSpec { pos: number; name?: string; requirement: string; type?: string; min?: number; max?: number; codes?: string[]; }
export interface SegmentSpec { tag: string; name?: string; requirement: string; maxUse?: number; elements: ElementSpec[]; }
export interface DocSpec { docType: string; version: string; owner: string; name?: string; segments: SegmentSpec[]; }

// Partner map (X12 ⇄ canonical DSL). `structure` is the node tree — authored as validated JSON.
export interface EdiMap { partner: string; docType: string; direction: string; functionalId?: string; version?: string; structure: unknown[]; $comment?: string; }
export interface DocSummary { id: string; docType: string; poNumber?: string; currentState: string; conformant: boolean; }
export interface StoredTransaction { id: string; docType: string; direction: string; poNumber?: string; currentState: string; conformant: boolean; canonical: Record<string, unknown>; }
export interface ReviewItem {
  id: string; outcome: string; docType?: string; source: string; receivedAt: string; dedupKey: string; occurrence: number;
  needsReview: boolean; note?: string; relationshipId: string;
}

const qs = (q?: Record<string, string | undefined>): string => {
  if (!q) return '';
  const p = Object.entries(q).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`);
  return p.length ? `?${p.join('&')}` : '';
};

export const api = {
  catalog: () => req<{ connectors: Descriptor[]; transports: Descriptor[] }>('/catalog'),
  relationships: () => req<Relationship[]>('/relationships'),
  relationship: (id: string) => req<Relationship>(`/relationships/${id}`),
  saveRelationship: (id: string, rel: Relationship) => req<Relationship>(`/relationships/${id}`, { method: 'PUT', body: JSON.stringify(rel) }),
  partnerMaps: () => req<MapRef[]>('/partner-maps'),
  partnerMap: (id: string) => req<EdiMap>(`/partner-maps/${id}`),
  saveMap: (id: string, map: EdiMap) => req<{ id: string }>(`/partner-maps/${id}`, { method: 'PUT', body: JSON.stringify(map) }),
  specs: () => req<SpecRef[]>('/specs'),
  spec: (id: string) => req<DocSpec>(`/specs/${id}`),
  saveSpec: (id: string, spec: DocSpec) => req<{ id: string }>(`/specs/${id}`, { method: 'PUT', body: JSON.stringify(spec) }),
  connectors: () => req<ConnectorInstanceRef[]>('/connectors'),
  connector: (id: string) => req<ConnectorInstance>(`/connectors/${id}`),
  saveConnector: (id: string, inst: ConnectorInstance) => req<ConnectorInstance>(`/connectors/${id}`, { method: 'PUT', body: JSON.stringify(inst) }),
  deleteConnector: (id: string) => req<{ deleted: boolean }>(`/connectors/${id}`, { method: 'DELETE' }),
  transports: () => req<TransportInstance[]>('/transports'),
  saveTransport: (id: string, inst: TransportInstance) => req<TransportInstance>(`/transports/${id}`, { method: 'PUT', body: JSON.stringify(inst) }),
  documents: (q?: { docType?: string; state?: string; relationshipId?: string; limit?: string; offset?: string }) => req<{ items: DocSummary[]; total: number; limit: number; offset: number }>(`/documents${qs(q)}`),
  document: (id: string) => req<StoredTransaction>(`/documents/${id}`),
  review: (relationshipId?: string) => req<ReviewItem[]>(`/review${qs({ relationshipId })}`),
  dismiss: (id: string, body: { resolvedBy: string; note: string }) => req<unknown>(`/review/${id}/dismiss`, { method: 'POST', body: JSON.stringify(body) }),
  reprocess: (id: string, body: { resolvedBy: string; note: string }) => req<unknown>(`/review/${id}/reprocess`, { method: 'POST', body: JSON.stringify(body) }),
  importSample: (body: { type: 'csv' | 'json'; sample: string; docType: string }) => req<SampleProfile>('/connectors/import-sample', { method: 'POST', body: JSON.stringify(body) }),
};

export interface SampleProfile {
  source: string; docKey?: string; docCount: number; mappedCount: number; unmatchedCount: number;
  fields: Array<{ path: string; line: boolean; type: string; sample: string; suggestion?: { target: string; confidence: number } }>;
}

// ── product catalog (dropship SKU × vendor bindings) ──
export interface CatalogEntry { sellableSku: string; vendorId: string; vendorSku: string; packSize?: number; uom?: string; priority?: number; active?: boolean; }
export const productCatalog = {
  list: () => req<CatalogEntry[]>('/product-catalog'),
  upsert: (e: CatalogEntry) => req<{ ok: true }>('/product-catalog', { method: 'POST', body: JSON.stringify(e) }),
  bulk: (entries: CatalogEntry[]) => req<{ upserted: number; skipped: number }>('/product-catalog/bulk', { method: 'POST', body: JSON.stringify({ entries }) }),
  remove: (sellableSku: string, vendorId: string) => req<{ deleted: boolean }>(`/product-catalog?sellableSku=${encodeURIComponent(sellableSku)}&vendorId=${encodeURIComponent(vendorId)}`, { method: 'DELETE' }),
};

// ── auth / principal ──
export type Role = 'client_admin' | 'client_ops' | 'partner';
/** Which side of a relationship an action is attributed to (the backend's Party), derived from a Role. */
export type Party = 'client' | 'partner' | 'system';
export interface Principal { role: Role; tenantId: string; userId?: string; email?: string; scopes?: string[] | null; }
export const isClient = (p?: Principal | null): boolean => p?.role === 'client_admin' || p?.role === 'client_ops';
export const partyOf = (r: Role): Party => (r === 'partner' ? 'partner' : 'client');

// ── certification (the onboarding board) ──
export interface CertSession { id: string; tenantId: string; relationshipId: string; formatAuthority: string; status: string; specVersion?: string; createdAt: string; certifiedAt?: string; certifiedBy?: string; }
export interface CertDoc { id: string; sessionId: string; docType: string; role: string; direction: string; producedBy: string; validatedBy: string; referenceArtifactId?: string; status: string; blocking: boolean; attemptCount: number; updatedAt: string; }
export interface CertIssue { id: string; segment?: string; element?: string; kind: string; severity: string; code?: string; message: string; aiSuggestion?: string; directedTo: string; status: string; }
export interface CertTestFile { id: string; certDocId: string; uploadedBy: string; attemptNo: number; verdict: string; correlated: boolean; createdAt: string; issues: CertIssue[]; }
export interface CertMessage { id: string; sessionId: string; authorRole: string; authorUserId?: string; body: string; createdAt: string; deliveredAt?: string; }
export interface CertEvent { id: string; sessionId: string; actor: string; verb: string; docType?: string; detail?: string; createdAt: string; seq: number; }
export interface SessionDetail { session: CertSession; docs: CertDoc[]; canCertify: boolean; }

export const auth = {
  login: (email: string, password: string) => req<{ token: string; role: Role; tenantId: string; scopes?: string[] }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => req<Principal>('/auth/me'),
  logout: () => req<unknown>('/auth/logout', { method: 'POST', body: JSON.stringify({ token: getKey() }) }),
};

export const cert = {
  sessions: () => req<CertSession[]>('/certification/sessions'),
  open: (relationshipId: string) => req<{ session: CertSession; docs: CertDoc[] }>('/certification/sessions', { method: 'POST', body: JSON.stringify({ relationshipId }) }),
  session: (id: string) => req<SessionDetail>(`/certification/sessions/${id}`),
  events: (id: string) => req<CertEvent[]>(`/certification/sessions/${id}/events`),
  messages: (id: string) => req<CertMessage[]>(`/certification/sessions/${id}/messages`),
  postMessage: (id: string, body: { authorRole: Party; body: string }) => req<CertMessage>(`/certification/sessions/${id}/messages`, { method: 'POST', body: JSON.stringify(body) }),
  certify: (id: string, certifiedBy: string) => req<CertSession>(`/certification/sessions/${id}/certify`, { method: 'POST', body: JSON.stringify({ certifiedBy }) }),
  files: (docId: string) => req<CertTestFile[]>(`/certification/docs/${docId}/files`),
  dropFile: (docId: string, bytes: string, uploadedBy: Party) => req<CertTestFile>(`/certification/docs/${docId}/files`, { method: 'POST', body: JSON.stringify({ bytes, uploadedBy }) }),
  waive: (docId: string) => req<unknown>(`/certification/docs/${docId}/waive`, { method: 'POST', body: JSON.stringify({}) }),
  setReference: (docId: string, bytes: string) => req<unknown>(`/certification/docs/${docId}/reference`, { method: 'POST', body: JSON.stringify({ bytes }) }),
  generateReference: (docId: string) => req<{ bytes: string }>(`/certification/docs/${docId}/generate-reference`, { method: 'POST', body: JSON.stringify({}) }),
};
