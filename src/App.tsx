// ============================================================
// 头尖尖私教 - 主应用入口
// 底部 Tab 导航 + 三个页面
// ============================================================

import React, { useState, useMemo, useEffect } from 'react';
import { BottomNav } from './components/BottomNav';
import { CartoonIcon } from './components/CartoonIcon';
import { ProfileTab } from './pages/ProfileTab';
import { TodayTab } from './pages/TodayTab';
import { HistoryTab } from './pages/HistoryTab';
import { useCloudSingle, useCloudList } from './hooks/useCloudData';
import { useNotifications } from './hooks/useNotifications';
import { getTodayStr } from './utils/calculations';
import { COLLECTIONS } from './services/cloudDB';
import type { IconName } from './constants/icons';
import type { UserProfile, NutritionGoal, MealEntry, WeightEntry, WorkoutPlan, WorkoutLog } from './types';

interface NavTab {
  key: string;
  label: string;
  icon: IconName;
}

const DEFAULT_PROFILE: UserProfile = {
  height: 0,
  weight: 0,
  age: 0,
  gender: 'male',
  activityLevel: 'sedentary',
  targetWeight: 0,
  targetDate: '',
  reminderTimes: ['12:00', '18:00'],
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('today'); // 今日干饭为首页

  // 持久化数据 —— 云端优先 + 本地降级 + 自动迁移
  // 单文档类型用 useCloudSingle，列表类型用 useCloudList
  const [profile, setProfile] = useCloudSingle<UserProfile>('profile', COLLECTIONS.profile, DEFAULT_PROFILE);
  const [goal, setGoal] = useCloudSingle<NutritionGoal | null>('goal', COLLECTIONS.goal, null);
  const [meals, mealsApi] = useCloudList<MealEntry>('meals', COLLECTIONS.meals, []);
  const [weights, weightsApi] = useCloudList<WeightEntry>('weights', COLLECTIONS.weights, [], 'date');
  const [workoutPlan, setWorkoutPlan] = useCloudSingle<WorkoutPlan | null>('workoutPlan', COLLECTIONS.workoutPlan, null);
  const [workoutLogs, workoutLogsApi] = useCloudList<WorkoutLog>('workoutLogs', COLLECTIONS.workoutLogs, [], 'date');

  // 数据迁移：
  // 1) 无 days 字段的极旧格式 → 清除
  // 2) 有 days 但无 weeklySchedule → 补默认排布
  // 在渲染前同步校验，避免子组件首次渲染时崩溃
  const safeWorkoutPlan = useMemo(() => {
    if (!workoutPlan) return null;
    // 极旧格式：无 days
    if (!Array.isArray((workoutPlan as any).days)) {
      console.warn('[迁移] 检测到旧格式 workoutPlan（无days），已清除');
      return null;
    }
    // 旧格式：有 days 但无 weeklySchedule，补默认排布
    if (!Array.isArray((workoutPlan as any).weeklySchedule)) {
      const layouts: Record<number, number[]> = {
        1: [0], 2: [0, 2], 3: [0, 2, 4], 4: [0, 1, 3, 4],
        5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6],
      };
      const slots = layouts[workoutPlan.days.length] || [0, 2, 4];
      const sched: (string | null)[] = [null, null, null, null, null, null, null];
      workoutPlan.days.forEach((d, i) => { if (i < slots.length) sched[slots[i]] = d.id; });
      return { ...workoutPlan, weeklySchedule: sched };
    }
    return workoutPlan;
  }, [workoutPlan]);
  const safeWorkoutLogs = safeWorkoutPlan ? workoutLogs : [];
  // 若被迁移修改，同步写入云端
  useEffect(() => {
    if (!workoutPlan) return;
    if (!Array.isArray((workoutPlan as any).days)) {
      setWorkoutPlan(null);
      workoutLogsApi.update([]);
    } else if (!Array.isArray((workoutPlan as any).weeklySchedule)) {
      // 触发 safeWorkoutPlan 的计算结果写入
      setWorkoutPlan(safeWorkoutPlan);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 计算今日摄入
  const todayIntake = useMemo(() => {
    const today = getTodayStr();
    return meals
      .filter((m) => m.date === today)
      .reduce(
        (acc, m) => ({
          calories: acc.calories + m.total_calories,
          carbs: acc.carbs + m.total_carbs,
          protein: acc.protein + m.total_protein,
          fat: acc.fat + m.total_fat,
        }),
        { calories: 0, carbs: 0, protein: 0, fat: 0 }
      );
  }, [meals]);

  // 通知提醒
  useNotifications(profile.reminderTimes, goal, todayIntake);

  // 添加餐食（云端 + 本地双写）
  const addMeal = (entry: MealEntry) => {
    mealsApi.add(entry);
  };

  // 删除餐食
  const deleteMeal = (id: string) => {
    mealsApi.remove(id);
  };

  // 添加体重（同一天去重后全量替换）
  const addWeight = (entry: WeightEntry) => {
    const filtered = weights.filter((w) => w.date !== entry.date);
    const next = [...filtered, entry].sort((a, b) => a.date.localeCompare(b.date));
    weightsApi.replaceAll(next);
  };

  // 更新健身打卡（同一天覆盖后全量替换）
  const updateWorkoutLog = (log: WorkoutLog) => {
    const filtered = workoutLogs.filter((w) => w.date !== log.date);
    const next = [...filtered, log];
    workoutLogsApi.update(next);
  };

  const tabs: NavTab[] = [
    { key: 'today', label: '今日干饭', icon: 'nav-today' },
    { key: 'history', label: '战绩回顾', icon: 'nav-history' },
    { key: 'profile', label: '诺神配置', icon: 'nav-profile' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 flex justify-center">
      <div className="w-full max-w-mobile min-h-screen bg-gray-950 relative">
        {/* 顶栏 —— 头尖尖私教 */}
        <header className="app-header sticky top-0 z-40 bg-gray-950/90 backdrop-blur-md border-b border-gray-800/50">
          <div className="flex items-center justify-center gap-2">
            <CartoonIcon name="logo" size="lg" className="rounded-full ring-2 ring-primary-500/30" />
            <h1 className="text-base font-bold bg-gradient-to-r from-primary-400 to-accent-gold bg-clip-text text-transparent">
              头尖尖私教
            </h1>
            <span className="nuo-badge">诺神出品</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5">那我问你，今天练了没？</p>
        </header>

        {/* 页面内容 */}
        <main className="px-4 pb-24 pt-1">
          {activeTab === 'profile' && (
            <ProfileTab
              profile={profile}
              setProfile={setProfile}
              goal={goal}
              setGoal={setGoal}
              workoutPlan={safeWorkoutPlan}
              setWorkoutPlan={setWorkoutPlan}
            />
          )}
          {activeTab === 'today' && (
            <TodayTab
              goal={goal}
              meals={meals}
              addMeal={addMeal}
              deleteMeal={deleteMeal}
              profile={profile}
              workoutPlan={safeWorkoutPlan}
              setWorkoutPlan={setWorkoutPlan}
              workoutLogs={safeWorkoutLogs}
              updateWorkoutLog={updateWorkoutLog}
            />
          )}
          {activeTab === 'history' && (
            <HistoryTab
              goal={goal}
              meals={meals}
              weights={weights}
              addWeight={addWeight}
              profile={profile}
            />
          )}
        </main>

        {/* 底部导航 */}
        <BottomNav tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </div>
  );
};

export default App;
