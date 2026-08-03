// Typed client for the platform API. Auth is a tenant API key (Bearer) kept in localStorage — the
// backend derives the tenant from the key, so there is no separate tenant selector.

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
  saveConnector: (id: string, inst: ConnectorInstance) => req<ConnectorInstance>(`/connectors/${id}`, { method: 'PUT', body: JSON.stringify(inst) }),
  transports: () => req<TransportInstance[]>('/transports'),
  saveTransport: (id: string, inst: TransportInstance) => req<TransportInstance>(`/transports/${id}`, { method: 'PUT', body: JSON.stringify(inst) }),
  documents: (q?: { docType?: string; state?: string }) => req<DocSummary[]>(`/documents${qs(q)}`),
  document: (id: string) => req<StoredTransaction>(`/documents/${id}`),
  review: () => req<ReviewItem[]>('/review'),
  dismiss: (id: string, body: { resolvedBy: string; note: string }) => req<unknown>(`/review/${id}/dismiss`, { method: 'POST', body: JSON.stringify(body) }),
  reprocess: (id: string, body: { resolvedBy: string; note: string }) => req<unknown>(`/review/${id}/reprocess`, { method: 'POST', body: JSON.stringify(body) }),
  importSample: (body: { type: 'csv' | 'json'; sample: string; docType: string }) => req<SampleProfile>('/connectors/import-sample', { method: 'POST', body: JSON.stringify(body) }),
};

export interface SampleProfile {
  source: string; docKey?: string; docCount: number; mappedCount: number; unmatchedCount: number;
  fields: Array<{ path: string; line: boolean; type: string; sample: string; suggestion?: { target: string; confidence: number } }>;
}
