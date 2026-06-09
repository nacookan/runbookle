import { formatParsedTime, parseRunbookTimeLines, type ParsedTimeLine } from './timeParser';

export type CheckIssueType = 'error' | 'warning' | 'info';

export type CheckIssue = {
  type: CheckIssueType;
  lineNumber: number | null;
  message: string;
};

export function checkRunbookText(text: string): CheckIssue[] {
  return [...findTimeOrderIssues(text), ...findUncheckedCheckboxIssues(text)];
}

function findTimeOrderIssues(text: string): CheckIssue[] {
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
