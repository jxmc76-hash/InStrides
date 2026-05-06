import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, onSnapshot, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
let chartInstance = null;
window.tempMark = 1;

// --- CHART ENGINE ---
const updateHappinessChart = (dates, happinessValues) => {
    const canvas = document.getElementById('happinessChart');
    if (!canvas) return; // Safety check
    
    const ctx = canvas.getContext('2d');
    
    // Destroy previous instance to allow re-drawing
    if (chartInstance) {
        chartInstance.destroy();
    }

    // If no data, don't draw
    if (dates.length === 0) return;

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates, 
            datasets: [{
                label: 'Happiness',
                data: happinessValues,
                borderColor: '#ff5500',
                backgroundColor: 'rgba(255, 85, 0, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: '#ff5500'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { min: 1, max: 10, ticks: { stepSize: 1, color: '#64748b' }, grid: { color: '#f1f5f9' } },
                x: { ticks: { color: '#64748b' }, grid: { display: false } }
            }
        }
    });
};

// --- DATA HELPERS ---
window.showInputModal = () => {
    editingId = null;
    document.getElementById('deleteEntryBtn').style.display = "none";
    document.getElementById('modalDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('modalHappiness').value = 5;
    document.getElementById('happyVal').innerText = 5;
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
    document.getElementById('modalDetails').value = entry.details || "";
    document.getElementById('modalType').innerHTML = `<option value="NONE">No Exercise</option>` + logData.types.map(t => `<option value="${t}" ${t === entry.type ? 'selected' : ''}>${t}</option>`).join('');
    window.selectMark(entry.mark || 1);
    document.getElementById('inputModal').style.display = 'flex';
};

window.saveExercise = async () => {
    const entryData = {
        date: document.getElementById('modalDate').value,
        happiness: parseInt(document.getElementById('modalHappiness').value),
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

window.deleteEntry = async () => {
    if (confirm("Delete this entry?")) {
        logData.entries = logData.entries.filter(e => e.id !== editingId);
        await setDoc(doc(db, "logs", LOG_ID), logData);
        window.closeModal('inputModal');
    }
};

window.showTypeModal = () => {
    const container = document.getElementById('typeList');
    container.innerHTML = logData.types.map((type, idx) => `
        <div class="type-item" style="display:flex; gap:8px; margin-bottom:12px;">
            <input type="text" value="${type}" id="type-input-${idx}" style="flex:1;">
            <button onclick="window.renameType(${idx})" class="nav-btn btn-secondary" style="font-size:0.6rem">RENAME</button>
            <button onclick="window.removeType(${idx})" class="nav-btn btn-secondary" style="color:red; font-size:0.6rem">✕</button>
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
        input.value = "";
        window.showTypeModal();
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
    if (confirm(`Delete category?`)) {
        logData.types.splice(idx, 1);
        await updateDoc(doc(db, "logs", LOG_ID), { types: logData.types });
        window.showTypeModal();
    }
};

// --- RENDER & CHART SYNC ---
const renderMatrix = () => {
    const body = document.getElementById('matrixBody');
    const header = document.getElementById('headerRow');
    header.innerHTML = `<th class="col-date">Date</th><th class="col-happiness">Happiness</th>` + logData.types.map(t => `<th>${t}</th>`).join('');

    const entriesByDate = {};
    logData.entries.forEach(e => {
        if (!entriesByDate[e.date]) entriesByDate[e.date] = { happiness: null, exercises: {} };
        if (typeof e.happiness === 'number') entriesByDate[e.date].happiness = e.happiness;
        if (e.type !== "NONE") {
            if (!entriesByDate[e.date].exercises[e.type]) entriesByDate[e.date].exercises[e.type] = [];
            entriesByDate[e.date].exercises[e.type].push(e);
        }
    });

    const dates = Object.keys(entriesByDate).sort((a,b) => new Date(a) - new Date(b)); // ASC for Chart
    const firstDate = dates.length > 0 ? new Date(dates[0]) : new Date();
    const today = new Date();

    // Prepare chart data (Last 14 Days)
    const chartLabels = [];
    const chartValues = [];

    body.innerHTML = "";
    // Table loop (DESC for table view)
    for (let d = new Date(today); d >= firstDate; d.setDate(d.getDate() - 1)) {
        const dateKey = d.toISOString().split('T')[0];
        const displayDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' });
        const dayData = entriesByDate[dateKey] || { happiness: null, exercises: {} };

        let row = `<tr>
            <td class="col-date">${displayDate}</td>
            <td class="col-happiness">${dayData.happiness !== null ? `<div class="happy-pill">${dayData.happiness}</div>` : ''}</td>`;
            
        logData.types.forEach(type => {
            const exercises = dayData.exercises[type] || [];
            const content = exercises.map(ex => `
                <div class="entry-pill int-${ex.mark}" onclick="window.editEntry(${ex.id})">
                    <p class="entry-desc">${ex.details || 'View'}</p>
                </div>
            `).join('');
            row += `<td>${content}</td>`;
        });
        body.innerHTML += row + `</tr>`;
    }

    // Chart loop (ASC for chronological flow)
    const chartStart = new Date();
    chartStart.setDate(chartStart.getDate() - 13); // Last 14 days
    for (let i = 0; i < 14; i++) {
        const tempDate = new Date(chartStart);
        tempDate.setDate(tempDate.getDate() + i);
        const dateKey = tempDate.toISOString().split('T')[0];
        const label = tempDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        
        chartLabels.push(label);
        chartValues.push(entriesByDate[dateKey]?.happiness || 5);
    }

    updateHappinessChart(chartLabels, chartValues);
};

window.closeModal = (id) => document.getElementById(id).style.display = 'none';
window.selectMark = (v) => { window.tempMark = v; document.querySelectorAll('.rate-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-val') == v)); };

onSnapshot(doc(db, "logs", LOG_ID), (snap) => {
    if (snap.exists()) { logData = snap.data(); renderMatrix(); }
    else { setDoc(doc(db, "logs", LOG_ID), { types: ["RUN", "YOGA", "GYM", "SWIM"], entries: [] }); }
});
