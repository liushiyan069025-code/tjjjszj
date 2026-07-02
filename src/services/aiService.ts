// ============================================================
// AI 服务 - 通过 /api/ai-proxy 代理调用 AI API
// 支持 OpenAI 兼容 / Anthropic 两种格式（页面配置）
// ============================================================

import type { UserProfile, NutritionGoal, MealResult, AppSettings, ApiType, WorkoutPlan, TrainingStyle, SplitType, WorkoutDay, Exercise, CardioConfig, MealPlan, MealPlanItem } from '../types';
import { loadSettings, TRAINING_STYLES, SPLIT_TYPES } from '../types';
import { calcBMR, calcTDEE, calcBMI, genId, calcDayDuration } from '../utils/calculations';
import { ACTIVITY_FACTORS } from '../types';
import { ANUO_PERSONA, ANUO_PERSONA_LONGFORM } from './anuoPersona';

/** 获取当前设置 */
function getSettings(): AppSettings {
  return loadSettings();
}

/** 检查 API Key 是否已配置 */
function ensureApiKey(settings: AppSettings): void {
  if (!settings.apiKey || !settings.apiKey.trim()) {
    throw new Error('那我问你，API Key 呢？先去「诺神配置」填上啊，听见没有！');
  }
}

/** 清洗 API Key：去除前后空格（粘贴时常见问题） */
function cleanApiKey(key: string): string {
  return key.trim();
}

/** 构建目标 URL */
function buildTargetUrl(settings: AppSettings): string {
  let baseUrl = settings.baseUrl.replace(/\/+$/, '');

  // 智能修正：阿里云 DashScope 根域名缺少 /compatible-mode 路径时自动补全
  // 正确的 OpenAI 兼容端点：https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
  // 若用户只填 https://dashscope.aliyuncs.com，请求会命中网关返回 405 HTML 错误页
  if (baseUrl.includes('dashscope.aliyuncs.com') && !baseUrl.includes('compatible-mode')) {
    baseUrl = `${baseUrl}/compatible-mode`;
    console.warn('[AI] 检测到 DashScope baseUrl 缺少 /compatible-mode 路径，已自动补全:', baseUrl);
  }

  return settings.apiType === 'anthropic'
    ? `${baseUrl}/v1/messages`
    : `${baseUrl}/v1/chat/completions`;
}

/** 构建非流式请求体 */
function buildRequestBody(
  settings: AppSettings,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  stream: boolean = false
): string {
  if (settings.apiType === 'anthropic') {
    return JSON.stringify({
      model: settings.model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      ...(stream ? { stream: true } : {}),
    });
  }
  return JSON.stringify({
    model: settings.model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    // 禁用流式思考（兼容 qwen 等推理模型，确保输出到 content 而非 reasoning_content）
    enable_thinking: false,
    ...(stream ? { stream: true } : {}),
  });
}

/** 构建带图片的请求体（Vision） */
function buildVisionRequestBody(
  settings: AppSettings,
  systemPrompt: string,
  imageBase64: string,
  textPrompt: string,
  maxTokens: number
): string {
  const mediaType = imageBase64.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

  if (settings.apiType === 'anthropic') {
    return JSON.stringify({
      model: settings.model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Data },
          },
          { type: 'text', text: textPrompt },
        ],
      }],
    });
  }
  // OpenAI 格式
  return JSON.stringify({
    model: settings.model,
    max_tokens: maxTokens,
    enable_thinking: false,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: imageBase64 },
          },
          { type: 'text', text: textPrompt },
        ],
      },
    ],
  });
}

/** 清洗上游错误文本：HTML 错误页 → 简洁提示 */
function sanitizeUpstreamError(text: string): string {
  if (!text) return '';
  // 检测 HTML 错误页（阿里云/CDN 网关常返回 <!doctype html> ...）
  if (/<!doctype\s*html|<html[\s>]/i.test(text)) {
    // 尝试提取 <title> 或 <h2> 中的错误码
    const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const h2Match = text.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const code = titleMatch?.[1]?.trim() || h2Match?.[1]?.trim() || '';
    return `上游返回 HTML 错误页（非 JSON）。${code ? `页面标题: ${code}。` : ''}请检查 Base URL 路径是否正确，例如阿里云 DashScope 需填 https://dashscope.aliyuncs.com/compatible-mode`;
  }
  return text;
}

/** 解析非流式响应 */
function parseResponse(data: any, apiType: ApiType): string {
  if (apiType === 'anthropic') {
    return data.content?.[0]?.text || '';
  }
  // OpenAI 兼容：content 可能是字符串或数组
  const message = data.choices?.[0]?.message;
  if (!message) return '';

  // 优先取 content
  const content = message.content;
  if (typeof content === 'string' && content.trim()) return content;
  if (Array.isArray(content)) {
    const text = content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
    if (text.trim()) return text;
  }
  // 兼容推理模型（如 qwen3）：content 为空时取 reasoning_content
  if (message.reasoning_content) {
    return message.reasoning_content;
  }
  return '';
}

/** 从 AI 返回文本中提取 JSON（兼容 markdown 代码块包裹） */
function extractJson(text: string): string | null {
  if (!text) return null;
  // 先尝试直接匹配 {...}
  const direct = text.match(/\{[\s\S]*\}/);
  if (direct) return direct[0];
  // 尝试匹配 ```json ... ``` 代码块
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    const inner = codeBlock[1].match(/\{[\s\S]*\}/);
    if (inner) return inner[0];
  }
  return null;
}

/** 通用 AI 调用（非流式，通过代理） */
async function callAI(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 1024
): Promise<string> {
  const settings = getSettings();
  ensureApiKey(settings);

  const targetUrl = buildTargetUrl(settings);
  const body = buildRequestBody(settings, systemPrompt, userMessage, maxTokens, false);

  const resp = await fetch('/api/ai-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-proxy-target': targetUrl,
      'x-proxy-key': cleanApiKey(settings.apiKey),
      'x-proxy-type': settings.apiType,
    },
    body,
  });

  if (!resp.ok) {
    let errorMsg = `API 请求失败 (${resp.status})`;
    try {
      const errorData = await resp.json();
      if (errorData.error) {
        errorMsg = errorData.error;
        if (errorData.detail) errorMsg += `: ${sanitizeUpstreamError(String(errorData.detail)).slice(0, 300)}`;
      }
    } catch {
      const text = await resp.text();
      if (text) errorMsg += ` - ${sanitizeUpstreamError(text).slice(0, 300)}`;
    }
    throw new Error(errorMsg);
  }

  // 先以文本读取，便于调试
  const rawText = await resp.text();
  console.log('[AI] 响应 Content-Type:', resp.headers.get('content-type'));
  console.log('[AI] 响应原始文本 (前500字符):', rawText.slice(0, 500));

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch (e) {
    console.error('[AI] JSON 解析失败，原始内容:', rawText);
    throw new Error(`代理响应不是合法 JSON。Content-Type: ${resp.headers.get('content-type')}，原始内容: ${rawText.slice(0, 300)}`);
  }

  const result = parseResponse(data, settings.apiType);
  console.log('[AI] parseResponse 结果 (前200字符):', result.slice(0, 200));
  return result;
}

/** 通用 AI 调用（流式，通过代理） */
export async function callAIStream(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 2048,
  onChunk: (text: string) => void
): Promise<string> {
  const settings = getSettings();
  ensureApiKey(settings);

  const targetUrl = buildTargetUrl(settings);
  const body = buildRequestBody(settings, systemPrompt, userMessage, maxTokens, true);

  const resp = await fetch('/api/ai-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-proxy-target': targetUrl,
      'x-proxy-key': cleanApiKey(settings.apiKey),
      'x-proxy-type': settings.apiType,
    },
    body,
  });

  if (!resp.ok) {
    let errorMsg = `API 请求失败 (${resp.status})`;
    try {
      const errorData = await resp.json();
      if (errorData.error) {
        errorMsg = errorData.error;
        if (errorData.detail) errorMsg += `: ${sanitizeUpstreamError(String(errorData.detail)).slice(0, 300)}`;
      }
    } catch {
      const text = await resp.text();
      if (text) errorMsg += ` - ${sanitizeUpstreamError(text).slice(0, 300)}`;
    }
    throw new Error(errorMsg);
  }

  return readSSEStream(resp, settings.apiType, onChunk);
}

/** 读取 SSE 流（兼容 openai / anthropic） */
async function readSSEStream(
  response: Response,
  apiType: ApiType,
  onChunk: (text: string) => void
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('无法读取响应流');

  const decoder = new TextDecoder();
  let fullContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;

      const data = trimmed.slice(6).trim();
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);

        if (apiType === 'anthropic') {
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            fullContent += parsed.delta.text;
            onChunk(fullContent);
          }
        } else {
          const delta = parsed.choices?.[0]?.delta;
          // 优先取 content，为空时取 reasoning_content（兼容 qwen 等推理模型）
          const text = delta?.content || delta?.reasoning_content;
          if (text) {
            fullContent += text;
            onChunk(fullContent);
          }
        }
      } catch { /* ignore parse errors */ }
    }
  }

  return fullContent;
}

/** 根据用户资料生成营养目标 */
export async function generateNutritionGoal(profile: UserProfile): Promise<NutritionGoal> {
  const bmi = calcBMI(profile.weight, profile.height);
  const bmr = calcBMR(profile);
  const tdee = calcTDEE(profile);
  const activityLabel = ACTIVITY_FACTORS[profile.activityLevel]?.label || '久坐';

  const systemPrompt = `${ANUO_PERSONA}

你同时精通营养学。根据用户的身体数据，计算每日热量上限和三大营养素目标。
你必须严格返回 JSON 格式，不要包含任何其他文字。JSON 结构如下：
{
  "dailyCalories": 数字,
  "carbs": 数字(克),
  "protein": 数字(克),
  "fat": 数字(克),
  "advice": "用诺言诺语写的简短建议，1-3句，要搞笑但建议本身靠谱"
}
减脂期一般建议：热量比 TDEE 减少 300-500 kcal，蛋白质 1.6-2.0g/kg体重，碳水占总热量 40-50%，脂肪占 25-30%。
advice 示例风格：「那我问你，蛋白可能不够，但是蛋白不够不太可能——铁子每天先把乳清……啊不对，先把鸡胸肉安排上，听见没有！」`;

  const userMessage = `我的数据：
- 身高: ${profile.height}cm
- 体重: ${profile.weight}kg
- 年龄: ${profile.age}岁
- 性别: ${profile.gender === 'male' ? '男' : '女'}
- 活动水平: ${activityLabel}
- BMI: ${bmi.value} (${bmi.level})
- BMR: ${bmr} kcal
- TDEE: ${tdee} kcal
- 目标体重: ${profile.targetWeight}kg

请给铁子安排减脂营养目标，数字要准，advice 用诺言诺语。`;

  const text = await callAI(systemPrompt, userMessage);
  console.log('[AI] 营养目标原始返回:', text);

  // 提取 JSON（兼容 markdown 代码块）
  const jsonStr = extractJson(text);
  if (!jsonStr) {
    throw new Error(`AI 返回格式异常，无法解析营养目标。返回内容: ${text.slice(0, 200)}`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`JSON 解析失败: ${(e as Error).message}。返回内容: ${text.slice(0, 200)}`);
  }
  return {
    dailyCalories: parsed.dailyCalories || Math.round(tdee - 400),
    carbs: parsed.carbs || 0,
    protein: parsed.protein || 0,
    fat: parsed.fat || 0,
    advice: parsed.advice || '',
  };
}

/** AI 生成健身计划（分化训练 + 有氧搭配，通过代理） */
export async function generateWorkoutPlan(
  profile: UserProfile,
  daysPerWeek: number,
  trainingStyle: TrainingStyle,
  splitType: SplitType,
  withCardio: boolean
): Promise<WorkoutPlan> {
  const bmi = calcBMI(profile.weight, profile.height);
  const bmr = calcBMR(profile);
  const tdee = calcTDEE(profile);
  const styleConfig = TRAINING_STYLES.find((s) => s.key === trainingStyle);
  const styleLabel = styleConfig?.label || '混合训练';
  const styleDesc = styleConfig?.desc || '';
  const splitConfig = SPLIT_TYPES.find((s) => s.key === splitType);
  const splitLabel = splitConfig?.label || '自定义';
  const splitDesc = splitConfig?.desc || '';

  const systemPrompt = `${ANUO_PERSONA}

你同时是专业健身教练，精通分化训练法。根据用户的身体数据、训练偏好和分化方式，设计一份严格遵循分化训练原则的多日训练计划。
你必须严格返回 JSON 格式，不要包含任何其他文字。JSON 结构如下：
{
  "days": [
    {
      "name": "训练日名称(如: 推日/拉日/腿日/上肢日/下肢日/全身日)",
      "focus": "训练重点肌群(如: 胸/肩/三头 或 背/二头)",
      "exercises": [
        {
          "name": "动作名称",
          "sets": 数字(组数),
          "reps": "次数或时长(如: 12次 或 30秒)",
          "rest": "组间休息(如: 60秒)",
          "caloriesPerSet": 数字(每组消耗kcal),
          "targetMuscle": "目标肌群"
        }
      ],
      "cardio": {
        "enabled": true或false,
        "type": "有氧类型(如: 跑步/椭圆机/跳绳/划船机)",
        "duration": 数字(分钟),
        "caloriesPerMin": 数字(每分钟消耗kcal)
      }
    }
  ],
  "advice": "用诺言诺语写的训练建议，2-4句，左右脑互搏式总结，但训练要点要正确"
}
分化训练原则（必须严格遵守）：
- 全身训练(fullbody): 每天都练全身主要肌群，3天循环，每天5-7个动作覆盖胸/背/腿/核心
- 上下分化(upperlower): 上肢日和下肢日交替，4天循环，上肢日5-6个动作(胸/背/肩/手臂)，下肢日4-5个动作(股四/臀/腘绳/小腿)
- 推拉腿(ppl): 推日(胸/肩/三头)、拉日(背/二头)、腿日(股四/臀/腘绳)，6天一轮，每天5-6个动作
- 单肌群(bro): 每天专注一个肌群，5天循环(胸/背/腿/肩/手臂)，每天5-6个动作
- 自定义(custom): 根据每周${daysPerWeek}天灵活编排

有氧搭配原则：
- ${withCardio ? '用户需要搭配有氧，在力量训练后安排15-30分钟有氧' : '用户不需要有氧，cardio.enabled设为false'}
- 有氧每分钟消耗参考: 跑步8-12kcal/min, 椭圆机6-8kcal/min, 跳绳10-14kcal/min, 划船机7-10kcal/min

热量消耗估算参考：
- 力量训练约 3-6 kcal/分钟，复合动作(深蹲/硬拉/卧推)每组消耗更高
- 每组消耗热量要根据动作强度和涉及肌群大小合理估算（复合动作5-8kcal/组，孤立动作3-5kcal/组）

要求：
- 严格遵循所选分化方式，每个训练日的动作必须对应该日的目标肌群
- 动作要安全、有效，适合减脂目标
- 适合用户的体能水平（参考BMI和训练经验）`;

  const userMessage = `我的数据：
- 身高: ${profile.height}cm
- 体重: ${profile.weight}kg
- 年龄: ${profile.age}岁
- 性别: ${profile.gender === 'male' ? '男' : '女'}
- BMI: ${bmi.value} (${bmi.level})
- BMR: ${bmr} kcal
- TDEE: ${tdee} kcal
- 目标体重: ${profile.targetWeight}kg

训练偏好：
- 每周训练 ${daysPerWeek} 天
- 训练方式: ${styleLabel}（${styleDesc}）
- 分化方式: ${splitLabel}（${splitDesc}）
- ${withCardio ? '需要搭配有氧运动' : '不需要有氧'}

请给铁子设计严格遵循${splitLabel}分化原则的训练计划，生成${daysPerWeek}个训练日。动作名用中文，advice 用诺言诺语。`;

  const text = await callAI(systemPrompt, userMessage, 3072);
  console.log('[AI] 健身计划原始返回:', text);

  const jsonStr = extractJson(text);
  if (!jsonStr) {
    throw new Error(`AI 返回格式异常，无法解析健身计划。返回内容: ${text.slice(0, 200)}`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`JSON 解析失败: ${(e as Error).message}。返回内容: ${text.slice(0, 200)}`);
  }

  // 验证训练日列表
  const rawDays = Array.isArray(parsed.days) ? parsed.days : [];
  if (rawDays.length === 0) {
    throw new Error('AI 未生成训练日，请重试');
  }

  // 转换为 WorkoutDay[]
  const days: WorkoutDay[] = rawDays.map((d: any, dayIdx: number) => {
    const rawExercises = Array.isArray(d.exercises) ? d.exercises : [];
    const exercises: Exercise[] = rawExercises.map((ex: any) => ({
      id: genId(),
      name: ex.name || `动作${dayIdx + 1}`,
      sets: ex.sets || 3,
      reps: ex.reps || '12次',
      rest: ex.rest || '60秒',
      caloriesPerSet: ex.caloriesPerSet || 5,
      targetMuscle: ex.targetMuscle || '全身',
    }));

    const cardio: CardioConfig = {
      enabled: withCardio && (d.cardio?.enabled ?? true),
      type: d.cardio?.type || '跑步',
      duration: d.cardio?.duration || (withCardio ? 20 : 0),
      caloriesPerMin: d.cardio?.caloriesPerMin || 8,
    };

    const day: WorkoutDay = {
      id: genId(),
      name: d.name || `训练日${dayIdx + 1}`,
      focus: d.focus || '全身',
      exercises,
      cardio,
      duration: 0, // 下方计算
    };
    day.duration = calcDayDuration(day);
    return day;
  });

  // 自动安排每周训练日程：将训练日均匀分布到7天中，剩余为休息日
  // 策略：按 daysPerWeek 取间隔，优先排在周一~周六，周日通常休息
  const weeklySchedule: (string | null)[] = [null, null, null, null, null, null, null];
  if (days.length > 0) {
    const trainingDayIds = days.map((d) => d.id);
    // 常见排布：3天→一三五, 4天→一二四五, 5天→一二三四五, 6天→一二三四五六
    const layouts: Record<number, number[]> = {
      1: [0],
      2: [0, 2],
      3: [0, 2, 4],         // 一三五
      4: [0, 1, 3, 4],      // 一二四五
      5: [0, 1, 2, 3, 4],   // 一二三四五
      6: [0, 1, 2, 3, 4, 5],// 一二三四五六
      7: [0, 1, 2, 3, 4, 5, 6],
    };
    const slots = layouts[daysPerWeek] || layouts[days.length] || [0, 2, 4];
    trainingDayIds.forEach((id, i) => {
      if (i < slots.length) {
        weeklySchedule[slots[i]] = id;
      }
    });
  }

  return {
    splitType,
    daysPerWeek,
    trainingStyle,
    days,
    weeklySchedule,
    advice: parsed.advice || '',
  };
}

/** AI Vision 识别食物图片（通过代理，兼容 openai/anthropic） */
export async function recognizeFoodImage(imageBase64: string): Promise<MealResult> {
  const settings = getSettings();
  ensureApiKey(settings);

  const systemPrompt = `${ANUO_PERSONA}

你同时是专业的食物营养分析AI。用户会上传一张餐食照片，你需要识别其中的所有食物，估算每种食物的克数和营养含量。
你必须严格返回 JSON 格式，不要包含任何其他文字。JSON 结构如下：
{
  "foods": [
    {
      "name": "食物名称",
      "amount": "估算克数(如: 约150g)",
      "calories": 数字(kcal),
      "carbs": 数字(g),
      "protein": 数字(g),
      "fat": 数字(g)
    }
  ],
  "total_calories": 数字,
  "total_carbs": 数字,
  "total_protein": 数字,
  "total_fat": 数字,
  "meal_description": "用诺言诺语一句话描述这顿饭，如：那我问你，这盘可能是减脂餐，但这盘是减脂餐不太可能"
}`;

  const textPrompt = '那我问你，这张照片里吃了啥？估个克数和营养，严格返回 JSON，meal_description 用诺言诺语。';

  const targetUrl = buildTargetUrl(settings);
  const body = buildVisionRequestBody(settings, systemPrompt, imageBase64, textPrompt, 1024);

  console.log('[AI] 食物识别请求配置:', {
    apiType: settings.apiType,
    model: settings.model,
    baseUrl: settings.baseUrl,
    targetUrl,
    imageBase64Length: imageBase64.length,
  });

  const resp = await fetch('/api/ai-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-proxy-target': targetUrl,
      'x-proxy-key': cleanApiKey(settings.apiKey),
      'x-proxy-type': settings.apiType,
    },
    body,
  });

  if (!resp.ok) {
    let errorMsg = `API 请求失败 (${resp.status})`;
    try {
      const errorData = await resp.json();
      if (errorData.error) {
        errorMsg = errorData.error;
        if (errorData.detail) errorMsg += `: ${sanitizeUpstreamError(String(errorData.detail)).slice(0, 300)}`;
      }
    } catch {
      const text = await resp.text();
      if (text) errorMsg += ` - ${sanitizeUpstreamError(text).slice(0, 300)}`;
    }
    throw new Error(errorMsg);
  }

  const data = await resp.json();
  console.log('[AI] 食物识别完整响应:', JSON.stringify(data, null, 2));
  const text = parseResponse(data, settings.apiType);
  console.log('[AI] 食物识别解析文本:', text);

  // 检查是否为空响应（模型可能不支持图像）
  if (!text || text.trim() === '') {
    throw new Error('AI 返回空内容，请确认你配置的模型支持图像识别（如 gpt-4o / gpt-4-vision / claude-sonnet-4-6）。当前模型: ' + settings.model);
  }

  const jsonStr = extractJson(text);
  if (!jsonStr) {
    throw new Error(`AI 返回格式异常，无法解析食物数据。返回内容: ${text.slice(0, 200)}`);
  }

  let result: MealResult;
  try {
    result = JSON.parse(jsonStr) as MealResult;
  } catch (e) {
    throw new Error(`JSON 解析失败: ${(e as Error).message}`);
  }

  // 验证结果有效性
  if (!result.foods || result.foods.length === 0) {
    throw new Error('AI 未识别到任何食物，请确认模型支持图像识别。当前模型: ' + settings.model);
  }
  if (result.total_calories === 0 && result.foods.every(f => f.calories === 0)) {
    console.warn('[AI] 警告: 所有食物热量均为 0，模型可能未正确识别图片内容');
  }

  return result;
}

/** 生成 AI 周报（流式） */
export async function generateWeeklyReport(
  weekData: { date: string; calories: number; carbs: number; protein: number; fat: number; weight?: number }[],
  goal: NutritionGoal,
  profile: UserProfile,
  onChunk: (text: string) => void
): Promise<string> {
  const systemPrompt = `${ANUO_PERSONA_LONGFORM}

根据用户近7天的饮食和体重数据，生成一份详细的周报分析。
报告应包含：
1. 本周总体评价（诺言诺语，可「那我问你」开场）
2. 营养摄入分析（与目标对比，左右脑互搏式点评）
3. 体重变化趋势（头尖尖式哲学感悟 optional）
4. 具体改进建议（搞笑但可执行）
5. 下周饮食和运动建议（干就完了风格）

用中文撰写，markdown 格式，全文保持诺言诺语风格。`;

  const userMessage = `我的营养目标：每日 ${goal.dailyCalories} kcal，碳水 ${goal.carbs}g，蛋白质 ${goal.protein}g，脂肪 ${goal.fat}g
我的身体数据：${profile.height}cm, ${profile.weight}kg, ${profile.age}岁, ${profile.gender === 'male' ? '男' : '女'}

近7天数据：
${weekData.map((d) => `${d.date}: ${d.calories}kcal | 碳水${d.carbs}g 蛋白质${d.protein}g 脂肪${d.fat}g | 体重${d.weight || '未记录'}kg`).join('\n')}

请给铁子写这周的饮食周报，诺神附体，听见没有！`;

  return callAIStream(systemPrompt, userMessage, 2048, onChunk);
}

/** AI 推荐食谱（根据营养目标推荐全天各餐次食谱，通过代理） */
export async function generateMealPlan(
  goal: NutritionGoal,
  profile: UserProfile,
  todayMeals: { mealType: string; calories: number; description: string }[]
): Promise<MealPlan> {
  const tdee = calcTDEE(profile);
  const remainingCalories = Math.max(0, goal.dailyCalories - todayMeals.reduce((s, m) => s + m.calories, 0));

  const systemPrompt = `${ANUO_PERSONA}

你同时是专业营养师。根据用户的营养目标和今日已摄入情况，推荐今日剩余餐次的食谱。
你必须严格返回 JSON 格式，不要包含任何其他文字。JSON 结构如下：
{
  "items": [
    {
      "mealType": "breakfast" | "lunch" | "dinner" | "snack",
      "description": "餐食简述（可带一点诺言诺语，但要说清楚吃啥）",
      "foods": [
        { "name": "食物名", "amount": "克数如100g", "calories": 数字, "carbs": 数字, "protein": 数字, "fat": 数字 }
      ],
      "total_calories": 数字,
      "total_carbs": 数字,
      "total_protein": 数字,
      "total_fat": 数字
    }
  ],
  "total_calories": 数字,
  "total_carbs": 数字,
  "total_protein": 数字,
  "total_fat": 数字,
  "advice": "用诺言诺语写的饮食建议，1-3句"
}
要求：
1. 只推荐今日尚未吃的餐次（已吃的餐次不要重复推荐）
2. 食物要常见、易准备、适合减脂
3. 各餐热量分配合理：早餐25%、午餐35%、晚餐30%、加餐10%（可根据已摄入调整）
4. 确保全天总热量接近目标 ${goal.dailyCalories} kcal
5. 蛋白质要充足，碳水选粗粮，脂肪选健康脂肪`;

  const userMessage = `我的营养目标：
- 每日热量: ${goal.dailyCalories} kcal（剩余可吃 ${remainingCalories} kcal）
- 碳水: ${goal.carbs}g
- 蛋白质: ${goal.protein}g
- 脂肪: ${goal.fat}g

我的身体数据：${profile.height}cm, ${profile.weight}kg, ${profile.age}岁, ${profile.gender === 'male' ? '男' : '女'}
日常代谢 TDEE: ${tdee} kcal

今日已吃的餐次：
${todayMeals.length > 0 ? todayMeals.map((m) => `- ${m.mealType}: ${m.description} (${m.calories} kcal)`).join('\n') : '（尚未记录任何餐食）'}

请给铁子安排今日剩余餐次，数字要准，advice 和 description 带点诺言诺语。`;

  const text = await callAI(systemPrompt, userMessage, 2048);
  console.log('[AI] 推荐食谱原始返回:', text);

  const jsonStr = extractJson(text);
  if (!jsonStr) {
    throw new Error(`AI 返回格式异常，无法解析食谱。返回内容: ${text.slice(0, 200)}`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`JSON 解析失败: ${(e as Error).message}。返回内容: ${text.slice(0, 200)}`);
  }

  const items: MealPlanItem[] = (parsed.items || []).map((it: any) => ({
    mealType: it.mealType || 'snack',
    description: it.description || '',
    foods: (it.foods || []).map((f: any) => ({
      name: f.name || '',
      amount: f.amount || '',
      calories: Number(f.calories) || 0,
      carbs: Number(f.carbs) || 0,
      protein: Number(f.protein) || 0,
      fat: Number(f.fat) || 0,
    })),
    total_calories: Number(it.total_calories) || 0,
    total_carbs: Number(it.total_carbs) || 0,
    total_protein: Number(it.total_protein) || 0,
    total_fat: Number(it.total_fat) || 0,
  }));

  return {
    items,
    total_calories: Number(parsed.total_calories) || items.reduce((s, i) => s + i.total_calories, 0),
    total_carbs: Number(parsed.total_carbs) || items.reduce((s, i) => s + i.total_carbs, 0),
    total_protein: Number(parsed.total_protein) || items.reduce((s, i) => s + i.total_protein, 0),
    total_fat: Number(parsed.total_fat) || items.reduce((s, i) => s + i.total_fat, 0),
    advice: parsed.advice || '',
  };
}
