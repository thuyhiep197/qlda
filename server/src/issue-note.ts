import { badRequest } from './permissions.ts';

export const ISSUE_NOTE_MAX_LENGTH = 100;

export function checkIssueNote(value: unknown): string | null {
  const note = String(value ?? '').trim();
  if (note.length > ISSUE_NOTE_MAX_LENGTH) throw badRequest(`Ghi chú tối đa ${ISSUE_NOTE_MAX_LENGTH} ký tự`);
  return note || null;
}
