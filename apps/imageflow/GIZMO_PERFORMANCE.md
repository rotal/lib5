# Gizmo Performance Notes

## SVG Rendering Performance Findings

### Element Performance Comparison

| Element | Positioning | Performance |
|---------|-------------|-------------|
| `<line>` | `x1/y1/x2/y2` attributes | **Fast** - geometry attributes |
| `<rect>` | `x/y` attributes | **Slow** - position attributes trigger layout |
| `<circle>` | `cx/cy` attributes | **Slow** - position attributes trigger layout |
| `<g>` | CSS `transform: translate()` | **Variable** - may not be GPU accelerated |

### Why `<line>` is faster than `<rect>`

- `<rect>` uses `x` and `y` which are **position attributes** that define WHERE the element is located
- `<line>` uses `x1, y1, x2, y2` which are **geometry attributes** that define the SHAPE itself
- Browser may trigger different code paths for position vs geometry attribute changes
- Position attributes (`x`, `y`, `cx`, `cy`) may trigger layout/positioning calculations

### Best Practice (from research)

> For frequently-moving SVG elements, use CSS `transform: translate()` instead of changing position attributes directly - this uses GPU compositing and avoids reflow entirely.

**However**: SVG transforms are NOT hardware accelerated in all browsers. CSS transforms on SVG `<g>` elements may cause React reconciliation issues and slow updates.

## Current Implementation

### Approach: CSS Transform on Group

```jsx
// Rotation handle and Translate/Pivot gizmo use CSS transform
<g style={{ transform: `translate(${pivotScreen.x}px, ${pivotScreen.y}px)` }}>
  {/* All child elements use origin-relative coordinates (0, 0) */}
  <circle cx={0} cy={0} r={ROTATION_RADIUS} ... />
  <line x1={0} y1={0} x2={AXIS_LENGTH} y2={0} ... />
</g>
```

### Revert: Direct Coordinates (if CSS transform is slow)

If CSS transform causes slow updates (e.g., 1 update/second), revert to direct coordinates:

```jsx
// Use pivotScreen.x/y directly in each element
<g>
  <circle cx={pivotScreen.x} cy={pivotScreen.y} r={ROTATION_RADIUS} ... />
  <line
    x1={pivotScreen.x}
    y1={pivotScreen.y}
    x2={pivotScreen.x + AXIS_LENGTH}
    y2={pivotScreen.y}
    ...
  />
</g>
```

**Note**: When using direct coordinates, prefer `<line>` over `<rect>` for moving elements because `<line>` uses geometry attributes which are faster than position attributes.

### Square as 4 Lines (instead of rect)

Drawing a square with 4 `<line>` elements is faster than using `<rect>`:

```jsx
{/* Square as 4 lines - rect is slower due to browser SVG rendering */}
<line x1={-8} y1={-8} x2={8} y2={-8} ... />  {/* top */}
<line x1={8} y1={-8} x2={8} y2={8} ... />    {/* right */}
<line x1={8} y1={8} x2={-8} y2={8} ... />    {/* bottom */}
<line x1={-8} y1={8} x2={-8} y2={-8} ... />  {/* left */}
```

## References

- [Khan Academy SVG Performance](https://www.crmarsh.com/svg-performance/)
- [Improving SVG Runtime Performance - CodePen](https://codepen.io/tigt/post/improving-svg-rendering-performance)
- [Planning for Performance - O'Reilly SVG Book](https://oreillymedia.github.io/Using_SVG/extras/ch19-performance.html)
- [What forces layout/reflow - Paul Irish](https://gist.github.com/paulirish/5d52fb081b3570c81e3a)
