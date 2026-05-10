import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, onSnapshot, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

const LOG_ID = "single-master-log";
let logData = { types: ["RUN", "YOGA", "GYM", "SWIM"], entries: [] };
let editingId = null;
window.tempMark = 1;
let currentBin = { food: false, web: false };

// --- Tab Navigation ---
window.switchTab = (tab) => {
    document.querySelectorAll('.view-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    if (tab === 'log') {
        document.getElementById('viewLog').classList.add('active');
        document.getElementById('tabLog').classList.add('active');
    } else {
        document.getElementById('viewInsights').classList.add('active');
        document.getElementById('tabInsights').classList.add('active');
        renderInsights();
    }
};

// --- Insights Logic ---
const renderInsights = () => {
    if (!logData.entries.length) return;

    let totalHap = 0, hapCount = 0;
    let foodYes = 0, webYes = 0;
    const activityCounts = {};
    logData.types.forEach(t => activityCounts[t] = 0);

    logData.entries.forEach(e => {
        if (e.happiness) { totalHap += e.happiness; hapCount++; }
        if (e.food) foodYes++;
        if (e.web) webYes++;
        if (e.type !== "NONE") activityCounts[e.type] = (activityCounts[e.type] || 0) + 1;
    });

    // Update Cards
    document.getElementById('statHappy').innerText = hapCount ? (totalHap / hapCount).toFixed(1) : '-';
    document.getElementById('statFood').innerText = Math.round((foodYes / logData.entries.length) * 100) + '%';
    document.getElementById('statWeb').innerText = Math.round((webYes / logData.entries.length) * 100) + '%';
    
    // Simple Streak logic (days with any exercise)
    let streak = 0;
    const dates = logData.entries.filter(e => e.type !== "NONE").map(e => e.date).sort().reverse();
    if (dates.length) streak = 1; // Simplified for this build

    document.getElementById('statStreak').innerText = dates.length + ' Workouts';

    // Activity Chart
    const chart = document.getElementById('activityChart');
    const max = Math.max(...Object.values(activityCounts), 1);
    chart.innerHTML = logData.types.map(t => `
        <div class="bar-row">
            <div class="bar-label">${t}</div>
            <div class="bar-outer">
                <div class="bar-inner" style="width: ${(activityCounts[t]/max)*100}%"></div>
            </div>
            <div style="font-size:0.7rem; font-weight:800">${activityCounts[t]}</div>
        </div>
    `).join('');
};

// --- Entry Logic (Same as v37) ---
window.toggleBin = (key, val) => {
    currentBin[key] = val;
    document.getElementById(`${key}Yes`).classList.toggle('active', val);
    document.getElementById(`${key}No`).classList.toggle('active', !val);
};

window.showInputModal = () => {
    editingId = null;
    document.getElementById('deleteEntryBtn').style.display = "none";
    document.getElementById('modalDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('modalHappiness').value = 5;
    document.getElementById('happyVal').innerText = 5;
    window.toggleBin('food', false);
    window.toggleBin('web', false);
    document.getElementById('modalDetails').value = "";
    document.getElementById('modalType').innerHTML = `<option value="NONE">No Exercise</option>` + logData.types.map(t => `<option value="${t}">${t}</option>`).join('');
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
    window.toggleBin('food', !!entry.food);
    window.toggleBin('web', !!entry.web);
    document.getElementById('modalDetails').value = entry.details || "";
    document.getElementById('modalType').innerHTML = `<option value="NONE">No Exercise</option>` + logData.types.map(t => `<option value="${t}" ${t === entry.type ? 'selected' : ''}>${t}</option>`).join('');
    window.selectMark(entry.mark || 1);
    document.getElementById('inputModal').style.display = 'flex';
};

window.saveExercise = async () => {
    const entryData = {
        date: document.getElementById('modalDate').value,
        happiness: parseInt(document.getElementById('modalHappiness').value),
        food: currentBin.food,
        web: currentBin.web,
        type: document.getElementById('modalType').value,
        details: document.getElementById('modalDetails').value,
        mark: window.tempMark,
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

const renderMatrix = () => {
    const body = document.getElementById('matrixBody');
    const header = document.getElementById('headerRow');
    header.innerHTML = `<th class="col-date">Date</th><th class="col-stat">Happiness</th><th class="col-stat">Food</th><th class="col-stat">Web</th>` + logData.types.map(t => `<th>${t}</th>`).join('');

    const entriesByDate = {};
    logData.entries.forEach(e => {
        if (!entriesByDate[e.date]) entriesByDate[e.date] = { happiness: null, food: false, web: false, exercises: {} };
        if (e.happiness) entriesByDate[e.date].happiness = e.happiness;
        entriesByDate[e.date].food = e.food;
        entriesByDate[e.date].web = e.web;
        if (e.type !== "NONE") {
            if (!entriesByDate[e.date].exercises[e.type]) entriesByDate[e.date].exercises[e.type] = [];
            entriesByDate[e.date].exercises[e.type].push(e);
        }
    });

    const dates = Object.keys(entriesByDate).sort((a,b) => new Date(b) - new Date(a));
    const firstDate = dates.length > 0 ? new Date(dates[dates.length-1]) : new Date();
    const today = new Date();

    body.innerHTML = "";
    for (let d = new Date(today); d >= firstDate; d.setDate(d.getDate() - 1)) {
        const dateKey = d.toISOString().split('T')[0];
        const dayOfWeek = d.getDay();
        const dayData = entriesByDate[dateKey] || { happiness: null, food: false, web: false, exercises: {} };

        const displayDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', weekday: 'short' });
        let row = `<tr>
            <td class="col-date">${displayDate}</td>
            <td class="col-stat">${dayData.happiness ? `<div class="happy-pill">${dayData.happiness}</div>` : ''}</td>
            <td class="col-stat">${dayData.food ? '✅' : '❌'}</td>
            <td class="col-stat">${dayData.web ? '✅' : '❌'}</td>`;
            
        logData.types.forEach(type => {
            const exercise = dayData.exercises[type] ? dayData.exercises[type][0] : null;
            row += `<td>${exercise ? `<div class="tick-cell" onclick="window.editEntry(${exercise.id})">✓</div>` : ''}</td>`;
        });
        body.innerHTML += row + `</tr>`;

        if (dayOfWeek === 1) {
            body.innerHTML += `<tr style="background:#f8fafc; height:4px;"><td colspan="30"></td></tr>`;
        }
    }
};

window.closeModal = (id) => document.getElementById(id).style.display = 'none';
window.selectMark = (v) => { window.tempMark = v; document.querySelectorAll('.rate-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-val') == v)); };

onSnapshot(doc(db, "logs", LOG_ID), (snap) => {
    if (snap.exists()) { logData = snap.data(); renderMatrix(); }
    else { setDoc(doc(db, "logs", LOG_ID), { types: ["RUN", "YOGA", "GYM", "SWIM"], entries: [] }); }
});
