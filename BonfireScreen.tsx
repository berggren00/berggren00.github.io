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
  const [bossLagHP, setBossLagHP] = useState(100);
  const [bossLagAnimating, setBossLagAnimating] = useState(false);
  const previousBossHPForHit = useRef<number | null>(null);
  const previousBossHPForLag = useRef<number | null>(null);
  const lagDelayTimerRef = useRef<number | null>(null);
  const lagAnimFrameRef = useRef<number | null>(null);

  if (!player || !boss) return null;

  const progress = getLevelProgress(player);
  const bossHP = bossHPPercent(boss);

  useEffect(() => {
    const prev = previousBossHPForHit.current;
    previousBossHPForHit.current = boss.currentHP;

    if (prev === null) return;
    if (boss.currentHP >= prev || boss.currentHP <= 0) return;

    setBossHit(true);
    const timer = window.setTimeout(() => setBossHit(false), 260);
    return () => window.clearTimeout(timer);
  }, [boss.currentHP]);

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
    };
  }, []);

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
        <div className="bar-track boss-track">
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
    </div>
  );
}
