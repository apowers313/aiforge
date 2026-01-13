/**
 * Terminal theme definitions for xterm.js
 * These themes apply across all terminal instances
 */

export interface TerminalTheme {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent?: string;
  selectionBackground?: string;
  selectionForeground?: string;
  selectionInactiveBackground?: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export interface TerminalThemeDefinition {
  id: string;
  name: string;
  theme: TerminalTheme;
}

// Tokyo Night theme (current default)
const tokyoNight: TerminalThemeDefinition = {
  id: 'tokyo-night',
  name: 'Tokyo Night',
  theme: {
    background: '#1a1b26',
    foreground: '#c0caf5',
    cursor: '#c0caf5',
    black: '#15161e',
    red: '#f7768e',
    green: '#9ece6a',
    yellow: '#e0af68',
    blue: '#7aa2f7',
    magenta: '#bb9af7',
    cyan: '#7dcfff',
    white: '#a9b1d6',
    brightBlack: '#414868',
    brightRed: '#f7768e',
    brightGreen: '#9ece6a',
    brightYellow: '#e0af68',
    brightBlue: '#7aa2f7',
    brightMagenta: '#bb9af7',
    brightCyan: '#7dcfff',
    brightWhite: '#c0caf5',
  },
};

// Dracula theme
const dracula: TerminalThemeDefinition = {
  id: 'dracula',
  name: 'Dracula',
  theme: {
    background: '#282a36',
    foreground: '#f8f8f2',
    cursor: '#f8f8f2',
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
    brightBlack: '#6272a4',
    brightRed: '#ff6e6e',
    brightGreen: '#69ff94',
    brightYellow: '#ffffa5',
    brightBlue: '#d6acff',
    brightMagenta: '#ff92df',
    brightCyan: '#a4ffff',
    brightWhite: '#ffffff',
  },
};

// One Dark theme
const oneDark: TerminalThemeDefinition = {
  id: 'one-dark',
  name: 'One Dark',
  theme: {
    background: '#282c34',
    foreground: '#abb2bf',
    cursor: '#528bff',
    black: '#282c34',
    red: '#e06c75',
    green: '#98c379',
    yellow: '#e5c07b',
    blue: '#61afef',
    magenta: '#c678dd',
    cyan: '#56b6c2',
    white: '#abb2bf',
    brightBlack: '#5c6370',
    brightRed: '#e06c75',
    brightGreen: '#98c379',
    brightYellow: '#e5c07b',
    brightBlue: '#61afef',
    brightMagenta: '#c678dd',
    brightCyan: '#56b6c2',
    brightWhite: '#ffffff',
  },
};

// Monokai theme
const monokai: TerminalThemeDefinition = {
  id: 'monokai',
  name: 'Monokai',
  theme: {
    background: '#272822',
    foreground: '#f8f8f2',
    cursor: '#f8f8f2',
    black: '#272822',
    red: '#f92672',
    green: '#a6e22e',
    yellow: '#f4bf75',
    blue: '#66d9ef',
    magenta: '#ae81ff',
    cyan: '#a1efe4',
    white: '#f8f8f2',
    brightBlack: '#75715e',
    brightRed: '#f92672',
    brightGreen: '#a6e22e',
    brightYellow: '#f4bf75',
    brightBlue: '#66d9ef',
    brightMagenta: '#ae81ff',
    brightCyan: '#a1efe4',
    brightWhite: '#f9f8f5',
  },
};

// Solarized Dark theme
const solarizedDark: TerminalThemeDefinition = {
  id: 'solarized-dark',
  name: 'Solarized Dark',
  theme: {
    background: '#002b36',
    foreground: '#839496',
    cursor: '#839496',
    black: '#073642',
    red: '#dc322f',
    green: '#859900',
    yellow: '#b58900',
    blue: '#268bd2',
    magenta: '#d33682',
    cyan: '#2aa198',
    white: '#eee8d5',
    brightBlack: '#586e75',
    brightRed: '#cb4b16',
    brightGreen: '#586e75',
    brightYellow: '#657b83',
    brightBlue: '#839496',
    brightMagenta: '#6c71c4',
    brightCyan: '#93a1a1',
    brightWhite: '#fdf6e3',
  },
};

// Nord theme
const nord: TerminalThemeDefinition = {
  id: 'nord',
  name: 'Nord',
  theme: {
    background: '#2e3440',
    foreground: '#d8dee9',
    cursor: '#d8dee9',
    black: '#3b4252',
    red: '#bf616a',
    green: '#a3be8c',
    yellow: '#ebcb8b',
    blue: '#81a1c1',
    magenta: '#b48ead',
    cyan: '#88c0d0',
    white: '#e5e9f0',
    brightBlack: '#4c566a',
    brightRed: '#bf616a',
    brightGreen: '#a3be8c',
    brightYellow: '#ebcb8b',
    brightBlue: '#81a1c1',
    brightMagenta: '#b48ead',
    brightCyan: '#8fbcbb',
    brightWhite: '#eceff4',
  },
};

// Gruvbox Dark theme
const gruvboxDark: TerminalThemeDefinition = {
  id: 'gruvbox-dark',
  name: 'Gruvbox Dark',
  theme: {
    background: '#282828',
    foreground: '#ebdbb2',
    cursor: '#ebdbb2',
    black: '#282828',
    red: '#cc241d',
    green: '#98971a',
    yellow: '#d79921',
    blue: '#458588',
    magenta: '#b16286',
    cyan: '#689d6a',
    white: '#a89984',
    brightBlack: '#928374',
    brightRed: '#fb4934',
    brightGreen: '#b8bb26',
    brightYellow: '#fabd2f',
    brightBlue: '#83a598',
    brightMagenta: '#d3869b',
    brightCyan: '#8ec07c',
    brightWhite: '#ebdbb2',
  },
};

// GitHub Dark theme
const githubDark: TerminalThemeDefinition = {
  id: 'github-dark',
  name: 'GitHub Dark',
  theme: {
    background: '#0d1117',
    foreground: '#c9d1d9',
    cursor: '#c9d1d9',
    black: '#484f58',
    red: '#ff7b72',
    green: '#3fb950',
    yellow: '#d29922',
    blue: '#58a6ff',
    magenta: '#bc8cff',
    cyan: '#39c5cf',
    white: '#b1bac4',
    brightBlack: '#6e7681',
    brightRed: '#ffa198',
    brightGreen: '#56d364',
    brightYellow: '#e3b341',
    brightBlue: '#79c0ff',
    brightMagenta: '#d2a8ff',
    brightCyan: '#56d4dd',
    brightWhite: '#ffffff',
  },
};

// Visual Studio Dark theme (VS Code default dark)
const vsDark: TerminalThemeDefinition = {
  id: 'vs-dark',
  name: 'Visual Studio Dark',
  theme: {
    background: '#1e1e1e',
    foreground: '#d4d4d4',
    cursor: '#d4d4d4',
    black: '#000000',
    red: '#cd3131',
    green: '#0dbc79',
    yellow: '#e5e510',
    blue: '#2472c8',
    magenta: '#bc3fbc',
    cyan: '#11a8cd',
    white: '#e5e5e5',
    brightBlack: '#666666',
    brightRed: '#f14c4c',
    brightGreen: '#23d18b',
    brightYellow: '#f5f543',
    brightBlue: '#3b8eea',
    brightMagenta: '#d670d6',
    brightCyan: '#29b8db',
    brightWhite: '#ffffff',
  },
};

// ============================================
// LIGHT THEMES
// ============================================

// Visual Studio Light theme (VS Code default light)
const vsLight: TerminalThemeDefinition = {
  id: 'vs-light',
  name: 'Visual Studio Light',
  theme: {
    background: '#ffffff',
    foreground: '#000000',
    cursor: '#000000',
    black: '#000000',
    red: '#cd3131',
    green: '#00bc00',
    yellow: '#949800',
    blue: '#0451a5',
    magenta: '#bc05bc',
    cyan: '#0598bc',
    white: '#555555',
    brightBlack: '#666666',
    brightRed: '#cd3131',
    brightGreen: '#14ce14',
    brightYellow: '#b5ba00',
    brightBlue: '#0451a5',
    brightMagenta: '#bc05bc',
    brightCyan: '#0598bc',
    brightWhite: '#a5a5a5',
  },
};

// Solarized Light theme
const solarizedLight: TerminalThemeDefinition = {
  id: 'solarized-light',
  name: 'Solarized Light',
  theme: {
    background: '#fdf6e3',
    foreground: '#657b83',
    cursor: '#657b83',
    black: '#073642',
    red: '#dc322f',
    green: '#859900',
    yellow: '#b58900',
    blue: '#268bd2',
    magenta: '#d33682',
    cyan: '#2aa198',
    white: '#eee8d5',
    brightBlack: '#002b36',
    brightRed: '#cb4b16',
    brightGreen: '#586e75',
    brightYellow: '#657b83',
    brightBlue: '#839496',
    brightMagenta: '#6c71c4',
    brightCyan: '#93a1a1',
    brightWhite: '#fdf6e3',
  },
};

// GitHub Light theme
const githubLight: TerminalThemeDefinition = {
  id: 'github-light',
  name: 'GitHub Light',
  theme: {
    background: '#ffffff',
    foreground: '#24292f',
    cursor: '#24292f',
    black: '#24292f',
    red: '#cf222e',
    green: '#116329',
    yellow: '#4d2d00',
    blue: '#0969da',
    magenta: '#8250df',
    cyan: '#1b7c83',
    white: '#6e7781',
    brightBlack: '#57606a',
    brightRed: '#a40e26',
    brightGreen: '#1a7f37',
    brightYellow: '#633c01',
    brightBlue: '#218bff',
    brightMagenta: '#a475f9',
    brightCyan: '#3192aa',
    brightWhite: '#8c959f',
  },
};

// One Light theme (Atom)
const oneLight: TerminalThemeDefinition = {
  id: 'one-light',
  name: 'One Light',
  theme: {
    background: '#fafafa',
    foreground: '#383a42',
    cursor: '#526eff',
    black: '#383a42',
    red: '#e45649',
    green: '#50a14f',
    yellow: '#c18401',
    blue: '#4078f2',
    magenta: '#a626a4',
    cyan: '#0184bc',
    white: '#a0a1a7',
    brightBlack: '#696c77',
    brightRed: '#e45649',
    brightGreen: '#50a14f',
    brightYellow: '#c18401',
    brightBlue: '#4078f2',
    brightMagenta: '#a626a4',
    brightCyan: '#0184bc',
    brightWhite: '#383a42',
  },
};

// Gruvbox Light theme
const gruvboxLight: TerminalThemeDefinition = {
  id: 'gruvbox-light',
  name: 'Gruvbox Light',
  theme: {
    background: '#fbf1c7',
    foreground: '#3c3836',
    cursor: '#3c3836',
    black: '#fbf1c7',
    red: '#cc241d',
    green: '#98971a',
    yellow: '#d79921',
    blue: '#458588',
    magenta: '#b16286',
    cyan: '#689d6a',
    white: '#7c6f64',
    brightBlack: '#928374',
    brightRed: '#9d0006',
    brightGreen: '#79740e',
    brightYellow: '#b57614',
    brightBlue: '#076678',
    brightMagenta: '#8f3f71',
    brightCyan: '#427b58',
    brightWhite: '#3c3836',
  },
};

// Catppuccin Latte (light pastel theme)
const catppuccinLatte: TerminalThemeDefinition = {
  id: 'catppuccin-latte',
  name: 'Catppuccin Latte',
  theme: {
    background: '#eff1f5',
    foreground: '#4c4f69',
    cursor: '#dc8a78',
    black: '#5c5f77',
    red: '#d20f39',
    green: '#40a02b',
    yellow: '#df8e1d',
    blue: '#1e66f5',
    magenta: '#ea76cb',
    cyan: '#179299',
    white: '#acb0be',
    brightBlack: '#6c6f85',
    brightRed: '#d20f39',
    brightGreen: '#40a02b',
    brightYellow: '#df8e1d',
    brightBlue: '#1e66f5',
    brightMagenta: '#ea76cb',
    brightCyan: '#179299',
    brightWhite: '#bcc0cc',
  },
};

// All available themes (dark themes first, then light themes)
export const TERMINAL_THEMES: TerminalThemeDefinition[] = [
  // Dark themes
  tokyoNight,
  dracula,
  oneDark,
  monokai,
  solarizedDark,
  nord,
  gruvboxDark,
  githubDark,
  vsDark,
  // Light themes
  vsLight,
  solarizedLight,
  githubLight,
  oneLight,
  gruvboxLight,
  catppuccinLatte,
];

// Default theme (always the first one in the list)
const DEFAULT_THEME = tokyoNight;

// Theme IDs as a type for type safety
export type TerminalThemeId = typeof TERMINAL_THEMES[number]['id'];

// Default theme ID
export const DEFAULT_TERMINAL_THEME_ID: TerminalThemeId = 'tokyo-night';

/**
 * Get a theme definition by its ID
 */
export function getTerminalTheme(themeId: string): TerminalThemeDefinition {
  const theme = TERMINAL_THEMES.find((t) => t.id === themeId);
  // Fall back to default theme (Tokyo Night) if not found
  return theme ?? DEFAULT_THEME;
}

/**
 * Get the xterm theme object for a theme ID
 */
export function getTerminalThemeColors(themeId: string): TerminalTheme {
  return getTerminalTheme(themeId).theme;
}
