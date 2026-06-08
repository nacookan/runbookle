import { createNoEndDate, createUnknownStartDate, generateInitialRunbookText } from '../../lib/date';
import {
  RUNBOOKLE_SCHEMA_VERSION,
  type Runbook,
  type RunbookDraft,
  type RunbookEndDate,
  type RunbookStartDate,
  type RunbookleData,
} from './types';

export function createEmptyRunbookleData(updatedAt = new Date().toISOString()): RunbookleData {
  return createRunbookleData([], updatedAt);
}

export function createEmptyRunbookDraft(): RunbookDraft {
  const startDate = createUnknownStartDate();
  const endDate = createNoEndDate();

  return {
    title: '',
    startDate,
    endDate,
    text: generateInitialRunbookText(startDate, endDate),
  };
}

export function createRunbook(draft: RunbookDraft, now = new Date().toISOString()): Runbook {
  return {
    id: createId(),
    title: normalizeTitle(draft.title),
    startDate: normalizeStartDate(draft.startDate),
    endDate: normalizeEndDate(draft.endDate),
    archived: false,
    text: draft.text,
    createdAt: now,
    updatedAt: now,
  };
}

export function parseRunbookleData(value: unknown): RunbookleData | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const maybeData = value as Partial<RunbookleData>;

  if (maybeData.schemaVersion !== RUNBOOKLE_SCHEMA_VERSION || !Array.isArray(maybeData.runbooks)) {
    return null;
  }

  if (typeof maybeData.updatedAt !== 'string' || Number.isNaN(Date.parse(maybeData.updatedAt))) {
    return null;
  }

  const runbooks = maybeData.runbooks.map(parseRunbook).filter((runbook): runbook is Runbook => Boolean(runbook));

  return createRunbookleData(runbooks, maybeData.updatedAt);
}

export function createRunbookleData(runbooks: Runbook[], updatedAt = new Date().toISOString()): RunbookleData {
  return {
    schemaVersion: RUNBOOKLE_SCHEMA_VERSION,
    runbooks,
    updatedAt,
  };
}

export function normalizeTitle(title: string) {
  const normalizedTitle = title.trim();

  return normalizedTitle || '行動メモ';
}

export function normalizeStartDate(date: RunbookStartDate): RunbookStartDate {
  if (date.precision === 'none') {
    return createUnknownStartDate();
  }

  if (date.precision === 'year') {
    return {
      year: normalizeNumber(date.year),
      month: null,
      day: null,
      precision: 'year',
    };
  }

  if (date.precision === 'month') {
    return {
      year: normalizeNumber(date.year),
      month: normalizeNumber(date.month),
      day: null,
      precision: 'month',
    };
  }

  return {
    year: normalizeNumber(date.year),
    month: normalizeNumber(date.month),
    day: normalizeNumber(date.day),
    precision: 'day',
  };
}

export function normalizeEndDate(date: RunbookEndDate): RunbookEndDate {
  if (date.mode === 'none') {
    return createNoEndDate();
  }

  if (date.mode === 'unknown') {
    return {
      mode: 'unknown',
      year: null,
      month: null,
      day: null,
      precision: null,
    };
  }

  if (date.precision === 'year') {
    return {
      mode: 'date',
      year: normalizeNumber(date.year),
      month: null,
      day: null,
      precision: 'year',
    };
  }

  if (date.precision === 'month') {
    return {
      mode: 'date',
      year: normalizeNumber(date.year),
      month: normalizeNumber(date.month),
      day: null,
      precision: 'month',
    };
  }

  return {
    mode: 'date',
    year: normalizeNumber(date.year),
    month: normalizeNumber(date.month),
    day: normalizeNumber(date.day),
    precision: 'day',
  };
}

function parseRunbook(value: unknown): Runbook | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const maybeRunbook = value as Partial<Runbook>;

  if (
    typeof maybeRunbook.id !== 'string' ||
    typeof maybeRunbook.title !== 'string' ||
    typeof maybeRunbook.text !== 'string' ||
    typeof maybeRunbook.archived !== 'boolean' ||
    typeof maybeRunbook.createdAt !== 'string' ||
    typeof maybeRunbook.updatedAt !== 'string' ||
    Number.isNaN(Date.parse(maybeRunbook.createdAt)) ||
    Number.isNaN(Date.parse(maybeRunbook.updatedAt)) ||
    !maybeRunbook.startDate ||
    !maybeRunbook.endDate
  ) {
    return null;
  }

  return {
    id: maybeRunbook.id,
    title: normalizeTitle(maybeRunbook.title),
    startDate: normalizeStartDate(maybeRunbook.startDate),
    endDate: normalizeEndDate(maybeRunbook.endDate),
    archived: maybeRunbook.archived,
    text: maybeRunbook.text,
    createdAt: maybeRunbook.createdAt,
    updatedAt: maybeRunbook.updatedAt,
  };
}

function normalizeNumber(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return Math.trunc(value);
}

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
