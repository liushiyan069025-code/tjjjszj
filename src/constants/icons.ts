// ============================================================
// 手绘 doodle 风图标映射 —— 阿诺主题 AI 生图
// ============================================================

export type IconName =
  | 'logo'
  | 'nav-today' | 'nav-history' | 'nav-profile'
  | 'meal-breakfast' | 'meal-lunch' | 'meal-dinner' | 'meal-snack'
  | 'nutrient-carbs' | 'nutrient-protein' | 'nutrient-fat'
  | 'fire' | 'training' | 'rest' | 'cardio'
  | 'success' | 'warning' | 'error'
  | 'search' | 'robot'
  | 'chart' | 'weight' | 'calendar' | 'report' | 'target'
  | 'body' | 'metrics' | 'clock' | 'key' | 'dish' | 'clipboard'
  | 'skip-forward' | 'skip-back' | 'add'
  | 'strength' | 'hiit' | 'yoga' | 'mixed'
  | 'fullbody' | 'upperlower' | 'ppl' | 'bro' | 'custom';

/** 图标文件路径（public/icons/） */
export function iconSrc(name: IconName): string {
  // chart 与 nav-history 共用战绩图标
  const file = name === 'chart' ? 'nav-history' : name === 'strength' ? 'training' : name;
  return `/icons/${file}.png`;
}
