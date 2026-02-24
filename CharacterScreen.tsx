import { useState } from 'react';
import type { UseGameReturn } from './useGame';
import { getLevelProgress, xpRequired, graceCharges, maxSetsForXP, compoundBonus, isolationBonus, luckChance } from './gameEngine';
import type { PlayerState } from './index';

interface Props {
  game: UseGameReturn;
}

const STAT_DESCRIPTIONS: Record<keyof PlayerState['attributes'], string> = {
  vitality: 'Grace Charges - each 5 pts = 1 missed day without breaking streak',
  endurance: 'Max sets counted for XP - +1 per 3 pts',
  strength: '+2% XP per pt from compound lifts (squat, deadlift, bench...)',
  dexterity: '+2% XP per pt from isolation & tempo lifts',
  luck: '1% chance per pt for Double XP - not the meta, but fate smiles sometimes',
};

const STAT_ICONS: Record<keyof PlayerState['attributes'], string> = {
  vitality: 'V',
  endurance: 'E',
  strength: 'S',
  dexterity: 'D',
  luck: 'L',
};

const DETAIL_COPY = {
  vitality: {
    title: 'VITALITY',
    body: 'Increases Grace Charges. Every 5 Vitality gives 1 charge, letting you miss that many days without breaking your streak.',
  },
  endurance: {
    title: 'ENDURANCE',
    body: 'Raises Max XP Sets. Every 3 Endurance adds 1 set that can count toward XP in each trial.',
  },
  strength: {
    title: 'STRENGTH',
    body: 'Boosts XP gained from compound lifts. Each point adds +2% compound XP.',
  },
  dexterity: {
    title: 'DEXTERITY',
    body: 'Boosts XP gained from isolation and tempo lifts. Each point adds +2% XP for those categories.',
  },
  luck: {
    title: 'LUCK',
    body: 'Increases chance for Double XP. Each point adds +1% proc chance.',
  },
  graceCharges: {
    title: 'GRACE CHARGES',
    body: 'How many missed days you can absorb before streak loss. Derived from Vitality.',
  },
  maxSets: {
    title: 'MAX XP SETS',
    body: 'Maximum number of sets per trial that can grant XP. Extra sets still log, but do not add XP.',
  },
  compoundMult: {
    title: 'COMPOUND BONUS',
    body: 'Current percent XP bonus applied to compound exercises.',
  },
  isolationMult: {
    title: 'ISOLATION BONUS',
    body: 'Current percent XP bonus applied to isolation and tempo exercises.',
  },
  luckPercent: {
    title: 'DOUBLE XP CHANCE',
    body: 'Current chance that a completed trial grants double XP.',
  },
  streak: {
    title: 'STREAK',
    body: 'Consecutive days with completed training, protected by available Grace Charges.',
  },
  trialsComplete: {
    title: 'TRIALS COMPLETE',
    body: 'Total number of completed trials in your history.',
  },
  totalVolume: {
    title: 'TOTAL VOLUME',
    body: 'Sum of reps x weight across all completed trials.',
  },
  badges: {
    title: 'BADGES',
    body: 'Total marks of victory earned from milestones and boss defeats.',
  },
} as const;

type DetailKey = keyof typeof DETAIL_COPY;

export function CharacterScreen({ game }: Props) {
  const { player, spendStat, workoutHistory, exercises, inscribingId } = game;
  const [selectedDetail, setSelectedDetail] = useState<DetailKey | null>(null);
  const [isCodexOpen, setIsCodexOpen] = useState(false);
  if (!player) return null;

  const progress = getLevelProgress(player);
  const attrs = player.attributes;

  const derivedStats = {
    graceCharges: graceCharges(attrs.vitality),
    maxSets: maxSetsForXP(attrs.endurance),
    compoundMult: ((compoundBonus(attrs.strength) - 1) * 100).toFixed(0),
    isolationMult: ((isolationBonus(attrs.dexterity) - 1) * 100).toFixed(0),
    luckPercent: (luckChance(attrs.luck) * 100).toFixed(0),
  };

  const totalVolume = workoutHistory.reduce(
    (sum, w) => sum + w.sets.reduce((s, set) => s + set.reps * set.weight, 0), 0
  );

  const detail = selectedDetail ? DETAIL_COPY[selectedDetail] : null;
  const toggleDetail = (key: DetailKey) => setSelectedDetail((prev) => (prev === key ? null : key));

  return (
    <div className="screen character-screen">
      <header className="char-header">
        <div className="char-level">LEVEL {player.level}</div>
        <div className="char-title">Undead Warrior</div>
        <div className="xp-detail">
          {player.currentXP} / {xpRequired(player.level)} XP - Total: {player.totalXP.toLocaleString()}
        </div>
        <div className="bar-track">
          <div className="bar-fill xp-fill" style={{ width: `${progress.percent}%` }} />
        </div>
      </header>

      {player.attributePoints > 0 && (
        <div className="unspent-banner">
          {player.attributePoints} Attribute Point{player.attributePoints > 1 ? 's' : ''} Available
        </div>
      )}

      <section className="section">
        <div className="section-label">ATTRIBUTES</div>
        {(Object.keys(STAT_ICONS) as Array<keyof PlayerState['attributes']>).map((stat) => (
          <div key={stat} className="stat-row clickable-stat" onClick={() => toggleDetail(stat)}>
            <div className="stat-left">
              <span className="stat-icon">{STAT_ICONS[stat]}</span>
              <div>
                <div className="stat-name">{stat.toUpperCase()}</div>
                <div className="stat-desc">{STAT_DESCRIPTIONS[stat]}</div>
              </div>
            </div>
            <div className="stat-right">
              <span className="stat-value">{attrs[stat]}</span>
              {player.attributePoints > 0 && (
                <button className="spend-btn" onClick={(e) => { e.stopPropagation(); spendStat(stat); }}>+</button>
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="section">
        <div className="section-label">DERIVED STATS</div>
        <div className="derived-grid">
          <div className="derived-item clickable-stat" onClick={() => toggleDetail('graceCharges')}><span>Grace Charges</span><b>{derivedStats.graceCharges}</b></div>
          <div className="derived-item clickable-stat" onClick={() => toggleDetail('maxSets')}><span>Max XP Sets</span><b>{derivedStats.maxSets}</b></div>
          <div className="derived-item clickable-stat" onClick={() => toggleDetail('compoundMult')}><span>Compound Bonus</span><b>+{derivedStats.compoundMult}%</b></div>
          <div className="derived-item clickable-stat" onClick={() => toggleDetail('isolationMult')}><span>Isolation Bonus</span><b>+{derivedStats.isolationMult}%</b></div>
          <div className="derived-item clickable-stat" onClick={() => toggleDetail('luckPercent')}><span>Double XP Chance</span><b>{derivedStats.luckPercent}%</b></div>
          <div className="derived-item clickable-stat" onClick={() => toggleDetail('streak')}><span>Streak</span><b>{player.streak} days</b></div>
        </div>
      </section>

      <section className="section">
        <div className="section-label">LEGACY</div>
        <div className="derived-grid">
          <div className="derived-item clickable-stat" onClick={() => toggleDetail('trialsComplete')}><span>Trials Complete</span><b>{workoutHistory.length}</b></div>
          <div className="derived-item clickable-stat" onClick={() => toggleDetail('totalVolume')}><span>Total Volume</span><b>{totalVolume.toLocaleString()} kg</b></div>
          <div className="derived-item clickable-stat" onClick={() => toggleDetail('badges')}><span>Badges</span><b>{player.badges.length}</b></div>
        </div>
      </section>

      {detail && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Stat details"
          onClick={() => setSelectedDetail(null)}
        >
          <div className="modal-card details-popup" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>DETAILS</h3>
              <button className="remove-btn" type="button" onClick={() => setSelectedDetail(null)}>X</button>
            </div>
            <div className="details-title">{detail.title}</div>
            <p className="details-text">{detail.body}</p>
          </div>
        </div>
      )}

      <section className="section">
        <div className="section-label">
          EXERCISE CODEX
          <button className="ghost-btn" type="button" onClick={() => setIsCodexOpen((prev) => !prev)}>
            {isCodexOpen ? 'Hide' : 'Reveal'}
          </button>
        </div>
        {isCodexOpen && (
          <div className="exercise-checklist">
            {exercises.map((ex) => (
              <div key={ex.id} className={`ex-check ${inscribingId === ex.id ? 'inscribing' : ''}`}>
                <span>{ex.name} <em>[{ex.category}]</em></span>
              </div>
            ))}
            {exercises.length === 0 && <p className="empty-hint">No exercises inscribed yet.</p>}
          </div>
        )}
      </section>

      {player.badges.length > 0 && (
        <section className="section">
          <div className="section-label">MARKS OF VICTORY</div>
          <div className="badge-list">
            {player.badges.map((b) => (
              <div key={b} className="badge-chip">{b.replace('BOSS_DEFEATED_', '').replace('W', ' Week ')}</div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
