import { createContext, useContext, useEffect, useState } from 'react';
import { DEFAULT_PRIMARY } from './palettes';

type Theme = 'dark' | 'light' | 'system';

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
};

type ThemeProviderState = {
  theme: Theme;
  primaryColor: string;
  setTheme: (theme: Theme) => void;
  setPrimaryColor: (color: string) => void;
};

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(
  undefined,
);

const THEME_STORAGE_KEY = 'local:preferred-theme' as const;
const PRIMARY_COLOR_STORAGE_KEY = 'local:preferred-primary-color' as const;

export function ThemeProvider({
  children,
  defaultTheme = 'system',
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () =>
      (localStorage.getItem(THEME_STORAGE_KEY) as Theme | null) ?? defaultTheme,
  );
  const [primaryColor, setPrimaryColor] = useState(
    () => localStorage.getItem(PRIMARY_COLOR_STORAGE_KEY) ?? DEFAULT_PRIMARY,
  );

  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

      const handleSystemThemeChange = () => {
        root.classList.remove('light', 'dark');
        root.classList.add(mediaQuery.matches ? 'dark' : 'light');
      };

      mediaQuery.addEventListener('change', handleSystemThemeChange);

      // Initial setup
      handleSystemThemeChange();

      return () =>
        mediaQuery.removeEventListener('change', handleSystemThemeChange);
    }

    root.classList.add(theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--primary-source',
      primaryColor,
    );
  }, [primaryColor]);

  return (
    <ThemeProviderContext.Provider
      value={{
        theme,
        primaryColor,
        setTheme: (theme: Theme) => {
          localStorage.setItem(THEME_STORAGE_KEY, theme);
          setTheme(theme);
        },
        setPrimaryColor: (color: string) => {
          localStorage.setItem(PRIMARY_COLOR_STORAGE_KEY, color);
          setPrimaryColor(color);
        },
      }}
    >
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
};
