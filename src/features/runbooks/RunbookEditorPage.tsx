import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { completeEndDateInput, completeStartDateInput } from './dateCompletion';
import { DateRangeFields } from './RunbookDateFields';
import { TextEditor } from './TextEditor';
import type { Runbook, RunbookEndDate, RunbookStartDate } from './types';
import styles from './RunbooksApp.module.css';

type RunbookEditorPageProps = {
  id: string;
  runbooks: Runbook[];
  updateRunbook: (id: string, updater: (runbook: Runbook) => Runbook) => void;
  onNavigate: (to: string) => void;
};

export function RunbookEditorPage({
  id,
  runbooks,
  updateRunbook,
  onNavigate,
}: RunbookEditorPageProps) {
  const runbook = runbooks.find((item) => item.id === id);
  const [dateInputs, setDateInputs] = useState<RunbookDateInputs>({
    endDate: null,
    runbookId: null,
    startDate: null,
  });
  const [editorText, setEditorText] = useState<{ runbookId: string | null; value: string }>({
    runbookId: null,
    value: '',
  });

  useEffect(() => {
    if (!runbook) {
      return;
    }

    setDateInputs((current) =>
      current.runbookId === runbook.id
        ? current
        : {
            endDate: runbook.endDate,
            runbookId: runbook.id,
            startDate: runbook.startDate,
          },
    );

    setEditorText((current) =>
      current.runbookId === runbook.id
        ? current
        : {
            runbookId: runbook.id,
            value: joinTitleAndText(runbook),
          },
    );
  }, [runbook]);

  if (!runbook) {
    return (
      <section className={styles.content}>
        <h2 className={styles.pageTitle}>Runbookが見つかりません</h2>
        <Button type="button" onClick={() => onNavigate('/')}>
          一覧へ戻る
        </Button>
      </section>
    );
  }

  const editorValue = editorText.runbookId === runbook.id ? editorText.value : joinTitleAndText(runbook);
  const startDateInput = dateInputs.runbookId === runbook.id && dateInputs.startDate ? dateInputs.startDate : runbook.startDate;
  const endDateInput = dateInputs.runbookId === runbook.id && dateInputs.endDate ? dateInputs.endDate : runbook.endDate;

  return (
    <section className={styles.content} aria-label="編集">
      <div className={styles.form}>
        <DateRangeFields
          startDate={startDateInput}
          endDate={endDateInput}
          onStartDateChange={(startDate) => {
            setDateInputs((current) => ({
              endDate: current.runbookId === runbook.id && current.endDate ? current.endDate : runbook.endDate,
              runbookId: runbook.id,
              startDate,
            }));
            updateRunbook(runbook.id, (current) => ({
              ...current,
              startDate: completeStartDateInput(startDate),
            }));
          }}
          onEndDateChange={(endDate) => {
            setDateInputs((current) => ({
              endDate,
              runbookId: runbook.id,
              startDate: current.runbookId === runbook.id && current.startDate ? current.startDate : runbook.startDate,
            }));
            updateRunbook(runbook.id, (current) => ({
              ...current,
              endDate: completeEndDateInput(endDate),
            }));
          }}
        />

        <div className={styles.field}>
          <TextEditor
            value={editorValue}
            onChange={(value) => {
              setEditorText({
                runbookId: runbook.id,
                value,
              });

              const nextText = splitTitleAndText(value);

              updateRunbook(runbook.id, (current) => ({
                ...current,
                title: nextText.title,
                text: nextText.text,
              }));
            }}
          />
        </div>
      </div>
    </section>
  );
}

type RunbookDateInputs = {
  endDate: RunbookEndDate | null;
  runbookId: string | null;
  startDate: RunbookStartDate | null;
};

function joinTitleAndText(runbook: Runbook) {
  return runbook.text ? `${runbook.title}\n${runbook.text}` : runbook.title;
}

function splitTitleAndText(value: string) {
  const normalizedValue = value.replace(/\r\n?/g, '\n');
  const newlineIndex = normalizedValue.indexOf('\n');

  if (newlineIndex === -1) {
    return {
      title: normalizedValue,
      text: '',
    };
  }

  return {
    title: normalizedValue.slice(0, newlineIndex),
    text: normalizedValue.slice(newlineIndex + 1),
  };
}
