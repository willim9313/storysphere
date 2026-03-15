import { MOCK_ENABLED } from './mock';
import { apiFetch, apiDelete } from './client';
import * as mock from './mock/mockClient';
import type { Book, BookDetail } from './types';

export function fetchBooks(): Promise<Book[]> {
  if (MOCK_ENABLED) return mock.fetchBooks();
  return apiFetch<Book[]>('/books');
}

export function fetchBook(bookId: string): Promise<BookDetail> {
  if (MOCK_ENABLED) return mock.fetchBook(bookId);
  return apiFetch<BookDetail>(`/books/${bookId}`);
}

export function deleteBook(bookId: string): Promise<void> {
  if (MOCK_ENABLED) return mock.deleteBook(bookId);
  return apiDelete(`/books/${bookId}`);
}
