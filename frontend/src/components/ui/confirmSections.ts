export interface ConfirmSection {
  title: string;
  items: string[];
}

/** Sections with nothing to list are dropped whole — a heading over an empty
 *  list reads as a bug. */
export function visibleSections(sections: ConfirmSection[] | undefined): ConfirmSection[] {
  return (sections ?? []).filter((s) => s.items.length > 0);
}
