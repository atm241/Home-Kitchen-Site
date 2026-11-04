import React from 'react';
import { BRAND_NAME } from './brand';

// The mark: a pot with three wisps of steam, in the brand orange.
export const LogoMark: React.FC<{ size?: number }> = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <rect width="48" height="48" rx="14" fill="#E67E22" />
    <g fill="none" stroke="#FFF7EC" strokeWidth="3" strokeLinecap="round">
      <path d="M17 9c-2 2.5 2 4.5 0 7" />
      <path d="M24 7c-2 2.5 2 4.5 0 7" />
      <path d="M31 9c-2 2.5 2 4.5 0 7" />
    </g>
    <path d="M10 22h28v5a11 11 0 0 1-11 11h-6a11 11 0 0 1-11-11v-5z" fill="#FFF7EC" />
    <rect x="7" y="20" width="34" height="4" rx="2" fill="#FFF7EC" />
  </svg>
);

const Logo: React.FC<{ size?: number; className?: string }> = ({ size = 32, className }) => (
  <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
    <LogoMark size={size} />
    <span
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        fontSize: Math.round(size * 0.7),
        letterSpacing: '-0.02em',
        color: 'var(--ink)',
      }}
    >
      {BRAND_NAME}
    </span>
  </span>
);

export default Logo;
