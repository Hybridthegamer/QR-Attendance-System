/* =====================================================================
 * QR Attendance System — Service Worker
 * Implements Algorithm 3.7.3: Offline Synchronisation Algorithm (Ch.3)
 * ===================================================================== */

const CACHE_NAME = 'qr-attendance-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/static/js/main.chunk.js',
  '/static/js/bundle.js',
  '/manifest.json',
];

const ATTENDANCE_ENDPOINT = '/api/attendance';
const SYNC_TAG = 'attendance-sync';
const IDB_DB_NAME = 'qr_attendance_offline';
const IDB_STORE = 'pending_attendance';

// ─── Install ────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ─── Activate ───────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ─── Fetch Interceptor ──────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Intercept attendance POST — Algorithm 3.7.2 Step 7 (offline path)
  if (request.method === 'POST' && url.pathname === ATTENDANCE_ENDPOINT) {
    event.respondWith(handleAttendancePost(request));
    return;
  }

  // For API calls: network-first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: 'You are offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // For static assets: cache-first
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request))
  );
});

// ─── Handle Attendance POST ─────────────────────────────────────────────────
async function handleAttendancePost(request) {
  try {
    // Try online first
    const response = await fetch(request.clone());
    return response;
  } catch {
    // Offline — Step 7: store in IndexedDB, register background sync
    const body = await request.json();
    await idbStore({
      qr_token: body.qr_token,
      student_id: body.student_id,
      timestamp: Date.now(),
      attempt: 1,
    });

    // Register background sync
    try {
      await self.registration.sync.register(SYNC_TAG);
    } catch {
      // Background Sync not available — will retry on next fetch
    }

    return new Response(
      JSON.stringify({ offline: true, message: 'Attendance pending synchronisation' }),
      { status: 202, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ─── Background Sync ─────────────────────────────────────────────────────────
// Algorithm 3.7.3 — Offline Synchronisation Algorithm
self.addEventListener('sync', event => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(syncPendingAttendance());
  }
});

async function syncPendingAttendance() {
  // Step 2: Retrieve all records from IndexedDB pending queue
  const pending = await idbGetAll();
  if (!pending || pending.length === 0) return; // Step 3: exit if empty

  const MAX_ATTEMPTS = 5;
  const apiUrl = self.location.origin + ATTENDANCE_ENDPOINT;

  for (const record of pending) {
    try {
      // Step 4: Attempt POST for each record
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Token stored in IDB along with record
          ...(record.auth_token ? { Authorization: `Bearer ${record.auth_token}` } : {}),
        },
        body: JSON.stringify({ qr_token: record.qr_token, student_id: record.student_id }),
      });

      if (response.status === 201 || response.status === 409) {
        // Step 5: success or duplicate — remove from queue
        await idbDelete(record.id);
      } else if (response.status === 401) {
        // Step 6: token expired — unresolvable, remove and log
        await idbDelete(record.id);
        console.warn('[SW] Expired token removed from sync queue:', record.id);
      } else {
        // Step 7: 5xx or other — exponential back-off
        await handleRetry(record, MAX_ATTEMPTS);
      }
    } catch {
      // Network failed again — re-queue
      await handleRetry(record, MAX_ATTEMPTS);
    }
  }

  // Step 8: Notify clients of sync result
  const clients = await self.clients.matchAll();
  clients.forEach(client => client.postMessage({ type: 'SYNC_COMPLETE' }));
}

async function handleRetry(record, maxAttempts) {
  if (record.attempt < maxAttempts) {
    await idbUpdate({ ...record, attempt: record.attempt + 1 });
  } else {
    // Discard after max attempts
    await idbDelete(record.id);
  }
}

// ─── IndexedDB Helpers ────────────────────────────────────────────────────────
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

async function idbStore(record) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).add(record);
    tx.oncomplete = resolve;
    tx.onerror = e => reject(e.target.error);
  });
}

async function idbGetAll() {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).getAll();
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

async function idbDelete(id) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = e => reject(e.target.error);
  });
}

async function idbUpdate(record) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(record);
    tx.oncomplete = resolve;
    tx.onerror = e => reject(e.target.error);
  });
}
