import { apiFetch, apiDelete } from './client';
import type { Book, BookDetail } from './types';

export function fetchBooks(): Promise<Book[]> {
  return apiFetch<Book[]>('/books');
}

export function fetchBook(bookId: string): Promise<BookDetail> {
  return apiFetch<BookDetail>(`/books/${bookId}`);
}

export function deleteBook(bookId: string): Promise<void> {
  return apiDelete(`/books/${bookId}`);
}
