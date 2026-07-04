import { todayParts, type DateParts } from '../../lib/date';
import type { DatePrecision, EndDatePrecision, RunbookEndDate, RunbookStartDate } from './types';

export type DateFieldValue = {
  year: number | null;
  month: number | null;
  day: number | null;
};

export function completeStartDateInput(value: RunbookStartDate): RunbookStartDate {
  return createStartDate(previewNearestUpcomingDate(toDateFieldValue(value)));
}

export function completeEndDateInput(value: RunbookEndDate, startDate: RunbookStartDate): RunbookEndDate {
  if (value.mode === 'none') {
    return value;
  }

  return createEndDate(previewNearestUpcomingDate(toDateFieldValue(value), startDateReferenceParts(startDate)));
}

export function startDateReferenceParts(startDate: RunbookStartDate): DateParts | undefined {
  if (startDate.precision !== 'day' || startDate.year === null || startDate.month === null || startDate.day === null) {
    return undefined;
  }

  return { year: startDate.year, month: startDate.month, day: startDate.day };
}

export function previewNearestUpcomingDate(value: DateFieldValue, referenceDate: DateParts = todayParts()): DateFieldValue {
  if (value.month !== null && value.day !== null) {
    return {
      ...value,
      year: value.year ?? inferNearestYear(value.month, value.day, referenceDate),
    };
  }

  if (value.month !== null && value.year === null) {
    return {
      ...value,
      year: inferNearestYear(value.month, value.day, referenceDate),
    };
  }

  if (value.day !== null && value.month === null) {
    const inferred = inferNearestYearMonth(value.year, value.day, referenceDate);

    return {
      ...value,
      year: inferred?.year ?? value.year,
      month: inferred?.month ?? value.month,
    };
  }

  return value;
}

export function formatDateInputPlaceholder(label: string, value: number | null, previewValue: number | null) {
  if (value !== null || previewValue === null) {
    return label;
  }

  return String(previewValue);
}

export function formatWeekday(value: DateFieldValue) {
  if (!value.year || !value.month || !value.day || !isValidDate(value.year, value.month, value.day)) {
    return '';
  }

  return ['日', '月', '火', '水', '木', '金', '土'][new Date(value.year, value.month - 1, value.day).getDay()];
}

function createStartDate(value: DateFieldValue): RunbookStartDate {
  return {
    ...value,
    precision: inferStartDatePrecision(value),
  };
}

function createEndDate(value: DateFieldValue): RunbookEndDate {
  const precision = inferEndDatePrecision(value);

  if (!precision) {
    return {
      mode: 'none',
      year: null,
      month: null,
      day: null,
      precision: null,
    };
  }

  return {
    mode: 'date',
    ...value,
    precision,
  };
}

function inferStartDatePrecision(value: DateFieldValue): DatePrecision {
  if (value.day !== null) {
    return 'day';
  }

  if (value.month !== null) {
    return 'month';
  }

  if (value.year !== null) {
    return 'year';
  }

  return 'none';
}

function inferEndDatePrecision(value: DateFieldValue): EndDatePrecision | null {
  if (value.day !== null) {
    return 'day';
  }

  if (value.month !== null) {
    return 'month';
  }

  if (value.year !== null) {
    return 'year';
  }

  return null;
}

function toDateFieldValue(value: DateFieldValue): DateFieldValue {
  return {
    year: value.year,
    month: value.month,
    day: value.day,
  };
}

function inferNearestYear(month: number, day: number | null, referenceDate: DateParts) {
  if (day === null) {
    return month >= referenceDate.month ? referenceDate.year : referenceDate.year + 1;
  }

  for (let offset = 0; offset < 12; offset += 1) {
    const candidateYear = referenceDate.year + offset;

    if (!isValidDate(candidateYear, month, day)) {
      continue;
    }

    if (dateValue(candidateYear, month, day) >= dateValue(referenceDate.year, referenceDate.month, referenceDate.day)) {
      return candidateYear;
    }
  }

  return null;
}

function inferNearestYearMonth(year: number | null, day: number, referenceDate: DateParts) {
  const startYear = year ?? referenceDate.year;
  const startMonth = year === null || year === referenceDate.year ? referenceDate.month : 1;
  const referenceValue = dateValue(referenceDate.year, referenceDate.month, referenceDate.day);

  for (let offset = 0; offset < 36; offset += 1) {
    const candidateMonthIndex = startMonth - 1 + offset;
    const candidateYear = startYear + Math.floor(candidateMonthIndex / 12);
    const candidateMonth = (candidateMonthIndex % 12) + 1;

    if (!isValidDate(candidateYear, candidateMonth, day)) {
      continue;
    }

    const candidateValue = dateValue(candidateYear, candidateMonth, day);

    if (year !== null && year !== referenceDate.year) {
      return {
        year: candidateYear,
        month: candidateMonth,
      };
    }

    if (candidateValue >= referenceValue) {
      return {
        year: candidateYear,
        month: candidateMonth,
      };
    }
  }

  return null;
}

function isValidDate(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day);

  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function dateValue(year: number, month: number, day: number) {
  return year * 10000 + month * 100 + day;
}
