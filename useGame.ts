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
  ExerciseRecord,
  WorkoutResolutionPayload,
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

const MAX_RECENT_SETS_PER_EXERCISE = 5;

function normalizeExerciseRecord(exerciseId: string, record?: Partial<ExerciseRecord>): ExerciseRecord {
  const legacy = record as Partial<ExerciseRecord> & { bestWeight?: number };
  return {
    exerciseId,
    lastUsedAt: typeof record?.lastUsedAt === 'number' ? record.lastUsedAt : 0,
    recentSets: Array.isArray(record?.recentSets) ? record.recentSets : [],
    topSetWeight: typeof record?.topSetWeight === 'number'
      ? record.topSetWeight
      : (typeof legacy.bestWeight === 'number' ? legacy.bestWeight : 0),
    topSetReps: typeof record?.topSetReps === 'number' ? record.topSetReps : 0,
    prWeight: typeof record?.prWeight === 'number'
      ? record.prWeight
      : (typeof legacy.bestWeight === 'number' ? legacy.bestWeight : 0),
    prReps: typeof record?.prReps === 'number' ? record.prReps : 0,
    bestSetVolume: typeof record?.bestSetVolume === 'number' ? record.bestSetVolume : 0,
    bestWorkoutVolume: typeof record?.bestWorkoutVolume === 'number' ? record.bestWorkoutVolume : 0,
    bestWorkoutId: record?.bestWorkoutId,
  };
}

function isBetterWeightRep(candidate: { weight: number; reps: number } | null, current: { weight: number; reps: number } | null): boolean {
  if (!candidate) return false;
  if (!current) return true;
  if (candidate.weight > current.weight) return true;
  if (candidate.weight < current.weight) return false;
  return candidate.reps > current.reps;
}

function normalizePlayerState(player: PlayerState): PlayerState {
  const legacy = player as PlayerState & Partial<Pick<PlayerState, 'bestWorkoutVolume' | 'exerciseRecords'>>;
  const normalizedRecords = Object.fromEntries(
    Object.entries(legacy.exerciseRecords ?? {}).map(([exerciseId, record]) => [
      exerciseId,
      normalizeExerciseRecord(exerciseId, record as Partial<ExerciseRecord>),
    ]),
  );
  return {
    ...player,
    bestWorkoutVolume: typeof legacy.bestWorkoutVolume === 'number' ? legacy.bestWorkoutVolume : 0,
    exerciseRecords: normalizedRecords,
  };
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
  inscribingId: string | null;
  exerciseRecords: Record<string, ExerciseRecord>;
  pendingResolution: WorkoutResolutionPayload | null;

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
  setPendingResolution: (payload: WorkoutResolutionPayload | null) => void;
  clearPendingResolution: () => void;
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
  const [inscribingId, setInscribingId] = useState<string | null>(null);
  const [pendingResolution, setPendingResolutionState] = useState<WorkoutResolutionPayload | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftValue>>({});
  const activeRef = useRef<Workout | null>(null);
  const inscribeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  activeRef.current = activeWorkout;

  useEffect(() => () => {
    if (inscribeTimeoutRef.current) {
      clearTimeout(inscribeTimeoutRef.current);
    }
  }, []);

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      let p = await getPlayer();
      if (!p) {
        p = defaultPlayer();
        await savePlayer(p);
      } else {
        const normalized = normalizePlayerState(p);
        p = normalized;
        await savePlayer(normalized);
      }
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
    setExercises((prev) => [ex, ...prev]);
    if (inscribeTimeoutRef.current) clearTimeout(inscribeTimeoutRef.current);
    setInscribingId(ex.id);
    inscribeTimeoutRef.current = setTimeout(() => setInscribingId(null), 500);
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
    const totalVolume = workout.sets.reduce((sum, s) => sum + s.reps * s.weight, 0);

    // Level up
    const { newPlayer: playerAfterXP, levelsGained } = applyXP(player, breakdown.total);
    let updatedExerciseRecords: Record<string, ExerciseRecord>;
    try {
      updatedExerciseRecords = {
        ...(player.exerciseRecords ?? {}),
      };
      const setsByExercise = workout.sets.reduce<Record<string, SetLog[]>>((acc, set) => {
        if (!acc[set.exerciseId]) acc[set.exerciseId] = [];
        acc[set.exerciseId].push(set);
        return acc;
      }, {});
      Object.entries(setsByExercise).forEach(([exerciseId, sets]) => {
        const existing = normalizeExerciseRecord(exerciseId, updatedExerciseRecords[exerciseId]);
        const exercise = exercises.find((ex) => ex.id === exerciseId);
        const isCompound = exercise?.category === 'compound';
        const prevTopSet = {
          weight: typeof existing.topSetWeight === 'number' ? existing.topSetWeight : 0,
          reps: typeof existing.topSetReps === 'number' ? existing.topSetReps : 0,
        };
        const prevPR = {
          weight: typeof existing.prWeight === 'number' ? existing.prWeight : 0,
          reps: typeof existing.prReps === 'number' ? existing.prReps : 0,
        };
        const prevBestSetVolume = typeof existing.bestSetVolume === 'number' ? existing.bestSetVolume : 0;
        const prevBestWorkoutVolume = typeof existing.bestWorkoutVolume === 'number' ? existing.bestWorkoutVolume : 0;
        const topSetVolume = sets.reduce((m, s) => Math.max(m, s.reps * s.weight), 0);
        const exerciseWorkoutVolume = sets.reduce((sum, s) => sum + s.reps * s.weight, 0);
        const topSetCandidate = sets
          .filter((s) => Number.isFinite(s.reps) && Number.isFinite(s.weight) && s.reps >= 3)
          .reduce<{ weight: number; reps: number } | null>((best, s) => {
            const candidate = { weight: s.weight, reps: s.reps };
            return isBetterWeightRep(candidate, best) ? candidate : best;
          }, null);
        const prCandidate = isCompound
          ? sets
              .filter((s) => Number.isFinite(s.reps) && Number.isFinite(s.weight) && s.reps <= 2)
              .reduce<{ weight: number; reps: number } | null>((best, s) => {
                const candidate = { weight: s.weight, reps: s.reps };
                return isBetterWeightRep(candidate, best) ? candidate : best;
              }, null)
          : null;
        const nextTopSet = isBetterWeightRep(topSetCandidate, prevTopSet) ? (topSetCandidate ?? prevTopSet) : prevTopSet;
        const nextPR = isCompound && isBetterWeightRep(prCandidate, prevPR) ? (prCandidate ?? prevPR) : prevPR;
        const appendedRecent = sets
          .filter((s) => Number.isFinite(s.reps) && Number.isFinite(s.weight) && Number.isFinite(s.timestamp))
          .map((s) => ({
            reps: s.reps,
            weight: s.weight,
            volume: s.reps * s.weight,
            timestamp: s.timestamp,
            workoutId: workout.id,
          }));
        const mergedRecent = [...appendedRecent, ...existing.recentSets]
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, MAX_RECENT_SETS_PER_EXERCISE);
        updatedExerciseRecords[exerciseId] = {
          ...existing,
          lastUsedAt: Date.now(),
          recentSets: mergedRecent,
          topSetWeight: nextTopSet.weight,
          topSetReps: nextTopSet.reps,
          prWeight: nextPR.weight,
          prReps: nextPR.reps,
          bestSetVolume: Math.max(prevBestSetVolume, topSetVolume),
          bestWorkoutVolume: Math.max(prevBestWorkoutVolume, exerciseWorkoutVolume),
          bestWorkoutId: exerciseWorkoutVolume >= prevBestWorkoutVolume ? workout.id : existing.bestWorkoutId,
        };
      });
    } catch {
      // Never let memory/PR updates block workout completion.
      updatedExerciseRecords = player.exerciseRecords ?? {};
    }
    const isPersonalBest = totalVolume > (player.bestWorkoutVolume ?? 0);
    const finalPlayer: PlayerState = {
      ...playerAfterXP,
      streak: newStreakResult.streak,
      lastWorkoutDate: today,
      graceChargesUsed: newStreakResult.graceChargesUsed,
      bestWorkoutVolume: Math.max(player.bestWorkoutVolume ?? 0, totalVolume),
      exerciseRecords: updatedExerciseRecords,
    };

    // Boss damage
    let updatedBoss = applyDamageToBoss(boss, damage);

    // Complete workout record
    const completedWorkout: Workout = {
      ...workout,
      completedAt: Date.now(),
      xpAwarded: breakdown.total,
      damageDealt: damage,
      totalVolume,
      isPersonalBest,
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

  const setPendingResolution = useCallback((payload: WorkoutResolutionPayload | null) => {
    setPendingResolutionState(payload);
  }, []);

  const clearPendingResolution = useCallback(() => {
    setPendingResolutionState(null);
  }, []);

  const exerciseRecords = player?.exerciseRecords ?? {};

  return {
    player, boss, exercises, templates, activeWorkout,
    workoutHistory, loading, lastXPGain, doubleXPTriggered, inscribingId, exerciseRecords, pendingResolution,
    spendStat, addExercise, addTemplate, removeTemplate,
    startTrialWithTemplates, setActiveTemplate, addSet, removeSet,
    getDraft, setDraft, clearDraft, completeWorkout, cancelWorkout,
    exportSave, importSave, setPendingResolution, clearPendingResolution,
  };
}
