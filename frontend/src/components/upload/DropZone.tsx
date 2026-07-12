import { useCallback, useState, type DragEvent, type ChangeEvent } from 'react';
import { Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const MAX_FILE_MB = 50;
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.epub'];

interface DropZoneProps {
  readonly onFilesSelected: (files: File[]) => void;
}

export function DropZone({ onFilesSelected }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation('upload');

  const handleFiles = useCallback(
    (fileList: FileList) => {
      const files = Array.from(fileList);
      const valid: File[] = [];
      let rejected: string | null = null;
      for (const file of files) {
        const name = file.name.toLowerCase();
        if (!ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
          rejected = t('dropzone.errorInvalidFormat');
          continue;
        }
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
          rejected = t('dropzone.errorTooLarge', { max: MAX_FILE_MB });
          continue;
        }
        valid.push(file);
      }
      if (valid.length > 0) {
        setError(null);
        onFilesSelected(valid);
      } else {
        setError(rejected);
      }
    },
    [onFilesSelected, t],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
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
          accept=".pdf,.docx,.txt,.epub"
          multiple
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
