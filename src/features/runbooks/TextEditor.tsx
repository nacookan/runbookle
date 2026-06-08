import { lazy, Suspense } from 'react';
import styles from './RunbooksApp.module.css';

type TextEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

const LazyCodeMirrorTextEditor = lazy(() =>
  import('./CodeMirrorTextEditor').then((module) => ({
    default: module.CodeMirrorTextEditor,
  })),
);

export function TextEditor(props: TextEditorProps) {
  return (
    <Suspense fallback={<div className={styles.editorFallback}>読み込み中</div>}>
      <LazyCodeMirrorTextEditor {...props} />
    </Suspense>
  );
}
