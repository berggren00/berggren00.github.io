// ─── Core Enums ───────────────────────────────────────────────────────────────

export type LiftCategory = 'compound' | 'isolation' | 'tempo';

export type EventType =
  | 'WORKOUT_COMPLETED'
  | 'SET_LOGGED'
  | 'ATTRIBUTE_SPENT'
  | 'BOSS_DEFEATED'
  | 'LEVEL_UP';

// ─── Data Models ──────────────────────────────────────────────────────────────

export interface Exercise {
  id: string;
  name: string;
  category: LiftCategory;
  muscleGroups: string[];
}

export interface SetLog {
  id: string;
  exerciseId: string;
  reps: number;
  weight: number; // kg
  timestamp: number;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  exerciseIds: string[];
  createdAt: number;
}

export interface Workout {
  id: string;
  templateId?: string;
  name: string;
  sets: SetLog[];
  startedAt: number;
  completedAt?: number;
  xpAwarded?: number;
  damageDealt?: number;
}

export interface PlayerAttributes {
  vitality: number;    // Grace Charges: 1 per 5 pts → miss streak immunity
  endurance: number;   // +1 max sets counted per 3 pts
  strength: number;    // +2% XP from compound lifts per pt
  dexterity: number;   // +2% XP from isolation/tempo lifts per pt
  luck: number;        // 1% Double XP chance per pt (capped at 20%)
}

export interface PlayerState {
  level: number;
  currentXP: number;
  totalXP: number;
  attributePoints: number; // unspent
  attributes: PlayerAttributes;
  streak: number;          // consecutive training days
  lastWorkoutDate: string; // YYYY-MM-DD
  graceChargesUsed: number;
  badges: string[];
}

export interface BossWeek {
  id: string;           // ISO week string e.g. "2025-W03"
  bossName: string;
  imageUrl: string;     // local asset path (e.g. "/bosses/boss1.png")
  maxHP: number;
  currentHP: number;
  startDate: string;    // Monday ISO date
  defeated: boolean;
  defeatedAt?: number;
}

// ─── Event Sourcing ────────────────────────────────────────────────────────────

export interface BaseEvent {
  id: string;
  type: EventType;
  timestamp: number;
}

export interface WorkoutCompletedEvent extends BaseEvent {
  type: 'WORKOUT_COMPLETED';
  workoutId: string;
  xpAwarded: number;
  damageDealt: number;
  leveledUp: boolean;
  doubleXP: boolean;
}

export interface SetLoggedEvent extends BaseEvent {
  type: 'SET_LOGGED';
  workoutId: string;
  setId: string;
  exerciseId: string;
  reps: number;
  weight: number;
}

export interface AttributeSpentEvent extends BaseEvent {
  type: 'ATTRIBUTE_SPENT';
  attribute: keyof PlayerAttributes;
  newValue: number;
}

export interface BossDefeatedEvent extends BaseEvent {
  type: 'BOSS_DEFEATED';
  bossWeekId: string;
  bossName: string;
  attributePointAwarded: number;
  badgeUnlocked: string;
}

export interface LevelUpEvent extends BaseEvent {
  type: 'LEVEL_UP';
  newLevel: number;
  attributePointsGranted: number;
}

export type GameEvent =
  | WorkoutCompletedEvent
  | SetLoggedEvent
  | AttributeSpentEvent
  | BossDefeatedEvent
  | LevelUpEvent;

// ─── Computed / UI Types ───────────────────────────────────────────────────────

export interface XPBreakdown {
  base: number;
  volumeBonus: number;
  consistencyMultiplier: number;
  strengthBonus: number;
  dexterityBonus: number;
  doubleXP: boolean;
  total: number;
}

export interface LevelProgress {
  level: number;
  currentXP: number;
  required: number;
  percent: number;
}

export interface AppState {
  player: PlayerState;
  boss: BossWeek;
  activeWorkout: Workout | null;
}

// ─── Export / Import ───────────────────────────────────────────────────────────

export interface ExportPayload {
  version: number;
  exportedAt: number;
  player: PlayerState;
  workouts: Workout[];
  exercises: Exercise[];
  templates: WorkoutTemplate[];
  events: GameEvent[];
  bossHistory: BossWeek[];
}
