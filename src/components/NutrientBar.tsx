// ============================================================
// NutrientBar - 营养素进度条
// ============================================================

import React from 'react';
import { CartoonIcon } from './CartoonIcon';
import type { IconName } from '../constants/icons';

interface NutrientBarProps {
  label: string;
  icon: IconName;
  consumed: number;
  target: number;
  unit: string;
  color: string;
  bgColor: string;
}

export const NutrientBar: React.FC<NutrientBarProps> = ({
  label, icon, consumed, target, unit, color, bgColor
}) => {
  const ratio = target > 0 ? Math.min(consumed / target, 1) : 0;
  const remain = Math.max(target - consumed, 0);
  const over = consumed > target;

  return (
    <div className="flex items-center gap-2">
      <CartoonIcon name={icon} size="md" />
      <div className="flex-1">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs font-medium text-gray-300">{label}</span>
          <span className={`text-xs flex items-center gap-1 ${over ? 'text-red-400 font-bold' : 'text-gray-400'}`}>
            {consumed}{unit} / {target}{unit}
            {over && <CartoonIcon name="warning" size="xs" />}
          </span>
        </div>
        <div className={`h-2.5 rounded-full ${bgColor}`}>
          <div
            className={`h-2.5 rounded-full transition-all duration-500 ${over ? 'bg-red-400' : color}`}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
        {!over && remain > 0 && (
          <span className="text-[10px] text-gray-400 mt-0.5">
            {remain}{unit} 可能还没到位，但是不到位不太可能
          </span>
        )}
        {over && (
          <span className="text-[10px] text-red-400 mt-0.5">申气了！超标了听见没有</span>
        )}
      </div>
    </div>
  );
};
