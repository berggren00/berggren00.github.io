import { useEffect, useRef, useState } from 'react';
import type { DraftKey } from './index';
import type { UseGameReturn } from './useGame';

interface Props {
  game: UseGameReturn;
  onBack: () => void;
}

function parseNumericInput(value: string): number {
  return Number(value.trim().replace(',', '.'));
}

function toDraftNumber(value: string): number | '' {
  if (!value.trim()) return '';
  const parsed = parseNumericInput(value);
  return Number.isFinite(parsed) ? parsed : '';
}

function formatWeightDisplay(weight: number): string {
  const rounded = Math.round(weight * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded).replace(/(\.\d*?[1-9])0+$/, '$1');
}

export function WorkoutScreen({ game, onBack }: Props) {
  const {
    exercises, templates, activeWorkout, workoutHistory,
    addExercise, addTemplate, removeTemplate,
    startTrialWithTemplates, setActiveTemplate,
    addSet, removeSet, getDraft, setDraft,
    completeWorkout, cancelWorkout, inscribingId,
  } = game;

  const [view, setView] = useState<'menu' | 'chooseTemplates' | 'newTemplate' | 'addExercise'>('menu');
  const [selectedExerciseId, setSelectedExerciseId] = useState('');
  const [isSetModalOpen, setIsSetModalOpen] = useState(false);
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');

  // Pre-start template selection
  const [chosenTemplateIds, setChosenTemplateIds] = useState<string[]>([]);

  // New template builder
  const [tmplName, setTmplName] = useState('');
  const [tmplExercises, setTmplExercises] = useState<string[]>([]);

  // New exercise form
  const [exName, setExName] = useState('');
  const [exCategory, setExCategory] = useState<'compound' | 'isolation' | 'tempo'>('compound');
  const [buttonEffectOn, setButtonEffectOn] = useState(false);
  const buttonEffectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedTemplateIds = activeWorkout?.selectedTemplateIds ?? [];
  const activeTemplateId = activeWorkout?.activeTemplateId ?? null;
  const activeTemplate = activeTemplateId
    ? templates.find((t) => t.id === activeTemplateId)
    : null;
  const selectableExercises = activeTemplate
    ? exercises.filter((ex) => activeTemplate.exerciseIds.includes(ex.id))
    : [];
  const exMap = new Map(exercises.map((e) => [e.id, e]));

  const visibleSets = activeWorkout && activeTemplateId
    ? activeWorkout.sets.filter((s) => s.templateId === activeTemplateId)
    : [];
  const groupedSets = visibleSets.reduce<Record<string, typeof visibleSets>>((acc, s) => {
    if (!acc[s.exerciseId]) acc[s.exerciseId] = [];
    acc[s.exerciseId].push(s);
    return acc;
  }, {});

  const draftKey: DraftKey | null = activeWorkout && activeTemplateId && selectedExerciseId
    ? `${activeWorkout.id}:${activeTemplateId}:${selectedExerciseId}`
    : null;

  useEffect(() => () => {
    if (buttonEffectTimeoutRef.current) clearTimeout(buttonEffectTimeoutRef.current);
  }, []);

  const handleInscribeExercise = async () => {
    const trimmed = exName.trim();
    if (!trimmed) return;
    await addExercise(trimmed, exCategory);
    setExName('');
    setButtonEffectOn(true);
    if (buttonEffectTimeoutRef.current) clearTimeout(buttonEffectTimeoutRef.current);
    buttonEffectTimeoutRef.current = setTimeout(() => setButtonEffectOn(false), 500);
  };

  useEffect(() => {
    if (!activeWorkout) return;
    if (selectedExerciseId && !selectableExercises.some((ex) => ex.id === selectedExerciseId)) {
      setSelectedExerciseId('');
      setIsSetModalOpen(false);
    }
  }, [activeWorkout, selectableExercises, selectedExerciseId]);

  useEffect(() => {
    if (!activeWorkout || !isSetModalOpen || !draftKey) return;
    const draft = getDraft(draftKey);
    setReps(draft?.reps === '' || draft?.reps === undefined ? '' : String(draft.reps));
    setWeight(draft?.weight === '' || draft?.weight === undefined ? '' : String(draft.weight));
  }, [activeWorkout, draftKey, getDraft, isSetModalOpen]);

  const openSetModal = () => {
    if (!draftKey) return;
    const draft = getDraft(draftKey);
    setReps(draft?.reps === '' || draft?.reps === undefined ? '' : String(draft.reps));
    setWeight(draft?.weight === '' || draft?.weight === undefined ? '' : String(draft.weight));
    setIsSetModalOpen(true);
  };

  const handleAddSet = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedExerciseId || !draftKey) return;

    const parsedReps = parseNumericInput(reps);
    const parsedWeight = parseNumericInput(weight);
    if (!Number.isFinite(parsedReps) || !Number.isFinite(parsedWeight)) return;
    if (parsedReps <= 0 || parsedWeight < 0) return;

    addSet(selectedExerciseId, parsedReps, parsedWeight);
    setDraft(draftKey, { reps: '', weight: parsedWeight, updatedAt: Date.now() });
    setReps('');
    setWeight(String(parsedWeight));
    setIsSetModalOpen(false);
  };

  // Active workout
  if (activeWorkout) {
    const totalVolume = activeWorkout.sets.reduce((sum, s) => sum + s.reps * s.weight, 0);
    const activeTemplateVolume = visibleSets.reduce((sum, s) => sum + s.reps * s.weight, 0);
    const selectedExercise = selectedExerciseId ? exMap.get(selectedExerciseId) : undefined;
    const selectedExerciseIsCompound = selectedExercise?.category === 'compound';
    const selectedExerciseName = selectedExerciseId ? selectedExercise?.name ?? 'Unknown Exercise' : null;
    const selectedExerciseHistoryWorkouts = selectedExerciseId
      ? workoutHistory.filter((workout) => workout.sets.some((set) => set.exerciseId === selectedExerciseId))
      : [];
    const selectedExerciseHistorySets = selectedExerciseId
      ? selectedExerciseHistoryWorkouts.flatMap((workout) =>
          workout.sets
            .filter((set) => set.exerciseId === selectedExerciseId)
            .map((set) => ({ ...set, workoutId: workout.id })),
        )
      : [];
    const hasExerciseHistory = selectedExerciseHistorySets.length > 0;
    const lastUsedAt = hasExerciseHistory
      ? selectedExerciseHistorySets.reduce((latest, set) => Math.max(latest, set.timestamp), 0)
      : 0;
    const topSet = selectedExerciseHistorySets
      .filter((set) => set.reps >= 3)
      .reduce<{ weight: number; reps: number } | null>((best, set) => {
        if (!best) return { weight: set.weight, reps: set.reps };
        if (set.weight > best.weight) return { weight: set.weight, reps: set.reps };
        if (set.weight === best.weight && set.reps > best.reps) return { weight: set.weight, reps: set.reps };
        return best;
      }, null);
    const prSet = selectedExerciseIsCompound
      ? selectedExerciseHistorySets
          .filter((set) => set.reps <= 2)
          .reduce<{ weight: number; reps: number } | null>((best, set) => {
            if (!best) return { weight: set.weight, reps: set.reps };
            if (set.weight > best.weight) return { weight: set.weight, reps: set.reps };
            if (set.weight === best.weight && set.reps > best.reps) return { weight: set.weight, reps: set.reps };
            return best;
          }, null)
      : null;
    const lastSessionWorkout = selectedExerciseHistoryWorkouts[0] ?? null;
    const lastSessionSets = lastSessionWorkout && selectedExerciseId
      ? lastSessionWorkout.sets.filter((set) => set.exerciseId === selectedExerciseId)
      : [];

    return (
      <div className="screen workout-active">
        <div className="workout-topbar">
          <span className="workout-title">{activeWorkout.name}</span>
          <button className="danger-btn" onClick={() => { cancelWorkout(); onBack(); }}>X</button>
        </div>

        <div className="set-logger">
          <select
            className="sf-select"
            value={activeTemplateId ?? ''}
            onChange={(e) => setActiveTemplate(e.target.value)}
          >
            {selectedTemplateIds.map((templateId) => {
              const template = templates.find((t) => t.id === templateId);
              return (
                <option key={templateId} value={templateId}>
                  {template?.name ?? templateId}
                </option>
              );
            })}
          </select>

          <select
            className="sf-select"
            value={selectedExerciseId}
            onChange={(e) => setSelectedExerciseId(e.target.value)}
          >
            <option value="">Select Exercise</option>
            {selectableExercises.map((ex) => (
              <option key={ex.id} value={ex.id}>{ex.name} [{ex.category}]</option>
            ))}
          </select>

          <button
            className="cta-button"
            type="button"
            disabled={!draftKey}
            onClick={openSetModal}
          >
            + Log Set
          </button>
        </div>

        {selectedExerciseName && (
          <section className="exercise-memory-panel">
            <div className="section-label">MEMORY: {selectedExerciseName.toUpperCase()}</div>
            {hasExerciseHistory ? (
              <>
                <div className="memory-row">
                  <span>Last Used</span>
                  <b>{new Date(lastUsedAt).toLocaleDateString()}</b>
                </div>
                <div className="memory-row">
                  <span>Top Set (3+ reps)</span>
                  <b>
                    {topSet
                      ? `${formatWeightDisplay(topSet.weight)}kg x ${topSet.reps}`
                      : 'No top set yet'}
                  </b>
                </div>
                {selectedExerciseIsCompound && (
                  <div className="memory-row">
                    <span>PR (1-2 reps)</span>
                    <b>
                      {prSet
                        ? `${formatWeightDisplay(prSet.weight)}kg x ${prSet.reps}`
                        : 'No PR yet'}
                    </b>
                  </div>
                )}
                <div className="memory-subtitle">Last Session Comparison</div>
                {lastSessionSets.map((set, i) => (
                  <div key={`${lastSessionWorkout?.id ?? 'session'}-${set.timestamp}-${i}`} className="memory-row">
                    <span>{new Date(set.timestamp).toLocaleDateString()}</span>
                    <b>{set.reps} x {set.weight}kg</b>
                  </div>
                ))}
                {lastSessionSets.length === 0 && (
                  <p className="empty-hint">No previous session sets for this exercise.</p>
                )}
              </>
            ) : (
              <p className="empty-hint">No history for this exercise yet.</p>
            )}
          </section>
        )}

        {isSetModalOpen && (
          <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Log set">
            <form className="modal-card" onSubmit={handleAddSet}>
              <div className="modal-header">
                <h3>Add Set</h3>
                <button className="remove-btn" type="button" onClick={() => setIsSetModalOpen(false)}>X</button>
              </div>
              <div className="set-inputs">
                <input
                  className="sf-input"
                  type="text"
                  inputMode="numeric"
                  placeholder="Reps"
                  value={reps}
                  onChange={(e) => {
                    const value = e.target.value;
                    setReps(value);
                    if (draftKey) setDraft(draftKey, { reps: toDraftNumber(value), updatedAt: Date.now() });
                  }}
                />
                <input
                  className="sf-input"
                  type="text"
                  inputMode="decimal"
                  placeholder="kg"
                  value={weight}
                  onChange={(e) => {
                    const value = e.target.value;
                    setWeight(value);
                    if (draftKey) setDraft(draftKey, { weight: toDraftNumber(value), updatedAt: Date.now() });
                  }}
                />
                <button className="icon-btn" type="submit">+</button>
              </div>
            </form>
          </div>
        )}

        <section className="sets-log">
          <div className="section-label">
            {activeTemplate?.name ?? 'Template'} - {visibleSets.length} sets
          </div>
          {Object.entries(groupedSets).map(([exId, sets]) => (
            <div key={exId} className="exercise-group">
              <div className="exercise-group-name">{exMap.get(exId)?.name ?? 'Unknown Exercise'}</div>
              {sets.map((s, i) => (
                <div key={s.id} className="set-row">
                  <span className="set-num">{i + 1}</span>
                  <span>{s.reps} x {s.weight}kg</span>
                  <span className="set-vol">vol {(s.reps * s.weight).toFixed(0)}</span>
                  <button className="remove-btn" onClick={() => removeSet(s.id)}>X</button>
                </div>
              ))}
            </div>
          ))}
          {visibleSets.length === 0 && (
            <p className="empty-hint">No sets logged for this template yet.</p>
          )}
        </section>

        <div className="workout-footer">
          <div className="total-volume">
            Template Volume: {activeTemplateVolume.toLocaleString()} kg | Total: {totalVolume.toLocaleString()} kg
          </div>
          <button
            className="cta-button"
            onClick={() => { completeWorkout(); onBack(); }}
            disabled={activeWorkout.sets.length === 0}
          >
            OFFER TO THE FLAME
          </button>
        </div>
      </div>
    );
  }

  // Add exercise sub-view
  if (view === 'addExercise') {
    return (
      <div className="screen">
        <div className="screen-header">
          <button className="back-btn" onClick={() => setView('menu')}>Back</button>
          <h2>New Exercise</h2>
        </div>
        <input className="sf-input full" placeholder="Exercise name" value={exName} onChange={(e) => setExName(e.target.value)} />
        <div className="category-picker">
          {(['compound', 'isolation', 'tempo'] as const).map((c) => (
            <button key={c} className={`cat-btn ${exCategory === c ? 'active' : ''}`} onClick={() => setExCategory(c)}>
              {c}
            </button>
          ))}
        </div>
        <button className={`cta-button ${buttonEffectOn ? 'inscribe-btn-active' : ''}`} onClick={handleInscribeExercise}>
          Inscribe Exercise
        </button>
        <div className="exercise-checklist">
          {exercises.map((ex) => (
            <div
              key={ex.id}
              className={`ex-check ${inscribingId === ex.id ? 'inscribing' : ''}`}
            >
              <span>{ex.name} <em>[{ex.category}]</em></span>
            </div>
          ))}
          {exercises.length === 0 && <p className="empty-hint">No exercises inscribed yet.</p>}
        </div>
      </div>
    );
  }

  // New template sub-view
  if (view === 'newTemplate') {
    return (
      <div className="screen">
        <div className="screen-header">
          <button className="back-btn" onClick={() => setView('menu')}>Back</button>
          <h2>New Template</h2>
        </div>
        <input className="sf-input full" placeholder="Template name" value={tmplName} onChange={(e) => setTmplName(e.target.value)} />
        <div className="exercise-checklist">
          {exercises.map((ex) => (
            <label key={ex.id} className={`ex-check ${inscribingId === ex.id ? 'inscribing' : ''}`}>
              <input
                type="checkbox"
                checked={tmplExercises.includes(ex.id)}
                onChange={(e) => {
                  setTmplExercises((prev) =>
                    e.target.checked ? [...prev, ex.id] : prev.filter((id) => id !== ex.id)
                  );
                }}
              />
              <span>{ex.name} <em>[{ex.category}]</em></span>
            </label>
          ))}
          {exercises.length === 0 && <p className="empty-hint">No exercises yet. Create one first.</p>}
        </div>
        <button className="cta-button" onClick={() => {
          if (!tmplName.trim()) return;
          addTemplate(tmplName.trim(), tmplExercises);
          setTmplName('');
          setTmplExercises([]);
          setView('menu');
        }}>
          Bind Template
        </button>
      </div>
    );
  }

  if (view === 'chooseTemplates') {
    return (
      <div className="screen">
        <div className="screen-header">
          <button className="back-btn" onClick={() => setView('menu')}>Back</button>
          <h2>Choose Template(s)</h2>
        </div>
        <div className="exercise-checklist">
          {templates.map((tmpl) => (
            <label key={tmpl.id} className="ex-check">
              <input
                type="checkbox"
                checked={chosenTemplateIds.includes(tmpl.id)}
                onChange={(e) => {
                  setChosenTemplateIds((prev) =>
                    e.target.checked ? [...prev, tmpl.id] : prev.filter((id) => id !== tmpl.id)
                  );
                }}
              />
              <span>{tmpl.name} <em>[{tmpl.exerciseIds.length} exercises]</em></span>
            </label>
          ))}
          {templates.length === 0 && <p className="empty-hint">No templates yet. Create one first.</p>}
        </div>
        <button
          className="cta-button"
          disabled={chosenTemplateIds.length < 1}
          onClick={() => {
            startTrialWithTemplates(chosenTemplateIds);
            setView('menu');
            setChosenTemplateIds([]);
          }}
        >
          Start Trial
        </button>
      </div>
    );
  }

  // Main workout menu
  return (
    <div className="screen workout-menu">
      <div className="screen-header">
        <h2>TRIALS</h2>
      </div>

      <section className="section">
        <div className="section-label">BEGIN</div>
        <button
          className="workout-card quick-start"
          onClick={() => setView('chooseTemplates')}
        >
          Choose template(s)
        </button>
      </section>

      <section className="section">
        <div className="section-label">TEMPLATES</div>
        {templates.map((tmpl) => (
          <div key={tmpl.id} className="workout-card template-card">
            <button className="template-name" type="button">
              {tmpl.name}
              <span className="ex-count">{tmpl.exerciseIds.length} exercises</span>
            </button>
            <button className="remove-btn" onClick={() => removeTemplate(tmpl.id)}>X</button>
          </div>
        ))}
        {templates.length === 0 && <p className="empty-hint">No templates yet.</p>}
      </section>

      <div className="action-row">
        <button className="ghost-btn" onClick={() => setView('newTemplate')}>+ Template</button>
        <button className="ghost-btn" onClick={() => setView('addExercise')}>+ Exercise</button>
      </div>
    </div>
  );
}
