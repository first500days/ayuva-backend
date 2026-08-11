// Distinguishes mock/placeholder AI output from the real model output the
// AI-owning team will drop in later (TRD §6, docs/AI_INTEGRATION_CONTRACT.md).
// Every AI response and every AiInteractionLog entry carries this field so
// mock data is never confused with real model output downstream.
export enum AiSource {
  MOCK = 'mock',
  REAL = 'real',
}
