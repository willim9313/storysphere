import { AlertCircle } from 'lucide-react';

export function ErrorMessage({ message }: { message: string }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-lg"
      style={{
        backgroundColor: '#fff1f2',
        color: 'var(--color-error)',
      }}
    >
      <AlertCircle size={18} />
      <span className="text-sm">{message}</span>
    </div>
  );
}
