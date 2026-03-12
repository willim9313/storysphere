import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

export function AnalysisTrigger({ bookId }: { bookId: string }) {
  return (
    <Link
      to={`/books/${bookId}/analysis`}
      className="btn btn-secondary mt-4"
    >
      <Sparkles size={16} />
      Deep Analysis
    </Link>
  );
}
