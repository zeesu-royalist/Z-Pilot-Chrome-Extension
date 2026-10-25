import React from 'react';

interface BrandMarkProps {
  className?: string;
  size?: number;
}

/**
 * The authentic Z-Pilot organic star brand mark
 */
export const BrandMark: React.FC<BrandMarkProps> = ({ className = '', size = 24 }) => {
  return (
    <img
      src="/brand-mark.png"
      alt="Z-Pilot Brand Mark"
      width={size}
      height={size}
      className={`object-contain select-none pointer-events-none ${className}`}
    />
  );
};

interface FullLogoProps {
  className?: string;
  width?: number;
}

/**
 * The complete Z-Pilot logo with typography and "POWERED BY ZEESU ROYALIST"
 */
export const FullLogo: React.FC<FullLogoProps> = ({ className = '', width = 160 }) => {
  return (
    <img
      src="/logo.png"
      alt="Z-Pilot - Powered by Zeesu Royalist"
      style={{ width: `${width}px` }}
      className={`object-contain ${className}`}
    />
  );
};
