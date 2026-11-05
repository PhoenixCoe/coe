export type Lang = 'javascript' | 'typescript' | 'json' | 'html' | 'css' | 'python' | 'sql' | 'other';
export type Severity = 'error' | 'warning' | 'tip';

/** Replace lines from..to (1-based, both included) with text. An empty text removes them. */
export interface Fix { from: number; to: number; text: string }

export interface Finding {
  id: string;
  line: number;
  col?: number;
  endLine?: number;
  severity: Severity;
  /** What is wrong, in a few words. */
  title: string;
  /** Why it matters, one short sentence. */
  why?: string;
  /** What to do about it. */
  idea?: string;
  fix?: Fix;
  source: 'local' | 'coe';
}

export const LANGS: { value: Lang; label: string }[] = [
  { value: 'javascript', label: 'JavaScript' }, { value: 'typescript', label: 'TypeScript' }, { value: 'json', label: 'JSON' },
  { value: 'html', label: 'HTML' }, { value: 'css', label: 'CSS' }, { value: 'python', label: 'Python' }, { value: 'sql', label: 'SQL' }, { value: 'other', label: 'Other' },
];
export const langName = (l: Lang) => LANGS.find((x) => x.value === l)?.label ?? 'Code';
