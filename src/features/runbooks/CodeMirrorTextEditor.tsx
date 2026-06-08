import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { runbookEditorExtensions } from './runbookEditorExtensions';
import styles from './RunbooksApp.module.css';

type CodeMirrorTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

export function CodeMirrorTextEditor({ value, onChange }: CodeMirrorTextEditorProps) {
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
