import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { runbookEditorExtensions } from './runbookEditorExtensions';
import type { TextEditorActions } from './TextEditor';
import styles from './RunbooksApp.module.css';

type CodeMirrorTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onActionsChange?: (actions: TextEditorActions | null) => void;
};

export function CodeMirrorTextEditor({ value, onChange, onActionsChange }: CodeMirrorTextEditorProps) {
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const isApplyingExternalValueRef = useRef(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const editorHost = editorHostRef.current;

    if (!editorHost || editorViewRef.current) {
      return;
    }

    const editorView = new EditorView({
      parent: editorHost,
      state: EditorState.create({
        doc: value,
        extensions: runbookEditorExtensions((nextValue) => {
          if (!isApplyingExternalValueRef.current) {
            onChangeRef.current(nextValue);
          }
        }),
      }),
    });

    editorViewRef.current = editorView;

    return () => {
      editorView.destroy();
      editorViewRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!onActionsChange) {
      return;
    }

    const insertText = (text: string) => {
      const editorView = editorViewRef.current;

      if (!editorView) {
        return;
      }

      const selection = editorView.state.selection.main;

      editorView.dispatch({
        changes: {
          from: selection.from,
          to: selection.to,
          insert: text,
        },
        selection: {
          anchor: selection.from + text.length,
        },
        scrollIntoView: true,
      });
      editorView.focus();
    };

    onActionsChange({
      focusLine: (lineNumber) => {
        const editorView = editorViewRef.current;

        if (!editorView) {
          return;
        }

        const line = editorView.state.doc.line(Math.min(Math.max(1, lineNumber), editorView.state.doc.lines));

        editorView.dispatch({
          selection: {
            anchor: line.from,
          },
          scrollIntoView: true,
        });
        editorView.focus();
      },
      insertDateSeparator: () => {
        const editorView = editorViewRef.current;

        if (!editorView) {
          return;
        }

        const selection = editorView.state.selection.main;
        const line = editorView.state.doc.lineAt(selection.from);

        insertText(selection.from === line.from ? '## ' : '\n## ');
      },
      insertText,
    });

    return () => {
      onActionsChange(null);
    };
  }, [onActionsChange]);

  useEffect(() => {
    const editorView = editorViewRef.current;

    if (!editorView) {
      return;
    }

    const currentValue = editorView.state.doc.toString();

    if (value === currentValue) {
      return;
    }

    isApplyingExternalValueRef.current = true;

    try {
      editorView.dispatch({
        changes: {
          from: 0,
          to: currentValue.length,
          insert: value,
        },
      });
    } finally {
      isApplyingExternalValueRef.current = false;
    }
  }, [value]);

  return <div ref={editorHostRef} className={styles.editor} />;
}
