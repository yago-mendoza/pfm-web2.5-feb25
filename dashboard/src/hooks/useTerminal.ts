import { useState, useCallback } from 'react';
import type { TerminalLine } from '@/types';
import { generateId } from '@/utils/id';

const MAX_LINES = 500;

// 🍊 Hook that manages terminal state: adding lines, clearing, filtering.
// The terminal is append-only with a cap of 500 lines — old lines are dropped
// from the front to keep memory bounded. This is important because the SDK
// emits events continuously (every block = a new line every N seconds).
export function useTerminal() {
  const [lines, setLines] = useState<TerminalLine[]>([]);

  const addLine = useCallback((
    level: TerminalLine['level'],
    source: string,
    message: string
  ) => {
    const newLine: TerminalLine = {
      id: generateId(),
      timestamp: new Date(),
      level,
      source,
      message,
    };

    setLines(prev => {
      const updated = [...prev, newLine];
      // 🍊 Drop oldest lines if we exceed the cap.
      // Slice from the end to keep the most recent output visible.
      if (updated.length > MAX_LINES) {
        return updated.slice(updated.length - MAX_LINES);
      }
      return updated;
    });
  }, []);

  const clear = useCallback(() => {
    setLines([]);
  }, []);

  // Convenience methods for each log level
  const log = useCallback((source: string, message: string) => addLine('info', source, message), [addLine]);
  const success = useCallback((source: string, message: string) => addLine('success', source, message), [addLine]);
  const warn = useCallback((source: string, message: string) => addLine('warn', source, message), [addLine]);
  const error = useCallback((source: string, message: string) => addLine('error', source, message), [addLine]);
  const debug = useCallback((source: string, message: string) => addLine('debug', source, message), [addLine]);
  const system = useCallback((source: string, message: string) => addLine('system', source, message), [addLine]);

  return {
    lines,
    addLine,
    clear,
    log,
    success,
    warn,
    error,
    debug,
    system,
  };
}
