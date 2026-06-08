import { formatParsedTime, parseRunbookTimeLines, type ParsedTimeLine } from './timeParser';

export type CheckIssueType = 'error' | 'warning' | 'info';

export type CheckIssue = {
  type: CheckIssueType;
  lineNumber: number | null;
  message: string;
};

export function checkRunbookText(text: string): CheckIssue[] {
  const parsedLines = parseRunbookTimeLines(text);
  const issues: CheckIssue[] = [];
  const groups = groupByHeading(parsedLines);

  for (const lines of groups.values()) {
    issues.push(...checkLineOrder(lines));
    issues.push(...checkOverlaps(lines));
    issues.push(...checkGaps(lines));
  }

  return issues;
}

function checkLineOrder(lines: ParsedTimeLine[]): CheckIssue[] {
  const issues: CheckIssue[] = [];
  let previousStart: number | null = null;

  for (const line of lines) {
    if (line.end && line.end.totalMinutes < line.start.totalMinutes) {
      issues.push({
        type: 'error',
        lineNumber: line.lineNumber,
        message: `開始時刻 ${formatParsedTime(line.start)} より終了時刻 ${formatParsedTime(line.end)} が前です。`,
      });
    }

    if (previousStart !== null && line.start.totalMinutes < previousStart) {
      issues.push({
        type: 'warning',
        lineNumber: line.lineNumber,
        message: '前の時刻行より開始時刻が前になっています。',
      });
    }

    previousStart = line.start.totalMinutes;
  }

  return issues;
}

function checkOverlaps(lines: ParsedTimeLine[]): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const ranges = lines.filter((line) => line.end && line.end.totalMinutes >= line.start.totalMinutes);

  for (let index = 0; index < ranges.length; index += 1) {
    const current = ranges[index];

    for (let nextIndex = index + 1; nextIndex < ranges.length; nextIndex += 1) {
      const next = ranges[nextIndex];

      if (!current.end || !next.end) {
        continue;
      }

      if (current.start.totalMinutes < next.end.totalMinutes && next.start.totalMinutes < current.end.totalMinutes) {
        issues.push({
          type: 'error',
          lineNumber: next.lineNumber,
          message: `${current.lineNumber}行目と時刻が重複しています。`,
        });
      }
    }
  }

  return issues;
}

function checkGaps(lines: ParsedTimeLine[]): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const ranges = lines
    .filter((line) => line.end && line.end.totalMinutes >= line.start.totalMinutes)
    .sort((a, b) => a.start.totalMinutes - b.start.totalMinutes);

  for (let index = 1; index < ranges.length; index += 1) {
    const previous = ranges[index - 1];
    const current = ranges[index];

    if (!previous.end) {
      continue;
    }

    if (current.start.totalMinutes > previous.end.totalMinutes) {
      issues.push({
        type: 'info',
        lineNumber: current.lineNumber,
        message: `${formatParsedTime(previous.end)} から ${formatParsedTime(current.start)} まで空き時間があります。`,
      });
    }
  }

  return issues;
}

function groupByHeading(lines: ParsedTimeLine[]) {
  const groups = new Map<string, ParsedTimeLine[]>();

  for (const line of lines) {
    groups.set(line.heading, [...(groups.get(line.heading) ?? []), line]);
  }

  return groups;
}
