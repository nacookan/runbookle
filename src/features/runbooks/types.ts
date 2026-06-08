export const RUNBOOKLE_SCHEMA_VERSION = 1 as const;

export type DatePrecision = 'none' | 'year' | 'month' | 'day';
export type EndDateMode = 'none' | 'unknown' | 'date';
export type EndDatePrecision = Exclude<DatePrecision, 'none'>;

export type RunbookStartDate = {
  year: number | null;
  month: number | null;
  day: number | null;
  precision: DatePrecision;
};

export type RunbookEndDate = {
  mode: EndDateMode;
  year: number | null;
  month: number | null;
  day: number | null;
  precision: EndDatePrecision | null;
};

export type Runbook = {
  id: string;
  title: string;
  startDate: RunbookStartDate;
  endDate: RunbookEndDate;
  archived: boolean;
  text: string;
  createdAt: string;
  updatedAt: string;
};

export type RunbookleData = {
  schemaVersion: typeof RUNBOOKLE_SCHEMA_VERSION;
  runbooks: Runbook[];
  updatedAt: string;
};

export type RunbookDraft = {
  title: string;
  startDate: RunbookStartDate;
  endDate: RunbookEndDate;
  text: string;
};
