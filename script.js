import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, updateDoc, onSnapshot, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
const PIN = "1234";

let currentProject = "fast-5k";
let localRuns = [];
let unsubscribe = null;

// --- AUTH ---
window.isAdmin = () => sessionStorage.getItem('isAdmin') === 'true';
window.openLogin = () => document.getElementById('login-overlay').style.display = 'flex';
window.closeLogin = () => document.getElementById('login-overlay').style.display = 'none';
window.checkPin = () => {
    if (document.getElementById('pinInput').value === PIN) {
        sessionStorage.setItem('isAdmin', 'true');
        location.reload();
    } else alert("Wrong PIN");
};

// --- RENDER ---
const renderApp = () => {
    const listContainer = document.getElementById('runList');
    const heroContainer = document.querySelector('.latest-run-hero');
    listContainer.innerHTML = "";

    if (window.isAdmin()) {
        document.getElementById('admin-ui').style.display = 'block';
        document.getElementById('admin-lock').innerText = "🔓";
    }

    // Latest Run Hero
    const completed = localRuns.filter(r => r.includes("@done"));
    if (completed.length > 0) {
        const latest = completed[completed.length - 1];
        const task = latest.replace(/@w\d+/gi, "").replace(/@done/gi, "").replace(/@date\(.*?\)/gi, "").trim();
        const dateMatch = latest.match(/@date\((.*?)\)/i);
        heroContainer.innerHTML = `
            <div class="strava-card premium">
                <h4>Latest Run</h4>
                <h2>${task}</h2>
                <div class="card-footer">
                    <span class="run-date">Completed ${dateMatch ? dateMatch[1] : ''}</span>
                    <a href="#" class="view-strava">View Strava →</a>
                </div>
            </div>`;
    } else { heroContainer.innerHTML = ""; }

    // Grouping by Week
    const groups = {};
    localRuns.forEach((runStr, index) => {
        const weekMatch = runStr.match(/@w(\d+)/i);
        const weekNum = weekMatch ? weekMatch[1] : "1";
        if (!groups[weekNum]) groups[weekNum] = [];
        groups[weekNum].push({ raw: runStr, index });
    });

    // Render Sections
    Object.keys(groups).sort((a,b) => a - b).forEach(weekNum => {
        const title = document.createElement('h3');
        title.className = "section-title";
        title.innerText = weekNum === "0" ? "BACKLOG" : `WEEK ${weekNum}`;
        listContainer.appendChild(title);

        const ul = document.createElement('ul');
        ul.className = "current-list";
        ul.setAttribute('data-week', weekNum);

        groups[weekNum].forEach(item => {
            const isDone = item.raw.includes("@done");
            const dateMatch = item.raw.match(/@date\((.*?)\)/i);
            const cleanText = item.raw.replace(/@w\d+/gi, "").replace(/@done/gi, "").replace(/@date\(.*?\)/gi, "").trim();

            const li = document.createElement('li');
            if (isDone) li.classList.add('done');
            li.innerHTML = `
                <div class="task-info" onclick="window.toggleDone(${item.index})">
                    <span class="task-text">${cleanText}</span>
                    ${dateMatch ? `<span class="completion-date">Done: ${dateMatch[1]}</span>` : ""}
                </div>
                ${window.isAdmin() ? `<button class="delete-btn" onclick="window.deleteRun(${item.index})">✕</button>` : ""}
            `;
            ul.appendChild(li);
        });

        listContainer.appendChild(ul);

        if (window.isAdmin()) {
            new Sortable(ul, {
                group: 'shared',
                animation: 150,
                ghostClass: 'sortable-ghost',
                onEnd: window.saveNewOrder
            });
        }
    });

    window.syncDropdown();
};

// --- ACTIONS ---
window.toggleDone = async (i) => {
    if (!window.isAdmin()) return;
    let runs = [...localRuns];
    if (runs[i].includes("@done")) {
        runs[i] = runs[i].replace("@done", "").replace(/@date\(.*?\)/gi, "").trim();
    } else {
        const d = new Date();
        const dateStr = `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`;
        runs[i] = `${runs[i]} @done @date(${dateStr})`;
    }
    await updateDoc(doc(db, "plans", currentProject), { runs });
};

window.saveNewOrder = async () => {
    const updated = [];
    document.querySelectorAll('.current-list').forEach(ul => {
        const week = ul.getAttribute('data-week');
        ul.querySelectorAll('li').forEach(li => {
            const text = li.querySelector('.task-text').innerText;
            const done = li.classList.contains('done') ? " @done" : "";
            const dateSpan = li.querySelector('.completion-date');
            const date = dateSpan ? ` @date(${dateSpan.innerText.replace('Done: ', '')})` : "";
            updated.push(`${text} @w${week}${done}${date}`);
        });
    });
    await updateDoc(doc(db, "plans", currentProject), { runs: updated });
};

window.addRun = async () => {
    const input = document.getElementById('runInput');
    if (!input.value) return;
    await updateDoc(doc(db, "plans", currentProject), { runs: [...localRuns, input.value] });
    input.value = "";
};

window.deleteRun = async (i) => {
    if (!confirm("Delete?")) return;
    let runs = [...localRuns];
    runs.splice(i, 1);
    await updateDoc(doc(db, "plans", currentProject), { runs });
};

window.syncDropdown = async () => {
    const select = document.getElementById('projectSelect');
    const snap = await getDocs(collection(db, "plans"));
    if (select.options.length !== snap.size) {
        select.innerHTML = "";
        snap.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.innerText = `🏃‍♂️ ${d.id.replace(/-/g, ' ')}`;
            opt.selected = (d.id === currentProject);
            select.appendChild(opt);
        });
    }
};

window.handleProjectChange = (id) => window.loadProject(id);
window.loadProject = (id) => {
    if (unsubscribe) unsubscribe();
    currentProject = id;
    unsubscribe = onSnapshot(doc(db, "plans", id), (snap) => {
        if (snap.exists()) { localRuns = snap.data().runs || []; renderApp(); }
    });
};

window.restartProject = async () => {
    if (!confirm("Reset progress?")) return;
    const cleaned = localRuns.map(r => r.replace("@done", "").replace(/@date\(.*?\)/gi, "").trim());
    await updateDoc(doc(db, "plans", currentProject), { runs: cleaned });
};

window.loadProject(currentProject);


