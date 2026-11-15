import type { DraftQuestion } from '../../api/types.ts';

export function validateQuestions(questions: DraftQuestion[]): string[] {
  const errors: string[] = [];

  if (questions.length === 0) {
    errors.push('At least one question must be defined.');
    return errors;
  }

  // Check unique question numbers
  const seenNumbers = new Set<string>();
  const duplicates = new Set<string>();
  for (const q of questions) {
    const number = q.number.trim();
    if (number === '') {
      continue;
    }
    if (seenNumbers.has(number)) {
      duplicates.add(number);
    }
    seenNumbers.add(number);
  }
  if (duplicates.size > 0) {
    errors.push(`Question numbers must be unique. Duplicate numbers: ${Array.from(duplicates).join(', ')}.`);
  }
  if (questions.some((q) => q.number.trim() === '')) {
    errors.push('Every question must have a number, for example 1a or 2b.');
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
