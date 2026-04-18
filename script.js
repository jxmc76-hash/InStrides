import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, collection, getDocs, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- FIREBASE CONFIGURATION ---
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

// --- APP STATE ---
let currentProject = "fast-5k";
let localRuns = [];
let unsubscribe = null;
const PIN = "1234"; // Update this to your preferred passcode

// --- PASSKEY & ADMIN LOGIC ---
const isAdmin = () => sessionStorage.getItem('isAdmin') === 'true';

window.openLogin = () => {
    document.getElementById('login-overlay').style.display = 'flex';
};

window.closeLogin = () => {
    document.getElementById('login-overlay').style.display = 'none';
};

window.checkPin = () => {
    const input = document.getElementById('pinInput').value;
    if (input === PIN) {
        sessionStorage.setItem('isAdmin', 'true');
        location.reload(); // Refresh to inject admin UI and buttons
    } else {
        alert("Incorrect PIN. Access denied.");
    }
};

// --- STRAVA RSS FETCHING ---
window.fetchStravaRSS = async () => {
    const rssUrl = "https://feedmyride.net/activities/5266316";
    const container = document.getElementById('strava-content');
    if (!container) return;

    try {
        const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}&t=${Date.now()}`);
        const data = await res.json();

        if (data.status === 'ok' && data.items?.length > 0) {
            const last = data.items[0];
            const date = new Date(last.pubDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            
            container.innerHTML = `
                <a href="${last.link}" target="_blank" class="activity-link">
                    <span class="stat-label">LATEST RUN</span>
                    <div class="activity-title">${last.title}</div>
                    <div class="activity-footer">
                        <span>Completed ${date}</span>
                        <span>View Strava →</span>
                    </div>
                </a>`;
        } else {
            container.innerHTML = "No recent activity found.";
        }
    } catch (e) {
        console.error("Strava Fetch Error:", e);
        container.innerHTML = "Feed connection busy. Try again later.";
    }
};

// --- PROJECT MANAGEMENT ---
window.syncDropdown = async () => {
    const snap = await getDocs(collection(db, "plans"));
    const select = document.getElementById('projectSelect');
    const showArchived = document.getElementById('showArchived')?.checked || false;
    let options = "";

    snap.forEach(d => {
        const data = d.data();
        if (showArchived || !data.archived) {
            options += `<option value="${d.id}">${data.archived ? '📁 ' : '🏃‍♂️ '}${d.id.replace(/-/g, ' ')}</option>`;
        }
    });

    select.innerHTML = options + (isAdmin() ? `<option value="ADD_NEW">+ Add new plan...</option>` : "");
    select.value = currentProject;
};

window.loadProject = (id) => {
    if (unsubscribe) unsubscribe();
    currentProject = id;

    unsubscribe = onSnapshot(doc(db, "plans", id), (snap) => {
        const list = document.getElementById('runList');
        list.innerHTML = "";
        if (!snap.exists()) return;

        const data = snap.data();
        localRuns = data.runs || [];
        
        // Show/Hide Admin UI elements
        if (isAdmin()) {
            const adminUI = document.getElementById('admin-ui');
            const archiveBtn = document.getElementById('archiveBtn');
            const lockBtn = document.getElementById('lockBtn');
            
            if (adminUI) adminUI.style.display = 'block';
            if (archiveBtn) archiveBtn.innerText = data.archived ? "Unarchive" : "Archive";
            if (lockBtn) lockBtn.innerText = "🔓";
        }

        const groups = {};
        localRuns.forEach((r, i) => {
            const w = r.match(/@w(\d+)/i);
            const key = w ? `Week ${w[1]}` : "Current";
            if (!groups[key]) groups[key] = [];
            groups[key].push({ text: r, idx: i });
        });

        Object.keys(groups).sort((a,b) => (parseInt(a.replace(/\D/g,'')) || 0) - (parseInt(b.replace(/\D/g,'')) || 0)).forEach(week => {
            const div = document.createElement('div');
            div.innerHTML = `<div class="week-heading"><h3>${week}</h3></div>`;
            const ul = document.createElement('ul');

            groups[week].forEach(item => {
                const li = document.createElement('li');
                if (item.text.includes("@done")) li.classList.add('done');
                
                const dateMatch = item.text.match(/@date\((.*?)\)/i);
                const cleanText = item.text.replace(/@w\d+/gi, "").replace(/@date\(.*?\)/gi, "").replace(/@done/gi, "").trim();

                li.innerHTML = `
                    <div class="task-info" onclick="${isAdmin() ? `window.toggleByIndex(${item.idx})` : ''}">
                        <div class="task-text">${cleanText}</div>
                        ${dateMatch ? `<span class="completion-date">Done: ${dateMatch[1]}</span>` : ""}
                    </div>
                    ${isAdmin() ? `<button class="delete-btn" onclick="window.deleteByIndex(${item.idx})">✕</button>` : ""}
                `;
                ul.appendChild(li);
            });
            div.appendChild(ul);
            list.appendChild(div);
        });
    });
};

// --- DATA ACTIONS (Admin Only) ---
window.toggleByIndex = async (i) => {
    if (!isAdmin()) return;
    const r = [...localRuns];
    if (r[i].includes("@done")) {
        r[i] = r[i].replace("@done", "").replace(/@date\(.*?\)/gi, "").trim();
    } else {
        const d = new Date();
        const dateStr = `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`;
        r[i] = `${r[i]} @done @date(${dateStr})`;
    }
    await updateDoc(doc(db, "plans", currentProject), { runs: r });
};

window.addRun = async () => {
    if (!isAdmin()) return;
    const input = document.getElementById('runInput');
    if (!input.value.trim()) return;
    await updateDoc(doc(db, "plans", currentProject), { runs: [...localRuns, input.value.trim()] });
    input.value = "";
};

window.deleteByIndex = async (i) => {
    if (!isAdmin() || !confirm("Delete this specific run?")) return;
    const r = [...localRuns];
    r.splice(i, 1);
    await updateDoc(doc(db, "plans", currentProject), { runs: r });
};

window.handleProjectChange = (v) => {
    if (v === "ADD_NEW") {
        const n = prompt("Enter a name for the new plan:");
        if (n) {
            const id = n.toLowerCase().replace(/\s+/g, '-');
            setDoc(doc(db, "plans", id), { runs: [], archived: false }).then(() => {
                window.syncDropdown(); 
                window.loadProject(id);
            });
        }
    } else {
        window.loadProject(v);
    }
};

window.archiveCurrentProject = async () => {
    if (!isAdmin()) return;
    const docRef = doc(db, "plans", currentProject);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        await updateDoc(docRef, { archived: !snap.data().archived });
        window.syncDropdown();
    }
};

window.restartProject = async () => {
    if (!isAdmin() || !confirm("Clear all 'Done' status from this plan?")) return;
    const r = localRuns.map(run => run.replace("@done", "").replace(/@date\(.*?\)/gi, "").trim());
    await updateDoc(doc(db, "plans", currentProject), { runs: r });
};

window.renameProject = async () => {
    if (!isAdmin()) return;
    const n = prompt("New name for this plan:", currentProject.replace(/-/g, ' '));
    if (n) {
        const id = n.toLowerCase().replace(/\s+/g, '-');
        const snap = await getDoc(doc(db, "plans", currentProject));
        if (snap.exists()) {
            await setDoc(doc(db, "plans", id), snap.data());
            await deleteDoc(doc(db, "plans", currentProject));
            currentProject = id;
            window.syncDropdown(); 
            window.loadProject(id);
        }
    }
};

window.deleteCurrentProject = async () => {
    if (!isAdmin() || !confirm("Permanently delete this entire plan?")) return;
    await deleteDoc(doc(db, "plans", currentProject));
    location.reload();
};

// --- STARTUP ---
document.addEventListener('DOMContentLoaded', () => {
    window.fetchStravaRSS();
    window.syncDropdown();
    window.loadProject(currentProject);
});

