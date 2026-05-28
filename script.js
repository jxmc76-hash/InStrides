import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, onSnapshot, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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

let LOG_ID = null; 
let logData = { types: ["RUN", "YOGA", "GYM", "SWIM"], customMetrics: [], entries: [] };
let editingId = null;
let unsubSnapshot = null;
window.tempMark = 1;
let isPlannedStrategy = false; 
let dynamicMetricValues = {};

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
    }
});

window.handleAuth = async (action) => {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const errorEl = document.getElementById('authError');
    errorEl.innerText = "";
    if(!email || !password) return errorEl.innerText = "Complete all layout fields.";
    try {
        if (action === 'login') await signInWithEmailAndPassword(auth, email, password);
        else await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) { errorEl.innerText = err.message.replace("Firebase: ", ""); }
};
window.handleSignOut = () => signOut(auth);

const attachRealtimeListener = () => {
    if(unsubSnapshot) unsubSnapshot();
    unsubSnapshot = onSnapshot(doc(db, "logs", LOG_ID), (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            logData = { types: data.types || [], customMetrics: data.customMetrics || [], entries: data.entries || [] };
            renderMatrix();
            if(document.getElementById('viewInsights').classList.contains('active')) renderInsights();
        } else {
            setDoc(doc(db, "logs", LOG_ID), { types: ["RUN", "YOGA", "GYM", "SWIM"], customMetrics: [], entries: [] });
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
    document.getElementById('inputModal').style.display = 'flex';
    window.selectMark(1);
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
    window.selectMark(entry.mark || 1);
    document.getElementById('inputModal').style.display = 'flex';
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
    const entryData = {
        date: document.getElementById('modalDate').value,
        happiness: isPlannedStrategy ? null : parseInt(document.getElementById('modalHappiness').value),
        type: document.getElementById('modalType').value,
        details: document.getElementById('modalDetails').value,
        mark: isPlannedStrategy ? null : window.tempMark, 
        isPlanned: isPlannedStrategy,
        customMetricData: isPlannedStrategy ? {} : { ...dynamicMetricValues },
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

// --- ADVANCED CORRELATION INSIGHTS GENERATOR ---
const renderInsights = () => {
    const completed = logData.entries.filter(e => !e.isPlanned);
    const storyContainer = document.getElementById('correlationStories');
    
    if (completed.length < 3) {
        storyContainer.innerHTML = `<p class="neutral-msg">Gathering a larger history baseline (minimum 3 logs) to process mathematical correlations.</p>`;
        return;
    }

    let sumHappy = 0, countHappy = 0, workCount = 0;
    const typeMap = {}; logData.types.forEach(t => typeMap[t] = 0);
    
    let happyOnWorkoutDay = [], happyOffWorkoutDay = [];
    let customMetricCorrelations = {};
    logData.customMetrics.forEach(m => customMetricCorrelations[m.name] = { high: [], low: [] });

    completed.forEach(e => {
        const happy = e.happiness;
        if (happy) { sumHappy += happy; countHappy++; }
        
        const hasWorkout = e.type && e.type !== "NONE";
        if (hasWorkout) { 
            workCount++; 
            typeMap[e.type] = (typeMap[e.type] || 0) + 1; 
        }

        if (happy) {
            if (hasWorkout) happyOnWorkoutDay.push(happy); else happyOffWorkoutDay.push(happy);
            
            if (e.customMetricData) {
                logData.customMetrics.forEach(m => {
                    const mVal = e.customMetricData[m.name];
                    if (mVal !== undefined) {
                        if (m.type === 'slider' && mVal >= 7) customMetricCorrelations[m.name].high.push(happy);
                        if (m.type === 'slider' && mVal <= 4) customMetricCorrelations[m.name].low.push(happy);
                        if (m.type === 'binary' && mVal === true) customMetricCorrelations[m.name].high.push(happy);
                        if (m.type === 'binary' && mVal === false) customMetricCorrelations[m.name].low.push(happy);
                    }
                });
            }
        }
    });

    const calcAvg = (arr) => arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : null;
    let storiesHTML = "";
    
    const exOn = calcAvg(happyOnWorkoutDay), exOff = calcAvg(happyOffWorkoutDay);
    if(exOn && exOff && Math.abs(exOn - exOff) > 0.2) {
        storiesHTML += `<div class="story-item">Days involving physical activity average a happiness level of <b>${exOn.toFixed(1)}</b> versus <b>${exOff.toFixed(1)}</b> on rest days.</div>`;
    }

    logData.customMetrics.forEach(m => {
        const hAvg = calcAvg(customMetricCorrelations[m.name].high);
        const lAvg = calcAvg(customMetricCorrelations[m.name].low);
        if (hAvg && lAvg && Math.abs(hAvg - lAvg) > 0.3) {
            storiesHTML += `<div class="story-item">Your custom parameter <b>${m.name.replace(/-/g, ' ')}</b> signals a prominent correlation variance of <b>${Math.abs(hAvg - lAvg).toFixed(1)}</b> points to your happiness.</div>`;
        }
    });

    storyContainer.innerHTML = storiesHTML || `<p class="neutral-msg">No sharp mathematical shifts identified yet. Keep logging to isolate correlations.</p>`;

    document.getElementById('statHappy').innerText = countHappy ? (sumHappy/countHappy).toFixed(1) : '-';
    document.getElementById('statTotal').innerText = workCount;

    const chart = document.getElementById('activityChart');
    const maxVal = Math.max(...Object.values(typeMap), 1);
    chart.innerHTML = logData.types.map(t => `
        <div class="bar-row">
            <div class="bar-label">${t}</div>
            <div class="bar-outer"><div class="bar-inner" style="width:${((typeMap[t] || 0)/maxVal)*100}%"></div></div>
            <div style="width:20px; font-weight:800; font-size:0.7rem;">${typeMap[t] || 0}</div>
        </div>`).join('');
};

// --- CORE RENDERING MATRIX ENGINE ---
const renderMatrix = () => {
    const body = document.getElementById('matrixBody');
    const header = document.getElementById('headerRow');
    if (!body || !header) return;
    
    let headerHTML = `<th class="col-date">Date</th><th class="col-stat">Happiness</th>`;
    logData.customMetrics.forEach(m => { headerHTML += `<th class="col-stat">${m.name.replace(/-/g, ' ')}</th>`; });
    logData.types.forEach(t => { headerHTML += `<th>${t}</th>`; });
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

    body.innerHTML = "";
    for (let d = new Date(futureBuffer); d >= firstDate; d.setDate(d.getDate() - 1)) {
        const dateKey = d.toISOString().split('T')[0];
        const dayOfWeek = d.getDay();
        const dayData = entriesByDate[dateKey];
        if (!dayData && d > new Date()) continue;

        const activeData = dayData || { happiness: null, customVals: {}, exercises: {} };
        const displayDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', weekday: 'short' });

        let row = `<tr>
            <td class="col-date">${displayDate}</td>
            <td class="col-stat">${activeData.happiness ? `<div class="happy-pill">${activeData.happiness}</div>` : ''}</td>`;
            
        // Render custom metrics data cells
        logData.customMetrics.forEach(m => {
            const mVal = activeData.customVals[m.name];
            let cellContent = "";
            if (mVal !== undefined && mVal !== null) {
                cellContent = m.type === 'slider' ? `<div class="happy-pill" style="background:#f1f5f9; color:#475569;">${mVal}</div>` : (mVal ? '✅' : '❌');
            }
            row += `<td class="col-stat">${cellContent}</td>`;
        });

        // Render standard track execution checkmarks
        logData.types.forEach(type => {
            const exercise = activeData.exercises[type] ? activeData.exercises[type][0] : null;
            let displaySymbol = '';
            if (exercise) {
                displaySymbol = exercise.isPlanned ? 
                    `<div class="tick-cell plan" title="Planned item. Click to verify execution." onclick="window.quickCompletePlan(${exercise.id})">?</div>` : 
                    `<div class="tick-cell done" onclick="window.editEntry(${exercise.id})">✓</div>`;
            }
            row += `<td>${displaySymbol}</td>`;
        });
        body.innerHTML += row + `</tr>`;
        if (dayOfWeek === 1) body.innerHTML += `<tr style="background:#f8fafc; height:4px;"><td colspan="100"></td></tr>`;
    }
};

// --- TYPE MODALS STYLING ROUTINES ---
window.showTypeModal = () => {
    const container = document.getElementById('typeList');
    container.innerHTML = logData.types.map((type, idx) => `
        <div class="type-item" style="display:flex; gap:8px; margin-bottom:8px;">
            <input type="text" value="${type}" id="type-input-${idx}" style="flex:1;">
            <button onclick="window.renameType(${idx})" class="nav-btn btn-secondary" style="font-size:0.65rem; padding:4px 10px;">Rename</button>
            <button onclick="window.removeType(${idx})" style="background:#fee2e2; color:#ef4444; font-size:0.65rem; padding:4px 10px;" class="nav-btn">✕</button>
        </div>`).join('');
    document.getElementById('typeModal').style.display = 'flex';
};
window.addType = async () => {
    const input = document.getElementById('newTypeInput');
    const val = input.value.toUpperCase().trim();
    if (val && !logData.types.includes(val)) {
        logData.types.push(val);
        await updateDoc(doc(db, "logs", LOG_ID), { types: logData.types });
        input.value = ""; window.showTypeModal();
    }
};
window.renameType = async (idx) => {
    const old = logData.types[idx];
    const n = document.getElementById(`type-input-${idx}`).value.toUpperCase().trim();
    if (!n || n === old) return;
    logData.types[idx] = n;
    logData.entries = logData.entries.map(e => e.type === old ? { ...e, type: n } : e);
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
window.closeModal = (id) => { document.getElementById(id).style.display = 'none'; };
window.selectMark = (v) => { window.tempMark = v; document.querySelectorAll('.rate-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-val') == v)); };
