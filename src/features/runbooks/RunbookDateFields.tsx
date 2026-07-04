import type { DateParts } from '../../lib/date';
import {
  completeStartDateInput,
  formatDateInputPlaceholder,
  formatWeekday,
  previewNearestUpcomingDate,
  startDateReferenceParts,
  type DateFieldValue,
} from './dateCompletion';
import type { RunbookEndDate, RunbookStartDate } from './types';
import styles from './RunbooksApp.module.css';

type DateFieldName = 'year' | 'month' | 'day';

type DateRangeFieldsProps = {
  startDate: RunbookStartDate;
  endDate: RunbookEndDate;
  onStartDateChange: (value: RunbookStartDate) => void;
  onEndDateChange: (value: RunbookEndDate) => void;
};

export function DateRangeFields({
  endDate,
  onEndDateChange,
  onStartDateChange,
  startDate,
}: DateRangeFieldsProps) {
  const endDateValue: DateFieldValue = {
    year: endDate.mode === 'date' ? endDate.year : null,
    month: endDate.mode === 'date' ? endDate.month : null,
    day: endDate.mode === 'date' ? endDate.day : null,
  };
  const endReferenceDate = startDateReferenceParts(completeStartDateInput(startDate));

  return (
    <fieldset className={`${styles.field} ${styles.dateRangeField}`}>
      <legend className={styles.visuallyHidden}>日程</legend>
      <div className={styles.dateRangeRows}>
        <DateInputs
          value={startDate}
          labelPrefix="開始"
          onChange={(value) => onStartDateChange(createStartDate(value))}
        />
        <DateInputs
          value={endDateValue}
          labelPrefix="終了"
          referenceDate={endReferenceDate}
          onChange={(value) => onEndDateChange(createEndDate(value))}
        />
      </div>
    </fieldset>
  );
}

type DateInputsProps = {
  labelPrefix: string;
  value: DateFieldValue;
  referenceDate?: DateParts;
  onChange: (value: DateFieldValue) => void;
};

function DateInputs({ labelPrefix, value, referenceDate, onChange }: DateInputsProps) {
  const previewValue = previewNearestUpcomingDate(value, referenceDate);
  const weekday = formatWeekday(previewValue);
  const handleChange = (field: DateFieldName, nextFieldValue: number | null) => {
    onChange({ ...value, [field]: nextFieldValue });
  };

  return (
    <div className={styles.dateInputGroup}>
      <span className={styles.dateGroupLabel}>{labelPrefix}</span>
      <NumberInput
        ariaLabel={`${labelPrefix}年`}
        placeholder={formatDateInputPlaceholder('年', value.year, previewValue.year)}
        value={value.year}
        onChange={(year) => handleChange('year', year)}
      />
      <NumberInput
        ariaLabel={`${labelPrefix}月`}
        placeholder={formatDateInputPlaceholder('月', value.month, previewValue.month)}
        value={value.month}
        onChange={(month) => handleChange('month', month)}
      />
      <NumberInput
        ariaLabel={`${labelPrefix}日`}
        placeholder={formatDateInputPlaceholder('日', value.day, previewValue.day)}
        value={value.day}
        onChange={(day) => handleChange('day', day)}
      />
      <input
        aria-label={`${labelPrefix}曜日`}
        className={`${styles.input} ${styles.weekdayInput} ${styles.dateSegmentInput}`}
        readOnly
        tabIndex={-1}
        type="text"
        value={weekday}
      />
    </div>
  );
}

type NumberInputProps = {
  ariaLabel: string;
  placeholder: string;
  value: number | null;
  onChange: (value: number | null) => void;
};

function NumberInput({ ariaLabel, placeholder, value, onChange }: NumberInputProps) {
  return (
    <input
      aria-label={ariaLabel}
      autoCapitalize="off"
      autoComplete="off"
      autoCorrect="off"
      className={`${styles.input} ${styles.dateSegmentInput}`}
      inputMode="numeric"
      pattern="[0-9]*"
      placeholder={placeholder}
      spellCheck={false}
      type="text"
      value={value ?? ''}
      onChange={(event) => onChange(parseNullableNumber(event.target.value))}
    />
  );
}

function createStartDate(value: DateFieldValue): RunbookStartDate {
  if (value.day !== null) {
    return { ...value, precision: 'day' };
  }

  if (value.month !== null) {
    return { ...value, precision: 'month' };
  }

  if (value.year !== null) {
    return { ...value, precision: 'year' };
  }

  return { ...value, precision: 'none' };
}

function createEndDate(value: DateFieldValue): RunbookEndDate {
  if (value.day !== null) {
    return { mode: 'date', ...value, precision: 'day' };
  }

  if (value.month !== null) {
    return { mode: 'date', ...value, precision: 'month' };
  }

  if (value.year !== null) {
    return { mode: 'date', ...value, precision: 'year' };
  }

  return {
    mode: 'none',
    year: null,
    month: null,
    day: null,
    precision: null,
  };
}

function parseNullableNumber(value: string) {
  const normalizedValue = value.replace(/[^\d]/g, '');

  return normalizedValue ? Number(normalizedValue) : null;
}
