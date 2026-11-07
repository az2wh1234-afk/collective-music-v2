// Survey validation checks. Run: npx tsx tests/survey.test.ts
import { readFileSync } from 'node:fs';
import { isAnswered, isRequiredQuestion, missingRequired, type QuestionKind } from '../src/lib/surveyValidation';
let fails = 0;
const ok = (name: string, cond: boolean, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

// 1. Read the real question list out of Survey.tsx so the test follows the actual file.
const src = readFileSync(new URL('../src/components/Survey.tsx', import.meta.url), 'utf8');
const qs = [...src.matchAll(/\{ id: '(q\d+)', type: '(multi|single|scale|text)'.*?text: '([^']*)'/g)].map(m => ({ id: m[1], type: m[2] as QuestionKind, text: m[3] }));
ok('found all 12 questions in Survey.tsx', qs.length === 12, `(${qs.length})`);
const required = qs.filter(q => isRequiredQuestion(q.text)).map(q => q.id);
ok('required = q1 q2 q3 q4 q5 q7 q12', JSON.stringify(required) === JSON.stringify(['q1', 'q2', 'q3', 'q4', 'q5', 'q7', 'q12']), required.join(' '));
ok('optional = q6 q8 q9 q10 q11', JSON.stringify(qs.filter(q => !isRequiredQuestion(q.text)).map(q => q.id)) === JSON.stringify(['q6', 'q8', 'q9', 'q10', 'q11']));

// 2. Nothing answered -> all visible required questions missing (q8/q9 hidden here, and they are optional anyway)
const visible = qs.filter(q => q.id !== 'q8' && q.id !== 'q9');
ok('empty form: 7 required missing', missingRequired(visible, {}).length === 7);

// 3. Per-type answer rules
ok('multi: empty array invalid', !isAnswered('multi', []));
ok('multi: one option valid', isAnswered('multi', ['Volume changes']));
ok('multi: "Other" alone is valid (description is optional)', isAnswered('multi', ['Other']));
ok('single: empty string invalid', !isAnswered('single', ''));
ok('single: whitespace invalid', !isAnswered('single', '   '));
ok('single: option valid', isAnswered('single', 'Yes'));
ok('scale: 0 (cleared) invalid', !isAnswered('scale', 0));
ok('scale: undefined invalid', !isAnswered('scale', undefined));
ok('scale: 1..5 valid', [1, 2, 3, 4, 5].every(n => isAnswered('scale', n)));
ok('scale: 6 invalid', !isAnswered('scale', 6));

// 4. Fully answered -> nothing missing, with every optional question left blank
const full = { q1: ['No noticeable changes'], q2: ["I'm not sure"], q3: 3, q4: 'About the same', q5: 'Other', q7: 'No', q12: ['No technical problems'] };
ok('all required answered, optionals blank: valid', missingRequired(visible, full).length === 0);
ok('un-selecting the only option makes it invalid again', JSON.stringify(missingRequired(visible, { ...full, q1: [] })) === JSON.stringify(['q1']));
ok('clearing the scale makes q3 missing', JSON.stringify(missingRequired(visible, { ...full, q3: 0 })) === JSON.stringify(['q3']));
ok('missing ids keep display order', JSON.stringify(missingRequired(visible, { q4: 'More aware' })) === JSON.stringify(['q1', 'q2', 'q3', 'q5', 'q7', 'q12']));
ok('optional text left empty never blocks', missingRequired(visible, { ...full, q6: '', q10: '' }).length === 0);
ok('"(optional)" marker is case-insensitive', !isRequiredQuestion('Something? (Optional)'));
console.log(fails ? `\n${fails} FAILED` : '\nAll survey checks passed'); process.exit(fails ? 1 : 0);
