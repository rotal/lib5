# Bug: Console Interception Causes App Crash

## Summary
Intercepting console methods to capture logs in the app's log store caused the application to crash. The crash occurred when using `JSON.stringify` to format object arguments.

## Symptoms
- App would crash/freeze immediately after loading
- Browser became unresponsive
- No useful error messages (crash happened too fast)

## Root Cause
Using `JSON.stringify()` on console arguments caused the crash. The likely reasons:

1. **Circular references**: Many objects in the app (React components, DOM elements, store state) contain circular references that `JSON.stringify` cannot handle
2. **Proxy objects**: Zustand stores use Proxy objects which may not serialize properly
3. **Large object graphs**: Attempting to stringify large nested objects could cause stack overflow or memory issues

## The Fix
Replace `JSON.stringify()` with simple `String()` conversion for non-string arguments.

### Code That Crashed
```typescript
function formatArg(a: unknown): string {
  if (typeof a === 'string') return a;
  if (a === null) return 'null';
  if (a === undefined) return 'undefined';
  if (typeof a === 'object') {
    try { return JSON.stringify(a); } catch { return String(a); }
  }
  return String(a);
}
```

Even with try/catch, this crashed - the issue wasn't a thrown exception but likely a stack overflow or infinite loop during serialization.

### Working Code
```typescript
const formatArgs = (args: unknown[]) =>
  args.map(a => typeof a === 'string' ? a : String(a)).join(' ');

const _origLog = console.log.bind(console);
const _origWarn = console.warn.bind(console);
const _origError = console.error.bind(console);

console.log = (...args: unknown[]) => {
  _origLog(...args);
  useLogStore.getState().info(formatArgs(args));
};

console.warn = (...args: unknown[]) => {
  _origWarn(...args);
  useLogStore.getState().warn(formatArgs(args));
};

console.error = (...args: unknown[]) => {
  _origError(...args);
  useLogStore.getState().error(formatArgs(args));
};
```

## Debugging Process
We added the feature incrementally to isolate the crash:

1. **Step 1**: Intercept only `console.log`, capture only if first arg is string → ✅ Works
2. **Step 2**: Capture all args using `String()` → ✅ Works
3. **Step 3**: Add `JSON.stringify` for objects → ❌ Crash
4. **Step 4**: Revert to `String()` only → ✅ Works
5. **Step 5**: Add `console.warn` and `console.error` → ✅ Works

## Files Modified
- `apps/imageflow/src/store/logStore.ts`

## Lesson Learned
When intercepting console methods in a React/Zustand app:
- Avoid `JSON.stringify` on arbitrary objects - they often have circular references
- Use simple `String()` conversion which calls `.toString()` safely
- Add features incrementally when debugging crashes that don't produce error messages
- The try/catch around JSON.stringify doesn't help if the crash is a stack overflow
