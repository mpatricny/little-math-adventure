/** Browser-safe contracts. No authentication secrets or server libraries here. */
export const eventKinds = ['page_view', 'play_clicked', 'game_menu_ready', 'profile_created',
  'profile_imported', 'profile_activated', 'play_started', 'play_resumed', 'play_ended',
  'activity_window', 'visibility_changed', 'pause_changed', 'loading_changed', 'scene_entered',
  'scene_left', 'encounter_started', 'encounter_finished', 'skill_changed', 'milestone_reached',
  'problem_presented', 'assistance_shown', 'problem_corrected', 'problem_abandoned',
  'client_error', 'asset_error', 'save_error', 'coverage_gap','puzzle_started','puzzle_submitted','puzzle_completed'] as const;
export type EventKind = typeof eventKinds[number];
export type Participant = { role: 'A' | 'B'; profileId: string };
export type ClientEvent = {
  schemaVersion: 1; id: string; kind: EventKind; visitorId: string; visitId: string;
  runId: string; seq: number; occurredAt: number; monotonicMs: number; sourceRelease: string;
  playSessionId?: string | undefined; profileId?: string | undefined; encounterRunId?: string | undefined;
  payload: Record<string, unknown>;
};
export type Observation = {
  presentationId: string; profileId: string; playSessionId?: string; runId: string;
  scene: string; context: string; role: 'A' | 'B'; sourceRelease: string;
  presentedAt: number; answeredAt?: number; question: string; choices: Array<string | number>;
  selected?: string | number; correctAnswer?: string | number; correct?: boolean; responseTimeMs?: number;
  assisted: boolean; clockQuality: 'observed' | 'uncertain';
  legacyEventKey?: string; taskKind: 'arithmetic' | 'comparison';
};
export type AnalyticsReceipt = { stored: true; acceptedIds: string[]; duplicateIds: string[];
  quarantinedIds: string[]; serverReceivedAt: string };
export type ReportFilter = { from: string; to: string; timezone: 'Europe/Prague';
  data: 'normal' | 'test' | 'all'; learningActor: 'unmarked' | 'adult' | 'all';
  profile?: string | undefined; session?: string | undefined; participant?: string | undefined; skill?: string | undefined; region?: string | undefined;
  mode?: 'solo' | 'coop' | undefined; device?: string | undefined; release?: string | undefined; search?: string | undefined;
  result?: 'correct'|'wrong'|undefined; assistance?: 'yes'|'no'|'unknown'|undefined;
  state?: 'active'|'paused'|'ended'|'unconfirmed'|'incomplete'|undefined; location?:string|undefined;
  stage?: 'web'|'click'|'menu'|'profile'|'answer'|undefined;
  detailScope?: 'period'|'whole'|undefined;
  limit: number; cursor?: string | undefined; sort: 'newest' | 'oldest' };
export type Metric = { value: number | null; status: 'measured' | 'partial' | 'unavailable';
  unit: 'count' | 'ms' | 'percent'; samples?: number; numerator?: number; denominator?: number };
export type ReportMeta = { generatedAt: string; environment: 'dev' | 'prd'; metricVersion: 1;
  from: string; to: string; timezone: 'Europe/Prague'; coverage: Array<Record<string, unknown>>;
  excluded: { tests: number; adults: number; conflicts: number }; lastReceivedAt: string | null;
  warnings: string[] };
export type Report<T> = { data: T; meta: ReportMeta; nextCursor?: string };
export const analyticsTiming = { heartbeatMs: 15_000, webIdleMs: 60_000, uncertainMs: 120_000,
  sessionGapMs: 30 * 60_000, maxTickGapMs: 5000, maxQueuedEvents: 20_000 };
