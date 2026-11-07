/** Pure survey-validation helpers (no React) so they can be tested on their own. */
export type AnswerValue = string | string[] | number;
export type AnswerMap = Record<string, AnswerValue>;
export type QuestionKind = 'multi' | 'single' | 'scale' | 'text';
export type ValidatableQuestion = { id: string; type: QuestionKind; text: string };

/** A question is optional only if its text is explicitly marked "(optional)". Everything else is required. */
export const isRequiredQuestion = (text: string): boolean => !/\(optional\)/i.test(text);

/** True when the stored value is a valid answer for that kind of question. */
export function isAnswered(type: QuestionKind, v: AnswerValue | undefined): boolean {
  switch (type) {
    case 'multi': return Array.isArray(v) && v.length > 0;
    case 'scale': return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5; // 0 = cleared
    case 'single':
    case 'text': return typeof v === 'string' && v.trim() !== '';
  }
}

/** Ids of required questions (among the ones currently visible) that still have no valid answer, in display order. */
export function missingRequired(visible: ValidatableQuestion[], answers: AnswerMap): string[] {
  return visible.filter(q => isRequiredQuestion(q.text) && !isAnswered(q.type, answers[q.id])).map(q => q.id);
}
