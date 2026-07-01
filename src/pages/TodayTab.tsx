// ============================================================
// 头尖尖私教 - 今日干饭页（首页）
// 热量环形图 + 营养素进度条 + 餐食分组 + AI食物识别
// ============================================================

import React, { useState, useRef, useMemo } from 'react';
import type { NutritionGoal, MealEntry, MealResult, FoodItem, MealType, UserProfile, WorkoutPlan, WorkoutLog, WorkoutDay, Exercise, MealPlan } from '../types';
import { MEAL_TYPES, inferMealType, WEEKDAY_LABELS } from '../types';
import { getTodayStr, getNowTimeStr, calcTDEE, genId, calcExerciseCalories, calcCardioCalories, calcDayTotalCalories, calcDayDuration } from '../utils/calculations';
import { recognizeFoodImage, generateMealPlan } from '../services/aiService';
import { CalorieRing } from '../components/CalorieRing';
import { NutrientBar } from '../components/NutrientBar';
import { MealCard } from '../components/MealCard';
import { CartoonIcon, SectionHeading } from '../components/CartoonIcon';
import { SkeletonCard } from '../components/Skeleton';

interface TodayTabProps {
  goal: NutritionGoal | null;
  meals: MealEntry[];
  addMeal: (entry: MealEntry) => void;
  deleteMeal: (id: string) => void;
  profile: UserProfile;
  workoutPlan: WorkoutPlan | null;
  setWorkoutPlan: (plan: WorkoutPlan | null) => void;
  workoutLogs: WorkoutLog[];
  updateWorkoutLog: (log: WorkoutLog) => void;
}

export const TodayTab: React.FC<TodayTabProps> = ({ goal, meals, addMeal, deleteMeal, profile, workoutPlan, setWorkoutPlan, workoutLogs, updateWorkoutLog }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recognizeResult, setRecognizeResult] = useState<MealResult | null>(null);
  const [previewImage, setPreviewImage] = useState('');
  const [selectedMealType, setSelectedMealType] = useState<MealType>('breakfast');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 推荐食谱状态
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);
  const [mealPlanLoading, setMealPlanLoading] = useState(false);
  const [mealPlanError, setMealPlanError] = useState('');
  const [expandedMeal, setExpandedMeal] = useState<string | null>(null);

  const today = getTodayStr();
  const todayMeals = meals.filter((m) => m.date === today);

  // 计算今日总摄入
  const todayIntake = useMemo(() => {
    return todayMeals.reduce(
      (acc, m) => ({
        calories: acc.calories + m.total_calories,
        carbs: acc.carbs + m.total_carbs,
        protein: acc.protein + m.total_protein,
        fat: acc.fat + m.total_fat,
      }),
      { calories: 0, carbs: 0, protein: 0, fat: 0 }
    );
  }, [todayMeals]);

  // 按餐次分组
  const mealsByType = useMemo(() => {
    const groups: Record<MealType, MealEntry[]> = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: [],
    };
    todayMeals.forEach((m) => {
      const type = m.mealType || inferMealType(m.time);
      groups[type].push(m);
    });
    return groups;
  }, [todayMeals]);

  // 每餐小计
  const mealTypeCalories = useMemo(() => {
    const result: Record<MealType, number> = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
    (Object.keys(mealsByType) as MealType[]).forEach((type) => {
      result[type] = mealsByType[type].reduce((sum, m) => sum + m.total_calories, 0);
    });
    return result;
  }, [mealsByType]);

  // 处理图片上传
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setLoading(true);
    setRecognizeResult(null);

    // 转换为 base64
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      setPreviewImage(base64);

      try {
        const result = await recognizeFoodImage(base64);
        setRecognizeResult(result);
      } catch (err: any) {
        setError(err.message || '食物识别失败');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // 手动微调食物数值
  const updateFood = (index: number, field: keyof FoodItem, value: any) => {
    if (!recognizeResult) return;
    const newFoods = [...recognizeResult.foods];
    newFoods[index] = { ...newFoods[index], [field]: value };
    // 重新计算总计
    const totals = newFoods.reduce(
      (acc, f) => ({
        calories: acc.calories + Number(f.calories) || 0,
        carbs: acc.carbs + Number(f.carbs) || 0,
        protein: acc.protein + Number(f.protein) || 0,
        fat: acc.fat + Number(f.fat) || 0,
      }),
      { calories: 0, carbs: 0, protein: 0, fat: 0 }
    );
    setRecognizeResult({ ...recognizeResult, foods: newFoods, ...totals });
  };

  // 确认入账
  const handleConfirm = () => {
    if (!recognizeResult) return;
    const now = getNowTimeStr();
    const entry: MealEntry = {
      ...recognizeResult,
      id: `${Date.now()}`,
      date: today,
      time: now,
      mealType: selectedMealType,
      imageBase64: previewImage,
    };
    addMeal(entry);
    setRecognizeResult(null);
    setPreviewImage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 取消识别
  const handleCancel = () => {
    setRecognizeResult(null);
    setPreviewImage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 触发文件上传
  const triggerUpload = (mealType: MealType) => {
    setSelectedMealType(mealType);
    fileInputRef.current?.click();
  };

  // ===== 健身打卡 & 热量缺口 =====
  const tdee = calcTDEE(profile);
  const [overrideDayId, setOverrideDayId] = useState<string>(''); // 休息日"提前训练"用

  // 今日健身打卡记录
  const todayWorkoutLog = useMemo(() => {
    return workoutLogs.find((w) => w.date === today) || null;
  }, [workoutLogs, today]);

  // 今天星期几（0=周一, 6=周日）
  const todayWeekday = useMemo(() => {
    const day = new Date().getDay(); // 0=周日, 1=周一...
    return day === 0 ? 6 : day - 1; // 转为 0=周一
  }, []);

  // 今天计划训练的 dayId（null=休息日）
  const scheduledDayId = useMemo(() => {
    if (!workoutPlan?.weeklySchedule) return null;
    return workoutPlan.weeklySchedule[todayWeekday] || null;
  }, [workoutPlan, todayWeekday]);

  // 下一个训练日（从明天开始往后找）
  const nextTrainingDay = useMemo(() => {
    if (!workoutPlan?.weeklySchedule) return null;
    for (let i = 1; i <= 7; i++) {
      const idx = (todayWeekday + i) % 7;
      const did = workoutPlan.weeklySchedule[idx];
      if (did) {
        const day = workoutPlan.days.find((d) => d.id === did);
        if (day) return { day, weekday: idx };
      }
    }
    return null;
  }, [workoutPlan, todayWeekday]);

  // 当前训练日：优先用打卡记录的 dayId，其次"提前训练"覆盖，最后按日程
  const currentDay = useMemo(() => {
    if (!workoutPlan || workoutPlan.days.length === 0) return null;
    // 1) 如果今天已有打卡记录，用记录中的 dayId
    if (todayWorkoutLog?.dayId) {
      const d = workoutPlan.days.find((dd) => dd.id === todayWorkoutLog.dayId);
      if (d) return d;
    }
    // 2) 如果用户点了"提前训练"，用覆盖的 dayId
    if (overrideDayId) {
      const d = workoutPlan.days.find((dd) => dd.id === overrideDayId);
      if (d) return d;
    }
    // 3) 按日程：今天有训练就返回，休息日返回 null
    if (scheduledDayId) {
      return workoutPlan.days.find((d) => d.id === scheduledDayId) || null;
    }
    return null;
  }, [workoutPlan, todayWorkoutLog, overrideDayId, scheduledDayId]);

  // 是否休息日（今天日程为空且没有打卡记录且没有覆盖）
  const isRestDay = !scheduledDayId && !todayWorkoutLog?.dayId && !overrideDayId;

  // 运动消耗热量
  const exerciseCalories = todayWorkoutLog?.caloriesBurned || 0;

  // 热量缺口 = 摄入 - 日常代谢(TDEE) - 运动消耗
  const calorieDeficit = useMemo(() => {
    return todayIntake.calories - tdee - exerciseCalories;
  }, [todayIntake.calories, tdee, exerciseCalories]);

  // 提前训练：休息日时覆盖为指定训练日
  const handleOverrideDay = (dayId: string) => {
    setOverrideDayId(dayId);
  };

  // 今日不练：把今天的训练顺延到明天，如果明天也有训练则级联往后推
  const handleSkipToday = () => {
    if (!workoutPlan?.weeklySchedule || !scheduledDayId) return;
    const sched = [...workoutPlan.weeklySchedule];
    // 取出今天的训练 dayId，今天设为休息
    const todayDayId = sched[todayWeekday];
    sched[todayWeekday] = null;
    // 从明天开始往后找空位，级联推移
    let carry = todayDayId;
    for (let i = 1; i <= 7 && carry; i++) {
      const idx = (todayWeekday + i) % 7;
      if (!sched[idx]) {
        // 找到空位，放入
        sched[idx] = carry;
        carry = null;
      } else {
        // 该位置已有训练，交换：把当前位的训练往后推，今天的训练放进来
        const tmp = sched[idx];
        sched[idx] = carry;
        carry = tmp;
      }
    }
    setWorkoutPlan({ ...workoutPlan, weeklySchedule: sched });
  };

  // 生成推荐食谱
  const handleGenerateMealPlan = async () => {
    if (!goal) return;
    setMealPlanLoading(true);
    setMealPlanError('');
    try {
      const eatenMeals = todayMeals.map((m) => ({
        mealType: m.mealType,
        calories: m.total_calories,
        description: m.meal_description,
      }));
      const result = await generateMealPlan(goal, profile, eatenMeals);
      setMealPlan(result);
    } catch (e: any) {
      setMealPlanError(e.message || '推荐食谱生成失败');
    } finally {
      setMealPlanLoading(false);
    }
  };

  // 一键添加推荐食谱到餐次记录
  const addMealPlanItem = (item: MealPlan['items'][0]) => {
    const entry: MealEntry = {
      id: genId(),
      date: today,
      time: getNowTimeStr(),
      mealType: item.mealType,
      foods: item.foods,
      total_calories: item.total_calories,
      total_carbs: item.total_carbs,
      total_protein: item.total_protein,
      total_fat: item.total_fat,
      meal_description: item.description,
    };
    addMeal(entry);
  };

  // 切换动作完成状态
  const toggleExercise = (exerciseId: string) => {
    if (!workoutPlan || !currentDay) return;
    const completed = todayWorkoutLog?.completedExercises || [];
    const newCompleted = completed.includes(exerciseId)
      ? completed.filter((n) => n !== exerciseId)
      : [...completed, exerciseId];

    // 计算已完成动作的消耗
    const burnedCalories = currentDay.exercises
      .filter((ex) => newCompleted.includes(ex.id))
      .reduce((sum, ex) => sum + calcExerciseCalories(ex), 0);

    // 加上有氧消耗（如果完成）
    const cardioCal = todayWorkoutLog?.cardioCompleted ? calcCardioCalories(currentDay.cardio) : 0;

    const log: WorkoutLog = {
      date: today,
      dayId: currentDay.id,
      completedExercises: newCompleted,
      totalExercises: currentDay.exercises.length,
      duration: currentDay.duration,
      caloriesBurned: burnedCalories + cardioCal,
      cardioCompleted: todayWorkoutLog?.cardioCompleted || false,
      completed: newCompleted.length === currentDay.exercises.length && (!currentDay.cardio.enabled || (todayWorkoutLog?.cardioCompleted || false)),
    };
    updateWorkoutLog(log);
  };

  // 切换有氧完成状态
  const toggleCardio = () => {
    if (!workoutPlan || !currentDay || !currentDay.cardio.enabled) return;
    const newCardioCompleted = !todayWorkoutLog?.cardioCompleted;
    const completed = todayWorkoutLog?.completedExercises || [];

    const burnedCalories = currentDay.exercises
      .filter((ex) => completed.includes(ex.id))
      .reduce((sum, ex) => sum + calcExerciseCalories(ex), 0);
    const cardioCal = newCardioCompleted ? calcCardioCalories(currentDay.cardio) : 0;

    const log: WorkoutLog = {
      date: today,
      dayId: currentDay.id,
      completedExercises: completed,
      totalExercises: currentDay.exercises.length,
      duration: currentDay.duration,
      caloriesBurned: burnedCalories + cardioCal,
      cardioCompleted: newCardioCompleted,
      completed: completed.length === currentDay.exercises.length && (!currentDay.cardio.enabled || newCardioCompleted),
    };
    updateWorkoutLog(log);
  };

  // 今日新增动作到当前训练日
  const addExerciseToday = () => {
    if (!workoutPlan || !currentDay) return;
    const newEx: Exercise = {
      id: genId(),
      name: '新动作',
      sets: 3,
      reps: '12次',
      rest: '60秒',
      caloriesPerSet: 5,
      targetMuscle: currentDay.focus,
    };
    const newDay: WorkoutDay = {
      ...currentDay,
      exercises: [...currentDay.exercises, newEx],
      duration: 0,
    };
    newDay.duration = calcDayDuration(newDay);
    const newDays = workoutPlan.days.map((d) => (d.id === currentDay.id ? newDay : d));
    setWorkoutPlan({ ...workoutPlan, days: newDays });
  };

  // 今日删除动作
  const deleteExerciseToday = (exId: string) => {
    if (!workoutPlan || !currentDay) return;
    const newDay: WorkoutDay = {
      ...currentDay,
      exercises: currentDay.exercises.filter((ex) => ex.id !== exId),
      duration: 0,
    };
    newDay.duration = calcDayDuration(newDay);
    const newDays = workoutPlan.days.map((d) => (d.id === currentDay.id ? newDay : d));
    setWorkoutPlan({ ...workoutPlan, days: newDays });
    // 同时从打卡记录中移除
    if (todayWorkoutLog?.completedExercises.includes(exId)) {
      const newCompleted = todayWorkoutLog.completedExercises.filter((id) => id !== exId);
      const burnedCalories = newDay.exercises
        .filter((ex) => newCompleted.includes(ex.id))
        .reduce((sum, ex) => sum + calcExerciseCalories(ex), 0);
      const cardioCal = todayWorkoutLog.cardioCompleted ? calcCardioCalories(newDay.cardio) : 0;
      updateWorkoutLog({
        ...todayWorkoutLog,
        completedExercises: newCompleted,
        totalExercises: newDay.exercises.length,
        caloriesBurned: burnedCalories + cardioCal,
        completed: newCompleted.length === newDay.exercises.length && (!newDay.cardio.enabled || todayWorkoutLog.cardioCompleted),
      });
    }
  };

  // 今日更新动作字段（预留：编辑动作的重量/组数等字段）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const updateExerciseToday = (exId: string, field: keyof Exercise, value: any) => {
    if (!workoutPlan || !currentDay) return;
    const newDay: WorkoutDay = {
      ...currentDay,
      exercises: currentDay.exercises.map((ex) => (ex.id === exId ? { ...ex, [field]: value } : ex)),
      duration: 0,
    };
    newDay.duration = calcDayDuration(newDay);
    const newDays = workoutPlan.days.map((d) => (d.id === currentDay.id ? newDay : d));
    setWorkoutPlan({ ...workoutPlan, days: newDays });
  };

  return (
    <div className="space-y-4 pb-4">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-100 flex items-center gap-2">
          <CartoonIcon name="fire" size="lg" /> 今日干饭
        </h2>
        <span className="text-xs text-gray-400">{today}</span>
      </div>

      {/* 热量环形图 + 热量缺口 */}
      {goal ? (
        <div className="card-anuo flex flex-col items-center">
          <CalorieRing
            consumed={todayIntake.calories}
            target={tdee + exerciseCalories}
            goalLine={goal.dailyCalories}
          />
          {/* 各餐小计 */}
          <div className="grid grid-cols-4 gap-2 w-full mt-3">
            {MEAL_TYPES.map((mt) => (
              <div key={mt.key} className="text-center bg-gray-700/50 rounded-lg py-1.5">
                <div className={`text-sm font-bold ${mt.color}`}>{mealTypeCalories[mt.key]}</div>
                <div className="text-[10px] text-gray-400">{mt.label}</div>
              </div>
            ))}
          </div>

          {/* 热量缺口 */}
          {profile.weight > 0 && (
            <div className="w-full mt-3 space-y-2">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-orange-500/10 rounded-lg p-2.5">
                  <div className="text-lg font-bold text-orange-400">{todayIntake.calories}</div>
                  <div className="text-[10px] text-gray-400">吃进去的</div>
                </div>
                <div className="bg-blue-500/10 rounded-lg p-2.5">
                  <div className="text-lg font-bold text-blue-400">{tdee}</div>
                  <div className="text-[10px] text-gray-400">身体烧的</div>
                </div>
                <div className="bg-purple-500/10 rounded-lg p-2.5">
                  <div className="text-lg font-bold text-purple-400">{exerciseCalories}</div>
                  <div className="text-[10px] text-gray-400">铁子练的</div>
                </div>
              </div>
              {/* 缺口数值 */}
              <div className={`rounded-lg p-3 text-center ${
                calorieDeficit < 0
                  ? 'bg-green-500/10'
                  : calorieDeficit <= 200
                    ? 'bg-yellow-500/10'
                    : 'bg-red-500/10'
              }`}>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xs text-gray-400">今日热量缺口</span>
                  <span className={`text-2xl font-bold ${
                    calorieDeficit < 0
                      ? 'text-green-400'
                      : calorieDeficit <= 200
                        ? 'text-yellow-400'
                        : 'text-red-400'
                  }`}>
                    {calorieDeficit > 0 ? '+' : ''}{calorieDeficit}
                  </span>
                  <span className="text-xs text-gray-500">kcal</span>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  {calorieDeficit < 0
                    ? <span className="flex items-center justify-center gap-1.5"><CartoonIcon name="success" size="xs" /> 缺口拉满！铁子可能要瘦成头顶尖尖的了！</span>
                    : calorieDeficit <= 200
                      ? <span className="flex items-center justify-center gap-1.5"><CartoonIcon name="warning" size="xs" /> 那我问你，缺口可能够了，但是够了不太可能——再加把劲！</span>
                      : <span className="flex items-center justify-center gap-1.5"><CartoonIcon name="error" size="xs" /> 申气了！吃多了铁子，这热量盈余要长膘的，听见没有！</span>}
                </p>
              </div>
            </div>
          )}

          {/* 三大营养素 */}
          <div className="w-full mt-3 space-y-2">
            <h3 className="section-title mb-1">三大营养素</h3>
            <NutrientBar
              label="碳水化合物"
              icon="nutrient-carbs"
              consumed={todayIntake.carbs}
              target={goal.carbs}
              unit="g"
              color="bg-orange-400"
              bgColor="bg-orange-100"
            />
            <NutrientBar
              label="蛋白质"
              icon="nutrient-protein"
              consumed={todayIntake.protein}
              target={goal.protein}
              unit="g"
              color="bg-blue-400"
              bgColor="bg-blue-100"
            />
            <NutrientBar
              label="脂肪"
              icon="nutrient-fat"
              consumed={todayIntake.fat}
              target={goal.fat}
              unit="g"
              color="bg-purple-400"
              bgColor="bg-purple-100"
            />
          </div>
        </div>
      ) : (
        <div className="card text-center space-y-2 py-6">
          <CartoonIcon name="logo" size="xl" className="mx-auto" />
          <p className="text-sm font-medium text-gray-300">那我问你，目标设了没？</p>
          <p className="text-xs text-gray-500">去「诺神配置」填身体数据，让诺神给你安排上，听见没有！</p>
        </div>
      )}

      {/* 健身打卡区 */}
      {workoutPlan && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <SectionHeading icon="training" className="mb-0">今日训练</SectionHeading>
            <span className="text-[10px] text-gray-400">{WEEKDAY_LABELS[todayWeekday]}</span>
          </div>

          {/* 休息日提示 */}
          {isRestDay ? (
            <div className="space-y-2">
              <div className="bg-blue-500/10 rounded-lg p-3 text-center">
                <p className="text-sm font-medium text-blue-400 flex items-center justify-center gap-1">
                  <CartoonIcon name="rest" size="sm" /> 今天可能该练，但是该练不太可能
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">肌肉要长肉，休息也是练！养好精神明天干，啊你知道吧</p>
              </div>
              {/* 提前训练：显示下一个训练日 */}
              {nextTrainingDay && !overrideDayId && (
                <button
                  onClick={() => handleOverrideDay(nextTrainingDay.day.id)}
                  className="w-full py-2 rounded-lg border-2 border-dashed border-primary-500/50 text-xs text-primary-400 hover:bg-primary-500/10 transition-all"
                >
                  <CartoonIcon name="skip-forward" size="xs" className="inline" /> 等不及了，提前干：{nextTrainingDay.day.name}（{WEEKDAY_LABELS[nextTrainingDay.weekday]}）
                </button>
              )}
              {/* 取消提前训练 */}
              {overrideDayId && (
                <button
                  onClick={() => setOverrideDayId('')}
                  className="w-full py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-300"
                >
                  <CartoonIcon name="skip-back" size="xs" className="inline" /> 还是歇着吧
                </button>
              )}
            </div>
          ) : currentDay ? (
            <>
              {todayWorkoutLog && (
                <div className="flex justify-end">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    todayWorkoutLog.completed
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-gray-700 text-gray-400'
                  }`}>
                    {todayWorkoutLog.completedExercises.length}/{currentDay.exercises.length} 完成
                  </span>
                </div>
              )}

              {/* 当前训练日信息 */}
              <div className="flex items-center justify-between bg-gray-700/50 rounded-lg px-3 py-2">
                <div>
                  <div className="text-sm font-medium text-gray-200">{currentDay.name}</div>
                  <div className="text-[10px] text-gray-400">
                    {currentDay.focus} · {currentDay.exercises.length}动作 · {currentDay.duration}分钟
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-orange-400">{calcDayTotalCalories(currentDay)}</div>
                  <div className="text-[10px] text-gray-400">目标消耗 kcal</div>
                </div>
              </div>

              {/* 今日不练：顺延到明天（级联推移） */}
              {scheduledDayId && !todayWorkoutLog && (
                <button
                  onClick={handleSkipToday}
                  className="w-full py-1.5 rounded-lg border-2 border-dashed border-gray-600 text-xs text-gray-400 hover:border-gray-500 hover:text-gray-300 transition-all"
                >
                  <CartoonIcon name="rest" size="xs" className="inline" /> 今日不练，顺延到明天
                </button>
              )}
            </>
          ) : null}

          {/* 运动消耗 */}
          {exerciseCalories > 0 && (
            <div className="flex items-center justify-between bg-purple-500/10 rounded-lg px-3 py-2">
              <span className="text-xs text-gray-400 flex items-center gap-1.5"><CartoonIcon name="cardio" size="xs" /> 已消耗</span>
              <span className="text-sm font-bold text-purple-500">{exerciseCalories} kcal</span>
            </div>
          )}

          {/* 动作列表 + 有氧 + 完成提示（仅训练日显示） */}
          {currentDay && (
            <>
              {/* 动作列表 - 勾选完成 */}
              <div className="space-y-1.5">
                {currentDay.exercises.map((ex) => {
                  const isDone = todayWorkoutLog?.completedExercises.includes(ex.id);
                  return (
                    <div
                      key={ex.id}
                      className={`rounded-lg p-2.5 transition-all ${
                        isDone ? 'bg-green-500/10' : 'bg-gray-700/50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <button
                          onClick={() => toggleExercise(ex.id)}
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                            isDone
                              ? 'bg-green-500 border-green-500'
                              : 'border-gray-600 hover:border-primary-400'
                          }`}
                        >
                          {isDone && (
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-medium ${isDone ? 'text-gray-500 line-through' : 'text-gray-200'}`}>
                            {ex.name}
                          </div>
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            {ex.targetMuscle} · {ex.sets}组 × {ex.reps} · 休息{ex.rest}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className={`text-sm font-bold ${isDone ? 'text-green-400' : 'text-orange-400'}`}>
                            {calcExerciseCalories(ex)}
                          </div>
                          <div className="text-[10px] text-gray-400">kcal</div>
                        </div>
                        <button
                          onClick={() => deleteExerciseToday(ex.id)}
                          className="text-red-400 hover:text-red-500 flex-shrink-0"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 添加动作按钮 */}
              <button
                onClick={addExerciseToday}
                className="w-full py-1.5 rounded-lg border-2 border-dashed border-gray-600 text-xs text-gray-400 hover:border-primary-400 hover:text-primary-400 transition-all"
              >
                + 加个动作
              </button>

              {/* 有氧打卡 */}
              {currentDay.cardio.enabled && (
                <div className={`rounded-lg p-2.5 transition-all ${
                  todayWorkoutLog?.cardioCompleted ? 'bg-green-500/10' : 'bg-purple-500/10'
                }`}>
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={toggleCardio}
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                        todayWorkoutLog?.cardioCompleted
                          ? 'bg-green-500 border-green-500'
                          : 'border-purple-500/50 hover:border-purple-400'
                      }`}
                    >
                      {todayWorkoutLog?.cardioCompleted && (
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    <div className="flex-1">
                      <div className={`text-sm font-medium ${todayWorkoutLog?.cardioCompleted ? 'text-gray-500 line-through' : 'text-gray-200'}`}>
                        <CartoonIcon name="cardio" size="sm" className="inline" /> {currentDay.cardio.type}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {currentDay.cardio.duration}分钟 · {currentDay.cardio.caloriesPerMin}kcal/分钟
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold ${todayWorkoutLog?.cardioCompleted ? 'text-green-400' : 'text-purple-400'}`}>
                        {calcCardioCalories(currentDay.cardio)}
                      </div>
                      <div className="text-[10px] text-gray-400">kcal</div>
                    </div>
                  </div>
                </div>
              )}

              {/* 完成提示 */}
              {todayWorkoutLog?.completed && (
                <div className="bg-green-500/10 rounded-lg p-2.5 text-center">
                  <p className="text-sm font-medium text-green-400 flex items-center justify-center gap-1">
                    <CartoonIcon name="success" size="sm" /> 全部干完了！牛逼铁子，诺神为你骄傲！
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    烧掉 {exerciseCalories} kcal，相比躺着和坐着，还是练完最为痛快
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleImageUpload}
        className="hidden"
        id="meal-photo-input"
      />

      {/* 识别中 */}
      {loading && (
        <div className="card space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-400">诺神正在帮你认吃的，啊你知道吧...</span>
          </div>
          {previewImage && (
            <img src={previewImage} alt="预览" className="w-full h-40 object-cover rounded-lg" />
          )}
          <SkeletonCard />
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="card bg-red-500/10 border-red-500/30">
          <p className="text-sm text-red-400 flex items-center gap-1.5"><CartoonIcon name="error" size="sm" /> {error}</p>
        </div>
      )}

      {/* 识别结果 - 可微调 */}
      {recognizeResult && !loading && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <SectionHeading icon="search" className="mb-0">诺神认出来了</SectionHeading>
            <span className="text-xs text-gray-400">{recognizeResult.meal_description}</span>
          </div>

          {/* 当前餐次标签 */}
          <div className="flex items-center gap-2 bg-primary-500/10 rounded-lg px-3 py-1.5">
            <span className="text-xs text-gray-400">归到哪顿：</span>
            {(() => {
              const mt = MEAL_TYPES.find((m) => m.key === selectedMealType);
              return mt ? (
                <span className={`text-sm font-bold ${mt.color} flex items-center gap-1`}>
                  <CartoonIcon name={mt.icon} size="sm" /> {mt.label}
                </span>
              ) : null;
            })()}
          </div>

          {previewImage && (
            <img src={previewImage} alt="餐食" className="w-full h-32 object-cover rounded-lg" />
          )}

          {/* 食物列表 - 可编辑 */}
          <div className="space-y-2">
            {recognizeResult.foods.map((food, i) => (
              <div key={i} className="bg-gray-700/50 rounded-lg p-2.5 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={food.name}
                    onChange={(e) => updateFood(i, 'name', e.target.value)}
                    className="input-field flex-1 text-sm"
                  />
                  <input
                    type="text"
                    value={food.amount}
                    onChange={(e) => updateFood(i, 'amount', e.target.value)}
                    className="input-field w-20 text-sm"
                  />
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  <div>
                    <label className="text-[10px] text-gray-400">热量</label>
                    <input
                      type="number"
                      value={food.calories}
                      onChange={(e) => updateFood(i, 'calories', Number(e.target.value))}
                      className="input-field text-xs py-1"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400">碳水g</label>
                    <input
                      type="number"
                      value={food.carbs}
                      onChange={(e) => updateFood(i, 'carbs', Number(e.target.value))}
                      className="input-field text-xs py-1"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400">蛋白g</label>
                    <input
                      type="number"
                      value={food.protein}
                      onChange={(e) => updateFood(i, 'protein', Number(e.target.value))}
                      className="input-field text-xs py-1"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400">脂肪g</label>
                    <input
                      type="number"
                      value={food.fat}
                      onChange={(e) => updateFood(i, 'fat', Number(e.target.value))}
                      className="input-field text-xs py-1"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 总计 */}
          <div className="flex items-center justify-between bg-primary-500/10 rounded-lg p-2.5">
            <span className="text-sm font-medium text-primary-400">合计</span>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-orange-400 font-bold">{recognizeResult.total_calories} kcal</span>
              <span className="text-gray-400">碳水 {recognizeResult.total_carbs}g</span>
              <span className="text-gray-400">蛋白 {recognizeResult.total_protein}g</span>
              <span className="text-gray-400">脂肪 {recognizeResult.total_fat}g</span>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-2">
            <button onClick={handleCancel} className="flex-1 py-2 rounded-xl border border-gray-600 text-gray-400 text-sm font-medium hover:bg-gray-700 transition-colors">
              不要了
            </button>
            <button onClick={handleConfirm} className="flex-1 btn-primary text-sm">
              确认入账
            </button>
          </div>
        </div>
      )}

      {/* 今日饮食 - 整合早中晚餐 */}
      {!loading && !recognizeResult && (
        <div className="card space-y-3">
          {/* 卡片标题 */}
          <div className="flex items-center justify-between">
            <SectionHeading icon="dish" className="mb-0">今日干饭记录</SectionHeading>
            <div className="text-right">
              <span className="text-sm font-bold text-orange-400">{todayIntake.calories}</span>
              <span className="text-[10px] text-gray-400 ml-1">/ {goal?.dailyCalories || 0} kcal</span>
            </div>
          </div>

          {/* 推荐食谱区域 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-300 flex items-center gap-1">
                <CartoonIcon name="robot" size="sm" /> 诺神推荐食谱
              </span>
              <button
                onClick={handleGenerateMealPlan}
                disabled={mealPlanLoading || !goal}
                className="btn-primary text-xs px-3 py-1"
              >
                {mealPlanLoading ? '诺神安排中...' : mealPlan ? '换一批' : '那我问你，给我安排？'}
              </button>
            </div>

            {mealPlanError && <p className="text-xs text-red-400">{mealPlanError}</p>}

            {/* 推荐食谱加载中 */}
            {mealPlanLoading && <SkeletonCard />}

            {/* 推荐食谱展示 */}
            {mealPlan && !mealPlanLoading && (
              <div className="space-y-1.5">
                {/* 全天总计 */}
                <div className="flex items-center justify-between bg-primary-500/10 rounded-lg px-3 py-2">
                  <span className="text-xs text-primary-400">诺神推荐全天合计</span>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="text-orange-400 font-bold">{mealPlan.total_calories} kcal</span>
                    <span className="text-gray-400">碳水{mealPlan.total_carbs}g</span>
                    <span className="text-gray-400">蛋白{mealPlan.total_protein}g</span>
                    <span className="text-gray-400">脂肪{mealPlan.total_fat}g</span>
                  </div>
                </div>

                {/* 各餐次推荐 */}
                {mealPlan.items.map((item, idx) => {
                  const mt = MEAL_TYPES.find((m) => m.key === item.mealType);
                  if (!mt) return null;
                  const isExpanded = expandedMeal === `${idx}`;
                  return (
                    <div key={idx} className="bg-gray-700/50 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setExpandedMeal(isExpanded ? null : `${idx}`)}
                        className="w-full flex items-center justify-between p-2.5"
                      >
                        <div className="flex items-center gap-2">
                          <CartoonIcon name={mt.icon} size="md" />
                          <div className="text-left">
                            <div className="text-sm font-medium text-gray-200">{item.description}</div>
                            <div className="text-[10px] text-gray-400">{mt.label} · {item.foods.length}种食物</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-orange-400">{item.total_calories}</span>
                          <span className="text-[10px] text-gray-400">kcal</span>
                          <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="px-2.5 pb-2.5 space-y-1.5 border-t border-gray-600">
                          {/* 食物列表 */}
                          {item.foods.map((food, fi) => (
                            <div key={fi} className="bg-gray-800 rounded-lg p-2 flex items-center justify-between">
                              <div>
                                <div className="text-xs font-medium text-gray-200">{food.name}</div>
                                <div className="text-[10px] text-gray-400">{food.amount} · {food.calories} kcal</div>
                              </div>
                              <div className="flex gap-2 text-[10px] text-gray-400">
                                <span>碳水{food.carbs}g</span>
                                <span>蛋白{food.protein}g</span>
                                <span>脂肪{food.fat}g</span>
                              </div>
                            </div>
                          ))}
                          {/* 一键添加按钮 */}
                          <button
                            onClick={() => addMealPlanItem(item)}
                            className="w-full py-1.5 rounded-lg bg-primary-500 text-white text-xs font-medium hover:bg-primary-600 transition-all"
                          >
                            <CartoonIcon name="success" size="xs" className="inline" /> 一键加到{mt.label}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* 饮食建议 */}
                {mealPlan.advice && (
                  <p className="text-xs text-gray-400 bg-gray-700/50 rounded-lg p-2">{mealPlan.advice}</p>
                )}
              </div>
            )}
          </div>

          {/* 各餐次记录（整合展示） */}
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-gray-300 flex items-center gap-1">
              <CartoonIcon name="clipboard" size="sm" /> 已吃过的
            </div>
            {MEAL_TYPES.map((mt) => {
              const typeMeals = mealsByType[mt.key];
              const typeCalories = mealTypeCalories[mt.key];
              return (
                <div key={mt.key} className="bg-gray-700/50 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between p-2.5">
                    <div className="flex items-center gap-2">
                      <CartoonIcon name={mt.icon} size="md" />
                      <div>
                        <span className="text-sm font-medium text-gray-200">{mt.label}</span>
                        {typeMeals.length > 0 && (
                          <span className="ml-2 text-xs text-gray-400">{typeCalories} kcal</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => triggerUpload(mt.key)}
                      className="text-xs text-primary-400 hover:text-primary-500 font-medium"
                    >
                      + 添加
                    </button>
                  </div>
                  {typeMeals.length > 0 && (
                    <div className="px-2.5 pb-2.5 space-y-2">
                      {typeMeals.map((meal) => (
                        <MealCard key={meal.id} entry={meal} onDelete={deleteMeal} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {todayMeals.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-2">还没吃呢铁子？拍个照或者让诺神给你安排，听见没有！</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
