import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, getDocs, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

const toTitleCase = (str) => str.replace(/-/g, ' ').replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());

window.syncDropdown = async () => {
  const querySnapshot = await getDocs(collection(db, "plans"));
  const select = document.getElementById('projectSelect');
  const showArchived = document.getElementById('showArchived').checked;
  let optionsHtml = "";
  let firstAvailable = null;

  querySnapshot.forEach((doc) => {
    const data = doc.data();
    if (!firstAvailable && !data.archived) firstAvailable = doc.id;
    if (showArchived || !data.archived) {
        optionsHtml += `<option value="${doc.id}">${data.archived ? '📁 ' : '🏃‍♂️ '}${toTitleCase(doc.id)}</option>`;
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
      const weekMatch = run.match(/@w(?:eek)?\s?\(?(\d+)\)?/i);
      const label = weekMatch ? `Week ${weekMatch[1]}` : "Current";
      if (!groups[label]) groups[label] = [];
      groups[label].push({ text: run, originalIndex: index });
    });

    Object.keys(groups).sort((a,b) => (parseInt(a.replace(/\D/g,'')) || 0) - (parseInt(b.replace(/\D/g,'')) || 0)).forEach(week => {
      const section = document.createElement('div');
      section.innerHTML = `<div class="week-heading"><h3>${week}</h3></div>`;
      const ul = document.createElement('ul');
      groups[week].forEach((item) => {
        const li = document.createElement('li');
        if (item.text.includes("@done")) li.classList.add('done');
        const dateMatch = item.text.match(/@date\((.*?)\)/i);
        const cleanText = item.text.replace(/@w.*?(\d+)\)?/gi, "").replace(/@date\(.*?\)/gi, "").replace(/@done/gi, "").trim();
        li.innerHTML = `<div class="task-info" onclick="window.toggleByIndex(${item.originalIndex})"><span class="task-text">${cleanText}</span>${dateMatch ? `<span class="completion-date">Done: ${dateMatch[1]}</span>` : ""}</div><button class="delete-btn" onclick="window.deleteByIndex(${item.originalIndex})">✕</button>`;
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

window.deleteByIndex = async (index) => {
  const runs = [...localRuns];
  runs.splice(index, 1);
  await updateDoc(doc(db, "plans", currentProject), { runs });
};

window.handleProjectChange = async (val) => {
  if (val === "ADD_NEW") {
    const name = prompt("New plan name:");
    if (name) {
      const id = name.toLowerCase().replace(/\s+/g, '-');
      await setDoc(doc(db, "plans", id), { runs: [], archived: false });
      await window.syncDropdown();
      window.loadProject(id);
    }
  } else { window.loadProject(val); }
};

window.addRun = async () => {
  const input = document.getElementById('runInput');
  if (!input.value.trim()) return;
  const updatedRuns = [...localRuns, input.value.trim()];
  input.value = "";
  await updateDoc(doc(db, "plans", currentProject), { runs: updatedRuns });
};

(async () => { await window.syncDropdown(); window.loadProject(currentProject); })();

