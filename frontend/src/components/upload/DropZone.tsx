import { useCallback, useState, type DragEvent, type ChangeEvent } from 'react';
import { Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface DropZoneProps {
  onFileSelected: (file: File) => void;
}

export function DropZone({ onFileSelected }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const { t } = useTranslation('upload');

  const handleFile = useCallback(
    (file: File) => {
      if (file.name.toLowerCase().endsWith('.pdf')) {
        onFileSelected(file);
      }
    },
    [onFileSelected],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className="flex flex-col items-center justify-center gap-4 p-12 border-2 border-dashed rounded-xl cursor-pointer transition-colors"
      style={{
        borderColor: dragging ? 'var(--accent)' : 'var(--border)',
        backgroundColor: dragging ? 'var(--bg-tertiary)' : 'transparent',
      }}
      onClick={() => document.getElementById('file-input')?.click()}
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
    </div>
  );
}
