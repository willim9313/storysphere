import { useState, type DragEvent, type ChangeEvent } from 'react';
import { Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ACCEPT_ATTR } from './uploadModel';

interface DropZoneProps {
  /** Every picked / dropped file, unfiltered — the page splits valid from rejected. */
  readonly onFiles: (files: File[]) => void;
  /** The last drop had nothing usable: draw the error border. */
}

export function DropZone({ onFiles }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const { t } = useTranslation('upload');

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) onFiles(Array.from(e.dataTransfer.files));
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) onFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  return (
    <label
      htmlFor="file-input"
      className="up-drop"
      data-dragging={dragging}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <span className="up-drop-icon">
        <Upload size={28} strokeWidth={1.5} />
      </span>
      <span className="up-drop-main">{t('dropzone.dragText')}</span>
      <span className="up-drop-sub">{t('dropzone.supportText')}</span>
      <input id="file-input" type="file" accept={ACCEPT_ATTR} multiple className="up-hidden" onChange={onChange} />
    </label>
  );
}
