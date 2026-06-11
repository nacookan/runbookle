import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  Brackets,
  Check,
  ChevronLeft,
  ClipboardList,
  Copy,
  Info,
  Search,
  SearchCheck,
  SearchX,
  SmilePlus,
  X,
} from 'lucide-react';
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
  onInsertDateSeparator?: () => void;
  onInsertText?: (text: string) => void;
  onShowValidation?: () => void;
  validationSummary?: EditorValidationSummary;
};

export type EditorValidationSummary = {
  errorCount: number;
  warningCount: number;
  infoCount: number;
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

export function EditorToolbar({ onInsertDateSeparator, onInsertText, onShowValidation, validationSummary }: EditorToolbarProps) {
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isNotationGuideOpen, setIsNotationGuideOpen] = useState(false);
  const [notationGuideStyle, setNotationGuideStyle] = useState<CSSProperties>({ visibility: 'hidden' });
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const notationGuideRef = useRef<HTMLDivElement | null>(null);
  const notationGuideButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isEmojiPickerOpen && !isNotationGuideOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && emojiPickerRef.current?.contains(event.target)) {
        return;
      }

      if (event.target instanceof Node && notationGuideRef.current?.contains(event.target)) {
        return;
      }

      setIsEmojiPickerOpen(false);
      setIsNotationGuideOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isEmojiPickerOpen, isNotationGuideOpen]);

  useLayoutEffect(() => {
    if (!isNotationGuideOpen) {
      setNotationGuideStyle({ visibility: 'hidden' });
      return;
    }

    const updateNotationGuidePosition = () => {
      const button = notationGuideButtonRef.current;

      if (!button) {
        return;
      }

      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const margin = 18;
      const width = Math.min(320, Math.max(0, viewportWidth - margin * 2));
      const buttonRect = button.getBoundingClientRect();
      const minLeft = viewportLeft + margin;
      const maxLeft = viewportLeft + viewportWidth - width - margin;
      const preferredLeft = buttonRect.left;
      const left = Math.max(minLeft, Math.min(preferredLeft, maxLeft));

      setNotationGuideStyle({
        left,
        top: buttonRect.bottom + 8,
        visibility: 'visible',
        width,
      });
    };

    updateNotationGuidePosition();
    window.addEventListener('resize', updateNotationGuidePosition);
    window.addEventListener('scroll', updateNotationGuidePosition, true);
    window.visualViewport?.addEventListener('resize', updateNotationGuidePosition);
    window.visualViewport?.addEventListener('scroll', updateNotationGuidePosition);

    return () => {
      window.removeEventListener('resize', updateNotationGuidePosition);
      window.removeEventListener('scroll', updateNotationGuidePosition, true);
      window.visualViewport?.removeEventListener('resize', updateNotationGuidePosition);
      window.visualViewport?.removeEventListener('scroll', updateNotationGuidePosition);
    };
  }, [isNotationGuideOpen]);

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
              setIsNotationGuideOpen(false);
              setIsEmojiPickerOpen((current) => !current);
            }}
          >
            <SmilePlus aria-hidden="true" size={16} />
            <span className={styles.editorToolbarButtonLabel}>絵文字</span>
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
            setIsNotationGuideOpen(false);
            setIsTemplateDialogOpen(true);
          }}
        >
          <ClipboardList aria-hidden="true" size={16} />
          <span className={styles.editorToolbarButtonLabel}>テンプレ</span>
        </button>

        <div className={styles.notationGuideWrap} ref={notationGuideRef}>
          <button
            ref={notationGuideButtonRef}
            className={styles.editorToolbarButton}
            type="button"
            aria-expanded={isNotationGuideOpen}
            aria-haspopup="true"
            disabled={!onInsertText || !onInsertDateSeparator}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setIsEmojiPickerOpen(false);
              setIsTemplateDialogOpen(false);
              setIsNotationGuideOpen((current) => !current);
            }}
          >
            <Brackets aria-hidden="true" size={16} />
            <span className={styles.editorToolbarButtonLabel}>記法</span>
          </button>
          {isNotationGuideOpen ? (
            <div className={styles.notationGuide} style={notationGuideStyle} role="menu" aria-label="記法ガイド">
              <NotationGuideItem
                description="検証で、この区切り内の時刻順を見ます。"
                label="## 日付区切り"
                onInsert={() => {
                  onInsertDateSeparator?.();
                  setIsNotationGuideOpen(false);
                }}
              />
              <NotationGuideItem
                description="クリックでON/OFFできます。未チェックは検証に出ます。"
                label="[ ] チェック"
                onInsert={() => {
                  onInsertText?.('[ ]');
                  setIsNotationGuideOpen(false);
                }}
              />
            </div>
          ) : null}
        </div>

        {onShowValidation && validationSummary ? (
          <button
            className={`${styles.editorToolbarButton} ${styles.editorToolbarButtonEnd}`}
            type="button"
            onClick={() => {
              setIsEmojiPickerOpen(false);
              setIsTemplateDialogOpen(false);
              setIsNotationGuideOpen(false);
              onShowValidation();
            }}
          >
            <ValidationStatusIcon summary={validationSummary} />
            <span className={styles.editorToolbarButtonLabel}>検証</span>
          </button>
        ) : null}
      </div>

      {isTemplateDialogOpen ? <TemplateDialog onClose={() => setIsTemplateDialogOpen(false)} /> : null}
    </>
  );
}

function NotationGuideItem({
  description,
  label,
  onInsert,
}: {
  description: string;
  label: string;
  onInsert: () => void;
}) {
  return (
    <div className={styles.notationGuideItem}>
      <div className={styles.notationGuideText}>
        <span className={styles.notationGuideTitle}>{label}</span>
        <span className={styles.notationGuideDescription}>{description}</span>
      </div>
      <button
        className={styles.notationInsertButton}
        type="button"
        role="menuitem"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onInsert}
      >
        挿入
      </button>
    </div>
  );
}

function ValidationStatusIcon({ summary }: { summary: EditorValidationSummary }) {
  if (summary.errorCount > 0) {
    return <SearchX className={`${styles.checkIcon} ${styles.checkIconError}`} aria-hidden="true" size={16} />;
  }

  if (summary.warningCount > 0) {
    return <Search className={`${styles.checkIcon} ${styles.checkIconWarning}`} aria-hidden="true" size={16} />;
  }

  if (summary.infoCount > 0) {
    return <Info className={`${styles.checkIcon} ${styles.checkIconInfo}`} aria-hidden="true" size={16} />;
  }

  return <SearchCheck className={`${styles.checkIcon} ${styles.checkIconOk}`} aria-hidden="true" size={16} />;
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
