import { useMemo } from 'react';
import { getStartDateSortValue, isPastRunbook } from '../../lib/date';
import type { Runbook } from './types';
import styles from './RunbooksApp.module.css';

type RunbookListPageProps = {
  runbooks: Runbook[];
  onNavigate: (to: string) => void;
};

export function RunbookListPage({ runbooks, onNavigate }: RunbookListPageProps) {
  const { archivedRunbooks, upcomingRunbooks } = useMemo(
    () => splitRunbooks(runbooks),
    [runbooks],
  );

  return (
    <div className={styles.content}>
      <section className={styles.section} aria-labelledby="upcoming-title">
        <div className={styles.sectionHeader}>
          <h3 id="upcoming-title" className={styles.sectionTitle}>
            今後の予定
          </h3>
        </div>
        <RunbookList
          emptyText="左上の＋ボタンから、行動メモを作成しましょう。"
          runbooks={upcomingRunbooks}
          onNavigate={onNavigate}
        />
      </section>

      {archivedRunbooks.length > 0 ? (
        <section className={styles.section} aria-labelledby="archive-title">
          <h3 id="archive-title" className={styles.sectionTitle}>
            アーカイブ
          </h3>
          <RunbookList
            archived
            emptyText="アーカイブはありません。"
            runbooks={archivedRunbooks}
            onNavigate={onNavigate}
          />
        </section>
      ) : null}
    </div>
  );
}

type RunbookListProps = {
  archived?: boolean;
  emptyText: string;
  runbooks: Runbook[];
  onNavigate: (to: string) => void;
};

function RunbookList({ emptyText, runbooks, onNavigate }: RunbookListProps) {
  if (runbooks.length === 0) {
    return <p className={styles.empty}>{emptyText}</p>;
  }

  return (
    <div className={styles.list}>
      {runbooks.map((runbook) => {
        return (
          <article key={runbook.id} className={styles.runbookItem}>
            <button
              className={styles.runbookRowMain}
              type="button"
              onClick={() => onNavigate(`/runbooks/${encodeURIComponent(runbook.id)}`)}
            >
              <span className={styles.runbookTitle}>
                <span className={styles.rowDate}>{createDateLabel(runbook)}</span>
                <span className={styles.rowSeparator} aria-hidden="true" />
                <span>{runbook.title}</span>
              </span>
            </button>
          </article>
        );
      })}
    </div>
  );
}

function splitRunbooks(runbooks: Runbook[]) {
  const upcomingRunbooks = runbooks.filter((runbook) => !runbook.archived && !isPastRunbook(runbook));
  const archivedRunbooks = runbooks
    .filter((runbook) => runbook.archived || isPastRunbook(runbook))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

  return {
    upcomingRunbooks: [...upcomingRunbooks].sort(compareUpcomingRunbooks),
    archivedRunbooks,
  };
}

function compareUpcomingRunbooks(a: Runbook, b: Runbook) {
  const aSortValue = getStartDateSortValue(a);
  const bSortValue = getStartDateSortValue(b);

  return (aSortValue ?? Number.MAX_SAFE_INTEGER) - (bSortValue ?? Number.MAX_SAFE_INTEGER);
}

function createDateLabel(runbook: Runbook) {
  const { startDate } = runbook;
  const startLabel = formatStartDateForRow(runbook);
  const endLabel = createEndLabel(runbook, startDate.year, startDate.month);

  return endLabel ? `${startLabel} - ${endLabel}` : startLabel;
}

function formatStartDateForRow(runbook: Runbook) {
  const { startDate } = runbook;

  if (startDate.precision === 'none' || !startDate.year) {
    return '未定';
  }

  if (startDate.precision === 'year') {
    return `${startDate.year}`;
  }

  if (startDate.precision === 'month' && startDate.month) {
    return `${startDate.year}.${startDate.month}`;
  }

  if (startDate.precision === 'day' && startDate.month && startDate.day) {
    return `${startDate.year}.${startDate.month}.${startDate.day}`;
  }

  return '未定';
}

function createEndLabel(runbook: Runbook, startYear: number | null, startMonth: number | null) {
  const { endDate } = runbook;

  if (endDate.mode === 'none') {
    return '';
  }

  if (endDate.mode === 'unknown') {
    return '終了未定';
  }

  if (endDate.precision === 'year' && endDate.year) {
    return `${endDate.year}`;
  }

  if (endDate.precision === 'month' && endDate.year && endDate.month) {
    return endDate.year === startYear ? `${endDate.month}` : `${endDate.year}.${endDate.month}`;
  }

  if (endDate.precision === 'day' && endDate.year && endDate.month && endDate.day) {
    if (endDate.year === startYear && endDate.month === startMonth) {
      return `${endDate.day}`;
    }

    return endDate.year === startYear
      ? `${endDate.month}.${endDate.day}`
      : `${endDate.year}.${endDate.month}.${endDate.day}`;
  }

  return '終了未定';
}
