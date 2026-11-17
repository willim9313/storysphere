import { useState } from 'react';
import { Upload } from 'lucide-react';

/** 書庫格線最後一格：點擊開檔案選擇器，或把檔案拖進來。 */
export function UploadTile({
  onPick,
  onDrop,
  disabled,
}: Readonly<{ onPick: () => void; onDrop: (files: File[]) => void; disabled: boolean }>) {
  const [dragging, setDragging] = useState(false);
  return (
    <button
      type="button"
      className="ss-bookcard ss-bookcard-upload"
      style={{
        fontFamily: 'inherit',
        borderColor: dragging ? 'var(--accent)' : undefined,
        cursor: disabled ? 'progress' : undefined,
      }}
      disabled={disabled}
      onClick={onPick}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) onDrop(Array.from(e.dataTransfer.files));
      }}
    >
      <Upload size={28} strokeWidth={1.5} color="var(--fg-muted)" aria-hidden />
      <span style={{ fontWeight: 600, color: 'var(--fg-secondary)' }}>
        {disabled ? '上傳中…' : '拖曳檔案至此，或點擊選擇檔案'}
      </span>
      <span style={{ fontSize: 'var(--font-size-2xs)' }}>支援 .pdf、.docx、.txt、.epub 格式，可多選</span>
    </button>
  );
}
