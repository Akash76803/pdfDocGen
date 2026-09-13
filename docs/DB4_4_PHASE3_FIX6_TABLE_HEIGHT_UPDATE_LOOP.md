# DB-4.4 Phase 3 Fix6 — Table Height Update Loop Guard

## Problem
After Fix5, selecting/rendering a paginated Dynamic Table could blank the builder and React reported:

`Maximum update depth exceeded`

The loop was:

`TableCanvas layout effect → onHeightChange → TemplateBuilder setElementsRaw → render → layout effect → ...`

Two conditions made it possible:

1. `TableCanvas` treated a newly-created `onHeightChange` callback as an effect dependency, so the layout effect remounted after every parent render and republished the height.
2. A paginated virtual fragment was allowed to write its page-local DOM height back into the persistent logical table element even though the pagination materializer owns that fragment height.

## Fix
- `TableCanvas` now stores the latest height callback in a ref.
- Last published DOM height is retained across renders and duplicate height publications are ignored.
- The height measurement effect no longer restarts only because the callback identity changed.
- Paginated/virtual Dynamic Table fragments do **not** write their fragment height back to the persistent Builder element.
- Non-paginated tables keep existing auto-height behavior.

## Expected behavior
- No blank page / React maximum-update-depth error.
- Selecting a paginated table does not trigger an update loop.
- Continuation fragment hitbox remains page-local (Fix5 retained).
- Flow positions and pagination are unchanged by selection.
- Custom/single-page table auto-height continues working.
