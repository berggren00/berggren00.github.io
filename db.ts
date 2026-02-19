import type {
  PlayerState,
  Workout,
  Exercise,
  WorkoutTemplate,
  GameEvent,
  BossWeek,
  ExportPayload,
} from './index';

const DB_NAME = 'soulforge';
const DB_VERSION = 1;

type StoreName = 'player' | 'workouts' | 'exercises' | 'templates' | 'events' | 'bossWeeks';

// ─── Open DB ──────────────────────────────────────────────────────────────────

let _db: IDBDatabase | null = null;

export async function openDB(): Promise<IDBDatabase> {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('player')) {
        db.createObjectStore('player', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('workouts')) {
        db.createObjectStore('workouts', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('exercises')) {
        db.createObjectStore('exercises', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('templates')) {
        db.createObjectStore('templates', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('events')) {
        const es = db.createObjectStore('events', { keyPath: 'id' });
        es.createIndex('type', 'type', { unique: false });
        es.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains('bossWeeks')) {
        db.createObjectStore('bossWeeks', { keyPath: 'id' });
      }
    };

    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

// ─── Generic Helpers ──────────────────────────────────────────────────────────

async function tx<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const req = fn(s);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readonly');
    const req = t.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

// ─── Player ───────────────────────────────────────────────────────────────────

const PLAYER_KEY = 'singleton';

export async function getPlayer(): Promise<PlayerState | null> {
  try {
    const r = await tx<PlayerState>('player', 'readonly', (s) =>
      s.get(PLAYER_KEY)
    );
    return r ?? null;
  } catch { return null; }
}

export async function savePlayer(player: PlayerState): Promise<void> {
  await tx('player', 'readwrite', (s) => s.put({ ...player, id: PLAYER_KEY }));
}

// ─── Workouts ─────────────────────────────────────────────────────────────────

export async function saveWorkout(workout: Workout): Promise<void> {
  await tx('workouts', 'readwrite', (s) => s.put(workout));
}

export async function getWorkout(id: string): Promise<Workout | null> {
  return tx<Workout>('workouts', 'readonly', (s) => s.get(id));
}

export async function getAllWorkouts(): Promise<Workout[]> {
  return getAll<Workout>('workouts');
}

// ─── Exercises ────────────────────────────────────────────────────────────────

export async function saveExercise(ex: Exercise): Promise<void> {
  await tx('exercises', 'readwrite', (s) => s.put(ex));
}

export async function getAllExercises(): Promise<Exercise[]> {
  return getAll<Exercise>('exercises');
}

// ─── Templates ────────────────────────────────────────────────────────────────

export async function saveTemplate(tmpl: WorkoutTemplate): Promise<void> {
  await tx('templates', 'readwrite', (s) => s.put(tmpl));
}

export async function getAllTemplates(): Promise<WorkoutTemplate[]> {
  return getAll<WorkoutTemplate>('templates');
}

export async function deleteTemplate(id: string): Promise<void> {
  await tx('templates', 'readwrite', (s) => s.delete(id));
}

// ─── Events ───────────────────────────────────────────────────────────────────

export async function appendEvent(event: GameEvent): Promise<void> {
  await tx('events', 'readwrite', (s) => s.put(event));
}

export async function getAllEvents(): Promise<GameEvent[]> {
  return getAll<GameEvent>('events');
}

// ─── Boss Weeks ───────────────────────────────────────────────────────────────

export async function saveBossWeek(boss: BossWeek): Promise<void> {
  await tx('bossWeeks', 'readwrite', (s) => s.put(boss));
}

export async function getBossWeek(id: string): Promise<BossWeek | null> {
  return tx<BossWeek>('bossWeeks', 'readonly', (s) => s.get(id));
}

export async function getAllBossWeeks(): Promise<BossWeek[]> {
  return getAll<BossWeek>('bossWeeks');
}

// ─── Export / Import ──────────────────────────────────────────────────────────

export async function exportData(): Promise<ExportPayload> {
  const [player, workouts, exercises, templates, events, bossHistory] = await Promise.all([
    getPlayer(),
    getAllWorkouts(),
    getAllExercises(),
    getAllTemplates(),
    getAllEvents(),
    getAllBossWeeks(),
  ]);

  if (!player) throw new Error('No player data to export');

  return {
    version: 1,
    exportedAt: Date.now(),
    player,
    workouts,
    exercises,
    templates,
    events,
    bossHistory,
  };
}

export async function importData(payload: ExportPayload): Promise<void> {
  if (payload.version !== 1) throw new Error(`Unknown export version: ${payload.version}`);

  const db = await openDB();

  await new Promise<void>((resolve, reject) => {
    const stores: StoreName[] = ['player', 'workouts', 'exercises', 'templates', 'events', 'bossWeeks'];
    const t = db.transaction(stores, 'readwrite');

    // Clear all stores
    stores.forEach((name) => t.objectStore(name).clear());

    // Import player
    t.objectStore('player').put({ ...payload.player, id: PLAYER_KEY });

    // Import collections
    payload.workouts.forEach((w) => t.objectStore('workouts').put(w));
    payload.exercises.forEach((e) => t.objectStore('exercises').put(e));
    payload.templates.forEach((tmpl) => t.objectStore('templates').put(tmpl));
    payload.events.forEach((ev) => t.objectStore('events').put(ev));
    payload.bossHistory.forEach((b) => t.objectStore('bossWeeks').put(b));

    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export function downloadJSON(payload: ExportPayload): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `soulforge-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importFromFile(file: File): Promise<void> {
  const text = await file.text();
  const payload: ExportPayload = JSON.parse(text);
  await importData(payload);
}
