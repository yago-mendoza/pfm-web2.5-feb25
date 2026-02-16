// 🍊 Simple unique ID generator for terminal lines, notifications, etc.
// No need for uuid — a counter + timestamp is sufficient for local-only IDs.
let counter = 0;

export function generateId(): string {
  return `${Date.now()}-${++counter}`;
}
