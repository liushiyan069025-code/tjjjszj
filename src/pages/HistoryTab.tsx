// ============================================================
// 头尖尖私教 - 战绩回顾页
// 体重折线图 + 热量柱状图 + AI 周报流式输出
// ============================================================

import React, { useState, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { NutritionGoal, MealEntry, WeightEntry, UserProfile } from '../types';
import { getRecentDates, formatDateShort, getTodayStr, calcTDEE } from '../utils/calculations';
import { generateWeeklyReport } from '../services/aiService';
import { CartoonIcon, SectionHeading } from '../components/CartoonIcon';
import { SkeletonCard } from '../components/Skeleton';

interface HistoryTabProps {
  goal: NutritionGoal | null;
  meals: MealEntry[];
  weights: WeightEntry[];
  addWeight: (entry: WeightEntry) => void;
  profile: UserProfile;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({
  goal, meals, weights, addWeight, profile,
}) => {
  const [weightInput, setWeightInput] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportText, setReportText] = useState('');
  const [reportError, setReportError] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => getTodayStr().substring(0, 7));

  // 近 30 天体重数据
  const weightChartData = useMemo(() => {
    const dates = getRecentDates(30);
    return dates.map((date) => {
      const entry = weights.find((w) => w.date === date);
      return {
        date: formatDateShort(date),
        weight: entry?.weight ?? null,
      };
    }).filter((d) => d.weight !== null);
  }, [weights]);

  // 近 7 天热量数据
  const calorieChartData = useMemo(() => {
    const dates = getRecentDates(7);
    return dates.map((date) => {
      const dayMeals = meals.filter((m) => m.date === date);
      const totalCalories = dayMeals.reduce((sum, m) => sum + m.total_calories, 0);
      const totalCarbs = dayMeals.reduce((sum, m) => sum + m.total_carbs, 0);
      const totalProtein = dayMeals.reduce((sum, m) => sum + m.total_protein, 0);
      const totalFat = dayMeals.reduce((sum, m) => sum + m.total_fat, 0);
      const weightEntry = weights.find((w) => w.date === date);
      return {
        date: formatDateShort(date),
        calories: totalCalories,
        carbs: totalCarbs,
        protein: totalProtein,
        fat: totalFat,
        weight: weightEntry?.weight,
      };
    });
  }, [meals, weights]);

  // 日历数据 - 每日热量盈余 (盈余 = 摄入 - TDEE)
  const calendarData = useMemo(() => {
    const [year, month] = calendarMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
    const tdee = calcTDEE(profile);

    const days: { date: string; day: number; calories: number; surplus: number | null }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calendarMonth}-${String(d).padStart(2, '0')}`;
      const dayMeals = meals.filter((m) => m.date === dateStr);
      const totalCalories = dayMeals.reduce((sum, m) => sum + m.total_calories, 0);
      const surplus = dayMeals.length > 0 ? totalCalories - tdee : null;
      days.push({ date: dateStr, day: d, calories: totalCalories, surplus });
    }
    return { days, firstDayOfWeek, tdee };
  }, [calendarMonth, meals, profile]);

  // 切换月份
  const switchMonth = (delta: number) => {
    const [y, m] = calendarMonth.split('-').map(Number);
    const newMonth = m + delta;
    if (newMonth < 1) {
      setCalendarMonth(`${y - 1}-12`);
    } else if (newMonth > 12) {
      setCalendarMonth(`${y + 1}-01`);
    } else {
      setCalendarMonth(`${y}-${String(newMonth).padStart(2, '0')}`);
    }
  };

  // 录入体重
  const handleAddWeight = () => {
    const w = Number(weightInput);
    if (!w || w <= 0) return;
    const today = getTodayStr();
    addWeight({ date: today, weight: w });
    setWeightInput('');
  };

  // 流式生成 AI 周报
  const handleGenerateReportStream = async () => {
    setReportLoading(true);
    setReportError('');
    setReportText('');

    try {
      await generateWeeklyReport(
        calorieChartData,
        goal || { dailyCalories: 0, carbs: 0, protein: 0, fat: 0 },
        profile,
        (text) => setReportText(text),
      );
    } catch (e: any) {
      setReportError(e.message || '生成周报失败');
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <div className="space-y-4 pb-4">
      {/* 标题 */}
      <h2 className="text-lg font-bold text-gray-100 flex items-center gap-2">
        <CartoonIcon name="nav-history" size="lg" /> 战绩回顾
      </h2>
      <p className="nuo-speech -mt-2">常熟可能瘦了，但是常熟瘦了不太可能——上秤验证一下，啊你知道吧</p>

      {/* 体重录入 */}
      <div className="card space-y-3">
        <SectionHeading icon="weight">上秤看看</SectionHeading>
        <div className="flex gap-2">
          <input
            type="number"
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
            className="input-field"
            placeholder="那我问你，今天多少斤？(kg)"
            step="0.1"
          />
          <button onClick={handleAddWeight} className="btn-primary whitespace-nowrap">
            记上
          </button>
        </div>
      </div>

      {/* 体重折线图 */}
      <div className="card">
        <SectionHeading icon="chart">体重走势 (近30天)</SectionHeading>
        {weightChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={weightChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, backgroundColor: '#1f2937', border: '1px solid #374151', color: '#e5e7eb' }}
                formatter={(v: any) => [`${v} kg`, '体重']}
              />
              <Line
                type="monotone"
                dataKey="weight"
                stroke="#f97316"
                strokeWidth={2}
                dot={{ r: 3, fill: '#f97316' }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-gray-500 text-center py-8">还没上过秤呢铁子！头顶尖尖的也得知道多重啊</p>
        )}
      </div>

      {/* 热量柱状图 */}
      <div className="card">
        <SectionHeading icon="fire">每日吃多少 (近7天)</SectionHeading>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={calorieChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, backgroundColor: '#1f2937', border: '1px solid #374151', color: '#e5e7eb' }}
              formatter={(v: any) => [`${v} kcal`, '热量']}
            />
            {goal && (
              <ReferenceLine
                y={goal.dailyCalories}
                stroke="#ef4444"
                strokeDasharray="5 5"
                label={{ value: '目标', fontSize: 10, fill: '#ef4444' }}
              />
            )}
            <Bar dataKey="calories" fill="#f97316" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 热量盈余日历 */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <SectionHeading icon="calendar" className="mb-0">每日热量战绩</SectionHeading>
          <div className="flex items-center gap-2">
            <button
              onClick={() => switchMonth(-1)}
              className="w-7 h-7 rounded-lg bg-gray-700 text-gray-300 flex items-center justify-center hover:bg-gray-600 text-sm"
            >
              ‹
            </button>
            <span className="text-sm font-medium text-gray-200 min-w-[70px] text-center">
              {calendarMonth}
            </span>
            <button
              onClick={() => switchMonth(1)}
              className="w-7 h-7 rounded-lg bg-gray-700 text-gray-300 flex items-center justify-center hover:bg-gray-600 text-sm"
            >
              ›
            </button>
          </div>
        </div>

        {/* 图例 */}
        <div className="flex items-center gap-3 text-[10px] text-gray-400">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-green-500/20 border border-green-500/50" /> 缺口(减脂)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-red-500/20 border border-red-500/50" /> 吃多了
          </span>
          <span>每天烧 {Math.round(calendarData.tdee)} kcal</span>
        </div>

        {/* 星期表头 */}
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-gray-500">
          {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
            <div key={d} className="py-1">{d}</div>
          ))}
        </div>

        {/* 日历网格 */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: calendarData.firstDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {calendarData.days.map((d) => {
            const isToday = d.date === getTodayStr();
            const hasRecord = d.surplus !== null;
            const isOver = hasRecord && d.surplus! > 0;
            const isDeficit = hasRecord && d.surplus! < 0;
            return (
              <div
                key={d.date}
                className={`aspect-square rounded-lg flex flex-col items-center justify-center text-[10px] border ${
                  hasRecord
                    ? isOver
                      ? 'bg-red-500/10 border-red-500/30'
                      : isDeficit
                      ? 'bg-green-500/10 border-green-500/30'
                      : 'bg-gray-700/50 border-gray-600'
                    : 'bg-gray-800 border-transparent'
                } ${isToday ? 'ring-2 ring-primary-500 ring-offset-1 ring-offset-gray-800' : ''}`}
              >
                <span
                  className={`font-medium ${
                    hasRecord
                      ? isOver
                        ? 'text-red-400'
                        : isDeficit
                        ? 'text-green-400'
                        : 'text-gray-300'
                      : 'text-gray-600'
                  }`}
                >
                  {d.day}
                </span>
                {hasRecord && (
                  <span
                    className={`text-[8px] leading-tight ${
                      isOver ? 'text-red-400' : isDeficit ? 'text-green-400' : 'text-gray-500'
                    }`}
                  >
                    {d.surplus! > 0
                      ? `+${Math.round(d.surplus!)}`
                      : `${Math.round(d.surplus!)}`}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* AI 周报 */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <SectionHeading icon="report" className="mb-0">诺神周报</SectionHeading>
          <button
            onClick={handleGenerateReportStream}
            disabled={reportLoading}
            className="btn-primary text-xs px-3 py-1.5"
          >
            {reportLoading ? '诺神写报告中...' : '让诺神总结'}
          </button>
        </div>

        {reportError && (
          <p className="text-xs text-red-400">{reportError}</p>
        )}

        {reportLoading && !reportText && (
          <SkeletonCard />
        )}

        {reportText && (
          <div className="bg-gray-700/50 rounded-lg p-3 text-sm text-gray-200 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
            {reportText}
            {reportLoading && (
              <span className="inline-block w-2 h-4 bg-primary-500 ml-0.5 animate-pulse" />
            )}
          </div>
        )}

        {!reportLoading && !reportText && !reportError && (
          <p className="text-xs text-gray-500 text-center py-2">
            点「让诺神总结」看看这周练得咋样，听见没有！
          </p>
        )}
      </div>
    </div>
  );
};
