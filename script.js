import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
let unsubscribe = null;
let localRuns = [];

// --- STRAVA RSS LOGIC ---
async function fetchStravaRSS() {
    const rssUrl = `https://feedmyride.net/activities/5266316`; 
    const container = document.getElementById('strava-content');
    if (!container) return;

    try {
        const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`);
        const data = await response.json();

        if (data.status === 'ok' && data.items?.length > 0) {
            const lastRun = data.items[0];
            const dateStr = new Date(lastRun.pubDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            container.innerHTML = `
                <a href="${lastRun.link}" target="_blank" class="activity-link">
                    <div class="activity-title">${lastRun.title}</div>
                    <div class="activity-meta">Tracked on ${dateStr}</div>
                </a>`;
        } else { container.innerHTML = "Get out there!"; }
    } catch (e) { container.innerHTML = "Feed currently unavailable."; }
}

// --- FIREBASE LOGIC ---
window.syncDropdown = async () => {
  const querySnapshot = await getDocs(collection(db, "plans"));
  const select = document.getElementById('projectSelect');
  const showArchived = document.getElementById('showArchived').checked;
  let optionsHtml = "";
  querySnapshot.forEach((doc) => {
    const data = doc.data();
    if (showArchived || !data.archived) {
        optionsHtml += `<option value="${doc.id}">${data.archived ? '📁 ' : '🏃‍♂️ '}${doc.id.replace(/-/g, ' ')}</option>`;
    }
  });
  select.innerHTML = optionsHtml + `<option value="ADD_NEW">+ Add new plan...</option>`;
  select.value = currentProject;
};

window.loadProject = (projectId) => {
  if (unsubscribe) unsubscribe();
  currentProject = projectId;
  unsubscribe = onSnapshot(doc(db, "plans", projectId), (docSnap) => {
    const listContainer = document.getElementById('runList');
    listContainer.innerHTML = "";
    if (!docSnap.exists()) return;
    const data = docSnap.data();
    localRuns = data.runs || [];
    document.getElementById('archiveBtn').innerText = data.archived ? "Unarchive" : "Archive";

    const groups = {};
    localRuns.forEach((run, index) => {
      const weekMatch = run.match(/@w(\d+)/i);
      const label = weekMatch ? `Week ${weekMatch[1]}` : "Current";
      if (!groups[label]) groups[label] = [];
      groups[label].push({ text: run, originalIndex: index });
    });

    Object.keys(groups).sort().forEach(week => {
      const section = document.createElement('div');
      section.innerHTML = `<div class="week-heading"><h3>${week}</h3></div>`;
      const ul = document.createElement('ul');
      groups[week].forEach(item => {
        const li = document.createElement('li');
        if (item.text.includes("@done")) li.classList.add('done');
        const dateMatch = item.text.match(/@date\((.*?)\)/i);
        const cleanText = item.text.replace(/@w\d+/gi, "").replace(/@date\(.*?\)/gi, "").replace(/@done/gi, "").trim();
        li.innerHTML = `<div class="task-info" onclick="window.toggleByIndex(${item.originalIndex})">
            <span class="task-text">${cleanText}</span>
            ${dateMatch ? `<span class="completion-date">Done: ${dateMatch[1]}</span>` : ""}
        </div><button class="delete-btn" onclick="window.deleteByIndex(${item.originalIndex})">✕</button>`;
        ul.appendChild(li);
      });
      section.appendChild(ul);
      listContainer.appendChild(section);
    });
  });
};

window.toggleByIndex = async (index) => {
  const runs = [...localRuns];
  if (runs[index].includes("@done")) {
    runs[index] = runs[index].replace("@done", "").replace(/@date\(.*?\)/gi, "").trim();
  } else {
    const d = new Date();
    runs[index] = `${runs[index]} @done @date(${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })})`;
  }
  await updateDoc(doc(db, "plans", currentProject), { runs });
};

window.addRun = async () => {
  const input = document.getElementById('runInput');
  if (!input.value.trim()) return;
  await updateDoc(doc(db, "plans", currentProject), { runs: [...localRuns, input.value.trim()] });
  input.value = "";
};

window.handleProjectChange = (val) => {
    if (val === "ADD_NEW") { /* prompt and setDoc logic */ }
    else { window.loadProject(val); }
};

// Start
fetchStravaRSS();
window.syncDropdown();
window.loadProject(currentProject);


