import { useEffect, useRef, useState } from 'react';
import type { UseGameReturn } from './useGame';
import { getLevelProgress, xpRequired } from './gameEngine';
import { bossHPPercent } from './bossEngine';

interface Props {
  game: UseGameReturn;
  onNavigate: (tab: 'workout' | 'character') => void;
}

export function BonfireScreen({ game, onNavigate }: Props) {
  const { player, boss, lastXPGain, doubleXPTriggered, exportSave, importSave } = game;
  const [importing, setImporting] = useState(false);
  const [bossHit, setBossHit] = useState(false);
  const previousBossHP = useRef<number | null>(null);

  if (!player || !boss) return null;

  const progress = getLevelProgress(player);
  const bossHP = bossHPPercent(boss);

  useEffect(() => {
    const prev = previousBossHP.current;
    previousBossHP.current = boss.currentHP;

    if (prev === null) return;
    if (boss.currentHP >= prev || boss.currentHP <= 0) return;

    setBossHit(true);
    const timer = window.setTimeout(() => setBossHit(false), 260);
    return () => window.clearTimeout(timer);
  }, [boss.currentHP]);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    importSave(file).catch(() => setImporting(false));
  };

  return (
    <div className="screen bonfire-screen">
      {/* XP Toast */}
      {lastXPGain !== null && (
        <div className={`xp-toast ${doubleXPTriggered ? 'double' : ''}`}>
          {doubleXPTriggered && <span className="double-label">✦ FORTUNE SMILES ✦</span>}
          <span>+{lastXPGain} XP</span>
        </div>
      )}

      {/* Player header */}
      <header className="bonfire-header">
        <div className="level-badge">LVL {player.level}</div>
        <div className="player-name">Undead Warrior</div>
        <div className="streak-display">
          <span className="streak-icon">◈</span>
          <span className="streak-count">{player.streak}</span>
          <span className="streak-label">day streak</span>
        </div>
      </header>

      {/* XP Bar */}
      <section className="xp-section">
        <div className="xp-bar-label">
          <span>EXPERIENCE</span>
          <span>{player.currentXP} / {xpRequired(player.level)}</span>
        </div>
        <div className="bar-track">
          <div className="bar-fill xp-fill" style={{ width: `${progress.percent}%` }} />
        </div>
      </section>

      {/* Boss Section */}
      <section className="boss-section">
        <div className="boss-header">
          <span className="boss-label">WEEKLY ADVERSARY</span>
          {boss.defeated && <span className="boss-slain">SLAIN</span>}
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
        <div className="bar-track boss-track">
          <div
            className={`bar-fill boss-fill ${bossHP < 25 ? 'critical' : bossHP < 50 ? 'low' : ''}`}
            style={{ width: `${boss.defeated ? 0 : bossHP}%` }}
          />
        </div>
        {player.attributePoints > 0 && (
          <div className="attr-alert" onClick={() => onNavigate('character')}>
            ⚡ {player.attributePoints} attribute point{player.attributePoints > 1 ? 's' : ''} unspent
          </div>
        )}
      </section>

      {/* CTA */}
      <button className="cta-button" onClick={() => onNavigate('workout')}>
        ⚔ BEGIN TRIAL
      </button>

      {/* Data management */}
      <section className="data-section">
        <button className="ghost-btn" onClick={exportSave}>Export Save</button>
        <label className={`ghost-btn ${importing ? 'loading' : ''}`}>
          {importing ? 'Importing...' : 'Import Save'}
          <input type="file" accept=".json" onChange={handleImport} hidden />
        </label>
      </section>
    </div>
  );
}
