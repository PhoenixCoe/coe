/** The models and plans Coe offers. The names are Coe's own; which real model sits behind each is set in Settings. */

export type ModelKey = 'swift' | 'core' | 'deep';
export type PlanKey = 'free' | 'pro';

export interface CoeModel { key: ModelKey; name: string; tag: string; blurb: string; plan: PlanKey }
export const COE_MODELS: CoeModel[] = [
  { key: 'swift', name: 'Coe Swift', tag: 'Fastest', blurb: 'Quick answers and small edits.', plan: 'free' },
  { key: 'core', name: 'Coe Core', tag: 'Balanced', blurb: 'Good for most things: writing, code and pictures.', plan: 'free' },
  { key: 'deep', name: 'Coe Deep', tag: 'Deepest', blurb: 'For hard problems. Slower, and worth the wait.', plan: 'pro' },
];
export const modelByKey = (k: ModelKey) => COE_MODELS.find((m) => m.key === k) ?? COE_MODELS[1];

/** What each model is called at the provider, until Settings says otherwise. */
export const DEFAULT_MODEL_IDS: Record<ModelKey, string> = { swift: 'gpt-6-luna', core: 'gpt-6.1-terra', deep: 'gpt-6.1-sol' };

export interface Plan { key: PlanKey; name: string; monthly: number; yearly: number; perDay: number; images: number; points: string[] }
export const PLANS: Plan[] = [
  { key: 'free', name: 'Free', monthly: 0, yearly: 0, perDay: 30, images: 3, points: ['30 credits a day', 'Coe Swift and Coe Core: 1 credit a message', 'Step-by-step study help', 'Code check', '3 pictures in each message'] },
  { key: 'pro', name: 'Pro', monthly: 10, yearly: 110, perDay: 300, images: 10, points: ['300 credits a day', 'Adds Coe Deep: 3 credits a message', 'Longer replies', '10 pictures in each message', 'Use your own AI key: OpenAI, Anthropic, Google and more', 'Everything in Free'] },
];
export const planByKey = (k: string) => PLANS.find((p) => p.key === k) ?? PLANS[0];
/** The longest reply asked for, by plan. */
export const MAX_REPLY: Record<PlanKey, number> = { free: 2048, pro: 8192 };
export const canUse = (plan: PlanKey, model: ModelKey) => PLANS.findIndex((p) => p.key === plan) >= PLANS.findIndex((p) => p.key === modelByKey(model).plan);
