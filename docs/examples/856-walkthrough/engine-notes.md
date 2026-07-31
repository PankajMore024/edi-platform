# Layer C — Engine, for the 856 hierarchy

The 850 engine (mapping-design.md §6) walks a flat `structure` of `segment` and
`loop` nodes. **856 needs one addition: an HL-aware recursive walk.** Everything
else (element resolution, `when`, `over`, `decimal`, `format`, `default`,
`qualifier`) is unchanged.

## The new node type: `hl`

```jsonc
{ "hl": "<levelCode>", "over": "<path>", "segments": [...], "children": [ <hl nodes> ] }
```

The engine — not the map — owns the three HL elements:

| Element | Meaning | Who computes it |
|---|---|---|
| HL01 | unique sequential id within the transaction | engine counter, ++ per HL emitted |
| HL02 | parent HL's HL01 | engine parent stack (empty at top level) |
| HL03 | hierarchical level code (`S/O/P/I`) | the map (`"hl": "S"`) |
| HL04 | `1` if this node emits child HLs, else `0` | engine, from `children` + data |

## Walk (additions in **bold**)

```
state = { hlСounter: 0, hlEmitted: 0 }

walkHL(node, parentHlId, $item):
    items = node.over ? resolve(node.over, $item) : [ $item ]   # object => 1 item
    for it in items:
        if node.when and not eval(node.when, it): continue
        **hlId = ++state.hlCounter**
        **hasChildren = node.children present AND at least one child resolves to >=1 item for `it`**
        **emit HL with { 1: hlId, 2: parentHlId, 3: node.hl, 4: hasChildren ? 1 : 0 }**
        **state.hlEmitted++**
        for seg in node.segments:           # reuse existing segment/loop logic, scope $item = it
            emitSegmentOrLoop(seg, it)
        for child in node.children:          # recurse depth-first => correct sibling/parent numbering
            **walkHL(child, hlId, it)**

buildDocument:
    for top in structure:
        if top.hl: walkHL(top, "", rootDoc)
        else:       emitSegmentOrLoop(top, rootDoc)   # BSN, CTT, etc.
```

Depth-first recursion is what produces the interleaved `HL...P / HL...I / HL...P /
HL...I` ordering retailers require — pack 2 must carry `HL02 = order's id`, which
only a parent stack gives you.

## Two engine-derived tokens 856 introduces

- **`$hlSegments`** — used by `CTT01`. Resolves to `state.hlEmitted`. (850's
  `count` only counts a canonical array; here the count is an emit-time fact.)
- **SE01 segment count** — already an envelope/finalize concern, not map data.

## What is deliberately NOT in the engine

- **SSCC-18 generation.** The map reads `$item.sscc`. If a partner needs the
  platform to *mint* SSCCs (GS1 company prefix + serial + check digit), that is an
  **enrichment step that runs before the engine**, not a map operator. (This is the
  "derived/enrichment" subsystem flagged in saas-architecture-analysis.md §5 — keep
  it out of the DSL.)
- **Pack/weight rollups.** If TD1 carton counts or weights must be *summed* from
  children, that is enrichment too. The sample assumes the caller supplies them.
