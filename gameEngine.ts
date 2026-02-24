import type {
  PlayerAttributes,
  PlayerState,
  SetLog,
  Exercise,
  XPBreakdown,
  LevelProgress,
  Workout,
} from './index';

// ─── Level Math ────────────────────────────────────────────────────────────────

export function xpRequired(level: number): number {
  return 100 + level * 25;
}

export function totalXPForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpRequired(l);
  return total;
}

export function levelFromTotalXP(totalXP: number): { level: number; currentXP: number } {
  let level = 1;
  let remaining = totalXP;
  while (remaining >= xpRequired(level)) {
    remaining -= xpRequired(level);
    level++;
  }
  return { level, currentXP: remaining };
}

export function getLevelProgress(player: PlayerState): LevelProgress {
  const required = xpRequired(player.level);
  return {
    level: player.level,
    currentXP: player.currentXP,
    required,
    percent: Math.min(100, Math.floor((player.currentXP / required) * 100)),
  };
}

// ─── Attribute Derived Stats ───────────────────────────────────────────────────

export function graceCharges(vitality: number): number {
  return Math.floor(vitality / 5);
}

export function maxSetsForXP(endurance: number, base = 20): number {
  return base + Math.floor(endurance / 3);
}

export function compoundBonus(strength: number): number {
  return 1 + strength * 0.02;
}

export function isolationBonus(dexterity: number): number {
  return 1 + dexterity * 0.02;
}

/** Luck is intentionally soft-capped at 20% to prevent it from becoming meta */
export function luckChance(luck: number): number {
  return Math.min(0.2, luck * 0.01);
}

// ─── Consistency Multiplier ───────────────────────────────────────────────────

export function consistencyMultiplier(streak: number): number {
  if (streak >= 7) return 1.6;
  if (streak >= 4) return 1.4;
  if (streak >= 2) return 1.2;
  return 1.0;
}

// ─── Streak Management ────────────────────────────────────────────────────────

export function computeNewStreak(
  lastWorkoutDate: string,
  todayDate: string,
  currentStreak: number,
  graceChargesAvailable: number,
  graceChargesUsed: number,
): { streak: number; graceChargesUsed: number } {
  if (!lastWorkoutDate) return { streak: 1, graceChargesUsed: 0 };

  const last = new Date(lastWorkoutDate);
  const today = new Date(todayDate);
  const diffDays = Math.round((today.getTime() - last.getTime()) / 86400000);

  if (diffDays === 0) {
    // Same day, no streak change
    return { streak: currentStreak, graceChargesUsed };
  }

  if (diffDays === 1) {
    // Perfect streak
    return { streak: currentStreak + 1, graceChargesUsed: 0 };
  }

  if (diffDays === 2) {
    // Missed one day — check grace
    const available = graceChargesAvailable - graceChargesUsed;
    if (available > 0) {
      return { streak: currentStreak + 1, graceChargesUsed: graceChargesUsed + 1 };
    }
  }

  // Streak broken
  return { streak: 1, graceChargesUsed: 0 };
}

// ─── XP Calculation ───────────────────────────────────────────────────────────

export function calculateXP(
  sets: SetLog[],
  exercises: Exercise[],
  player: PlayerState,
  streak: number,
  todayDate: string,
  randomSeed?: number, // 0-1, injected for testability
): XPBreakdown {
  const attrs = player.attributes;
  const exerciseMap = new Map(exercises.map((e) => [e.id, e]));

  // Endurance: cap how many sets count
  const cappedSets = sets.slice(0, maxSetsForXP(attrs.endurance));

  const base = 100;

  // Volume bonus with category modifiers applied per-set
  let volumeBonus = 0;
  for (const set of cappedSets) {
    const ex = exerciseMap.get(set.exerciseId);
    const rawVolume = set.reps * set.weight * 0.1;
    if (ex?.category === 'compound') {
      volumeBonus += rawVolume * compoundBonus(attrs.strength);
    } else if (ex?.category === 'isolation' || ex?.category === 'tempo') {
      volumeBonus += rawVolume * isolationBonus(attrs.dexterity);
    } else {
      volumeBonus += rawVolume;
    }
  }

  const mult = consistencyMultiplier(streak);

  // Luck: Double XP roll
  const roll = randomSeed ?? Math.random();
  const doubleXP = roll < luckChance(attrs.luck);

  const raw = (base + volumeBonus) * mult;
  const total = Math.round(doubleXP ? raw * 2 : raw);

  return {
    base,
    volumeBonus: Math.round(volumeBonus),
    consistencyMultiplier: mult,
    strengthBonus: compoundBonus(attrs.strength),
    dexterityBonus: isolationBonus(attrs.dexterity),
    doubleXP,
    total,
  };
}

// ─── Boss Damage ──────────────────────────────────────────────────────────────

export function calculateDamage(sets: SetLog[]): number {
  const totalVolume = sets.reduce((sum, s) => sum + s.reps * s.weight, 0);
  return Math.round(totalVolume * 0.5);
}

// ─── Apply XP to Player ───────────────────────────────────────────────────────

export interface ApplyXPResult {
  newPlayer: PlayerState;
  levelsGained: number;
  attributePointsGained: number;
}

export function applyXP(player: PlayerState, xp: number): ApplyXPResult {
  let currentXP = player.currentXP + xp;
  let level = player.level;
  let levelsGained = 0;

  while (currentXP >= xpRequired(level)) {
    currentXP -= xpRequired(level);
    level++;
    levelsGained++;
  }

  const attributePointsGained = levelsGained;

  return {
    newPlayer: {
      ...player,
      level,
      currentXP,
      totalXP: player.totalXP + xp,
      attributePoints: player.attributePoints + attributePointsGained,
    },
    levelsGained,
    attributePointsGained,
  };
}

// ─── Spend Attribute Point ────────────────────────────────────────────────────

export function spendAttributePoint(
  player: PlayerState,
  attribute: keyof PlayerAttributes,
): PlayerState {
  if (player.attributePoints < 1) throw new Error('No attribute points available');
  return {
    ...player,
    attributePoints: player.attributePoints - 1,
    attributes: {
      ...player.attributes,
      [attribute]: player.attributes[attribute] + 1,
    },
  };
}

// ─── Default Player ───────────────────────────────────────────────────────────

export function defaultPlayer(): PlayerState {
  return {
    level: 1,
    currentXP: 0,
    totalXP: 0,
    attributePoints: 0,
    attributes: { vitality: 0, endurance: 0, strength: 0, dexterity: 0, luck: 0 },
    streak: 0,
    lastWorkoutDate: '',
    graceChargesUsed: 0,
    badges: [],
    bestWorkoutVolume: 0,
    exerciseRecords: {},
  };
}
