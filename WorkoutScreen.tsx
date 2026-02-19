import { useState } from 'react';
import type { UseGameReturn } from './useGame';

interface Props {
  game: UseGameReturn;
  onBack: () => void;
}

export function WorkoutScreen({ game, onBack }: Props) {
  const {
    exercises, templates, activeWorkout,
    addExercise, addTemplate, removeTemplate,
    startWorkout, addSet, removeSet, completeWorkout, cancelWorkout,
  } = game;

  const [view, setView] = useState<'menu' | 'active' | 'newTemplate' | 'addExercise'>('menu');
  const [selectedExerciseId, setSelectedExerciseId] = useState('');
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');

  // New template builder
  const [tmplName, setTmplName] = useState('');
  const [tmplExercises, setTmplExercises] = useState<string[]>([]);

  // New exercise form
  const [exName, setExName] = useState('');
  const [exCategory, setExCategory] = useState<'compound' | 'isolation' | 'tempo'>('compound');

  // ── Active workout ─────────────────────────────────────────────────────────

  if (activeWorkout) {
    const exMap = new Map(exercises.map((e) => [e.id, e]));
    const activeTemplate = activeWorkout.templateId
      ? templates.find((t) => t.id === activeWorkout.templateId)
      : null;
    const selectableExercises = activeTemplate
      ? exercises.filter((ex) => activeTemplate.exerciseIds.includes(ex.id))
      : exercises;
    const groupedSets = activeWorkout.sets.reduce<Record<string, typeof activeWorkout.sets>>((acc, s) => {
      if (!acc[s.exerciseId]) acc[s.exerciseId] = [];
      acc[s.exerciseId].push(s);
      return acc;
    }, {});

    const handleAddSet = () => {
      if (!selectedExerciseId || !reps || !weight) return;
      addSet(selectedExerciseId, Number(reps), Number(weight));
      setSelectedExerciseId('');
      setReps('');
      setWeight('');
    };

    const totalVolume = activeWorkout.sets.reduce((sum, s) => sum + s.reps * s.weight, 0);

    return (
      <div className="screen workout-active">
        <div className="workout-topbar">
          <span className="workout-title">{activeWorkout.name}</span>
          <button className="danger-btn" onClick={() => { cancelWorkout(); onBack(); }}>✕</button>
        </div>

        {/* Set logger */}
        <section className="set-logger">
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

          <div className="set-inputs">
            <input
              className="sf-input" type="number" placeholder="Reps"
              value={reps} onChange={(e) => setReps(e.target.value)}
            />
            <input
              className="sf-input" type="number" placeholder="kg"
              value={weight} onChange={(e) => setWeight(e.target.value)}
            />
            <button className="icon-btn" onClick={handleAddSet}>+</button>
          </div>
        </section>

        {/* Logged sets grouped by exercise */}
        <section className="sets-log">
          {Object.entries(groupedSets).map(([exId, sets]) => (
            <div key={exId} className="exercise-group">
              <div className="exercise-group-name">{exMap.get(exId)?.name ?? exId}</div>
              {sets.map((s, i) => (
                <div key={s.id} className="set-row">
                  <span className="set-num">{i + 1}</span>
                  <span>{s.reps} × {s.weight}kg</span>
                  <span className="set-vol">vol {(s.reps * s.weight).toFixed(0)}</span>
                  <button className="remove-btn" onClick={() => removeSet(s.id)}>✕</button>
                </div>
              ))}
            </div>
          ))}
          {activeWorkout.sets.length === 0 && (
            <p className="empty-hint">No sets logged yet. Begin your trial.</p>
          )}
        </section>

        <div className="workout-footer">
          <div className="total-volume">Total Volume: {totalVolume.toLocaleString()} kg</div>
          <button
            className="cta-button"
            onClick={() => { completeWorkout(); onBack(); }}
            disabled={activeWorkout.sets.length === 0}
          >
            ⚔ OFFER TO THE FLAME
          </button>
        </div>
      </div>
    );
  }

  // ── Add exercise sub-view ──────────────────────────────────────────────────

  if (view === 'addExercise') {
    return (
      <div className="screen">
        <div className="screen-header">
          <button className="back-btn" onClick={() => setView('menu')}>← Back</button>
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
        <button className="cta-button" onClick={() => {
          if (!exName.trim()) return;
          addExercise(exName.trim(), exCategory);
          setExName(''); setView('menu');
        }}>
          Inscribe Exercise
        </button>
      </div>
    );
  }

  // ── New template sub-view ──────────────────────────────────────────────────

  if (view === 'newTemplate') {
    return (
      <div className="screen">
        <div className="screen-header">
          <button className="back-btn" onClick={() => setView('menu')}>← Back</button>
          <h2>New Template</h2>
        </div>
        <input className="sf-input full" placeholder="Template name" value={tmplName} onChange={(e) => setTmplName(e.target.value)} />
        <div className="exercise-checklist">
          {exercises.map((ex) => (
            <label key={ex.id} className="ex-check">
              <input
                type="checkbox"
                checked={tmplExercises.includes(ex.id)}
                onChange={(e) => {
                  setTmplExercises(prev =>
                    e.target.checked ? [...prev, ex.id] : prev.filter(id => id !== ex.id)
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
          setTmplName(''); setTmplExercises([]); setView('menu');
        }}>
          Bind Template
        </button>
      </div>
    );
  }

  // ── Main workout menu ──────────────────────────────────────────────────────

  return (
    <div className="screen workout-menu">
      <div className="screen-header">
        <h2>TRIALS</h2>
      </div>

      {/* Quick start */}
      <section className="section">
        <div className="section-label">QUICK START</div>
        <button className="workout-card quick-start" onClick={() => {
          startWorkout(`Session ${new Date().toLocaleDateString()}`);
        }}>
          + Empty Session
        </button>
      </section>

      {/* Templates */}
      <section className="section">
        <div className="section-label">TEMPLATES</div>
        {templates.map((tmpl) => (
          <div key={tmpl.id} className="workout-card template-card">
            <button className="template-name" onClick={() => startWorkout(tmpl.name, tmpl.id)}>
              {tmpl.name}
              <span className="ex-count">{tmpl.exerciseIds.length} exercises</span>
            </button>
            <button className="remove-btn" onClick={() => removeTemplate(tmpl.id)}>✕</button>
          </div>
        ))}
        {templates.length === 0 && <p className="empty-hint">No templates yet.</p>}
      </section>

      {/* Actions */}
      <div className="action-row">
        <button className="ghost-btn" onClick={() => setView('newTemplate')}>+ Template</button>
        <button className="ghost-btn" onClick={() => setView('addExercise')}>+ Exercise</button>
      </div>
    </div>
  );
}


