export type Palette = { id: string; primary: string; secondary: string };

export const PALETTES: Palette[] = [
  { id: 'slate', primary: '#7d8db3', secondary: '#a9b3d4' },
  { id: 'royal', primary: '#5b7ec9', secondary: '#a9b9e8' },
  { id: 'steel', primary: '#8693a8', secondary: '#a8b4c4' },
  { id: 'sage', primary: '#9aaa9e', secondary: '#c0ccc4' },
  { id: 'teal', primary: '#3aa8a8', secondary: '#7ed0c8' },
  { id: 'forest', primary: '#5aa84a', secondary: '#a8d28e' },
  { id: 'olive', primary: '#a0a878', secondary: '#c4c898' },
  { id: 'mustard', primary: '#c4a83c', secondary: '#d4be78' },
  { id: 'rust', primary: '#d47a3c', secondary: '#e8a87c' },
  { id: 'brown', primary: '#8a6048', secondary: '#c4a088' },
  { id: 'burgundy', primary: '#b84a6c', secondary: '#e8a0b8' },
  { id: 'rose', primary: '#c08894', secondary: '#dbaeb4' },
  { id: 'purple', primary: '#9b3a9e', secondary: '#e094c4' },
  { id: 'lavender', primary: '#9e80c8', secondary: '#bea4d4' },
];

export const DEFAULT_PRIMARY = '#8a6048';

export function getActivePrimary(paletteId: string, customColor: string) {
  if (paletteId === 'custom') return customColor;
  return PALETTES.find((p) => p.id === paletteId)?.primary ?? DEFAULT_PRIMARY;
}
