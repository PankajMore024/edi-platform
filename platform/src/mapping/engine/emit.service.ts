import { Injectable } from '@nestjs/common';
import { EdiMap, MapElement, MapNode, SegmentNode, isLoopNode } from '../dsl/map.types';
import { CanonicalDocument } from '../../canonical/types/document.types';
import { RawSegment } from '../../x12/x12.service';
import { resolvePath } from './path';
import { evalWhen } from './predicate';
import { applyDecimal, formatDate } from './format';

/** Runtime HL frame (856 hierarchy): the current node's id and its parent's id. */
interface HlFrame {
  id: string;
  parent: string;
}

/**
 * EMIT: canonical document → X12 segments, driven entirely by a map. The generic, declarative
 * replacement for the hardcoded generators. No partner logic — and no doc-type logic — lives here.
 */
@Injectable()
export class EmitService {
  emit(doc: CanonicalDocument, map: EdiMap): RawSegment[] {
    const out: RawSegment[] = [];
    // HL counter threaded through the walk (not instance state) so concurrent emits are safe.
    this.walk(map.structure, doc as unknown, out, undefined, { n: 0 });
    return out;
  }

  private walk(
    nodes: MapNode[],
    ctx: unknown,
    out: RawSegment[],
    hl: HlFrame | undefined,
    counter: { n: number },
  ): void {
    for (const node of nodes) {
      const targets = this.contexts(node.over, node.when, ctx);
      if (isLoopNode(node) && node.hl !== undefined) {
        // HL hierarchy level: each iteration gets a new HL id; children point to it as parent.
        for (const c of targets) {
          const frame: HlFrame = { id: String(++counter.n), parent: hl?.id ?? '' };
          this.walk(node.segments, c, out, frame, counter);
        }
      } else if (isLoopNode(node)) {
        for (const c of targets) this.walk(node.segments, c, out, hl, counter);
      } else {
        for (const c of targets) out.push(this.buildSegment(node, c, hl));
      }
    }
  }

  /** Resolve the context(s) a node applies to: repeated over an array, or the current context. */
  private contexts(over: string | undefined, when: string | undefined, ctx: unknown): unknown[] {
    if (over) {
      const arr = resolvePath(ctx, over);
      if (!Array.isArray(arr)) return [];
      return arr.filter((item) => evalWhen(when, item));
    }
    return evalWhen(when, ctx) ? [ctx] : [];
  }

  private buildSegment(node: SegmentNode, ctx: unknown, hl: HlFrame | undefined): RawSegment {
    const slots: string[] = [];
    for (const el of node.elements) {
      const value = this.resolveElement(el, ctx, hl);
      if (value === '') continue; // skip empty elements (and their qualifier)
      if (el.qualifier) slots[el.qualifier.pos - 1] = el.qualifier.const;
      slots[el.pos - 1] = value;
    }
    // Fill gaps, then drop trailing empties (X12 omits trailing empty elements).
    const elements: string[] = [];
    for (let i = 0; i < slots.length; i++) elements.push(slots[i] ?? '');
    while (elements.length > 0 && elements[elements.length - 1] === '') elements.pop();
    return { tag: node.segment, elements };
  }

  private resolveElement(el: MapElement, ctx: unknown, hl: HlFrame | undefined): string {
    if (el.hl) return el.hl === 'id' ? (hl?.id ?? '') : (hl?.parent ?? '');

    let raw: unknown;
    if (el.const !== undefined) raw = el.const;
    else if (el.count !== undefined) {
      const arr = resolvePath(ctx, el.count);
      // A count must point at a real array. A mistyped path resolving to 0 would silently
      // transmit a wrong total (line-count mismatch → chargeback), so fail loudly instead.
      if (!Array.isArray(arr)) {
        throw new Error(`emit: count path "${el.count}" did not resolve to an array`);
      }
      raw = arr.length;
    } else if (el.path !== undefined) raw = resolvePath(ctx, el.path);

    if (raw === undefined || raw === null || raw === '') {
      if (el.default !== undefined) raw = el.default;
      else return '';
    }

    if (el.format) return formatDate(raw as string, el.format);
    if (el.decimal !== undefined) return applyDecimal(raw as string | number, el.decimal);
    return String(raw);
  }
}
