# SoulForge — Dark Souls Gym Gamification PWA

**Offline-first. No backend. No account. No cloud. Just iron and fire.**

---

## Project Structure

```
soulforge/
├── public/
│   ├── sw.js            # Service worker (cache-first strategy)
│   ├── manifest.json    # PWA manifest
│   └── icon-*.png       # App icons (generate separately)
│
├── src/
│   ├── types/
│   │   └── index.ts     # ALL TypeScript interfaces + event types
│   │
│   ├── engine/
│   │   ├── gameEngine.ts   # XP, leveling, stat, streak math
│   │   └── bossEngine.ts   # Boss HP, week ID, defeat logic
│   │
│   ├── storage/
│   │   └── db.ts           # IndexedDB wrapper + Export/Import
│   │
│   ├── hooks/
│   │   └── useGame.ts      # Central game state hook — wires engine + storage
│   │
│   ├── components/
│   │   ├── bonfire/
│   │   │   └── BonfireScreen.tsx   # Home: streak, boss HP, XP, start
│   │   ├── workout/
│   │   │   └── WorkoutScreen.tsx   # Set logger, templates, exercise library
│   │   └── character/
│   │       └── CharacterScreen.tsx # Stats, attribute spend, badges
│   │
│   ├── App.tsx          # Tab routing
│   ├── main.tsx         # Entry + SW registration
│   └── index.css        # Full design system (Cinzel + Crimson Text)
│
├── index.html           # PWA shell with all meta tags
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Quick Start

```bash
npm install
npm run dev          # Dev server at localhost:5173
npm run build        # Production build in /dist
npm run preview      # Preview production build
```

To install on iPhone: visit the deployed URL in Safari → Share → Add to Home Screen.

---

## Architecture

### 1. Separation of Concerns

| Layer | File | Responsibility |
|-------|------|----------------|
| **Types** | `src/types/index.ts` | Interfaces, event union types |
| **Engine** | `src/engine/` | Pure math — no side effects, no storage |
| **Storage** | `src/storage/db.ts` | IndexedDB CRUD + Export/Import |
| **Hook** | `src/hooks/useGame.ts` | Orchestrator: calls engine, persists, updates React state |
| **UI** | `src/components/` | Reads state, fires hook actions |

### 2. Event Sourcing

Every meaningful game action appends an event to the `events` store:

```
WORKOUT_COMPLETED  →  xpAwarded, damageDealt, leveledUp, doubleXP
SET_LOGGED         →  exerciseId, reps, weight (fires per-set during workout)
ATTRIBUTE_SPENT    →  attribute, newValue
BOSS_DEFEATED      →  bossWeekId, badgeUnlocked
LEVEL_UP           →  newLevel, attributePointsGranted
```

This means **the full game state is reconstructable** from the event log alone. The `PlayerState` and `BossWeek` records are derived snapshots for fast reads — not the source of truth.

### 3. Offline Persistence

**How it works:**

1. **Service Worker** (`public/sw.js`) intercepts all fetch requests:
   - Navigation requests → network-first, fallback to cached `index.html`
   - Assets → cache-first with background update
   - Caches the app shell on install via `PRECACHE_URLS`

2. **IndexedDB** stores all game data locally:
   - Survives app closure, device restart, airplane mode
   - 5 object stores: `player`, `workouts`, `exercises`, `templates`, `events`, `bossWeeks`

3. **PWA manifest** + Safari meta tags allow Add to Home Screen which runs the app in standalone mode (no browser chrome, fullscreen feel).

**When offline:**
- All features work identically — the app never makes network requests for game data
- Google Fonts will not load (graceful degradation to system serif)
- No functionality is lost

### 4. XP Calculation (exact spec)

```typescript
baseXP = 100
volumeBonus = Σ (set.reps × set.weight × 0.1) × categoryBonus
  // categoryBonus = 1 + strength×0.02 for compound
  //               = 1 + dexterity×0.02 for isolation/tempo
  // Only counts up to: 20 + floor(endurance/3) sets (Endurance cap)

consistencyMult = streak≥7 ? 1.6 : streak≥4 ? 1.4 : streak≥2 ? 1.2 : 1.0

doubleXP = Math.random() < min(0.2, luck × 0.01)  // capped at 20%

totalXP = round((baseXP + volumeBonus) × consistencyMult × (doubleXP ? 2 : 1))
```

### 5. Boss System

- Boss resets every Monday via ISO week ID (e.g. `"2025-W03"`)
- Boss HP per week: 10,000
- Damage: `totalVolume × 0.5` (raw reps×kg per workout)
- Boss name is deterministic from week ID (hash → name array)
- Defeating boss: +1 Attribute Point + badge written to PlayerState

### 6. Streak + Grace Charges

- Streak increments if last workout was yesterday
- If last workout was 2 days ago: check `graceCharges = floor(vitality/5)`
- Grace charges used resets on a clean consecutive day
- Streak breaks after any gap beyond grace coverage

### 7. Export / Import

```typescript
// Export: snapshot of all stores → JSON download
exportData() → ExportPayload

// Import: wipe all stores, replay payload
importData(payload) → clears + repopulates all IndexedDB stores → page reload
```

Export format is versioned (`version: 1`) for future migrations.

---

## Design System

Font pairing: **Cinzel** (display, titles, numbers) + **Crimson Text** (body, descriptions)

Color palette:
- `#080808` — void background
- `#c9a84c` — gold (XP, level, UI chrome)
- `#c44b1a` — ember (boss HP, CTA buttons)
- `#5b8dd9` — soul blue (XP bar fill)
- `#c8c0b0` — ash white (body text)

---

## Attribute Quick Reference

| Stat | Effect |
|------|--------|
| Vitality | +1 Grace Charge per 5 pts |
| Endurance | +1 max XP sets per 3 pts (base 20) |
| Strength | +2% XP per pt from compound lifts |
| Dexterity | +2% XP per pt from isolation/tempo |
| Luck | 1% Double XP chance per pt (hard cap 20%) |

---

## Adding Icons

Generate `icon-192.png` and `icon-512.png` and place in `/public/`. A dark background with a stylized flame or ◈ glyph works well given the aesthetic.

You can use any icon generator (e.g. https://maskable.app/) with the theme color `#080808`.

---

*"Darkness will always triumph over a fleeting flame. But the brave choose to burn anyway."*
