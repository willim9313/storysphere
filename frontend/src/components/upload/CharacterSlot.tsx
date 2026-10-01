import { Sprout } from 'lucide-react';

interface CharacterSlotProps {
  src?: string;
  icon?: React.ReactNode;
}

/** Mascot slot pinned to the murmur window's bottom-right; floats (bob) unless reduced motion. */
export function CharacterSlot({ src, icon }: Readonly<CharacterSlotProps>) {
  let content: React.ReactNode = <Sprout size={22} strokeWidth={1.5} />;
  if (src) content = <img src={src} alt="" />;
  else if (icon) content = icon;
  return (
    <div className="up-mascot">
      <span className="up-mascot-inner">{content}</span>
    </div>
  );
}
