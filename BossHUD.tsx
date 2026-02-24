import { useEffect, useState } from 'react';

interface Props {
  bossName: string;
  currentHP: number;
  maxHP: number;
  displayHP: number;
  sessionChipDamage: number;
  reservedFinalDamage: number;
  sessionXp: number;
  lastHitDamage: number;
  lastHitPercent: number;
  hitNonce: number;
}

export function BossHUD({
  bossName,
  currentHP,
  maxHP,
  displayHP,
  sessionChipDamage,
  reservedFinalDamage,
  sessionXp,
  lastHitDamage,
  lastHitPercent,
  hitNonce,
}: Props) {
  const [isHitAnimating, setIsHitAnimating] = useState(false);

  useEffect(() => {
    if (hitNonce === 0) return;
    setIsHitAnimating(true);
    const t = window.setTimeout(() => setIsHitAnimating(false), 500);
    return () => window.clearTimeout(t);
  }, [hitNonce]);

  const safeMaxHp = Math.max(1, maxHP);
  const pct = Math.max(0, Math.min(100, Math.round((displayHP / safeMaxHp) * 100)));
  const committedPct = Math.max(0, Math.min(100, Math.round((currentHP / safeMaxHp) * 100)));

  return (
    <section className={`boss-hud ${isHitAnimating ? 'hit' : ''}`}>
      <div className="boss-hud-head">
        <span>{bossName}</span>
        <b>{displayHP.toLocaleString()} / {maxHP.toLocaleString()} HP</b>
      </div>
      <div className="boss-hud-track">
        <div className="boss-hud-committed" style={{ width: `${committedPct}%` }} />
        <div className="boss-hud-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="boss-hud-meta">
        <span>Chip DMG: {sessionChipDamage.toLocaleString()}</span>
        <span>Final Strike: {reservedFinalDamage.toLocaleString()}</span>
        <span>Session XP: +{sessionXp}</span>
        <span>Last Hit: -{lastHitDamage} ({lastHitPercent.toFixed(1)}%)</span>
      </div>
    </section>
  );
}
