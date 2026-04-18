import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

const dayOrder = { "mon": 1, "tue": 2, "wed": 3, "thu": 4, "fri": 5, "sat": 6, "sun": 7 };

window.loadProject = (projectId) => {
  if (unsubscribe) unsubscribe();
  const docRef = doc(db, "plans", projectId);
  
  unsubscribe = onSnapshot(docRef, (doc) => {
    const list = document.getElementById('runList');
    list.innerHTML = "";
    localRuns = doc.exists() ? doc.data().runs : [];
    
    const sortedRuns = [...localRuns].sort((a, b) => {
      const getDay = (str) => {
        const match = str.toLowerCase().match(/@planned\((.*?)\)/);
        if (!match) return 99;
        const day = match[1].substring(0,3);
        return dayOrder[day] || 99;
      };
      return getDay(a) - getDay(b);
    });

    sortedRuns.forEach((task) => {
      const li = document.createElement('li');
      let isDone = task.includes("@done");
      let cleanText = task.replace(" @done", "");
      const dateMatch = cleanText.match(/@planned\((.*?)\)/);
      if (dateMatch) {
        cleanText = cleanText.replace(dateMatch[0], `<span class="date-tag">${dateMatch[1]}</span>`);
      }
      const textSpan = document.createElement('span');
      textSpan.className = "task-text";
      textSpan.innerHTML = cleanText;
      textSpan.onclick = () => window.toggleByText(task);
      if (isDone) li.classList.add('done');
      const delBtn = document.createElement('button');
      delBtn.innerHTML = "✕";
      delBtn.className = "delete-btn";
      delBtn.onclick = (e) => { e.stopPropagation(); window.deleteByText(task); };
      li.appendChild(textSpan);
      li.appendChild(delBtn);
      list.appendChild(li);
    });
  });
};

window.switchProject = (val) => { currentProject = val; window.loadProject(val); };

window.addRun = async () => {
  const input = document.getElementById('runInput');
  if (!input.value) return;
  const newEntries = input.value.split('\n').filter(line => line.trim() !== "");
  const updatedRuns = [...localRuns, ...newEntries];
  await setDoc(doc(db, "plans", currentProject), { runs: updatedRuns });
  input.value = "";
};

window.toggleByText = async (originalText) => {
  let runs = [...localRuns];
  const idx = runs.indexOf(originalText);
  if (idx > -1) {
    runs[idx] = runs[idx].includes("@done") ? runs[idx].replace(" @done", "") : runs[idx] + " @done";
    await setDoc(doc(db, "plans", currentProject), { runs: runs });
  }
};

window.deleteByText = async (originalText) => {
  let runs = [...localRuns];
  const idx = runs.indexOf(originalText);
  if (idx > -1) {
    runs.splice(idx, 1);
    await setDoc(doc(db, "plans", currentProject), { runs: runs });
  }
};

window.loadProject(currentProject);
