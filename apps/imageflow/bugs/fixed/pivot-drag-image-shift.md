# Bug: Image Shifts When Dragging Pivot Point

## Summary
When dragging the pivot point in the Transform node gizmo, the image would shift horizontally instead of staying stationary. The pivot marker moved correctly, but the rendered image did not maintain its position.

## Symptoms
- Pivot gizmo marker followed mouse correctly
- Image/bounding box shifted horizontally when pivot was dragged
- Vertical compensation worked correctly, but horizontal did not
- Issue occurred when scaleX != 1 or when rotation was applied
- No issue when scaleX=1, scaleY=1, angle=0

## Root Cause
The pivot drag operation requires updating 4 parameters simultaneously:
1. `pivotX` - new pivot X position
2. `pivotY` - new pivot Y position
3. `offsetX` - compensated offset X to keep image stationary
4. `offsetY` - compensated offset Y to keep image stationary

The `updateNodeParameter` function from `useGraph` triggers graph execution after each parameter update (in liveEdit mode). This caused a race condition:

```
1. updateNodeParameter(pivotX)  → triggers execution with ONLY pivotX updated
2. updateNodeParameter(pivotY)  → execution already running, no new execution
3. updateNodeParameter(offsetX) → execution already running, no new execution
4. updateNodeParameter(offsetY) → execution already running, no new execution
```

The graph execution captured the state after only the first update, so it ran with:
- `pivotX`: NEW value
- `pivotY`: OLD value
- `offsetX`: OLD value
- `offsetY`: OLD value

This inconsistent state caused the rendered image to be in the wrong position.

## The Fix
Instead of using `updateNodeParameter` (which triggers execution) for each parameter, the fix:

1. Updates all 4 parameters directly in the graphStore using `graphStore.updateNodeParameter()` - this updates the store but does NOT trigger execution
2. After ALL parameters are updated, triggers execution ONCE with the complete, consistent state

### Code Change (GizmoOverlay.tsx)

**Before:**
```typescript
// Each call triggers execution - race condition!
updateNodeParameter(node.id, pivotXParam, newPivotX);
updateNodeParameter(node.id, pivotYParam, newPivotY);
updateNodeParameter(node.id, offsetXParam, newOffsetX);
updateNodeParameter(node.id, offsetYParam, newOffsetY);
```

**After:**
```typescript
// Update all parameters in store first (no execution trigger)
const graphStore = useGraphStore.getState();
graphStore.updateNodeParameter(node.id, pivotXParam, newPivotX);
graphStore.updateNodeParameter(node.id, pivotYParam, newPivotY);
graphStore.updateNodeParameter(node.id, offsetXParam, newOffsetX);
graphStore.updateNodeParameter(node.id, offsetYParam, newOffsetY);

// Trigger execution ONCE with all updates applied
const freshGraph = useGraphStore.getState().graph;
const exec = useExecutionStore.getState();
const uiStore = useUiStore.getState();
const dirtyNodes = [node.id, ...getDownstreamNodes(freshGraph, node.id)];
exec.markNodesDirty(dirtyNodes);

if (uiStore.liveEdit && !exec.isExecuting) {
  exec.updateEngineGraph(freshGraph);
  exec.execute();
}
```

## Files Modified
- `apps/imageflow/src/components/preview/GizmoOverlay.tsx`
  - Added imports for `useGraphStore`, `useExecutionStore`, `useUiStore`, `getDownstreamNodes`
  - Modified pivot drag handler to batch parameter updates

## The Offset Compensation Formula
For reference, the offset compensation formula that keeps the image stationary when pivot changes:

```
newOffset = oldOffset + d - R*S*d
```

Where:
- `d = oldPivot - newPivot` (in pixel coordinates)
- `R` = rotation matrix
- `S` = scale matrix
- `R*S*d` = the pivot delta transformed by rotation and scale

This formula is derived from the transform equation:
```
P' = R * S * (P - pivot) + pivot + offset
```

For the image to stay in place when pivot changes, the offset must compensate for how the pivot change affects the transform.

## Lesson Learned
When multiple related parameters must be updated atomically, avoid using helpers that trigger side effects (like execution) on each update. Instead:
1. Update all values in the store directly
2. Trigger side effects once after all updates are complete

This pattern should be applied whenever multiple parameters form a "transaction" that must be applied together.
