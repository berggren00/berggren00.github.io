import type { BossWeek } from './index';

const BOSS_MAX_HP = 10_000;

const BOSS_NAMES = [
  'The Gaping Maw', 'Iron Colossus', 'The Ashen Titan', 'Rusted King',
  'Hollow Sovereign', 'The Starved Giant', 'Cinderbound Golem', 'Wretched Colossus',
  'The Undying Sentinel', 'Lord of Cinders', 'The Sunken Dread', 'Phantom Arbiter',
];

export function getISOWeekId(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

function deterministicBossName(weekId: string): string {
  let hash = 0;
  for (const ch of weekId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return BOSS_NAMES[hash % BOSS_NAMES.length];
}

export function createBossWeek(date: Date = new Date()): BossWeek {
  const id = getISOWeekId(date);
  return {
    id,
    bossName: deterministicBossName(id),
    maxHP: BOSS_MAX_HP,
    currentHP: BOSS_MAX_HP,
    startDate: getMondayOfWeek(date),
    defeated: false,
  };
}

export function applyDamageToBoss(boss: BossWeek, damage: number): BossWeek {
  const currentHP = Math.max(0, boss.currentHP - damage);
  return { ...boss, currentHP, defeated: currentHP === 0 };
}

export function bossHPPercent(boss: BossWeek): number {
  return Math.max(0, Math.round((boss.currentHP / boss.maxHP) * 100));
}

export function isBossWeekCurrent(boss: BossWeek, date: Date = new Date()): boolean {
  return boss.id === getISOWeekId(date);
}

export function bossDefeatBadge(weekId: string): string {
  return `BOSS_DEFEATED_${weekId}`;
}
