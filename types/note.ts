/**
 * Note entity used by API, Firestore, and UI.
 * Dates are ISO 8601 strings for simplicity.
 */
export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}
