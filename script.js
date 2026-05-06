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

// --- Chart Logic ---
const updateHappinessChart = (dates, happinessValues) => {
    const ctx = document.getElementById('happinessChart').getContext('2d');
    
    if (chartInstance) {
        chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates.reverse(), // Show oldest to newest
            datasets: [{
                label: 'Happiness Trend',
                data: happinessValues.reverse(),
                borderColor: '#ff5500',
                backgroundColor: 'rgba(255, 85, 0, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4, // Smooth curve
                pointRadius: 4,
                pointBackgroundColor: '#ff5500'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    min: 1,
                    max: 10,
                    ticks: { stepSize: 1, color: '#64748b' },
                    grid: { color: '#f1f5f9' }
                },
                x: {
                    ticks: { color: '#64748b' },
                    grid: { display: false }
                }
            }
        }
    });
};

// --- [Previous Entry/Type Logic functions remain same as v33] ---
window.showInputModal = () => { /* ... */ };
window.editEntry = (id) => { /* ... */ };
window.saveExercise = async () => { /* ... */ };
window.deleteEntry = async () => { /* ... */ };
window.showTypeModal = () => { /* ... */ };
window.addType = async () => { /* ... */ };
window.renameType = async (idx) => { /* ... */ };
window.removeType = async (idx) => { /* ... */ };

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

    const dates = Object.keys(entriesByDate).sort((a,b) => new Date(b) - new Date(a));
    const firstDate = dates.length > 0 ? new Date(dates[dates.length-1]) : new Date();
    const today = new Date();

    const chartDates = [];
    const chartHappyValues = [];

    body.innerHTML = "";
    for (let d = new Date(today); d >= firstDate; d.setDate(d.getDate() - 1)) {
        const dateKey = d.toISOString().split('T')[0];
        const displayDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' });
        const dayData = entriesByDate[dateKey] || { happiness: null, exercises: {} };

        // Data for Chart (only last 14 days for clarity)
        if (chartDates.length < 14) {
            chartDates.push(d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));
            chartHappyValues.push(dayData.happiness || 5);
        }

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

    // Initialize Chart
    updateHappinessChart(chartDates, chartHappyValues);
};

window.closeModal = (id) => document.getElementById(id).style.display = 'none';
window.selectMark = (v) => { window.tempMark = v; document.querySelectorAll('.rate-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-val') == v)); };

onSnapshot(doc(db, "logs", LOG_ID), (snap) => {
    if (snap.exists()) { logData = snap.data(); renderMatrix(); }
    else { setDoc(doc(db, "logs", LOG_ID), { types: ["RUN", "YOGA", "GYM", "SWIM"], entries: [] }); }
});
