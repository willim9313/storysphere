import { useCallback, useState, type DragEvent, type ChangeEvent } from 'react';
import { Upload } from 'lucide-react';

interface DropZoneProps {
  onFileSelected: (file: File) => void;
}

const ACCEPTED = new Set(['.pdf', '.docx']);

export function DropZone({ onFileSelected }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (ACCEPTED.has(ext)) {
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
        borderColor: dragging ? 'var(--color-accent)' : 'var(--color-border)',
        backgroundColor: dragging ? 'var(--color-accent-subtle)' : 'transparent',
      }}
      onClick={() => document.getElementById('file-input')?.click()}
    >
      <Upload size={32} style={{ color: 'var(--color-text-muted)' }} />
      <div className="text-center">
        <p className="font-medium" style={{ color: 'var(--color-text)' }}>
          Drop a file here or click to browse
        </p>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Accepts .pdf and .docx
        </p>
      </div>
      <input
        id="file-input"
        type="file"
        accept=".pdf,.docx"
        className="hidden"
        onChange={onChange}
      />
    </div>
  );
}
