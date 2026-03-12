import type { EntityType } from '@/api/types';

const typeColorMap: Record<string, string> = {
  character: 'var(--color-entity-character)',
  location: 'var(--color-entity-location)',
  object: 'var(--color-entity-object)',
  event: 'var(--color-entity-event)',
  concept: 'var(--color-entity-concept)',
  organization: 'var(--color-entity-organization)',
};

interface EntityHighlightProps {
  text: string;
  entityType?: EntityType;
  entityName?: string;
}

export function EntityHighlight({ text, entityType, entityName }: EntityHighlightProps) {
  const color = typeColorMap[entityType ?? ''] ?? 'var(--color-text-muted)';

  return (
    <mark
      className="px-0.5 rounded cursor-pointer"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 25%, transparent)`,
        color: 'inherit',
        borderBottom: `2px solid ${color}`,
      }}
      title={entityName}
    >
      {text}
    </mark>
  );
}
