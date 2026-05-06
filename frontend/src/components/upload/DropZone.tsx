import { useCallback, useState, type DragEvent, type ChangeEvent } from 'react';
import { Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const MAX_FILE_MB = 50;

interface DropZoneProps {
  readonly onFileSelected: (file: File) => void;
}

export function DropZone({ onFileSelected }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation('upload');

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith('.pdf') || file.type !== 'application/pdf') {
        setError(t('dropzone.errorNotPdf'));
        return;
      }
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        setError(t('dropzone.errorTooLarge', { max: MAX_FILE_MB }));
        return;
      }
      setError(null);
      onFileSelected(file);
    },
    [onFileSelected, t],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files.length > 1) {
        setError(t('dropzone.errorOneFileOnly'));
        return;
      }
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile, t],
  );

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const borderColor = error ? 'var(--color-error)' : dragging ? 'var(--accent)' : 'var(--border)';

  return (
    <div>
      <label
        htmlFor="file-input"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className="flex flex-col items-center justify-center gap-4 p-12 border-2 border-dashed rounded-xl cursor-pointer transition-colors"
        style={{
          borderColor,
          backgroundColor: dragging ? 'var(--bg-tertiary)' : 'transparent',
        }}
      >
        <Upload size={32} style={{ color: 'var(--fg-muted)' }} />
        <div className="text-center">
          <p className="font-medium" style={{ color: 'var(--fg-primary)' }}>
            {t('dropzone.dragText')}
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--fg-muted)' }}>
            {t('dropzone.supportText')}
          </p>
        </div>
        <input
          id="file-input"
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={onChange}
        />
      </label>
      {error && (
        <p className="text-sm mt-2" style={{ color: 'var(--color-error)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
