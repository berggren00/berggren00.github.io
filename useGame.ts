import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  PlayerState,
  Workout,
  Exercise,
  BossWeek,
  SetLog,
  WorkoutTemplate,
  DraftKey,
  DraftValue,
} from './index';
import {
  getPlayer, savePlayer, getAllExercises, saveExercise,
  getAllTemplates, saveTemplate, deleteTemplate,
  saveWorkout, getAllWorkouts,
  getBossWeek, saveBossWeek,
  appendEvent, exportData, downloadJSON, importFromFile,
} from './db';
import {
  defaultPlayer, calculateXP, calculateDamage,
  applyXP, spendAttributePoint, computeNewStreak, graceCharges,
} from './gameEngine';
import {
  getISOWeekId, createBossWeek, applyDamageToBoss, bossDefeatBadge, withBossImage,
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
  startTrialWithTemplates: (templateIds: string[], name?: string) => void;
  setActiveTemplate: (templateId: string) => void;
  addSet: (exerciseId: string, reps: number, weight: number) => void;
  removeSet: (setId: string) => void;
  getDraft: (key: DraftKey) => DraftValue | null;
  setDraft: (key: DraftKey, partial: Partial<DraftValue>) => void;
  clearDraft: (key: DraftKey) => void;
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
  const [drafts, setDrafts] = useState<Record<string, DraftValue>>({});
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
      b = withBossImage(b);
      await saveBossWeek(b);
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

  const startTrialWithTemplates = useCallback((templateIds: string[], name?: string) => {
    const validTemplateIds = Array.from(new Set(templateIds))
      .filter((id) => templates.some((t) => t.id === id));
    if (validTemplateIds.length === 0) return;
    const sessionName = name?.trim()
      || (validTemplateIds.length === 1
        ? (templates.find((t) => t.id === validTemplateIds[0])?.name ?? `Session ${new Date().toLocaleDateString()}`)
        : `Session ${new Date().toLocaleDateString()}`);
    const workout: Workout = {
      id: uid(),
      name: sessionName,
      selectedTemplateIds: validTemplateIds,
      activeTemplateId: validTemplateIds[0],
      sets: [],
      startedAt: Date.now(),
    };
    setActiveWorkout(workout);
    activeRef.current = workout;
    void saveWorkout(workout);
  }, [templates]);

  const setActiveTemplate = useCallback((templateId: string) => {
    const workout = activeRef.current;
    if (!workout || !workout.selectedTemplateIds.includes(templateId)) return;
    if (workout.activeTemplateId === templateId) return;
    const updated: Workout = { ...workout, activeTemplateId: templateId };
    setActiveWorkout(updated);
    activeRef.current = updated;
    void saveWorkout(updated);
  }, []);

  const addSet = useCallback((exerciseId: string, reps: number, weight: number) => {
    const workout = activeRef.current;
    if (!workout || !workout.activeTemplateId) return;
    const newSet: SetLog = {
      id: uid(),
      exerciseId,
      reps,
      weight,
      templateId: workout.activeTemplateId,
      timestamp: Date.now(),
    };
    const updated: Workout = { ...workout, sets: [...workout.sets, newSet] };
    setActiveWorkout(updated);
    activeRef.current = updated;
    void saveWorkout(updated);
    if (player) {
      appendEvent({ id: uid(), type: 'SET_LOGGED', timestamp: Date.now(), workoutId: activeRef.current?.id ?? '', setId: newSet.id, exerciseId, reps, weight });
    }
  }, [player]);

  const removeSet = useCallback((setId: string) => {
    const workout = activeRef.current;
    if (!workout) return;
    const updated: Workout = { ...workout, sets: workout.sets.filter((s) => s.id !== setId) };
    setActiveWorkout(updated);
    activeRef.current = updated;
    void saveWorkout(updated);
  }, []);

  const getDraft = useCallback((key: DraftKey): DraftValue | null => {
    return drafts[key] ?? null;
  }, [drafts]);

  const setDraft = useCallback((key: DraftKey, partial: Partial<DraftValue>) => {
    setDrafts((prev) => {
      const current = prev[key] ?? { reps: '', weight: '', updatedAt: Date.now() };
      return {
        ...prev,
        [key]: { ...current, ...partial, updatedAt: partial.updatedAt ?? Date.now() },
      };
    });
  }, []);

  const clearDraft = useCallback((key: DraftKey) => {
    setDrafts((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
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

  const cancelWorkout = useCallback(() => {
    const workoutId = activeRef.current?.id;
    setActiveWorkout(null);
    activeRef.current = null;
    if (workoutId) {
      setDrafts((prev) => {
        const next = Object.fromEntries(
          Object.entries(prev).filter(([key]) => !key.startsWith(`${workoutId}:`)),
        );
        return next;
      });
    }
  }, []);

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
    startTrialWithTemplates, setActiveTemplate, addSet, removeSet,
    getDraft, setDraft, clearDraft, completeWorkout, cancelWorkout,
    exportSave, importSave,
  };
}
