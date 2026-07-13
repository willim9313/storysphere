import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function EmptyLibrary() {
  const { t } = useTranslation('library');
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center h-full">
      <BookOpen size={48} style={{ color: 'var(--fg-muted)' }} />
      <h2
        className="mt-4 text-xl font-semibold"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        {t('empty.title')}
      </h2>
      {/* Empty-state caption — 設計 contract 指定的 Caveat 手寫語彙落點
          （--font-hand 僅限插畫時刻，不進 chrome 與正文） */}
      <p
        className="mt-2"
        style={{
          fontFamily: 'var(--font-hand)',
          fontSize: 'var(--font-size-xl)',
          color: 'var(--fg-secondary)',
        }}
      >
        {t('empty.description')}
      </p>
      <Link to="/upload" className="btn btn-primary mt-6">
        {t('uploadNew')}
      </Link>
    </div>
  );
}
