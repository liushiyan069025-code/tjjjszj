// ============================================================
// CartoonIcon - 手绘 doodle 风阿诺主题图标
// ============================================================

import React from 'react';
import { iconSrc, type IconName } from '../constants/icons';

/** 统一图标尺寸（手绘风需偏大才清晰） */
export const ICON_SIZE = {
  xs: 22,      // 行内小提示
  sm: 28,      // 列表项、标签
  md: 34,      // 默认
  lg: 42,      // 区块标题、页面标题
  xl: 56,      // 空状态、大 mascot
  nav: 38,     // 底部导航
} as const;

interface CartoonIconProps {
  name: IconName;
  /** 数字或预设尺寸名 */
  size?: number | keyof typeof ICON_SIZE;
  className?: string;
  alt?: string;
}

function resolveSize(size: CartoonIconProps['size']): number {
  if (size === undefined) return ICON_SIZE.md;
  if (typeof size === 'number') return size;
  return ICON_SIZE[size];
}

export const CartoonIcon: React.FC<CartoonIconProps> = ({
  name,
  size,
  className = '',
  alt = '',
}) => {
  const px = resolveSize(size);
  return (
    <img
      src={iconSrc(name)}
      alt={alt}
      width={px}
      height={px}
      className={`inline-block object-contain select-none cartoon-icon shrink-0 ${className}`}
      draggable={false}
    />
  );
};

/** 带图标的区块标题 */
export const SectionHeading: React.FC<{
  icon: IconName;
  children: React.ReactNode;
  className?: string;
}> = ({ icon, children, className = '' }) => (
  <h3 className={`section-title flex items-center gap-2 ${className}`}>
    <CartoonIcon name={icon} size="lg" />
    <span>{children}</span>
  </h3>
);
