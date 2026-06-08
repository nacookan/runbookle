import type { Runbook, RunbookEndDate, RunbookStartDate } from '../features/runbooks/types';

export type DateParts = {
  year: number;
  month: number;
  day: number;
};

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export function createUnknownStartDate(): RunbookStartDate {
  return {
    year: null,
    month: null,
    day: null,
    precision: 'none',
  };
}

export function createNoEndDate(): RunbookEndDate {
  return {
    mode: 'none',
    year: null,
    month: null,
    day: null,
    precision: null,
  };
}

export function todayParts(): DateParts {
  const today = new Date();

  return {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    day: today.getDate(),
  };
}

export function isCompleteStartDate(date: RunbookStartDate): date is RunbookStartDate & DateParts {
  return date.precision === 'day' && isValidDateParts(date.year, date.month, date.day);
}

export function isCompleteEndDate(date: RunbookEndDate): date is RunbookEndDate & DateParts {
  return date.mode === 'date' && date.precision === 'day' && isValidDateParts(date.year, date.month, date.day);
}

export function isPastRunbook(runbook: Runbook, today = todayParts()) {
  const lastKnownDate = getLastKnownDate(runbook);

  if (!lastKnownDate) {
    return false;
  }

  return compareDateParts(lastKnownDate, today) < 0;
}

export function getStartDateSortValue(runbook: Runbook): number | null {
  if (!runbook.startDate.year) {
    return null;
  }

  return dateSortValue({
    year: runbook.startDate.year,
    month: runbook.startDate.month ?? 1,
    day: runbook.startDate.day ?? 1,
  });
}

export function compareDateParts(a: DateParts, b: DateParts) {
  return dateSortValue(a) - dateSortValue(b);
}

export function dateSortValue(date: DateParts) {
  return date.year * 10000 + date.month * 100 + date.day;
}

export function formatStartDate(date: RunbookStartDate) {
  if (date.precision === 'none' || !date.year) {
    return '開始日未定';
  }

  if (date.precision === 'year') {
    return `${date.year}年`;
  }

  if (date.precision === 'month' && date.month) {
    return `${date.year}年${date.month}月`;
  }

  if (date.precision === 'day' && date.month && date.day) {
    return `${date.year}年${date.month}月${date.day}日`;
  }

  return '開始日未定';
}

export function formatDateRange(runbook: Runbook) {
  const startLabel = formatStartDate(runbook.startDate);

  if (runbook.endDate.mode === 'none') {
    return startLabel;
  }

  if (runbook.endDate.mode === 'unknown') {
    return `${startLabel} - 終了日未定`;
  }

  return `${startLabel} - ${formatEndDate(runbook.endDate)}`;
}

export function formatHeadingDate(date: DateParts) {
  const weekday = WEEKDAYS[new Date(date.year, date.month - 1, date.day).getDay()];

  return `◆ ${date.year}-${date.month}-${date.day}(${weekday})`;
}

export function generateInitialRunbookText(startDate: RunbookStartDate, endDate: RunbookEndDate) {
  if (!isCompleteStartDate(startDate)) {
    return '';
  }

  if (endDate.mode !== 'date') {
    return `${formatHeadingDate(startDate)}\n\n`;
  }

  if (!isCompleteEndDate(endDate) || compareDateParts(endDate, startDate) < 0) {
    return `${formatHeadingDate(startDate)}\n\n`;
  }

  const headings: string[] = [];
  const current = new Date(startDate.year, startDate.month - 1, startDate.day);
  const end = new Date(endDate.year, endDate.month - 1, endDate.day);

  for (let guard = 0; current <= end && guard < 31; guard += 1) {
    headings.push(formatHeadingDate({
      year: current.getFullYear(),
      month: current.getMonth() + 1,
      day: current.getDate(),
    }));
    current.setDate(current.getDate() + 1);
  }

  return `${headings.join('\n\n')}\n\n`;
}

function getLastKnownDate(runbook: Runbook): DateParts | null {
  if (isCompleteEndDate(runbook.endDate)) {
    return runbook.endDate;
  }

  if (isCompleteStartDate(runbook.startDate)) {
    return runbook.startDate;
  }

  return null;
}

function formatEndDate(date: RunbookEndDate) {
  if (date.mode !== 'date' || !date.year) {
    return '終了日未定';
  }

  if (date.precision === 'year') {
    return `${date.year}年`;
  }

  if (date.precision === 'month' && date.month) {
    return `${date.year}年${date.month}月`;
  }

  if (date.precision === 'day' && date.month && date.day) {
    return `${date.year}年${date.month}月${date.day}日`;
  }

  return '終了日未定';
}

function isValidDateParts(year: number | null, month: number | null, day: number | null) {
  if (!year || !month || !day) {
    return false;
  }

  const date = new Date(year, month - 1, day);

  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}
