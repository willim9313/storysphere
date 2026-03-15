import { useEffect, useRef, useState } from 'react';

interface BezierConnectorsProps {
  col1Ref: React.RefObject<HTMLDivElement | null>;
  col2Ref: React.RefObject<HTMLDivElement | null>;
  col3Ref: React.RefObject<HTMLDivElement | null>;
  selectedChapterIdx: number | null;
  chapterCount: number;
  showCol3: boolean;
}

interface Line {
  x1: number; y1: number;
  x2: number; y2: number;
  active: boolean;
}

export function BezierConnectors({
  col1Ref,
  col2Ref,
  col3Ref,
  selectedChapterIdx,
  chapterCount,
  showCol3,
}: BezierConnectorsProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [lines, setLines] = useState<Line[]>([]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const newLines: Line[] = [];

    // Col1 → Col2 connectors
    const col1El = col1Ref.current;
    const col2El = col2Ref.current;
    if (col1El && col2El) {
      const col1Rect = col1El.getBoundingClientRect();
      const x1 = col1Rect.right - rect.left;
      const y1 = col1Rect.top + col1Rect.height / 2 - rect.top;

      const chapterCards = col2El.querySelectorAll('[data-chapter-card]');
      chapterCards.forEach((card, idx) => {
        const cardRect = card.getBoundingClientRect();
        const x2 = cardRect.left - rect.left;
        const y2 = cardRect.top + cardRect.height / 2 - rect.top;
        newLines.push({ x1, y1, x2, y2, active: idx === selectedChapterIdx });
      });
    }

    // Col2 → Col3 connector (from selected chapter)
    if (showCol3 && col2El && col3Ref.current && selectedChapterIdx !== null) {
      const chapterCards = col2El.querySelectorAll('[data-chapter-card]');
      const selectedCard = chapterCards[selectedChapterIdx];
      if (selectedCard) {
        const cardRect = selectedCard.getBoundingClientRect();
        const col3Rect = col3Ref.current.getBoundingClientRect();
        newLines.push({
          x1: cardRect.right - rect.left,
          y1: cardRect.top + cardRect.height / 2 - rect.top,
          x2: col3Rect.left - rect.left,
          y2: col3Rect.top + 40 - rect.top,
          active: true,
        });
      }
    }

    setLines(newLines);
  }, [col1Ref, col2Ref, col3Ref, selectedChapterIdx, chapterCount, showCol3]);

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width: '100%', height: '100%', overflow: 'visible' }}
    >
      {lines.map((line, i) => {
        const cx = (line.x1 + line.x2) / 2;
        const d = `M${line.x1},${line.y1} C${cx},${line.y1} ${cx},${line.y2} ${line.x2},${line.y2}`;
        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={line.active ? 'var(--accent)' : 'var(--border)'}
            strokeWidth={line.active ? 1.5 : 0.5}
            strokeOpacity={line.active ? 0.65 : 0.3}
          />
        );
      })}
    </svg>
  );
}
