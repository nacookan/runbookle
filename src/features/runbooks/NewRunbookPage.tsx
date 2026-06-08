import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { generateInitialRunbookText } from '../../lib/date';
import { completeEndDateInput, completeStartDateInput } from './dateCompletion';
import { createEmptyRunbookDraft } from './model';
import { DateRangeFields } from './RunbookDateFields';
import type { RunbookDraft } from './types';
import styles from './RunbooksApp.module.css';

type NewRunbookPageProps = {
  onCreate: (draft: RunbookDraft) => string;
  onNavigate: (to: string) => void;
};

export function NewRunbookPage({ onCreate, onNavigate }: NewRunbookPageProps) {
  const [draft, setDraft] = useState<RunbookDraft>(createEmptyRunbookDraft);

  const handleCreate = () => {
    const completedDraft = {
      ...draft,
      startDate: completeStartDateInput(draft.startDate),
      endDate: completeEndDateInput(draft.endDate),
    };
    const initialText = generateInitialRunbookText(completedDraft.startDate, completedDraft.endDate);
    const id = onCreate({
      ...completedDraft,
      text: completedDraft.text.trim() ? completedDraft.text : initialText,
    });

    onNavigate(`/runbooks/${encodeURIComponent(id)}`);
  };

  return (
    <section className={styles.content} aria-label="新規作成">
      <div className={styles.form}>
        <DateRangeFields
          startDate={draft.startDate}
          endDate={draft.endDate}
          onStartDateChange={(startDate) => setDraft((current) => ({ ...current, startDate }))}
          onEndDateChange={(endDate) => setDraft((current) => ({ ...current, endDate }))}
        />

        <label className={styles.field}>
          <input
            aria-label="タイトル"
            className={styles.input}
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            placeholder="タイトル"
          />
        </label>

        <div className={styles.buttonRow}>
          <Button type="button" onClick={handleCreate}>
            <Check aria-hidden="true" />
            作成
          </Button>
        </div>
      </div>
    </section>
  );
}
