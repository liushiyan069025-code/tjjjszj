// ============================================================
// 计算工具函数 - BMI / BMR / TDEE
// ============================================================

import type { UserProfile, BmiResult, ActivityLevel, Exercise, WorkoutDay, CardioConfig } from '../types';
import { ACTIVITY_FACTORS } from '../types';

/** 计算 BMI */
export function calcBMI(weightKg: number, heightCm: number): BmiResult {
  if (!weightKg || !heightCm) return { value: 0, level: '未知', color: 'text-gray-400' };
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);

  if (bmi < 18.5) return { value: Math.round(bmi * 10) / 10, level: '偏瘦', color: 'text-blue-500' };
  if (bmi < 24) return { value: Math.round(bmi * 10) / 10, level: '正常', color: 'text-primary-600' };
  if (bmi < 28) return { value: Math.round(bmi * 10) / 10, level: '超重', color: 'text-orange-500' };
  return { value: Math.round(bmi * 10) / 10, level: '肥胖', color: 'text-red-500' };
}

/**
 * 计算 BMR (基础代谢率)
 * 使用 Mifflin-St Jeor 公式
 * 男性: BMR = 10*体重 + 6.25*身高 - 5*年龄 + 5
 * 女性: BMR = 10*体重 + 6.25*身高 - 5*年龄 - 161
 */
export function calcBMR(profile: UserProfile): number {
  const { weight, height, age, gender } = profile;
  if (!weight || !height || !age) return 0;
  const base = 10 * weight + 6.25 * height - 5 * age;
  return Math.round(gender === 'male' ? base + 5 : base - 161);
}

/** 计算 TDEE (每日总消耗) */
export function calcTDEE(profile: UserProfile): number {
  const bmr = calcBMR(profile);
  const factor = ACTIVITY_FACTORS[profile.activityLevel as ActivityLevel]?.factor ?? 1.2;
  return Math.round(bmr * factor);
}

/** 获取今日日期 YYYY-MM-DD */
export function getTodayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 获取当前时间 HH:mm */
export function getNowTimeStr(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 获取最近 N 天的日期数组 */
export function getRecentDates(days: number): string[] {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${day}`);
  }
  return dates;
}

/** 格式化日期为 MM-DD */
export function formatDateShort(dateStr: string): string {
  const parts = dateStr.split('-');
  return `${parts[1]}-${parts[2]}`;
}

/** 计算距目标日期剩余天数 */
export function daysUntilTarget(targetDate: string): number {
  const target = new Date(targetDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ============================================================
// 训练热量计算
// ============================================================

/** 生成唯一ID */
export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 计算单个动作总消耗（组数 × 每组消耗） */
export function calcExerciseCalories(ex: Exercise): number {
  return (ex.caloriesPerSet || 0) * (ex.sets || 1);
}

/** 计算有氧消耗 */
export function calcCardioCalories(cardio: CardioConfig): number {
  if (!cardio.enabled) return 0;
  return (cardio.caloriesPerMin || 0) * (cardio.duration || 0);
}

/** 计算训练日力量部分消耗 */
export function calcDayStrengthCalories(day: WorkoutDay): number {
  return day.exercises.reduce((sum, ex) => sum + calcExerciseCalories(ex), 0);
}

/** 计算训练日总消耗（力量 + 有氧） */
export function calcDayTotalCalories(day: WorkoutDay): number {
  return calcDayStrengthCalories(day) + calcCardioCalories(day.cardio);
}

/** 计算训练日总时长（力量估算 + 有氧） */
export function calcDayDuration(day: WorkoutDay): number {
  // 力量部分：每组约 1 分钟（含休息），粗略估算
  const strengthMin = day.exercises.reduce((sum, ex) => sum + (ex.sets || 1) * 1.5, 0);
  const cardioMin = day.cardio.enabled ? day.cardio.duration : 0;
  return Math.round(strengthMin + cardioMin);
}
