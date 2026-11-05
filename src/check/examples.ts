import type { Lang } from './types';

export const EXAMPLES: { lang: Lang; label: string; code: string }[] = [
  { lang: 'javascript', label: 'JavaScript', code: `function average(numbers) {
  let total = 0;
  for (let i = 0; i <= numbers.length; i++) {
    total += numbers[i];
  }
  return total / numbers.lenght;
}

const scores = [90, 82, 77];
if (scores.length = 3) {
  console.log(average(scores));
}
` },
  { lang: 'python', label: 'Python', code: `def greet(name)
    print("Hello " + name)

scores = [10, 20, 30]
total = 0
for s in scores:
total += s
print(total / len(scores))
` },
  { lang: 'sql', label: 'SQL', code: `SELECT name, age,
FROM students
WHERE grade = NULL
ORDER BY age;

UPDATE students SET grade = 'A';
` },
  { lang: 'css', label: 'CSS', code: `.card {
  colour: red;
  width: 300;
  display: flx;
  margin: 0 auto
  padding: 12px;
}
` },
  { lang: 'html', label: 'HTML', code: `<ul class="menu">
  <li>Home
  <li><a>About</a>
</ul>
<img src="logo.png">
<div id="top"><span>Hi</div>
` },
];

const BY_EXT: Record<string, Lang> = { js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', json: 'json', html: 'html', htm: 'html', css: 'css', py: 'python', sql: 'sql' };
export const langFromName = (name: string): Lang | null => BY_EXT[name.split('.').pop()?.toLowerCase() ?? ''] ?? null;
