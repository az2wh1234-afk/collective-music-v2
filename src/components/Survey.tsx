import { useState } from 'react';
export type Answers = Record<string, string | string[] | number>;
export type SurveyContext = { metOther: boolean; reached: boolean };
type Q = { id: string; text: string; type: 'multi' | 'single' | 'scale' | 'text'; options?: string[]; other?: boolean;
  show?: (a: Answers, ctx: SurveyContext) => boolean; scaleLabels?: [string, string]; comment?: string; followUp?: { when: string; id: string; text: string } };
const QUESTIONS: Q[] = [
  { id: 'q1', type: 'multi', other: true, text: 'What changes did you notice in the music during the experience?', options: ['Volume changes', 'Changes in tone or brightness', 'Changes in rhythm or instrumentation', 'Additional musical layers appearing', 'No noticeable changes'] },
  { id: 'q2', type: 'multi', other: true, text: 'What do you think influenced the changes in the music?', options: ['My movement speed', 'My location or distance traveled', 'My proximity to another participant', 'The passage of time', "I'm not sure"] },
  { id: 'q3', type: 'scale', text: 'How did the distance to the final destination feel?', scaleLabels: ['Very short', 'Very long'] },
  { id: 'q4', type: 'single', text: 'Compared with your usual experience of walking, how aware were you of your surroundings?', options: ['More aware', 'About the same', 'Less aware', 'Not sure'] },
  { id: 'q5', type: 'single', other: true, text: 'How did the interface affect your experience of moving through the space?', options: ['Helped me navigate or focus', 'Had little effect', 'Distracted me from my surroundings', 'Was confusing'] },
  { id: 'q6', type: 'text', text: 'What did you notice about the light on your screen, and how did you interpret it? (optional)' },
  { id: 'q7', type: 'single', text: 'Were you aware of another participant during the experience?', options: ['Yes', 'No', 'Not sure'], followUp: { when: 'Yes', id: 'q7_when', text: 'When or how did you first become aware of them? (optional)' } },
  { id: 'q8', type: 'text', text: 'If you approached another participant, did anything change in your experience? If so, what? (optional)', show: (a, c) => c.metOther || a.q7 === 'Yes' },
  { id: 'q9', type: 'text', text: 'If you waited at the destination, how would you describe that experience? (optional)', show: (_a, c) => c.reached },
  { id: 'q10', type: 'text', text: 'How do you think the music and light responded to your actions or surroundings? (optional)' },
  { id: 'q11', type: 'text', text: 'What was the most memorable, surprising, or confusing moment of the experience? (optional)' },
  { id: 'q12', type: 'multi', other: true, text: 'Did you experience any technical difficulties?', options: ['Audio problems', 'GPS or navigation problems', 'Interface problems', 'Connection problems', 'No technical problems'], comment: 'Comment (optional)' },
];
export function Survey({ ctx, onSubmit, onSkip }: { ctx: SurveyContext; onSubmit: (a: Answers) => Promise<void> | void; onSkip: () => Promise<void> | void }) {
  const [a, setA] = useState<Answers>({}); const [busy, setBusy] = useState(false);
  const set = (id: string, v: string | string[] | number) => setA(o => ({ ...o, [id]: v }));
  const toggle = (id: string, opt: string) => { const cur = (a[id] as string[] | undefined) ?? []; set(id, cur.includes(opt) ? cur.filter(x => x !== opt) : [...cur, opt]); };
  const go = async (fn: () => Promise<void> | void) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const has = (q: Q, o: string) => q.type === 'multi' ? ((a[q.id] as string[] | undefined) ?? []).includes(o) : a[q.id] === o;
  const pick = (q: Q, o: string) => (q.type === 'multi' ? toggle(q.id, o) : set(q.id, o));
  return (
    <form className="survey" onSubmit={e => e.preventDefault()}>
      <h1>A few questions</h1>
      <p className="muted">About 3–5 minutes. Every question can be left blank. Your answers are anonymous.</p>
      {QUESTIONS.filter(q => !q.show || q.show(a, ctx)).map(q => (
        <fieldset key={q.id}>
          <legend>{q.text}</legend>
          {q.type === 'text' && <textarea rows={3} value={(a[q.id] as string) ?? ''} onChange={e => set(q.id, e.target.value)} />}
          {(q.type === 'multi' || q.type === 'single') && (<>
            {q.options!.map(o => (<label key={o} className="opt"><input type={q.type === 'multi' ? 'checkbox' : 'radio'} name={q.id} checked={has(q, o)} onChange={() => pick(q, o)} /><span>{o}</span></label>))}
            {q.other && (<label className="opt other"><input type={q.type === 'multi' ? 'checkbox' : 'radio'} name={q.id} checked={has(q, 'Other')} onChange={() => pick(q, 'Other')} /><span>Other</span>
              <input type="text" placeholder="Describe (optional)" value={(a[`${q.id}_other`] as string) ?? ''} onChange={e => set(`${q.id}_other`, e.target.value)} /></label>)}
            {q.comment && <textarea rows={2} placeholder={q.comment} value={(a[`${q.id}_comment`] as string) ?? ''} onChange={e => set(`${q.id}_comment`, e.target.value)} />}
            {q.followUp && a[q.id] === q.followUp.when && (<><p className="sub">{q.followUp.text}</p><textarea rows={2} value={(a[q.followUp.id] as string) ?? ''} onChange={e => set(q.followUp!.id, e.target.value)} /></>)}
          </>)}
          {q.type === 'scale' && (<div className="scale">{[1, 2, 3, 4, 5].map(n => (<button type="button" key={n} className={a[q.id] === n ? 'on' : ''} onClick={() => set(q.id, a[q.id] === n ? 0 : n)} aria-pressed={a[q.id] === n}>{n}</button>))}
            <div className="ends"><span>1 — {q.scaleLabels![0]}</span><span>5 — {q.scaleLabels![1]}</span></div></div>)}
        </fieldset>
      ))}
      <div className="row">
        <button type="button" className="solid" disabled={busy} onClick={() => void go(() => onSubmit(Object.fromEntries(Object.entries(a).filter(([, v]) => v !== 0 && v !== '' && !(Array.isArray(v) && !v.length)))))}>Send answers</button>
        <button type="button" disabled={busy} onClick={() => void go(onSkip)}>Skip</button>
      </div>
    </form>
  );
}
