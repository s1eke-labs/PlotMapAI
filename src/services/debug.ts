const isDebug = import.meta.env.VITE_DEBUG === 'true';
export const MAX_LOGS = 500;

export interface LogEntry {
  time: number;
  category: string;
  message: string;
}

type LogListener = (entry: LogEntry) => void;

const logs: LogEntry[] = [];
const listeners = new Set<LogListener>();

export function isDebugMode(): boolean {
  return isDebug;
}

export function debugLog(category: string, message: string, ...args: unknown[]): void {
  if (!isDebug) return;
  const entry: LogEntry = {
    time: Date.now(),
    category,
    message: args.length > 0 ? `${message} ${args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')}` : message,
  };
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
  for (const fn of listeners) fn(entry);
  console.log(`[PlotMapAI][${category}]`, message, ...args);
}

export function debugSubscribe(listener: LogListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getRecentLogs(): LogEntry[] {
  return [...logs];
}

export function clearLogs(): void {
  logs.length = 0;
}
