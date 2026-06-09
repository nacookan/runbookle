export type RunbookTemplateId = 'basic' | 'timed' | 'reservation' | 'transport';

export type RunbookTemplateFieldName =
  | 'startTime'
  | 'endTime'
  | 'title'
  | 'from'
  | 'to'
  | 'service'
  | 'vehicleSeat';

export type RunbookTemplateField = {
  name: RunbookTemplateFieldName;
  label: string;
  numeric?: boolean;
  wide?: boolean;
};

export type RunbookTemplate = {
  id: RunbookTemplateId;
  label: string;
  sample: string;
  fields: RunbookTemplateField[];
};

export type RunbookTemplateValues = Partial<Record<RunbookTemplateFieldName, string>>;

export const RUNBOOK_TEMPLATES: RunbookTemplate[] = [
  {
    id: 'basic',
    label: '通常のイベント',
    sample: '1000 ミーティング',
    fields: [
      { name: 'startTime', label: '開始時刻', numeric: true },
      { name: 'title', label: '内容', wide: true },
    ],
  },
  {
    id: 'timed',
    label: '終了時間あり',
    sample: '1000 1030 タクシーで移動',
    fields: [
      { name: 'startTime', label: '開始時刻', numeric: true },
      { name: 'endTime', label: '終了時刻', numeric: true },
      { name: 'title', label: '内容', wide: true },
    ],
  },
  {
    id: 'reservation',
    label: '予約するイベント',
    sample: '1800 2000 夕食 ビストロRunbookle 予約[ ]',
    fields: [
      { name: 'startTime', label: '開始時刻', numeric: true },
      { name: 'endTime', label: '終了時刻', numeric: true },
      { name: 'title', label: '内容', wide: true },
    ],
  },
  {
    id: 'transport',
    label: '交通イベント',
    sample: '1000 1200 東京-新大阪 のぞみ11号 1号車 1A 予約[ ]',
    fields: [
      { name: 'startTime', label: '開始時刻', numeric: true },
      { name: 'endTime', label: '終了時刻', numeric: true },
      { name: 'from', label: '出発地' },
      { name: 'to', label: '到着地' },
      { name: 'service', label: '便名' },
      { name: 'vehicleSeat', label: '車両・座席' },
    ],
  },
];

export function createTemplateInitialValues(template: RunbookTemplate): RunbookTemplateValues {
  return Object.fromEntries(template.fields.map((field) => [field.name, '']));
}

export function buildRunbookTemplateLine(template: RunbookTemplate, values: RunbookTemplateValues) {
  const value = (name: RunbookTemplateFieldName) => normalizeTemplateValue(values[name]);

  if (template.fields.every((field) => !value(field.name))) {
    return '';
  }

  if (template.id === 'basic') {
    return joinTemplateParts([value('startTime'), value('title')]);
  }

  if (template.id === 'timed') {
    return joinTemplateParts([value('startTime'), value('endTime'), value('title')]);
  }

  if (template.id === 'reservation') {
    return joinTemplateParts([value('startTime'), value('endTime'), value('title'), '予約[ ]']);
  }

  return joinTemplateParts([
    value('startTime'),
    value('endTime'),
    joinTemplateRoute(value('from'), value('to')),
    value('service'),
    value('vehicleSeat'),
    '予約[ ]',
  ]);
}

function joinTemplateParts(parts: string[]) {
  return parts.filter(Boolean).join(' ');
}

function joinTemplateRoute(from: string, to: string) {
  if (from && to) {
    return `${from}-${to}`;
  }

  return from || to;
}

function normalizeTemplateValue(value: string | undefined) {
  return value?.trim().replace(/\s+/g, ' ') ?? '';
}
