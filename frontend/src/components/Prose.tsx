import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** 大腦與筆記的 markdown 內文：GFM（表格、刪除線）＋ `.ss-prose` 的標題、表格、清單樣式。 */
export function Prose({ children, className }: Readonly<{ children: string; className?: string }>) {
  return (
    <div className={className ? `ss-prose ${className}` : 'ss-prose'}>
      <Markdown remarkPlugins={[remarkGfm]}>{children}</Markdown>
    </div>
  );
}
