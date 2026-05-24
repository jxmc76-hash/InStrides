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
let logData = { types: ["RUN", "YOGA", "GYM", "SWIM"], entries: [] };
let editingId = null;
let unsubSnapshot = null;
window.tempMark = 1;
let currentBin = { food: false, web: false };
let isPlannedStrategy = false; 

// --- USER SESSION CONTROLS ---
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
    
    if(!email || !password) return errorEl.innerText = "Complete all entry fields.";
    try {
        if (action === 'login') await signInWithEmailAndPassword(auth, email, password);
        else await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
        errorEl.innerText = err.message.replace("Firebase: ", "");
    }
};

window.handleSignOut = () => signOut(auth);

const attachRealtimeListener = () => {
    if(unsubSnapshot) unsubSnapshot();
    unsubSnapshot = onSnapshot(doc(db, "logs", LOG_ID), (snap) => {
        if (snap.exists()) {
            logData = snap.data();
            renderMatrix();
            if(document.getElementById('viewInsights').classList.contains('active')) renderInsights();
        } else {
            setDoc(doc(db, "logs", LOG_ID), { types: ["RUN", "YOGA", "GYM", "SWIM"], entries: [] });
        }
    });
};

// --- STRATEGY SWITCHER (LOG VS PLAN) ---
window.setStrategy = (wantsPlanned) => {
    isPlannedStrategy = wantsPlanned;
    document.getElementById('stratPlan').classList.toggle('active', wantsPlanned);
    document.getElementById('stratDone').classList.toggle('active', !wantsPlanned);
    
    // Smoothly mask or unmask metric rows if only setting a target plan
    document.getElementById('performanceMetrics').style.display = wantsPlanned ? 'none' : 'block';
    document.getElementById('intensityRow').style.display = wantsPlanned ? 'none' : 'flex';
};

// --- DATA LOGIC ---
window.showInputModal = () => {
    editingId = null;
    document.getElementById('deleteEntryBtn').style.display = "none";
    document.getElementById('modalDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('modalHappiness').value = 5;
    document.getElementById('happyVal').innerText = 5;
    window.toggleBin('food', false); window.toggleBin('web', false);
    document.getElementById('modalDetails').value = "";
    window.setStrategy(false);
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
    window.toggleBin('food', !!entry.food); window.toggleBin('web', !!entry.web);
    document.getElementById('modalDetails').value = entry.details || "";
    window.setStrategy(!!entry.isPlanned);
    document.getElementById('modalType').innerHTML = `<option value="NONE">No Category Allocation</option>` + logData.types.map(t => `<option value="${t}" ${t === entry.type ? 'selected' : ''}>${t}</option>`).join('');
    window.selectMark(entry.mark || 1);
    document.getElementById('inputModal').style.display = 'flex';
};

window.quickCompletePlan = async (id) => {
    const idx = logData.entries.findIndex(e => e.id === id);
    if(idx === -1) return;
    logData.entries[idx].isPlanned = false;
    logData.entries[idx].happiness = 5; // Set base functional values to edit later
    logData.entries[idx].food = true;
    logData.entries[idx].web = true;
    logData.entries[idx].mark = 2; 
    await setDoc(doc(db, "logs", LOG_ID), logData);
};

window.saveExercise = async () => {
    const entryData = {
        date: document.getElementById('modalDate').value,
        happiness: isPlannedStrategy ? null : parseInt(document.getElementById('modalHappiness').value),
        food: isPlannedStrategy ? false : currentBin.food, 
        web: isPlannedStrategy ? false : currentBin.web,
        type: document.getElementById('modalType').value,
        details: document.getElementById('modalDetails').value,
        mark: isPlannedStrategy ? null : window.tempMark, 
        isPlanned: isPlannedStrategy,
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

// --- RENDER MATRIX ENGINE ---
const renderMatrix = () => {
    const body = document.getElementById('matrixBody');
    const header = document.getElementById('headerRow');
    if (!body || !header) return;
    
    header.innerHTML = `<th class="col-date">Date</th><th class="col-stat">Happiness</th><th class="col-stat">Food</th><th class="col-stat">Web</th>` + logData.types.map(t => `<th>${t}</th>`).join('');

    const entriesByDate = {};
    logData.entries.forEach(e => {
        if (!entriesByDate[e.date]) entriesByDate[e.date] = { happiness: null, food: false, web: false, exercises: {} };
        if (e.happiness && !e.isPlanned) entriesByDate[e.date].happiness = e.happiness;
        if (!e.isPlanned) {
            if(e.food) entriesByDate[e.date].food = true;
            if(e.web) entriesByDate[e.date].web = true;
        }
        if (e.type !== "NONE") {
            if (!entriesByDate[e.date].exercises[e.type]) entriesByDate[e.date].exercises[e.type] = [];
            entriesByDate[e.date].exercises[e.type].push(e);
        }
    });

    const dates = Object.keys(entriesByDate).sort((a,b) => new Date(b) - new Date(a));
    const firstDate = dates.length > 0 ? new Date(dates[dates.length-1]) : new Date();
    
    // Render out ahead 5 days into future coordinates to track planned strategies
    const futureBuffer = new Date();
    futureBuffer.setDate(futureBuffer.getDate() + 5);

    body.innerHTML = "";
    for (let d = new Date(futureBuffer); d >= firstDate; d.setDate(d.getDate() - 1)) {
        const dateKey = d.toISOString().split('T')[0];
        const dayOfWeek = d.getDay();
        const dayData = entriesByDate[dateKey];
        
        // Skip future dates if absolutely no upcoming plans exist to keep space tidy
        if (!dayData && d > new Date()) continue;

        const activeData = dayData || { happiness: null, food: false, web: false, exercises: {} };
        const displayDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', weekday: 'short' });

        let row = `<tr>
            <td class="col-date">${displayDate}</td>
            <td class="col-stat">${activeData.happiness ? `<div class="happy-pill">${activeData.happiness}</div>` : ''}</td>
            <td class="col-stat">${activeData.food ? '✅' : '❌'}</td>
            <td class="col-stat">${activeData.web ? '✅' : '❌'}</td>`;
            
        logData.types.forEach(type => {
            const exercise = activeData.exercises[type] ? activeData.exercises[type][0] : null;
            let displaySymbol = '';
            if (exercise) {
                if (exercise.isPlanned) {
                    displaySymbol = `<div class="tick-cell plan" title="Planned. Click to confirm done." onclick="window.quickCompletePlan(${exercise.id})">?</div>`;
                } else {
                    displaySymbol = `<div class="tick-cell done" onclick="window.editEntry(${exercise.id})">✓</div>`;
                }
            }
            row += `<td>${displaySymbol}</td>`;
        });
        body.innerHTML += row + `</tr>`;
        if (dayOfWeek === 1) body.innerHTML += `<tr style="background:#f8fafc; height:4px;"><td colspan="50"></td></tr>`;
    }
};

// --- INSIGHTS ENGINE ---
const renderInsights = () => {
    const completedEntries = logData.entries.filter(e => !e.isPlanned);
    if (completedEntries.length === 0) {
        document.getElementById('activityChart').innerHTML = "<p style='text-align:center; color:#94a3b8; padding:20px;'>No tracked performance items yet.</p>";
        return;
    }

    let sumHappy = 0, countHappy = 0, foodYes = 0, webYes = 0, workCount = 0;
    const typeMap = {}; logData.types.forEach(t => typeMap[t] = 0);

    completedEntries.forEach(e => {
        if (e.happiness) { sumHappy += e.happiness; countHappy++; }
        if (e.food) foodYes++;
        if (e.web) webYes++;
        if (e.type && e.type !== "NONE") { workCount++; typeMap[e.type] = (typeMap[e.type] || 0) + 1; }
    });

    document.getElementById('statHappy').innerText = countHappy ? (sumHappy/countHappy).toFixed(1) : '-';
    document.getElementById('statFood').innerText = Math.round((foodYes/completedEntries.length)*100) + '%';
    document.getElementById('statWeb').innerText = Math.round((webYes/completedEntries.length)*100) + '%';
    document.getElementById('statTotal').innerText = workCount;

    const chart = document.getElementById('activityChart');
    const maxVal = Math.max(...Object.values(typeMap), 1);
    chart.innerHTML = logData.types.map(t => `
        <div class="bar-row">
            <div class="bar-label">${t}</div>
            <div class="bar-outer"><div class="bar-inner" style="width:${((typeMap[t] || 0)/maxVal)*100}%"></div></div>
            <div style="width:20px; font-weight:800; font-size:0.7rem;">${typeMap[t] || 0}</div>
        </div>
    `).join('');
};

// --- TYPE MODALS & ROUTINES ---
window.switchTab = (tab) => {
    document.getElementById('viewLog').classList.toggle('active', tab === 'log');
    document.getElementById('viewInsights').classList.toggle('active', tab === 'insights');
    document.getElementById('tabLog').classList.toggle('active', tab === 'log');
    document.getElementById('tabInsights').classList.toggle('active', tab === 'insights');
    if (tab === 'insights') renderInsights();
};
window.toggleBin = (key, val) => {
    currentBin[key] = val;
    document.getElementById(`${key}Yes`).classList.toggle('active', val);
    document.getElementById(`${key}No`).classList.toggle('active', !val);
};
window.showTypeModal = () => {
    const container = document.getElementById('typeList');
    if (!container || !logData.types) return;
    container.innerHTML = logData.types.map((type, idx) => `
        <div class="type-item" style="display:flex; gap:8px; margin-bottom:8px;">
            <input type="text" value="${type}" id="type-input-${idx}" style="flex:1;">
            <button onclick="window.renameType(${idx})" class="nav-btn btn-secondary" style="font-size:0.65rem; padding:4px 10px;">Rename</button>
            <button onclick="window.removeType(${idx})" style="background:#fee2e2; color:#ef4444; font-size:0.65rem; padding:4px 10px;" class="nav-btn">✕</button>
        </div>
    `).join('');
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
