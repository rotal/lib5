# Pivot Drag in World Space

## Problem
When the user drags the pivot point, two things must happen:
1. The pivot moves to where the user drags it (in world/canvas space)
2. The image stays **visually stationary** (offset compensates)

## Coordinate Systems

### 1. Screen Coordinates
- Raw mouse position in pixels relative to the viewport
- Origin at top-left of container

### 2. World/View Coordinates
- Canvas coordinate system with origin at canvas center
- When offset = (0,0) and pivot at image center, pivot is at world (0,0)
- `worldPos = screenPos / zoom` (simplified, relative to center)

### 3. Image-Local Coordinates
- Position within the image, origin at top-left of image
- Image center is at `(imageWidth/2, imageHeight/2)`

### 4. From-Center Coordinates
- Position relative to image center (origin at image center)
- `fromCenter = imageLocal - imageSize/2`

### 5. Normalized Coordinates (-1 to 1)
- What's stored in pivot parameters
- -1 = left/top edge, 0 = center, +1 = right/bottom edge
- `normalized = fromCenter / (imageSize/2)`

### Conversions
```
normalized → fromCenter:  fromCenter = normalized * imageSize/2
fromCenter → imageLocal:  imageLocal = fromCenter + imageSize/2
imageLocal → world:       world = fromCenter + offset + imageOffsetPx
world → screen:           screen = world * zoom + viewportCenter + pan
```

## Transform Model

The Transform node uses **SRT order** (Scale → Rotate → Translate) around a pivot point.

For a point P in the original image, the transformed position P' is:
```
P' = R * S * (P - pivot) + pivot + offset
```

Where:
- `P` is in image-local pixel coordinates
- `pivot` is in image-local pixel coordinates
- `R` is rotation matrix: `[[cos(θ), -sin(θ)], [sin(θ), cos(θ)]]`
- `S` is scale matrix: `[[sX, 0], [0, sY]]`
- `offset` is translation in pixels

---

## Part 1: Offset Compensation Formula

When pivot changes from `p0` to `p1`, we want `P'` to remain the same for all points P.

**Old transform:**
```
P'_old = R * S * (P - p0) + p0 + offset_old
```

**New transform:**
```
P'_new = R * S * (P - p1) + p1 + offset_new
```

Setting `P'_old = P'_new` and solving:
```
R * S * (P - p0) + p0 + offset_old = R * S * (P - p1) + p1 + offset_new
```

The `R * S * P` terms cancel:
```
-R * S * p0 + p0 + offset_old = -R * S * p1 + p1 + offset_new
```

**Offset compensation formula:**
```
offset_new = offset_old + d - R * S * d
```
where `d = p0 - p1` (old pivot minus new pivot, in image-local pixels)

### Matrix R * S

```
R * S = [[cos(θ)*sX, -sin(θ)*sY],
         [sin(θ)*sX,  cos(θ)*sY]]
```

For `d = (dx, dy)`:
```
(R * S * d).x = cos(θ) * sX * dx - sin(θ) * sY * dy
(R * S * d).y = sin(θ) * sX * dx + cos(θ) * sY * dy
```

---

## Part 2: World-Space Pivot Drag

### The Problem with Naive Approach

If we simply set `newPivotFromCenter = oldPivotFromCenter + worldDelta`, the pivot does NOT end up at the dragged world position after compensation.

**Proof:**
```
newPivotWorld = newPivotFromCenter + newOffset + imageOffsetPx
             = (oldFromCenter + worldDelta) + (oldOffset + d - R*S*d) + imageOffsetPx
```
where `d = -worldDelta`
```
             = oldFromCenter + worldDelta + oldOffset - worldDelta + R*S*worldDelta + imageOffsetPx
             = oldPivotWorld + R*S*worldDelta    ← NOT oldPivotWorld + worldDelta!
```

The pivot moves by `R*S*worldDelta`, not `worldDelta`. This causes a "jump" on release.

### Solution: Apply Inverse Transform

To make the pivot end up exactly where dragged, we need:
```
newPivotWorld = oldPivotWorld + worldDelta
```

Working backwards, this requires:
```
localDelta = inv(R*S) * worldDelta
```

### Inverse of R*S

```
inv(R*S) = inv(S) * inv(R)
         = [[1/sX, 0], [0, 1/sY]] * [[cos(θ), sin(θ)], [-sin(θ), cos(θ)]]
```

For `worldDelta = (wx, wy)`:
```
localDelta.x = (cos(θ) * wx + sin(θ) * wy) / sX
localDelta.y = (-sin(θ) * wx + cos(θ) * wy) / sY
```

### Verification

With `localDelta = inv(R*S) * worldDelta`:
```
newPivotWorld = newPivotFromCenter + newOffset + imageOffsetPx
             = (oldFromCenter + localDelta) + (oldOffset - localDelta + R*S*localDelta) + imageOffsetPx
             = oldFromCenter + oldOffset + R*S*localDelta + imageOffsetPx
             = oldPivotWorld + R*S * inv(R*S) * worldDelta
             = oldPivotWorld + worldDelta  ✓
```

---

## Part 3: Complete Algorithm

### Step 1: Compute World Delta
```typescript
// Screen delta to world delta
let worldDeltaX = (currentScreenX - startScreenX) / zoom;
let worldDeltaY = (currentScreenY - startScreenY) / zoom;

// Constrain to axis if needed (in world space)
if (axis === 'x') worldDeltaY = 0;
if (axis === 'y') worldDeltaX = 0;
```

### Step 2: Apply Inverse R*S
```typescript
const c = Math.cos(angleRad);
const s = Math.sin(angleRad);

// inv(R*S) * worldDelta
const localDeltaX = (c * worldDeltaX + s * worldDeltaY) / scaleX;
const localDeltaY = (-s * worldDeltaX + c * worldDeltaY) / scaleY;
```

### Step 3: Compute New Pivot
```typescript
const newPivotFromCenterX = startPivotFromCenterX + localDeltaX;
const newPivotFromCenterY = startPivotFromCenterY + localDeltaY;

// Convert to normalized (-1 to 1)
const newPivotNormX = newPivotFromCenterX / (imageWidth / 2);
const newPivotNormY = newPivotFromCenterY / (imageHeight / 2);
```

### Step 4: Compute Offset Compensation
```typescript
// d = oldPivotLocal - newPivotLocal = -localDelta
const dpx = -localDeltaX;
const dpy = -localDeltaY;

// R*S*d
const rsDpx = c * scaleX * dpx - s * scaleY * dpy;
const rsDpy = s * scaleX * dpx + c * scaleY * dpy;

// newOffset = oldOffset + d - R*S*d
const newOffsetX = Math.round(startOffsetX + dpx - rsDpx);
const newOffsetY = Math.round(startOffsetY + dpy - rsDpy);
```

### Step 5: Update Parameters Atomically
```typescript
batchUpdateNodeParameters(node.id, {
  [pivotXParam]: newPivotNormX,
  [pivotYParam]: newPivotNormY,
  [offsetXParam]: newOffsetX,
  [offsetYParam]: newOffsetY,
});
```

---

## Visual Feedback During Drag

The gizmo follows the mouse directly in screen space for immediate feedback:
```typescript
dragVisualRef.current = {
  x: startGizmoScreenX + screenDeltaX,
  y: startGizmoScreenY + screenDeltaY,
};
```

This matches the final position because:
- Visual: `startGizmoScreen + screenDelta`
- Final: `newPivotWorld * zoom + center = (oldPivotWorld + worldDelta) * zoom + center`
- Since `worldDelta = screenDelta / zoom`, the positions match.

---

## Numerical Example

### Setup
- Image: 200x200 pixels
- Rotation: 45° (θ = π/4, cos = sin = 0.707)
- Scale: sX = 2, sY = 1
- Start pivot: normalized (0, 0) → fromCenter (0, 0)
- Start offset: (0, 0)
- User drags 100 pixels right in screen space, zoom = 1

### Calculation
```
worldDelta = (100, 0)

localDelta.x = (0.707 * 100 + 0.707 * 0) / 2 = 35.35
localDelta.y = (-0.707 * 100 + 0.707 * 0) / 1 = -70.7

newPivotFromCenter = (35.35, -70.7)
newPivotNorm = (0.354, -0.707)

d = (-35.35, 70.7)
R*S*d.x = 0.707 * 2 * (-35.35) - 0.707 * 1 * 70.7 = -50 - 50 = -100
R*S*d.y = 0.707 * 2 * (-35.35) + 0.707 * 1 * 70.7 = -50 + 50 = 0

newOffset.x = 0 + (-35.35) - (-100) = 64.65 ≈ 65
newOffset.y = 0 + 70.7 - 0 = 70.7 ≈ 71
```

### Verification
New pivot world position:
```
newPivotWorld = newPivotFromCenter + newOffset
             = (35.35, -70.7) + (65, 71)
             = (100.35, 0.3) ≈ (100, 0) = worldDelta ✓
```

---

## Code Location

Implementation in `GizmoOverlay.tsx`:
- **handleTranslatePivotMouseDown**: Stores start values in `dragState.startParams`
- **handleMouseMove**: Updates `dragVisualRef.current` for visual feedback
- **handleMouseUp**: Computes final pivot and offset using the algorithm above

---

## Common Pitfalls

1. **Not applying inv(R*S)**: Causes pivot to jump on release
2. **Using wrong angle sign**: inv(R) uses transpose (same as R with -θ)
3. **Forgetting to divide by scale**: inv(S) = [[1/sX, 0], [0, 1/sY]]
4. **Using current params instead of start params**: Always use `dragState.startParams`
5. **Not including imageOffsetPx in world calculation**: Required for multi-node compositing
