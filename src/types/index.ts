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

/** 网关路径模式 */
export type GatewayMode = 'standard' | 'dashscope' | 'full';

/** 鉴权头方式（部分公司网关用 api-key 而非 Bearer） */
export type AuthStyle = 'bearer' | 'api-key';

/** AI 设置 */
export interface AppSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  apiType: ApiType;
  /** 网关路径模式，默认 standard（公司统一网关） */
  gatewayMode?: GatewayMode;
  /** 鉴权方式，默认 bearer */
  authStyle?: AuthStyle;
}

/** 默认设置（阿里云百炼 DashScope，国内可直接访问，无需翻墙） */
export const DEFAULT_SETTINGS: AppSettings = {
  apiKey: '',
  baseUrl:
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEFAULT_GATEWAY_URL) ||
    'https://dashscope.aliyuncs.com/compatible-mode',
  model:
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEFAULT_MODEL) ||
    'qwen-vl-max',
  apiType: 'openai',
  gatewayMode: 'dashscope',
  authStyle: 'bearer',
};

/** localStorage key */
const SETTINGS_KEY = 'diet_app_settings';

/** 判断字符串是否像 API Key */
export function looksLikeApiKey(value: string): boolean {
  const v = value.trim();
  return /^sk-/i.test(v) || /^sk\.[a-z0-9_-]+$/i.test(v);
}

/** 判断字符串是否像 Base URL（含公司网关域名） */
export function looksLikeBaseUrl(value: string): boolean {
  const v = value.trim();
  if (!v || looksLikeApiKey(v)) return false;
  if (/^https?:\/\//i.test(v)) return true;
  // 无协议但像域名：gateway.company.com 或 gateway.company.com/v1
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}/i.test(v) || v.includes('://');
}

/**
 * 修复常见误填：Key 填进 Base URL、两框填反等。
 * 公司网关场景下 IT 常只发 Token，用户容易整段粘到「API 地址」。
 */
export function repairSettings(raw: Partial<AppSettings>): { settings: AppSettings; repaired: string[] } {
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...raw,
    apiKey: String(raw.apiKey ?? '').trim(),
    baseUrl: String(raw.baseUrl ?? '').trim(),
    model: String(raw.model ?? DEFAULT_SETTINGS.model).trim(),
    apiType: raw.apiType === 'anthropic' ? 'anthropic' : 'openai',
    gatewayMode: raw.gatewayMode === 'standard' || raw.gatewayMode === 'full' ? raw.gatewayMode : 'dashscope',
    authStyle: raw.authStyle === 'api-key' ? 'api-key' : 'bearer',
  };
  const repaired: string[] = [];

  const { baseUrl, apiKey } = settings;

  // 两框填反：地址框是 sk-，Key 框是 https://...
  if (looksLikeApiKey(baseUrl) && looksLikeBaseUrl(apiKey)) {
    settings.baseUrl = apiKey;
    settings.apiKey = baseUrl;
    repaired.push('已自动纠正：API Key 与 API 地址填反了，请确认后点「保存设置」。');
    return { settings, repaired };
  }

  // 只把 Token 粘进了「API 地址」，Key 框为空
  if (looksLikeApiKey(baseUrl) && !apiKey) {
    settings.apiKey = baseUrl;
    settings.baseUrl = DEFAULT_SETTINGS.baseUrl;
    repaired.push(
      '已自动纠正：Token 不应放在「API 地址」。\n' +
      '请在「API 地址」填写公司网关根地址（https://...），然后点「保存设置」。'
    );
    return { settings, repaired };
  }

  // 申通网关：应保留 compatible-mode（/v1 会 404，误删后 /v1 会 405）
  if (baseUrl.includes('devops-llmgateway.sto.cn')) {
    if (!/compatible-mode/i.test(baseUrl)) {
      settings.baseUrl = 'https://devops-llmgateway.sto.cn/compatible-mode/v1';
    }
    settings.gatewayMode = 'dashscope';
    if (!/compatible-mode/i.test(String(raw.baseUrl ?? ''))) {
      repaired.push('申通网关需使用 compatible-mode 路径，已改为 .../compatible-mode/v1');
    }
  }

  return { settings, repaired };
}

/** 加载设置（含自动修复误填） */
export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const { settings, repaired } = repairSettings(JSON.parse(raw));
      if (repaired.length) saveSettings(settings);
      return settings;
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

/** 加载设置并返回修复提示（供 UI 展示） */
export function loadSettingsWithRepairNotice(): { settings: AppSettings; repaired: string[] } {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const { settings, repaired } = repairSettings(JSON.parse(raw));
      if (repaired.length) saveSettings(settings);
      return { settings, repaired };
    }
  } catch { /* ignore */ }
  return { settings: { ...DEFAULT_SETTINGS }, repaired: [] };
}

/** 保存设置 */
export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
