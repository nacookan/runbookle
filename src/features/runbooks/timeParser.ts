export type ParsedTime = {
  hours: number;
  minutes: number;
  totalMinutes: number;
  source: string;
};

export type ParsedTimeLine = {
  heading: string;
  lineNumber: number;
  line: string;
  start: ParsedTime;
  end: ParsedTime | null;
};

export function parseRunbookTimeLines(text: string): ParsedTimeLine[] {
  const lines = text.split(/\r?\n/);
  const parsedLines: ParsedTimeLine[] = [];
  let currentHeading = '日付未指定';

  lines.forEach((line, index) => {
    const headingMatch = line.match(/^◆\s*(.+)$/);

    if (headingMatch?.[1]) {
      currentHeading = headingMatch[1].trim();
      return;
    }

    const times = parseTimesFromLine(line);

    if (!times[0]) {
      return;
    }

    parsedLines.push({
      heading: currentHeading,
      lineNumber: index + 1,
      line,
      start: times[0],
      end: times[1] ?? null,
    });
  });

  return parsedLines;
}

export function parseTimesFromLine(line: string): ParsedTime[] {
  const tokens = line.match(/\b(?:\d{3,4}|\d{1,2}:\d{2})\b/g) ?? [];

  return tokens.map(parseTimeToken).filter((time): time is ParsedTime => Boolean(time));
}

export function parseTimeToken(token: string): ParsedTime | null {
  const colonMatch = token.match(/^(\d{1,2}):(\d{2})$/);
  const compactMatch = token.match(/^(\d{3,4})$/);
  let hours: number;
  let minutes: number;

  if (colonMatch) {
    hours = Number(colonMatch[1]);
    minutes = Number(colonMatch[2]);
  } else if (compactMatch) {
    const paddedToken = compactMatch[1].padStart(4, '0');
    hours = Number(paddedToken.slice(0, 2));
    minutes = Number(paddedToken.slice(2));
  } else {
    return null;
  }

  if (hours > 30 || minutes > 59) {
    return null;
  }

  return {
    hours,
    minutes,
    totalMinutes: hours * 60 + minutes,
    source: token,
  };
}

export function formatParsedTime(time: ParsedTime) {
  return `${String(time.hours).padStart(2, '0')}:${String(time.minutes).padStart(2, '0')}`;
}
