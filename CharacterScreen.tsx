import type { UseGameReturn } from './useGame';
import { getLevelProgress, xpRequired, graceCharges, maxSetsForXP, compoundBonus, isolationBonus, luckChance } from './gameEngine';
import type { PlayerState } from './index';

interface Props {
  game: UseGameReturn;
}

const STAT_DESCRIPTIONS: Record<keyof PlayerState['attributes'], string> = {
  vitality: 'Grace Charges — each 5 pts = 1 missed day without breaking streak',
  endurance: 'Max sets counted for XP — +1 per 3 pts',
  strength: '+2% XP per pt from compound lifts (squat, deadlift, bench…)',
  dexterity: '+2% XP per pt from isolation & tempo lifts',
  luck: '1% chance per pt for Double XP — not the meta, but fate smiles sometimes',
};

const STAT_ICONS: Record<keyof PlayerState['attributes'], string> = {
  vitality: '❤',
  endurance: '⟁',
  strength: '⚔',
  dexterity: '◈',
  luck: '✦',
};

export function CharacterScreen({ game }: Props) {
  const { player, spendStat, workoutHistory, exercises, inscribingId } = game;
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

  return (
    <div className="screen character-screen">
      {/* Identity */}
      <header className="char-header">
        <div className="char-level">LEVEL {player.level}</div>
        <div className="char-title">Undead Warrior</div>
        <div className="xp-detail">
          {player.currentXP} / {xpRequired(player.level)} XP · Total: {player.totalXP.toLocaleString()}
        </div>
        <div className="bar-track">
          <div className="bar-fill xp-fill" style={{ width: `${progress.percent}%` }} />
        </div>
      </header>

      {/* Unspent points alert */}
      {player.attributePoints > 0 && (
        <div className="unspent-banner">
          ⚡ {player.attributePoints} Attribute Point{player.attributePoints > 1 ? 's' : ''} Available
        </div>
      )}

      {/* Attributes */}
      <section className="section">
        <div className="section-label">ATTRIBUTES</div>
        {(Object.keys(STAT_ICONS) as Array<keyof PlayerState['attributes']>).map((stat) => (
          <div key={stat} className="stat-row">
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
                <button className="spend-btn" onClick={() => spendStat(stat)}>+</button>
              )}
            </div>
          </div>
        ))}
      </section>

      {/* Derived stats */}
      <section className="section">
        <div className="section-label">DERIVED STATS</div>
        <div className="derived-grid">
          <div className="derived-item"><span>Grace Charges</span><b>{derivedStats.graceCharges}</b></div>
          <div className="derived-item"><span>Max XP Sets</span><b>{derivedStats.maxSets}</b></div>
          <div className="derived-item"><span>Compound Bonus</span><b>+{derivedStats.compoundMult}%</b></div>
          <div className="derived-item"><span>Isolation Bonus</span><b>+{derivedStats.isolationMult}%</b></div>
          <div className="derived-item"><span>Double XP Chance</span><b>{derivedStats.luckPercent}%</b></div>
          <div className="derived-item"><span>Streak</span><b>{player.streak} days</b></div>
        </div>
      </section>

      {/* Lifetime stats */}
      <section className="section">
        <div className="section-label">LEGACY</div>
        <div className="derived-grid">
          <div className="derived-item"><span>Trials Complete</span><b>{workoutHistory.length}</b></div>
          <div className="derived-item"><span>Total Volume</span><b>{totalVolume.toLocaleString()} kg</b></div>
          <div className="derived-item"><span>Badges</span><b>{player.badges.length}</b></div>
        </div>
      </section>

      <section className="section">
        <div className="section-label">EXERCISE CODEX</div>
        <div className="exercise-checklist">
          {exercises.map((ex) => (
            <div key={ex.id} className={`ex-check ${inscribingId === ex.id ? 'inscribing' : ''}`}>
              <span>{ex.name} <em>[{ex.category}]</em></span>
            </div>
          ))}
          {exercises.length === 0 && <p className="empty-hint">No exercises inscribed yet.</p>}
        </div>
      </section>

      {/* Badges */}
      {player.badges.length > 0 && (
        <section className="section">
          <div className="section-label">MARKS OF VICTORY</div>
          <div className="badge-list">
            {player.badges.map((b) => (
              <div key={b} className="badge-chip">⚔ {b.replace('BOSS_DEFEATED_', '').replace('W', ' Week ')}</div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
