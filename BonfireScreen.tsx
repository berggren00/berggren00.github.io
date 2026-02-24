import { useEffect, useRef, useState } from 'react';
import type { UseGameReturn } from './useGame';
import type { WorkoutResolutionPayload } from './index';
import { getLevelProgress, xpRequired } from './gameEngine';
import { bossHPPercent } from './bossEngine';

interface Props {
  game: UseGameReturn;
  onNavigate: (tab: 'workout' | 'character') => void;
}

export function BonfireScreen({ game, onNavigate }: Props) {
  const {
    player, boss, lastXPGain, doubleXPTriggered,
    pendingResolution, clearPendingResolution,
    exportSave, importSave,
  } = game;
  const [importing, setImporting] = useState(false);
  const [bossHit, setBossHit] = useState(false);
  const [bossBarImpact, setBossBarImpact] = useState<'none' | 'minor' | 'major'>('none');
  const [bossLagHP, setBossLagHP] = useState(100);
  const [bossLagAnimating, setBossLagAnimating] = useState(false);
  const [visibleResolution, setVisibleResolution] = useState<WorkoutResolutionPayload | null>(null);
  const previousBossHPForHit = useRef<number | null>(null);
  const previousBossHPForLag = useRef<number | null>(null);
  const lagDelayTimerRef = useRef<number | null>(null);
  const lagAnimFrameRef = useRef<number | null>(null);
  const resolutionTimerRef = useRef<number | null>(null);
  const bossBarImpactTimerRef = useRef<number | null>(null);
  const commitImpactAnimFrameRef = useRef<number | null>(null);

  if (!player || !boss) return null;

  const progress = getLevelProgress(player);
  const bossHP = bossHPPercent(boss);

  useEffect(() => {
    const prev = previousBossHPForHit.current;
    previousBossHPForHit.current = boss.currentHP;

    if (prev === null) return;
    if (boss.currentHP >= prev || boss.currentHP <= 0) return;
    const delta = prev - boss.currentHP;
    const deltaPct = boss.maxHP > 0 ? (delta / boss.maxHP) * 100 : 0;

    setBossHit(true);
    setBossBarImpact(deltaPct >= 6 ? 'major' : 'minor');
    const timer = window.setTimeout(() => setBossHit(false), 260);
    if (bossBarImpactTimerRef.current !== null) window.clearTimeout(bossBarImpactTimerRef.current);
    bossBarImpactTimerRef.current = window.setTimeout(() => {
      setBossBarImpact('none');
      bossBarImpactTimerRef.current = null;
    }, 900);
    return () => window.clearTimeout(timer);
  }, [boss.currentHP, boss.maxHP]);

  useEffect(() => {
    const prev = previousBossHPForLag.current;
    previousBossHPForLag.current = bossHP;

    if (lagDelayTimerRef.current !== null) {
      window.clearTimeout(lagDelayTimerRef.current);
      lagDelayTimerRef.current = null;
    }
    if (lagAnimFrameRef.current !== null) {
      window.cancelAnimationFrame(lagAnimFrameRef.current);
      lagAnimFrameRef.current = null;
    }

    if (prev === null) {
      setBossLagAnimating(false);
      setBossLagHP(bossHP);
      return;
    }

    if (bossHP < prev) {
      setBossLagAnimating(false);
      setBossLagHP(prev);
      lagDelayTimerRef.current = window.setTimeout(() => {
        setBossLagAnimating(true);
        lagAnimFrameRef.current = window.requestAnimationFrame(() => {
          setBossLagHP(bossHP);
          lagAnimFrameRef.current = null;
        });
      }, 300);
      return;
    }

    setBossLagAnimating(false);
    setBossLagHP(bossHP);
  }, [bossHP]);

  useEffect(() => {
    return () => {
      if (lagDelayTimerRef.current !== null) window.clearTimeout(lagDelayTimerRef.current);
      if (lagAnimFrameRef.current !== null) window.cancelAnimationFrame(lagAnimFrameRef.current);
      if (resolutionTimerRef.current !== null) window.clearTimeout(resolutionTimerRef.current);
      if (bossBarImpactTimerRef.current !== null) window.clearTimeout(bossBarImpactTimerRef.current);
      if (commitImpactAnimFrameRef.current !== null) window.cancelAnimationFrame(commitImpactAnimFrameRef.current);
    };
  }, []);

  useEffect(() => {
    if (resolutionTimerRef.current !== null) {
      window.clearTimeout(resolutionTimerRef.current);
      resolutionTimerRef.current = null;
    }
    if (!pendingResolution) {
      setVisibleResolution(null);
      return;
    }
    // Explicitly trigger a visible commit-impact effect when returning from End Workout.
    const committedPct = boss.maxHP > 0 ? (pendingResolution.committedDamage / boss.maxHP) * 100 : 0;
    const impactType = committedPct >= 6 ? 'major' : 'minor';
    setBossBarImpact(impactType);
    setBossHit(true);
    if (bossBarImpactTimerRef.current !== null) window.clearTimeout(bossBarImpactTimerRef.current);
    bossBarImpactTimerRef.current = window.setTimeout(() => {
      setBossBarImpact('none');
      setBossHit(false);
      bossBarImpactTimerRef.current = null;
    }, 1400);

    // Force a lag-bar travel even when Bonfire mounts after HP has already changed.
    const startLag = Math.min(100, bossHP + committedPct);
    setBossLagAnimating(false);
    setBossLagHP(startLag);
    if (commitImpactAnimFrameRef.current !== null) window.cancelAnimationFrame(commitImpactAnimFrameRef.current);
    commitImpactAnimFrameRef.current = window.requestAnimationFrame(() => {
      setBossLagAnimating(true);
      setBossLagHP(bossHP);
      commitImpactAnimFrameRef.current = null;
    });

    resolutionTimerRef.current = window.setTimeout(() => {
      setVisibleResolution(pendingResolution);
      resolutionTimerRef.current = null;
    }, 1600);
  }, [pendingResolution, boss.maxHP, bossHP]);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    importSave(file).catch(() => setImporting(false));
  };

  return (
    <div className="screen bonfire-screen">
      {lastXPGain !== null && (
        <div className={`xp-toast ${doubleXPTriggered ? 'double' : ''}`}>
          {doubleXPTriggered && <span className="double-label">{'\u2726'} FORTUNE SMILES {'\u2726'}</span>}
          <span>+{lastXPGain} XP</span>
        </div>
      )}

      <header className="bonfire-header bonfire-header-compact">
        <div className="level-badge">LVL {player.level}</div>
        <div className="player-name">Undead Warrior</div>
        <div className="streak-display">
          <span className="streak-icon">{'\u25C8'}</span>
          <span className="streak-count">{player.streak}</span>
          <span className="streak-label">day streak</span>
        </div>
      </header>

      <section className="xp-section">
        <div className="xp-bar-label">
          <span>EXPERIENCE</span>
          <span>{player.currentXP} / {xpRequired(player.level)}</span>
        </div>
        <div className="bar-track">
          <div className="bar-fill xp-fill" style={{ width: `${progress.percent}%` }} />
        </div>
      </section>

      <section className="boss-section">
        <div className="boss-header">
          <span className="boss-label">WEEKLY BOSS</span>
          {boss.defeated && <span className="boss-slain">BOSS VANQUISHED</span>}
        </div>
        <div className="boss-name">{boss.bossName}</div>
        <div
          key={boss.id}
          className={`boss-image-frame ${bossHit ? 'hit' : ''} ${boss.currentHP <= 0 ? 'dead' : ''}`}
        >
          <img className="boss-image" src={boss.imageUrl} alt={boss.bossName} />
        </div>
        <div className="boss-hp-label">
          <span>{boss.defeated ? 0 : boss.currentHP.toLocaleString()} / {boss.maxHP.toLocaleString()} HP</span>
          <span>{bossHP}%</span>
        </div>
        <div className={`bar-track boss-track ${bossBarImpact === 'major' ? 'impact-major' : bossBarImpact === 'minor' ? 'impact-minor' : ''}`}>
          <div
            className={`bar-fill boss-lag-fill ${bossLagAnimating ? 'animating' : ''}`}
            style={{ width: `${boss.defeated ? 0 : bossLagHP}%` }}
          />
          <div
            className={`bar-fill boss-fill ${bossHP < 25 ? 'critical' : bossHP < 50 ? 'low' : ''}`}
            style={{ width: `${boss.defeated ? 0 : bossHP}%` }}
          />
        </div>
        <div className="attr-alert-slot">
          {player.attributePoints > 0 && (
            <div className="attr-alert" onClick={() => onNavigate('character')}>
              {'\u26A1'} {player.attributePoints} attribute point{player.attributePoints > 1 ? 's' : ''} unspent
            </div>
          )}
        </div>
      </section>

      <button
        className="cta-button"
        style={{ paddingTop: '12px', paddingBottom: '12px' }}
        onClick={() => onNavigate('workout')}
      >
        {'\u2694'} BEGIN TRIAL
      </button>

      <section className="data-section">
        <button className="ghost-btn" onClick={exportSave}>Export Save</button>
        <label className={`ghost-btn ${importing ? 'loading' : ''}`}>
          {importing ? 'Importing...' : 'Import Save'}
          <input type="file" accept=".json" onChange={handleImport} hidden />
        </label>
      </section>

      {visibleResolution && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Trial resolved summary">
          <section className="modal-card resolution-modal-card">
            <div className="modal-header">
              <h3>TRIAL RESOLVED</h3>
              <button
                className="remove-btn"
                type="button"
                onClick={() => {
                  setVisibleResolution(null);
                  clearPendingResolution();
                }}
              >
                X
              </button>
            </div>
            <div className="section-label">{visibleResolution.workoutName.toUpperCase()}</div>
            <div className="memory-row"><span>Total Sets</span><b>{visibleResolution.totalSets}</b></div>
            <h3 className="resolution-title">BOSS DAMAGE</h3>
            <div className="memory-row"><span>Committed</span><b>{visibleResolution.committedDamage.toLocaleString()}</b></div>
            <div className="memory-row"><span>Session XP</span><b>+{visibleResolution.sessionXp}</b></div>
            <div className="memory-row">
              <span>Workout XP</span>
              <b>+{(lastXPGain ?? Math.max(0, Math.round(visibleResolution.totalVolume * 0.12))).toLocaleString()}</b>
            </div>
            <h3 className="resolution-title">WORKOUT SUMMARY</h3>
            {visibleResolution.templateSummaries.map((templateSummary) => (
              <div key={templateSummary.templateId} className="resolution-template-block">
                <div className="resolution-template-title">{templateSummary.templateName}</div>
                {templateSummary.exercises.length > 0 && (
                  <div className="resolution-ex-head">
                    <span>Exercise</span>
                    <span>Sets</span>
                  </div>
                )}
                {templateSummary.exercises.map((exerciseSummary) => (
                  <div key={`${templateSummary.templateId}-${exerciseSummary.exerciseId}`} className="resolution-ex-row">
                    <span>{exerciseSummary.exerciseName}:</span>
                    <div className="resolution-set-list">
                      {exerciseSummary.sets.map((setText, i) => (
                        <b key={`${exerciseSummary.exerciseId}-${i}`} className="resolution-set-chip">{setText}</b>
                      ))}
                    </div>
                  </div>
                ))}
                {templateSummary.exercises.length === 0 && (
                  <p className="empty-hint">No sets logged for this template.</p>
                )}
              </div>
            ))}
            <button
              className="cta-button"
              type="button"
              onClick={() => {
                setVisibleResolution(null);
                clearPendingResolution();
              }}
            >
              Continue
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
