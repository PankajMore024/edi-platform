import { Injectable } from '@nestjs/common';
import Ajv, { ErrorObject, ValidateFunction } from 'ajv';
import schema from './edi-map.schema.json';
import { EdiMap, MapNode, SegmentNode, isLoopNode } from './map.types';

export interface MapValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Layer-1 map validation: is the map well-formed per our DSL? Two parts:
 *   (a) JSON-Schema shape (ajv against edi-map.schema.json)
 *   (b) structural invariants the schema can't express (position uniqueness, `match` inbound-only,
 *       `hl` elements only inside an hl loop)
 *
 * This is SHAPE validation, NOT X12/IG conformance — it does not know the ANSI standard or a
 * partner's Implementation Guide. Layer-2 (spec/IG conformance) is a separate subsystem
 * (see docs/context.md D48). Load-time gate: a malformed map fails loudly instead of emitting garbage.
 */
@Injectable()
export class MapValidator {
  private readonly validateShape: ValidateFunction;

  constructor() {
    const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, strict: false });
    this.validateShape = ajv.compile(schema as object);
  }

  validate(map: unknown): MapValidationResult {
    const errors: string[] = [];

    if (!this.validateShape(map)) {
      for (const e of this.validateShape.errors ?? []) errors.push(this.formatAjvError(e));
      // Shape is broken — don't run structural checks on malformed data.
      return { valid: false, errors };
    }

    errors.push(...this.structural(map as EdiMap));
    return { valid: errors.length === 0, errors };
  }

  /** Throws with all errors if the map is invalid. Use at map load / before promotion. */
  assertValid(map: unknown): void {
    const r = this.validate(map);
    if (!r.valid) {
      throw new Error(`Invalid map:\n  - ${r.errors.join('\n  - ')}`);
    }
  }

  private formatAjvError(e: ErrorObject): string {
    return `${e.instancePath || '(root)'} ${e.message ?? 'invalid'}`.trim();
  }

  private structural(map: EdiMap): string[] {
    const errors: string[] = [];
    const walk = (nodes: MapNode[], insideHl: boolean): void => {
      for (const node of nodes) {
        if (isLoopNode(node)) {
          if (map.direction === 'outbound' && node.match) {
            errors.push(`loop "${node.loop}": match is inbound-only`);
          }
          walk(node.segments, insideHl || node.hl !== undefined);
        } else {
          this.checkSegment(node, map.direction, insideHl, errors);
        }
      }
    };
    walk(map.structure, false);
    return errors;
  }

  private checkSegment(
    node: SegmentNode,
    direction: string,
    insideHl: boolean,
    errors: string[],
  ): void {
    if (direction === 'outbound' && node.match) {
      errors.push(`segment "${node.segment}": match is inbound-only`);
    }

    const claimedBy = new Map<number, string>();
    const claim = (pos: number, label: string): void => {
      const prev = claimedBy.get(pos);
      if (prev) errors.push(`segment "${node.segment}": position ${pos} claimed by both ${prev} and ${label}`);
      else claimedBy.set(pos, label);
    };

    for (const el of node.elements) {
      const label =
        el.path !== undefined ? `path "${el.path}"`
        : el.const !== undefined ? 'const'
        : el.count !== undefined ? 'count'
        : el.hl ? `hl:${el.hl}`
        : 'element';
      claim(el.pos, label);
      if (el.qualifier) claim(el.qualifier.pos, 'qualifier');
      if (el.hl && !insideHl) {
        errors.push(`segment "${node.segment}" pos ${el.pos}: hl "${el.hl}" is only valid inside an hl loop`);
      }
    }
  }
}
