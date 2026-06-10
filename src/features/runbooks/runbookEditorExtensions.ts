import {
  acceptCompletion,
  autocompletion,
  insertCompletionText,
  pickedCompletion,
  startCompletion,
  type Completion,
  type CompletionContext,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap } from '@codemirror/search';
import { EditorState, RangeSetBuilder, type Extension } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  keymap,
  placeholder,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import { isRunbookDateSeparatorLine, parseTimeToken, parseTimesFromLine } from './timeParser';

const RUNBOOK_PLACEHOLDER = '## 2026-6-8(月)\n\n1000 1030 移動\n- [ ] チケット予約';

const TIME_ADJUSTMENT_STEPS = [-5, -10, -30, 5, 10, 30];
const MAX_TIME_MINUTES = 30 * 60 + 59;

type AdjustableTimeToken = {
  from: number;
  to: number;
  totalMinutes: number;
  format:
    | {
        type: 'colon';
        hourWidth: number;
      }
    | {
        type: 'compact';
        tokenLength: number;
      };
};

const headingDecoration = Decoration.mark({ class: 'cm-runbookleHeading' });
const checkboxDecoration = Decoration.mark({ class: 'cm-runbookleCheckbox' });
const checkboxCheckedDecoration = Decoration.mark({ class: 'cm-runbookleCheckboxChecked' });
const titleLineDecoration = Decoration.line({ class: 'cm-runbookleTitleLine' });
const timeDecoration = Decoration.mark({ class: 'cm-runbookleTime' });

export function runbookEditorExtensions(onChange: (value: string) => void): Extension[] {
  return [
    history(),
    drawSelection(),
    dropCursor(),
    highlightActiveLine(),
    autocompletion({
      override: [timeCompletionSource],
    }),
    placeholder(RUNBOOK_PLACEHOLDER),
    EditorState.tabSize.of(2),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({
      'aria-label': 'Runbook内容',
      autocapitalize: 'off',
      autocomplete: 'off',
      autocorrect: 'off',
      spellcheck: 'false',
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange(update.state.doc.toString());
      }
    }),
    runbookDecorations,
    durationTooltip,
    keymap.of([
      {
        key: 'Tab',
        run: acceptOrOpenTimeCompletion,
      },
      {
        key: 'Enter',
        run: continueCheckboxLine,
      },
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
    ]),
  ];
}

function timeCompletionSource(context: CompletionContext) {
  const line = context.state.doc.lineAt(context.pos);
  const offset = context.pos - line.from;
  const timeToken = findTimeTokenAtPosition(line.text, offset);

  if (context.explicit && timeToken) {
    return {
      from: line.from + timeToken.from,
      to: line.from + timeToken.to,
      filter: false,
      options: createTimeAdjustmentOptions(timeToken),
    };
  }

  const beforeCursor = line.text.slice(0, offset);
  const afterCursor = line.text.slice(offset);
  const match = beforeCursor.match(/(?:^|[^0-9A-Za-z_:])(\d{3,4})$/);

  if (match?.[1] && !/^[0-9:]/.test(afterCursor)) {
    const label = formatTimeCompletion(match[1]);

    if (label) {
      return {
        from: context.pos - match[1].length,
        filter: false,
        options: [
          {
            label,
            apply: label,
            detail: '時刻',
          },
        ],
      };
    }
  }

  if (!timeToken || timeToken.format.type !== 'colon') {
    return null;
  }

  return {
    from: line.from + timeToken.from,
    to: line.from + timeToken.to,
    filter: false,
    options: createTimeAdjustmentOptions(timeToken),
  };
}

function formatTimeCompletion(value: string) {
  if (!/^\d{3,4}$/.test(value)) {
    return null;
  }

  const hourText = value.length === 3 ? value.slice(0, 1) : value.slice(0, 2);
  const minuteText = value.slice(-2);
  const hours = Number(hourText);
  const minutes = Number(minuteText);

  if (hours > 30 || minutes > 59) {
    return null;
  }

  return `${hourText}:${minuteText}`;
}

function getSelectedTimeToken(view: EditorView) {
  const selection = view.state.selection.main;

  if (!selection.empty) {
    return null;
  }

  const line = view.state.doc.lineAt(selection.head);

  return findTimeTokenAtPosition(line.text, selection.head - line.from);
}

function acceptOrOpenTimeCompletion(view: EditorView) {
  if (acceptCompletion(view)) {
    return true;
  }

  if (!getSelectedTimeToken(view)) {
    return false;
  }

  startCompletion(view);
  return true;
}

function findTimeTokenAtPosition(text: string, offset: number): AdjustableTimeToken | null {
  return findColonTimeAtPosition(text, offset) ?? findCompactTimeAtPosition(text, offset);
}

function findColonTimeAtPosition(text: string, offset: number): AdjustableTimeToken | null {
  for (const match of text.matchAll(/\b(\d{1,2}):(\d{2})\b/g)) {
    if (match.index === undefined || !match[1] || !match[2]) {
      continue;
    }

    const from = match.index;
    const to = from + match[0].length;

    if (offset < from || offset > to) {
      continue;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);

    if (hours > 30 || minutes > 59) {
      continue;
    }

    return {
      format: {
        type: 'colon',
        hourWidth: match[1].length,
      },
      from,
      to,
      totalMinutes: hours * 60 + minutes,
    };
  }

  return null;
}

function findCompactTimeAtPosition(text: string, offset: number): AdjustableTimeToken | null {
  for (const match of text.matchAll(/\b\d{3,4}\b/g)) {
    if (match.index === undefined || !match[0]) {
      continue;
    }

    const from = match.index;
    const to = from + match[0].length;

    if (offset < from || offset > to) {
      continue;
    }

    const time = parseTimeToken(match[0]);

    if (!time) {
      continue;
    }

    return {
      format: {
        type: 'compact',
        tokenLength: match[0].length,
      },
      from,
      to,
      totalMinutes: time.totalMinutes,
    };
  }

  return null;
}

function createTimeAdjustmentOptions(timeToken: AdjustableTimeToken) {
  return TIME_ADJUSTMENT_STEPS
    .map((step) => createTimeAdjustmentOption(timeToken, step))
    .filter((option): option is Completion => Boolean(option));
}

function createTimeAdjustmentOption(timeToken: AdjustableTimeToken, step: number): Completion | null {
  const nextTotalMinutes = timeToken.totalMinutes + step;

  if (nextTotalMinutes < 0 || nextTotalMinutes > MAX_TIME_MINUTES) {
    return null;
  }

  const label = formatTotalMinutes(nextTotalMinutes, timeToken.format);
  const offsetLabel = step > 0 ? `+${step}` : `${step}`;

  return {
    label: offsetLabel,
    apply: (view, completion, from, to) => {
      const transaction = insertCompletionText(view.state, label, from, to);

      view.dispatch({
        ...transaction,
        annotations: pickedCompletion.of(completion),
      });

      window.requestAnimationFrame(() => {
        if (view.hasFocus && getSelectedTimeToken(view)) {
          startCompletion(view);
        }
      });
    },
    detail: label,
  };
}

function formatTotalMinutes(totalMinutes: number, format: AdjustableTimeToken['format']) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const paddedMinutes = String(minutes).padStart(2, '0');

  if (format.type === 'compact') {
    if (format.tokenLength === 4) {
      return `${String(hours).padStart(2, '0')}${paddedMinutes}`;
    }

    return `${hours}${paddedMinutes}`;
  }

  return `${String(hours).padStart(format.hourWidth, '0')}:${paddedMinutes}`;
}

const runbookDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: { docChanged: boolean; selectionSet: boolean; viewportChanged: boolean; view: EditorView }) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (value) => value.decorations,
    eventHandlers: {
      mousedown(event, view) {
        if (selectTimeAtPointer(event, view)) {
          return true;
        }

        if (toggleCheckboxAtPointer(event, view)) {
          return true;
        }

        queueTimeCompletionAtPointer(event, view);
        return false;
      },
    },
  },
);

function buildDecorations(view: EditorView): DecorationSet {
  const decorations: Array<{ decoration: Decoration; from: number; to: number }> = [];
  const seenLines = new Set<number>();

  for (const { from, to } of view.visibleRanges) {
    let position = from;

    while (position <= to) {
      const line = view.state.doc.lineAt(position);

      if (!seenLines.has(line.number)) {
        seenLines.add(line.number);
        if (line.number === 1) {
          decorations.push({
            decoration: titleLineDecoration,
            from: line.from,
            to: line.from,
          });
        }
        addLineDecorations(decorations, line.from, line.text);
      }

      if (line.to >= to || line.to === view.state.doc.length) {
        break;
      }

      position = line.to + 1;
    }
  }

  decorations.sort((left, right) => left.from - right.from || left.to - right.to);

  const builder = new RangeSetBuilder<Decoration>();

  for (const item of decorations) {
    builder.add(item.from, item.to, item.decoration);
  }

  return builder.finish();
}

function createDurationLabel(line: string) {
  const [start, end] = parseTimesFromLine(line);

  if (!start || !end || end.totalMinutes < start.totalMinutes) {
    return null;
  }

  return `${end.totalMinutes - start.totalMinutes}分`;
}

const durationTooltip = ViewPlugin.fromClass(
  class {
    private frameId: number | null = null;
    private readonly handleScroll = () => this.schedule();
    private readonly handleResize = () => this.schedule();
    private readonly tooltip: HTMLSpanElement;

    constructor(private readonly view: EditorView) {
      this.tooltip = document.createElement('span');
      this.tooltip.className = 'cm-runbookleDuration';
      this.tooltip.hidden = true;
      view.dom.append(this.tooltip);
      view.scrollDOM.addEventListener('scroll', this.handleScroll);
      window.addEventListener('resize', this.handleResize);
      this.schedule();
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged || update.geometryChanged) {
        this.schedule();
      }
    }

    destroy() {
      if (this.frameId !== null) {
        window.cancelAnimationFrame(this.frameId);
      }

      this.view.scrollDOM.removeEventListener('scroll', this.handleScroll);
      window.removeEventListener('resize', this.handleResize);
      this.tooltip.remove();
    }

    private schedule() {
      if (this.frameId !== null) {
        return;
      }

      this.frameId = window.requestAnimationFrame(() => {
        this.frameId = null;
        this.updateTooltip();
      });
    }

    private updateTooltip() {
      const selection = this.view.state.selection.main;

      if (!selection.empty) {
        this.hide();
        return;
      }

      const line = this.view.state.doc.lineAt(selection.head);
      const label = createDurationLabel(line.text);

      if (!label) {
        this.hide();
        return;
      }

      const coords = this.view.coordsAtPos(line.to);

      if (!coords) {
        this.hide();
        return;
      }

      const editorRect = this.view.dom.getBoundingClientRect();
      const scrollerRect = this.view.scrollDOM.getBoundingClientRect();

      if (coords.bottom < scrollerRect.top || coords.top > scrollerRect.bottom) {
        this.hide();
        return;
      }

      this.tooltip.hidden = false;
      this.tooltip.textContent = label;

      const tooltipWidth = this.tooltip.offsetWidth;
      const tooltipHeight = this.tooltip.offsetHeight;
      const preferredLeft = coords.right - editorRect.left + 12;
      const maxLeft = scrollerRect.right - editorRect.left - tooltipWidth - 10;
      const left = Math.max(8, Math.min(preferredLeft, maxLeft));
      const top = coords.top - editorRect.top + (coords.bottom - coords.top - tooltipHeight) / 2;

      this.tooltip.style.left = `${left}px`;
      this.tooltip.style.top = `${Math.max(8, top)}px`;
    }

    private hide() {
      this.tooltip.hidden = true;
    }
  },
);

function addLineDecorations(
  decorations: Array<{ decoration: Decoration; from: number; to: number }>,
  lineFrom: number,
  text: string,
) {
  if (!text) {
    return;
  }

  if (isRunbookDateSeparatorLine(text) || /^◆\s*.+/.test(text)) {
    decorations.push({
      decoration: headingDecoration,
      from: lineFrom,
      to: lineFrom + text.length,
    });
    return;
  }

  addMatches(decorations, lineFrom, text, /\[(?: |x|X)\]/g, (match) =>
    match.toLowerCase() === '[x]' ? checkboxCheckedDecoration : checkboxDecoration,
  );
  addMatches(decorations, lineFrom, text, /\b(?:\d{3,4}|\d{1,2}:\d{2})\b/g, () => timeDecoration);
}

function addMatches(
  decorations: Array<{ decoration: Decoration; from: number; to: number }>,
  lineFrom: number,
  text: string,
  pattern: RegExp,
  getDecoration: (match: string) => Decoration,
) {
  pattern.lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined || !match[0]) {
      continue;
    }

    decorations.push({
      decoration: getDecoration(match[0]),
      from: lineFrom + match.index,
      to: lineFrom + match.index + match[0].length,
    });
  }
}

function toggleCheckboxAtPointer(event: MouseEvent, view: EditorView) {
  if (event.button !== 0) {
    return false;
  }

  const position = view.posAtCoords({
    x: event.clientX,
    y: event.clientY,
  });

  if (position === null) {
    return false;
  }

  const line = view.state.doc.lineAt(position);
  const checkbox = findCheckboxAtPosition(line.text, position - line.from);

  if (!checkbox) {
    return false;
  }

  const checkboxFrom = line.from + checkbox.from;
  const checkboxTo = line.from + checkbox.to;

  if (!isPointerInsideTextRange(event, view, checkboxFrom, checkboxTo)) {
    return false;
  }

  event.preventDefault();
  view.focus();
  view.dispatch({
    changes: {
      from: checkboxFrom,
      to: checkboxTo,
      insert: checkbox.checked ? '[ ]' : '[x]',
    },
    selection: {
      anchor: checkboxTo,
    },
  });

  return true;
}

function isPointerInsideTextRange(event: MouseEvent, view: EditorView, from: number, to: number) {
  const tolerance = 2;

  for (let position = from; position < to; position += 1) {
    const coords = view.coordsForChar(position);

    if (!coords) {
      continue;
    }

    const insideX = event.clientX >= coords.left - tolerance && event.clientX <= coords.right + tolerance;
    const insideY = event.clientY >= coords.top - tolerance && event.clientY <= coords.bottom + tolerance;

    if (insideX && insideY) {
      return true;
    }
  }

  return false;
}

function selectTimeAtPointer(event: MouseEvent, view: EditorView) {
  if (event.button !== 0 || event.detail !== 2) {
    return false;
  }

  const position = view.posAtCoords({
    x: event.clientX,
    y: event.clientY,
  });

  if (position === null) {
    return false;
  }

  const line = view.state.doc.lineAt(position);
  const timeToken = findTimeTokenAtPosition(line.text, position - line.from);

  if (!timeToken) {
    return false;
  }

  event.preventDefault();
  view.focus();
  view.dispatch({
    selection: {
      anchor: line.from + timeToken.from,
      head: line.from + timeToken.to,
    },
    scrollIntoView: true,
  });

  return true;
}

function queueTimeCompletionAtPointer(event: MouseEvent, view: EditorView) {
  if (event.button !== 0 || event.detail !== 1) {
    return;
  }

  const position = view.posAtCoords({
    x: event.clientX,
    y: event.clientY,
  });

  if (position === null) {
    return;
  }

  const line = view.state.doc.lineAt(position);
  const timeToken = findTimeTokenAtPosition(line.text, position - line.from);

  if (!timeToken) {
    return;
  }

  window.requestAnimationFrame(() => {
    if (view.hasFocus && getSelectedTimeToken(view)) {
      startCompletion(view);
    }
  });
}

function findCheckboxAtPosition(text: string, offset: number) {
  for (const match of text.matchAll(/\[( |x|X)\]/g)) {
    if (match.index === undefined) {
      continue;
    }

    const from = match.index;
    const to = from + match[0].length;

    if (offset >= from && offset <= to) {
      return {
        checked: match[1].toLowerCase() === 'x',
        from,
        to,
      };
    }
  }

  return null;
}

function continueCheckboxLine(view: EditorView) {
  const selection = view.state.selection.main;

  if (!selection.empty) {
    return false;
  }

  const line = view.state.doc.lineAt(selection.head);
  const offset = selection.head - line.from;
  const textBeforeCursor = line.text.slice(0, offset);
  const textAfterCursor = line.text.slice(offset);

  if (textAfterCursor.trim()) {
    return false;
  }

  const match = textBeforeCursor.match(/^(\s*(?:[-*]\s+)?\[(?: |x|X)\]\s+)/);

  if (!match?.[1]) {
    return false;
  }

  const prefix = match[1].replace(/\[(?:x|X)\]/, '[ ]');
  const insert = `\n${prefix}`;

  view.dispatch({
    changes: {
      from: selection.head,
      insert,
    },
    selection: {
      anchor: selection.head + insert.length,
    },
    scrollIntoView: true,
  });

  return true;
}
