import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence, doc, onSnapshot, setDoc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"; // v96
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, browserLocalPersistence, setPersistence, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js"; // v229

const firebaseConfig = {
    apiKey: "AIzaSyC_VBffGyCoopsZZiPTZowx8d7fhFQ8_-w",
    authDomain: "in-strides.firebaseapp.com",
    projectId: "in-strides",
    storageBucket: "in-strides.firebasestorage.app",
    messagingSenderId: "974987405170",
    appId: "1:974987405170:web:c1f100b44bb85efed7dfeb"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
enableIndexedDbPersistence(db).catch(err => {
    if (err.code === 'failed-precondition') console.warn('Offline cache unavailable: multiple tabs open');
    else if (err.code === 'unimplemented') console.warn('Offline cache not supported in this browser');
});
const auth = getAuth(app);
const functions = getFunctions(app);

setPersistence(auth, browserLocalPersistence).catch(console.warn);

let LOG_ID = null;
let logData = { types: ["RUN", "YOGA", "GYM", "SWIM"], typeCategories: {}, customMetrics: [], entries: [], dailyNotes: {}, goals: [], themes: [], completedLearnings: [], trainingPlans: [], tasks: [] };
let editingGoalId = null;
let _stravaConnected = false;
let editingThemeId = null;

const TYPE_CATEGORIES = [
    { value: 'cardio',      label: 'Distance' },
    { value: 'bodyweight',  label: 'Reps' },
    { value: 'gym',         label: 'Weight' },
    { value: 'time',        label: 'Time' },
    { value: 'pacing',      label: 'Time + Distance' },
    { value: 'other',       label: 'Other' },
];

const getTypeCategory = (typeName) => logData.typeCategories?.[typeName] || 'other';

const fmtNum = (n) => { const r = Math.round(n * 100) / 100; return r % 1 === 0 ? r : r.toString(); };
const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

const aggregateExerciseLabel = (entries, cat) => {
    switch (cat) {
        case 'cardio': {
            const total = entries.reduce((s, e) => s + (e.distance || 0), 0);
            const unit = entries.find(e => e.distanceUnit)?.distanceUnit || 'km';
            const totalDur = entries.reduce((s, e) => s + (e.duration || 0), 0);
            const parts = [];
            if (total) parts.push(`${fmtNum(total)}${unit}`);
            if (totalDur) parts.push(`${totalDur}min`);
            return parts.join(' / ');
        }
        case 'bodyweight': {
            const total = entries.reduce((s, e) => s + (e.reps || 0), 0);
            return total ? `${total} reps` : '';
        }
        case 'gym': {
            const total = entries.reduce((s, e) => s + (e.weight || 0), 0);
            const unit = entries.find(e => e.weightUnit)?.weightUnit || 'kg';
            return total ? `${fmtNum(total)}${unit}` : '';
        }
        case 'time': {
            const total = entries.reduce((s, e) => s + (e.duration || 0), 0);
            return total ? `${total}min` : '';
        }
        case 'pacing': {
            const totalDist = entries.reduce((s, e) => s + (e.distance || 0), 0);
            const totalDur = entries.reduce((s, e) => s + (e.duration || 0), 0);
            const unit = entries.find(e => e.distanceUnit)?.distanceUnit || 'km';
            const parts = [];
            if (totalDist) parts.push(`${fmtNum(totalDist)}${unit}`);
            if (totalDur) parts.push(`${totalDur}min`);
            return parts.join(' / ');
        }
        case 'other': {
            const vals = entries.filter(e => e.otherRating).map(e => e.otherRating);
            if (!vals.length) return '';
            return `${fmtNum(vals.reduce((a, b) => a + b, 0) / vals.length)}/10`;
        }
        default: return '';
    }
};

const renderWeekStrapline = () => {
    const el = document.getElementById('weekStrapline');
    if (!el) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const weekStart = getWeekStart(todayStr);
    const completed = logData.entries.filter(e => !e.isPlanned);
    const thisWeek = completed.filter(e => e.date >= weekStart && e.date <= todayStr && e.type && e.type !== 'NONE');
    const todayPlanned = logData.entries.filter(e => e.date === todayStr && e.isPlanned && e.type && e.type !== 'NONE');
    const todayDone = completed.filter(e => e.date === todayStr && e.type && e.type !== 'NONE');

    // Streak count — match badge: any logged day counts (metrics or exercise)
    const activeDates = new Set(completed.map(e => e.date));
    let streak = 0;
    let checkDate = todayStr;
    // If nothing logged today, start from yesterday (same as badge)
    if (!activeDates.has(checkDate)) {
        const y = new Date(checkDate); y.setUTCDate(y.getUTCDate() - 1);
        checkDate = y.toISOString().split('T')[0];
    }
    while (activeDates.has(checkDate)) {
        streak++;
        const sd = new Date(checkDate);
        sd.setUTCDate(sd.getUTCDate() - 1);
        checkDate = sd.toISOString().split('T')[0];
    }

    let nudge = '';

    // Priority 1: PR this week
    const prLine = buildPersonalRecordsLine(thisWeek);
    if (prLine) {
        nudge = prLine;
    }
    // Priority 2: Planned session today, not yet done
    else if (todayPlanned.length && !todayDone.length) {
        const types = [...new Set(todayPlanned.map(e => titleCase(e.type)))].join(' & ');
        nudge = `${types} on the plan for today — ready? 💪`;
    }
    // Priority 3: Notable streak
    else if (streak >= 5) {
        nudge = `🔥 ${streak}-day streak — you're on a roll.`;
    }
    // Priority 4: Health score context
    else if (completed.length >= 5) {
        const { score, label } = computeHealthScore(completed, todayStr);
        const prev = new Date(todayStr); prev.setDate(prev.getDate() - 7);
        const prevScore = computeHealthScore(completed, prev.toISOString().split('T')[0]).score;
        if (score >= 80) {
            nudge = `Health Score ${score} — you're in ${label.toLowerCase()} form right now.`;
        } else if (score - prevScore >= 6) {
            nudge = `Health Score up ${score - prevScore} points this week — momentum building ▲`;
        } else if (thisWeek.length === 0) {
            nudge = `No sessions yet this week — time to get moving 💪`;
        } else {
            const daysElapsed = Math.round((new Date(todayStr) - new Date(weekStart)) / 86400000) + 1;
            const restDays = daysElapsed - new Set(thisWeek.map(e => e.date)).size;
            nudge = restDays >= 1
                ? `${thisWeek.length} session${thisWeek.length > 1 ? 's' : ''} this week with ${restDays} rest day${restDays > 1 ? 's' : ''} — well balanced.`
                : `${thisWeek.length} session${thisWeek.length > 1 ? 's' : ''} this week · Health Score ${score}`;
        }
    }
    else if (thisWeek.length === 0) {
        nudge = `No sessions yet this week — let's get moving 💪`;
    } else {
        nudge = `${thisWeek.length} session${thisWeek.length > 1 ? 's' : ''} logged this week — keep it up.`;
    }

    el.textContent = nudge;
    el.style.display = 'block';
};

// Detect new personal bests set this week, vs. all prior completed entries of the same type
const buildPersonalRecordsLine = (thisWeek) => {
    const metricValue = (e, cat) => {
        switch (cat) {
            case 'cardio': case 'pacing': return e.distance || null;
            case 'gym': return e.weight || null;
            case 'bodyweight': return e.reps || null;
            case 'time': return e.duration || null;
            default: return null;
        }
    };
    const unitFor = (e, cat) => {
        switch (cat) {
            case 'cardio': case 'pacing': return e.distanceUnit || 'km';
            case 'gym': return e.weightUnit || 'kg';
            case 'bodyweight': return 'reps';
            case 'time': return 'min';
            default: return '';
        }
    };

    const allCompleted = logData.entries.filter(e => !e.isPlanned && e.type && e.type !== 'NONE');
    const prs = [];

    thisWeek.forEach(e => {
        const cat = getTypeCategory(e.type);
        const val = metricValue(e, cat);
        if (val == null) return;
        const priorMax = allCompleted
            .filter(o => o.type === e.type && o.date < e.date)
            .reduce((max, o) => Math.max(max, metricValue(o, cat) || 0), 0);
        if (priorMax > 0 && val > priorMax) {
            prs.push({ e, cat, val, priorMax, margin: val - priorMax });
        }
    });

    if (!prs.length) return '';
    // Show only the single most impressive PR (largest absolute margin)
    prs.sort((a, b) => b.margin - a.margin);
    const best = prs[0];
    const unit = unitFor(best.e, best.cat);
    return `🏆 New ${titleCase(best.e.type)} PR: ${fmtNum(best.val)}${unit} (previous best ${fmtNum(best.priorMax)}${unit})`;
};
let editingId = null;
let unsubSnapshot = null;
window.tempMark = 1;
let isPlannedStrategy = false; 
let dynamicMetricValues = {};
let isResetMode = false;

// --- AUTH SESSION HOOKS ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        LOG_ID = `log-${user.uid}`;
        document.getElementById('authOverlay').style.display = 'none';
        attachRealtimeListener();
        updateStravaButton();
    } else {
        LOG_ID = null;
        if(unsubSnapshot) unsubSnapshot();
        document.getElementById('authOverlay').style.display = 'flex';
        window.toggleResetView(false);
    }
});

window.toggleResetView = (wantsReset) => {
    isResetMode = wantsReset;
    const errorEl = document.getElementById('authError');
    errorEl.innerText = "";
    document.getElementById('passwordRow').style.display = wantsReset ? 'none' : 'block';
    
    if (wantsReset) {
        document.getElementById('btnMainAuth').innerText = "Send Reset Email";
        document.getElementById('btnSubAuth').style.display = 'none';
        document.getElementById('btnResetLink').innerText = "Back to Sign In";
    } else {
        document.getElementById('btnMainAuth').innerText = "Sign In";
        document.getElementById('btnSubAuth').style.display = 'block';
        document.getElementById('btnResetLink').innerText = "Forgot Password?";
    }
};

window.handleGoogleSignIn = async () => {
    const errorEl = document.getElementById('authError');
    errorEl.innerText = "";
    try {
        await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
        errorEl.style.color = "#ef4444";
        errorEl.innerText = err.message.replace("Firebase: ", "");
    }
};

window.handleAuth = async (action) => {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const errorEl = document.getElementById('authError');
    errorEl.innerText = "";
    
    if (!email) return errorEl.innerText = "Email address is required.";
    
    try {
        if (isResetMode) {
            await sendPasswordResetEmail(auth, email);
            errorEl.style.color = "var(--success)";
            errorEl.innerText = "Password recovery email sent! Check your inbox.";
            return;
        }
        
        if (!password) return errorEl.innerText = "Password is required.";
        errorEl.style.color = "#ef4444";
        
        if (action === 'login') {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            await createUserWithEmailAndPassword(auth, email, password);
        }
    } catch (err) {
        errorEl.style.color = "#ef4444";
        errorEl.innerText = err.message.replace("Firebase: ", "");
    }
};

window.handleSignOut = () => signOut(auth);

// --- BACKUP SNAPSHOTS (7-day rolling, one per day per account) ---
const SNAP_PREFIX = 'tl-snap-';

const saveSnapshot = (data) => {
    if (!data || !data.entries || data.entries.length === 0 || !LOG_ID) return;
    const today = new Date().toISOString().split('T')[0];
    const key = `${SNAP_PREFIX}${today}__${LOG_ID}`;
    try {
        localStorage.setItem(key, JSON.stringify({ ts: new Date().toISOString(), count: data.entries.length, data }));
        // Collect all snapshot keys for this account and drop any beyond the newest 7
        const allKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(SNAP_PREFIX) && k.endsWith(`__${LOG_ID}`)) allKeys.push(k);
        }
        allKeys.sort().slice(0, -7).forEach(k => localStorage.removeItem(k));
    } catch (_) {}
};

const getSnapshots = () => {
    if (!LOG_ID) return [];
    const snaps = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(SNAP_PREFIX) && k.endsWith(`__${LOG_ID}`)) {
            try {
                const val = JSON.parse(localStorage.getItem(k));
                const date = k.slice(SNAP_PREFIX.length, SNAP_PREFIX.length + 10);
                snaps.push({ key: k, date, ts: val.ts, count: val.count, data: val.data });
            } catch (_) {}
        }
    }
    return snaps.sort((a, b) => b.date.localeCompare(a.date));
};

window.showBackupHistory = () => {
    window.closeSettings();
    const snaps = getSnapshots();
    const list = document.getElementById('backupHistoryList');
    if (snaps.length === 0) {
        list.innerHTML = '<p class="backup-empty">No snapshots yet — they save automatically each time your data loads from the server. Check back after using the app for a while.</p>';
    } else {
        list.innerHTML = snaps.map(s => {
            const d = new Date(s.ts);
            const label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
            const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
            return `<div class="backup-row">
                <div class="backup-info">
                    <div class="backup-date">${label}</div>
                    <div class="backup-meta">${time} · ${s.count} entries</div>
                </div>
                <div class="backup-actions">
                    <button class="btn-small btn-secondary" onclick="window.downloadSnapshot('${s.key}')">Download</button>
                    <button class="btn-small btn-primary-sm" onclick="window.restoreSnapshot('${s.key}')">Restore</button>
                </div>
            </div>`;
        }).join('');
    }
    document.getElementById('backupHistoryModal').style.display = 'flex';
};

window.downloadSnapshot = (key) => {
    try {
        const val = JSON.parse(localStorage.getItem(key));
        const date = key.slice(SNAP_PREFIX.length, SNAP_PREFIX.length + 10);
        const blob = new Blob([JSON.stringify(val.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `traininglog-backup-${date}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch (err) { alert('Download failed: ' + err.message); }
};

window.restoreSnapshot = (key) => {
    try {
        const val = JSON.parse(localStorage.getItem(key));
        const date = key.slice(SNAP_PREFIX.length, SNAP_PREFIX.length + 10);
        if (!confirm(`Restore backup from ${date}?\nThis contains ${val.count} entries and will replace your current data.`)) return;
        saveSnapshot(logData);
        setDoc(doc(db, 'logs', LOG_ID), val.data)
            .then(() => { window.closeModal('backupHistoryModal'); alert('Restored successfully.'); })
            .catch(err => alert('Restore failed: ' + err.message));
    } catch (err) { alert('Could not restore: ' + err.message); }
};

const attachRealtimeListener = () => {
    if(unsubSnapshot) unsubSnapshot();
    unsubSnapshot = onSnapshot(doc(db, "logs", LOG_ID), (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            logData = { types: data.types || [], typeCategories: data.typeCategories || {}, customMetrics: data.customMetrics || [], entries: data.entries || [], dailyNotes: data.dailyNotes || {}, goals: data.goals || [], themes: data.themes || [], completedLearnings: data.completedLearnings || [], trainingPlans: data.trainingPlans || [], tasks: data.tasks || [] };
            // Keep a rolling local backup whenever real data arrives from the server
            if (!snap.metadata.fromCache && logData.entries.length > 0) saveSnapshot(logData);
            renderMatrix();
            renderStreak();
            if(document.getElementById('viewOverview').classList.contains('active')) renderOverview();
            if(document.getElementById('viewGoals').classList.contains('active')) { renderThemes(); renderGoals(); }
            if(document.getElementById('viewPlan').classList.contains('active')) renderPlan();
        } else if (!snap.metadata.fromCache) {
            // Only create a fresh log if the server has confirmed no document exists.
            // A cache-only "not found" can happen before the server responds, and must
            // never trigger an overwrite of real data.
            setDoc(doc(db, "logs", LOG_ID), { types: ["RUN", "YOGA", "GYM", "SWIM"], typeCategories: { RUN: 'cardio', YOGA: 'other', GYM: 'gym', SWIM: 'cardio' }, customMetrics: [{ name: 'SLEEP', type: 'slider' }, { name: 'ENERGY', type: 'slider' }], entries: [], dailyNotes: {}, trainingPlans: [] });
        }
    });
};

// --- STREAK TRACKING ---
const renderStreak = () => {
    const badge = document.getElementById('streakBadge');
    if (!badge) return;

    const completed = logData.entries.filter(e => !e.isPlanned);
    const loggedDates = new Set(completed.map(e => e.date));

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Calculate current streak
    let streak = 0;
    const sd = new Date(today);
    if (!loggedDates.has(todayStr)) sd.setDate(sd.getDate() - 1);
    while (loggedDates.has(sd.toISOString().split('T')[0])) {
        streak++;
        sd.setDate(sd.getDate() - 1);
    }

    // This week's sessions (Mon–today)
    const dow = today.getDay();
    const mondayOffset = dow === 0 ? 6 : dow - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - mondayOffset);
    const weekStart = monday.toISOString().split('T')[0];
    const weekSessions = completed.filter(e => e.date >= weekStart && e.date <= todayStr).length;

    // Current theme
    const theme = (logData.themes || []).find(t => t.startDate <= todayStr && t.endDate >= todayStr);

    // Day-of-year for deterministic daily rotation
    const jan1 = new Date(today.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((today - jan1) / 86400000);

    // Build candidate messages
    const msgs = [];
    if (streak >= 2) msgs.push(`🔥 ${streak} day streak`);
    if (streak >= 7) msgs.push(`🔥 ${streak} days strong`);
    if (completed.length > 0) msgs.push(`💪 ${completed.length} sessions logged`);
    if (weekSessions > 0) msgs.push(`📅 ${weekSessions} session${weekSessions > 1 ? 's' : ''} this week`);
    if (theme) msgs.push(`🎯 ${theme.title}`);
    if (weekSessions >= 3) msgs.push(`⚡ Strong week so far`);
    if (streak === 0 && loggedDates.has(todayStr)) msgs.push(`✅ Logged today`);

    // Motivational fallbacks always available
    const motivational = [
        `🏃 Every session counts`, `💥 Show up. Put in the work.`,
        `🎯 Consistency beats intensity`, `🌱 Progress is progress`,
        `⚡ Make today count`, `🏆 Champions train every day`,
        `💪 One more rep`, `🔑 Stay the course`,
    ];
    // Pick a motivational message based on day so it's stable per day
    msgs.push(motivational[dayOfYear % motivational.length]);

    // Rotate through data-driven messages by day, falling back to motivational
    const pick = msgs[dayOfYear % msgs.length];

    badge.style.display = 'flex';
    badge.innerHTML = `<span>${pick}</span>`;
};

// --- DYNAMIC CUSTOM METRIC IMPLEMENTATIONS ---
window.showMetricModal = () => {
    const container = document.getElementById('metricList');
    container.innerHTML = logData.customMetrics.map((m, idx) => {
        const canCarry = m.type === 'slider' || m.type === 'number';
        // number metrics always carry forward; others need explicit opt-in
        const carrying = m.type === 'number' || m.carryForward === true;
        const carryBtn = canCarry
            ? `<button onclick="window.toggleCarryForward(${idx})" class="nav-btn metric-carry-btn ${carrying ? 'metric-carry-on' : ''}" title="Carry forward last value to days without a new entry">↪</button>`
            : '';
        return `
        <div class="type-item" style="display:flex; gap:8px; margin-bottom:8px; align-items:center;">
            <div class="reorder-btns">
                <button onclick="window.moveCustomMetric(${idx},-1)" class="reorder-btn" ${idx === 0 ? 'disabled' : ''}>▲</button>
                <button onclick="window.moveCustomMetric(${idx},1)" class="reorder-btn" ${idx === logData.customMetrics.length - 1 ? 'disabled' : ''}>▼</button>
            </div>
            <span style="flex:1; text-align:left; font-weight:700; font-size:0.85rem; align-self:center;">${m.name} (${m.type})</span>
            ${carryBtn}
            <button onclick="window.deleteCustomMetric(${idx})" style="background:#fee2e2; color:#ef4444; font-size:0.65rem; padding:6px 12px;" class="nav-btn">✕ Delete</button>
        </div>`;
    }).join('');
    document.getElementById('metricModal').style.display = 'flex';
};

window.toggleCarryForward = async (idx) => {
    const m = logData.customMetrics[idx];
    if (m.type === 'number') return; // always on for number type, can't toggle
    m.carryForward = !m.carryForward;
    await setDoc(doc(db, 'logs', LOG_ID), logData);
    window.showMetricModal();
    renderMatrix();
};

window.moveCustomMetric = async (idx, dir) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= logData.customMetrics.length) return;
    [logData.customMetrics[idx], logData.customMetrics[newIdx]] = [logData.customMetrics[newIdx], logData.customMetrics[idx]];
    await setDoc(doc(db, "logs", LOG_ID), logData);
    window.showMetricModal();
    renderMatrix();
};

window.addCustomMetric = async () => {
    const nameInput = document.getElementById('newMetricName');
    const typeSelect = document.getElementById('newMetricType');
    const name = nameInput.value.toUpperCase().replace(/\s+/g, '-').trim();
    if(!name) return;
    
    if(logData.customMetrics.some(m => m.name === name)) return alert('Metric name already active.');
    if (typeSelect.value === 'slider100') {
        logData.customMetrics.push({ name: name, type: 'slider', scale: 100 });
    } else {
        logData.customMetrics.push({ name: name, type: typeSelect.value });
    }
    await setDoc(doc(db, "logs", LOG_ID), logData);
    nameInput.value = "";
    window.showMetricModal();
};

window.deleteCustomMetric = async (idx) => {
    if(confirm("Permanently erase this custom tracking pillar from your layout?")) {
        logData.customMetrics.splice(idx, 1);
        await setDoc(doc(db, "logs", LOG_ID), logData);
        window.showMetricModal();
    }
};

window.updateLocalCustomMetricVal = (name, val) => { dynamicMetricValues[name] = val; };
window.updateTimeDistanceVal = (name, field, val) => {
    const current = (dynamicMetricValues[name] && typeof dynamicMetricValues[name] === 'object') ? dynamicMetricValues[name] : { time: '', distance: '' };
    dynamicMetricValues[name] = { ...current, [field]: val };
};

const buildCustomMetricsFormUI = (existingCustomValues = {}) => {
    const container = document.getElementById('customMetricsFormContainer');
    if (!container) { dynamicMetricValues = {}; return; }
    container.innerHTML = "";
    dynamicMetricValues = {};

    logData.customMetrics.forEach(m => {
        const scale = m.scale || 10;
        const defaultVal = m.type === 'slider' ? Math.round(scale/2) : m.type === 'timedistance' ? { time: '', distance: '' } : (m.type === 'number' || m.type === 'duration') ? '' : false;
        const val = existingCustomValues[m.name] !== undefined ? existingCustomValues[m.name] : defaultVal;
        dynamicMetricValues[m.name] = val;

        const div = document.createElement('div');
        div.className = "input-row";
        if (m.name === 'SLEEP') {
            const dur = existingCustomValues['SLEEP_DURATION'] ?? '';
            const bed = existingCustomValues['SLEEP_BEDTIME'] ?? '';
            const intr = existingCustomValues['SLEEP_INTERRUPTIONS'] ?? '';
            dynamicMetricValues['SLEEP_DURATION'] = dur === '' ? null : +dur;
            dynamicMetricValues['SLEEP_BEDTIME'] = bed === '' ? null : +bed;
            dynamicMetricValues['SLEEP_INTERRUPTIONS'] = intr === '' ? null : +intr;
            const hasAny = dur !== '' || bed !== '' || intr !== '';
            const showTotal = hasAny ? (+dur || 0) + (+bed || 0) + (+intr || 0) : (val !== '' && val != null ? val : '–');
            div.className = "input-row highlight-box";
            div.innerHTML = `
                <label>SLEEP Score</label>
                <div class="sleep-subscore-grid">
                    <div class="sleep-subscore-item">
                        <span class="sleep-sub-label">Duration</span>
                        <input class="sleep-sub-input" type="number" min="0" max="50" placeholder="–" value="${dur}" oninput="window.updateSleepSubscore('DURATION',this.value)">
                        <span class="sleep-sub-max">/50</span>
                    </div>
                    <div class="sleep-subscore-item">
                        <span class="sleep-sub-label">Bedtime</span>
                        <input class="sleep-sub-input" type="number" min="0" max="30" placeholder="–" value="${bed}" oninput="window.updateSleepSubscore('BEDTIME',this.value)">
                        <span class="sleep-sub-max">/30</span>
                    </div>
                    <div class="sleep-subscore-item">
                        <span class="sleep-sub-label">Interruptions</span>
                        <input class="sleep-sub-input" type="number" min="0" max="20" placeholder="–" value="${intr}" oninput="window.updateSleepSubscore('INTERRUPTIONS',this.value)">
                        <span class="sleep-sub-max">/20</span>
                    </div>
                </div>
                <div class="sleep-total-row">Total: <span id="sleep-total-val">${showTotal}</span><span style="opacity:0.5">/100</span></div>`;
        } else if (m.type === 'timedistance') {
            const time = (val && val.time) || '';
            const dist = (val && val.distance) || '';
            div.innerHTML = `
                <label>${m.name.replace(/-/g, ' ')} (time &amp; distance)</label>
                <div class="distance-input-row">
                    <input type="number" min="0" step="1" placeholder="Minutes" value="${time}" oninput="window.updateTimeDistanceVal('${m.name}','time',this.value)">
                    <input type="number" min="0" step="0.01" placeholder="Distance (km)" value="${dist}" oninput="window.updateTimeDistanceVal('${m.name}','distance',this.value)">
                </div>`;
        } else if (m.type === 'slider') {
            div.className = "input-row highlight-box";
            div.innerHTML = `
                <label>${m.name.replace(/-/g, ' ')} (1-${scale})</label>
                <div class="slider-row">
                    <input type="range" min="1" max="${scale}" value="${val}" oninput="document.getElementById('lbl-${m.name}').innerText = this.value; window.updateLocalCustomMetricVal('${m.name}', parseInt(this.value))">
                    <span id="lbl-${m.name}" class="score-display">${val}</span>
                </div>`;
        } else if (m.type === 'number') {
            div.innerHTML = `
                <label>${m.name.replace(/-/g, ' ')}</label>
                <input type="number" step="0.1" placeholder="e.g. 72.5" value="${val}" oninput="window.updateLocalCustomMetricVal('${m.name}', this.value)">`;
        } else if (m.type === 'duration') {
            div.innerHTML = `
                <label>${m.name.replace(/-/g, ' ')} (minutes)</label>
                <input type="number" min="0" step="1" placeholder="e.g. 45" value="${val || ''}" oninput="window.updateLocalCustomMetricVal('${m.name}', this.value)">`;
        } else {
            div.innerHTML = `
                <label>${m.name.replace(/-/g, ' ')}</label>
                <div class="binary-strip">
                    <button id="binBtn-Y-${m.name}" class="bin-btn ${val ? 'active' : ''}" onclick="window.setLocalBinMetric('${m.name}', true)">YES</button>
                    <button id="binBtn-N-${m.name}" class="bin-btn ${!val ? 'active' : ''}" onclick="window.setLocalBinMetric('${m.name}', false)">NO</button>
                </div>`;
        }
        container.appendChild(div);
    });
};

window.setLocalBinMetric = (name, val) => {
    dynamicMetricValues[name] = val;
    document.getElementById(`binBtn-Y-${name}`).classList.toggle('active', val);
    document.getElementById(`binBtn-N-${name}`).classList.toggle('active', !val);
};

window.updateSleepSubscore = (field, raw) => {
    const n = raw === '' ? null : Math.min(field === 'DURATION' ? 50 : field === 'BEDTIME' ? 30 : 20, Math.max(0, parseFloat(raw)));
    dynamicMetricValues['SLEEP_' + field] = isNaN(n) ? null : n;
    const d = dynamicMetricValues['SLEEP_DURATION'] ?? 0;
    const b = dynamicMetricValues['SLEEP_BEDTIME'] ?? 0;
    const i = dynamicMetricValues['SLEEP_INTERRUPTIONS'] ?? 0;
    const hasAny = dynamicMetricValues['SLEEP_DURATION'] !== null || dynamicMetricValues['SLEEP_BEDTIME'] !== null || dynamicMetricValues['SLEEP_INTERRUPTIONS'] !== null;
    const total = hasAny ? (+d || 0) + (+b || 0) + (+i || 0) : null;
    dynamicMetricValues['SLEEP'] = total;
    const el = document.getElementById('sleep-total-val');
    if (el) el.textContent = total !== null ? total : '–';
};

// --- CORE INTERFACE DIALOGS & EXECUTION ---
window.switchTab = (tab) => {
    ['log', 'overview', 'insights', 'goals', 'help'].forEach(t => {
        document.getElementById(`view${t.charAt(0).toUpperCase()+t.slice(1)}`)?.classList.toggle('active', t === tab);
    });
    document.querySelectorAll('.bottom-nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    if (tab === 'overview') renderOverview();
    if (tab === 'goals') { renderThemes(); renderGoals(); renderLearnings(); renderPlan(); }
};

window.setStrategy = (wantsPlanned) => {
    isPlannedStrategy = wantsPlanned;
    document.getElementById('stratPlan').classList.toggle('active', wantsPlanned);
    document.getElementById('stratDone').classList.toggle('active', !wantsPlanned);
    document.getElementById('performanceMetrics').style.display = wantsPlanned ? 'none' : 'block';
    window.toggleDistanceRow();
};

window.toggleDistanceRow = () => {
    const type = document.getElementById('modalType')?.value;
    const cat = (type && type !== 'NONE' && !isPlannedStrategy) ? getTypeCategory(type) : null;
    const catLabel = TYPE_CATEGORIES.find(c => c.value === cat)?.label || '';
    const section = document.getElementById('typeCategorySection');
    const badge = document.getElementById('typeCategoryBadge');
    section.style.display = cat ? 'block' : 'none';
    if (badge) badge.textContent = catLabel;
    document.getElementById('metricCardio').style.display     = (cat === 'cardio' || cat === 'pacing')   ? 'block' : 'none';
    document.getElementById('metricBodyweight').style.display = cat === 'bodyweight' ? 'block' : 'none';
    document.getElementById('metricGym').style.display        = cat === 'gym'        ? 'block' : 'none';
    document.getElementById('metricTime').style.display       = (cat === 'time' || cat === 'pacing')     ? 'block' : 'none';
    document.getElementById('metricOther').style.display      = cat === 'other'      ? 'block' : 'none';
};

window.showInputModal = () => {
    editingId = null;
    window._pendingPlanLink = null;
    document.getElementById('deleteEntryBtn').style.display = "none";
    document.getElementById('markDoneBtn').style.display = "none";
    document.getElementById('modalDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('modalDetails').value = "";
    window.setStrategy(false);
    buildCustomMetricsFormUI();
    document.getElementById('modalType').innerHTML = `<option value="NONE">No Category Allocation</option>` + logData.types.map(t => `<option value="${t}">${t}</option>`).join('');
    document.getElementById('modalDistance').value = '';
    document.getElementById('modalDistanceUnit').value = 'km';
    document.getElementById('modalReps').value = '';
    document.getElementById('modalWeight').value = '';
    document.getElementById('modalWeightUnit').value = 'kg';
    document.getElementById('modalDuration').value = '';
    document.getElementById('modalOtherRating').value = '';
    [0,1,2].forEach(i => { document.getElementById(`learning${i}`).value = ''; });
    document.getElementById('inputModal').style.display = 'flex';
    window.selectMark(1);
    window.toggleDistanceRow();
};

window.quickAddEntry = (dateKey, type) => {
    window.showInputModal();
    document.getElementById('modalDate').value = dateKey;
    const typeSelect = document.getElementById('modalType');
    if (type && [...typeSelect.options].some(o => o.value === type)) {
        typeSelect.value = type;
    }
    window.toggleDistanceRow();
};

window.quickAddEntryOnDate = (dateKey) => {
    window.showInputModal();
    document.getElementById('modalDate').value = dateKey;
};

window.editEntry = (id) => {
    const entry = logData.entries.find(e => e.id === id);
    if (!entry) return;
    editingId = id;
    document.getElementById('deleteEntryBtn').style.display = "block";
    document.getElementById('markDoneBtn').style.display = entry.isPlanned ? "block" : "none";
    document.getElementById('modalDate').value = entry.date;
    document.getElementById('modalDetails').value = entry.details || "";
    window.setStrategy(!!entry.isPlanned);
    buildCustomMetricsFormUI(entry.customMetricData || {});
    document.getElementById('modalType').innerHTML = `<option value="NONE">No Category Allocation</option>` + logData.types.map(t => `<option value="${t}" ${t === entry.type ? 'selected' : ''}>${t}</option>`).join('');
    document.getElementById('modalDistance').value = entry.distance || '';
    document.getElementById('modalDistanceUnit').value = entry.distanceUnit || 'km';
    document.getElementById('modalReps').value = entry.reps || '';
    document.getElementById('modalWeight').value = entry.weight || '';
    document.getElementById('modalWeightUnit').value = entry.weightUnit || 'kg';
    document.getElementById('modalDuration').value = entry.duration || '';
    document.getElementById('modalOtherRating').value = entry.otherRating || '';
    [0,1,2].forEach(i => { document.getElementById(`learning${i}`).value = (entry.learnings || [])[i] || ''; });
    window.selectMark(entry.mark || 1);
    document.getElementById('inputModal').style.display = 'flex';
    window.toggleDistanceRow();
};

window.quickCompletePlan = async (id) => {
    const idx = logData.entries.findIndex(e => e.id === id);
    if(idx === -1) return;
    logData.entries[idx].isPlanned = false;
    logData.entries[idx].mark = 2;
    logData.entries[idx].customMetricData = {};
    celebrate();
    await setDoc(doc(db, "logs", LOG_ID), logData);
};

window.markPlanDone = async () => {
    if (editingId === null) return;
    const idx = logData.entries.findIndex(e => e.id === editingId);
    if (idx === -1) return;
    logData.entries[idx].isPlanned = false;
    renderMatrix();
    window.closeModal('inputModal');
    celebrate();
    await setDoc(doc(db, "logs", LOG_ID), logData);
};

window.saveExercise = async () => {
    const type = document.getElementById('modalType').value;
    const cat = getTypeCategory(type);
    const distVal = parseFloat(document.getElementById('modalDistance').value);
    const repsVal = parseInt(document.getElementById('modalReps').value);
    const weightVal = parseFloat(document.getElementById('modalWeight').value);
    const durationVal = parseInt(document.getElementById('modalDuration').value);
    const otherRating = Math.min(10, Math.max(1, parseInt(document.getElementById('modalOtherRating').value) || 5));
    const customMetricData = isPlannedStrategy ? {} : { ...dynamicMetricValues };
    logData.customMetrics.forEach(m => {
        if (m.type !== 'number') return;
        const v = customMetricData[m.name];
        if (v === '' || v === undefined || v === null || isNaN(parseFloat(v))) delete customMetricData[m.name];
        else customMetricData[m.name] = parseFloat(v);
    });
    ['SLEEP_DURATION', 'SLEEP_BEDTIME', 'SLEEP_INTERRUPTIONS'].forEach(k => {
        if (customMetricData[k] == null) delete customMetricData[k];
    });
    if (customMetricData['SLEEP'] == null) delete customMetricData['SLEEP'];
    const entryData = {
        date: document.getElementById('modalDate').value,
        type,
        details: document.getElementById('modalDetails').value,
        mark: isPlannedStrategy ? null : window.tempMark,
        isPlanned: isPlannedStrategy,
        customMetricData,
        distance: (cat === 'cardio' || cat === 'pacing') && !isNaN(distVal) && distVal > 0 ? distVal : null,
        distanceUnit: document.getElementById('modalDistanceUnit').value,
        reps: cat === 'bodyweight' && !isNaN(repsVal) && repsVal > 0 ? repsVal : null,
        weight: cat === 'gym' && !isNaN(weightVal) && weightVal > 0 ? weightVal : null,
        weightUnit: document.getElementById('modalWeightUnit').value,
        duration: !isNaN(durationVal) && durationVal > 0 ? durationVal : null,
        otherRating: cat === 'other' && !isPlannedStrategy ? otherRating : null,
        learnings: [0,1,2].map(i => document.getElementById(`learning${i}`).value.trim()).filter(Boolean),
        id: editingId || Date.now()
    };
    if (editingId) {
        const idx = logData.entries.findIndex(e => e.id === editingId);
        logData.entries[idx] = entryData;
    } else {
        logData.entries.push(entryData);
    }
    await setDoc(doc(db, "logs", LOG_ID), logData);
    window.closeModal('inputModal');

    // If this log was triggered by ticking a plan session, mark it complete
    if (window._pendingPlanLink) {
        const { planId, sessionId } = window._pendingPlanLink;
        window._pendingPlanLink = null;
        const planIdx = (logData.trainingPlans || []).findIndex(p => p.id === planId);
        if (planIdx !== -1) {
            const sessIdx = (logData.trainingPlans[planIdx].sessions || []).findIndex(s => s.id === sessionId);
            if (sessIdx !== -1) {
                logData.trainingPlans[planIdx].sessions[sessIdx].isComplete = true;
                logData.trainingPlans[planIdx].sessions[sessIdx].logEntryId = entryData.id;
                await setDoc(doc(db, 'logs', LOG_ID), logData);
                if (document.getElementById('viewPlan')?.classList.contains('active')) renderPlan();
            }
        }
    }
};

window.clearActivityData = async () => {
    const entryCount = logData.entries.filter(e => !e.isPlanned).length;
    if (!confirm(
        `This will permanently delete all ${entryCount} logged activities and all custom metric readings (VO2, sleep, weight, etc.).\n\n` +
        `Your metric definitions, activity types, goals, and training plans will be kept.\n\n` +
        `This cannot be undone. Continue?`
    )) return;
    saveSnapshot(logData);
    logData.entries = logData.entries.filter(e => e.isPlanned);
    logData.dailyNotes = {};
    await setDoc(doc(db, 'logs', LOG_ID), logData);
    window.closeSettings();
    alert('All activity data cleared.');
};

window.deleteEntry = async () => {
    if (confirm("Delete entry?")) {
        logData.entries = logData.entries.filter(e => e.id !== editingId);
        await setDoc(doc(db, "logs", LOG_ID), logData);
        window.closeModal('inputModal');
    }
};

const chartInstances = {};
const destroyChart = (id) => { if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; } };

const renderTrailingCharts = (completed) => {
    const container = document.getElementById('trailingChartsContainer');
    if (!container) return;

    // Destroy any previous trailing charts
    Object.keys(chartInstances).filter(k => k.startsWith('trailing-')).forEach(k => destroyChart(k));
    container.innerHTML = '';

    // Build daily lookup: date → { customMetricData }
    const byDate = {};
    completed.forEach(e => {
        if (!byDate[e.date]) byDate[e.date] = { customVals: {} };
        if (e.customMetricData) Object.assign(byDate[e.date].customVals, e.customMetricData);
    });

    // Collect all dates in range (last 3 months)
    const allDates = [];
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 91);
    const today = new Date();
    for (let d = new Date(cutoff); d <= today; d.setDate(d.getDate() + 1)) {
        allDates.push(d.toISOString().split('T')[0]);
    }

    // Build 5-day trailing average series for a value accessor
    const TRAILING_WINDOW = 5;
    const trailingSeries = (accessor) => {
        const points = { labels: [], data: [] };
        allDates.forEach((dateStr, i) => {
            const window = allDates.slice(Math.max(0, i - (TRAILING_WINDOW - 1)), i + 1);
            const vals = window.map(d => accessor(byDate[d])).filter(v => v != null && v > 0);
            if (vals.length >= 2) {
                points.labels.push(new Date(dateStr).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }));
                points.data.push(+(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
            }
        });
        return points;
    };

    // Simple linear regression trend line over the data points
    const trendLine = (data) => {
        const n = data.length;
        if (n < 2) return { line: [], slope: 0 };
        const xs = data.map((_, i) => i);
        const meanX = xs.reduce((a,b)=>a+b,0) / n;
        const meanY = data.reduce((a,b)=>a+b,0) / n;
        let num = 0, den = 0;
        for (let i = 0; i < n; i++) { num += (xs[i]-meanX)*(data[i]-meanY); den += (xs[i]-meanX)**2; }
        const slope = den === 0 ? 0 : num / den;
        const intercept = meanY - slope * meanX;
        return { line: xs.map(x => +(slope*x + intercept).toFixed(2)), slope };
    };

    const trendDescription = (label, slope) => {
        const threshold = 0.01;
        if (slope > threshold) return `Your ${label.toLowerCase()} has been trending upward recently. 📈`;
        if (slope < -threshold) return `Your ${label.toLowerCase()} has been trending downward recently. 📉`;
        return `Your ${label.toLowerCase()} has been holding fairly steady recently. ➡️`;
    };

    const colors = ['#ff5500', '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#14b8a6'];

    const series = [
        ...logData.customMetrics
            .filter(m => m.type === 'slider')
            .map(m => ({ key: `trailing-${m.name}`, label: m.name.charAt(0) + m.name.slice(1).toLowerCase(), accessor: d => d?.customVals[m.name], scale: m.scale || 10 }))
    ];

    series.forEach(({ key, label, accessor, scale }, idx) => {
        const { labels, data } = trailingSeries(accessor);

        const titleEl = document.createElement('div');
        titleEl.className = 'insights-section-title';
        titleEl.textContent = `${label} — ${TRAILING_WINDOW}-day moving average`;
        container.appendChild(titleEl);

        if (data.length < 2) {
            const wrap = document.createElement('div');
            wrap.className = 'chart-container chart-empty-state';
            wrap.innerHTML = `<div class="chart-empty-icon">📈</div><p>Log more ${label.toLowerCase()} entries to see the trend</p>`;
            container.appendChild(wrap);
            return;
        }

        const { line, slope } = trendLine(data);
        const color = colors[idx % colors.length];

        const desc = document.createElement('p');
        desc.className = 'neutral-msg';
        desc.style.marginBottom = '12px';
        desc.textContent = trendDescription(label, slope);
        container.appendChild(desc);

        const wrap = document.createElement('div');
        wrap.className = 'chart-container';
        const canvas = document.createElement('canvas');
        canvas.id = key;
        wrap.appendChild(canvas);
        container.appendChild(wrap);

        chartInstances[key] = new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label,
                    data,
                    borderColor: color,
                    backgroundColor: color.replace(')', ',0.08)').replace('rgb', 'rgba'),
                    borderWidth: 2.5,
                    pointRadius: 3,
                    pointBackgroundColor: color,
                    fill: false,
                    tension: 0.4,
                }, {
                    label: 'Trend',
                    data: line,
                    borderColor: '#9499a3',
                    borderDash: [6, 4],
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                    tension: 0,
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { min: 1, max: scale, ticks: { stepSize: scale === 100 ? 10 : 1 }, grid: { color: '#f1f5f9' }, title: { display: true, text: `Score (1–${scale})`, font: { size: 11 }, color: '#8a8a8a' } },
                    x: { grid: { display: false }, ticks: { maxTicksLimit: 10, font: { size: 11 } } }
                }
            }
        });
    });

    // Number-type metrics (e.g. WEIGHT) — plot raw values over time, carrying forward gaps
    const numberMetrics = logData.customMetrics.filter(m => m.type === 'number');
    const numberSeries = (accessor) => {
        const points = { labels: [], data: [] };
        let last = null;
        allDates.forEach(dateStr => {
            const v = accessor(byDate[dateStr]);
            if (v != null) last = v;
            if (last != null) {
                points.labels.push(new Date(dateStr).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }));
                points.data.push(last);
            }
        });
        return points;
    };

    numberMetrics.forEach((m, idx) => {
        const label = m.name.charAt(0) + m.name.slice(1).toLowerCase();
        const key = `trailing-num-${m.name}`;
        const { labels, data } = numberSeries(d => d?.customVals[m.name]);

        const titleEl = document.createElement('div');
        titleEl.className = 'insights-section-title';
        titleEl.textContent = `${label} — trend`;
        container.appendChild(titleEl);

        if (data.length < 2) {
            const wrap = document.createElement('div');
            wrap.className = 'chart-container chart-empty-state';
            wrap.innerHTML = `<div class="chart-empty-icon">📈</div><p>Log more ${label.toLowerCase()} entries to see the trend</p>`;
            container.appendChild(wrap);
            return;
        }

        const { line, slope } = trendLine(data);
        const color = colors[(series.length + idx) % colors.length];

        const desc = document.createElement('p');
        desc.className = 'neutral-msg';
        desc.style.marginBottom = '12px';
        desc.textContent = trendDescription(label, slope);
        container.appendChild(desc);

        const wrap = document.createElement('div');
        wrap.className = 'chart-container';
        const canvas = document.createElement('canvas');
        canvas.id = key;
        wrap.appendChild(canvas);
        container.appendChild(wrap);

        chartInstances[key] = new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label,
                    data,
                    borderColor: color,
                    backgroundColor: color.replace(')', ',0.08)').replace('rgb', 'rgba'),
                    borderWidth: 2.5,
                    pointRadius: 3,
                    pointBackgroundColor: color,
                    fill: false,
                    tension: 0.4,
                }, {
                    label: 'Trend',
                    data: line,
                    borderColor: '#9499a3',
                    borderDash: [6, 4],
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                    tension: 0,
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { grid: { color: '#f1f5f9' }, title: { display: true, text: label, font: { size: 11 }, color: '#8a8a8a' } },
                    x: { grid: { display: false }, ticks: { maxTicksLimit: 10, font: { size: 11 } } }
                }
            }
        });
    });
};

const renderVolumeChart = (completed) => {
    destroyChart('volume');
    const canvas = document.getElementById('chartVolume');
    if (!canvas) return;

    const weeks = {};
    const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 3);
    completed
        .filter(e => e.type && e.type !== 'NONE' && new Date(e.date) >= cutoff)
        .forEach(e => {
            const w = getWeekStart(e.date);
            weeks[w] = (weeks[w] || 0) + 1;
        });

    const sorted = Object.keys(weeks).sort();
    if (sorted.length < 2) {
        canvas.parentElement.innerHTML = '<p class="neutral-msg" style="padding:10px 0">Log workouts across multiple weeks to see volume trends.</p>';
        return;
    }

    const labels = sorted.map(w => new Date(w).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }));
    const data = sorted.map(w => weeks[w]);

    chartInstances['volume'] = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Workouts',
                data,
                backgroundColor: 'rgba(255,85,0,0.75)',
                borderRadius: 4,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: '#f1f5f9' } },
                x: { grid: { display: false }, ticks: { font: { size: 11 }, maxTicksLimit: 18, maxRotation: 45 } }
            }
        }
    });
};

const _unused_renderCorrelationCharts = (completed) => {
    const section = document.getElementById('correlationChartsSection');
    const container = document.getElementById('correlationCharts');
    if (!section || !container) return;

    const sliders = logData.customMetrics.filter(m => m.type === 'slider');
    if (sliders.length === 0) { section.style.display = 'none'; return; }
    section.style.display = 'block';

    Object.keys(chartInstances).filter(k => k.startsWith('corr-')).forEach(k => destroyChart(k));
    container.innerHTML = '';

    sliders.forEach(m => {
        const points = completed.filter(e => e.happiness && e.customMetricData && e.customMetricData[m.name] !== undefined)
            .map(e => ({ x: e.customMetricData[m.name], y: e.happiness }));
        if (points.length < 3) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'chart-container';
        wrapper.style.marginBottom = '20px';
        const title = document.createElement('h3');
        title.textContent = m.name.replace(/-/g, ' ') + ' vs Happiness';
        const canvas = document.createElement('canvas');
        canvas.id = `corr-canvas-${m.name}`;
        wrapper.appendChild(title);
        wrapper.appendChild(canvas);
        container.appendChild(wrapper);

        chartInstances[`corr-${m.name}`] = new Chart(canvas, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: m.name,
                    data: points,
                    backgroundColor: 'rgba(255,85,0,0.6)',
                    pointRadius: 6,
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: { title: { display: true, text: m.name.replace(/-/g, ' '), font: { size: 11 } }, min: 1, max: 10, ticks: { stepSize: 1 }, grid: { color: '#f1f5f9' } },
                    y: { title: { display: true, text: 'Happiness', font: { size: 11 } }, min: 1, max: 10, ticks: { stepSize: 1 }, grid: { color: '#f1f5f9' } }
                }
            }
        });
    });
};

const getWeekStart = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().split('T')[0];
};

const _unused_renderWeeklySummary = (completed) => {
    const container = document.getElementById('weeklySummaryCards');
    if (!container) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const weekStart = getWeekStart(todayStr);

    const thisWeek = completed.filter(e => e.date >= weekStart && e.date <= todayStr);
    const workouts = thisWeek.filter(e => e.type && e.type !== 'NONE').length;
    const happyEntries = thisWeek.filter(e => e.happiness);
    const avgHappy = happyEntries.length ? (happyEntries.reduce((s,e) => s + e.happiness, 0) / happyEntries.length).toFixed(1) : '-';
    const typeSet = new Set(thisWeek.filter(e => e.type && e.type !== 'NONE').map(e => e.type));
    const days = new Set(thisWeek.map(e => e.date)).size;

    container.innerHTML = [
        { label: 'Workouts This Week', val: workouts, icon: '🏃' },
        { label: 'Active Days', val: days, icon: '📅' },
        { label: 'Avg Happiness', val: avgHappy, icon: '😊' },
        { label: 'Activity Types', val: typeSet.size || '-', icon: '🎯' },
    ].map(c => `<div class="stat-card"><div class="stat-icon">${c.icon}</div><label>${c.label}</label><div class="stat-val">${c.val}</div></div>`).join('');
};

const _unused_renderStreaks = (completed) => {
    const container = document.getElementById('streakCards');
    if (!container) return;

    const activeDates = new Set(
        completed.filter(e => e.type && e.type !== 'NONE').map(e => e.date)
    );
    const sorted = [...activeDates].sort();

    let currentStreak = 0, bestStreak = 0, streak = 0;
    const today = new Date();

    for (let i = 0; i < sorted.length; i++) {
        if (i === 0) { streak = 1; }
        else {
            const prev = new Date(sorted[i-1]);
            const curr = new Date(sorted[i]);
            const diff = (curr - prev) / 86400000;
            streak = diff === 1 ? streak + 1 : 1;
        }
        if (streak > bestStreak) bestStreak = streak;
    }

    if (sorted.length > 0) {
        const last = new Date(sorted[sorted.length - 1]);
        const diffFromToday = Math.floor((today - last) / 86400000);
        if (diffFromToday <= 1) {
            let s = 1;
            for (let i = sorted.length - 2; i >= 0; i--) {
                const curr = new Date(sorted[i+1]);
                const prev = new Date(sorted[i]);
                if ((curr - prev) / 86400000 === 1) s++;
                else break;
            }
            currentStreak = s;
        }
    }

    const loggingDates = new Set(completed.map(e => e.date));
    const loggingSorted = [...loggingDates].sort();
    let logStreak = 0, bestLogStreak = 0, ls = 0;
    for (let i = 0; i < loggingSorted.length; i++) {
        if (i === 0) { ls = 1; }
        else {
            const diff = (new Date(loggingSorted[i]) - new Date(loggingSorted[i-1])) / 86400000;
            ls = diff === 1 ? ls + 1 : 1;
        }
        if (ls > bestLogStreak) bestLogStreak = ls;
    }
    if (loggingSorted.length > 0) {
        const last = new Date(loggingSorted[loggingSorted.length - 1]);
        if (Math.floor((today - last) / 86400000) <= 1) {
            let s = 1;
            for (let i = loggingSorted.length - 2; i >= 0; i--) {
                if ((new Date(loggingSorted[i+1]) - new Date(loggingSorted[i])) / 86400000 === 1) s++;
                else break;
            }
            logStreak = s;
        }
    }

    container.innerHTML = [
        { label: 'Workout Streak', val: `${currentStreak}d`, icon: '🔥' },
        { label: 'Best Workout Streak', val: `${bestStreak}d`, icon: '🏆' },
        { label: 'Logging Streak', val: `${logStreak}d`, icon: '✍️' },
        { label: 'Best Logging Streak', val: `${bestLogStreak}d`, icon: '📈' },
    ].map(c => `<div class="stat-card"><div class="stat-icon">${c.icon}</div><label>${c.label}</label><div class="stat-val">${c.val}</div></div>`).join('');
};

const _unused_renderPersonalRecords = (completed) => {
    const container = document.getElementById('recordCards');
    if (!container) return;
    if (completed.length === 0) { container.innerHTML = `<p class="neutral-msg" style="padding:10px 0">No data yet.</p>`; return; }

    // Most active week
    const weekCounts = {};
    completed.filter(e => e.type && e.type !== 'NONE').forEach(e => {
        const w = getWeekStart(e.date);
        weekCounts[w] = (weekCounts[w] || 0) + 1;
    });
    const bestWeekCount = weekCounts && Object.values(weekCounts).length ? Math.max(...Object.values(weekCounts)) : 0;

    // Best happiness
    const happyEntries = completed.filter(e => e.happiness);
    const bestHappy = happyEntries.length ? Math.max(...happyEntries.map(e => e.happiness)) : '-';

    // Most used type
    const typeCounts = {};
    completed.filter(e => e.type && e.type !== 'NONE').forEach(e => { typeCounts[e.type] = (typeCounts[e.type] || 0) + 1; });
    const topType = Object.entries(typeCounts).sort((a,b) => b[1]-a[1])[0];

    // Total logged days
    const totalDays = new Set(completed.map(e => e.date)).size;

    container.innerHTML = [
        { label: 'Best Week (workouts)', val: bestWeekCount || '-', icon: '⚡' },
        { label: 'Peak Happiness', val: bestHappy, icon: '🌟' },
        { label: 'Favourite Activity', val: topType ? topType[0] : '-', icon: '❤️' },
        { label: 'Total Days Logged', val: totalDays, icon: '📓' },
    ].map(c => `<div class="stat-card"><div class="stat-icon">${c.icon}</div><label>${c.label}</label><div class="stat-val stat-val--sm">${c.val}</div></div>`).join('');
};

// --- GOALS & PROJECTS ---
const GOAL_CATEGORIES = ['cardio', 'bodyweight', 'gym', 'time', 'pacing'];

const goalTargetLabel = (g) => {
    switch (g.category) {
        case 'cardio': return `Cover ${g.targetDistance}${g.targetDistanceUnit} or more`;
        case 'gym': return `Lift ${g.targetWeight}${g.targetWeightUnit} or more`;
        case 'bodyweight': return `${g.targetReps}+ reps`;
        case 'time': return `${g.targetTime}+ minutes`;
        case 'pacing': return `${g.targetDistance}${g.targetDistanceUnit} in under ${g.targetTime} min`;
        case 'metric': return `Reach ${g.targetValue} ${titleCase(g.metricName)}`;
        default: return '';
    }
};

const computeGoalProgress = (g) => {
    const entries = logData.entries.filter(e =>
        e.type === g.type && !e.isPlanned &&
        (!g.startDate || e.date >= g.startDate) &&
        (!g.targetDate || e.date <= g.targetDate)
    );
    switch (g.category) {
        case 'cardio': {
            const best = Math.max(0, ...entries.filter(e => e.distance > 0).map(e => e.distance));
            const pct = g.targetDistance > 0 ? Math.min(100, Math.round((best / g.targetDistance) * 100)) : 0;
            return { pct, currentLabel: best > 0 ? `Best so far: ${best}${g.targetDistanceUnit}` : 'No entries logged yet' };
        }
        case 'gym': {
            const best = Math.max(0, ...entries.filter(e => e.weight > 0).map(e => e.weight));
            const pct = g.targetWeight > 0 ? Math.min(100, Math.round((best / g.targetWeight) * 100)) : 0;
            return { pct, currentLabel: best > 0 ? `Best so far: ${best}${g.targetWeightUnit}` : 'No entries logged yet' };
        }
        case 'bodyweight': {
            const best = Math.max(0, ...entries.filter(e => e.reps > 0).map(e => e.reps));
            const pct = g.targetReps > 0 ? Math.min(100, Math.round((best / g.targetReps) * 100)) : 0;
            return { pct, currentLabel: best > 0 ? `Best so far: ${best} reps` : 'No entries logged yet' };
        }
        case 'time': {
            const best = Math.max(0, ...entries.filter(e => e.duration > 0).map(e => e.duration));
            const pct = g.targetTime > 0 ? Math.min(100, Math.round((best / g.targetTime) * 100)) : 0;
            return { pct, currentLabel: best > 0 ? `Best so far: ${best} min` : 'No entries logged yet' };
        }
        case 'pacing': {
            const withinTime = entries.filter(e => e.distance > 0 && e.duration > 0 && e.duration <= g.targetTime);
            const bestDistanceInTime = withinTime.length ? Math.max(...withinTime.map(e => e.distance)) : 0;
            const distRatio = g.targetDistance > 0 ? Math.min(1, bestDistanceInTime / g.targetDistance) : 0;

            const overDistance = entries.filter(e => e.distance >= g.targetDistance && e.duration > 0);
            const bestTimeForDistance = overDistance.length ? Math.min(...overDistance.map(e => e.duration)) : null;
            const timeRatio = (bestTimeForDistance !== null && g.targetTime > 0) ? Math.min(1, g.targetTime / bestTimeForDistance) : 0;

            const pct = Math.round(((distRatio + timeRatio) / 2) * 100);
            let currentLabel = 'No entries logged yet';
            if (bestTimeForDistance !== null) currentLabel = `Best so far: ${g.targetDistance}${g.targetDistanceUnit} in ${bestTimeForDistance} min`;
            else if (bestDistanceInTime > 0) currentLabel = `Best so far: ${bestDistanceInTime}${g.targetDistanceUnit} in ${g.targetTime} min`;
            return { pct, currentLabel };
        }
        case 'metric': {
            const vals = logData.entries
                .filter(e => !e.isPlanned && e.customMetricData?.[g.metricName] != null &&
                    (!g.startDate || e.date >= g.startDate) &&
                    (!g.targetDate || e.date <= g.targetDate))
                .sort((a, b) => a.date < b.date ? -1 : 1);
            if (!vals.length) return { pct: 0, currentLabel: 'No entries logged yet' };
            const current = vals[vals.length - 1].customMetricData[g.metricName];
            const start = vals[0].customMetricData[g.metricName];
            const distStart = Math.abs(g.targetValue - start);
            const distNow = Math.abs(g.targetValue - current);
            const pct = distStart === 0 ? 100 : Math.max(0, Math.min(100, Math.round((1 - distNow / distStart) * 100)));
            return { pct, currentLabel: `Current: ${fmtNum(current)} (target ${fmtNum(g.targetValue)})` };
        }
        default:
            return { pct: Math.max(0, Math.min(100, g.progress || 0)), currentLabel: '' };
    }
};

const renderGoals = () => {
    const el = document.getElementById('goalsGrid');
    if (!el) return;
    if (!logData.goals || logData.goals.length === 0) {
        el.innerHTML = `<p class="neutral-msg" style="padding:10px 0">No goals yet — add one to start tracking progress.</p>`;
        return;
    }
    el.innerHTML = logData.goals.map(g => {
        const { pct, currentLabel } = computeGoalProgress(g);
        const fmtDate = d => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const startLabel = g.startDate ? fmtDate(g.startDate) : '';
        const endLabel = g.targetDate ? fmtDate(g.targetDate) : '';
        let dateLabel = '';
        if (startLabel && endLabel) dateLabel = `${startLabel} → ${endLabel}`;
        else if (endLabel) dateLabel = `Target: ${endLabel}`;
        else if (startLabel) dateLabel = `Start: ${startLabel}`;
        const targetLabel = goalTargetLabel(g);
        return `<div class="achievement-card unlocked goal-card" onclick="window.editGoal(${g.id})">
            <div class="goal-title">${g.title}</div>
            ${g.description ? `<div class="goal-desc">${g.description}</div>` : ''}
            ${g.type ? `<div class="goal-desc">${g.type} — ${targetLabel}</div>` : ''}
            ${dateLabel ? `<div class="goal-date">${dateLabel}</div>` : ''}
            <div class="goal-progress-outer"><div class="goal-progress-inner" style="width:${pct}%"></div></div>
            <div class="goal-progress-pct">${pct}%${currentLabel ? ` · ${currentLabel}` : ''}</div>
        </div>`;
    }).join('');
};

window.toggleGoalTypeFields = () => {
    const type = document.getElementById('goalType').value;
    const isMetric = type.startsWith('metric:');
    const cat = isMetric ? 'metric' : getTypeCategory(type);
    document.getElementById('goalMetricCardio').style.display = (cat === 'cardio' || cat === 'pacing') ? 'block' : 'none';
    document.getElementById('goalMetricGym').style.display = cat === 'gym' ? 'block' : 'none';
    document.getElementById('goalMetricBodyweight').style.display = cat === 'bodyweight' ? 'block' : 'none';
    document.getElementById('goalMetricTime').style.display = (cat === 'cardio' || cat === 'time' || cat === 'pacing') ? 'block' : 'none';
    document.getElementById('goalMetricTarget').style.display = isMetric ? 'block' : 'none';
    document.getElementById('goalMetricCardioLabel').textContent = 'Target Distance';
    document.getElementById('goalMetricTimeLabel').textContent = cat === 'time' ? 'Target Time, minutes (or more)' : cat === 'cardio' ? 'Target Time, minutes (under — optional)' : 'Target Time, minutes (under)';
    const hintEl = document.getElementById('goalMetricTargetHint');
    if (isMetric) {
        const metricName = type.slice(7);
        document.getElementById('goalMetricTargetLabel').textContent = `Target ${titleCase(metricName)}`;
        const vals = logData.entries
            .filter(e => !e.isPlanned && e.customMetricData?.[metricName] != null)
            .sort((a, b) => a.date < b.date ? -1 : 1);
        const latest = vals.length ? vals[vals.length - 1].customMetricData[metricName] : null;
        hintEl.textContent = latest != null ? `Most recently logged ${titleCase(metricName)}: ${fmtNum(latest)}` : `No ${titleCase(metricName)} entries logged yet`;
    } else {
        hintEl.textContent = '';
    }
};

const goalTypeOptions = () => {
    const exerciseOpts = logData.types
        .filter(t => GOAL_CATEGORIES.includes(getTypeCategory(t)))
        .map(t => `<option value="${t}">${t}</option>`).join('');
    const metricOpts = logData.customMetrics
        .filter(m => m.type === 'number')
        .map(m => `<option value="metric:${m.name}">Reach a target ${titleCase(m.name)}</option>`).join('');
    let html = '';
    if (exerciseOpts) html += `<optgroup label="Exercise Goals">${exerciseOpts}</optgroup>`;
    if (metricOpts) html += `<optgroup label="Body Metrics">${metricOpts}</optgroup>`;
    return html;
};

window.showGoalModal = () => {
    editingGoalId = null;
    document.getElementById('goalModalTitle').textContent = 'Add Goal';
    document.getElementById('deleteGoalBtn').style.display = 'none';
    document.getElementById('goalTitle').value = '';
    document.getElementById('goalDesc').value = '';
    document.getElementById('goalStartDate').value = '';
    document.getElementById('goalTargetDate').value = '';
    document.getElementById('goalType').innerHTML = goalTypeOptions();
    document.getElementById('goalTargetDistance').value = '';
    document.getElementById('goalTargetDistanceUnit').value = 'km';
    document.getElementById('goalTargetWeight').value = '';
    document.getElementById('goalTargetWeightUnit').value = 'kg';
    document.getElementById('goalTargetReps').value = '';
    document.getElementById('goalTargetTime').value = '';
    document.getElementById('goalTargetValue').value = '';
    window.toggleGoalTypeFields();
    document.getElementById('goalModal').style.display = 'flex';
};

window.editGoal = (id) => {
    const goal = logData.goals.find(g => g.id === id);
    if (!goal) return;
    editingGoalId = id;
    document.getElementById('goalModalTitle').textContent = 'Edit Goal';
    document.getElementById('deleteGoalBtn').style.display = 'block';
    document.getElementById('goalTitle').value = goal.title || '';
    document.getElementById('goalDesc').value = goal.description || '';
    document.getElementById('goalStartDate').value = goal.startDate || '';
    document.getElementById('goalTargetDate').value = goal.targetDate || '';
    document.getElementById('goalType').innerHTML = goalTypeOptions();
    document.getElementById('goalType').value = goal.type || '';
    document.getElementById('goalTargetDistance').value = goal.targetDistance || '';
    document.getElementById('goalTargetDistanceUnit').value = goal.targetDistanceUnit || 'km';
    document.getElementById('goalTargetWeight').value = goal.targetWeight || '';
    document.getElementById('goalTargetWeightUnit').value = goal.targetWeightUnit || 'kg';
    document.getElementById('goalTargetReps').value = goal.targetReps || '';
    document.getElementById('goalTargetTime').value = goal.targetTime || '';
    document.getElementById('goalTargetValue').value = goal.targetValue ?? '';
    window.toggleGoalTypeFields();
    document.getElementById('goalModal').style.display = 'flex';
};

window.saveGoal = async () => {
    const title = document.getElementById('goalTitle').value.trim();
    if (!title) return alert('Please enter a goal title.');
    const type = document.getElementById('goalType').value;
    if (!type) return alert('Please add an exercise type with a category first (Settings → Manage Types).');
    const isMetric = type.startsWith('metric:');
    const baseCat = isMetric ? 'metric' : getTypeCategory(type);

    const targetDistance = parseFloat(document.getElementById('goalTargetDistance').value);
    const targetWeight = parseFloat(document.getElementById('goalTargetWeight').value);
    const targetReps = parseInt(document.getElementById('goalTargetReps').value);
    const targetTime = parseInt(document.getElementById('goalTargetTime').value);
    const targetValue = parseFloat(document.getElementById('goalTargetValue').value);

    // Promote cardio to pacing when a time target is also provided
    const cat = (baseCat === 'cardio' && !isNaN(targetTime) && targetTime > 0) ? 'pacing' : baseCat;

    if ((cat === 'cardio' || cat === 'pacing') && (isNaN(targetDistance) || targetDistance <= 0)) return alert('Please enter a target distance.');
    if (cat === 'gym' && (isNaN(targetWeight) || targetWeight <= 0)) return alert('Please enter a target weight.');
    if (cat === 'bodyweight' && (isNaN(targetReps) || targetReps <= 0)) return alert('Please enter a target number of reps.');
    if ((cat === 'time' || cat === 'pacing') && (isNaN(targetTime) || targetTime <= 0)) return alert('Please enter a target time.');
    if (cat === 'metric' && isNaN(targetValue)) return alert('Please enter a target value.');

    const goalData = {
        id: editingGoalId || Date.now(),
        title,
        description: document.getElementById('goalDesc').value.trim(),
        type,
        category: cat,
        targetDistance: (cat === 'cardio' || cat === 'pacing') ? targetDistance : null,
        targetDistanceUnit: document.getElementById('goalTargetDistanceUnit').value,
        targetWeight: cat === 'gym' ? targetWeight : null,
        targetWeightUnit: document.getElementById('goalTargetWeightUnit').value,
        targetReps: cat === 'bodyweight' ? targetReps : null,
        targetTime: (cat === 'time' || cat === 'pacing') ? targetTime : null,
        metricName: isMetric ? type.slice(7) : null,
        targetValue: cat === 'metric' ? targetValue : null,
        startDate: document.getElementById('goalStartDate').value,
        targetDate: document.getElementById('goalTargetDate').value,
    };
    if (!logData.goals) logData.goals = [];
    if (editingGoalId) {
        const idx = logData.goals.findIndex(g => g.id === editingGoalId);
        logData.goals[idx] = goalData;
    } else {
        logData.goals.push(goalData);
    }
    renderGoals();
    window.closeModal('goalModal');
    await setDoc(doc(db, 'logs', LOG_ID), logData);
};

window.deleteGoal = async () => {
    if (!confirm('Delete this goal?')) return;
    logData.goals = logData.goals.filter(g => g.id !== editingGoalId);
    renderGoals();
    window.closeModal('goalModal');
    await setDoc(doc(db, 'logs', LOG_ID), logData);
};

// --- TRAINING THEMES ---
const renderThemes = () => {
    const el = document.getElementById('themesGrid');
    if (!el) return;
    if (!logData.themes || logData.themes.length === 0) {
        el.innerHTML = `<p class="neutral-msg" style="padding:10px 0">No themes yet — add one to mark a training focus period.</p>`;
        return;
    }
    const fmtDate = d => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    el.innerHTML = logData.themes.slice().sort((a,b) => (b.startDate || '').localeCompare(a.startDate || '')).map(t => {
        const startLabel = t.startDate ? fmtDate(t.startDate) : '';
        const endLabel = t.endDate ? fmtDate(t.endDate) : '';
        let dateLabel = '';
        if (startLabel && endLabel) dateLabel = `${startLabel} → ${endLabel}`;
        else if (endLabel) dateLabel = `Until: ${endLabel}`;
        else if (startLabel) dateLabel = `From: ${startLabel}`;
        return `<div class="achievement-card unlocked goal-card" onclick="window.editTheme(${t.id})">
            <div class="goal-title">${t.title}</div>
            ${t.description ? `<div class="goal-desc">${t.description}</div>` : ''}
            ${dateLabel ? `<div class="goal-date">${dateLabel}</div>` : ''}
        </div>`;
    }).join('');
};

window.showThemeModal = () => {
    editingThemeId = null;
    document.getElementById('themeModalTitle').textContent = 'Add Theme';
    document.getElementById('deleteThemeBtn').style.display = 'none';
    document.getElementById('themeTitle').value = '';
    document.getElementById('themeDesc').value = '';
    document.getElementById('themeStartDate').value = '';
    document.getElementById('themeEndDate').value = '';
    document.getElementById('themeModal').style.display = 'flex';
};

window.editTheme = (id) => {
    const theme = logData.themes.find(t => t.id === id);
    if (!theme) return;
    editingThemeId = id;
    document.getElementById('themeModalTitle').textContent = 'Edit Theme';
    document.getElementById('deleteThemeBtn').style.display = 'block';
    document.getElementById('themeTitle').value = theme.title || '';
    document.getElementById('themeDesc').value = theme.description || '';
    document.getElementById('themeStartDate').value = theme.startDate || '';
    document.getElementById('themeEndDate').value = theme.endDate || '';
    document.getElementById('themeModal').style.display = 'flex';
};

window.saveTheme = async () => {
    const title = document.getElementById('themeTitle').value.trim();
    if (!title) return alert('Please enter a theme title.');
    const startDate = document.getElementById('themeStartDate').value;
    const endDate = document.getElementById('themeEndDate').value;
    if (!startDate || !endDate) return alert('Please enter both a start date and an end date.');
    if (startDate > endDate) return alert('The start date must be on or before the end date.');
    if (!logData.themes) logData.themes = [];
    const overlap = logData.themes.find(t =>
        t.id !== editingThemeId && startDate <= t.endDate && t.startDate <= endDate
    );
    if (overlap) return alert(`These dates overlap with the existing theme "${overlap.title}". Only one theme can be active at a time.`);
    const themeData = {
        id: editingThemeId || Date.now(),
        title,
        description: document.getElementById('themeDesc').value.trim(),
        startDate,
        endDate,
    };
    if (editingThemeId) {
        const idx = logData.themes.findIndex(t => t.id === editingThemeId);
        logData.themes[idx] = themeData;
    } else {
        logData.themes.push(themeData);
    }
    renderThemes();
    window.closeModal('themeModal');
    await setDoc(doc(db, 'logs', LOG_ID), logData);
};

window.deleteTheme = async () => {
    if (!confirm('Delete this theme?')) return;
    logData.themes = logData.themes.filter(t => t.id !== editingThemeId);
    renderThemes();
    window.closeModal('themeModal');
    await setDoc(doc(db, 'logs', LOG_ID), logData);
};

const getThemeForDate = (dateKey) => {
    if (!logData.themes) return null;
    return logData.themes.find(t => t.startDate && dateKey >= t.startDate && (!t.endDate || dateKey <= t.endDate));
};

// --- LEARNINGS ---
const renderLearnings = () => {
    const container = document.getElementById('learningsContainer');
    if (!container) return;

    const entries = logData.entries.filter(e => !e.isPlanned && e.type && e.type !== 'NONE' && e.learnings?.length);
    const done = new Set(logData.completedLearnings || []);
    const tasks = logData.tasks || [];

    const allPending = [], allDone = [];

    // Exercise-linked learnings
    entries.forEach(e => {
        e.learnings.forEach((text, i) => {
            const key = `${e.id}-${i}`;
            const item = { key, text, date: e.date, type: e.type, isDone: done.has(key) };
            (item.isDone ? allDone : allPending).push(item);
        });
    });

    // Standalone tasks
    tasks.forEach(t => {
        const item = { key: `task-${t.id}`, text: t.text, date: t.date, type: t.type || null, isDone: !!t.isDone };
        (item.isDone ? allDone : allPending).push(item);
    });

    allPending.sort((a, b) => b.date.localeCompare(a.date));
    allDone.sort((a, b) => b.date.localeCompare(a.date));

    // Store pending items so onclick handlers can reference by index (avoids JSON-in-attribute escaping)
    window._thingsPending = allPending.map(i => ({ text: i.text, type: i.type || '', date: i.date, key: i.key }));

    const renderItem = (item, idx) => `
        <label class="learning-item${item.isDone ? ' learning-done' : ''}">
            <input type="checkbox" onchange="window.toggleLearning('${item.key}')" ${item.isDone ? 'checked' : ''}>
            <span class="learning-text">${item.text}</span>
            <span class="learning-date">${item.type ? titleCase(item.type) + ' · ' : ''}${new Date(item.date + 'T00:00:00').toLocaleDateString('en-GB', { day:'2-digit', month:'short' })}</span>
            ${!item.isDone ? `<button class="things-btn" title="Send to Things 3" onclick="event.preventDefault();window.sendThingsItem(${idx},this)">Things ↗</button>` : ''}
        </label>`;

    const typeOptions = logData.types.map(t => `<option value="${t}">${t}</option>`).join('');

    let html = `<div class="task-add-row">
        <input type="text" id="newTaskInput" placeholder="Add a task or learning..." class="task-add-input" onkeydown="if(event.key==='Enter')window.addTaskFromInput()">
        <select id="newTaskType" class="task-add-type">
            <option value="">General</option>
            ${typeOptions}
        </select>
        <button onclick="window.addTaskFromInput()" class="task-add-btn">+ Add</button>
    </div>`;

    if (allPending.length) {
        html += `<div class="insights-section-title">To work on</div>
            <button class="things-send-all-btn" id="thingsSendAllBtn" onclick="window.sendAllToThings(this)">Send all to Things 3</button>
            ${allPending.map((item, idx) => renderItem(item, idx)).join('')}`;
    }
    if (allDone.length) html += `<div class="insights-section-title" style="margin-top:30px">Done</div>${allDone.map(renderItem).join('')}`;
    if (!allPending.length && !allDone.length) {
        html += '<p class="neutral-msg" style="padding:20px 0">No learnings yet — add some when recording a session, or use the field above.</p>';
    }

    container.innerHTML = html;
};

window.addTaskFromInput = async () => {
    const input = document.getElementById('newTaskInput');
    const typeSelect = document.getElementById('newTaskType');
    const text = input?.value.trim();
    if (!text) return;
    const type = typeSelect?.value || null;
    const task = { id: Date.now(), text, type: type || null, date: new Date().toISOString().split('T')[0], isDone: false };
    if (!logData.tasks) logData.tasks = [];
    logData.tasks.push(task);
    await setDoc(doc(db, 'logs', LOG_ID), logData);
    renderLearnings();
};

window.toggleLearning = async (key) => {
    if (key.startsWith('task-')) {
        const taskId = +key.slice(5);
        const tasks = logData.tasks || [];
        const t = tasks.find(x => x.id === taskId);
        if (t) t.isDone = !t.isDone;
        logData.tasks = tasks;
    } else {
        const done = new Set(logData.completedLearnings || []);
        if (done.has(key)) done.delete(key); else done.add(key);
        logData.completedLearnings = [...done];
    }
    await setDoc(doc(db, 'logs', LOG_ID), logData);
    renderLearnings();
};

// Mark a learning/task as done without toggling back
const markLearningDone = async (key) => {
    if (key.startsWith('task-')) {
        const taskId = +key.slice(5);
        const t = (logData.tasks || []).find(x => x.id === taskId);
        if (t) t.isDone = true;
    } else {
        const done = new Set(logData.completedLearnings || []);
        done.add(key);
        logData.completedLearnings = [...done];
    }
};

// Opens Things 3 via anchor-click (more reliable than location.href for custom URL schemes in PWAs)
const openThingsUrl = (url) => {
    const a = document.createElement('a');
    a.href = url;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 200);
};

// Opens Things 3 with one or more to-do items, then marks them done
window.sendToThings = async (items, btn) => {
    if (!items.length) return;
    if (btn) { btn.textContent = 'Sent ✓'; btn.disabled = true; }
    const data = items.map(i => ({
        type: 'to-do',
        attributes: {
            title: i.text,
            notes: `InStrides${i.type ? ' · ' + i.type : ''} · ${i.date}`,
            tags: ['InStrides'],

            list: 'Training Log'
        }
    }));
    openThingsUrl(`things:///json?data=${encodeURIComponent(JSON.stringify(data))}`);
    for (const i of items) await markLearningDone(i.key);
    await setDoc(doc(db, 'logs', LOG_ID), logData);
    renderLearnings();
};

window.sendThingsItem = (idx, btn) => {
    const item = window._thingsPending[idx];
    if (item) window.sendToThings([item], btn);
};

window.sendAllToThings = (btn) => {
    if (window._thingsPending?.length) window.sendToThings(window._thingsPending, btn);
};

// --- CORRELATIONS ---
const pearsonR = (xs, ys) => {
    const n = xs.length;
    if (n < 5) return null;
    const mx = xs.reduce((a,b)=>a+b,0)/n, my = ys.reduce((a,b)=>a+b,0)/n;
    let num=0, dx=0, dy=0;
    for (let i=0; i<n; i++) { num+=(xs[i]-mx)*(ys[i]-my); dx+=(xs[i]-mx)**2; dy+=(ys[i]-my)**2; }
    return (dx===0||dy===0) ? null : num/Math.sqrt(dx*dy);
};

const renderCorrelations = () => {
    const container = document.getElementById('correlationsContainer');
    if (!container) return;
    container.innerHTML = '';

    const completed = logData.entries.filter(e => !e.isPlanned);
    const sliders = logData.customMetrics.filter(m => m.type === 'slider');
    const numbers = logData.customMetrics.filter(m => m.type === 'number');

    if (!completed.length || (!sliders.length && !numbers.length)) {
        container.innerHTML = '<p class="neutral-msg">Not enough data to compute correlations yet — keep logging!</p>';
        return;
    }

    const byDate = {};
    completed.forEach(e => {
        if (!byDate[e.date]) byDate[e.date] = { metrics: {}, sessions: 0, distance: 0 };
        if (e.customMetricData) Object.assign(byDate[e.date].metrics, e.customMetricData);
        if (e.type && e.type !== 'NONE') { byDate[e.date].sessions++; if (e.distance) byDate[e.date].distance += e.distance; }
    });
    const allDates = Object.keys(byDate).sort();

    const candidates = [];

    // Same-day: slider vs slider
    for (let i=0; i<sliders.length; i++) for (let j=i+1; j<sliders.length; j++) {
        const xs=[], ys=[];
        allDates.forEach(d => { const x=byDate[d].metrics[sliders[i].name], y=byDate[d].metrics[sliders[j].name]; if (x!=null&&y!=null){xs.push(x);ys.push(y);} });
        if (xs.length>=5) candidates.push({ xs, ys, r: pearsonR(xs,ys), kind: 'same-day', xLabel: titleCase(sliders[i].name), yLabel: titleCase(sliders[j].name) });
    }

    // Same-day: slider vs number metric (carry-forward last known number value)
    sliders.forEach(s => numbers.forEach(n => {
        const xs=[], ys=[];
        let last=null;
        allDates.forEach(d => { const nv=byDate[d].metrics[n.name]; if(nv!=null)last=nv; const sv=byDate[d].metrics[s.name]; if(sv!=null&&last!=null){xs.push(sv);ys.push(last);} });
        if (xs.length>=5) candidates.push({ xs, ys, r: pearsonR(xs,ys), kind: 'same-day', xLabel: titleCase(s.name), yLabel: titleCase(n.name) });
    }));

    // Lag-1: slider today → sessions tomorrow
    sliders.forEach(s => {
        const xs=[], ys=[];
        for (let i=0; i<allDates.length-1; i++) {
            const diff = Math.round((new Date(allDates[i+1])-new Date(allDates[i]))/86400000);
            const sv = byDate[allDates[i]].metrics[s.name];
            if (diff===1 && sv!=null) { xs.push(sv); ys.push(byDate[allDates[i+1]].sessions); }
        }
        if (xs.length>=5) candidates.push({ xs, ys, r: pearsonR(xs,ys), kind: 'lag', xLabel: titleCase(s.name), yLabel: 'next-day activity' });
    });

    // Weekly: sessions/week vs avg slider that week
    const weeklyData = {};
    completed.forEach(e => {
        const w = getWeekStart(e.date);
        if (!weeklyData[w]) weeklyData[w] = { sessions: 0, metrics: {} };
        if (e.type && e.type !== 'NONE') weeklyData[w].sessions++;
        if (e.customMetricData) sliders.forEach(s => {
            if (e.customMetricData[s.name]!=null) { if(!weeklyData[w].metrics[s.name]) weeklyData[w].metrics[s.name]=[]; weeklyData[w].metrics[s.name].push(e.customMetricData[s.name]); }
        });
    });
    sliders.forEach(s => {
        const xs=[], ys=[];
        Object.values(weeklyData).forEach(w => { const vals=w.metrics[s.name]; if(vals?.length){xs.push(w.sessions);ys.push(vals.reduce((a,b)=>a+b,0)/vals.length);} });
        if (xs.length>=5) candidates.push({ xs, ys, r: pearsonR(xs,ys), kind: 'weekly', xLabel: 'weekly sessions', yLabel: `average ${titleCase(s.name).toLowerCase()}` });
    });

    candidates.sort((a, b) => Math.abs(b.r||0) - Math.abs(a.r||0));
    const strong = candidates.filter(c => Math.abs(c.r||0) >= 0.5).slice(0, 5);

    if (!strong.length) {
        container.innerHTML = '<p class="neutral-msg">No strong correlations found in your data yet — keep logging and patterns will start to emerge!</p>';
        return;
    }

    const toSentence = (pair) => {
        const r = pair.r || 0;
        const pos = r >= 0;
        const x = pair.xLabel, y = pair.yLabel;

        if (pair.kind === 'lag') {
            return pos
                ? `Your ${x} seems to set you up for the next day — when it's high, you're noticeably more likely to get a session in the following day.`
                : `Interestingly, higher ${x} seems to be followed by quieter days — you tend to do less the day after a high ${x} reading.`;
        }
        if (pair.kind === 'weekly') {
            return pos
                ? `Busier training weeks really do seem to pay off — the more sessions you do, the better your ${y} tends to be that week.`
                : `It looks like heavy training weeks take a toll on your ${y} — more sessions in a week tends to coincide with lower ${y}.`;
        }
        // same-day
        return pos
            ? `Your ${x} and ${y} really do go hand in hand — on days when one is up, the other almost always is too.`
            : `Your ${x} and ${y} seem to pull in opposite directions — when your ${x} is high, your ${y} tends to be lower on the same day.`;
    };

    Object.keys(chartInstances).filter(k => k.startsWith('corrsc-')).forEach(k => destroyChart(k));
    container.innerHTML = '';

    const colors = ['#ff5500', '#6366f1', '#10b981', '#f59e0b', '#ec4899'];
    strong.forEach((pair, idx) => {
        const key = `corrsc-${idx}`;
        const color = colors[idx % colors.length];

        const item = document.createElement('div');
        item.className = 'correlation-item';
        item.innerHTML = `<span class="correlation-num">${idx + 1}</span><p class="correlation-sentence">${toSentence(pair)}</p>`;
        container.appendChild(item);

        const wrap = document.createElement('div');
        wrap.className = 'chart-container';
        wrap.style.marginBottom = '30px';
        const canvas = document.createElement('canvas');
        canvas.id = key;
        wrap.appendChild(canvas);
        container.appendChild(wrap);

        const n = pair.xs.length;
        const meanX = pair.xs.reduce((s, v) => s + v, 0) / n;
        const meanY = pair.ys.reduce((s, v) => s + v, 0) / n;
        const slope = pair.xs.reduce((s, x, i) => s + (x - meanX) * (pair.ys[i] - meanY), 0) /
                      (pair.xs.reduce((s, x) => s + (x - meanX) ** 2, 0) || 1);
        const intercept = meanY - slope * meanX;
        const xMin = Math.min(...pair.xs), xMax = Math.max(...pair.xs);
        const trendData = [{ x: xMin, y: slope * xMin + intercept }, { x: xMax, y: slope * xMax + intercept }];

        chartInstances[key] = new Chart(canvas, {
            type: 'scatter',
            data: {
                datasets: [
                    { data: pair.xs.map((x, i) => ({ x, y: pair.ys[i] })), backgroundColor: `${color}55`, borderColor: color, pointRadius: 5, pointHoverRadius: 7 },
                    { type: 'line', data: trendData, borderColor: color, borderWidth: 2, borderDash: [6, 4], pointRadius: 0, fill: false, tension: 0 }
                ]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: { title: { display: true, text: pair.xLabel, font: { size: 11 }, color: '#8a8a8a' }, grid: { color: '#f1f5f9' } },
                    y: { title: { display: true, text: pair.yLabel, font: { size: 11 }, color: '#8a8a8a' }, grid: { color: '#f1f5f9' } }
                }
            }
        });
    });
};

// --- ACTIVE GOALS PANEL ---
const renderActiveGoals = () => {
    const panel = document.getElementById('activeGoalsPanel');
    if (!panel) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const activeGoals = (logData.goals || []).filter(g =>
        (!g.startDate || g.startDate <= todayStr) &&
        (!g.targetDate || g.targetDate >= todayStr)
    );
    if (!activeGoals.length) { panel.innerHTML = ''; return; }

    panel.innerHTML = `<div class="ag-section">
        <div class="ag-heading">Active Goals</div>
        ${activeGoals.map(g => {
            const { pct } = computeGoalProgress(g);
            const daysLeft = g.targetDate
                ? Math.max(0, Math.round((new Date(g.targetDate + 'T00:00:00') - new Date()) / 86400000))
                : null;
            const targetLabel = goalTargetLabel(g);
            return `<div class="ag-goal">
                <div class="ag-goal-top">
                    <span class="ag-goal-title">${g.title}</span>
                    ${daysLeft !== null ? `<span class="ag-goal-days">${daysLeft}d left</span>` : ''}
                </div>
                ${targetLabel ? `<div class="ag-goal-target">${g.type} · ${targetLabel}</div>` : ''}
                <div class="ag-bar-wrap"><div class="ag-bar-fill" style="width:${pct}%"></div></div>
                <div class="ag-goal-pct">${pct}%</div>
            </div>`;
        }).join('')}
    </div>`;
};

// --- MASCOT ---
// --- OVERVIEW RENDERER ---
const OVERVIEW_CAT_COLORS = {
    cardio: '#3b82f6', gym: '#8b5cf6', bodyweight: '#10b981',
    time: '#f59e0b', pacing: '#06b6d4', other: '#ff5500',
};

const renderOverview = () => {
    const el = document.getElementById('overviewTable');
    if (!el) return;

    const types = logData.types.filter(t => t !== 'NONE');
    const completed = logData.entries.filter(e => !e.isPlanned);
    const themes = logData.themes || [];

    if (!types.length) {
        el.innerHTML = '<tr><td style="padding:24px;color:var(--text-muted);font-size:0.85rem">No exercise types defined yet. Add some in Settings → Manage Types.</td></tr>';
        return;
    }

    const done = new Set(completed.map(e => `${e.date}|${e.type}`));

    // Build lookup: "date|type" → entries array
    const entriesByDateType = {};
    completed.forEach(e => {
        const k = `${e.date}|${e.type}`;
        if (!entriesByDateType[k]) entriesByDateType[k] = [];
        entriesByDateType[k].push(e);
    });

    const getOvCellLabel = (entries, type) => {
        if (!entries.length) return '';
        const cat = getTypeCategory(type);
        if (cat === 'cardio' || cat === 'pacing') {
            const dist = entries.reduce((s, e) => s + (e.distance || 0), 0);
            if (!dist) return '';
            const unit = entries.find(e => e.distanceUnit)?.distanceUnit || 'km';
            const val = dist >= 10 ? Math.round(dist) : +dist.toFixed(1);
            return `${val}${unit === 'km' ? 'k' : 'mi'}`;
        }
        if (cat === 'gym') {
            const maxW = Math.max(...entries.map(e => e.weight || 0));
            if (!maxW || !isFinite(maxW)) return '';
            const unit = entries.find(e => e.weightUnit)?.weightUnit || 'kg';
            return `${maxW}${unit === 'kg' ? 'k' : 'lb'}`;
        }
        if (cat === 'time' || cat === 'bodyweight') {
            const dur = entries.reduce((s, e) => s + (e.duration || 0), 0);
            return dur ? `${dur}m` : '';
        }
        if (cat === 'other') {
            const dur = entries.reduce((s, e) => s + (e.duration || 0), 0);
            if (dur) return `${dur}m`;
            const vals = entries.filter(e => e.otherRating).map(e => e.otherRating);
            if (vals.length) {
                const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
                return avg % 1 === 0 ? `${avg}` : avg.toFixed(1);
            }
        }
        return '';
    };

    const themeObjForDate = d => themes.find(t => t.startDate <= d && t.endDate >= d) || null;
    const fmtShort = s => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const firstEntry = completed.length
        ? completed.reduce((a, b) => a.date < b.date ? a : b).date
        : todayStr;

    const rows = [];
    for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const s = d.toISOString().split('T')[0];
        if (s < firstEntry) break;
        rows.push(s);
    }

    // Header
    let html = '<thead><tr><th class="ov-date-th"></th>';
    types.forEach(type => {
        const color = OVERVIEW_CAT_COLORS[getTypeCategory(type)] || '#ff5500';
        const label = type.length > 5 ? type.slice(0, 4) : type;
        html += `<th class="ov-type-th"><span class="ov-type-label" style="color:${color}">${label}</span></th>`;
    });
    html += '</tr></thead><tbody>';

    // Rows (most recent first)
    const colSpan = types.length + 1;
    let prevThemeId = undefined;
    let prevWeekStart = null;
    rows.forEach((dateStr, idx) => {
        const theme = themeObjForDate(dateStr);
        const themeId = theme?.id ?? null;

        // Insert divider when we enter a theme block
        if (themeId !== prevThemeId && theme) {
            html += `<tr class="ov-theme-divider-row"><td class="ov-theme-divider-cell" colspan="${colSpan}">
                <span class="ov-theme-divider-title">${theme.title}</span>
                <span class="ov-theme-divider-range">${fmtShort(theme.startDate)} – ${fmtShort(theme.endDate)}</span>
            </td></tr>`;
        }
        prevThemeId = themeId;

        // Dashed week separator at each Mon→Sun boundary (between weeks, not within)
        const d = new Date(dateStr + 'T00:00:00');
        const thisWeekStart = getWeekStart(dateStr);
        if (idx > 0 && thisWeekStart !== prevWeekStart) {
            html += `<tr class="ov-week-sep"><td colspan="${colSpan}"></td></tr>`;
        }
        prevWeekStart = thisWeekStart;

        const dayLabel = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        const isToday = dateStr === todayStr;

        html += `<tr><td class="ov-date-td${isToday ? ' ov-today' : ''}" onclick="window.quickAddEntryOnDate('${dateStr}')" title="Log entry for ${dayLabel}">${dayLabel}</td>`;
        types.forEach(type => {
            const active = done.has(`${dateStr}|${type}`);
            const color = OVERVIEW_CAT_COLORS[getTypeCategory(type)] || '#ff5500';
            const entries = active ? (entriesByDateType[`${dateStr}|${type}`] || []) : [];
            const label = active ? getOvCellLabel(entries, type) : '';
            let cellInner = '';
            if (label) {
                const match = label.match(/^([\d.]+)/);
                const num = match ? match[1] : label;
                cellInner = `<span class="ov-sq-val"><span class="ov-sq-num">${num}</span></span>`;
            }
            const clickAttr = active ? ` onclick="window.openOvDetail('${dateStr}','${type}')" style="background:${color};cursor:pointer"` : '';
            html += `<td class="ov-cell-wrap"><div class="ov-sq${active ? ' ov-sq-on' : ''}"${clickAttr}>${cellInner}</div></td>`;
        });
        html += `</tr>`;
    });

    html += '</tbody>';
    el.innerHTML = html;

    // Sticky header — Safari doesn't support position:sticky on <th> inside overflow:auto
    const scrollEl = el.closest('.overview-scroll');
    const thead = el.querySelector('thead');
    if (scrollEl && thead) {
        if (scrollEl._ovHeaderScroll) scrollEl.removeEventListener('scroll', scrollEl._ovHeaderScroll);
        scrollEl._ovHeaderScroll = () => { thead.style.transform = `translateY(${scrollEl.scrollTop}px)`; };
        scrollEl.addEventListener('scroll', scrollEl._ovHeaderScroll, { passive: true });
    }

    renderActiveGoals();
    renderShortTermCharts(completed);
    renderLongTermCharts(completed);
};

// --- KEY FINDINGS ---
const renderKeyFindings = (completed) => {
    const container = document.getElementById('keyFindingsContainer');
    if (!container) return;

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const trained = completed.filter(e => e.type && e.type !== 'NONE');

    const findings = [];

    // Week-on-week load
    const wkEnd = todayStr;
    const wkStart = new Date(today); wkStart.setDate(wkStart.getDate() - 6);
    const prevEnd = new Date(today); prevEnd.setDate(prevEnd.getDate() - 7);
    const prevStart = new Date(today); prevStart.setDate(prevStart.getDate() - 13);
    const wkSessions = trained.filter(e => e.date >= wkStart.toISOString().split('T')[0] && e.date <= wkEnd).length;
    const prevSessions = trained.filter(e => e.date >= prevStart.toISOString().split('T')[0] && e.date <= prevEnd.toISOString().split('T')[0]).length;
    if (wkSessions > 0 && prevSessions > 0) {
        const diff = wkSessions - prevSessions;
        if (diff > 0) findings.push(`Training load up — ${wkSessions} sessions this week vs ${prevSessions} last week.`);
        else if (diff < 0) findings.push(`Training load down — ${wkSessions} sessions this week vs ${prevSessions} last week.`);
        else findings.push(`Consistent training load — ${wkSessions} sessions this week, same as last.`);
    }

    // Most consistent day of week
    const dayCounts = [0,0,0,0,0,0,0];
    new Set(trained.map(e => e.date)).forEach(d => { dayCounts[new Date(d + 'T00:00:00').getDay()]++; });
    const maxDayIdx = dayCounts.indexOf(Math.max(...dayCounts));
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    if (dayCounts[maxDayIdx] >= 3) findings.push(`You train most on ${dayNames[maxDayIdx]}s — ${dayCounts[maxDayIdx]} sessions on that day overall.`);

    // Type distribution
    const typeCounts = {};
    trained.forEach(e => { typeCounts[e.type] = (typeCounts[e.type] || 0) + 1; });
    const sortedTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
    if (sortedTypes.length >= 2) {
        const total = trained.length;
        const pct = Math.round(sortedTypes[0][1] / total * 100);
        findings.push(`${sortedTypes[0][0]} is ${pct}% of your sessions, followed by ${sortedTypes[1][0]}.`);
    }

    // Active days in last 28
    const cutoff28 = new Date(today); cutoff28.setDate(cutoff28.getDate() - 27);
    const cutoff28Str = cutoff28.toISOString().split('T')[0];
    const activeDays28 = new Set(trained.filter(e => e.date >= cutoff28Str).map(e => e.date)).size;
    if (activeDays28 > 0) findings.push(`You've trained on ${activeDays28} of the last 28 days.`);

    // Best recent month
    const monthCounts = {};
    trained.forEach(e => { const m = e.date.slice(0,7); monthCounts[m] = (monthCounts[m]||0)+1; });
    const thisMonth = todayStr.slice(0,7);
    const pastMonths = Object.entries(monthCounts).filter(([m]) => m < thisMonth).sort((a,b) => b[0].localeCompare(a[0])).slice(0,3);
    const thisMonthCount = monthCounts[thisMonth] || 0;
    if (pastMonths.length >= 2 && thisMonthCount > 0 && thisMonthCount >= Math.max(...pastMonths.map(([,c]) => c))) {
        findings.push(`This is your most active month in the last ${pastMonths.length + 1} months — ${thisMonthCount} sessions so far.`);
    }

    // Streak
    const loggedDates = new Set(completed.map(e => e.date));
    let streak = 0;
    const sd = new Date(today);
    if (!loggedDates.has(todayStr)) sd.setDate(sd.getDate()-1);
    while (loggedDates.has(sd.toISOString().split('T')[0])) { streak++; sd.setDate(sd.getDate()-1); }
    if (streak >= 5) findings.push(`You're on a ${streak}-day streak — don't break the chain.`);

    if (findings.length === 0) {
        container.innerHTML = '<p class="findings-empty">Log more sessions to see training insights here.</p>';
        return;
    }
    container.innerHTML = `<ul class="key-findings-list">${findings.map(f => `<li>${f}</li>`).join('')}</ul>`;
};

const renderShortTermCharts = (completed) => {
    const container = document.getElementById('shortTermChartsContainer');
    if (!container) return;

    Object.keys(chartInstances).filter(k => k.startsWith('st-')).forEach(k => destroyChart(k));
    container.innerHTML = '';

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 84); // 12 weeks

    // Build a sorted list of week-start keys covering the range
    const weekKeys = [];
    const today = new Date();
    for (let d = new Date(cutoff); d <= today; d.setDate(d.getDate() + 7)) {
        weekKeys.push(getWeekStart(d.toISOString().split('T')[0]));
    }
    const uniqueWeeks = [...new Set(weekKeys)].sort();

    // Per-week aggregation helpers
    const weeklyAvg = (accessor) => {
        const weeks = {};
        completed.forEach(e => {
            if (new Date(e.date) < cutoff) return;
            const val = parseFloat(accessor(e));
            if (!val || isNaN(val) || val <= 0) return;
            const wk = getWeekStart(e.date);
            if (!weeks[wk]) weeks[wk] = { sum: 0, count: 0 };
            weeks[wk].sum += val;
            weeks[wk].count++;
        });
        return uniqueWeeks
            .filter(wk => weeks[wk])
            .map(wk => ({
                label: new Date(wk).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
                value: +(weeks[wk].sum / weeks[wk].count).toFixed(1)
            }));
    };

    const weeklySum = (accessor) => {
        const weeks = {};
        completed.forEach(e => {
            if (new Date(e.date) < cutoff) return;
            const val = parseFloat(accessor(e));
            if (!val || isNaN(val) || val <= 0) return;
            const wk = getWeekStart(e.date);
            weeks[wk] = (weeks[wk] || 0) + val;
        });
        return uniqueWeeks
            .filter(wk => weeks[wk])
            .map(wk => ({
                label: new Date(wk).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
                value: +weeks[wk].toFixed(1)
            }));
    };

    const dailyVal = (accessor) => {
        const days = {};
        completed.forEach(e => {
            if (new Date(e.date) < cutoff) return;
            const val = parseFloat(accessor(e));
            if (isNaN(val) || val == null) return;
            days[e.date] = val; // last/only value for that day
        });
        return Object.keys(days).sort().map(d => ({
            label: new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
            value: days[d]
        }));
    };

    // VO2 Max with carry-forward: use last known value per week
    const weeklyVo2CarryForward = () => {
        const byDate = {};
        completed.forEach(e => {
            const val = parseFloat(e.customMetricData?.['VO2 MAX']);
            if (val > 0 && !isNaN(val)) byDate[e.date] = val;
        });
        const sortedDates = Object.keys(byDate).sort();
        const result = [];
        let lastVal = null;
        // seed lastVal from before the cutoff window
        sortedDates.forEach(d => { if (new Date(d) < cutoff) lastVal = byDate[d]; });
        uniqueWeeks.forEach(wk => {
            const wkEnd = new Date(wk); wkEnd.setDate(wkEnd.getDate() + 6);
            const wkEndStr = wkEnd.toISOString().split('T')[0];
            sortedDates.forEach(d => { if (d >= wk && d <= wkEndStr && byDate[d] != null) lastVal = byDate[d]; });
            if (lastVal != null) result.push({
                label: new Date(wk).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
                value: lastVal
            });
        });
        return result;
    };

    const rollingAvg3Points = (points) => points.map((p, i) => {
        const slice = points.slice(Math.max(0, i - 2), i + 1);
        return { label: p.label, value: +(slice.reduce((a, b) => a + b.value, 0) / slice.length).toFixed(1) };
    });

    const makeStChart = (id, canvasId, title, points, color, unit, chartType = 'line', yMax = null, showTrend = false, showAvg = true, summary = null) => {
        const titleEl = document.createElement('div');
        titleEl.className = 'insights-section-title';
        titleEl.textContent = title;
        container.appendChild(titleEl);

        if (summary) {
            const summaryEl = document.createElement('p');
            summaryEl.className = 'chart-summary';
            summaryEl.innerHTML = summary;
            container.appendChild(summaryEl);
        }

        if (points.length < 2) {
            const empty = document.createElement('div');
            empty.className = 'chart-container chart-empty-state';
            empty.innerHTML = `<div class="chart-empty-icon">📈</div><p>Not enough data yet</p>`;
            container.appendChild(empty);
            return;
        }

        const wrap = document.createElement('div');
        wrap.className = 'chart-container';
        const canvas = document.createElement('canvas');
        canvas.id = canvasId;
        wrap.appendChild(canvas);
        container.appendChild(wrap);

        const isBar = chartType === 'bar';
        const vals = points.map(p => p.value);
        const avgVal = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        const trendVals = null;
        chartInstances[id] = new Chart(canvas, {
            type: chartType,
            data: {
                labels: points.map(p => p.label),
                datasets: [{
                    label: unit,
                    data: vals,
                    borderColor: color,
                    backgroundColor: isBar ? color + 'bf' : color + '26',
                    borderWidth: isBar ? 0 : 2,
                    borderRadius: isBar ? 4 : 0,
                    tension: 0.3,
                    fill: !isBar,
                    pointRadius: 2,
                    pointHoverRadius: 5
                }, ...(showAvg && avgVal !== null ? [{
                    label: 'Average',
                    data: Array(vals.length).fill(+avgVal.toFixed(2)),
                    borderColor: color + '90',
                    borderWidth: 1.5,
                    borderDash: [5, 4],
                    pointRadius: 0,
                    fill: false,
                    tension: 0,
                    type: 'line'
                }] : []), ...(trendVals ? [{
                    label: 'Trend',
                    data: trendVals,
                    borderColor: color,
                    borderWidth: 2,
                    borderDash: [2, 2],
                    pointRadius: 0,
                    fill: false,
                    tension: 0,
                    type: 'line'
                }] : [])]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: false, ...(yMax ? { suggestedMax: yMax } : {}), grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } } },
                    x: { grid: { display: false }, ticks: { font: { size: 11 }, maxRotation: 45 } }
                }
            }
        });
    };

    makeStChart('st-weight',   'chartStWeight',   'Weekly Avg Weight (kg)',            weeklyAvg(e => e.customMetricData?.['WEIGHT']),  '#6366f1', 'kg');
    makeStChart('st-vo2max',   'chartStVo2max',   'Weekly VO2 Max (mL/kg/min)',         weeklyVo2CarryForward(),                          '#10b981', 'mL/kg/min');
    const distUnit = completed.find(e => e.distanceUnit)?.distanceUnit || 'km';
    makeStChart('st-rundist',  'chartStRunDist',  `Weekly Running Distance (${distUnit})`, weeklySum(e => e.type === 'RUN' && e.distance > 0 ? e.distance : null), '#ff5500', distUnit);
    makeStChart('st-energy',   'chartStEnergy',   'Weekly Avg Energy (1–10)',           weeklyAvg(e => e.customMetricData?.['ENERGY']),  '#f59e0b', '/10');
    makeStChart('st-sleep',      'chartStSleep',     'Weekly Avg Sleep Score (/100)',           weeklyAvg(e => e.customMetricData?.['SLEEP']),              '#14b8a6', '/100', 'line', 100);
    const sleepSummary = (accessor, max) => {
        const pts = dailyVal(accessor);
        if (pts.length < 1) return null;
        const last3 = pts.slice(-3);
        const prev7 = pts.slice(-10, -3);
        const avg = v => +(v.reduce((a, b) => a + b.value, 0) / v.length).toFixed(1);
        const a3 = avg(last3);
        let arrow = '', trend = '';
        if (prev7.length >= 2) {
            const ap = avg(prev7), diff = a3 - ap;
            if (diff > 1) {
                arrow = '<span style="color:#22c55e;font-weight:900">↑</span>';
                trend = ` — up from ${ap} (7-day avg)`;
            } else if (diff < -1) {
                arrow = '<span style="color:#ef4444;font-weight:900">↓</span>';
                trend = ` — down from ${ap} (7-day avg)`;
            } else {
                arrow = '<span style="color:var(--text-muted);font-weight:900">→</span>';
                trend = ` — in line with ${ap} (7-day avg)`;
            }
        }
        return `${arrow} Last 3 days averaged <strong>${a3}/${max}</strong>${trend}.`;
    };
    makeStChart('st-sleep-dur',  'chartStSleepDur',  'Sleep · Duration (/50)',       dailyVal(e => e.customMetricData?.['SLEEP_DURATION']),     '#3b82f6', '/50',  'bar', 50,  false, false, sleepSummary(e => e.customMetricData?.['SLEEP_DURATION'], 50));
    makeStChart('st-sleep-bed',  'chartStSleepBed',  'Sleep · Bedtime (/30)',        dailyVal(e => e.customMetricData?.['SLEEP_BEDTIME']),      '#10b981', '/30',  'bar', 30,  false, false, sleepSummary(e => e.customMetricData?.['SLEEP_BEDTIME'], 30));
    makeStChart('st-sleep-intr', 'chartStSleepIntr', 'Sleep · Interruptions (/20)', dailyVal(e => e.customMetricData?.['SLEEP_INTERRUPTIONS']), '#f97316', '/20', 'bar', 20, false, false, sleepSummary(e => e.customMetricData?.['SLEEP_INTERRUPTIONS'], 20));
};

const renderLongTermCharts = (completed) => {
    const container = document.getElementById('longTermChartsContainer');
    if (!container) return;

    ['lt-weight', 'lt-vo2max', 'lt-rundist'].forEach(k => destroyChart(k));
    container.innerHTML = '';

    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 8);

    const monthlyAvg = (accessor) => {
        const months = {};
        completed.forEach(e => {
            if (new Date(e.date) < cutoff) return;
            const val = parseFloat(accessor(e));
            if (!val || isNaN(val) || val <= 0) return;
            const ym = e.date.slice(0, 7);
            if (!months[ym]) months[ym] = { sum: 0, count: 0 };
            months[ym].sum += val;
            months[ym].count++;
        });
        const sorted = Object.keys(months).sort();
        return {
            labels: sorted.map(ym => new Date(ym + '-15').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })),
            data: sorted.map(ym => +(months[ym].sum / months[ym].count).toFixed(1))
        };
    };

    const monthlyAvgCarryForward = (accessor) => {
        const months = {};
        completed.forEach(e => {
            if (new Date(e.date) < cutoff) return;
            const val = parseFloat(accessor(e));
            if (!val || isNaN(val) || val <= 0) return;
            const ym = e.date.slice(0, 7);
            if (!months[ym]) months[ym] = { sum: 0, count: 0 };
            months[ym].sum += val;
            months[ym].count++;
        });
        const recorded = Object.keys(months).sort();
        if (!recorded.length) return { labels: [], data: [] };
        // Enumerate every month from first recorded to today
        const today = new Date();
        const endYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        const allYMs = [];
        let [y, m] = recorded[0].split('-').map(Number);
        const [ey, em] = endYM.split('-').map(Number);
        while (y < ey || (y === ey && m <= em)) {
            allYMs.push(`${y}-${String(m).padStart(2, '0')}`);
            m++; if (m > 12) { m = 1; y++; }
        }
        const labels = [], data = [];
        let lastVal = null;
        allYMs.forEach(ym => {
            const avg = months[ym] ? +(months[ym].sum / months[ym].count).toFixed(1) : null;
            if (avg != null) lastVal = avg;
            if (lastVal != null) {
                labels.push(new Date(ym + '-15').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }));
                data.push(lastVal);
            }
        });
        return { labels, data };
    };

    const monthlySum = (accessor) => {
        const months = {};
        completed.forEach(e => {
            if (new Date(e.date) < cutoff) return;
            const val = parseFloat(accessor(e));
            if (!val || isNaN(val) || val <= 0) return;
            const ym = e.date.slice(0, 7);
            months[ym] = (months[ym] || 0) + val;
        });
        const sorted = Object.keys(months).sort();
        return {
            labels: sorted.map(ym => new Date(ym + '-15').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })),
            data: sorted.map(ym => +months[ym].toFixed(1))
        };
    };

    const ltInsight = ({ labels, data }) => {
        if (data.length < 3) return null;
        // Skip current (partial) month — compare against its label
        const thisMonthLabel = new Date().toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
        let idx = data.length - 1;
        if (labels[idx] === thisMonthLabel) idx--;
        if (idx < 1) return null;
        const lastVal = data[idx];
        const lastLabel = labels[idx];
        const allAvg = data.reduce((a, b) => a + b, 0) / data.length;
        if (!allAvg) return null;
        const pctDiff = Math.round(((lastVal - allAvg) / allAvg) * 100);
        const years = Math.max(1, Math.round(data.length / 12));
        const yearStr = years > 1 ? `${years}-year` : 'long-term';
        if (Math.abs(pctDiff) < 1) return `${lastLabel} was in line with your ${yearStr} average.`;
        const dir = pctDiff > 0 ? 'above' : 'below';
        return `${lastLabel} was ${Math.abs(pctDiff)}% ${dir} your ${yearStr} average.`;
    };

    const makeLtChart = (id, canvasId, title, { labels, data }, color, unit, chartType = 'line') => {
        const titleEl = document.createElement('div');
        titleEl.className = 'insights-section-title';
        titleEl.textContent = title;
        container.appendChild(titleEl);

        const sentence = ltInsight({ labels, data }, unit);
        if (sentence) {
            const p = document.createElement('p');
            p.className = 'lt-insight';
            p.textContent = sentence;
            container.appendChild(p);
        }

        if (data.length < 2) {
            const empty = document.createElement('div');
            empty.className = 'chart-container chart-empty-state';
            empty.innerHTML = `<div class="chart-empty-icon">📈</div><p>Not enough data yet</p>`;
            container.appendChild(empty);
            return;
        }

        const wrap = document.createElement('div');
        wrap.className = 'chart-container';
        const canvas = document.createElement('canvas');
        canvas.id = canvasId;
        wrap.appendChild(canvas);
        container.appendChild(wrap);

        const isBar = chartType === 'bar';
        const dataVals = data.filter(v => v != null && !isNaN(v));
        const ltAvg = dataVals.length ? dataVals.reduce((a, b) => a + b, 0) / dataVals.length : null;
        chartInstances[id] = new Chart(canvas, {
            type: chartType,
            data: {
                labels,
                datasets: [{
                    label: unit,
                    data,
                    borderColor: color,
                    backgroundColor: isBar ? color + 'bf' : color + '26',
                    borderWidth: isBar ? 0 : 2,
                    borderRadius: isBar ? 4 : 0,
                    tension: 0.3,
                    fill: !isBar,
                    pointRadius: 0,
                    pointHoverRadius: 4
                }, ...(ltAvg !== null ? [{
                    label: 'Average',
                    data: Array(data.length).fill(+ltAvg.toFixed(2)),
                    borderColor: color + '90',
                    borderWidth: 1.5,
                    borderDash: [5, 4],
                    pointRadius: 0,
                    fill: false,
                    tension: 0,
                    type: 'line'
                }] : [])]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: false, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } } },
                    x: { grid: { display: false }, ticks: { font: { size: 11 }, maxTicksLimit: 16, maxRotation: 45 } }
                }
            }
        });
    };

    const weightSeries = monthlyAvg(e => e.customMetricData?.['WEIGHT']);
    makeLtChart('lt-weight', 'chartLtWeight', 'Average Monthly Weight (kg)', weightSeries, '#6366f1', 'kg');

    const vo2Series = monthlyAvgCarryForward(e => e.customMetricData?.['VO2 MAX']);
    makeLtChart('lt-vo2max', 'chartLtVo2max', 'Average Monthly VO2 Max (mL/kg/min)', vo2Series, '#10b981', 'mL/kg/min');

    const distUnit = completed.find(e => e.distanceUnit)?.distanceUnit || 'km';
    const runSeries = monthlySum(e => e.type === 'RUN' && e.distance > 0 ? e.distance : null);
    makeLtChart('lt-rundist', 'chartLtRunDist', `Monthly Running Distance (${distUnit})`, runSeries, '#ff5500', distUnit);
};

window.openOvDetail = (dateStr, type) => {
    const entries = logData.entries.filter(e => e.date === dateStr && e.type === type && !e.isPlanned);
    if (!entries.length) return;

    const cat = getTypeCategory(type);
    const color = OVERVIEW_CAT_COLORS[cat] || '#ff5500';
    const d = new Date(dateStr + 'T00:00:00');
    const dateLabel = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const titleEl = document.getElementById('ovDetailTitle');
    titleEl.textContent = type;
    titleEl.style.color = color;
    document.getElementById('ovDetailDate').textContent = dateLabel;

    document.getElementById('ovDetailBody').innerHTML = entries.map((e, i) => {
        const stats = [];
        if (cat === 'cardio' || cat === 'pacing') {
            if (e.distance) stats.push({ val: e.distance, unit: e.distanceUnit || 'km', label: 'distance' });
            if (e.duration) stats.push({ val: e.duration, unit: 'min', label: 'duration' });
        } else if (cat === 'gym') {
            if (e.weight) stats.push({ val: e.weight, unit: e.weightUnit || 'kg', label: 'weight' });
            if (e.reps) stats.push({ val: e.reps, unit: '', label: 'reps' });
            if (e.duration) stats.push({ val: e.duration, unit: 'min', label: 'duration' });
        } else if (cat === 'time') {
            if (e.duration) stats.push({ val: e.duration, unit: 'min', label: 'duration' });
        } else if (cat === 'bodyweight') {
            if (e.reps) stats.push({ val: e.reps, unit: '', label: 'reps' });
            if (e.duration) stats.push({ val: e.duration, unit: 'min', label: 'duration' });
        } else {
            if (e.duration) stats.push({ val: e.duration, unit: 'min', label: 'duration' });
            if (e.otherRating) stats.push({ val: e.otherRating, unit: '/10', label: 'effort' });
        }

        const statsHtml = stats.length
            ? `<div class="ov-detail-stats">${stats.map(s =>
                `<div class="ov-detail-stat">
                    <span class="ov-detail-stat-val">${s.val}</span>
                    <span class="ov-detail-stat-unit">${s.unit}</span>
                    <span class="ov-detail-stat-label">${s.label}</span>
                </div>`).join('')}</div>`
            : '';

        const notesHtml = e.details ? `<div class="ov-detail-notes">${e.details}</div>` : '';
        const stravaHtml = e.isStravaActivity ? `<div class="ov-detail-strava">Imported from Strava</div>` : '';
        const sep = i > 0 ? ' ov-detail-entry-sep' : '';

        return `<div class="ov-detail-entry${sep}">
            ${statsHtml}${notesHtml}${stravaHtml}
            <button class="ov-detail-edit-btn" onclick="window.editEntry(${e.id});window.closeModal('ovDetailModal')">Edit entry</button>
        </div>`;
    }).join('');

    document.getElementById('ovDetailModal').style.display = 'flex';
};

const computeHealthScore = (completed, asOfDateStr) => {
    const todayStr = asOfDateStr || new Date().toISOString().split('T')[0];
    const today = new Date(todayStr);
    const windowStart = new Date(today); windowStart.setDate(windowStart.getDate() - 9);
    const priorStart = new Date(today); priorStart.setDate(priorStart.getDate() - 19);
    const priorEnd = new Date(today); priorEnd.setDate(priorEnd.getDate() - 10);

    const winKey = windowStart.toISOString().split('T')[0];
    const priorStartKey = priorStart.toISOString().split('T')[0];
    const priorEndKey = priorEnd.toISOString().split('T')[0];

    const last10 = completed.filter(e => e.date >= winKey && e.date <= todayStr);
    const prior10 = completed.filter(e => e.date >= priorStartKey && e.date <= priorEndKey);

    const components = [];

    // Activity: training load (duration × category weight) vs prior period
    // Rest days: 1–3 in 10 days treated as healthy recovery (small bonus)
    const catLoadWeight = { cardio: 1.2, gym: 1.1, bodyweight: 0.9, pacing: 1.2, time: 0.8, other: 0.7 };
    const trainingLoad = entries => entries
        .filter(e => e.type && e.type !== 'NONE')
        .reduce((sum, e) => sum + (e.duration || 30) * (catLoadWeight[getTypeCategory(e.type)] || 1.0), 0);
    const recentLoad = trainingLoad(last10);
    const priorLoad = trainingLoad(prior10);
    const recentActiveDays = new Set(last10.filter(e => e.type && e.type !== 'NONE').map(e => e.date)).size;
    const restDays10 = 10 - recentActiveDays;
    const restBonus = (restDays10 >= 1 && restDays10 <= 3) ? 5 : 0;
    const activityScore = priorLoad
        ? Math.min(100, Math.round((recentLoad / priorLoad) * 100) + restBonus)
        : (recentLoad > 0 ? 100 : 50);
    const recentSessions = last10.filter(e => e.type && e.type !== 'NONE').length;
    components.push({
        name: 'Activity', score: activityScore, weight: 0.4,
        detail: `${recentSessions} sessions · ${Math.round(recentLoad)}min weighted load${restDays10 > 0 ? ` · ${restDays10} rest day${restDays10 > 1 ? 's' : ''}` : ''}`
    });

    // Recovery: average of slider metrics (e.g. SLEEP, ENERGY) over the last 10 days vs. the 10 days before
    const sliderMetrics = logData.customMetrics.filter(m => m.type === 'slider');
    if (sliderMetrics.length) {
        const recoveryRatio = entries => {
            const scores = sliderMetrics.map(m => {
                const vals = entries.filter(e => e.customMetricData?.[m.name] != null).map(e => e.customMetricData[m.name]);
                if (!vals.length) return null;
                return (vals.reduce((a, b) => a + b, 0) / vals.length) / (m.scale || 10);
            }).filter(v => v != null);
            return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
        };
        const recentRecovery = recoveryRatio(last10);
        const priorRecovery = recoveryRatio(prior10);
        if (recentRecovery != null) {
            const recoveryScore = priorRecovery ? Math.min(100, Math.round((recentRecovery / priorRecovery) * 100)) : Math.round(recentRecovery * 100);
            const names = sliderMetrics.map(m => m.name.charAt(0) + m.name.slice(1).toLowerCase()).join(' & ');
            components.push({
                name: 'Recovery', score: recoveryScore, weight: 0.35,
                detail: priorRecovery ? `${names} is ${recoveryScore >= 100 ? 'at or above' : 'below'} your level from the previous 10 days` : `${names} logged over the last 10 days`
            });
        }
    }

    // Goal progress: movement toward a target value (e.g. body weight) over the last 10 days
    const weightGoal = (logData.goals || []).find(g => g.category === 'metric');
    if (weightGoal) {
        const metricName = weightGoal.metricName;
        const valueAsOf = (dateStr) => {
            let val = null, valDate = null;
            completed.forEach(e => {
                if (e.date <= dateStr && e.customMetricData?.[metricName] != null && (!valDate || e.date > valDate)) {
                    valDate = e.date;
                    val = e.customMetricData[metricName];
                }
            });
            return val;
        };
        const currentVal = valueAsOf(todayStr);
        const pastVal = valueAsOf(priorEndKey);
        if (currentVal != null && pastVal != null) {
            const distPast = Math.abs(weightGoal.targetValue - pastVal);
            const distNow = Math.abs(weightGoal.targetValue - currentVal);
            const goalScore = distPast === 0 ? 100 : Math.max(0, Math.min(100, Math.round((1 - (distNow - distPast) / distPast) * 50)));
            const label = titleCase(metricName);
            const detail = currentVal === pastVal
                ? `${label} unchanged at ${fmtNum(currentVal)} (target ${fmtNum(weightGoal.targetValue)})`
                : `${label} moved from ${fmtNum(pastVal)} to ${fmtNum(currentVal)} (target ${fmtNum(weightGoal.targetValue)})`;
            components.push({ name: `${label} Goal`, score: goalScore, weight: 0.25, detail });
        }
    }

    const totalWeight = components.reduce((s, c) => s + c.weight, 0);
    const score = Math.round(components.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight);

    let label, color;
    if (score >= 80) { label = 'Excellent'; color = '#22c55e'; }
    else if (score >= 60) { label = 'Good'; color = '#3b82f6'; }
    else if (score >= 40) { label = 'Fair'; color = '#f59e0b'; }
    else { label = 'Needs attention'; color = '#ef4444'; }

    return { score, label, color, components };
};

// Health score series: daily for short ranges, weekly samples for longer ranges
const computeHealthScoreSeries = (completed, days) => {
    const points = { labels: [], data: [] };
    const today = new Date();
    const step = days > 90 ? 7 : 1;
    for (let i = days - 1; i >= 0; i -= step) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        points.labels.push(d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }));
        points.data.push(computeHealthScore(completed, dateStr).score);
    }
    return points;
};

const renderHealthScore = (completed) => {
    const el = document.getElementById('healthScoreCard');
    const chartWrap = document.getElementById('healthScoreChartWrap');
    if (!el) return;

    if (!completed.length) {
        el.innerHTML = `<p class="neutral-msg" style="padding:10px 0">Log some activity to see your health score.</p>`;
        if (chartWrap) chartWrap.style.display = 'none';
        return;
    }

    const { score, label, color, components } = computeHealthScore(completed);

    const series = computeHealthScoreSeries(completed, 90);
    const prevScore = series.data[series.data.length - 8]; // score 7 days ago
    let trendArrow = '';
    if (prevScore != null) {
        const diff = score - prevScore;
        if (diff >= 2) trendArrow = `<span class="hs-trend hs-trend-up" title="Up ${diff} vs 7 days ago">▲ ${diff}</span>`;
        else if (diff <= -2) trendArrow = `<span class="hs-trend hs-trend-down" title="Down ${Math.abs(diff)} vs 7 days ago">▼ ${Math.abs(diff)}</span>`;
        else trendArrow = `<span class="hs-trend hs-trend-flat" title="Steady vs 7 days ago">▬ 0</span>`;
    }

    el.innerHTML = `
        <div class="health-score-main">
            <div class="health-score-ring" style="background: conic-gradient(${color} ${score * 3.6}deg, var(--border) 0deg);">
                <div class="health-score-ring-inner">
                    <span class="health-score-num">${score}</span>
                </div>
            </div>
            <div class="health-score-label" style="color:${color}">${label} ${trendArrow}</div>
        </div>
        <div class="health-score-breakdown">
            ${components.map(c => `
                <div class="hs-row">
                    <div class="hs-row-top"><span class="hs-name">${c.name}</span><span class="hs-score">${c.score}</span></div>
                    <div class="hs-bar"><div class="hs-fill" style="width:${Math.min(100, c.score)}%; background:${color}"></div></div>
                    <div class="hs-detail">${c.detail}</div>
                </div>
            `).join('')}
        </div>
    `;

    if (chartWrap) {
        chartWrap.style.display = '';
        destroyChart('health-score');
        chartInstances['health-score'] = new Chart(document.getElementById('healthScoreChart'), {
            type: 'line',
            data: {
                labels: series.labels,
                datasets: [{
                    label: 'Health Score',
                    data: series.data,
                    borderColor: color,
                    backgroundColor: color.replace(')', ',0.08)').replace('rgb', 'rgba'),
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.3,
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { min: 0, max: 100, ticks: { stepSize: 20 }, grid: { color: '#f1f5f9' } },
                    x: { grid: { display: false }, ticks: { maxTicksLimit: 12, font: { size: 11 }, maxRotation: 45 } }
                }
            }
        });
    }
};

const computeLongestStreak = (loggedDates) => {
    const sorted = [...loggedDates].sort();
    let longest = 0, current = 0, prev = null;
    sorted.forEach(dateStr => {
        if (prev) {
            const diffDays = Math.round((new Date(dateStr) - new Date(prev)) / 86400000);
            current = (diffDays === 1) ? current + 1 : 1;
        } else {
            current = 1;
        }
        longest = Math.max(longest, current);
        prev = dateStr;
    });
    return longest;
};

const renderWeeklyRecap = (completed) => {
    const el = document.getElementById('weeklyRecap');
    if (!el) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const weekStartStr = getWeekStart(todayStr);

    const weekEntries = completed.filter(e => e.date >= weekStartStr && e.date <= todayStr);
    if (weekEntries.length === 0) {
        el.innerHTML = `<p class="neutral-msg" style="padding:10px 0">Nothing logged this week yet — get moving!</p>`;
        return;
    }

    const workouts = weekEntries.filter(e => e.type && e.type !== 'NONE');
    const totalDistance = weekEntries.filter(e => e.distance > 0).reduce((s,e) => s + e.distance, 0);
    const distUnit = weekEntries.find(e => e.distanceUnit)?.distanceUnit || 'km';
    const daysLogged = new Set(weekEntries.map(e => e.date)).size;

    const sliderAvgs = logData.customMetrics.filter(m => m.type === 'slider').map(m => {
        const vals = weekEntries.filter(e => e.customMetricData?.[m.name] != null).map(e => e.customMetricData[m.name]);
        if (!vals.length) return null;
        const name = m.name.charAt(0) + m.name.slice(1).toLowerCase();
        return { name, avg: (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1) };
    }).filter(Boolean);

    const weekStart = new Date(weekStartStr);
    const weekLabel = weekStart.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const todayLabel = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const isWeekComplete = weekStartStr !== todayStr && new Date(todayStr).getDay() === 0;

    el.innerHTML = `
        <div class="recap-header">${isWeekComplete ? `Week of ${weekLabel}` : `${weekLabel} – ${todayLabel}`}</div>
        <div class="recap-stats">
            <div class="recap-stat"><span class="recap-num">${daysLogged}</span><span class="recap-label">days logged</span></div>
            <div class="recap-stat"><span class="recap-num">${workouts.length}</span><span class="recap-label">workouts</span></div>
            ${totalDistance > 0 ? `<div class="recap-stat"><span class="recap-num">${totalDistance.toFixed(1)}</span><span class="recap-label">${distUnit} covered</span></div>` : ''}
            ${sliderAvgs.map(s => `<div class="recap-stat"><span class="recap-num">${s.avg}</span><span class="recap-label">avg ${s.name}</span></div>`).join('')}
        </div>
    `;
};

const ACHIEVEMENTS = [
    { icon: '🏁', name: 'First Steps',     desc: 'Log your first workout',  check: s => s.totalWorkouts >= 1 },
    { icon: '🔥', name: 'On a Roll',       desc: '7-day logging streak',    check: s => s.longestStreak >= 7 },
    { icon: '💪', name: 'Iron Will',       desc: '30-day logging streak',   check: s => s.longestStreak >= 30 },
    { icon: '📅', name: 'Regular',         desc: 'Log 25 different days',   check: s => s.totalDays >= 25 },
    { icon: '🏃', name: 'Distance Runner', desc: 'Cover 50km total',        check: s => s.totalDistance >= 50 },
    { icon: '🚀', name: 'Century',         desc: 'Cover 100km total',       check: s => s.totalDistance >= 100 },
    { icon: '🎯', name: 'Half Century',    desc: 'Log 50 workouts',         check: s => s.totalWorkouts >= 50 },
    { icon: '🏆', name: 'Centurion',       desc: 'Log 100 workouts',        check: s => s.totalWorkouts >= 100 },
];

const renderAchievements = (completed, showAll = false) => {
    const el = document.getElementById('achievementsGrid');
    if (!el) return;

    const loggedDates = new Set(completed.map(e => e.date));
    const workouts = completed.filter(e => e.type && e.type !== 'NONE');
    const totalDistance = completed.filter(e => e.distance > 0).reduce((s,e) => s + e.distance, 0);

    const stats = {
        totalWorkouts: workouts.length,
        totalDays: loggedDates.size,
        totalDistance,
        longestStreak: computeLongestStreak(loggedDates),
    };

    const tagged = ACHIEVEMENTS.map(a => ({ ...a, unlocked: a.check(stats) }));
    const unlocked = tagged.filter(a => a.unlocked);
    const locked = tagged.filter(a => !a.unlocked);
    const lockedToShow = showAll ? locked : locked.slice(0, 2);
    const visible = [...unlocked, ...lockedToShow];
    const hiddenCount = locked.length - lockedToShow.length;

    const cardHtml = visible.map(a => `
        <div class="achievement-card ${a.unlocked ? 'unlocked' : 'locked'}">
            <div class="achievement-icon">${a.icon}</div>
            <div class="achievement-name">${a.name}</div>
            <div class="achievement-desc">${a.desc}</div>
        </div>`).join('');

    const toggleHtml = hiddenCount > 0
        ? `<button class="achievements-show-more" onclick="window._renderAchievementsAll()">+${hiddenCount} more</button>`
        : (showAll && locked.length > 2 ? `<button class="achievements-show-more" onclick="window._renderAchievementsFew()">Show less</button>` : '');

    el.innerHTML = cardHtml + toggleHtml;
};

window._renderAchievementsAll = () => renderAchievements(logData.entries.filter(e => !e.isPlanned), true);
window._renderAchievementsFew = () => renderAchievements(logData.entries.filter(e => !e.isPlanned), false);

const renderWeekCompare = (completed) => {
    const el = document.getElementById('weekCompare');
    if (!el) return;

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const d10 = new Date(today); d10.setDate(d10.getDate() - 9);
    const d20 = new Date(today); d20.setDate(d20.getDate() - 10);
    const d19 = new Date(today); d19.setDate(d19.getDate() - 19);

    const last10Start  = d10.toISOString().split('T')[0];
    const prior10Start = d19.toISOString().split('T')[0];
    const prior10End   = d20.toISOString().split('T')[0];

    const p1 = completed.filter(e => e.date >= last10Start && e.date <= todayStr);
    const p2 = completed.filter(e => e.date >= prior10Start && e.date <= prior10End);

    const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
    const sum = arr => arr.length ? arr.reduce((a,b)=>a+b,0) : null;

    const toTitle = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

    const rows = [];

    // Slider custom metrics
    logData.customMetrics.filter(m => m.type === 'slider').forEach(m => {
        const vals = w => w.filter(e => e.customMetricData?.[m.name] != null).map(e => e.customMetricData[m.name]);
        rows.push({ label: toTitle(m.name), tw: avg(vals(p1)), lw: avg(vals(p2)), fmt: v => v.toFixed(1), suffix: '/10' });
    });

    // Per exercise type
    logData.types.forEach(type => {
        const cat = getTypeCategory(type);
        const forType = w => w.filter(e => e.type === type);
        let tw, lw, fmtFn, suffix;
        if (cat === 'cardio') {
            const unit = completed.find(e => e.type === type && e.distanceUnit)?.distanceUnit || 'km';
            tw = sum(forType(p1).filter(e => e.distance > 0).map(e => e.distance));
            lw = sum(forType(p2).filter(e => e.distance > 0).map(e => e.distance));
            fmtFn = v => v.toFixed(1); suffix = unit;
        } else if (cat === 'gym') {
            const unit = completed.find(e => e.type === type && e.weightUnit)?.weightUnit || 'kg';
            tw = avg(forType(p1).filter(e => e.weight > 0).map(e => e.weight));
            lw = avg(forType(p2).filter(e => e.weight > 0).map(e => e.weight));
            fmtFn = v => v.toFixed(1); suffix = unit;
        } else if (cat === 'bodyweight') {
            tw = sum(forType(p1).filter(e => e.reps > 0).map(e => e.reps));
            lw = sum(forType(p2).filter(e => e.reps > 0).map(e => e.reps));
            fmtFn = v => Math.round(v).toString(); suffix = 'reps';
        } else if (cat === 'time') {
            tw = sum(forType(p1).filter(e => e.duration > 0).map(e => e.duration));
            lw = sum(forType(p2).filter(e => e.duration > 0).map(e => e.duration));
            fmtFn = v => Math.round(v).toString(); suffix = 'min';
        } else if (cat === 'other') {
            tw = avg(forType(p1).filter(e => e.otherRating > 0).map(e => e.otherRating));
            lw = avg(forType(p2).filter(e => e.otherRating > 0).map(e => e.otherRating));
            fmtFn = v => v.toFixed(1); suffix = '/10';
        }
        if (tw != null || lw != null) {
            rows.push({ label: toTitle(type), tw, lw, fmt: fmtFn, suffix });
        }
    });

    if (rows.length === 0) {
        el.innerHTML = `<p class="neutral-msg" style="padding:10px 0">Log some data to see comparisons here.</p>`;
        return;
    }

    el.innerHTML = `
        <div class="compare-header"><span></span><span>Last 10 days</span><span>Prior 10 days</span></div>
        ${rows.map(r => {
            const fmtVal = v => (v == null) ? '—' : `${r.fmt(v)}<span class="compare-unit"> ${r.suffix}</span>`;
            const twStr = fmtVal(r.tw);
            const lwStr = fmtVal(r.lw);
            const up = r.tw != null && r.lw != null && r.tw > r.lw;
            const dn = r.tw != null && r.lw != null && r.tw < r.lw;
            const arrow = up ? '<span class="compare-arrow up">↑</span>' : dn ? '<span class="compare-arrow down">↓</span>' : '';
            return `<div class="compare-row">
                <span class="compare-label">${r.label}</span>
                <span class="compare-this">${twStr}${arrow}</span>
                <span class="compare-last">${lwStr}</span>
            </div>`;
        }).join('')}
    `;
};

const renderDistanceChart = (completed) => {
    destroyChart('distance');
    const canvas = document.getElementById('chartDistance');
    if (!canvas) return;

    const weeks = {};
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 91);
    completed
        .filter(e => e.distance && new Date(e.date) >= cutoff)
        .forEach(e => {
            const w = getWeekStart(e.date);
            weeks[w] = (weeks[w] || 0) + e.distance;
        });

    const sorted = Object.keys(weeks).sort();
    if (sorted.length < 1) {
        canvas.style.display = 'none';
        const msg = document.createElement('p');
        msg.className = 'neutral-msg';
        msg.style.padding = '10px 0';
        msg.textContent = 'Log distance for Distance-type activities to see this chart.';
        canvas.parentElement.appendChild(msg);
        return;
    }

    const distUnit = completed.find(e=>e.distanceUnit)?.distanceUnit || 'km';
    const labels = sorted.map(w => new Date(w).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }));
    const data = sorted.map(w => +weeks[w].toFixed(1));

    chartInstances['distance'] = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{ label: `Distance (${distUnit})`, data, backgroundColor: 'rgba(255,85,0,0.75)', borderRadius: 4, borderSkipped: false }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } } },
                x: { grid: { display: false }, ticks: { font: { size: 11 }, maxTicksLimit: 18, maxRotation: 45 } }
            }
        }
    });
};

// --- CORE RENDERING MATRIX ENGINE ---
const renderMatrix = () => {
    const body = document.getElementById('matrixBody');
    const header = document.getElementById('headerRow');
    if (!body || !header) return;

    renderWeekStrapline();

    const sortedTypes = [...logData.types];

    let headerHTML = `<th class="col-date">Date</th><th class="col-stat">Notes</th>`;
    logData.customMetrics.forEach(m => { headerHTML += `<th class="col-stat">${m.name.replace(/-/g, ' ')}</th>`; });
    sortedTypes.forEach(t => { headerHTML += `<th class="dynamic-type-th cat-${getTypeCategory(t)}">${t}</th>`; });
    header.innerHTML = headerHTML;

    const entriesByDate = {};
    logData.entries.forEach(e => {
        if (!entriesByDate[e.date]) entriesByDate[e.date] = { customVals: {}, exercises: {} };
        if (!e.isPlanned && e.customMetricData) Object.assign(entriesByDate[e.date].customVals, e.customMetricData);
        if (e.type !== "NONE") {
            if (!entriesByDate[e.date].exercises[e.type]) entriesByDate[e.date].exercises[e.type] = [];
            entriesByDate[e.date].exercises[e.type].push(e);
        }
    });

    // Carry forward metrics flagged for roll-forward (number type always; slider with carryForward:true opt-in)
    const rollForwardMetrics = logData.customMetrics.filter(m => m.type === 'number' || m.carryForward === true).map(m => m.name);
    if (rollForwardMetrics.length) {
        const todayStr = new Date().toISOString().split('T')[0];
        const ascDates = Object.keys(entriesByDate).sort((a, b) => new Date(a) - new Date(b));
        const lastVal = {};
        ascDates.forEach(dateKey => {
            const dayData = entriesByDate[dateKey];
            const hasCompleted = Object.values(dayData.exercises).some(arr => arr.some(e => !e.isPlanned));
            const isPast = dateKey <= todayStr;
            rollForwardMetrics.forEach(name => {
                const explicit = dayData.customVals[name];
                if (explicit !== undefined && explicit !== null && explicit !== '') {
                    lastVal[name] = explicit;
                } else if ((hasCompleted || isPast) && lastVal[name] !== undefined) {
                    dayData.customVals[name] = lastVal[name];
                    (dayData.customValsCarried = dayData.customValsCarried || {})[name] = true;
                }
            });
        });
    }

    const dates = Object.keys(entriesByDate).sort((a,b) => new Date(b) - new Date(a));
    const firstDate = dates.length > 0 ? new Date(dates[dates.length-1]) : new Date();
    const futureBuffer = new Date(); futureBuffer.setDate(futureBuffer.getDate() + 5);
    const latestEntryDate = dates.length > 0 ? new Date(dates[0]) : null;
    if (latestEntryDate && latestEntryDate > futureBuffer) futureBuffer.setTime(latestEntryDate.getTime());

    const emitWeekSummary = (acc, weekId, monthGroupId = null) => {
        if (acc.days === 0) return '';
        const monDate = new Date(getWeekStart(weekId));
        const weekLabel = monDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        const weekTheme = getThemeForDate(weekId);
        const themeLabel = weekTheme ? `<div class="plan-note">${weekTheme.title}</div>` : '';
        const monthAttrs = monthGroupId ? ` data-month="${monthGroupId}" data-weekid="${weekId}" style="display:none"` : '';
        let html = `<tr class="week-summary-row"${monthAttrs} onclick="window.toggleWeek('${weekId}')" title="Click to expand/collapse">
            <td class="col-date week-summary-label"><span class="week-toggle-icon" id="icon-${weekId}">▶</span> ${weekLabel} →${themeLabel}</td>
            <td class="col-stat"></td>`;

        logData.customMetrics.forEach(m => {
            const vals = acc.customVals[m.name] || [];
            let cell = '';
            if (vals.length) {
                if (m.type === 'slider') cell = (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1);
                else if (m.type === 'timedistance') { const count = vals.filter(v => v && (v.time || v.distance)).length; cell = count > 0 ? `${count}d` : ''; }
                else if (m.type === 'number') cell = `${vals[0]}`;
                else if (m.type === 'duration') { const total = vals.reduce((a,b)=>a+(+b||0),0); cell = total > 0 ? fmtDuration(total) : ''; }
                else { const count = vals.filter(v=>v===true).length; cell = count > 0 ? `${count}d` : ''; }
            }
            html += `<td class="col-stat">${cell}</td>`;
        });

        sortedTypes.forEach(type => {
            const count = acc.typeDays[type] || 0;
            const m = acc.typeMetric?.[type];
            let cell = count > 0 ? count + 'd' : '';
            if (m && (m.values.length > 0 || (m.timeValues && m.timeValues.length > 0))) {
                const cat = getTypeCategory(type);
                const fmt = (n) => n % 1 === 0 ? n : n.toFixed(1);
                if (cat === 'pacing') {
                    if (m.values.length > 0) cell += ` · ${fmt(m.values.reduce((a,b)=>a+b,0))}${m.unit}`;
                    if (m.timeValues.length > 0) cell += ` · ${fmt(m.timeValues.reduce((a,b)=>a+b,0))}min`;
                } else if (m.values.length > 0) {
                    const total = m.values.reduce((a,b)=>a+b,0);
                    const avg = total / m.values.length;
                    if (cat === 'other') cell += ` · ${fmt(avg)}${m.unit}`;
                    else cell += ` · ${fmt(total)}${m.unit}`;
                }
            }
            html += `<td>${cell}</td>`;
        });

        html += `</tr>`;
        return html;
    };

    const freshAcc = () => ({
        days: 0,
        customVals: Object.fromEntries(logData.customMetrics.map(m => [m.name, []])),
        typeDays: Object.fromEntries(sortedTypes.map(t => [t, 0])),
        typeMetric: Object.fromEntries(sortedTypes.map(t => [t, { values: [], unit: '', timeValues: [] }])),
    });

    body.innerHTML = "";
    let weekAcc = freshAcc();
    let weekId = null;
    let weekRowsHTML = '';
    let allHTML = '';
    let firstWeekId = null;
    let dayCounter = 0;
    const currentWeekStart = getWeekStart(new Date().toISOString().split('T')[0]);
    const expandWeekIds = new Set();

    // Month grouping: weeks whose Monday is older than the previous month get collapsed under a month header
    const _now = new Date();
    const _prevMonthDate = new Date(_now.getFullYear(), _now.getMonth() - 1, 1);
    const prevYM = `${_prevMonthDate.getFullYear()}-${String(_prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
    let oldMonthGroupYM = null;
    let oldMonthGroupId = null;
    let currentWeekMonthGroupId = null;
    // Per-month accumulator (buffered until all weeks in the month are processed)
    let monthAccData = null;
    let currentOldMonthBufferYM = null;
    let monthWeeksBuffer = '';

    const freshMonthAcc = () => ({
        customVals: Object.fromEntries(logData.customMetrics.map(m => [m.name, []])),
        typeDays: Object.fromEntries(sortedTypes.map(t => [t, 0])),
        typeMetric: Object.fromEntries(sortedTypes.map(t => [t, { values: [], unit: '', timeValues: [] }])),
    });

    const mergeWeekIntoMonth = wkAcc => {
        if (!monthAccData) monthAccData = freshMonthAcc();
        logData.customMetrics.forEach(m => monthAccData.customVals[m.name].push(...(wkAcc.customVals[m.name] || [])));
        sortedTypes.forEach(t => {
            monthAccData.typeDays[t] = (monthAccData.typeDays[t] || 0) + (wkAcc.typeDays[t] || 0);
            if (wkAcc.typeMetric?.[t] && monthAccData.typeMetric?.[t]) {
                monthAccData.typeMetric[t].values.push(...wkAcc.typeMetric[t].values);
                monthAccData.typeMetric[t].timeValues.push(...(wkAcc.typeMetric[t].timeValues || []));
                if (wkAcc.typeMetric[t].unit) monthAccData.typeMetric[t].unit = wkAcc.typeMetric[t].unit;
            }
        });
    };

    const flushMonthGroup = () => {
        if (!monthAccData || !currentOldMonthBufferYM) return '';
        const mgId = `month-${currentOldMonthBufferYM}`;
        const [yr, mo] = currentOldMonthBufferYM.split('-');
        const monthDate = new Date(+yr, +mo - 1, 1);
        const monthLabel = monthDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
        let html = `<tr class="month-summary-row" onclick="window.toggleMonth('${mgId}')"><td class="col-date month-summary-label"><span class="week-toggle-icon" id="icon-${mgId}">▶</span> ${monthLabel}</td><td class="col-stat"></td>`;
        logData.customMetrics.forEach(m => {
            const vals = monthAccData.customVals[m.name] || [];
            let cell = '';
            if (vals.length) {
                if (m.type === 'slider') cell = (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1);
                else if (m.type === 'timedistance') { const cnt = vals.filter(v=>v&&(v.time||v.distance)).length; cell = cnt > 0 ? `${cnt}d` : ''; }
                else if (m.type === 'number') cell = `${vals[0]}`;
                else if (m.type === 'duration') { const tot = vals.reduce((a,b)=>a+(+b||0),0); cell = tot > 0 ? fmtDuration(tot) : ''; }
                else { const cnt = vals.filter(v=>v===true).length; cell = cnt > 0 ? `${cnt}d` : ''; }
            }
            html += `<td class="col-stat">${cell}</td>`;
        });
        sortedTypes.forEach(type => {
            const count = monthAccData.typeDays[type] || 0;
            const tm = monthAccData.typeMetric?.[type];
            let cell = count > 0 ? count + 'd' : '';
            if (tm && (tm.values.length > 0 || (tm.timeValues && tm.timeValues.length > 0))) {
                const cat = getTypeCategory(type);
                const fmt = n => n % 1 === 0 ? n : n.toFixed(1);
                if (cat === 'pacing') {
                    if (tm.values.length > 0) cell += ` · ${fmt(tm.values.reduce((a,b)=>a+b,0))}${tm.unit}`;
                    if (tm.timeValues.length > 0) cell += ` · ${fmt(tm.timeValues.reduce((a,b)=>a+b,0))}min`;
                } else if (tm.values.length > 0) {
                    const tot = tm.values.reduce((a,b)=>a+b,0);
                    cell += ` · ${fmt(cat === 'other' ? tot / tm.values.length : tot)}${tm.unit}`;
                }
            }
            html += `<td>${cell}</td>`;
        });
        html += `</tr>` + monthWeeksBuffer;
        monthAccData = null; monthWeeksBuffer = ''; currentOldMonthBufferYM = null;
        return html;
    };

    const hideFuture = localStorage.getItem('hideFuturePlans') === '1';
    const todayKey = new Date().toISOString().split('T')[0];

    for (let d = new Date(futureBuffer); d >= firstDate; d.setDate(d.getDate() - 1)) {
        const dateKey = d.toISOString().split('T')[0];
        const dayOfWeek = d.getDay();
        const dayData = entriesByDate[dateKey];
        if (!dayData && d > new Date()) continue;
        if (hideFuture && dateKey > todayKey) continue;

        if (!weekId) {
            weekId = dateKey;
            if (!firstWeekId) firstWeekId = weekId;
            if (getWeekStart(weekId) >= currentWeekStart) expandWeekIds.add(weekId);
            // Determine if this week belongs to an old month group
            const wkMon = new Date(getWeekStart(weekId));
            const wkYM = `${wkMon.getFullYear()}-${String(wkMon.getMonth() + 1).padStart(2, '0')}`;
            if (wkYM < prevYM) {
                if (wkYM !== oldMonthGroupYM) { oldMonthGroupYM = wkYM; oldMonthGroupId = `month-${wkYM}`; }
                currentWeekMonthGroupId = oldMonthGroupId;
            } else {
                currentWeekMonthGroupId = null;
            }
        }

        const activeData = dayData || { customVals: {}, exercises: {} };
        const dayName = d.toLocaleDateString('en-GB', { weekday: 'short' });
        const dateNum = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        const dateYear = `'${String(d.getFullYear()).slice(2)}`;
        const displayDate = `<span class="date-day">${dayName}</span> <span class="date-num">${dateNum} <span class="date-year">${dateYear}</span></span>`;
        const dayTheme = getThemeForDate(dateKey);
        const dayThemeLabel = dayTheme ? `<div class="day-theme-tag">${dayTheme.title}</div>` : '';

        weekAcc.days++;
        logData.customMetrics.forEach(m => {
            const v = activeData.customVals[m.name];
            if (v !== undefined && v !== null) weekAcc.customVals[m.name].push(v);
        });
        sortedTypes.forEach(type => {
            const ex = activeData.exercises[type];
            const doneEntries = ex ? ex.filter(e => !e.isPlanned) : [];
            if (doneEntries.length) {
                weekAcc.typeDays[type]++;
                if (weekAcc.typeMetric[type]) {
                    const cat = getTypeCategory(type);
                    doneEntries.forEach(done => {
                        if (cat === 'cardio' && done.distance) { weekAcc.typeMetric[type].values.push(done.distance); weekAcc.typeMetric[type].unit = done.distanceUnit || 'km'; }
                        else if (cat === 'bodyweight' && done.reps) { weekAcc.typeMetric[type].values.push(done.reps); weekAcc.typeMetric[type].unit = 'reps'; }
                        else if (cat === 'gym' && done.weight) { weekAcc.typeMetric[type].values.push(done.weight); weekAcc.typeMetric[type].unit = done.weightUnit || 'kg'; }
                        else if (cat === 'time' && done.duration) { weekAcc.typeMetric[type].values.push(done.duration); weekAcc.typeMetric[type].unit = 'min'; }
                        else if (cat === 'other' && done.otherRating) { weekAcc.typeMetric[type].values.push(done.otherRating); weekAcc.typeMetric[type].unit = '/10'; }
                        else if (cat === 'pacing') {
                            if (done.distance) { weekAcc.typeMetric[type].values.push(done.distance); weekAcc.typeMetric[type].unit = done.distanceUnit || 'km'; }
                            if (done.duration) { weekAcc.typeMetric[type].timeValues.push(done.duration); }
                        }
                    });
                }
            }
        });

        dayCounter++;
        const altClass = dayCounter % 2 === 0 ? ' alt-row' : '';
        const todayClass = dateKey === todayKey ? ' today-row' : '';
        const noteText = (logData.dailyNotes && logData.dailyNotes[dateKey]) || '';
        const noteCell = noteText
            ? `<div class="plan-note" title="${noteText.replace(/"/g, '&quot;')}">${noteText}</div>`
            : `<div class="cell-empty">+</div>`;
        let row = `<tr class="week-day-row${altClass}${todayClass}" data-week="${weekId}"${currentWeekMonthGroupId ? ` data-month="${currentWeekMonthGroupId}"` : ''} style="display:none">
            <td class="col-date">${displayDate}${dayThemeLabel}</td>
            <td class="col-stat editable-cell" onclick="window.openNoteEdit(event,'${dateKey}')">${noteCell}</td>`;

        logData.customMetrics.forEach(m => {
            const mVal = activeData.customVals[m.name];
            let cellContent = "";
            const isCarried = (m.type === 'number' || m.carryForward === true) && activeData.customValsCarried?.[m.name];
            if (m.type === 'timedistance' && mVal && (mVal.time || mVal.distance)) {
                cellContent = `<div class="dist-label">${mVal.time ? mVal.time + 'min' : ''}${mVal.time && mVal.distance ? ' / ' : ''}${mVal.distance ? mVal.distance + 'km' : ''}</div>`;
            } else if (m.type === 'duration' && mVal !== undefined && mVal !== null && mVal !== '') {
                const fmtd = fmtDuration(mVal);
                cellContent = fmtd ? `<div class="dist-label">${fmtd}</div>` : `<div class="cell-empty">+</div>`;
            } else if (m.type === 'number' && mVal !== undefined && mVal !== null && mVal !== '') {
                cellContent = `<div class="dist-label${isCarried ? ' carried-value' : ''}" title="${isCarried ? 'Carried forward from a previous entry' : ''}">${mVal}</div>`;
            } else if (mVal !== undefined && mVal !== null) {
                if (m.type === 'slider' || m.type === 'slider100') {
                    const scale = m.scale || (m.type === 'slider100' ? 100 : 10);
                    const pct = mVal / scale;
                    const pillCls = pct >= 0.7 ? 'pill-green' : pct >= 0.4 ? 'pill-amber' : 'pill-red';
                    cellContent = `<div class="happy-pill ${pillCls}"${isCarried ? ' style="opacity:0.4" title="Carried forward"' : ''}>${mVal}</div>`;
                } else {
                    cellContent = mVal ? '✅' : '❌';
                }
            } else {
                cellContent = `<div class="cell-empty">+</div>`;
            }
            if (m.type === 'binary') {
                row += `<td class="col-stat editable-cell" onclick="window.toggleBinaryCell('${dateKey}','${m.name}',${mVal === true})">${cellContent}</td>`;
            } else if (m.type === 'timedistance') {
                row += `<td class="col-stat editable-cell" onclick="window.promptTimeDistance('${dateKey}','${m.name}',${mVal && mVal.time != null ? `'${mVal.time}'` : 'null'},${mVal && mVal.distance != null ? `'${mVal.distance}'` : 'null'})">${cellContent}</td>`;
            } else if (m.type === 'duration') {
                row += `<td class="col-stat editable-cell" onclick="window.promptDuration('${dateKey}','${m.name}',${mVal !== undefined && mVal !== null && mVal !== '' ? mVal : 'null'})">${cellContent}</td>`;
            } else if (m.name === 'SLEEP') {
                row += `<td class="col-stat editable-cell" onclick="window.promptSleepScore('${dateKey}')">${cellContent}</td>`;
            } else if (m.type === 'number') {
                row += `<td class="col-stat editable-cell" onclick="window.promptNumberValue('${dateKey}','metric-${m.name}',${!isCarried && mVal !== undefined && mVal !== null && mVal !== '' ? mVal : 'null'})">${cellContent}</td>`;
            } else if (m.scale === 100) {
                row += `<td class="col-stat editable-cell" onclick="window.promptCellValue('${dateKey}','metric-${m.name}',${mVal !== undefined && mVal !== null ? mVal : 'null'},100)">${cellContent}</td>`;
            } else {
                row += `<td class="col-stat editable-cell" onclick="window.openCellEdit(event,'${dateKey}','metric-${m.name}',${mVal !== undefined && mVal !== null ? mVal : 'null'})">${cellContent}</td>`;
            }
        });

        sortedTypes.forEach(type => {
            const exercises = activeData.exercises[type] || [];
            const cat = getTypeCategory(type);
            const doneEntries = exercises.filter(e => !e.isPlanned);
            const plannedEntries = exercises.filter(e => e.isPlanned);
            let displaySymbol = '';
            if (doneEntries.length) {
                const totalLabel = aggregateExerciseLabel(doneEntries, cat);
                const distLabel = totalLabel ? `<div class="dist-label">${totalLabel}</div>` : '';
                const ticksHTML = doneEntries.map(exercise => `<div class="tick-cell done cat-${cat}" onclick="window.editEntry(${exercise.id})">✓</div>`).join('');
                displaySymbol += `<div class="entry-group"><div class="tick-row">${ticksHTML}</div>${distLabel}</div>`;
            }
            plannedEntries.forEach(exercise => {
                const noteText = (exercise.details || '').trim();
                const noteLabel = noteText ? `<div class="plan-note" title="${noteText.replace(/"/g, '&quot;')}">${noteText}</div>` : '';
                displaySymbol += `<div class="entry-group"><div class="tick-cell plan cat-${cat}" title="View plan details" onclick="window.editEntry(${exercise.id})">?</div>${noteLabel}</div>`;
            });
            displaySymbol += `<div class="add-entry-btn" data-quick-date="${dateKey}" data-quick-type="${type}">+</div>`;
            row += `<td class="${exercises.length ? 'multi-type-cell' : 'empty-type-cell'}">${displaySymbol}</td>`;
        });
        weekRowsHTML += row + `</tr>`;

        if (dayOfWeek === 1) {
            const weekHtml = emitWeekSummary(weekAcc, weekId, currentWeekMonthGroupId) + weekRowsHTML;
            if (currentWeekMonthGroupId) {
                const wkYM = currentWeekMonthGroupId.replace('month-', '');
                if (wkYM !== currentOldMonthBufferYM) {
                    allHTML += flushMonthGroup();
                    currentOldMonthBufferYM = wkYM;
                    monthAccData = freshMonthAcc();
                    monthWeeksBuffer = '';
                }
                mergeWeekIntoMonth(weekAcc);
                monthWeeksBuffer += weekHtml;
            } else {
                allHTML += flushMonthGroup();
                allHTML += weekHtml + `<tr style="height:16px;"><td colspan="100"></td></tr>`;
            }
            weekAcc = freshAcc(); weekId = null; weekRowsHTML = ''; currentWeekMonthGroupId = null;
        }
    }
    if (weekAcc.days > 0) {
        const weekHtml = emitWeekSummary(weekAcc, weekId, currentWeekMonthGroupId) + weekRowsHTML;
        if (currentWeekMonthGroupId) {
            const wkYM = currentWeekMonthGroupId.replace('month-', '');
            if (wkYM !== currentOldMonthBufferYM) {
                allHTML += flushMonthGroup();
                currentOldMonthBufferYM = wkYM;
                monthAccData = freshMonthAcc();
                monthWeeksBuffer = '';
            }
            mergeWeekIntoMonth(weekAcc);
            monthWeeksBuffer += weekHtml;
        } else {
            allHTML += flushMonthGroup();
            allHTML += weekHtml;
        }
    }
    allHTML += flushMonthGroup();
    body.innerHTML = allHTML;
    expandWeekIds.forEach(wid => window.toggleWeek(wid));
    if (expandWeekIds.size === 0 && firstWeekId) window.toggleWeek(firstWeekId);

    body.onclick = (e) => {
        const btn = e.target.closest('.add-entry-btn[data-quick-date]');
        if (!btn) return;
        window.quickAddEntry(btn.dataset.quickDate, btn.dataset.quickType);
    };
};

// --- STRAVA INTEGRATION ---
const STRAVA_CLIENT_ID = '255843';
const STRAVA_REDIRECT  = 'https://traininglog.app/strava-callback.html';
const STRAVA_SCOPE     = 'activity:read_all';

const updateStravaButton = async () => {
    const btn = document.getElementById('stravaBtn');
    if (!btn || !auth.currentUser) return;
    const snap = await getDoc(doc(db, 'strava', auth.currentUser.uid));
    _stravaConnected = snap.exists();
    if (snap.exists()) {
        btn.textContent = '✓ Strava';
        btn.onclick = () => window.showStravaActivity();
    } else {
        btn.textContent = 'Connect Strava';
        btn.onclick = () => window.handleStravaConnect();
    }
};

window.handleStravaConnect = () => {
    const url = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(STRAVA_REDIRECT)}&response_type=code&scope=${STRAVA_SCOPE}`;
    window.location.href = url;
};

window.showStravaActivity = async () => {
    const body = document.getElementById('stravaModalBody');
    body.innerHTML = '<p class="neutral-msg" style="padding:20px 0; text-align:center">Fetching latest activity...</p>';
    document.getElementById('stravaModal').style.display = 'flex';

    try {
        const fn = httpsCallable(functions, 'stravaLatestActivity');
        const result = await fn();
        const a = result.data.activity;

        if (!a) {
            body.innerHTML = '<p class="neutral-msg" style="padding:20px 0; text-align:center">No activities found on Strava.</p>';
            return;
        }

        const duration = a.duration ? `${Math.floor(a.duration/60)}m` : '';
        const dist     = a.distance ? `${a.distance} km` : '';
        const elev     = a.elevation ? `${a.elevation}m elevation` : '';
        const details  = [dist, duration, elev].filter(Boolean).join(' · ');

        body.innerHTML = `
            <div class="strava-activity-card">
                <div class="strava-type">${a.type}</div>
                <div class="strava-name">${a.name}</div>
                <div class="strava-date">${new Date(a.date).toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' })}</div>
                <div class="strava-details">${details}</div>
            </div>
            <button class="btn-submit" onclick="window.logStravaActivity(${JSON.stringify(a).split('"').join('&quot;')})">Log this activity</button>
            <button class="btn-delete" style="margin-top:8px" onclick="window.disconnectStrava()">Disconnect Strava</button>
        `;
    } catch (e) {
        body.innerHTML = `<p class="neutral-msg" style="padding:20px 0; text-align:center">Error: ${e.message}</p>`;
    }
};

window.logStravaActivity = (activity) => {
    window.closeModal('stravaModal');
    // Match Strava type to a local type if possible
    const stravaTypeMap = { Run:'RUN', Ride:'CYCLE', Swim:'SWIM', Walk:'WALK', Yoga:'YOGA', WeightTraining:'GYM' };
    const matchedType = stravaTypeMap[activity.type] || activity.type.toUpperCase();
    const typeExists = logData.types.includes(matchedType);

    document.getElementById('modalDate').value = activity.date;
    document.getElementById('modalDetails').value = activity.name || '';
    window.setStrategy(false);
    buildCustomMetricsFormUI();
    const typeSelect = document.getElementById('modalType');
    typeSelect.innerHTML = `<option value="NONE">No Category Allocation</option>` + logData.types.map(t => `<option value="${t}" ${t === matchedType ? 'selected' : ''}>${t}</option>`).join('');
    if (activity.distance) {
        document.getElementById('modalDistance').value = activity.distance;
        document.getElementById('modalDistanceUnit').value = 'km';
    }
    if (activity.duration) {
        document.getElementById('modalDuration').value = Math.round(activity.duration / 60);
    }
    window.selectMark(2);
    document.getElementById('inputModal').style.display = 'flex';
    window.toggleDistanceRow();
};

window.disconnectStrava = async () => {
    if (!confirm('Disconnect Strava?')) return;
    const fn = httpsCallable(functions, 'stravaDisconnect');
    await fn();
    updateStravaButton();
    window.closeModal('stravaModal');
};

// --- GENERAL CLOSURES & UTILITIES ---
const catOptions = (selected) => TYPE_CATEGORIES.map(c => `<option value="${c.value}" ${c.value === selected ? 'selected' : ''}>${c.label}</option>`).join('');

window.showTypeModal = () => {
    const container = document.getElementById('typeList');
    container.innerHTML = logData.types.map((type, idx) => `
        <div class="type-item" style="display:flex; gap:8px; margin-bottom:8px; align-items:center;">
            <div class="reorder-btns">
                <button onclick="window.moveType(${idx},-1)" class="reorder-btn" ${idx === 0 ? 'disabled' : ''}>▲</button>
                <button onclick="window.moveType(${idx},1)" class="reorder-btn" ${idx === logData.types.length - 1 ? 'disabled' : ''}>▼</button>
            </div>
            <input type="text" value="${type}" id="type-input-${idx}" style="flex:1;">
            <select id="type-cat-${idx}" style="width:110px; padding:6px; border-radius:8px; border:1px solid var(--border); font-size:0.75rem;">${catOptions(getTypeCategory(type))}</select>
            <button onclick="window.renameType(${idx})" class="nav-btn btn-secondary" style="font-size:0.65rem; padding:4px 10px;">Save</button>
            <button onclick="window.removeType(${idx})" style="background:#fee2e2; color:#ef4444; font-size:0.65rem; padding:4px 10px;" class="nav-btn">✕</button>
        </div>`).join('');
    document.getElementById('typeModal').style.display = 'flex';
};

window.moveType = async (idx, dir) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= logData.types.length) return;
    [logData.types[idx], logData.types[newIdx]] = [logData.types[newIdx], logData.types[idx]];
    await setDoc(doc(db, "logs", LOG_ID), logData);
    window.showTypeModal();
    renderMatrix();
};
window.addType = async () => {
    const input = document.getElementById('newTypeInput');
    const catSel = document.getElementById('newTypeCat');
    const val = input.value.toUpperCase().trim();
    if (val && !logData.types.includes(val)) {
        logData.types.push(val);
        logData.typeCategories[val] = catSel.value;
        await setDoc(doc(db, "logs", LOG_ID), logData);
        input.value = ""; window.showTypeModal();
    }
};
window.renameType = async (idx) => {
    const old = logData.types[idx];
    const n = document.getElementById(`type-input-${idx}`).value.toUpperCase().trim();
    const newCat = document.getElementById(`type-cat-${idx}`).value;
    if (!n) return;
    if (n !== old) {
        logData.types[idx] = n;
        logData.typeCategories[n] = newCat;
        delete logData.typeCategories[old];
        logData.entries = logData.entries.map(e => e.type === old ? { ...e, type: n } : e);
    } else {
        logData.typeCategories[n] = newCat;
    }
    await setDoc(doc(db, "logs", LOG_ID), logData);
    window.showTypeModal();
};
window.removeType = async (idx) => {
    if (confirm(`Delete Category?`)) {
        logData.types.splice(idx, 1);
        await updateDoc(doc(db, "logs", LOG_ID), { types: logData.types });
        window.showTypeModal();
    }
};
const updateHeaderOffset = () => {
    const h = document.querySelector('.app-header')?.offsetHeight || 65;
    document.documentElement.style.setProperty('--header-h', h + 'px');
};
window.addEventListener('load', updateHeaderOffset);
window.addEventListener('resize', updateHeaderOffset);

window.closeModal = (id) => { document.getElementById(id).style.display = 'none'; };

// --- CELL EDIT POPOVER ---
const closeCellPopover = () => { document.getElementById('cellPopover').style.display = 'none'; };
document.addEventListener('click', (e) => { if (!e.target.closest('.cell-popover') && !e.target.closest('.editable-cell')) closeCellPopover(); });

window.openCellEdit = (e, dateKey, field, currentVal) => {
    e.stopPropagation();
    const popover = document.getElementById('cellPopover');
    const content = document.getElementById('cellPopoverContent');
    const rect = e.currentTarget.getBoundingClientRect();

    const buttons = [1,2,3,4,5,6,7,8,9,10].map(n =>
        `<button class="pop-btn ${n === currentVal ? 'pop-btn-active' : ''}" onclick="window.saveCellValue('${dateKey}','${field}',${n})">${n}</button>`
    ).join('');

    const label = field.replace('metric-','').replace(/-/g,' ');
    content.innerHTML = `<div class="pop-label">${label}</div><div class="pop-btns">${buttons}</div>`;

    popover.style.display = 'block';
    const pw = popover.offsetWidth;
    let left = rect.left + rect.width / 2 - pw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    let top = rect.bottom + 6;
    if (top + popover.offsetHeight > window.innerHeight - 8) top = rect.top - popover.offsetHeight - 6;
    popover.style.left = left + 'px';
    popover.style.top = top + 'px';
};

window.promptTimeDistance = async (dateKey, metricName, currentTime, currentDist) => {
    const timeInput = prompt(`${metricName.replace(/-/g,' ')} — time (minutes):`, currentTime !== null ? currentTime : '');
    if (timeInput === null) return;
    const distInput = prompt(`${metricName.replace(/-/g,' ')} — distance (km):`, currentDist !== null ? currentDist : '');
    if (distInput === null) return;

    let record = logData.entries.find(e => e.date === dateKey && !e.isPlanned && e.type === 'NONE');
    if (!record) {
        record = { id: Date.now(), date: dateKey, type: 'NONE', isPlanned: false, customMetricData: {} };
        logData.entries.push(record);
    }
    if (!record.customMetricData) record.customMetricData = {};
    const time = timeInput.trim() === '' ? null : parseFloat(timeInput);
    const distance = distInput.trim() === '' ? null : parseFloat(distInput);
    if (time === null && distance === null) {
        delete record.customMetricData[metricName];
    } else {
        record.customMetricData[metricName] = { time, distance };
    }
    renderMatrix();
    await setDoc(doc(db, 'logs', LOG_ID), logData);
};

window.promptCellValue = (dateKey, field, currentVal, max) => {
    const input = prompt(`${field.replace('metric-','').replace(/-/g,' ')} (1-${max}):`, currentVal !== null ? currentVal : '');
    if (input === null) return;
    const num = Math.max(1, Math.min(max, parseInt(input)));
    if (isNaN(num)) return;
    window.saveCellValue(dateKey, field, num);
};

window.promptNumberValue = (dateKey, field, currentVal) => {
    const input = prompt(`${field.replace('metric-','').replace(/-/g,' ')}:`, currentVal !== null ? currentVal : '');
    if (input === null) return;
    if (input.trim() === '') return window.saveCellValue(dateKey, field, null);
    const num = parseFloat(input);
    if (isNaN(num)) return;
    window.saveCellValue(dateKey, field, num);
};

const fmtDuration = mins => {
    const m = Math.round(+mins);
    if (!m || m <= 0) return '';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60), rm = m % 60;
    return rm ? `${h}h ${rm}m` : `${h}h`;
};

window.promptDuration = (dateKey, metricName, currentVal) => {
    const input = prompt(`${metricName.replace(/-/g,' ')} (minutes):`, currentVal != null ? currentVal : '');
    if (input === null) return;
    if (input.trim() === '') return window.saveCellValue(dateKey, 'metric-' + metricName, null);
    const mins = parseInt(input, 10);
    if (isNaN(mins) || mins < 0) return;
    window.saveCellValue(dateKey, 'metric-' + metricName, mins);
};

let _sleepScoreDateKey = null;
window.promptSleepScore = (dateKey) => {
    _sleepScoreDateKey = dateKey;
    const entry = logData.entries.find(e => e.date === dateKey && !e.isPlanned && e.type === 'NONE');
    const cmd = entry?.customMetricData || {};
    document.getElementById('sleepScoreModalDur').value = cmd['SLEEP_DURATION'] ?? '';
    document.getElementById('sleepScoreModalBed').value = cmd['SLEEP_BEDTIME'] ?? '';
    document.getElementById('sleepScoreModalIntr').value = cmd['SLEEP_INTERRUPTIONS'] ?? '';
    window.updateSleepScoreModal();
    document.getElementById('sleepScoreModal').style.display = 'flex';
};

window.updateSleepScoreModal = () => {
    const d = parseFloat(document.getElementById('sleepScoreModalDur')?.value);
    const b = parseFloat(document.getElementById('sleepScoreModalBed')?.value);
    const i = parseFloat(document.getElementById('sleepScoreModalIntr')?.value);
    const hasAny = !isNaN(d) || !isNaN(b) || !isNaN(i);
    const total = hasAny ? (isNaN(d) ? 0 : d) + (isNaN(b) ? 0 : b) + (isNaN(i) ? 0 : i) : null;
    const el = document.getElementById('sleepModalTotal');
    if (el) el.textContent = total !== null ? total : '–';
};

window.saveSleepScoreFromModal = async () => {
    const dateKey = _sleepScoreDateKey;
    if (!dateKey) return;
    const d = parseFloat(document.getElementById('sleepScoreModalDur').value);
    const b = parseFloat(document.getElementById('sleepScoreModalBed').value);
    const i = parseFloat(document.getElementById('sleepScoreModalIntr').value);
    let record = logData.entries.find(e => e.date === dateKey && !e.isPlanned && e.type === 'NONE');
    if (!record) {
        record = { id: Date.now(), date: dateKey, type: 'NONE', isPlanned: false, customMetricData: {} };
        logData.entries.push(record);
    }
    if (!record.customMetricData) record.customMetricData = {};
    if (!isNaN(d)) record.customMetricData['SLEEP_DURATION'] = Math.min(50, Math.max(0, d));
    else delete record.customMetricData['SLEEP_DURATION'];
    if (!isNaN(b)) record.customMetricData['SLEEP_BEDTIME'] = Math.min(30, Math.max(0, b));
    else delete record.customMetricData['SLEEP_BEDTIME'];
    if (!isNaN(i)) record.customMetricData['SLEEP_INTERRUPTIONS'] = Math.min(20, Math.max(0, i));
    else delete record.customMetricData['SLEEP_INTERRUPTIONS'];
    const hasAny = !isNaN(d) || !isNaN(b) || !isNaN(i);
    if (hasAny) record.customMetricData['SLEEP'] = (isNaN(d)?0:d) + (isNaN(b)?0:b) + (isNaN(i)?0:i);
    else delete record.customMetricData['SLEEP'];
    window.closeModal('sleepScoreModal');
    renderMatrix();
    await setDoc(doc(db, 'logs', LOG_ID), logData);
};

window.saveCellValue = async (dateKey, field, value) => {
    closeCellPopover();
    let record = logData.entries.find(e => e.date === dateKey && !e.isPlanned && e.type === 'NONE');
    if (!record) {
        record = { id: Date.now(), date: dateKey, type: 'NONE', isPlanned: false, customMetricData: {} };
        logData.entries.push(record);
    }
    if (!record.customMetricData) record.customMetricData = {};
    record.customMetricData[field.replace('metric-', '')] = value;
    renderMatrix();
    try {
        await setDoc(doc(db, 'logs', LOG_ID), logData);
    } catch(err) {
        console.error('saveCellValue setDoc failed:', err);
    }
};


window.toggleBinaryCell = async (dateKey, metricName, currentVal) => {
    const newVal = !currentVal;
    let record = logData.entries.find(e => e.date === dateKey && !e.isPlanned && e.type === 'NONE');
    if (!record) {
        record = { id: Date.now(), date: dateKey, type: 'NONE', isPlanned: false, customMetricData: {} };
        logData.entries.push(record);
    }
    if (!record.customMetricData) record.customMetricData = {};
    record.customMetricData[metricName] = newVal;
    renderMatrix();
    await setDoc(doc(db, 'logs', LOG_ID), logData);
};
window.openNoteEdit = (e, dateKey) => {
    e.stopPropagation();
    const popover = document.getElementById('cellPopover');
    const content = document.getElementById('cellPopoverContent');
    const rect = e.currentTarget.getBoundingClientRect();
    const currentNote = (logData.dailyNotes || {})[dateKey] || '';

    const safeNote = currentNote.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const clearBtn = currentNote ? `<button class="pop-btn note-clear-btn" onclick="window.saveNote('${dateKey}','')">Clear</button>` : '';
    content.innerHTML = `
        <div class="pop-label">Daily Note</div>
        <textarea id="noteEditInput" maxlength="140" placeholder="What's on your mind? (140 chars)" rows="3" class="note-edit-textarea">${safeNote}</textarea>
        <div class="note-edit-footer">
            <span id="noteCharCount" class="note-char-count">${currentNote.length}/140</span>
            <div style="display:flex;gap:6px;">${clearBtn}<button class="pop-btn pop-btn-active" onclick="window.saveNote('${dateKey}',document.getElementById('noteEditInput').value)">Save</button></div>
        </div>`;

    popover.style.display = 'block';
    const pw = popover.offsetWidth;
    let left = rect.left + rect.width / 2 - pw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    let top = rect.bottom + 6;
    if (top + popover.offsetHeight > window.innerHeight - 8) top = rect.top - popover.offsetHeight - 6;
    popover.style.left = left + 'px';
    popover.style.top = top + 'px';

    const textarea = document.getElementById('noteEditInput');
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    textarea.addEventListener('input', () => {
        document.getElementById('noteCharCount').textContent = `${textarea.value.length}/140`;
    });
    textarea.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter' && !ke.shiftKey) {
            ke.preventDefault();
            window.saveNote(dateKey, textarea.value);
        }
    });
};

window.saveNote = async (dateKey, text) => {
    closeCellPopover();
    if (!logData.dailyNotes) logData.dailyNotes = {};
    const note = text.trim().slice(0, 140);
    if (note) {
        logData.dailyNotes[dateKey] = note;
    } else {
        delete logData.dailyNotes[dateKey];
    }
    renderMatrix();
    await setDoc(doc(db, 'logs', LOG_ID), logData);
};

window.toggleSettings = () => { document.getElementById('settingsMenu').classList.toggle('open'); };
window.closeSettings = () => { document.getElementById('settingsMenu').classList.remove('open'); };

window.getCalendarUrl = async () => {
    window.closeSettings();
    let token = logData.calendarToken;
    if (!token) {
        token = Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('');
        logData.calendarToken = token;
        await setDoc(doc(db, 'logs', LOG_ID), logData);
    }
    const url = `https://calendarfeed-u6ju5awpxa-uc.a.run.app?token=${token}`;
    try {
        await navigator.clipboard.writeText(url);
        alert(`Calendar URL copied to clipboard!\n\nPaste it into Calendar → File → New Calendar Subscription\n\n${url}`);
    } catch {
        prompt('Copy this URL and subscribe to it in your calendar app:', url);
    }
};
document.addEventListener('click', (e) => { if (!e.target.closest('.settings-dropdown')) window.closeSettings(); });
window.toggleWeek = (weekId) => {
    const rows = document.querySelectorAll(`.week-day-row[data-week="${weekId}"]`);
    const icon = document.getElementById(`icon-${weekId}`);
    const isHidden = rows.length > 0 && rows[0].style.display === 'none';
    rows.forEach(r => {
        r.style.display = isHidden ? '' : 'none';
        if (isHidden) {
            r.classList.remove('row-reveal');
            void r.offsetWidth;
            r.classList.add('row-reveal');
        }
    });
    if (icon) icon.textContent = isHidden ? '▼' : '▶';
};

window.toggleMonth = (mgId) => {
    const icon = document.getElementById('icon-' + mgId);
    const isExpanded = icon && icon.textContent === '▼';
    const summaryRows = document.querySelectorAll(`tr.week-summary-row[data-month="${mgId}"]`);
    if (isExpanded) {
        // Collapse all open weeks inside this month first
        summaryRows.forEach(r => {
            const wId = r.dataset.weekid;
            if (wId) { const wi = document.getElementById('icon-' + wId); if (wi && wi.textContent === '▼') window.toggleWeek(wId); }
        });
    }
    summaryRows.forEach(r => r.style.display = isExpanded ? 'none' : '');
    if (icon) icon.textContent = isExpanded ? '▶' : '▼';
};

const celebrate = () => {
    const el = document.createElement('div');
    el.className = 'celebrate-burst';
    el.textContent = '🎉';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 900);
};
window.selectMark = (v) => { window.tempMark = v; document.querySelectorAll('.rate-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-val') == v)); };

// --- DARK MODE ---
const applyDarkMode = (on) => {
    document.documentElement.setAttribute('data-theme', on ? 'dark' : 'light');
    document.getElementById('darkModeToggleBtn')?.classList.toggle('active', on);
};
window.toggleDarkMode = () => {
    const on = document.documentElement.getAttribute('data-theme') !== 'dark';
    localStorage.setItem('darkMode', on ? '1' : '0');
    applyDarkMode(on);
};
applyDarkMode(localStorage.getItem('darkMode') === '1');

// --- HIDE FUTURE PLANS ---
const applyHideFuture = (on) => {
    document.getElementById('hideFutureToggleBtn')?.classList.toggle('active', on);
};
window.toggleHideFuture = () => {
    const on = localStorage.getItem('hideFuturePlans') !== '1';
    localStorage.setItem('hideFuturePlans', on ? '1' : '0');
    applyHideFuture(on);
    renderMatrix();
};
applyHideFuture(localStorage.getItem('hideFuturePlans') === '1');

// --- IMPORT DATA ---
window.handleImportFile = async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    window.closeSettings();

    let imported;
    try {
        imported = JSON.parse(await file.text());
    } catch (err) {
        return alert('Could not read that file as JSON: ' + err.message);
    }

    if (!Array.isArray(imported.entries)) return alert('That file does not look like a valid TrainingLog export (missing "entries").');

    if (imported.entries.length === 0 && !confirm(`Warning: this file contains 0 entries. Importing it will erase all your current data. Are you sure?`)) return;

    if (!confirm(`Import this file? It contains ${imported.entries.length} entries and will REPLACE all data currently stored for your account.\n\nA local backup of your current data will be saved first so you can recover if needed.`)) return;

    // Save current data as local backup before overwriting
    saveSnapshot(logData);

    const newData = {
        types: imported.types || [],
        typeCategories: imported.typeCategories || {},
        customMetrics: imported.customMetrics || [],
        entries: imported.entries || [],
        dailyNotes: imported.dailyNotes || {},
        goals: imported.goals || [],
        themes: imported.themes || [],
        trainingPlans: imported.trainingPlans || [],
        tasks: imported.tasks || [],
    };

    try {
        await setDoc(doc(db, "logs", LOG_ID), newData);
        alert('Import successful.');
    } catch (err) {
        alert('Import failed: ' + err.message);
    }
};

// --- IMPORT APPLE HEALTH ---

const RECORD_TYPES_WANTED = new Set(['HKQuantityTypeIdentifierVO2Max', 'HKCategoryTypeIdentifierSleepAnalysis', 'HKQuantityTypeIdentifierBodyMass']);

// Shared flush logic — scans the text buffer for Workout/Record elements.
const makeAHFlusher = (workoutStrings, recordStrings) => {
    let buf = '';
    const dec = new TextDecoder('utf-8');
    const flush = () => {
        let from = 0;
        for (;;) {
            const wPos = buf.indexOf('<Workout ', from), rPos = buf.indexOf('<Record ', from);
            if (wPos < 0 && rPos < 0) break;
            const isW = rPos < 0 || (wPos >= 0 && wPos < rPos), s = isW ? wPos : rPos;
            if (isW) {
                const et = buf.indexOf('</Workout>', s), sc = buf.indexOf('/>', s);
                let end;
                if (et >= 0) end = et + 10;           // full block with children
                else if (sc >= 0) end = sc + 2;       // self-closing <Workout ... />
                else { buf = buf.slice(s); return; }
                workoutStrings.push(buf.slice(s, end)); from = end;
            } else {
                // Records can be self-closing (<Record .../>) or have children (<Record ...>).
                // When filtered through the Python script only the opening line is kept, so
                // we find whichever comes first: /> or the plain > that closes the opening tag.
                const sc = buf.indexOf('/>', s);
                const gt = buf.indexOf('>', s + 7); // end of opening tag
                if (gt < 0) { buf = buf.slice(s); return; }
                const end = (sc >= 0 && sc < gt) ? sc + 2 : gt + 1;
                const str = buf.slice(s, end), m = str.match(/type="([^"]*)"/);
                if (m && RECORD_TYPES_WANTED.has(m[1])) recordStrings.push(str);
                from = end;
            }
        }
        const lw = buf.lastIndexOf('<Workout ', from), lr = buf.lastIndexOf('<Record ', from);
        const l = Math.max(lw, lr);
        buf = l >= from ? buf.slice(l) : '';
    };
    return { flush, dec, append: s => { buf += s; } };
};


const streamHealthDataFromXml = (file, onStatus) => new Promise((resolve, reject) => {
    const workouts = [], records = [];
    const { flush, dec, append } = makeAHFlusher(workouts, records);
    const total = file.size;
    const CHUNK = 4194304; // 4 MB — smaller chunks so iCloud-streamed files show progress incrementally
    let offset = 0;
    const reader = new FileReader();

    reader.onerror = () => reject(reader.error || new Error('File read failed'));

    // fires during the read itself — keeps the percentage moving even if a chunk is slow
    reader.onprogress = e => {
        if (e.lengthComputable && onStatus)
            onStatus(workouts.length, offset - CHUNK + e.loaded, total);
    };

    reader.onload = e => {
        try {
            const isLast = offset >= total;
            append(dec.decode(new Uint8Array(e.target.result), { stream: !isLast }));
            flush();
            if (onStatus) onStatus(workouts.length, offset, total);
            if (isLast) { resolve({ workouts, records }); return; }
            readNext();
        } catch (err) { reject(err); }
    };

    function readNext() {
        const end = Math.min(offset + CHUNK, total);
        const slice = file.slice(offset, end);
        offset = end;
        reader.readAsArrayBuffer(slice);
    }

    readNext();
});

// --- AH IMPORT PROGRESS OVERLAY ---
const showAHProgress = (fileSize) => {
    const totalMb = fileSize ? (fileSize / 1048576).toFixed(0) : '?';
    const isLarge = fileSize > 1073741824; // > 1 GB
    const hint = isLarge
        ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:16px;line-height:1.4;">Large file — make sure export.xml is fully downloaded to your device, not streaming from iCloud.</div>`
        : '';
    const el = document.createElement('div');
    el.id = 'ahProgressOverlay';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:500;';
    el.innerHTML = `
        <div style="background:var(--card);border-radius:24px;padding:32px 28px 28px;width:min(340px,90vw);box-shadow:0 16px 48px rgba(0,0,0,0.4);text-align:center;">
            <div style="font-size:2rem;margin-bottom:8px;">🏃</div>
            <div style="font-weight:700;font-size:1.05rem;color:var(--text);margin-bottom:6px;">Importing Apple Health</div>
            <div id="ahProgPct" style="font-size:2rem;font-weight:800;color:var(--accent);line-height:1;margin-bottom:4px;">0%</div>
            <div id="ahProgStatus" style="font-size:0.8rem;color:var(--text-muted);margin-bottom:20px;min-height:1.2em;">0 of ${totalMb} MB read</div>
            <div style="background:var(--border);border-radius:8px;height:10px;overflow:hidden;">
                <div id="ahProgBar" style="height:100%;background:var(--accent);border-radius:8px;width:0%;transition:width 0.15s linear;"></div>
            </div>
            ${hint}
        </div>`;
    document.body.appendChild(el);
};

const updateAHStatus = (workoutCount, bytesRead, totalBytes) => {
    const pct = totalBytes ? Math.min(100, Math.round((bytesRead / totalBytes) * 100)) : 0;
    const readMb = (bytesRead / 1048576).toFixed(0);
    const totalMb = totalBytes ? (totalBytes / 1048576).toFixed(0) : '?';
    const pctEl = document.getElementById('ahProgPct');
    const statusEl = document.getElementById('ahProgStatus');
    const barEl = document.getElementById('ahProgBar');
    if (pctEl) pctEl.textContent = pct + '%';
    if (barEl) barEl.style.width = pct + '%';
    if (statusEl) {
        const wStr = workoutCount > 0 ? ` · ${workoutCount} workout${workoutCount !== 1 ? 's' : ''}` : '';
        statusEl.textContent = `${readMb} of ${totalMb} MB read${wStr}`;
    }
};

const hideAHProgress = () => document.getElementById('ahProgressOverlay')?.remove();

const AH_TYPE_MAP = {
    'HKWorkoutActivityTypeRunning':                     'RUN',
    'HKWorkoutActivityTypeWalking':                     'WALK',
    'HKWorkoutActivityTypeHiking':                      'HIKE',
    'HKWorkoutActivityTypeCycling':                     'CYCLE',
    'HKWorkoutActivityTypeSwimming':                    'SWIM',
    'HKWorkoutActivityTypeYoga':                        'YOGA',
    'HKWorkoutActivityTypePilates':                     'YOGA',
    'HKWorkoutActivityTypeTraditionalStrengthTraining': 'GYM',
    'HKWorkoutActivityTypeFunctionalStrengthTraining':  'GYM',
    'HKWorkoutActivityTypeCrossTraining':               'GYM',
    'HKWorkoutActivityTypeHighIntensityIntervalTraining':'GYM',
    'HKWorkoutActivityTypeElliptical':                  'GYM',
    'HKWorkoutActivityTypeStairClimbing':               'GYM',
    'HKWorkoutActivityTypeMixedCardio':                 'GYM',
    'HKWorkoutActivityTypeBoxing':                      'GYM',
    'HKWorkoutActivityTypeRowing':                      'GYM',
    'HKWorkoutActivityTypeDance':                       'GYM',
};

window.handleAppleHealthImport = async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    window.closeSettings();

    // attr() extracts an XML attribute value from a raw element string
    const attr = (str, name) => { const m = str.match(new RegExp(name + '="([^"]*)"')); return m ? m[1] : ''; };

    showAHProgress(file.size);

    let result;
    try {
        result = await streamHealthDataFromXml(file, updateAHStatus);
    } catch (err) {
        hideAHProgress();
        return alert('Could not read the file: ' + err.message);
    }
    hideAHProgress();

    const { workouts: workoutStrings, records } = result;
    const recordStrings = records;
    if (!workoutStrings.length) return alert('No workouts found. Make sure you selected the export.xml file from your Apple Health export.');
    const rawWorkouts = workoutStrings;
    const useAttr = attr;

    const existingKeys = new Set(logData.entries.filter(e => !e.isPlanned).map(e => `${e.date}__${e.type}`));
    const newEntries = [];
    let skippedExisting = 0;
    const unmappedTypes = new Set();
    const seenKeys = new Set(existingKeys);
    const ts = Date.now();

    rawWorkouts.forEach((w, i) => {
        const ahType = useAttr(w, 'workoutActivityType');
        const mapped = AH_TYPE_MAP[ahType];
        if (!mapped) { unmappedTypes.add(ahType.replace('HKWorkoutActivityType', '')); return; }
        if (!logData.types.includes(mapped)) return;

        const startDate = useAttr(w, 'startDate').split(' ')[0];
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return;

        const key = `${startDate}__${mapped}`;
        if (existingKeys.has(key)) { skippedExisting++; return; }
        if (seenKeys.has(key)) return;
        seenKeys.add(key);

        const durationRaw = parseFloat(useAttr(w, 'duration') || '0');
        const durationUnit = (useAttr(w, 'durationUnit') || 'min').toLowerCase();
        const durationMin = durationUnit === 's' ? durationRaw / 60 : durationUnit === 'hr' ? durationRaw * 60 : durationRaw;

        let rawDist  = parseFloat(useAttr(w, 'totalDistance') || '0');
        let distUnit = (useAttr(w, 'totalDistanceUnit') || '').toLowerCase();
        if (!rawDist) {
            // distance stored in WorkoutStatistics child elements (common for Strava workouts)
            const distTypes = ['HKQuantityTypeIdentifierDistanceWalkingRunning','HKQuantityTypeIdentifierDistanceCycling','HKQuantityTypeIdentifierDistanceSwimming'];
            for (const dt of distTypes) {
                const dm = w.match(new RegExp('WorkoutStatistics[^>]*type="' + dt + '"[^>]*sum="([^"]*)"[^>]*unit="([^"]*)"'));
                if (dm) { rawDist = parseFloat(dm[1]); distUnit = dm[2].toLowerCase(); break; }
            }
        }
        const distKm = distUnit === 'm' ? rawDist / 1000 : distUnit === 'mi' ? rawDist * 1.60934 : rawDist;

        const entry = { _id: i, selected: true, id: ts + i, date: startDate, type: mapped, isPlanned: false, customMetricData: {} };
        if (durationMin > 0) entry.duration = Math.round(durationMin);
        if (distKm > 0) { entry.distance = Math.round(distKm * 100) / 100; entry.distanceUnit = 'km'; }
        newEntries.push(entry);
    });

    // Process health metric Records — done BEFORE the empty-check so metric-only
    // imports (no matching workouts) still work, and so metrics are auto-created
    // when the data exists but the user hasn't set them up yet.
    if (recordStrings.length > 0) {
        // Apple Health timestamps use "YYYY-MM-DD HH:MM:SS +HHMM" (no colon in timezone).
        // Convert to ISO 8601 so Date.parse works reliably across all browsers.
        const parseAHDate = s => s ? Date.parse(s.replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) : NaN;

        const vo2ByDate    = {};
        const sleepByDate  = {};
        const weightByDate = {};

        recordStrings.forEach(r => {
            const rType = attr(r, 'type');
            if (rType === 'HKQuantityTypeIdentifierVO2Max') {
                const date = attr(r, 'startDate').split(' ')[0];
                const val  = parseFloat(attr(r, 'value') || '0');
                if (/^\d{4}-\d{2}-\d{2}$/.test(date) && val > 0)
                    if (!vo2ByDate[date] || val > vo2ByDate[date]) vo2ByDate[date] = val;
            } else if (rType === 'HKCategoryTypeIdentifierSleepAnalysis') {
                const val = attr(r, 'value');
                if (!val.includes('Asleep')) return;
                const startMs = parseAHDate(attr(r, 'startDate'));
                const endStr  = attr(r, 'endDate');
                const endMs   = parseAHDate(endStr);
                if (!endStr || isNaN(startMs) || isNaN(endMs) || endMs <= startMs) return;
                const date = endStr.split(' ')[0];
                if (/^\d{4}-\d{2}-\d{2}$/.test(date))
                    sleepByDate[date] = (sleepByDate[date] || 0) + (endMs - startMs) / 60000;
            } else if (rType === 'HKQuantityTypeIdentifierBodyMass') {
                const date = attr(r, 'startDate').split(' ')[0];
                const val  = parseFloat(attr(r, 'value') || '0');
                const unit = (attr(r, 'unit') || 'kg').toLowerCase();
                if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || val <= 0) return;
                const kg = unit === 'lb' ? val * 0.453592 : unit === 'st' ? val * 6.35029 : val;
                if (!weightByDate[date]) weightByDate[date] = kg;
            }
        });

        // Auto-create metrics when data exists but no matching metric is configured
        let vo2Metric    = logData.customMetrics.find(m => m.name.toLowerCase().includes('vo2'));
        let sleepMetric  = logData.customMetrics.find(m => m.name.toLowerCase().includes('sleep'));
        let weightMetric = logData.customMetrics.find(m => m.name.toLowerCase().includes('weight'));
        if (!vo2Metric    && Object.keys(vo2ByDate).length)    { vo2Metric    = { name: 'VO2 MAX', type: 'number' };  logData.customMetrics.push(vo2Metric); }
        if (!weightMetric && Object.keys(weightByDate).length) { weightMetric = { name: 'WEIGHT',  type: 'number' };  logData.customMetrics.push(weightMetric); }
        if (!sleepMetric  && Object.keys(sleepByDate).length)  { sleepMetric  = { name: 'SLEEP',   type: 'number' };  logData.customMetrics.push(sleepMetric); }
        else if (sleepMetric && sleepMetric.type !== 'number') { sleepMetric.type = 'number'; delete sleepMetric.scale; }

        // Attach to workout entries on matching dates
        newEntries.forEach(e => {
            if (!e.customMetricData) e.customMetricData = {};
            if (vo2Metric    && vo2ByDate[e.date]    != null) e.customMetricData[vo2Metric.name]    = Math.round(vo2ByDate[e.date] * 10) / 10;
            if (sleepMetric  && sleepByDate[e.date]  != null) e.customMetricData[sleepMetric.name]  = Math.round(sleepByDate[e.date] / 6) / 10;
            if (weightMetric && weightByDate[e.date] != null) e.customMetricData[weightMetric.name] = Math.round(weightByDate[e.date] * 10) / 10;
        });

        // Create standalone NONE entries for metric readings on days with no workout
        const workoutDates = new Set(newEntries.map(e => e.date));
        const allMetricDates = new Set([...Object.keys(vo2ByDate), ...Object.keys(sleepByDate), ...Object.keys(weightByDate)]);
        let mId = ts + rawWorkouts.length + 1;
        allMetricDates.forEach(date => {
            if (workoutDates.has(date)) return;
            const cmd = {};
            if (vo2Metric    && vo2ByDate[date]    != null) cmd[vo2Metric.name]    = Math.round(vo2ByDate[date] * 10) / 10;
            if (sleepMetric  && sleepByDate[date]  != null) cmd[sleepMetric.name]  = Math.round(sleepByDate[date] / 6) / 10;
            if (weightMetric && weightByDate[date]  != null) cmd[weightMetric.name] = Math.round(weightByDate[date] * 10) / 10;
            if (Object.keys(cmd).length > 0)
                newEntries.push({ _id: mId, selected: true, id: mId++, date, type: 'NONE', isPlanned: false, customMetricData: cmd });
        });
    }

    if (newEntries.length === 0) {
        const detail = skippedExisting > 0 ? `${skippedExisting} already in your log.` : unmappedTypes.size > 0 ? `Types not recognised: ${[...unmappedTypes].join(', ')}` : 'No workouts or health metrics found.';
        return alert('Nothing to import. ' + detail);
    }

    newEntries.sort((a, b) => b.date.localeCompare(a.date));
    showAHPreview(newEntries, skippedExisting, unmappedTypes);
};

// --- AH IMPORT PREVIEW ---
let ahPendingEntries = [];
let ahVisibleTypes = new Set();

const showAHPreview = (entries, skippedExisting, unmappedTypes) => {
    ahPendingEntries = entries;
    const allTypes = [...new Set(entries.map(e => e.type))].sort();
    ahVisibleTypes = new Set(allTypes);

    const dates = entries.map(e => e.date).sort();
    document.getElementById('ahFilterFrom').value = dates[0] || '';
    document.getElementById('ahFilterTo').value = dates[dates.length - 1] || '';

    document.getElementById('ahTypeChips').innerHTML = allTypes.map(t =>
        `<button class="ah-type-chip active" data-type="${t}" onclick="window.toggleAHType('${t}')">${t}</button>`
    ).join('');

    const summaryParts = [`${entries.length} new workout${entries.length !== 1 ? 's' : ''} found`];
    if (skippedExisting > 0) summaryParts.push(`${skippedExisting} already in your log`);
    if (unmappedTypes.size > 0) summaryParts.push(`${unmappedTypes.size} type${unmappedTypes.size !== 1 ? 's' : ''} not matched`);
    document.getElementById('ahModalSummary').textContent = summaryParts.join(' · ');

    document.getElementById('ahPreviewModal').style.display = 'flex';
    window.renderAHList();
};

window.closeAHPreview = () => {
    document.getElementById('ahPreviewModal').style.display = 'none';
    ahPendingEntries = [];
    ahVisibleTypes.clear();
};

window.toggleAHType = (type) => {
    if (ahVisibleTypes.has(type)) ahVisibleTypes.delete(type);
    else ahVisibleTypes.add(type);
    document.querySelectorAll('.ah-type-chip').forEach(chip =>
        chip.classList.toggle('active', ahVisibleTypes.has(chip.dataset.type))
    );
    window.renderAHList();
};

window.renderAHList = () => {
    const from = document.getElementById('ahFilterFrom').value;
    const to = document.getElementById('ahFilterTo').value;

    const visible = ahPendingEntries.filter(e =>
        ahVisibleTypes.has(e.type) &&
        (!from || e.date >= from) &&
        (!to || e.date <= to)
    );

    const selectedCount = ahPendingEntries.filter(e => e.selected).length;
    document.getElementById('ahSelCount').textContent = `${selectedCount} selected`;
    const btn = document.getElementById('ahImportBtn');
    btn.textContent = selectedCount > 0 ? `Import ${selectedCount}` : 'Import';
    btn.disabled = selectedCount === 0;

    const listEl = document.getElementById('ahModalList');
    if (visible.length === 0) {
        listEl.innerHTML = '<div class="ah-empty">No workouts match the current filters.</div>';
        return;
    }

    let lastMonth = '';
    listEl.innerHTML = visible.map(e => {
        const dateObj = new Date(e.date + 'T12:00:00');
        const month = dateObj.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
        const dateStr = dateObj.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
        const monthHeader = month !== lastMonth ? (lastMonth = month, `<div class="ah-month-header">${month}</div>`) : '';
        const dur = e.duration ? `${e.duration} min` : '';
        const dist = e.distance ? `${e.distance} ${e.distanceUnit || 'km'}` : '';
        const meta = [dur, dist].filter(Boolean).join(' · ');
        return `${monthHeader}<label class="ah-entry-row${e.selected ? ' ah-entry-selected' : ''}">
            <input type="checkbox" class="ah-entry-check"${e.selected ? ' checked' : ''} onchange="window.toggleAHEntry(${e._id},this.checked,this)">
            <div class="ah-entry-info">
                <div class="ah-entry-top">
                    <span class="ah-entry-type">${e.type}</span>
                    <span class="ah-entry-date">${dateStr}</span>
                </div>
                ${meta ? `<div class="ah-entry-meta">${meta}</div>` : ''}
            </div>
        </label>`;
    }).join('');
};

window.toggleAHEntry = (id, checked, el) => {
    const entry = ahPendingEntries.find(e => e._id === id);
    if (entry) entry.selected = checked;
    el.closest('.ah-entry-row')?.classList.toggle('ah-entry-selected', checked);
    const selectedCount = ahPendingEntries.filter(e => e.selected).length;
    document.getElementById('ahSelCount').textContent = `${selectedCount} selected`;
    const btn = document.getElementById('ahImportBtn');
    btn.textContent = selectedCount > 0 ? `Import ${selectedCount}` : 'Import';
    btn.disabled = selectedCount === 0;
};

window.toggleAllAH = (select) => {
    const from = document.getElementById('ahFilterFrom').value;
    const to = document.getElementById('ahFilterTo').value;
    ahPendingEntries.forEach(e => {
        if (ahVisibleTypes.has(e.type) && (!from || e.date >= from) && (!to || e.date <= to))
            e.selected = select;
    });
    window.renderAHList();
};

window.importSelectedAH = async () => {
    const toImport = ahPendingEntries.filter(e => e.selected);
    if (toImport.length === 0) return;
    if (!confirm(`Import ${toImport.length} workout${toImport.length !== 1 ? 's' : ''}? Your existing entries will not be affected.`)) return;

    saveSnapshot(logData);
    const existingKeys = new Set(logData.entries.filter(e => !e.isPlanned).map(e => `${e.date}__${e.type}`));
    let added = 0;
    toImport.forEach(e => {
        const key = `${e.date}__${e.type}`;
        if (existingKeys.has(key)) return;
        existingKeys.add(key);
        const { _id, selected, ...clean } = e;
        logData.entries.push(clean);
        added++;
    });

    try {
        await setDoc(doc(db, 'logs', LOG_ID), logData);
        window.closeAHPreview();
        alert(`${added} workout${added !== 1 ? 's' : ''} imported.`);
    } catch (err) {
        alert('Import failed: ' + err.message);
    }
};

// --- TRAINING PLAN ---
let editingPlanId = null;
let editingPlanSessionId = null;
window._pendingPlanLink = null;

const buildActualLabel = (entry) => {
    if (!entry || entry.type === 'NONE') return '';
    const cat = getTypeCategory(entry.type);
    return aggregateExerciseLabel([entry], cat) || titleCase(entry.type);
};

const renderPlan = () => {
    const container = document.getElementById('planContainer');
    if (!container) return;
    const plans = logData.trainingPlans || [];
    const todayStr = new Date().toISOString().split('T')[0];

    if (!plans.length) {
        container.innerHTML = `
            <div class="plan-empty">
                <div class="plan-empty-icon">📋</div>
                <h3>No training plans yet</h3>
                <p>Create a plan to organise your sessions and track completion.</p>
                <button onclick="window.showPlanModal()" class="btn-primary nav-btn" style="margin-top:20px; font-size:0.85rem">+ Create your first plan</button>
            </div>`;
        return;
    }

    const activePlan = plans.find(p => p.startDate <= todayStr && (!p.endDate || p.endDate >= todayStr)) || plans[plans.length - 1];
    const totalSessions = (activePlan.sessions || []).length;
    const doneSessions = (activePlan.sessions || []).filter(s => s.isComplete).length;
    const progressPct = totalSessions > 0 ? Math.round((doneSessions / totalSessions) * 100) : 0;

    const byWeek = {};
    (activePlan.sessions || []).forEach(s => {
        const w = getWeekStart(s.date);
        if (!byWeek[w]) byWeek[w] = [];
        byWeek[w].push(s);
    });
    const sortedWeeks = Object.keys(byWeek).sort();

    let html = `
        <div class="plan-header">
            <div class="plan-header-top">
                <div>
                    <div class="plan-label">Active Plan</div>
                    <div class="plan-name" onclick="window.showPlanModal(${activePlan.id})">${activePlan.title}</div>
                </div>
                <button onclick="window.showPlanModal()" class="nav-btn btn-secondary" style="font-size:0.75rem; white-space:nowrap">+ New Plan</button>
            </div>
            <div class="plan-progress-bar-outer"><div class="plan-progress-bar-inner" style="width:${progressPct}%"></div></div>
            <div class="plan-progress-label">${progressPct}% complete — ${doneSessions} of ${totalSessions} sessions done</div>
        </div>`;

    if (!sortedWeeks.length) {
        html += `<div class="plan-week">
            <div class="plan-week-header"><span class="plan-week-label">No sessions yet</span></div>
            <button class="plan-add-session" onclick="window.showPlanSessionModal(${activePlan.id},null,null)">+ Add your first session</button>
        </div>`;
    }

    sortedWeeks.forEach(weekStart => {
        const weekEnd = new Date(weekStart); weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
        const weekEndStr = weekEnd.toISOString().split('T')[0];
        const isPast = weekEndStr < todayStr;
        const isCurrent = weekStart <= todayStr && weekEndStr >= todayStr;
        const sessions = byWeek[weekStart].slice().sort((a, b) => a.date.localeCompare(b.date));
        const weekDone = sessions.filter(s => s.isComplete).length;
        const weekLabel = new Date(weekStart).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

        html += `<div class="plan-week${isPast ? ' plan-week-past' : ''}${isCurrent ? ' plan-week-current' : ''}">
            <div class="plan-week-header">
                <span class="plan-week-label">W/C ${weekLabel}</span>
                <span class="plan-week-count">${weekDone}/${sessions.length}</span>
            </div>`;

        sessions.forEach(s => {
            const isToday = s.date === todayStr;
            const isPastDay = s.date < todayStr && !isToday;
            const cat = s.type && s.type !== 'NONE' ? getTypeCategory(s.type) : 'other';
            const sDate = new Date(s.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
            const logEntry = s.logEntryId ? logData.entries.find(e => e.id === s.logEntryId) : null;
            const actual = logEntry ? buildActualLabel(logEntry) : '';

            const tickCls = s.isComplete
                ? 'plan-tick plan-tick-done'
                : isPastDay ? 'plan-tick plan-tick-missed' : 'plan-tick';
            const tickOnclick = s.isComplete
                ? (s.logEntryId ? `onclick="window.editEntry(${s.logEntryId})"` : '')
                : isPastDay ? '' : `onclick="window.logPlanSession(${activePlan.id},${s.id})"`;

            html += `<div class="plan-session-card${isToday ? ' plan-session-today' : ''}${s.isComplete ? ' plan-session-done' : ''}">
                <button class="${tickCls}" ${tickOnclick}>${s.isComplete ? '✓' : isPastDay ? '–' : '○'}</button>
                <div class="plan-session-info">
                    <div class="plan-session-top">
                        ${s.type && s.type !== 'NONE' ? `<span class="plan-session-type cat-${cat}">${titleCase(s.type)}</span>` : ''}
                        <span class="plan-session-date">${sDate}</span>
                        ${isToday ? '<span class="plan-today-badge">Today</span>' : ''}
                    </div>
                    ${s.target ? `<div class="plan-session-target">${s.target}</div>` : ''}
                    ${actual ? `<div class="plan-session-actual">✓ ${actual}</div>` : ''}
                </div>
                <button class="plan-session-edit" onclick="window.showPlanSessionModal(${activePlan.id},${s.id})">⋯</button>
            </div>`;
        });

        html += `<button class="plan-add-session" onclick="window.showPlanSessionModal(${activePlan.id},null,'${weekStart}')">+ Add session</button>
        </div>`;
    });

    if (plans.length > 1) {
        const others = plans.filter(p => p.id !== activePlan.id);
        html += `<div class="isect" style="margin-top:24px"><div class="isect-header">Other Plans</div>
            <div class="achievements-grid">${others.map(p => {
                const d = (p.sessions||[]).filter(s=>s.isComplete).length;
                const t = (p.sessions||[]).length;
                return `<div class="achievement-card unlocked goal-card" onclick="window.showPlanModal(${p.id})">
                    <div class="goal-title">${p.title}</div>
                    <div class="goal-desc">${d}/${t} sessions done</div>
                </div>`;
            }).join('')}</div></div>`;
    }

    container.innerHTML = html;
};

window.showPlanModal = (planId) => {
    editingPlanId = planId || null;
    const existing = planId ? (logData.trainingPlans || []).find(p => p.id === planId) : null;
    document.getElementById('planModalTitle').textContent = existing ? 'Edit Plan' : 'New Training Plan';
    document.getElementById('deletePlanBtn').style.display = existing ? 'block' : 'none';
    document.getElementById('planTitle').value = existing ? existing.title : '';
    document.getElementById('planStartDate').value = existing ? (existing.startDate || '') : '';
    document.getElementById('planEndDate').value = existing ? (existing.endDate || '') : '';
    document.getElementById('planModal').style.display = 'flex';
};

window.savePlan = async () => {
    const title = document.getElementById('planTitle').value.trim();
    if (!title) return alert('Please enter a plan name.');
    if (!logData.trainingPlans) logData.trainingPlans = [];
    if (editingPlanId) {
        const idx = logData.trainingPlans.findIndex(p => p.id === editingPlanId);
        if (idx !== -1) {
            logData.trainingPlans[idx].title = title;
            logData.trainingPlans[idx].startDate = document.getElementById('planStartDate').value;
            logData.trainingPlans[idx].endDate = document.getElementById('planEndDate').value;
        }
    } else {
        logData.trainingPlans.push({ id: Date.now(), title, startDate: document.getElementById('planStartDate').value, endDate: document.getElementById('planEndDate').value, sessions: [] });
    }
    await setDoc(doc(db, 'logs', LOG_ID), logData);
    window.closeModal('planModal');
    renderPlan();
};

window.deletePlan = async () => {
    if (!confirm('Delete this plan and all its sessions?')) return;
    logData.trainingPlans = (logData.trainingPlans || []).filter(p => p.id !== editingPlanId);
    await setDoc(doc(db, 'logs', LOG_ID), logData);
    window.closeModal('planModal');
    renderPlan();
};

window.showPlanSessionModal = (planId, sessionId, defaultDate) => {
    editingPlanId = planId;
    editingPlanSessionId = sessionId || null;
    const plan = (logData.trainingPlans || []).find(p => p.id === planId);
    const session = sessionId ? (plan?.sessions || []).find(s => s.id === sessionId) : null;
    document.getElementById('planSessionModalTitle').textContent = session ? 'Edit Session' : 'Add Session';
    document.getElementById('deletePlanSessionBtn').style.display = session ? 'block' : 'none';
    document.getElementById('planSessionDate').value = session ? session.date : (defaultDate || new Date().toISOString().split('T')[0]);
    const typeSelect = document.getElementById('planSessionType');
    typeSelect.innerHTML = `<option value="NONE">No type</option>` + logData.types.map(t => `<option value="${t}" ${t === session?.type ? 'selected' : ''}>${t}</option>`).join('');
    document.getElementById('planSessionTarget').value = session ? (session.target || '') : '';
    document.getElementById('planSessionModal').style.display = 'flex';
};

window.savePlanSession = async () => {
    const plan = (logData.trainingPlans || []).find(p => p.id === editingPlanId);
    if (!plan) return;
    const date = document.getElementById('planSessionDate').value;
    if (!date) return alert('Please select a date.');
    const existing = editingPlanSessionId ? (plan.sessions || []).find(s => s.id === editingPlanSessionId) : null;
    const sessionData = {
        id: editingPlanSessionId || Date.now(),
        date,
        type: document.getElementById('planSessionType').value,
        target: document.getElementById('planSessionTarget').value.trim(),
        isComplete: existing ? existing.isComplete : false,
        logEntryId: existing ? existing.logEntryId : null,
    };
    if (!plan.sessions) plan.sessions = [];
    if (editingPlanSessionId) {
        const idx = plan.sessions.findIndex(s => s.id === editingPlanSessionId);
        if (idx !== -1) plan.sessions[idx] = sessionData;
    } else {
        plan.sessions.push(sessionData);
    }
    await setDoc(doc(db, 'logs', LOG_ID), logData);
    window.closeModal('planSessionModal');
    renderPlan();
};

window.deletePlanSession = async () => {
    if (!confirm('Remove this session from the plan?')) return;
    const plan = (logData.trainingPlans || []).find(p => p.id === editingPlanId);
    if (!plan) return;
    plan.sessions = (plan.sessions || []).filter(s => s.id !== editingPlanSessionId);
    await setDoc(doc(db, 'logs', LOG_ID), logData);
    window.closeModal('planSessionModal');
    renderPlan();
};

window._pendingChoicePlanLink = null;

window.logPlanSession = (planId, sessionId) => {
    const plan = (logData.trainingPlans || []).find(p => p.id === planId);
    const session = (plan?.sessions || []).find(s => s.id === sessionId);
    if (!session) return;

    if (_stravaConnected) {
        window._pendingChoicePlanLink = { planId, sessionId, session };
        document.getElementById('planLogChoiceModal').style.display = 'flex';
    } else {
        window._openPlanSessionManual(planId, sessionId, session);
    }
};

window._openPlanSessionManual = (planId, sessionId, session) => {
    window.showInputModal();
    document.getElementById('modalDate').value = session.date;
    if (session.type && session.type !== 'NONE') {
        const typeSelect = document.getElementById('modalType');
        if ([...typeSelect.options].some(o => o.value === session.type)) typeSelect.value = session.type;
    }
    if (session.target) document.getElementById('modalDetails').value = session.target;
    window.toggleDistanceRow();
    window._pendingPlanLink = { planId, sessionId };
};

window._choosePlanLog = (mode) => {
    window.closeModal('planLogChoiceModal');
    const link = window._pendingChoicePlanLink;
    window._pendingChoicePlanLink = null;
    if (!link) return;
    const { planId, sessionId, session } = link;
    if (mode === 'strava') {
        window._pendingPlanLink = { planId, sessionId };
        window.showStravaActivity();
    } else {
        window._openPlanSessionManual(planId, sessionId, session);
    }
};

// --- SEED HALF MARATHON PLAN ---
window.seedHalfMarathonPlan = async () => {
    if ((logData.trainingPlans || []).some(p => p.title.includes('Half Marathon'))) {
        alert('Half marathon plan already exists.');
        return;
    }
    const S = (id, date, label, done) => ({ id, date, type: 'RUN', target: label, isComplete: done, logEntryId: null });
    const plan = {
        id: Date.now(),
        title: 'Half Marathon — Goal 1:39:00 (4:42/km)',
        startDate: '2026-06-22',
        endDate: '2026-10-10',
        sessions: [
            // Week 1 — Foundation (done)
            S(1,  '2026-06-22', 'Tempo — 3 km @ 4:50/km', true),
            S(2,  '2026-06-24', 'Long — 13 km @ 5:30–6:00/km', true),
            S(3,  '2026-06-27', 'Speed — 6×400m @ 4:00/km, 90s jog', true),
            // Week 2 — Foundation (done)
            S(4,  '2026-06-29', 'Tempo — 4 km @ 4:50/km', true),
            S(5,  '2026-07-01', 'Long — 14 km @ 5:30–6:00/km', true),
            S(6,  '2026-07-04', 'Speed — 8×400m @ 4:00/km, 90s jog', true),
            // Week 3 — Foundation (done)
            S(7,  '2026-07-06', 'Tempo — 5 km @ 4:50/km', true),
            S(8,  '2026-07-08', 'Long — 16 km @ 5:30–6:00/km', true),
            S(9,  '2026-07-11', 'Speed — 5×800m @ 4:15/km, 2min jog', true),
            // Week 4 — Cutback
            S(10, '2026-07-13', 'Tempo — 3 km @ 4:50/km (Cutback)', false),
            S(11, '2026-07-15', 'Long — 12 km @ 5:30–6:00/km (Cutback)', false),
            S(12, '2026-07-18', 'Speed — 6×400m @ 4:00/km, 90s jog (Cutback)', false),
            // Week 5 — Build
            S(13, '2026-07-20', 'Tempo — 5 km @ 4:50/km', false),
            S(14, '2026-07-22', 'Long — 15 km @ 5:30–6:00/km', false),
            S(15, '2026-07-25', 'Speed — 6×800m @ 4:15/km, 90s jog', false),
            // Week 6 — Build
            S(16, '2026-07-27', 'Tempo — 6 km @ 4:50/km', false),
            S(17, '2026-07-29', 'Long — 17 km @ 5:30–6:00/km', false),
            S(18, '2026-08-01', 'Speed — 4×1000m @ 4:15/km, 2min jog', false),
            // Week 7 — Build
            S(19, '2026-08-03', 'Tempo — 2×3 km @ 4:50/km, 90s jog', false),
            S(20, '2026-08-05', 'Long — 18 km @ 5:30–6:00/km', false),
            S(21, '2026-08-08', 'Speed — 5×1000m @ 4:15/km, 2min jog', false),
            // Week 8 — Cutback
            S(22, '2026-08-10', 'Tempo — 4 km @ 4:50/km (Cutback)', false),
            S(23, '2026-08-12', 'Long — 14 km @ 5:30–6:00/km (Cutback)', false),
            S(24, '2026-08-15', 'Speed — 8×400m @ 4:00/km, 75s jog (Cutback)', false),
            // Week 9 — Peak
            S(25, '2026-08-17', 'Tempo — 6 km @ 4:50/km', false),
            S(26, '2026-08-19', 'Long — 18 km, last 4 km @ 4:42/km', false),
            S(27, '2026-08-22', 'Speed — 3×1600m @ 4:15/km, 2:30 jog', false),
            // Week 10 — Peak
            S(28, '2026-08-24', 'Tempo — 7 km @ 4:50/km', false),
            S(29, '2026-08-26', 'Long — 20 km @ 5:30–6:00/km', false),
            S(30, '2026-08-29', 'Speed — 4×1200m @ 4:15/km, 2min jog', false),
            // Week 11 — Peak (highest load)
            S(31, '2026-08-31', 'Tempo — 8 km @ 4:45/km', false),
            S(32, '2026-09-02', 'Long — 21 km, last 5 km @ 4:42/km', false),
            S(33, '2026-09-05', 'Speed — 5×1000m @ 4:15/km, 2min jog', false),
            // Week 12 — Cutback
            S(34, '2026-09-07', 'Tempo — 5 km @ 4:50/km (Cutback)', false),
            S(35, '2026-09-09', 'Long — 15 km @ 5:30–6:00/km (Cutback)', false),
            S(36, '2026-09-12', 'Speed — 6×600m @ 4:00/km, 90s jog (Cutback)', false),
            // Week 13 — Sharpen
            S(37, '2026-09-14', 'Tempo — 6 km @ 4:42/km (Goal Pace)', false),
            S(38, '2026-09-16', 'Long — 19 km, middle 8 km @ 4:42/km', false),
            S(39, '2026-09-19', 'Speed — 4×1200m @ 4:15/km, 2min jog', false),
            // Week 14 — Sharpen
            S(40, '2026-09-21', 'Tempo — 5 km @ 4:42/km (Goal Pace)', false),
            S(41, '2026-09-23', 'Long — 16 km, last 6 km @ 4:42/km', false),
            S(42, '2026-09-26', 'Speed — 6×800m @ 4:15/km, 90s jog', false),
            // Week 15 — Taper
            S(43, '2026-09-28', 'Tempo — 4 km @ 4:42/km (Goal Pace, Taper)', false),
            S(44, '2026-09-30', 'Long — 13 km @ 5:30–6:00/km (Taper)', false),
            S(45, '2026-10-03', 'Speed — 4×400m @ 4:00/km, 90s jog (Taper)', false),
            // Week 16 — Race Week
            S(46, '2026-10-05', 'Easy — 8 km @ 5:30–6:00/km', false),
            S(47, '2026-10-07', 'Strides — 3×400m @ 4:42/km, easy (2 days out)', false),
            S(48, '2026-10-10', 'RACE — Half Marathon @ 4:42/km · Goal 1:39:00', false),
        ]
    };
    if (!logData.trainingPlans) logData.trainingPlans = [];
    logData.trainingPlans.push(plan);
    await setDoc(doc(db, 'logs', LOG_ID), logData);
    if (document.getElementById('viewPlan')?.classList.contains('active')) renderPlan();
    alert('Half marathon plan added! Navigate to the Plan tab to see it.');
};

// --- EXPORT DATA ---
window.exportData = () => {
    const blob = new Blob([JSON.stringify(logData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `traininglog-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    window.closeSettings();
};
