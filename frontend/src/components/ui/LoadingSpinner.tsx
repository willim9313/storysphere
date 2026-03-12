import { Loader2 } from 'lucide-react';

export function LoadingSpinner({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center py-12 ${className}`}>
      <Loader2 className="animate-spin" size={24} style={{ color: 'var(--color-accent)' }} />
    </div>
  );
}
