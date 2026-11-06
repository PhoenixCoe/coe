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
  { key: 'free', name: 'Free', monthly: 0, yearly: 0, perDay: 300000, images: 3, points: [
    '300,000 tokens a day: about 50 chats', 'Coe Swift and Coe Core', 'Step-by-step study help and Code check', 'Charts, diagrams and live page previews',
    'A taste of the big stuff each day: 1 Deep Work run, 3 web searches, 2 made pictures, 5 PMC App runs', '3 pictures in each message'] },
  { key: 'pro', name: 'Pro', monthly: 10, yearly: 110, perDay: 6000000, images: 10, points: [
    '6,000,000 tokens a day: over 1,000 chats', 'Coe Deep, the biggest model (counts double)', 'Deep Work: long jobs planned, checked and finished in steps', 'Much longer replies',
    'Search the web (100 a day)', 'Make pictures (40 a day)', 'Every PMC App inside the chat, with no daily limit', 'Google Docs, Sheets and Slides, live', 'GitHub: read code, commit and open pull requests',
    'Big files in: PDF, Word, Excel, PowerPoint, zip and whole code folders', '10 pictures in each message', 'Use your own AI key: OpenAI, Anthropic, Google and more', 'Everything in Free'] },
];
/** Tokens in a short form people can read: 950, 12.4k, 3.2M. */
/** What a web search and a picture cost, in tokens. The server charges the same (see worker/worker.js). */
export const COST_SEARCH = 18000, COST_IMAGE = 30000;
export function fmtTok(n: number): string {
  const v = Math.max(0, Math.round(n));
  if (v < 1000) return String(v);
  if (v < 1_000_000) return (v / 1000).toFixed(v < 10_000 ? 1 : 0).replace(/\.0$/, '') + 'k';
  return (v / 1_000_000).toFixed(v < 10_000_000 ? 2 : 1).replace(/\.?0+$/, '') + 'M';
}
export const planByKey = (k: string) => PLANS.find((p) => p.key === k) ?? PLANS[0];
/** The longest reply asked for, by plan. Deep Work asks for more. */
export const MAX_REPLY: Record<PlanKey, number> = { free: 2048, pro: 16000 };
export const MAX_WORK = 24000;
export const canUse = (plan: PlanKey, model: ModelKey) => PLANS.findIndex((p) => p.key === plan) >= PLANS.findIndex((p) => p.key === modelByKey(model).plan);

/** Things with a small daily taste on Free. The server counts them for real; these numbers are what the screen shows when it has not heard yet. */
export type QuotaKey = 'work' | 'search' | 'image' | 'app' | 'voice';
export const QUOTAS: Record<QuotaKey, { free: number; pro: number; name: string; unit: string }> = {
  work: { free: 1, pro: 200, name: 'Deep Work', unit: 'Deep Work runs' },
  search: { free: 3, pro: 100, name: 'Web search', unit: 'web searches' },
  image: { free: 2, pro: 40, name: 'Pictures', unit: 'pictures' },
  app: { free: 5, pro: Infinity, name: 'PMC Apps', unit: 'PMC App runs' },
  voice: { free: 24, pro: 3000, name: 'Voice', unit: 'voice turns' },
};
/** The biggest file text Coe will read in, by plan (characters). */
export const FILE_TEXT: Record<PlanKey, number> = { free: 30000, pro: 400000 };
