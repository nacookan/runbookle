export type ParsedTime = {
  hours: number;
  minutes: number;
  totalMinutes: number;
  source: string;
};

export type ParsedTimeLine = {
  lineNumber: number;
  line: string;
  start: ParsedTime;
  end: ParsedTime | null;
};

export function parseRunbookTimeLines(text: string): ParsedTimeLine[] {
  const lines = text.split(/\r?\n/);
  const parsedLines: ParsedTimeLine[] = [];

  lines.forEach((line, index) => {
    const times = parseTimesFromLine(line);

    if (!times[0]) {
      return;
    }

    parsedLines.push({
      lineNumber: index + 1,
      line,
      start: times[0],
      end: times[1] ?? null,
    });
  });

  return parsedLines;
}

export function parseTimesFromLine(line: string): ParsedTime[] {
  const tokens = Array.from(line.matchAll(/\d{1,2}:\d{2}|\d{3,4}/g))
    .filter((match) => match.index !== undefined && hasTimeTokenBoundary(line, match.index, match[0]))
    .map((match) => match[0]);

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

function hasTimeTokenBoundary(line: string, index: number, token: string) {
  const before = line[index - 1] ?? '';
  const after = line[index + token.length] ?? '';
  const isCompactTime = /^\d{3,4}$/.test(token);
  const invalidBoundary = isCompactTime ? /[0-9A-Za-z_:./-]/ : /[0-9A-Za-z_:]/;

  return !invalidBoundary.test(before) && !invalidBoundary.test(after);
}
