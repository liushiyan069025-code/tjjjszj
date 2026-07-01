// ============================================================
// Tab1 - 个人中心页
// BMI / BMR / TDEE 计算 + AI 营养目标 + 提醒设置
// ============================================================

import React, { useState, useEffect } from 'react';
import type { UserProfile, NutritionGoal, ActivityLevel, AppSettings, ApiType, WorkoutPlan, TrainingStyle, SplitType, WorkoutDay, Exercise } from '../types';
import { ACTIVITY_FACTORS, DEFAULT_SETTINGS, loadSettings, saveSettings, TRAINING_STYLES, SPLIT_TYPES, WEEKDAY_LABELS } from '../types';
import { calcBMI, calcBMR, calcTDEE, daysUntilTarget, genId, calcDayTotalCalories, calcDayStrengthCalories, calcCardioCalories, calcDayDuration } from '../utils/calculations';
import { generateNutritionGoal, generateWorkoutPlan } from '../services/aiService';
import { CartoonIcon, SectionHeading } from '../components/CartoonIcon';
import { SkeletonCard } from '../components/Skeleton';

const API_TYPE_OPTIONS: { value: ApiType; label: string; desc: string }[] = [
  { value: 'openai', label: 'OpenAI 兼容', desc: 'OpenAI / DeepSeek / 通义千问 / 自定义' },
  { value: 'anthropic', label: 'Anthropic', desc: 'Claude API 原生格式' },
];

interface ProfileTabProps {
  profile: UserProfile;
  setProfile: (updater: (prev: UserProfile) => UserProfile) => void;
  goal: NutritionGoal | null;
  setGoal: (goal: NutritionGoal | null) => void;
  workoutPlan: WorkoutPlan | null;
  setWorkoutPlan: (plan: WorkoutPlan | null) => void;
}

export const ProfileTab: React.FC<ProfileTabProps> = ({ profile, setProfile, goal, setGoal, workoutPlan, setWorkoutPlan }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [showKey, setShowKey] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // 健身计划状态
  const [workoutLoading, setWorkoutLoading] = useState(false);
  const [workoutError, setWorkoutError] = useState('');
  const [workoutDays, setWorkoutDays] = useState(4);
  const [workoutStyle, setWorkoutStyle] = useState<TrainingStyle>('mixed');
  const [workoutSplit, setWorkoutSplit] = useState<SplitType>('ppl');
  const [workoutCardio, setWorkoutCardio] = useState(true);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  // 加载已保存的设置
  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  // 保存设置
  const handleSaveSettings = () => {
    saveSettings(settings);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  // 恢复默认
  const handleResetSettings = () => {
    const def = { ...DEFAULT_SETTINGS };
    setSettings(def);
    saveSettings(def);
  };

  const bmi = calcBMI(profile.weight, profile.height);
  const bmr = calcBMR(profile);
  const tdee = calcTDEE(profile);
  const daysLeft = daysUntilTarget(profile.targetDate);

  const handleGenerateGoal = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await generateNutritionGoal(profile);
      setGoal(result);
    } catch (e: any) {
      setError(e.message || '生成营养目标失败');
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: keyof UserProfile, value: any) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  // 生成健身计划
  const handleGenerateWorkout = async () => {
    setWorkoutLoading(true);
    setWorkoutError('');
    try {
      const result = await generateWorkoutPlan(profile, workoutDays, workoutStyle, workoutSplit, workoutCardio);
      setWorkoutPlan(result);
      setExpandedDay(result.days[0]?.id || null);
    } catch (e: any) {
      setWorkoutError(e.message || '生成健身计划失败');
    } finally {
      setWorkoutLoading(false);
    }
  };

  // 切换分化方式时自动设置推荐天数
  const handleSplitChange = (split: SplitType) => {
    setWorkoutSplit(split);
    const config = SPLIT_TYPES.find((s) => s.key === split);
    if (config && config.dayCount > 0) {
      setWorkoutDays(config.dayCount);
    }
  };

  // 更新训练日（增删动作、修改有氧等）
  const updateWorkoutDay = (dayId: string, updater: (day: WorkoutDay) => WorkoutDay) => {
    if (!workoutPlan) return;
    const newDays = workoutPlan.days.map((d) => (d.id === dayId ? updater(d) : d));
    setWorkoutPlan({ ...workoutPlan, days: newDays });
  };

  // 添加动作到训练日
  const addExercise = (dayId: string) => {
    updateWorkoutDay(dayId, (day) => {
      const newEx: Exercise = {
        id: genId(),
        name: '新动作',
        sets: 3,
        reps: '12次',
        rest: '60秒',
        caloriesPerSet: 5,
        targetMuscle: day.focus,
      };
      return { ...day, exercises: [...day.exercises, newEx], duration: 0 };
    });
    // 重新计算时长
    updateWorkoutDay(dayId, (day) => ({ ...day, duration: calcDayDuration({ ...day, duration: 0 }) }));
  };

  // 删除动作
  const deleteExercise = (dayId: string, exId: string) => {
    updateWorkoutDay(dayId, (day) => {
      const newExercises = day.exercises.filter((ex) => ex.id !== exId);
      const newDay = { ...day, exercises: newExercises, duration: 0 };
      newDay.duration = calcDayDuration(newDay);
      return newDay;
    });
  };

  // 更新动作字段
  const updateExercise = (dayId: string, exId: string, field: keyof Exercise, value: any) => {
    updateWorkoutDay(dayId, (day) => ({
      ...day,
      exercises: day.exercises.map((ex) => (ex.id === exId ? { ...ex, [field]: value } : ex)),
    }));
  };

  // 切换有氧开关
  const toggleCardio = (dayId: string) => {
    updateWorkoutDay(dayId, (day) => {
      const newCardio = { ...day.cardio, enabled: !day.cardio.enabled };
      const newDay = { ...day, cardio: newCardio, duration: 0 };
      newDay.duration = calcDayDuration(newDay);
      return newDay;
    });
  };

  // 更新有氧配置
  const updateCardio = (dayId: string, field: 'type' | 'duration' | 'caloriesPerMin', value: any) => {
    updateWorkoutDay(dayId, (day) => {
      const newCardio = { ...day.cardio, [field]: value };
      const newDay = { ...day, cardio: newCardio, duration: 0 };
      newDay.duration = calcDayDuration(newDay);
      return newDay;
    });
  };

  // 更新每周训练日程（weekday: 0=周一...6=周日, dayId: string | null）
  const updateWeeklySchedule = (weekday: number, dayId: string | null) => {
    if (!workoutPlan) return;
    const newSchedule = [...(workoutPlan.weeklySchedule || [null, null, null, null, null, null, null])];
    newSchedule[weekday] = dayId;
    setWorkoutPlan({ ...workoutPlan, weeklySchedule: newSchedule });
  };

  return (
    <div className="space-y-4 pb-4">
      {/* 标题 */}
      <h2 className="text-lg font-bold text-gray-100 flex items-center gap-2">
        <CartoonIcon name="nav-profile" size="lg" /> 诺神配置
      </h2>
      <p className="nuo-speech -mt-2">啊你知道吧，填完身体数据让诺神给你安排，听见没有！</p>

      {/* 身体数据输入 */}
      <div className="card space-y-3">
        <SectionHeading icon="body">身体数据</SectionHeading>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400">身高 (cm)</label>
            <input
              type="number"
              value={profile.height || ''}
              onChange={(e) => updateField('height', Number(e.target.value))}
              className="input-field"
              placeholder="170"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">体重 (kg)</label>
            <input
              type="number"
              value={profile.weight || ''}
              onChange={(e) => updateField('weight', Number(e.target.value))}
              className="input-field"
              placeholder="65"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">年龄</label>
            <input
              type="number"
              value={profile.age || ''}
              onChange={(e) => updateField('age', Number(e.target.value))}
              className="input-field"
              placeholder="25"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">性别</label>
            <select
              value={profile.gender}
              onChange={(e) => updateField('gender', e.target.value)}
              className="input-field"
            >
              <option value="male">男</option>
              <option value="female">女</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-400">活动水平</label>
          <select
            value={profile.activityLevel}
            onChange={(e) => updateField('activityLevel', e.target.value as ActivityLevel)}
            className="input-field"
          >
            {Object.entries(ACTIVITY_FACTORS).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 计算结果 */}
      {(bmi.value > 0 && bmr > 0) && (
        <div className="card">
          <SectionHeading icon="metrics">健康指标</SectionHeading>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-gray-700/50 rounded-lg p-2">
              <div className={`text-xl font-bold ${bmi.color}`}>{bmi.value}</div>
              <div className="text-xs text-gray-400">BMI</div>
              <div className={`text-xs ${bmi.color}`}>{bmi.level}</div>
            </div>
            <div className="bg-gray-700/50 rounded-lg p-2">
              <div className="text-xl font-bold text-primary-400">{bmr}</div>
              <div className="text-xs text-gray-400">BMR</div>
              <div className="text-xs text-gray-400">基础代谢</div>
            </div>
            <div className="bg-gray-700/50 rounded-lg p-2">
              <div className="text-xl font-bold text-primary-400">{tdee}</div>
              <div className="text-xs text-gray-400">TDEE</div>
              <div className="text-xs text-gray-400">每日消耗</div>
            </div>
          </div>
        </div>
      )}

      {/* 目标设定 */}
      <div className="card space-y-3">
        <SectionHeading icon="target">减脂目标</SectionHeading>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400">目标体重 (kg)</label>
            <input
              type="number"
              value={profile.targetWeight || ''}
              onChange={(e) => updateField('targetWeight', Number(e.target.value))}
              className="input-field"
              placeholder="60"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">目标日期</label>
            <input
              type="date"
              value={profile.targetDate}
              onChange={(e) => updateField('targetDate', e.target.value)}
              className="input-field"
            />
          </div>
        </div>
        {daysLeft > 0 && (
          <p className="text-xs text-gray-400 text-center">
            距离目标还有 <span className="text-primary-400 font-bold">{daysLeft}</span> 天，
            需减重 <span className="text-orange-400 font-bold">{(profile.weight - profile.targetWeight).toFixed(1)}</span> kg
          </p>
        )}
      </div>

      {/* AI 营养目标 */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <SectionHeading icon="robot" className="mb-0">AI 营养目标</SectionHeading>
          <button
            onClick={handleGenerateGoal}
            disabled={loading || !profile.height || !profile.weight}
            className="btn-primary text-xs px-3 py-1.5"
          >
            {loading ? '诺神算数中...' : goal ? '重新安排' : '那我问你，生成目标？'}
          </button>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        {loading ? (
          <SkeletonCard />
        ) : goal ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-primary-500/10 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-primary-400">{goal.dailyCalories}</div>
                <div className="text-xs text-gray-400">每日热量上限 (kcal)</div>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <div className="bg-orange-500/10 rounded-lg p-2 text-center">
                  <div className="text-sm font-bold text-orange-400">{goal.carbs}g</div>
                  <div className="text-[10px] text-gray-400">碳水</div>
                </div>
                <div className="bg-blue-500/10 rounded-lg p-2 text-center">
                  <div className="text-sm font-bold text-blue-400">{goal.protein}g</div>
                  <div className="text-[10px] text-gray-400">蛋白质</div>
                </div>
                <div className="bg-purple-500/10 rounded-lg p-2 text-center">
                  <div className="text-sm font-bold text-purple-400">{goal.fat}g</div>
                  <div className="text-[10px] text-gray-400">脂肪</div>
                </div>
              </div>
            </div>
            {goal.advice && (
              <p className="text-xs text-gray-400 bg-gray-700/50 rounded-lg p-2">{goal.advice}</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-400 text-center py-2">
            填完身体数据点按钮，诺神给你算热量，听见没有！
          </p>
        )}
      </div>

      {/* 健身计划 */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <SectionHeading icon="training" className="mb-0">健身计划</SectionHeading>
          <button
            onClick={handleGenerateWorkout}
            disabled={workoutLoading || !profile.height || !profile.weight}
            className="btn-primary text-xs px-3 py-1.5"
          >
            {workoutLoading ? '安排训练中...' : workoutPlan ? '换一套' : '诺神开练！'}
          </button>
        </div>

        {workoutError && <p className="text-xs text-red-400">{workoutError}</p>}

        {/* 训练偏好设置 */}
        <div className="space-y-2.5">
          {/* 分化方式 */}
          <div>
            <label className="text-xs text-gray-400">分化训练方式</label>
            <div className="grid grid-cols-3 gap-1.5 mt-1">
              {SPLIT_TYPES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => handleSplitChange(s.key)}
                  className={`p-2 rounded-lg text-center transition-all ${
                    workoutSplit === s.key
                      ? 'bg-primary-500/10 border-2 border-primary-500'
                      : 'bg-gray-700/50 border-2 border-transparent'
                  }`}
                >
                  <CartoonIcon name={s.icon} size="lg" className="mx-auto" />
                  <div className="text-[10px] font-medium text-gray-300 mt-0.5">{s.label}</div>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              {SPLIT_TYPES.find((s) => s.key === workoutSplit)?.desc}
            </p>
          </div>

          {/* 每周训练天数 */}
          <div>
            <label className="text-xs text-gray-400">每周训练天数</label>
            <div className="flex gap-1.5 mt-1">
              {[2, 3, 4, 5, 6].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setWorkoutDays(d)}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    workoutDays === d
                      ? 'bg-primary-500/100 text-white'
                      : 'bg-gray-700 text-gray-300'
                  }`}
                >
                  {d}天
                </button>
              ))}
            </div>
          </div>

          {/* 训练方式 */}
          <div>
            <label className="text-xs text-gray-400">训练方式</label>
            <div className="grid grid-cols-3 gap-1.5 mt-1">
              {TRAINING_STYLES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setWorkoutStyle(s.key)}
                  className={`p-2 rounded-lg text-center transition-all ${
                    workoutStyle === s.key
                      ? 'bg-primary-500/10 border-2 border-primary-500'
                      : 'bg-gray-700/50 border-2 border-transparent'
                  }`}
                >
                  <CartoonIcon name={s.icon} size="lg" className="mx-auto" />
                  <div className="text-[10px] font-medium text-gray-300 mt-0.5">{s.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 有氧搭配 */}
          <div className="flex items-center justify-between bg-gray-700/50 rounded-lg p-2.5">
            <div>
              <div className="text-xs font-medium text-gray-300 flex items-center gap-1">
                <CartoonIcon name="cardio" size="sm" /> 搭配有氧运动
              </div>
              <div className="text-[10px] text-gray-400">力量训练后增加有氧消耗</div>
            </div>
            <button
              type="button"
              onClick={() => setWorkoutCardio(!workoutCardio)}
              className={`relative w-11 h-6 rounded-full transition-all ${
                workoutCardio ? 'bg-primary-500/100' : 'bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 bg-gray-800 rounded-full transition-all ${
                  workoutCardio ? 'left-5' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* 计划展示 */}
        {workoutLoading ? (
          <SkeletonCard />
        ) : workoutPlan ? (
          <div className="space-y-2">
            {/* 概览统计 */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-primary-500/10 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-primary-400">{workoutPlan.days.length}</div>
                <div className="text-[10px] text-gray-400">训练日</div>
              </div>
              <div className="bg-orange-500/10 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-orange-400">
                  {workoutPlan.days.reduce((s, d) => s + calcDayTotalCalories(d), 0)}
                </div>
                <div className="text-[10px] text-gray-400">周总消耗</div>
              </div>
              <div className="bg-blue-500/10 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-blue-400">
                  {Math.round(workoutPlan.days.reduce((s, d) => s + d.duration, 0) / workoutPlan.days.length)}
                </div>
                <div className="text-[10px] text-gray-400">日均时长</div>
              </div>
            </div>

            {/* 每周训练安排表 */}
            <div className="bg-gray-700/50 rounded-lg p-2.5 space-y-1.5">
              <div className="text-xs font-medium text-gray-300 flex items-center gap-1">
                <CartoonIcon name="calendar" size="sm" /> 每周训练安排
              </div>
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAY_LABELS.map((label, weekday) => {
                  const scheduledDayId = workoutPlan.weeklySchedule?.[weekday] || null;
                  const scheduledDay = scheduledDayId ? workoutPlan.days.find((d) => d.id === scheduledDayId) : null;
                  return (
                    <div key={weekday} className="text-center">
                      <div className={`text-[10px] font-medium mb-0.5 ${scheduledDay ? 'text-primary-400' : 'text-gray-400'}`}>
                        {label}
                      </div>
                      <select
                        value={scheduledDayId || ''}
                        onChange={(e) => updateWeeklySchedule(weekday, e.target.value || null)}
                        className={`w-full text-[9px] text-center rounded px-0.5 py-1 border outline-none ${
                          scheduledDay
                            ? 'bg-primary-500/10 border-primary-500/50 text-primary-400'
                            : 'bg-gray-800 border-gray-600 text-gray-400'
                        }`}
                      >
                        <option value="">休息</option>
                        {workoutPlan.days.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-400">点击下拉可调整每天的训练日，留空为休息日</p>
            </div>

            {/* 训练日列表（可展开编辑） */}
            <div className="space-y-1.5">
              {workoutPlan.days.map((day, idx) => {
                const isExpanded = expandedDay === day.id;
                const strengthCal = calcDayStrengthCalories(day);
                const cardioCal = calcCardioCalories(day.cardio);
                return (
                  <div key={day.id} className="bg-gray-700/50 rounded-lg overflow-hidden">
                    {/* 训练日头部 */}
                    <button
                      type="button"
                      onClick={() => setExpandedDay(isExpanded ? null : day.id)}
                      className="w-full flex items-center justify-between p-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-primary-500/100 text-white text-xs font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <div className="text-left">
                          <div className="text-sm font-medium text-gray-200">{day.name}</div>
                          <div className="text-[10px] text-gray-400">{day.focus} · {day.exercises.length}动作 · {day.duration}分钟</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-orange-400">{strengthCal + cardioCal}</span>
                        <span className="text-[10px] text-gray-400">kcal</span>
                        <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {/* 展开内容 */}
                    {isExpanded && (
                      <div className="px-2.5 pb-2.5 space-y-1.5 border-t border-gray-600">
                        {/* 动作列表 */}
                        {day.exercises.map((ex) => (
                          <div key={ex.id} className="bg-gray-800 rounded-lg p-2 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <input
                                type="text"
                                value={ex.name}
                                onChange={(e) => updateExercise(day.id, ex.id, 'name', e.target.value)}
                                className="flex-1 text-sm font-medium text-gray-200 bg-transparent border-b border-transparent focus:border-primary-500 outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => deleteExercise(day.id, ex.id)}
                                className="text-red-400 hover:text-red-400 ml-1"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                                </svg>
                              </button>
                            </div>
                            <div className="grid grid-cols-4 gap-1.5">
                              <div>
                                <label className="text-[9px] text-gray-400">组数</label>
                                <input
                                  type="number"
                                  value={ex.sets}
                                  onChange={(e) => updateExercise(day.id, ex.id, 'sets', Number(e.target.value))}
                                  className="w-full text-xs text-center bg-gray-700/50 rounded px-1 py-0.5 outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-[9px] text-gray-400">次数</label>
                                <input
                                  type="text"
                                  value={ex.reps}
                                  onChange={(e) => updateExercise(day.id, ex.id, 'reps', e.target.value)}
                                  className="w-full text-xs text-center bg-gray-700/50 rounded px-1 py-0.5 outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-[9px] text-gray-400">休息</label>
                                <input
                                  type="text"
                                  value={ex.rest}
                                  onChange={(e) => updateExercise(day.id, ex.id, 'rest', e.target.value)}
                                  className="w-full text-xs text-center bg-gray-700/50 rounded px-1 py-0.5 outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-[9px] text-gray-400">kcal/组</label>
                                <input
                                  type="number"
                                  value={ex.caloriesPerSet}
                                  onChange={(e) => updateExercise(day.id, ex.id, 'caloriesPerSet', Number(e.target.value))}
                                  className="w-full text-xs text-center bg-gray-700/50 rounded px-1 py-0.5 outline-none"
                                />
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-gray-400">
                              <input
                                type="text"
                                value={ex.targetMuscle}
                                onChange={(e) => updateExercise(day.id, ex.id, 'targetMuscle', e.target.value)}
                                className="flex-1 bg-transparent border-b border-transparent focus:border-primary-500 outline-none"
                                placeholder="目标肌群"
                              />
                              <span className="text-orange-400 font-bold">{ex.caloriesPerSet * ex.sets} kcal</span>
                            </div>
                          </div>
                        ))}

                        {/* 添加动作按钮 */}
                        <button
                          type="button"
                          onClick={() => addExercise(day.id)}
                          className="w-full py-1.5 rounded-lg border-2 border-dashed border-gray-600 text-xs text-gray-400 hover:border-primary-500 hover:text-primary-500 transition-all"
                        >
                          + 添加动作
                        </button>

                        {/* 有氧配置 */}
                        <div className="bg-gray-800 rounded-lg p-2 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-gray-300 flex items-center gap-1">
                              <CartoonIcon name="cardio" size="xs" /> 有氧搭配
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleCardio(day.id)}
                              className={`relative w-9 h-5 rounded-full transition-all ${
                                day.cardio.enabled ? 'bg-primary-500/100' : 'bg-gray-600'
                              }`}
                            >
                              <span
                                className={`absolute top-0.5 w-4 h-4 bg-gray-800 rounded-full transition-all ${
                                  day.cardio.enabled ? 'left-4' : 'left-0.5'
                                }`}
                              />
                            </button>
                          </div>
                          {day.cardio.enabled && (
                            <div className="grid grid-cols-3 gap-1.5">
                              <div>
                                <label className="text-[9px] text-gray-400">类型</label>
                                <input
                                  type="text"
                                  value={day.cardio.type}
                                  onChange={(e) => updateCardio(day.id, 'type', e.target.value)}
                                  className="w-full text-xs text-center bg-gray-700/50 rounded px-1 py-0.5 outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-[9px] text-gray-400">时长(分)</label>
                                <input
                                  type="number"
                                  value={day.cardio.duration}
                                  onChange={(e) => updateCardio(day.id, 'duration', Number(e.target.value))}
                                  className="w-full text-xs text-center bg-gray-700/50 rounded px-1 py-0.5 outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-[9px] text-gray-400">kcal/分</label>
                                <input
                                  type="number"
                                  value={day.cardio.caloriesPerMin}
                                  onChange={(e) => updateCardio(day.id, 'caloriesPerMin', Number(e.target.value))}
                                  className="w-full text-xs text-center bg-gray-700/50 rounded px-1 py-0.5 outline-none"
                                />
                              </div>
                            </div>
                          )}
                          {day.cardio.enabled && (
                            <div className="text-[10px] text-right text-purple-400 font-bold">
                              有氧消耗 {cardioCal} kcal
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {workoutPlan.advice && (
              <p className="text-xs text-gray-400 bg-gray-700/50 rounded-lg p-2">{workoutPlan.advice}</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-400 text-center py-2">
            选好分化方式，诺神给你排训练表，干就完了！
          </p>
        )}
      </div>

      {/* 提醒设置 */}
      <div className="card space-y-3">
        <SectionHeading icon="clock">饮食提醒</SectionHeading>
        <div className="grid grid-cols-2 gap-3">
          {profile.reminderTimes.map((time, i) => (
            <div key={i}>
              <label className="text-xs text-gray-400">提醒 {i + 1}</label>
              <input
                type="time"
                value={time}
                onChange={(e) => {
                  const newTimes = [...profile.reminderTimes];
                  newTimes[i] = e.target.value;
                  updateField('reminderTimes', newTimes);
                }}
                className="input-field"
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400">
          到点推送浏览器通知，诺神喊你补营养缺口，三卡车都拦不住
        </p>
      </div>

      {/* AI API 设置 */}
      <div className="card space-y-3">
        <SectionHeading icon="key">AI API 设置</SectionHeading>

        {/* API 类型选择 */}
        <div>
          <label className="text-xs text-gray-400">API 类型</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {API_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSettings((prev) => ({ ...prev, apiType: opt.value }))}
                className={`text-left p-2.5 rounded-xl border-2 transition-all ${
                  settings.apiType === opt.value
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-gray-600 hover:border-primary-500/50'
                }`}
              >
                <div className="font-medium text-sm text-gray-200">{opt.label}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* API Key */}
        <div>
          <label className="text-xs text-gray-400">API Key</label>
          <div className="relative mt-1">
            <input
              type={showKey ? 'text' : 'password'}
              value={settings.apiKey}
              onChange={(e) => setSettings((prev) => ({ ...prev, apiKey: e.target.value }))}
              className="input-field pr-10"
              placeholder={settings.apiType === 'openai' ? 'sk-...（阿里云百炼 / DeepSeek / 智谱等）' : 'sk-ant-api03-...'}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary-500"
            >
              {showKey ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Base URL */}
        <div>
          <label className="text-xs text-gray-400">API 地址 (Base URL)</label>
          <input
            type="text"
            value={settings.baseUrl}
            onChange={(e) => setSettings((prev) => ({ ...prev, baseUrl: e.target.value }))}
            className="input-field mt-1"
            placeholder={settings.apiType === 'openai' ? 'https://dashscope.aliyuncs.com/compatible-mode' : 'https://api.anthropic.com'}
          />
          {settings.apiType === 'openai' && (
            <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">
              国内推荐：阿里云百炼 <span className="text-gray-400">dashscope.aliyuncs.com/compatible-mode</span>、DeepSeek <span className="text-gray-400">api.deepseek.com</span>、智谱 <span className="text-gray-400">open.bigmodel.cn/api/paas/v4</span>，均无需翻墙
            </p>
          )}
        </div>

        {/* Model */}
        <div>
          <label className="text-xs text-gray-400">模型名称</label>
          <input
            type="text"
            value={settings.model}
            onChange={(e) => setSettings((prev) => ({ ...prev, model: e.target.value }))}
            className="input-field mt-1"
            placeholder="qwen-vl-max / deepseek-chat / glm-4v"
          />
          {settings.apiType === 'openai' && (
            <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">
              阿里云百炼：qwen-vl-max（识图）/ qwen-plus（纯文本）；DeepSeek：deepseek-chat；智谱：glm-4v（识图）/ glm-4-plus
            </p>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-2">
          <button
            onClick={handleResetSettings}
            className="px-3 py-2 rounded-xl border border-gray-600 text-gray-400 text-xs hover:bg-gray-700 transition-colors"
          >
            恢复默认
          </button>
          <button
            onClick={handleSaveSettings}
            className={`flex-1 py-2 rounded-xl font-bold text-white text-xs transition-all ${
              settingsSaved
                ? 'bg-green-500'
                : 'btn-primary'
            }`}
          >
            {settingsSaved ? '✓ 已保存' : '保存设置'}
          </button>
        </div>

        <p className="text-xs text-gray-400">
          给诺神接上 AI 大脑，用于算目标、认食物、写周报。只存本地，不上传，啊你知道吧。
        </p>
      </div>
    </div>
  );
};
