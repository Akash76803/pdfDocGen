import type { DesignTemplate } from '@document-tool/contracts';

export const DEFAULT_DESIGN_HISTORY_LIMIT = 100;

export interface DesignHistoryState {
  past: DesignTemplate[];
  present: DesignTemplate;
  future: DesignTemplate[];
  limit: number;
}

export function createDesignHistory(present: DesignTemplate, limit = DEFAULT_DESIGN_HISTORY_LIMIT): DesignHistoryState {
  return { past: [], present, future: [], limit: normalizeLimit(limit) };
}

export function commitDesignHistory(state: DesignHistoryState, next: DesignTemplate): DesignHistoryState {
  if (next === state.present) return state;
  const past = [...state.past, state.present];
  const limit = normalizeLimit(state.limit);
  return {
    past: past.length > limit ? past.slice(past.length - limit) : past,
    present: next,
    future: [],
    limit,
  };
}

export function undoDesignHistory(state: DesignHistoryState): DesignHistoryState {
  if (!state.past.length) return state;
  const previous = state.past[state.past.length - 1]!;
  return {
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future],
    limit: state.limit,
  };
}

export function redoDesignHistory(state: DesignHistoryState): DesignHistoryState {
  if (!state.future.length) return state;
  const next = state.future[0]!;
  const past = [...state.past, state.present];
  return {
    past: past.length > state.limit ? past.slice(past.length - state.limit) : past,
    present: next,
    future: state.future.slice(1),
    limit: state.limit,
  };
}

export function resetDesignHistory(present: DesignTemplate, limit = DEFAULT_DESIGN_HISTORY_LIMIT): DesignHistoryState {
  return createDesignHistory(present, limit);
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_DESIGN_HISTORY_LIMIT;
  return Math.max(1, Math.floor(limit));
}
