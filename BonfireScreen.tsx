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
    <div
      className="screen bonfire-screen"
      style={{
        height: '100%',
        overflow: 'hidden',
        justifyContent: 'space-between',
        gap: '12px',
      }}
    >
      {/* XP Toast */}
      {lastXPGain !== null && (
        <div className={`xp-toast ${doubleXPTriggered ? 'double' : ''}`}>
          {doubleXPTriggered && <span className="double-label">✦ FORTUNE SMILES ✦</span>}
          <span>+{lastXPGain} XP</span>
        </div>
      )}

      {/* Player header */}
      <header className="bonfire-header" style={{ paddingBottom: '12px' }}>
        <div className="level-badge">LVL {player.level}</div>
        <div className="player-name">Undead Warrior</div>
        <div className="streak-display">
          <span className="streak-icon">◈</span>
          <span className="streak-count">{player.streak}</span>
          <span className="streak-label">day streak</span>
        </div>
      </header>

      {/* XP Bar */}
      <section className="xp-section" style={{ flexShrink: 0 }}>
        <div className="xp-bar-label">
          <span>EXPERIENCE</span>
          <span>{player.currentXP} / {xpRequired(player.level)}</span>
        </div>
        <div className="bar-track">
          <div className="bar-fill xp-fill" style={{ width: `${progress.percent}%` }} />
        </div>
      </section>

      {/* Boss Section */}
      <section
        className="boss-section"
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          justifyContent: 'center',
          gap: '8px',
        }}
      >
        <div className="boss-header">
          <span className="boss-label">WEEKLY BOSS</span>
          {boss.defeated && <span className="boss-slain">BOSS VANQUISHED</span>}
        </div>
        <div className="boss-name">{boss.bossName}</div>
        <div
          className={`boss-visual ${boss.currentHP <= 0 ? 'dead' : ''}`}
          style={{ maxWidth: 'min(100%, 270px)' }}
        >
          <div className="boss-smoke" aria-hidden="true" />
          <div
            key={boss.id}
            className={`boss-image-frame ${bossHit ? 'hit' : ''} ${boss.currentHP <= 0 ? 'dead' : ''}`}
          >
            <img
              className="boss-image"
              src={boss.imageUrl}
              alt={boss.bossName}
              style={{
                maxHeight: 'min(40vh, 280px)',
                width: '100%',
                objectFit: 'contain',
              }}
            />
          </div>
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
        {player.attributePoints > 0 && (
          <div className="attr-alert" onClick={() => onNavigate('character')}>
            ⚡ {player.attributePoints} attribute point{player.attributePoints > 1 ? 's' : ''} unspent
          </div>
        )}
      </section>

      {/* CTA */}
      <button
        className="cta-button"
        style={{ flexShrink: 0, paddingTop: '12px', paddingBottom: '12px' }}
        onClick={() => onNavigate('workout')}
      >
        ⚔ BEGIN TRIAL
      </button>

      {/* Data management */}
      <section className="data-section" style={{ flexShrink: 0 }}>
        <button className="ghost-btn" onClick={exportSave}>Export Save</button>
        <label className={`ghost-btn ${importing ? 'loading' : ''}`}>
          {importing ? 'Importing...' : 'Import Save'}
          <input type="file" accept=".json" onChange={handleImport} hidden />
        </label>
      </section>
    </div>
  );
}
