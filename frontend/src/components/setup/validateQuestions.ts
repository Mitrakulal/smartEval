import type { DraftQuestion } from '../../api/types.ts';

export function validateQuestions(questions: DraftQuestion[]): string[] {
  const errors: string[] = [];

  if (questions.length === 0) {
    errors.push('At least one question must be defined.');
    return errors;
  }

  // Check unique question numbers
  const seenNumbers = new Set<number>();
  const duplicates = new Set<number>();
  for (const q of questions) {
    if (seenNumbers.has(q.number)) {
      duplicates.add(q.number);
    }
    seenNumbers.add(q.number);
  }
  if (duplicates.size > 0) {
    errors.push(`Question numbers must be unique. Duplicate numbers: ${Array.from(duplicates).join(', ')}.`);
  }

  // Check max marks and text
  for (const q of questions) {
    if (q.max_marks <= 0) {
      errors.push(`Q${q.number}: Max marks must be greater than 0.`);
    }
    if (!q.text || q.text.trim() === '') {
      errors.push(`Q${q.number}: Question text cannot be empty.`);
    }
    if (!q.key_points || q.key_points.length === 0) {
      errors.push(`Q${q.number}: Must have at least one key grading point.`);
    } else {
      const emptyPoints = q.key_points.filter((kp) => !kp.text || kp.text.trim() === '');
      if (emptyPoints.length > 0) {
        errors.push(`Q${q.number}: Contains ${emptyPoints.length} empty key point(s).`);
      }
    }
  }

  return errors;
}
