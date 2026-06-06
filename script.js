import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, onSnapshot, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, browserLocalPersistence, setPersistence, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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
const auth = getAuth(app);

setPersistence(auth, browserLocalPersistence);

let LOG_ID = null;
let logData = { types: ["RUN", "YOGA", "GYM", "SWIM"], typeCategories: {}, customMetrics: [], entries: [] };

const TYPE_CATEGORIES = [
    { value: 'cardio',      label: 'Distance' },
    { value: 'bodyweight',  label: 'Reps' },
    { value: 'gym',         label: 'Weight' },
    { value: 'other',       label: 'Other' },
];

const getTypeCategory = (typeName) => logData.typeCategories?.[typeName] || 'other';
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

const attachRealtimeListener = () => {
    if(unsubSnapshot) unsubSnapshot();
    unsubSnapshot = onSnapshot(doc(db, "logs", LOG_ID), (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            logData = { types: data.types || [], typeCategories: data.typeCategories || {}, customMetrics: data.customMetrics || [], entries: data.entries || [] };
            renderMatrix();
            if(document.getElementById('viewInsights').classList.contains('active')) renderInsights();
        } else {
            setDoc(doc(db, "logs", LOG_ID), { types: ["RUN", "YOGA", "GYM", "SWIM"], typeCategories: { RUN: 'cardio', YOGA: 'other', GYM: 'gym', SWIM: 'cardio' }, customMetrics: [], entries: [] });
        }
    });
};

// --- DYNAMIC CUSTOM METRIC IMPLEMENTATIONS ---
window.showMetricModal = () => {
    const container = document.getElementById('metricList');
    container.innerHTML = logData.customMetrics.map((m, idx) => `
        <div class="type-item" style="display:flex; gap:8px; margin-bottom:8px;">
            <span style="flex:1; text-align:left; font-weight:700; font-size:0.85rem; align-self:center;">${m.name} (${m.type})</span>
            <button onclick="window.deleteCustomMetric(${idx})" style="background:#fee2e2; color:#ef4444; font-size:0.65rem; padding:6px 12px;" class="nav-btn">✕ Delete</button>
        </div>
    `).join('');
    document.getElementById('metricModal').style.display = 'flex';
};

window.addCustomMetric = async () => {
    const nameInput = document.getElementById('newMetricName');
    const typeSelect = document.getElementById('newMetricType');
    const name = nameInput.value.toUpperCase().replace(/\s+/g, '-').trim();
    if(!name) return;
    
    if(logData.customMetrics.some(m => m.name === name)) return alert('Metric name already active.');
    logData.customMetrics.push({ name: name, type: typeSelect.value });
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

const buildCustomMetricsFormUI = (existingCustomValues = {}) => {
    const container = document.getElementById('customMetricsFormContainer');
    container.innerHTML = "";
    dynamicMetricValues = {};

    logData.customMetrics.forEach(m => {
        const val = existingCustomValues[m.name] !== undefined ? existingCustomValues[m.name] : (m.type === 'slider' ? 5 : false);
        dynamicMetricValues[m.name] = val;

        const div = document.createElement('div');
        div.className = "input-row";
        if (m.type === 'slider') {
            div.className = "input-row highlight-box";
            div.innerHTML = `
                <label>${m.name.replace(/-/g, ' ')} (1-10)</label>
                <div class="slider-row">
                    <input type="range" min="1" max="10" value="${val}" oninput="document.getElementById('lbl-${m.name}').innerText = this.value; window.updateLocalCustomMetricVal('${m.name}', parseInt(this.value))">
                    <span id="lbl-${m.name}" class="score-display">${val}</span>
                </div>`;
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

// --- CORE INTERFACE DIALOGS & EXECUTION ---
window.switchTab = (tab) => {
    document.getElementById('viewLog').classList.toggle('active', tab === 'log');
    document.getElementById('viewInsights').classList.toggle('active', tab === 'insights');
    document.getElementById('tabLog').classList.toggle('active', tab === 'log');
    document.getElementById('tabInsights').classList.toggle('active', tab === 'insights');
    if (tab === 'insights') renderInsights();
};

window.setStrategy = (wantsPlanned) => {
    isPlannedStrategy = wantsPlanned;
    document.getElementById('stratPlan').classList.toggle('active', wantsPlanned);
    document.getElementById('stratDone').classList.toggle('active', !wantsPlanned);
    document.getElementById('performanceMetrics').style.display = wantsPlanned ? 'none' : 'block';
    document.getElementById('intensityRow').style.display = wantsPlanned ? 'none' : 'flex';
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
    document.getElementById('metricCardio').style.display     = cat === 'cardio'      ? 'block' : 'none';
    document.getElementById('metricBodyweight').style.display = cat === 'bodyweight'  ? 'block' : 'none';
    document.getElementById('metricGym').style.display        = cat === 'gym'         ? 'block' : 'none';
    document.getElementById('metricOther').style.display      = cat === 'other'       ? 'block' : 'none';
};

window.showInputModal = () => {
    editingId = null;
    document.getElementById('deleteEntryBtn').style.display = "none";
    document.getElementById('modalDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('modalHappiness').value = 5;
    document.getElementById('happyVal').innerText = 5;
    document.getElementById('modalDetails').value = "";
    window.setStrategy(false);
    buildCustomMetricsFormUI();
    document.getElementById('modalType').innerHTML = `<option value="NONE">No Category Allocation</option>` + logData.types.map(t => `<option value="${t}">${t}</option>`).join('');
    document.getElementById('modalDistance').value = '';
    document.getElementById('modalDistanceUnit').value = 'km';
    document.getElementById('modalReps').value = '';
    document.getElementById('modalWeight').value = '';
    document.getElementById('modalWeightUnit').value = 'kg';
    document.getElementById('modalOtherRating').value = '';
    document.getElementById('inputModal').style.display = 'flex';
    window.selectMark(1);
    window.toggleDistanceRow();
};

window.editEntry = (id) => {
    const entry = logData.entries.find(e => e.id === id);
    if (!entry) return;
    editingId = id;
    document.getElementById('deleteEntryBtn').style.display = "block";
    document.getElementById('modalDate').value = entry.date;
    document.getElementById('modalHappiness').value = entry.happiness || 5;
    document.getElementById('happyVal').innerText = entry.happiness || 5;
    document.getElementById('modalDetails').value = entry.details || "";
    window.setStrategy(!!entry.isPlanned);
    buildCustomMetricsFormUI(entry.customMetricData || {});
    document.getElementById('modalType').innerHTML = `<option value="NONE">No Category Allocation</option>` + logData.types.map(t => `<option value="${t}" ${t === entry.type ? 'selected' : ''}>${t}</option>`).join('');
    document.getElementById('modalDistance').value = entry.distance || '';
    document.getElementById('modalDistanceUnit').value = entry.distanceUnit || 'km';
    document.getElementById('modalReps').value = entry.reps || '';
    document.getElementById('modalWeight').value = entry.weight || '';
    document.getElementById('modalWeightUnit').value = entry.weightUnit || 'kg';
    document.getElementById('modalOtherRating').value = entry.otherRating || '';
    window.selectMark(entry.mark || 1);
    document.getElementById('inputModal').style.display = 'flex';
    window.toggleDistanceRow();
};

window.quickCompletePlan = async (id) => {
    const idx = logData.entries.findIndex(e => e.id === id);
    if(idx === -1) return;
    logData.entries[idx].isPlanned = false;
    logData.entries[idx].happiness = 5;
    logData.entries[idx].mark = 2;
    logData.entries[idx].customMetricData = {};
    await setDoc(doc(db, "logs", LOG_ID), logData);
};

window.saveExercise = async () => {
    const type = document.getElementById('modalType').value;
    const cat = getTypeCategory(type);
    const distVal = parseFloat(document.getElementById('modalDistance').value);
    const repsVal = parseInt(document.getElementById('modalReps').value);
    const weightVal = parseFloat(document.getElementById('modalWeight').value);
    const otherRating = Math.min(10, Math.max(1, parseInt(document.getElementById('modalOtherRating').value) || 5));
    const entryData = {
        date: document.getElementById('modalDate').value,
        happiness: isPlannedStrategy ? null : parseInt(document.getElementById('modalHappiness').value),
        type,
        details: document.getElementById('modalDetails').value,
        mark: isPlannedStrategy ? null : window.tempMark,
        isPlanned: isPlannedStrategy,
        customMetricData: isPlannedStrategy ? {} : { ...dynamicMetricValues },
        distance: cat === 'cardio' && !isNaN(distVal) && distVal > 0 ? distVal : null,
        distanceUnit: document.getElementById('modalDistanceUnit').value,
        reps: cat === 'bodyweight' && !isNaN(repsVal) && repsVal > 0 ? repsVal : null,
        weight: cat === 'gym' && !isNaN(weightVal) && weightVal > 0 ? weightVal : null,
        weightUnit: document.getElementById('modalWeightUnit').value,
        otherRating: cat === 'other' && !isPlannedStrategy ? otherRating : null,
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

const renderHappinessChart = (completed) => {
    destroyChart('happiness');
    const canvas = document.getElementById('chartHappiness');
    if (!canvas) return;

    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 60);
    const entries = completed
        .filter(e => e.happiness && new Date(e.date) >= cutoff)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (entries.length < 2) {
        canvas.parentElement.innerHTML = '<p class="neutral-msg" style="padding:10px 0">Log at least 2 days to see the trend.</p>';
        return;
    }

    const labels = entries.map(e => new Date(e.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));
    const data = entries.map(e => e.happiness);

    chartInstances['happiness'] = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Mood',
                data,
                borderColor: '#ff5500',
                backgroundColor: 'rgba(255,85,0,0.08)',
                borderWidth: 2.5,
                pointRadius: 4,
                pointBackgroundColor: '#ff5500',
                fill: true,
                tension: 0.4,
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { min: 1, max: 10, ticks: { stepSize: 1 }, grid: { color: '#f1f5f9' } },
                x: { grid: { display: false }, ticks: { maxTicksLimit: 10, font: { size: 11 } } }
            }
        }
    });
};

const renderVolumeChart = (completed) => {
    destroyChart('volume');
    const canvas = document.getElementById('chartVolume');
    if (!canvas) return;

    const weeks = {};
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 84);
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

    const labels = sorted.map(w => new Date(w).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));
    const data = sorted.map(w => weeks[w]);

    chartInstances['volume'] = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Workouts',
                data,
                backgroundColor: 'rgba(255,85,0,0.75)',
                borderRadius: 8,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: '#f1f5f9' } },
                x: { grid: { display: false }, ticks: { font: { size: 11 } } }
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

// --- INSIGHTS RENDERER ---
const renderInsights = () => {
    const completed = logData.entries.filter(e => !e.isPlanned);
    renderWeekCompare(completed);
    renderDistanceChart(completed);
    renderHappinessChart(completed);
};

const renderWeekCompare = (completed) => {
    const el = document.getElementById('weekCompare');
    if (!el) return;

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const thisWeekStart = getWeekStart(todayStr);

    const lastWeekStartDate = new Date(thisWeekStart);
    lastWeekStartDate.setDate(lastWeekStartDate.getDate() - 7);
    const lastWeekStart = lastWeekStartDate.toISOString().split('T')[0];

    const lastWeekEndDate = new Date(thisWeekStart);
    lastWeekEndDate.setDate(lastWeekEndDate.getDate() - 1);
    const lastWeekEndStr = lastWeekEndDate.toISOString().split('T')[0];

    const thisWeek = completed.filter(e => e.date >= thisWeekStart && e.date <= todayStr);
    const lastWeek = completed.filter(e => e.date >= lastWeekStart && e.date <= lastWeekEndStr);

    const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
    const distUnit = completed.find(e => e.distanceUnit)?.distanceUnit || 'km';

    const weekWorkouts = w => w.filter(e => e.type && e.type !== 'NONE').length;
    const weekMood = w => avg(w.filter(e => e.happiness).map(e => e.happiness));
    const weekDist = w => w.filter(e => e.distance > 0).reduce((s,e) => s + e.distance, 0);

    const fmt = (val, type) => {
        if (val === null || val === undefined) return '—';
        if (type === 'mood') return val.toFixed(1);
        if (type === 'dist') return val > 0 ? val.toFixed(1) : '—';
        return String(val);
    };

    const rows = [
        { label: 'Workouts', tw: weekWorkouts(thisWeek), lw: weekWorkouts(lastWeek), type: 'count' },
        { label: 'Avg Mood', tw: weekMood(thisWeek), lw: weekMood(lastWeek), type: 'mood' },
        { label: `Distance (${distUnit})`, tw: weekDist(thisWeek), lw: weekDist(lastWeek), type: 'dist' },
    ];

    const sleepMetric = logData.customMetrics.find(m => m.name === 'SLEEP' && m.type === 'slider');
    if (sleepMetric) {
        const weekSleep = w => avg(w.filter(e => e.customMetricData?.SLEEP != null).map(e => e.customMetricData.SLEEP));
        rows.push({ label: 'Avg Sleep', tw: weekSleep(thisWeek), lw: weekSleep(lastWeek), type: 'mood' });
    }

    el.innerHTML = `
        <div class="compare-header"><span></span><span>This week</span><span>Last week</span></div>
        ${rows.map(r => {
            const twStr = fmt(r.tw, r.type);
            const lwStr = fmt(r.lw, r.type);
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
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 84);
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
    const labels = sorted.map(w => new Date(w).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));
    const data = sorted.map(w => +weeks[w].toFixed(1));

    chartInstances['distance'] = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{ label: `Distance (${distUnit})`, data, backgroundColor: 'rgba(255,85,0,0.75)', borderRadius: 8, borderSkipped: false }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } } },
                x: { grid: { display: false }, ticks: { font: { size: 11 } } }
            }
        }
    });
};

// --- CORE RENDERING MATRIX ENGINE ---
const renderMatrix = () => {
    const body = document.getElementById('matrixBody');
    const header = document.getElementById('headerRow');
    if (!body || !header) return;
    
    let headerHTML = `<th class="col-date">Date</th><th class="col-stat">Mood</th>`;
    logData.customMetrics.forEach(m => { headerHTML += `<th class="col-stat">${m.name.replace(/-/g, ' ')}</th>`; });
    // Injected .dynamic-type-th class identifier on exercise rows
    logData.types.forEach(t => { headerHTML += `<th class="dynamic-type-th">${t}</th>`; });
    header.innerHTML = headerHTML;

    const entriesByDate = {};
    logData.entries.forEach(e => {
        if (!entriesByDate[e.date]) entriesByDate[e.date] = { happiness: null, customVals: {}, exercises: {} };
        if (e.happiness && !e.isPlanned) entriesByDate[e.date].happiness = e.happiness;
        if (!e.isPlanned && e.customMetricData) entriesByDate[e.date].customVals = e.customMetricData;
        if (e.type !== "NONE") {
            if (!entriesByDate[e.date].exercises[e.type]) entriesByDate[e.date].exercises[e.type] = [];
            entriesByDate[e.date].exercises[e.type].push(e);
        }
    });

    const dates = Object.keys(entriesByDate).sort((a,b) => new Date(b) - new Date(a));
    const firstDate = dates.length > 0 ? new Date(dates[dates.length-1]) : new Date();
    const futureBuffer = new Date(); futureBuffer.setDate(futureBuffer.getDate() + 5);

    const emitWeekSummary = (acc, weekId) => {
        if (acc.days === 0) return '';
        const happyAvg = acc.happiness.length ? (acc.happiness.reduce((a,b)=>a+b,0)/acc.happiness.length).toFixed(1) : '';
        const monDate = new Date(getWeekStart(weekId));
        const weekLabel = monDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        let html = `<tr class="week-summary-row" onclick="window.toggleWeek('${weekId}')" title="Click to expand/collapse">
            <td class="col-date week-summary-label"><span class="week-toggle-icon" id="icon-${weekId}">▶</span> ${weekLabel} →</td>
            <td class="col-stat">${happyAvg}</td>`;

        logData.customMetrics.forEach(m => {
            const vals = acc.customVals[m.name] || [];
            let cell = '';
            if (vals.length) {
                if (m.type === 'slider') cell = (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1);
                else { const count = vals.filter(v=>v===true).length; cell = count > 0 ? `${count}d` : ''; }
            }
            html += `<td class="col-stat">${cell}</td>`;
        });

        logData.types.forEach(type => {
            const count = acc.typeDays[type] || 0;
            const m = acc.typeMetric?.[type];
            let cell = count > 0 ? count + 'd' : '';
            if (m && m.values.length > 0) {
                const cat = getTypeCategory(type);
                const total = m.values.reduce((a,b)=>a+b,0);
                const avg = total / m.values.length;
                const fmt = (n) => n % 1 === 0 ? n : n.toFixed(1);
                if (cat === 'other') cell += ` · ${fmt(avg)}${m.unit}`;
                else cell += ` · ${fmt(total)}${m.unit}`;
            }
            html += `<td>${cell}</td>`;
        });

        html += `</tr>`;
        return html;
    };

    const freshAcc = () => ({
        days: 0,
        happiness: [],
        customVals: Object.fromEntries(logData.customMetrics.map(m => [m.name, []])),
        typeDays: Object.fromEntries(logData.types.map(t => [t, 0])),
        typeMetric: Object.fromEntries(logData.types.map(t => [t, { values: [], unit: '' }])),
    });

    body.innerHTML = "";
    let weekAcc = freshAcc();
    let weekId = null;
    let weekRowsHTML = '';
    let allHTML = '';

    for (let d = new Date(futureBuffer); d >= firstDate; d.setDate(d.getDate() - 1)) {
        const dateKey = d.toISOString().split('T')[0];
        const dayOfWeek = d.getDay();
        const dayData = entriesByDate[dateKey];
        if (!dayData && d > new Date()) continue;

        if (!weekId) weekId = dateKey;

        const activeData = dayData || { happiness: null, customVals: {}, exercises: {} };
        const displayDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', weekday: 'short' });

        weekAcc.days++;
        if (activeData.happiness) weekAcc.happiness.push(activeData.happiness);
        logData.customMetrics.forEach(m => {
            const v = activeData.customVals[m.name];
            if (v !== undefined && v !== null) weekAcc.customVals[m.name].push(v);
        });
        logData.types.forEach(type => {
            const ex = activeData.exercises[type];
            if (ex && ex.some(e => !e.isPlanned)) {
                weekAcc.typeDays[type]++;
                const done = ex.find(e => !e.isPlanned);
                if (done && weekAcc.typeMetric[type]) {
                    const cat = getTypeCategory(type);
                    if (cat === 'cardio' && done.distance) { weekAcc.typeMetric[type].values.push(done.distance); weekAcc.typeMetric[type].unit = done.distanceUnit || 'km'; }
                    else if (cat === 'bodyweight' && done.reps) { weekAcc.typeMetric[type].values.push(done.reps); weekAcc.typeMetric[type].unit = 'reps'; }
                    else if (cat === 'gym' && done.weight) { weekAcc.typeMetric[type].values.push(done.weight); weekAcc.typeMetric[type].unit = done.weightUnit || 'kg'; }
                    else if (cat === 'other' && done.otherRating) { weekAcc.typeMetric[type].values.push(done.otherRating); weekAcc.typeMetric[type].unit = '/10'; }
                }
            }
        });

        let row = `<tr class="week-day-row" data-week="${weekId}" style="display:none">
            <td class="col-date">${displayDate}</td>
            <td class="col-stat">${activeData.happiness ? `<div class="happy-pill">${activeData.happiness}</div>` : ''}</td>`;

        logData.customMetrics.forEach(m => {
            const mVal = activeData.customVals[m.name];
            let cellContent = "";
            if (mVal !== undefined && mVal !== null) {
                cellContent = m.type === 'slider' ? `<div class="happy-pill" style="background:#f1f5f9; color:#475569;">${mVal}</div>` : (mVal ? '✅' : '❌');
            }
            row += `<td class="col-stat">${cellContent}</td>`;
        });

        logData.types.forEach(type => {
            const exercise = activeData.exercises[type] ? activeData.exercises[type][0] : null;
            let displaySymbol = '';
            if (exercise) {
                const cat = getTypeCategory(type);
            let metricLabel = '';
            if (cat === 'cardio' && exercise.distance) metricLabel = `${exercise.distance}${exercise.distanceUnit || 'km'}`;
            else if (cat === 'bodyweight' && exercise.reps) metricLabel = `${exercise.reps} reps`;
            else if (cat === 'gym' && exercise.weight) metricLabel = `${exercise.weight}${exercise.weightUnit || 'kg'}`;
            else if (cat === 'other' && exercise.otherRating) metricLabel = `${exercise.otherRating}/10`;
            const distLabel = metricLabel ? `<div class="dist-label">${metricLabel}</div>` : '';
                displaySymbol = exercise.isPlanned ?
                    `<div class="tick-cell plan" title="Planned item. Click to verify execution." onclick="window.quickCompletePlan(${exercise.id})">?</div>` :
                    `<div class="tick-cell done" onclick="window.editEntry(${exercise.id})">✓</div>${distLabel}`;
            }
            row += `<td>${displaySymbol}</td>`;
        });
        weekRowsHTML += row + `</tr>`;

        if (dayOfWeek === 1) {
            allHTML += emitWeekSummary(weekAcc, weekId) + weekRowsHTML + `<tr style="height:16px;"><td colspan="100"></td></tr>`;
            weekAcc = freshAcc(); weekId = null; weekRowsHTML = '';
        }
    }
    if (weekAcc.days > 0) {
        allHTML += emitWeekSummary(weekAcc, weekId) + weekRowsHTML;
    }
    body.innerHTML = allHTML;
};

// --- GENERAL CLOSURES & UTILITIES ---
const catOptions = (selected) => TYPE_CATEGORIES.map(c => `<option value="${c.value}" ${c.value === selected ? 'selected' : ''}>${c.label}</option>`).join('');

window.showTypeModal = () => {
    const container = document.getElementById('typeList');
    container.innerHTML = logData.types.map((type, idx) => `
        <div class="type-item" style="display:flex; gap:8px; margin-bottom:8px; align-items:center;">
            <input type="text" value="${type}" id="type-input-${idx}" style="flex:1;">
            <select id="type-cat-${idx}" style="width:110px; padding:6px; border-radius:8px; border:1px solid var(--border); font-size:0.75rem;">${catOptions(getTypeCategory(type))}</select>
            <button onclick="window.renameType(${idx})" class="nav-btn btn-secondary" style="font-size:0.65rem; padding:4px 10px;">Save</button>
            <button onclick="window.removeType(${idx})" style="background:#fee2e2; color:#ef4444; font-size:0.65rem; padding:4px 10px;" class="nav-btn">✕</button>
        </div>`).join('');
    document.getElementById('typeModal').style.display = 'flex';
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
window.toggleWeek = (weekId) => {
    const rows = document.querySelectorAll(`.week-day-row[data-week="${weekId}"]`);
    const icon = document.getElementById(`icon-${weekId}`);
    const isHidden = rows.length > 0 && rows[0].style.display === 'none';
    rows.forEach(r => r.style.display = isHidden ? '' : 'none');
    if (icon) icon.textContent = isHidden ? '▼' : '▶';
};
window.selectMark = (v) => { window.tempMark = v; document.querySelectorAll('.rate-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-val') == v)); };
