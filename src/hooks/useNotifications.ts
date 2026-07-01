// ============================================================
// useNotifications Hook - 浏览器通知提醒
// ============================================================

import { useEffect, useRef } from 'react';
import type { NutritionGoal } from '../types';

export function useNotifications(
  reminderTimes: string[],
  goal: NutritionGoal | null,
  todayIntake: { calories: number; carbs: number; protein: number; fat: number }
) {
  const lastNotifiedRef = useRef<Set<string>>(new Set());

  // 页面加载时请求通知权限
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // 每分钟检查是否需要推送提醒
  useEffect(() => {
    if (!goal || !reminderTimes.length) return;
    if ('Notification' in window && Notification.permission !== 'granted') return;

    const interval = setInterval(() => {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      for (const rt of reminderTimes) {
        const key = `${rt}-${now.toDateString()}`;
        if (rt === currentTime && !lastNotifiedRef.current.has(key)) {
          lastNotifiedRef.current.add(key);

          const calRemain = goal.dailyCalories - todayIntake.calories;
          const carbsRemain = goal.carbs - todayIntake.carbs;
          const proteinRemain = goal.protein - todayIntake.protein;
          const fatRemain = goal.fat - todayIntake.fat;

          const title = '诺神喊你干饭了';
          const body = `那我问你，今天营养缺口：
热量还差 ${calRemain > 0 ? calRemain : 0} kcal
碳水 ${carbsRemain > 0 ? carbsRemain : 0}g | 蛋白 ${proteinRemain > 0 ? proteinRemain : 0}g | 脂肪 ${fatRemain > 0 ? fatRemain : 0}g
听见没有，赶紧安排！`;

          new Notification(title, { body, icon: '/icons/logo.png' });
        }
      }

      // 每天清空已通知记录
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        lastNotifiedRef.current.clear();
      }
    }, 60000); // 每分钟检查

    return () => clearInterval(interval);
  }, [reminderTimes, goal, todayIntake]);
}
