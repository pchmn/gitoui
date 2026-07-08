import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `--lane-1…5` (issue #56) live in `@gitoui/ui`'s `globals.css`, the design-system seam — no
 * component under test here, just the raw stylesheet. `getComputedStyle` can't help: no headless
 * DOM engine implements CSS Color 4 relative-color syntax (`oklch(from …)`), so a real "pick a
 * desaturated source and read the rendered lane colors" test isn't possible in this runtime. This
 * asserts the structural guarantee that *makes* lanes distinguishable under a desaturated source
 * instead: every lane token carries the `max(c, 0.12)` chroma floor DESIGN.md §Graph Lanes calls
 * for, in both themes, while `--chart-*` (the shadcn contract, not the graph's) stays untouched.
 */
const globalsCss = readFileSync(
  fileURLToPath(
    new URL('../../../../../../../../packages/ui/src/styles/globals.css', import.meta.url),
  ),
  'utf-8',
);

describe('graph lane tokens', () => {
  it('defines --lane-1…5 with the max(c, 0.12) chroma floor in :root (light)', () => {
    const root = globalsCss.slice(globalsCss.indexOf(':root'), globalsCss.indexOf('.dark {'));
    for (let n = 1; n <= 5; n++) {
      const match = root.match(new RegExp(`--lane-${n}:\\s*([^;]+);`));
      expect(match, `--lane-${n} missing from :root`).toBeTruthy();
      expect(match?.[1]).toContain('max(c, 0.12)');
    }
  });

  it('defines --lane-1…5 with the max(c, 0.12) chroma floor in .dark', () => {
    const dark = globalsCss.slice(globalsCss.indexOf('.dark {'));
    for (let n = 1; n <= 5; n++) {
      const match = dark.match(new RegExp(`--lane-${n}:\\s*([^;]+);`));
      expect(match, `--lane-${n} missing from .dark`).toBeTruthy();
      expect(match?.[1]).toContain('max(c, 0.12)');
    }
  });

  it('leaves --chart-1…5 untouched — no chroma floor, the shadcn contract, not the graph', () => {
    for (const block of [
      globalsCss.slice(globalsCss.indexOf(':root'), globalsCss.indexOf('.dark {')),
      globalsCss.slice(globalsCss.indexOf('.dark {')),
    ]) {
      for (let n = 1; n <= 5; n++) {
        const match = block.match(new RegExp(`--chart-${n}:\\s*([^;]+);`));
        expect(match, `--chart-${n} missing`).toBeTruthy();
        expect(match?.[1]).not.toContain('max(c');
      }
    }
  });

  it('maps --color-lane-1…5 in the @theme block, mirroring --color-chart-*', () => {
    const theme = globalsCss.slice(globalsCss.indexOf('@theme'), globalsCss.indexOf(':root'));
    for (let n = 1; n <= 5; n++) {
      expect(theme).toContain(`--color-lane-${n}: var(--lane-${n});`);
    }
  });
});
