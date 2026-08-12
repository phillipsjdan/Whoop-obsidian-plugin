// Obsidian runs in an Electron renderer, where `window` is the global object.
// The source schedules timers through `window.setTimeout` — the obsidianmd lint
// rule wants that, so a timer started from a popout window dies with it — but
// vitest's `node` environment defines no `window` at all, so `sleep` threw a
// ReferenceError instead of backing off.
//
// Aliasing the global rather than stubbing a fake keeps `vi.useFakeTimers()`
// working: it patches the timer functions on globalThis, and this makes
// `window.setTimeout` the very same function object.
globalThis.window ??= globalThis as unknown as Window & typeof globalThis;
