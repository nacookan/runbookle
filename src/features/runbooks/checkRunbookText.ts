import { formatParsedTime, parseRunbookTimeLines, type ParsedTimeLine } from './timeParser';

export type CheckIssueType = 'error' | 'warning' | 'info';

export type CheckIssue = {
  type: CheckIssueType;
  lineNumber: number | null;
  message: string;
};

export function checkRunbookText(text: string): CheckIssue[] {
  return [...findTimeRangeIssues(text), ...findSectionTimeOrderIssues(text), ...findUncheckedCheckboxIssues(text)];
}

function findTimeRangeIssues(text: string): CheckIssue[] {
  return parseRunbookTimeLines(text)
    .filter((line): line is ParsedTimeLine & { end: NonNullable<ParsedTimeLine['end']> } =>
      Boolean(line.end && line.end.totalMinutes < line.start.totalMinutes),
    )
    .map((line) => ({
      type: 'error',
      lineNumber: line.lineNumber,
      message: `開始時刻 ${formatParsedTime(line.start)} より終了時刻 ${formatParsedTime(line.end)} が前です。`,
    }));
}

function findSectionTimeOrderIssues(text: string): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const previousLineBySection = new Map<number, ParsedTimeLine>();

  for (const line of parseRunbookTimeLines(text)) {
    if (line.sectionIndex === null) {
      continue;
    }

    const previousLine = previousLineBySection.get(line.sectionIndex);

    if (previousLine && line.start.totalMinutes < previousLine.start.totalMinutes) {
      issues.push({
        type: 'warning',
        lineNumber: line.lineNumber,
        message: `同じ日付区切り内で時刻が前後しています。${formatParsedTime(previousLine.start)} の後に ${formatParsedTime(line.start)} があります。`,
      });
    }

    previousLineBySection.set(line.sectionIndex, line);
  }

  return issues;
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
