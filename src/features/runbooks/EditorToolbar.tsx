import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ClipboardList, Copy, SmilePlus, X } from 'lucide-react';
import {
  buildRunbookTemplateLine,
  createTemplateInitialValues,
  RUNBOOK_TEMPLATES,
  type RunbookTemplate,
  type RunbookTemplateFieldName,
  type RunbookTemplateValues,
} from './templates';
import styles from './RunbooksApp.module.css';

type CopyStatus = 'idle' | 'copied' | 'error';
type TemplateDialogStep = 'select' | 'fill';

type EditorToolbarProps = {
  onInsertText?: (text: string) => void;
};

const EMOJI_CHOICES = [
  { emoji: '⭐️', label: '重要' },
  { emoji: '📍', label: '場所' },
  { emoji: '🚕', label: 'タクシー' },
  { emoji: '🚌', label: 'バス' },
  { emoji: '🚃', label: '電車' },
  { emoji: '🚢', label: '船' },
  { emoji: '✈️', label: '飛行機' },
  { emoji: '🏨', label: '宿泊' },
  { emoji: '🍙', label: '食事' },
  { emoji: '🍸', label: '飲食' },
  { emoji: '🛒', label: '買い物' },
  { emoji: '🏯', label: '観光' },
  { emoji: '🗻', label: '山' },
  { emoji: '📸', label: '写真' },
  { emoji: '✏️', label: 'メモ' },
  { emoji: '🎡', label: '遊び' },
] as const;

export function EditorToolbar({ onInsertText }: EditorToolbarProps) {
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isEmojiPickerOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && emojiPickerRef.current?.contains(event.target)) {
        return;
      }

      setIsEmojiPickerOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isEmojiPickerOpen]);

  return (
    <>
      <div className={styles.editorToolbar} aria-label="入力補助">
        <div className={styles.emojiPickerWrap} ref={emojiPickerRef}>
          <button
            className={styles.editorToolbarButton}
            type="button"
            aria-expanded={isEmojiPickerOpen}
            aria-haspopup="true"
            disabled={!onInsertText}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setIsTemplateDialogOpen(false);
              setIsEmojiPickerOpen((current) => !current);
            }}
          >
            <SmilePlus aria-hidden="true" size={16} />
            絵文字
          </button>
          {isEmojiPickerOpen ? (
            <div className={styles.emojiPicker} role="menu" aria-label="絵文字">
              {EMOJI_CHOICES.map((choice) => (
                <button
                  key={choice.label}
                  className={styles.emojiChoice}
                  type="button"
                  role="menuitem"
                  aria-label={`${choice.label} ${choice.emoji}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onInsertText?.(choice.emoji);
                    setIsEmojiPickerOpen(false);
                  }}
                >
                  <span aria-hidden="true">{choice.emoji}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button
          className={styles.editorToolbarButton}
          type="button"
          onClick={() => {
            setIsEmojiPickerOpen(false);
            setIsTemplateDialogOpen(true);
          }}
        >
          <ClipboardList aria-hidden="true" size={16} />
          テンプレート
        </button>
      </div>

      {isTemplateDialogOpen ? <TemplateDialog onClose={() => setIsTemplateDialogOpen(false)} /> : null}
    </>
  );
}

function TemplateDialog({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<TemplateDialogStep>('select');
  const [selectedTemplateId, setSelectedTemplateId] = useState<RunbookTemplate['id'] | null>(null);
  const selectedTemplate = selectedTemplateId
    ? (RUNBOOK_TEMPLATES.find((template) => template.id === selectedTemplateId) ?? null)
    : null;
  const [values, setValues] = useState<RunbookTemplateValues>({});
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const preview = useMemo(() => (selectedTemplate ? buildRunbookTemplateLine(selectedTemplate, values) : ''), [selectedTemplate, values]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const selectTemplate = (template: RunbookTemplate) => {
    setSelectedTemplateId(template.id);
    setValues(createTemplateInitialValues(template));
    setCopyStatus('idle');
    setStep('fill');
  };

  const returnToTemplateList = () => {
    setStep('select');
    setCopyStatus('idle');
  };

  const updateValue = (name: RunbookTemplateFieldName, value: string) => {
    setValues((current) => ({
      ...current,
      [name]: value,
    }));
    setCopyStatus('idle');
  };

  const copyPreview = async () => {
    if (!navigator.clipboard) {
      setCopyStatus('error');
      return;
    }

    try {
      await navigator.clipboard.writeText(preview);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
  };

  return (
    <div className={`${styles.dialogBackdrop} ${styles.templateDialogBackdrop}`} role="presentation" onClick={onClose}>
      <section
        className={`${styles.dialog} ${styles.templateDialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.templateDialogHeader}>
          {step === 'fill' ? (
            <button className={styles.templateHeaderButton} type="button" aria-label="テンプレート選択に戻る" onClick={returnToTemplateList}>
              <ChevronLeft aria-hidden="true" size={21} />
            </button>
          ) : (
            <span className={styles.templateHeaderSpacer} aria-hidden="true" />
          )}
          <h2 id="template-dialog-title" className={`${styles.dialogTitle} ${styles.templateDialogTitle}`}>
            {step === 'fill' && selectedTemplate ? selectedTemplate.label : 'テンプレート'}
          </h2>
          <button className={styles.templateHeaderButton} type="button" aria-label="閉じる" onClick={onClose}>
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        {step === 'select' ? (
          <div className={styles.templatePicker} aria-label="テンプレート種別">
            {RUNBOOK_TEMPLATES.map((template) => (
              <button key={template.id} className={styles.templateChoice} type="button" onClick={() => selectTemplate(template)}>
                <span className={styles.templateChoiceTitle}>{template.label}</span>
                <span className={styles.templateChoiceSample}>{template.sample}</span>
              </button>
            ))}
          </div>
        ) : null}

        {step === 'fill' && selectedTemplate ? (
          <form
            className={styles.templateForm}
            onSubmit={(event) => {
              event.preventDefault();
              void copyPreview();
            }}
          >
            <div className={styles.templateFields}>
              {selectedTemplate.fields.map((field, index) => (
                <label key={field.name} className={`${styles.templateField} ${field.wide ? styles.templateFieldWide : ''}`}>
                  <span className={styles.visuallyHidden}>{field.label}</span>
                  <input
                    className={styles.templateInput}
                    inputMode={field.numeric ? 'numeric' : undefined}
                    pattern={field.numeric ? '[0-9:]*' : undefined}
                    placeholder={field.label}
                    type="text"
                    value={values[field.name] ?? ''}
                    autoFocus={index === 0}
                    onChange={(event) => updateValue(field.name, event.target.value)}
                  />
                </label>
              ))}
            </div>

            <label className={styles.templatePreviewField}>
              <span className={styles.visuallyHidden}>コピーされる内容</span>
              <textarea className={styles.templatePreview} aria-label="コピーされる内容" placeholder="コピーされる内容" readOnly rows={2} value={preview} />
            </label>

            <div className={styles.templateActions}>
              <p className={`${styles.templateStatus} ${copyStatus === 'error' ? styles.templateStatusError : ''}`} role="status">
                {copyStatus === 'copied' ? 'コピーしました。本文の好きな位置に貼り付けてください。' : null}
                {copyStatus === 'error' ? 'コピーできませんでした。プレビューを選択してコピーしてください。' : null}
              </p>
              <button className={styles.dialogButton} type="submit">
                {copyStatus === 'copied' ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
                コピー
              </button>
            </div>
          </form>
        ) : null}
      </section>
    </div>
  );
}
