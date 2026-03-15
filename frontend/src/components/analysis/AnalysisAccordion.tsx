import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';

interface Section {
  title: string;
  subtitle?: string;
  content: string;
}

interface AnalysisAccordionProps {
  sections: Section[];
}

export function AnalysisAccordion({ sections }: AnalysisAccordionProps) {
  const [openSet, setOpenSet] = useState<Set<number>>(() => new Set([0, 1]));

  const toggle = (idx: number) => {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {sections.map((section, idx) => {
        const isOpen = openSet.has(idx);
        return (
          <div
            key={idx}
            className="rounded-lg overflow-hidden"
            style={{
              backgroundColor: 'white',
              border: '1px solid var(--border)',
            }}
          >
            <button
              className="flex items-center gap-2 w-full px-4 py-3 text-left"
              onClick={() => toggle(idx)}
            >
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <div>
                <span className="text-sm font-medium" style={{ color: 'var(--fg-primary)' }}>
                  {section.title}
                </span>
                {section.subtitle && (
                  <span className="text-xs ml-2" style={{ color: 'var(--fg-muted)' }}>
                    {section.subtitle}
                  </span>
                )}
              </div>
            </button>
            {isOpen && (
              <div className="px-4 pb-4">
                <MarkdownRenderer content={section.content} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
