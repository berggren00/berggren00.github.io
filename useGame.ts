import { useState, useEffect, useCallback, useRef } from 'react';
import type { PlayerState, Workout, Exercise, BossWeek, SetLog, WorkoutTemplate } from './index';
import {
  getPlayer, savePlayer, getAllExercises, saveExercise,
  getAllTemplates, saveTemplate, deleteTemplate,
  getWorkout, saveWorkout, getAllWorkouts,
  getBossWeek, saveBossWeek,
  appendEvent, exportData, downloadJSON, importFromFile,
} from './db';
import {
  defaultPlayer, calculateXP, calculateDamage,
  applyXP, spendAttributePoint, computeNewStreak, graceCharges,
} from './gameEngine';
import {
  getISOWeekId, createBossWeek, applyDamageToBoss, bossDefeatBadge,
} from './bossEngine';

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface UseGameReturn {
  // State
  player: PlayerState | null;
  boss: BossWeek | null;
  exercises: Exercise[];
  templates: WorkoutTemplate[];
  activeWorkout: Workout | null;
  workoutHistory: Workout[];
  loading: boolean;
  lastXPGain: number | null;
  doubleXPTriggered: boolean;

  // Player actions
  spendStat: (attr: keyof PlayerState['attributes']) => Promise<void>;

  // Exercise library
  addExercise: (name: string, category: Exercise['category']) => Promise<Exercise>;

  // Template management
  addTemplate: (name: string, exerciseIds: string[]) => Promise<WorkoutTemplate>;
  removeTemplate: (id: string) => Promise<void>;

  // Workout flow
  startWorkout: (name: string, templateId?: string) => void;
  addSet: (exerciseId: string, reps: number, weight: number) => void;
  removeSet: (setId: string) => void;
  completeWorkout: () => Promise<void>;
  cancelWorkout: () => void;

  // Data
  exportSave: () => Promise<void>;
  importSave: (file: File) => Promise<void>;
}

export function useGame(): UseGameReturn {
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [boss, setBoss] = useState<BossWeek | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null);
  const [workoutHistory, setWorkoutHistory] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastXPGain, setLastXPGain] = useState<number | null>(null);
  const [doubleXPTriggered, setDoubleXPTriggered] = useState(false);
  const activeRef = useRef<Workout | null>(null);
  activeRef.current = activeWorkout;

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      let p = await getPlayer();
      if (!p) { p = defaultPlayer(); await savePlayer(p); }
      setPlayer(p);

      const weekId = getISOWeekId(new Date());
      let b = await getBossWeek(weekId);
      if (!b) { b = createBossWeek(); await saveBossWeek(b); }
      setBoss(b);

      const [exs, tmpls, whs] = await Promise.all([
        getAllExercises(), getAllTemplates(), getAllWorkouts(),
      ]);
      setExercises(exs);
      setTemplates(tmpls);
      setWorkoutHistory(whs.filter((w) => !!w.completedAt).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)));
      setLoading(false);
    })();
  }, []);

  // ── Player actions ────────────────────────────────────────────────────────

  const spendStat = useCallback(async (attr: keyof PlayerState['attributes']) => {
    if (!player) return;
    const updated = spendAttributePoint(player, attr);
    await savePlayer(updated);
    await appendEvent({ id: uid(), type: 'ATTRIBUTE_SPENT', timestamp: Date.now(), attribute: attr, newValue: updated.attributes[attr] });
    setPlayer(updated);
  }, [player]);

  // ── Exercise library ──────────────────────────────────────────────────────

  const addExercise = useCallback(async (name: string, category: Exercise['category']): Promise<Exercise> => {
    const ex: Exercise = { id: uid(), name, category, muscleGroups: [] };
    await saveExercise(ex);
    setExercises((prev) => [...prev, ex]);
    return ex;
  }, []);

  // ── Templates ─────────────────────────────────────────────────────────────

  const addTemplate = useCallback(async (name: string, exerciseIds: string[]): Promise<WorkoutTemplate> => {
    const tmpl: WorkoutTemplate = { id: uid(), name, exerciseIds, createdAt: Date.now() };
    await saveTemplate(tmpl);
    setTemplates((prev) => [...prev, tmpl]);
    return tmpl;
  }, []);

  const removeTemplate = useCallback(async (id: string) => {
    await deleteTemplate(id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Workout flow ──────────────────────────────────────────────────────────

  const startWorkout = useCallback((name: string, templateId?: string) => {
    const workout: Workout = { id: uid(), name, templateId, sets: [], startedAt: Date.now() };
    setActiveWorkout(workout);
  }, []);

  const addSet = useCallback((exerciseId: string, reps: number, weight: number) => {
    const newSet: SetLog = { id: uid(), exerciseId, reps, weight, timestamp: Date.now() };
    setActiveWorkout((prev) => prev ? { ...prev, sets: [...prev.sets, newSet] } : prev);
    if (player) {
      appendEvent({ id: uid(), type: 'SET_LOGGED', timestamp: Date.now(), workoutId: activeRef.current?.id ?? '', setId: newSet.id, exerciseId, reps, weight });
    }
  }, [player]);

  const removeSet = useCallback((setId: string) => {
    setActiveWorkout((prev) => prev ? { ...prev, sets: prev.sets.filter((s) => s.id !== setId) } : prev);
  }, []);

  const completeWorkout = useCallback(async () => {
    const workout = activeRef.current;
    if (!workout || !player || !boss) return;

    const today = todayISO();
    const newStreakResult = computeNewStreak(
      player.lastWorkoutDate, today, player.streak,
      graceCharges(player.attributes.vitality), player.graceChargesUsed,
    );

    const breakdown = calculateXP(workout.sets, exercises, player, newStreakResult.streak, today);
    const damage = calculateDamage(workout.sets);

    // Level up
    const { newPlayer: playerAfterXP, levelsGained } = applyXP(player, breakdown.total);
    const finalPlayer: PlayerState = {
      ...playerAfterXP,
      streak: newStreakResult.streak,
      lastWorkoutDate: today,
      graceChargesUsed: newStreakResult.graceChargesUsed,
    };

    // Boss damage
    let updatedBoss = applyDamageToBoss(boss, damage);

    // Complete workout record
    const completedWorkout: Workout = {
      ...workout,
      completedAt: Date.now(),
      xpAwarded: breakdown.total,
      damageDealt: damage,
    };

    // Persist
    await Promise.all([
      savePlayer(finalPlayer),
      saveWorkout(completedWorkout),
      saveBossWeek(updatedBoss),
    ]);

    // Fire events
    await appendEvent({
      id: uid(), type: 'WORKOUT_COMPLETED', timestamp: Date.now(),
      workoutId: workout.id, xpAwarded: breakdown.total,
      damageDealt: damage, leveledUp: levelsGained > 0, doubleXP: breakdown.doubleXP,
    });

    if (levelsGained > 0) {
      await appendEvent({
        id: uid(), type: 'LEVEL_UP', timestamp: Date.now(),
        newLevel: finalPlayer.level, attributePointsGranted: levelsGained,
      });
    }

    // Boss defeated?
    if (updatedBoss.defeated && !boss.defeated) {
      const badge = bossDefeatBadge(boss.id);
      const playerWithBadge: PlayerState = {
        ...finalPlayer,
        attributePoints: finalPlayer.attributePoints + 1,
        badges: [...finalPlayer.badges, badge],
      };
      await savePlayer(playerWithBadge);
      await appendEvent({
        id: uid(), type: 'BOSS_DEFEATED', timestamp: Date.now(),
        bossWeekId: boss.id, bossName: boss.bossName,
        attributePointAwarded: 1, badgeUnlocked: badge,
      });
      setPlayer(playerWithBadge);
    } else {
      setPlayer(finalPlayer);
    }

    setBoss(updatedBoss);
    setLastXPGain(breakdown.total);
    setDoubleXPTriggered(breakdown.doubleXP);
    setActiveWorkout(null);
    setWorkoutHistory((prev) => [completedWorkout, ...prev]);

    // Clear notification after 4s
    setTimeout(() => { setLastXPGain(null); setDoubleXPTriggered(false); }, 4000);
  }, [player, boss, exercises]);

  const cancelWorkout = useCallback(() => setActiveWorkout(null), []);

  // ── Export / Import ───────────────────────────────────────────────────────

  const exportSave = useCallback(async () => {
    const payload = await exportData();
    downloadJSON(payload);
  }, []);

  const importSave = useCallback(async (file: File) => {
    await importFromFile(file);
    window.location.reload();
  }, []);

  return {
    player, boss, exercises, templates, activeWorkout,
    workoutHistory, loading, lastXPGain, doubleXPTriggered,
    spendStat, addExercise, addTemplate, removeTemplate,
    startWorkout, addSet, removeSet, completeWorkout, cancelWorkout,
    exportSave, importSave,
  };
}
