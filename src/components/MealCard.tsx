// ============================================================
// MealCard - 餐食卡片
// ============================================================

import React from 'react';
import type { MealEntry } from '../types';

interface MealCardProps {
  entry: MealEntry;
  onDelete: (id: string) => void;
}

export const MealCard: React.FC<MealCardProps> = ({ entry, onDelete }) => {
  return (
    <div className="bg-gray-800 rounded-lg flex items-start gap-3 p-2.5 border border-gray-700">
      {/* 餐食图片缩略图 */}
      {entry.imageBase64 && (
        <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
          <img
            src={entry.imageBase64}
            alt={entry.meal_description}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      {/* 餐食信息 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-200 truncate">
            {entry.meal_description}
          </h4>
          <span className="text-xs text-gray-400">{entry.time}</span>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-xs text-orange-400 font-bold">{entry.total_calories} kcal</span>
          <span className="text-[10px] text-gray-400">碳水 {entry.total_carbs}g</span>
          <span className="text-[10px] text-gray-400">蛋白 {entry.total_protein}g</span>
          <span className="text-[10px] text-gray-400">脂肪 {entry.total_fat}g</span>
        </div>
        {/* 食物列表 */}
        <div className="flex flex-wrap gap-1 mt-1.5">
          {entry.foods.map((f, i) => (
            <span key={i} className="text-[10px] bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">
              {f.name} {f.amount}
            </span>
          ))}
        </div>
      </div>
      {/* 删除按钮 */}
      <button
        onClick={() => onDelete(entry.id)}
        className="text-gray-500 hover:text-red-400 transition-colors p-1"
        title="删掉这顿"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};
