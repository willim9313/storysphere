import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteBook } from '@/api/books';
import { qk } from '@/api/queryKeys';

export function useDeleteBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bookId: string) => deleteBook(bookId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.books });
    },
  });
}
