import type { ModelKey } from './models';

/** AI companies a Pro member can plug their own key into. */
export interface Provider {
  id: string; name: string;
  /** Which way the API is spoken. Most use the OpenAI way. */
  kind: 'openai' | 'anthropic';
  base: string;
  models: Record<ModelKey, string>;
  /** Where to make a key. */
  keys?: string;
  note?: string;
}
export const PROVIDERS: Provider[] = [
  { id: 'openai', name: 'OpenAI', kind: 'openai', base: 'https://api.openai.com/v1', models: { swift: 'gpt-6-luna', core: 'gpt-6.1-terra', deep: 'gpt-6.1-sol' }, keys: 'platform.openai.com/api-keys' },
  { id: 'anthropic', name: 'Anthropic', kind: 'anthropic', base: 'https://api.anthropic.com', models: { swift: 'claude-haiku-5-5', core: 'claude-sonnet-5-5', deep: 'claude-opus-5-5' }, keys: 'console.anthropic.com/settings/keys' },
  { id: 'google', name: 'Google Gemini', kind: 'openai', base: 'https://generativelanguage.googleapis.com/v1beta/openai', models: { swift: 'gemini-3.5-flash-lite', core: 'gemini-3.8-flash', deep: 'gemini-3.1-pro-preview' }, keys: 'aistudio.google.com/apikey' },
  { id: 'openrouter', name: 'OpenRouter', kind: 'openai', base: 'https://openrouter.ai/api/v1', models: { swift: 'openai/gpt-6-luna', core: 'anthropic/claude-sonnet-5-5', deep: 'anthropic/claude-opus-5-5' }, keys: 'openrouter.ai/keys', note: 'One key for many AIs. Check the model names at openrouter.ai/models.' },
  { id: 'groq', name: 'Groq', kind: 'openai', base: 'https://api.groq.com/openai/v1', models: { swift: 'llama-3.1-8b-instant', core: 'llama-3.3-70b-versatile', deep: 'openai/gpt-oss-120b' }, keys: 'console.groq.com/keys' },
  { id: 'mistral', name: 'Mistral', kind: 'openai', base: 'https://api.mistral.ai/v1', models: { swift: 'mistral-small-latest', core: 'mistral-medium-latest', deep: 'mistral-large-latest' }, keys: 'console.mistral.ai/api-keys' },
  { id: 'deepseek', name: 'DeepSeek', kind: 'openai', base: 'https://api.deepseek.com/v1', models: { swift: 'deepseek-v4-flash', core: 'deepseek-v4-flash', deep: 'deepseek-v4-pro' }, keys: 'platform.deepseek.com/api_keys' },
  { id: 'xai', name: 'xAI', kind: 'openai', base: 'https://api.x.ai/v1', models: { swift: 'grok-4.3', core: 'grok-4.3', deep: 'grok-4.5' }, keys: 'console.x.ai' },
  { id: 'ollama', name: 'Ollama (this computer)', kind: 'openai', base: 'http://localhost:11434/v1', models: { swift: 'llama3.2', core: 'llama3.2', deep: 'llama3.2' }, note: 'Runs on your own computer. No key needed. Use the names of models you have installed.' },
  { id: 'custom', name: 'Another service', kind: 'openai', base: '', models: { swift: '', core: '', deep: '' }, note: 'Any other AI service. Paste its API address and the model names it uses.' },
];
export const providerById = (id: string) => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
