import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence, doc, onSnapshot, setDoc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"; // v96
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, browserLocalPersistence, setPersistence, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

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
let logData = { types: ["RUN", "YOGA", "GYM", "SWIM"], typeCategories: {}, customMetrics: [], entries: [], dailyNotes: {} };

const TYPE_CATEGORIES = [
    { value: 'cardio',      label: 'Distance' },
    { value: 'bodyweight',  label: 'Reps' },
    { value: 'gym',         label: 'Weight' },
    { value: 'time',        label: 'Time' },
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

const attachRealtimeListener = () => {
    if(unsubSnapshot) unsubSnapshot();
    unsubSnapshot = onSnapshot(doc(db, "logs", LOG_ID), (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            logData = { types: data.types || [], typeCategories: data.typeCategories || {}, customMetrics: data.customMetrics || [], entries: data.entries || [], dailyNotes: data.dailyNotes || {} };
            renderMatrix();
            renderStreak();
            if(document.getElementById('viewInsights').classList.contains('active')) renderInsights();
        } else if (!snap.metadata.fromCache) {
            // Only create a fresh log if the server has confirmed no document exists.
            // A cache-only "not found" can happen before the server responds, and must
            // never trigger an overwrite of real data.
            setDoc(doc(db, "logs", LOG_ID), { types: ["RUN", "YOGA", "GYM", "SWIM"], typeCategories: { RUN: 'cardio', YOGA: 'other', GYM: 'gym', SWIM: 'cardio' }, customMetrics: [{ name: 'SLEEP', type: 'slider' }, { name: 'ENERGY', type: 'slider' }], entries: [] });
        }
    });
};

// --- STREAK TRACKING ---
const renderStreak = () => {
    const badge = document.getElementById('streakBadge');
    if (!badge) return;

    const loggedDates = new Set();
    logData.entries.forEach(e => { if (!e.isPlanned) loggedDates.add(e.date); });

    let streak = 0;
    const d = new Date();
    const todayKey = d.toISOString().split('T')[0];
    if (!loggedDates.has(todayKey)) d.setDate(d.getDate() - 1);
    while (loggedDates.has(d.toISOString().split('T')[0])) {
        streak++;
        d.setDate(d.getDate() - 1);
    }

    if (streak >= 2) {
        badge.style.display = 'flex';
        badge.innerHTML = `🔥 <span>${streak} day streak</span>`;
    } else {
        badge.style.display = 'none';
    }
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
    if (!container) { dynamicMetricValues = {}; return; }
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
    ['log', 'insights', 'help'].forEach(t => {
        document.getElementById(`view${t.charAt(0).toUpperCase()+t.slice(1)}`)?.classList.toggle('active', t === tab);
    });
    document.getElementById('tabLog')?.classList.toggle('active', tab === 'log');
    document.getElementById('tabInsights')?.classList.toggle('active', tab === 'insights');
    if (tab === 'insights') renderInsights();
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
    document.getElementById('metricCardio').style.display     = cat === 'cardio'     ? 'block' : 'none';
    document.getElementById('metricBodyweight').style.display = cat === 'bodyweight' ? 'block' : 'none';
    document.getElementById('metricGym').style.display        = cat === 'gym'        ? 'block' : 'none';
    document.getElementById('metricTime').style.display       = cat === 'time'       ? 'block' : 'none';
    document.getElementById('metricOther').style.display      = cat === 'other'      ? 'block' : 'none';
};

window.showInputModal = () => {
    editingId = null;
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
    const entryData = {
        date: document.getElementById('modalDate').value,
        happiness: null,
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
        duration: cat === 'time' && !isNaN(durationVal) && durationVal > 0 ? durationVal : null,
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

const renderTrailingCharts = (completed) => {
    const container = document.getElementById('trailingChartsContainer');
    if (!container) return;

    // Destroy any previous trailing charts
    Object.keys(chartInstances).filter(k => k.startsWith('trailing-')).forEach(k => destroyChart(k));
    container.innerHTML = '';

    // Build daily lookup: date → { happiness, customMetricData }
    const byDate = {};
    completed.forEach(e => {
        if (!byDate[e.date]) byDate[e.date] = { happiness: null, customVals: {} };
        if (e.happiness) byDate[e.date].happiness = e.happiness;
        if (e.customMetricData) Object.assign(byDate[e.date].customVals, e.customMetricData);
    });

    // Collect all dates in range (last 90 days)
    const allDates = [];
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 89);
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
                points.labels.push(new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));
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
        { key: 'trailing-MOOD', label: 'Mood', accessor: d => d?.happiness },
        ...logData.customMetrics
            .filter(m => m.type === 'slider')
            .map(m => ({ key: `trailing-${m.name}`, label: m.name.charAt(0) + m.name.slice(1).toLowerCase(), accessor: d => d?.customVals[m.name] }))
    ];

    series.forEach(({ key, label, accessor }, idx) => {
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
                    y: { min: 1, max: 10, ticks: { stepSize: 1 }, grid: { color: '#f1f5f9' }, title: { display: true, text: 'Score (1–10)', font: { size: 11 }, color: '#8a8a8a' } },
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
    renderWeeklyRecap(completed);
    renderAchievements(completed);
    renderWeekCompare(completed);
    renderDistanceChart(completed);
    renderTrailingCharts(completed);
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
    const thisWeekStart = new Date(getWeekStart(todayStr));
    const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(thisWeekStart); lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
    const lwStartKey = lastWeekStart.toISOString().split('T')[0];
    const lwEndKey = lastWeekEnd.toISOString().split('T')[0];

    const weekEntries = completed.filter(e => e.date >= lwStartKey && e.date <= lwEndKey);
    if (weekEntries.length === 0) {
        el.innerHTML = `<p class="neutral-msg" style="padding:10px 0">No data logged for last week yet.</p>`;
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

    const weekLabel = lastWeekStart.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

    el.innerHTML = `
        <div class="recap-header">Week of ${weekLabel}</div>
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

const renderAchievements = (completed) => {
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

    el.innerHTML = ACHIEVEMENTS.map(a => {
        const unlocked = a.check(stats);
        return `<div class="achievement-card ${unlocked ? 'unlocked' : 'locked'}">
            <div class="achievement-icon">${a.icon}</div>
            <div class="achievement-name">${a.name}</div>
            <div class="achievement-desc">${a.desc}</div>
        </div>`;
    }).join('');
};

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
    
    const catOrder = { cardio: 0, gym: 1, bodyweight: 2, time: 3, other: 4 };
    const sortedTypes = [...logData.types].sort((a, b) => (catOrder[getTypeCategory(a)] ?? 9) - (catOrder[getTypeCategory(b)] ?? 9));

    let headerHTML = `<th class="col-date">Date</th>`;
    logData.customMetrics.forEach(m => { headerHTML += `<th class="col-stat">${m.name.replace(/-/g, ' ')}</th>`; });
    sortedTypes.forEach(t => { headerHTML += `<th class="dynamic-type-th cat-${getTypeCategory(t)}">${t}</th>`; });
    header.innerHTML = headerHTML;

    const entriesByDate = {};
    logData.entries.forEach(e => {
        if (!entriesByDate[e.date]) entriesByDate[e.date] = { happiness: null, customVals: {}, exercises: {} };
        if (e.happiness && !e.isPlanned) entriesByDate[e.date].happiness = e.happiness;
        if (!e.isPlanned && e.customMetricData) Object.assign(entriesByDate[e.date].customVals, e.customMetricData);
        if (e.type !== "NONE") {
            if (!entriesByDate[e.date].exercises[e.type]) entriesByDate[e.date].exercises[e.type] = [];
            entriesByDate[e.date].exercises[e.type].push(e);
        }
    });

    const dates = Object.keys(entriesByDate).sort((a,b) => new Date(b) - new Date(a));
    const firstDate = dates.length > 0 ? new Date(dates[dates.length-1]) : new Date();
    const futureBuffer = new Date(); futureBuffer.setDate(futureBuffer.getDate() + 5);
    const latestEntryDate = dates.length > 0 ? new Date(dates[0]) : null;
    if (latestEntryDate && latestEntryDate > futureBuffer) futureBuffer.setTime(latestEntryDate.getTime());

    const emitWeekSummary = (acc, weekId) => {
        if (acc.days === 0) return '';
        const monDate = new Date(getWeekStart(weekId));
        const weekLabel = monDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        let html = `<tr class="week-summary-row" onclick="window.toggleWeek('${weekId}')" title="Click to expand/collapse">
            <td class="col-date week-summary-label"><span class="week-toggle-icon" id="icon-${weekId}">▶</span> ${weekLabel} →</td>`;

        logData.customMetrics.forEach(m => {
            const vals = acc.customVals[m.name] || [];
            let cell = '';
            if (vals.length) {
                if (m.type === 'slider') cell = (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1);
                else { const count = vals.filter(v=>v===true).length; cell = count > 0 ? `${count}d` : ''; }
            }
            html += `<td class="col-stat">${cell}</td>`;
        });

        sortedTypes.forEach(type => {
            const count = acc.typeDays[type] || 0;
            const m = acc.typeMetric?.[type];
            let cell = count > 0 ? count + 'd' : '';
            if (m && m.values.length > 0) {
                const cat = getTypeCategory(type);
                const total = m.values.reduce((a,b)=>a+b,0);
                const avg = total / m.values.length;
                const fmt = (n) => n % 1 === 0 ? n : n.toFixed(1);
                if (cat === 'other') cell += ` · ${fmt(avg)}${m.unit}`;
                else if (cat === 'time') cell += ` · ${fmt(total)}${m.unit}`;
                else cell += ` · ${fmt(total)}${m.unit}`;
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
        typeMetric: Object.fromEntries(sortedTypes.map(t => [t, { values: [], unit: '' }])),
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

    const hideFuture = localStorage.getItem('hideFuturePlans') === '1';
    const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);

    for (let d = new Date(futureBuffer); d >= firstDate; d.setDate(d.getDate() - 1)) {
        const dateKey = d.toISOString().split('T')[0];
        const dayOfWeek = d.getDay();
        const dayData = entriesByDate[dateKey];
        if (!dayData && d > new Date()) continue;
        if (hideFuture && d > todayMidnight) continue;

        if (!weekId) {
            weekId = dateKey;
            if (!firstWeekId) firstWeekId = weekId;
            if (getWeekStart(weekId) >= currentWeekStart) expandWeekIds.add(weekId);
        }

        const activeData = dayData || { happiness: null, customVals: {}, exercises: {} };
        const displayDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', weekday: 'short' });

        weekAcc.days++;
        logData.customMetrics.forEach(m => {
            const v = activeData.customVals[m.name];
            if (v !== undefined && v !== null) weekAcc.customVals[m.name].push(v);
        });
        sortedTypes.forEach(type => {
            const ex = activeData.exercises[type];
            if (ex && ex.some(e => !e.isPlanned)) {
                weekAcc.typeDays[type]++;
                const done = ex.find(e => !e.isPlanned);
                if (done && weekAcc.typeMetric[type]) {
                    const cat = getTypeCategory(type);
                    if (cat === 'cardio' && done.distance) { weekAcc.typeMetric[type].values.push(done.distance); weekAcc.typeMetric[type].unit = done.distanceUnit || 'km'; }
                    else if (cat === 'bodyweight' && done.reps) { weekAcc.typeMetric[type].values.push(done.reps); weekAcc.typeMetric[type].unit = 'reps'; }
                    else if (cat === 'gym' && done.weight) { weekAcc.typeMetric[type].values.push(done.weight); weekAcc.typeMetric[type].unit = done.weightUnit || 'kg'; }
                    else if (cat === 'time' && done.duration) { weekAcc.typeMetric[type].values.push(done.duration); weekAcc.typeMetric[type].unit = 'min'; }
                    else if (cat === 'other' && done.otherRating) { weekAcc.typeMetric[type].values.push(done.otherRating); weekAcc.typeMetric[type].unit = '/10'; }
                }
            }
        });

        dayCounter++;
        const altClass = dayCounter % 2 === 0 ? ' alt-row' : '';
        const noteText = (logData.dailyNotes && logData.dailyNotes[dateKey]) || '';
        const noteIcon = noteText ? ' 📝' : '';
        let row = `<tr class="week-day-row${altClass}" data-week="${weekId}" style="display:none">
            <td class="col-date editable-cell" title="${noteText.replace(/"/g, '&quot;')}" onclick="window.editDailyNote('${dateKey}')">${displayDate}${noteIcon}</td>`;

        logData.customMetrics.forEach(m => {
            const mVal = activeData.customVals[m.name];
            let cellContent = "";
            if (mVal !== undefined && mVal !== null) {
                cellContent = m.type === 'slider'
                    ? `<div class="happy-pill">${mVal}</div>`
                    : (mVal ? '✅' : '❌');
            } else {
                cellContent = `<div class="cell-empty">+</div>`;
            }
            if (m.type === 'binary') {
                row += `<td class="col-stat editable-cell" onclick="window.toggleBinaryCell('${dateKey}','${m.name}',${mVal === true})">${cellContent}</td>`;
            } else {
                row += `<td class="col-stat editable-cell" onclick="window.openCellEdit(event,'${dateKey}','metric-${m.name}',${mVal !== undefined && mVal !== null ? mVal : 'null'})">${cellContent}</td>`;
            }
        });

        sortedTypes.forEach(type => {
            const exercise = activeData.exercises[type] ? activeData.exercises[type][0] : null;
            let displaySymbol = '';
            if (exercise) {
                const cat = getTypeCategory(type);
            let metricLabel = '';
            if (cat === 'cardio' && exercise.distance) metricLabel = `${exercise.distance}${exercise.distanceUnit || 'km'}`;
            else if (cat === 'bodyweight' && exercise.reps) metricLabel = `${exercise.reps} reps`;
            else if (cat === 'gym' && exercise.weight) metricLabel = `${exercise.weight}${exercise.weightUnit || 'kg'}`;
            else if (cat === 'time' && exercise.duration) metricLabel = `${exercise.duration}min`;
            else if (cat === 'other' && exercise.otherRating) metricLabel = `${exercise.otherRating}/10`;
            const distLabel = metricLabel ? `<div class="dist-label">${metricLabel}</div>` : '';
                if (exercise.isPlanned) {
                    const noteText = (exercise.details || '').trim();
                    const noteLabel = noteText ? `<div class="plan-note" title="${noteText.replace(/"/g, '&quot;')}">${noteText}</div>` : '';
                    displaySymbol = `<div class="tick-cell plan cat-${cat}" title="View plan details" onclick="window.editEntry(${exercise.id})">?</div>${noteLabel}`;
                } else {
                    displaySymbol = `<div class="tick-cell done cat-${cat}" onclick="window.editEntry(${exercise.id})">✓</div>${distLabel}`;
                }
            }
            row += `<td class="${exercise ? '' : 'empty-type-cell'}" ${exercise ? '' : `data-quick-date="${dateKey}" data-quick-type="${type}"`}>${displaySymbol}</td>`;
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
    expandWeekIds.forEach(wid => window.toggleWeek(wid));
    if (expandWeekIds.size === 0 && firstWeekId) window.toggleWeek(firstWeekId);

    body.onclick = (e) => {
        const td = e.target.closest('td[data-quick-date]');
        if (!td) return;
        window.quickAddEntry(td.dataset.quickDate, td.dataset.quickType);
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

    const label = field === 'mood' ? 'Mood' : field.replace('metric-','').replace(/-/g,' ');
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

window.saveCellValue = async (dateKey, field, value) => {
    closeCellPopover();
    let record = logData.entries.find(e => e.date === dateKey && !e.isPlanned && e.type === 'NONE');
    if (!record) {
        record = { id: Date.now(), date: dateKey, happiness: null, type: 'NONE', isPlanned: false, customMetricData: {} };
        logData.entries.push(record);
    }
    if (field === 'mood') {
        record.happiness = value;
    } else {
        if (!record.customMetricData) record.customMetricData = {};
        record.customMetricData[field.replace('metric-', '')] = value;
    }
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
        record = { id: Date.now(), date: dateKey, happiness: null, type: 'NONE', isPlanned: false, customMetricData: {} };
        logData.entries.push(record);
    }
    if (!record.customMetricData) record.customMetricData = {};
    record.customMetricData[metricName] = newVal;
    renderMatrix();
    await setDoc(doc(db, 'logs', LOG_ID), logData);
};
window.toggleSettings = () => { document.getElementById('settingsMenu').classList.toggle('open'); };
window.closeSettings = () => { document.getElementById('settingsMenu').classList.remove('open'); };
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

const celebrate = () => {
    const el = document.createElement('div');
    el.className = 'celebrate-burst';
    el.textContent = '🎉';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 900);
};
window.selectMark = (v) => { window.tempMark = v; document.querySelectorAll('.rate-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-val') == v)); };

// --- DAILY NOTES ---
window.editDailyNote = async (dateKey) => {
    if (!logData.dailyNotes) logData.dailyNotes = {};
    const current = logData.dailyNotes[dateKey] || '';
    const note = prompt(`Daily note for ${dateKey}:`, current);
    if (note === null) return; // cancelled
    if (note.trim() === '') {
        delete logData.dailyNotes[dateKey];
    } else {
        logData.dailyNotes[dateKey] = note.trim();
    }
    renderMatrix();
    await setDoc(doc(db, 'logs', LOG_ID), logData);
};

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
