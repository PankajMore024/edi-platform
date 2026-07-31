import { Injectable } from '@nestjs/common';
import { EdiMap, MapNode, SegmentNode, isLoopNode, isSegmentNode } from '../dsl/map.types';
import { CanonicalDocument } from '../../canonical/types/document.types';
import { RawSegment } from '../../x12/x12.service';
import { setPath } from './path';

interface Cursor {
  i: number;
}

/**
 * INGEST: X12 segments → canonical document, driven entirely by a map. Walks the segment stream
 * with a cursor, consuming segments in map order; `over` collects repeats into arrays. Any segment
 * the map doesn't claim is captured in `inbound.unmapped` — data is never silently dropped.
 *
 * Note: ingest yields string values (X12 is untyped on the wire). Coercing to canonical types
 * (numbers/dates) against the canonical schema is a later, separate step.
 */
@Injectable()
export class IngestService {
  ingest(segments: RawSegment[], map: EdiMap): CanonicalDocument {
    const doc: any = {
      meta: { docType: map.docType, direction: 'inbound', partner: map.partner, tenantId: '' },
      inbound: { unmapped: [] as RawSegment[] },
    };
    const cur: Cursor = { i: 0 };
    this.read(map.structure, segments, cur, doc);
    if (cur.i < segments.length) doc.inbound.unmapped.push(...segments.slice(cur.i));
    return doc as CanonicalDocument;
  }

  private leadingTag(node: MapNode): string | undefined {
    if (isSegmentNode(node)) return node.segment;
    for (const s of node.segments) {
      const t = this.leadingTag(s);
      if (t) return t;
    }
    return undefined;
  }

  private read(nodes: MapNode[], segs: RawSegment[], cur: Cursor, target: any): void {
    for (const node of nodes) {
      if (isLoopNode(node)) {
        if (node.over) {
          const lead = this.leadingTag(node);
          const arr: any[] = [];
          while (cur.i < segs.length && segs[cur.i].tag === lead) {
            const before = cur.i;
            const item: any = {};
            this.read(node.segments, segs, cur, item);
            // Guard against a non-advancing iteration (e.g. the leading segment fails an inner
            // `match`): without this the loop spins forever. Leftover segments fall through to
            // the trailing `unmapped` capture.
            if (cur.i === before) break;
            arr.push(item);
          }
          if (arr.length > 0) setPath(target, node.over, arr);
        } else {
          this.read(node.segments, segs, cur, target);
        }
      } else if (node.over) {
        const arr: any[] = [];
        while (
          cur.i < segs.length &&
          segs[cur.i].tag === node.segment &&
          this.matchOk(node, segs[cur.i])
        ) {
          const item: any = {};
          this.readSegment(node, segs[cur.i], item);
          arr.push(item);
          cur.i++;
        }
        if (arr.length > 0) setPath(target, node.over, arr);
      } else if (
        cur.i < segs.length &&
        segs[cur.i].tag === node.segment &&
        this.matchOk(node, segs[cur.i])
      ) {
        this.readSegment(node, segs[cur.i], target);
        cur.i++;
      }
    }
  }

  private matchOk(node: SegmentNode, seg: RawSegment): boolean {
    if (!node.match) return true;
    return seg.elements[node.match.pos - 1] === node.match.eq;
  }

  private readSegment(node: SegmentNode, seg: RawSegment, target: any): void {
    for (const el of node.elements) {
      if (el.path === undefined) continue; // const/count are emit-only
      const v = seg.elements[el.pos - 1];
      if (v !== undefined && v !== '') setPath(target, el.path, v);
    }
  }
}
