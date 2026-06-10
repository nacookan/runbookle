import { formatParsedTime, parseRunbookTimeLines, type ParsedTimeLine } from './timeParser';

export type CheckIssueType = 'error' | 'warning' | 'info';

export type CheckIssue = {
  type: CheckIssueType;
  lineNumber: number | null;
  message: string;
};

export function checkRunbookText(text: string): CheckIssue[] {
  const timeLines = parseRunbookTimeLines(text);

  return [
    ...findTimeRangeIssues(timeLines),
    ...findSectionTimeOrderIssues(timeLines),
    ...findSectionScheduleIssues(timeLines),
    ...findUncheckedCheckboxIssues(text),
  ];
}

type TimeIntervalLine = ParsedTimeLine & {
  end: NonNullable<ParsedTimeLine['end']>;
  sectionIndex: number;
};

function findTimeRangeIssues(timeLines: ParsedTimeLine[]): CheckIssue[] {
  return timeLines
    .filter((line): line is ParsedTimeLine & { end: NonNullable<ParsedTimeLine['end']> } =>
      Boolean(line.end && line.end.totalMinutes < line.start.totalMinutes),
    )
    .map((line) => ({
      type: 'error',
      lineNumber: line.lineNumber,
      message: `開始時刻 ${formatParsedTime(line.start)} より終了時刻 ${formatParsedTime(line.end)} が前です。`,
    }));
}

function findSectionTimeOrderIssues(timeLines: ParsedTimeLine[]): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const previousLineBySection = new Map<number, ParsedTimeLine>();

  for (const line of timeLines) {
    if (line.sectionIndex === null) {
      continue;
    }

    const previousLine = previousLineBySection.get(line.sectionIndex);

    if (previousLine && line.start.totalMinutes < previousLine.start.totalMinutes) {
      issues.push({
        type: 'warning',
        lineNumber: line.lineNumber,
        message: `同じ日の中で時刻が前後しています。${formatParsedTime(previousLine.start)} の後に ${formatParsedTime(line.start)} があります。`,
      });
    }

    previousLineBySection.set(line.sectionIndex, line);
  }

  return issues;
}

function findSectionScheduleIssues(timeLines: ParsedTimeLine[]): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const intervalsBySection = new Map<number, TimeIntervalLine[]>();

  for (const line of timeLines) {
    if (!isValidIntervalLine(line)) {
      continue;
    }

    const sectionIntervals = intervalsBySection.get(line.sectionIndex) ?? [];
    sectionIntervals.push(line);
    intervalsBySection.set(line.sectionIndex, sectionIntervals);
  }

  for (const intervals of intervalsBySection.values()) {
    const sortedIntervals = [...intervals].sort(
      (a, b) =>
        a.start.totalMinutes - b.start.totalMinutes ||
        a.end.totalMinutes - b.end.totalMinutes ||
        a.lineNumber - b.lineNumber,
    );
    let latestEndInterval = sortedIntervals[0];

    for (const interval of sortedIntervals.slice(1)) {
      if (interval.start.totalMinutes < latestEndInterval.end.totalMinutes) {
        issues.push({
          type: 'warning',
          lineNumber: interval.lineNumber,
          message: `予定の時間が重なっています。${formatTimeRange(interval)} が ${formatTimeRange(latestEndInterval)} と重なっています。`,
        });
      } else if (interval.start.totalMinutes > latestEndInterval.end.totalMinutes) {
        issues.push({
          type: 'info',
          lineNumber: interval.lineNumber,
          message: `${formatParsedTime(latestEndInterval.end)} から ${formatParsedTime(interval.start)} まで空き時間があります。`,
        });
      }

      if (interval.end.totalMinutes > latestEndInterval.end.totalMinutes) {
        latestEndInterval = interval;
      }
    }
  }

  return issues;
}

function isValidIntervalLine(line: ParsedTimeLine): line is TimeIntervalLine {
  return Boolean(line.sectionIndex !== null && line.end && line.end.totalMinutes >= line.start.totalMinutes);
}

function formatTimeRange(line: TimeIntervalLine) {
  return `${formatParsedTime(line.start)}-${formatParsedTime(line.end)}`;
}

function findUncheckedCheckboxIssues(text: string): CheckIssue[] {
  return text
    .split(/\r?\n/)
    .flatMap((line, index) =>
      line.includes('[ ]')
        ? [
            {
              type: 'info',
              lineNumber: index + 1,
              message: '未チェックの項目があります。',
            },
          ]
        : [],
    );
}
