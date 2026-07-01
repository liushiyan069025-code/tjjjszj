// ============================================================
// CalorieRing - 热量环形图 (SVG)
// ============================================================

import React from 'react';
import { CartoonIcon } from './CartoonIcon';

interface CalorieRingProps {
  consumed: number;       // 饮食摄入
  target: number;         // 日常总消耗 (TDEE + 运动)
  goalLine?: number;      // AI 建议摄入目标（参考线，可选）
  size?: number;
}

export const CalorieRing: React.FC<CalorieRingProps> = ({ consumed, target, goalLine, size = 180 }) => {
  const ratio = target > 0 ? Math.min(consumed / target, 1) : 0;
  const deficit = target - consumed; // 正值=缺口(有利于减脂)，负值=盈余
  const over = consumed > target;

  // SVG 环形参数
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = circumference * ratio;
  const center = size / 2;

  // 参考线位置（AI 建议目标占总消耗的比例）
  const goalRatio = goalLine && target > 0 ? Math.min(goalLine / target, 1) : 0;
  const goalDash = circumference * goalRatio;

  // 颜色：有缺口用绿色，盈余用红色
  const ringColor = over ? '#ef4444' : '#22c55e';

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {/* 背景环 */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#374151"
            strokeWidth={strokeWidth}
          />
          {/* 已摄入环 */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth={strokeWidth}
            strokeDasharray={`${filled} ${circumference}`}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
          {/* AI 建议目标参考线（虚线标记） */}
          {goalLine && goalLine > 0 && goalLine < target && (
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="#6366f1"
              strokeWidth={strokeWidth + 2}
              strokeDasharray={`2 ${goalDash - 2} ${circumference - goalDash}`}
              strokeLinecap="butt"
              opacity={0.5}
            />
          )}
        </svg>
        {/* 中心文字 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-bold ${over ? 'text-red-400' : 'text-primary-400'}`}>
            {consumed}
          </span>
          <span className="text-xs text-gray-400">/ {target} kcal</span>
        </div>
      </div>
      {/* 缺口/盈余提示（基于总消耗） */}
      <div className="mt-2 text-center">
        {over ? (
          <span className="text-sm text-red-400 font-medium flex items-center justify-center gap-1 flex-wrap">
            <CartoonIcon name="warning" size="sm" />
            那我问你，吃多了吧？盈余 {consumed - target} kcal，三卡车安排小肚子了
          </span>
        ) : (
          <span className="text-sm text-green-400 font-medium flex items-center justify-center gap-1">
            <CartoonIcon name="fire" size="sm" />
            缺口 <span className="text-lg font-bold">{deficit}</span> kcal，诺神批准，继续干！
          </span>
        )}
      </div>
      {/* 参考线说明 */}
      {goalLine && goalLine > 0 && (
        <div className="mt-1 flex items-center gap-1.5">
          <span className="inline-block w-3 h-0.5 bg-indigo-400"></span>
          <span className="text-[10px] text-gray-400">诺神说吃 {goalLine} kcal 就行</span>
        </div>
      )}
    </div>
  );
};
