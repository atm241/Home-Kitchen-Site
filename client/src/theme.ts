export const theme = {
  colors: {
    background: '#EBD5AB',
    primary: '#E67E22',    // Orange - for primary actions and headings
    secondary: '#628141',  // Dark green - for secondary elements
    accent: '#8BAE66',     // Light green - for accents and highlights
    text: '#2C3E50',       // Dark gray for text
    textLight: '#7F8C8D',  // Light gray for secondary text
    white: '#FFFFFF',
    error: '#E74C3C',
    success: '#27AE60',
    border: '#BDC3C7',
    shadow: 'rgba(0, 0, 0, 0.1)',
  },
  fonts: {
    primary: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
    mono: 'source-code-pro, Menlo, Monaco, Consolas, "Courier New", monospace',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    xxl: '48px',
  },
  borderRadius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    full: '9999px',
  },
  shadows: {
    sm: '0 1px 3px rgba(0, 0, 0, 0.1)',
    md: '0 4px 6px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
  },
};

export type Theme = typeof theme;
