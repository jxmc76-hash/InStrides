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
let logData = { types: ["SIT", "YOGA", "RUN", "SWIM", "LIFT"], entries: [] };
let editingId = null;
let chartInstance = null;
window.tempMark = 1;

// --- CHART LOGIC ---
const drawHappinessChart = (labels, values) => {
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById('happinessChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                borderColor: '#ff5500',
                backgroundColor: 'rgba(255, 85, 0, 0.05)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointRadius: 4,
                pointBackgroundColor: '#ff5500'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { min: 1, max: 10, ticks: { stepSize: 1 } },
                x: { grid: { display: false } }
            }
        }
    });
};

// --- RENDER LOGIC ---
const renderApp = () => {
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

    const sortedDates = Object.keys(entriesByDate).sort((a,b) => new Date(a) - new Date(b));
    const today = new Date();
    const firstDate = sortedDates.length > 0 ? new Date(sortedDates[0]) : new Date();

    // Prepare Chart (Last 14 days)
    const chartLabels = [];
    const chartValues = [];
    const chartStart = new Date();
    chartStart.setDate(chartStart.getDate() - 13);
    for (let i = 0; i < 14; i++) {
        const d = new Date(chartStart);
        d.setDate(d.getDate() + i);
        const key = d.toISOString().split('T')[0];
        chartLabels.push(d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));
        chartValues.push(entriesByDate[key]?.happiness || 5);
    }

    body.innerHTML = "";
    for (let d = new Date(today); d >= firstDate; d.setDate(d.getDate() - 1)) {
        const key = d.toISOString().split('T')[0];
        const displayDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', weekday: 'short' });
        const dayData = entriesByDate[key] || { happiness: null, exercises: {} };

        let row = `<tr><td>${displayDate}</td><td>${dayData.happiness ? `<div class="happy-pill">${dayData.happiness}</div>` : ''}</td>`;
        logData.types.forEach(t => {
            const ex = dayData.exercises[t] || [];
            row += `<td>${ex.map(i => `<div class="entry-pill int-${i.mark}" onclick="window.editEntry(${i.id})"><p class="entry-desc">${i.details || 'View'}</p></div>`).join('')}</td>`;
        });
        body.innerHTML += row + `</tr>`;
    }
    drawHappinessChart(chartLabels, chartValues);
};

// --- ACTIONS ---
window.showInputModal = () => {
    editingId = null;
    document.getElementById('modalDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('modalHappiness').value = 5;
    document.getElementById('happyVal').innerText = 5;
    document.getElementById('modalDetails').value = "";
    document.getElementById('modalType').innerHTML = `<option value="NONE">No Exercise</option>` + logData.types.map(t => `<option value="${t}">${t}</option>`).join('');
    document.getElementById('inputModal').style.display = 'flex';
    document.getElementById('deleteEntryBtn').style.display = 'none';
    window.selectMark(1);
};

window.editEntry = (id) => {
    const e = logData.entries.find(i => i.id === id);
    if (!e) return;
    editingId = id;
    document.getElementById('modalDate').value = e.date;
    document.getElementById('modalHappiness').value = e.happiness || 5;
    document.getElementById('happyVal').innerText = e.happiness || 5;
    document.getElementById('modalDetails').value = e.details || "";
    document.getElementById('modalType').innerHTML = `<option value="NONE">No Exercise</option>` + logData.types.map(t => `<option value="${t}" ${t===e.type?'selected':''}>${t}</option>`).join('');
    document.getElementById('inputModal').style.display = 'flex';
    document.getElementById('deleteEntryBtn').style.display = 'block';
    window.selectMark(e.mark || 1);
};

window.saveExercise = async () => {
    const data = {
        date: document.getElementById('modalDate').value,
        happiness: parseInt(document.getElementById('modalHappiness').value),
        type: document.getElementById('modalType').value,
        details: document.getElementById('modalDetails').value,
        mark: window.tempMark,
        id: editingId || Date.now()
    };
    if (editingId) {
        const idx = logData.entries.findIndex(i => i.id === editingId);
        logData.entries[idx] = data;
    } else {
        logData.entries.push(data);
    }
    await setDoc(doc(db, "logs", LOG_ID), logData);
    window.closeModal('inputModal');
};

window.deleteEntry = async () => {
    if (!confirm("Delete this?")) return;
    logData.entries = logData.entries.filter(i => i.id !== editingId);
    await setDoc(doc(db, "logs", LOG_ID), logData);
    window.closeModal('inputModal');
};

window.showTypeModal = () => {
    const list = document.getElementById('typeList');
    list.innerHTML = logData.types.map((t, i) => `
        <div style="display:flex; gap:10px; margin-bottom:10px;">
            <input type="text" value="${t}" id="t-in-${i}" style="flex:1; padding:8px; border-radius:8px; border:1px solid #ddd;">
            <button onclick="window.renameType(${i})" class="nav-btn btn-secondary">Rename</button>
            <button onclick="window.removeType(${i})" class="nav-btn btn-secondary" style="color:red">✕</button>
        </div>
    `).join('');
    document.getElementById('typeModal').style.display = 'flex';
};

window.addType = async () => {
    const val = document.getElementById('newTypeInput').value.toUpperCase().trim();
    if (val && !logData.types.includes(val)) {
        logData.types.push(val);
        await updateDoc(doc(db, "logs", LOG_ID), { types: logData.types });
        document.getElementById('newTypeInput').value = "";
        window.showTypeModal();
    }
};

window.renameType = async (i) => {
    const old = logData.types[i];
    const n = document.getElementById(`t-in-${i}`).value.toUpperCase().trim();
    if (n && n !== old) {
        logData.types[i] = n;
        logData.entries = logData.entries.map(e => e.type === old ? { ...e, type: n } : e);
        await setDoc(doc(db, "logs", LOG_ID), logData);
        window.showTypeModal();
    }
};

window.removeType = async (i) => {
    if (!confirm("Delete category?")) return;
    logData.types.splice(i, 1);
    await updateDoc(doc(db, "logs", LOG_ID), { types: logData.types });
    window.showTypeModal();
};

window.closeModal = (id) => document.getElementById(id).style.display = 'none';
window.selectMark = (v) => { window.tempMark = v; document.querySelectorAll('.rate-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-val') == v)); };

// Initialize
onSnapshot(doc(db, "logs", LOG_ID), (snap) => {
    if (snap.exists()) { logData = snap.data(); renderApp(); }
    else { setDoc(doc(db, "logs", LOG_ID), { types: ["SIT", "YOGA", "RUN", "SWIM", "LIFT"], entries: [] }); }
});
