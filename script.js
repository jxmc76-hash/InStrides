import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, collection, getDocs, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

let currentProject = "fast-5k";
let localRuns = [];
let unsubscribe = null;

// --- EXPORTED FUNCTIONS (Attached to window so buttons work) ---

window.fetchStravaRSS = async () => {
    const rssUrl = "https://feedmyride.net/activities/5266316";
    const container = document.getElementById('strava-content');
    try {
        const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`);
        const data = await response.json();
        if (data.status === 'ok' && data.items?.length > 0) {
            const last = data.items[0];
            const date = new Date(last.pubDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            container.innerHTML = `<a href="${last.link}" target="_blank" class="activity-link">
                <div class="activity-title">${last.title}</div>
                <div class="activity-meta">Tracked on ${date}</div>
            </a>`;
        }
    } catch (e) { container.innerHTML = "Feed currently unavailable."; }
};

window.syncDropdown = async () => {
    const querySnapshot = await getDocs(collection(db, "plans"));
    const select = document.getElementById('projectSelect');
    const showArchived = document.getElementById('showArchived').checked;
    let options = "";
    querySnapshot.forEach(doc => {
        const d = doc.data();
        if (showArchived || !d.archived) {
            options += `<option value="${doc.id}">${d.archived ? '📁 ' : '🏃‍♂️ '}${doc.id.replace(/-/g, ' ')}</option>`;
        }
    });
    select.innerHTML = options + `<option value="ADD_NEW">+ Add new plan...</option>`;
    select.value = currentProject;
};

window.loadProject = (id) => {
    if (unsubscribe) unsubscribe();
    currentProject = id;
    unsubscribe = onSnapshot(doc(db, "plans", id), (snap) => {
        const list = document.getElementById('runList');
        list.innerHTML = "";
        if (!snap.exists()) return;
        localRuns = snap.data().runs || [];
        document.getElementById('archiveBtn').innerText = snap.data().archived ? "Unarchive" : "Archive";

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
                const date = item.text.match(/@date\((.*?)\)/i);
                const txt = item.text.replace(/@w\d+/gi, "").replace(/@date\(.*?\)/gi, "").replace(/@done/gi, "").trim();
                li.innerHTML = `<div class="task-info" onclick="window.toggleByIndex(${item.idx})">
                    <div class="task-text">${txt}</div>
                    ${date ? `<span class="completion-date">Done: ${date[1]}</span>` : ""}
                </div><button class="delete-btn" onclick="window.deleteByIndex(${item.idx})">✕</button>`;
                ul.appendChild(li);
            });
            div.appendChild(ul);
            list.appendChild(div);
        });
    });
};

window.handleProjectChange = (val) => {
    if (val === "ADD_NEW") {
        const name = prompt("New plan name:");
        if (name) {
            const id = name.toLowerCase().replace(/\s+/g, '-');
            setDoc(doc(db, "plans", id), { runs: [], archived: false }).then(() => {
                window.syncDropdown();
                window.loadProject(id);
            });
        } else { document.getElementById('projectSelect').value = currentProject; }
    } else { window.loadProject(val); }
};

window.toggleByIndex = async (i) => {
    const r = [...localRuns];
    if (r[i].includes("@done")) r[i] = r[i].replace("@done", "").replace(/@date\(.*?\)/gi, "").trim();
    else r[i] = `${r[i]} @done @date(${new Date().getDate()} ${new Date().toLocaleString('en-GB',{month:'short'})})`;
    await updateDoc(doc(db, "plans", currentProject), { runs: r });
};

window.addRun = async () => {
    const i = document.getElementById('runInput');
    if (!i.value.trim()) return;
    await updateDoc(doc(db, "plans", currentProject), { runs: [...localRuns, i.value.trim()] });
    i.value = "";
};

window.deleteByIndex = async (i) => {
    if(confirm("Delete this run?")) {
        const r = [...localRuns];
        r.splice(i, 1);
        await updateDoc(doc(db, "plans", currentProject), { runs: r });
    }
};

window.archiveCurrentProject = async () => {
    const docRef = doc(db, "plans", currentProject);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        await updateDoc(docRef, { archived: !snap.data().archived });
        window.syncDropdown();
    }
};

window.restartProject = async () => {
    if (confirm("Reset all runs in this plan?")) {
        const r = localRuns.map(run => run.replace("@done", "").replace(/@date\(.*?\)/gi, "").trim());
        await updateDoc(doc(db, "plans", currentProject), { runs: r });
    }
};

window.renameProject = async () => {
    const newName = prompt("New name:", currentProject);
    if (newName) {
        const newId = newName.toLowerCase().replace(/\s+/g, '-');
        const snap = await getDoc(doc(db, "plans", currentProject));
        await setDoc(doc(db, "plans", newId), snap.data());
        await deleteDoc(doc(db, "plans", currentProject));
        window.syncDropdown();
        window.loadProject(newId);
    }
};

window.deleteCurrentProject = async () => {
    if (confirm("Delete entire plan?")) {
        await deleteDoc(doc(db, "plans", currentProject));
        location.reload();
    }
};

// --- STARTUP ---
window.fetchStravaRSS();
window.syncDropdown();
window.loadProject(currentProject);

