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
