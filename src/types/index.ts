// ============================================================
// 类型定义 - 饮食打卡 & 减脂管理
// ============================================================

import type { IconName } from '../constants/icons';

/** 性别 */
export type Gender = 'male' | 'female';

/** 活动水平 */
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active';

/** 用户个人资料 */
export interface UserProfile {
  height: number;       // cm
  weight: number;       // kg
  age: number;
  gender: Gender;
  activityLevel: ActivityLevel;
  targetWeight: number; // kg
  targetDate: string;   // YYYY-MM-DD
  reminderTimes: string[]; // ['12:00', '18:00']
}

/** AI 生成的营养目标 */
export interface NutritionGoal {
  dailyCalories: number;  // 每日热量上限 kcal
  carbs: number;          // 碳水 g
  protein: number;        // 蛋白质 g
  fat: number;            // 脂肪 g
  advice?: string;        // AI 建议
}

/** 单个食物项 */
export interface FoodItem {
  name: string;
  amount: string;   // 估算克数
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
}

/** 一餐的识别结果 */
export interface MealResult {
  foods: FoodItem[];
  total_calories: number;
  total_carbs: number;
  total_protein: number;
  total_fat: number;
  meal_description: string;
}

/** 餐次类型 */
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/** 餐次配置 */
export const MEAL_TYPES: { key: MealType; label: string; icon: IconName; color: string }[] = [
  { key: 'breakfast', label: '早餐', icon: 'meal-breakfast', color: 'text-orange-500' },
  { key: 'lunch', label: '午餐', icon: 'meal-lunch', color: 'text-yellow-500' },
  { key: 'dinner', label: '晚餐', icon: 'meal-dinner', color: 'text-indigo-500' },
  { key: 'snack', label: '加餐', icon: 'meal-snack', color: 'text-green-500' },
];

/** 根据时间自动推断餐次 */
export function inferMealType(time: string): MealType {
  const hour = parseInt(time.split(':')[0], 10);
  if (hour >= 5 && hour < 10) return 'breakfast';
  if (hour >= 10 && hour < 14) return 'lunch';
  if (hour >= 14 && hour < 17) return 'snack';
  if (hour >= 17 && hour < 22) return 'dinner';
  return 'snack';
}

/** 已记录的餐食 */
export interface MealEntry extends MealResult {
  id: string;
  date: string;     // YYYY-MM-DD
  time: string;     // HH:mm
  mealType: MealType; // 餐次
  imageBase64?: string;
}

/** 推荐食谱 - 单个餐次推荐 */
export interface MealPlanItem {
  mealType: MealType;
  description: string;       // 餐食描述，如"鸡胸肉蔬菜沙拉"
  foods: FoodItem[];         // 推荐食物列表
  total_calories: number;
  total_carbs: number;
  total_protein: number;
  total_fat: number;
}

/** 推荐食谱 - 全天计划 */
export interface MealPlan {
  items: MealPlanItem[];      // 各餐次推荐
  total_calories: number;     // 全天总热量
  total_carbs: number;
  total_protein: number;
  total_fat: number;
  advice: string;             // 饮食建议
}

/** 体重记录 */
export interface WeightEntry {
  date: string;   // YYYY-MM-DD
  weight: number; // kg
}

/** BMI 评级 */
export interface BmiResult {
  value: number;
  level: string;     // 偏瘦/正常/超重/肥胖
  color: string;     // tailwind color class
}

/** 活动水平映射 */
export const ACTIVITY_FACTORS: Record<ActivityLevel, { label: string; factor: number }> = {
  sedentary: { label: '久坐', factor: 1.2 },
  light: { label: '轻度活动', factor: 1.375 },
  moderate: { label: '中度活动', factor: 1.55 },
  active: { label: '高度活动', factor: 1.725 },
};

// ============================================================
// 健身计划 & 运动打卡（分化训练 + 有氧搭配）
// ============================================================

/** 训练方式 */
export type TrainingStyle = 'strength' | 'cardio' | 'hiit' | 'yoga' | 'mixed';

/** 训练方式配置 */
export const TRAINING_STYLES: { key: TrainingStyle; label: string; icon: IconName; desc: string }[] = [
  { key: 'strength', label: '力量训练', icon: 'strength', desc: '增肌塑形，提升基础代谢' },
  { key: 'cardio', label: '有氧运动', icon: 'cardio', desc: '燃脂心肺，持续消耗' },
  { key: 'hiit', label: 'HIIT间歇', icon: 'hiit', desc: '短时高效，后燃效应' },
  { key: 'yoga', label: '瑜伽拉伸', icon: 'yoga', desc: '柔韧放松，身心平衡' },
  { key: 'mixed', label: '混合训练', icon: 'mixed', desc: '力量有氧结合，全面发展' },
];

/** 分化训练方式 */
export type SplitType = 'fullbody' | 'upperlower' | 'ppl' | 'bro' | 'custom';

/** 分化方式配置 */
export const SPLIT_TYPES: { key: SplitType; label: string; icon: IconName; desc: string; dayCount: number }[] = [
  { key: 'fullbody', label: '全身训练', icon: 'fullbody', desc: '每次练全身，适合新手', dayCount: 3 },
  { key: 'upperlower', label: '上下分化', icon: 'upperlower', desc: '上肢/下肢交替，4天循环', dayCount: 4 },
  { key: 'ppl', label: '推拉腿', icon: 'ppl', desc: '推/拉/腿循环，6天一轮', dayCount: 6 },
  { key: 'bro', label: '单肌群', icon: 'bro', desc: '每天一个肌群，健美式', dayCount: 5 },
  { key: 'custom', label: '自定义', icon: 'custom', desc: '自由编排训练日', dayCount: 0 },
];

/** 单个训练动作 */
export interface Exercise {
  id: string;              // 唯一ID（支持增删）
  name: string;            // 动作名称
  sets: number;            // 组数
  reps: string;            // 次数/时长，如 "12次" 或 "30秒"
  rest: string;            // 组间休息，如 "60秒"
  caloriesPerSet: number;  // 每组消耗热量 kcal
  targetMuscle: string;    // 目标肌群
}

/** 有氧搭配配置 */
export interface CardioConfig {
  enabled: boolean;        // 是否搭配有氧
  type: string;            // 有氧类型（跑步/椭圆机/跳绳等）
  duration: number;        // 时长（分钟）
  caloriesPerMin: number;  // 每分钟消耗 kcal
}

/** 单个训练日 */
export interface WorkoutDay {
  id: string;              // 唯一ID
  name: string;            // 训练日名称（如"推日"、"上肢日"）
  focus: string;           // 训练重点（如"胸/肩/三头"）
  exercises: Exercise[];   // 动作列表
  cardio: CardioConfig;    // 有氧搭配
  duration: number;        // 训练时长（分钟）
}

/** 每周训练安排（索引0=周一, 6=周日，值为 dayId 或 null=休息日） */
export type WeeklySchedule = (string | null)[];

/** 周几标签 */
export const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 健身计划 */
export interface WorkoutPlan {
  splitType: SplitType;         // 分化方式
  daysPerWeek: number;          // 每周训练天数
  trainingStyle: TrainingStyle; // 训练方式
  days: WorkoutDay[];           // 训练日列表
  weeklySchedule: WeeklySchedule; // 每周训练安排（7天，null=休息）
  advice?: string;              // AI 建议
}

/** 每日健身打卡记录 */
export interface WorkoutLog {
  date: string;               // YYYY-MM-DD
  dayId: string;              // 对应的训练日ID
  completedExercises: string[]; // 已完成动作ID列表
  totalExercises: number;     // 总动作数
  duration: number;           // 实际训练时长（分钟）
  caloriesBurned: number;     // 运动消耗热量 kcal
  cardioCompleted: boolean;   // 有氧是否完成
  completed: boolean;         // 是否完成今日训练
}

// ============================================================
// AI API 设置（页面配置，localStorage 持久化）
// ============================================================

/** AI API 类型 */
export type ApiType = 'openai' | 'anthropic';

/** AI 设置 */
export interface AppSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  apiType: ApiType;
}

/** 默认设置（阿里云百炼 DashScope，国内可直接访问，无需翻墙） */
export const DEFAULT_SETTINGS: AppSettings = {
  apiKey: '',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode',
  model: 'qwen-vl-max',
  apiType: 'openai',
};

/** localStorage key */
const SETTINGS_KEY = 'diet_app_settings';

/** 加载设置 */
export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

/** 保存设置 */
export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
