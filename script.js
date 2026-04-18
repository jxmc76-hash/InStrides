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

window.loadProject = (projectId) => {
  if (unsubscribe) unsubscribe();
  const docRef = doc(db, "plans", projectId);
  
  unsubscribe = onSnapshot(docRef, (doc) => {
    const list = document.getElementById('runList');
    list.innerHTML = "";
    localRuns = doc.exists() ? doc.data().runs : [];

    // Grouping Logic
    const groups = {};
    localRuns.forEach(run => {
      const weekMatch = run.match(/@w(?:eek)?\s?\(?(\d+)\)?/i);
      const weekLabel = weekMatch ? `WEEK ${weekMatch[1]}` : "GENERAL";
      if (!groups[weekLabel]) groups[weekLabel] = [];
      groups[weekLabel].push(run);
    });

    // Sort and Display
    const sortedWeeks = Object.keys(groups).sort((a, b) => {
      if (a === "GENERAL") return -1;
      return parseInt(a.replace("WEEK ", "")) - parseInt(b.replace("WEEK ", ""));
    });

    sortedWeeks.forEach(week => {
      // Create Heading
      const header = document.createElement('div');
      header.className = "week-heading";
      header.innerHTML = `<h3>${week}</h3>`;
      list.appendChild(header);

      groups[week].forEach(task => {
        const li = document.createElement('li');
        let isDone = task.includes("@done");
        // Remove tags for a clean display
        let cleanText = task.replace(/@w(?:eek)?\s?\(?(\d+)\)?/i, "").replace("@done", "").trim();

        const textSpan = document.createElement('span');
        textSpan.className = "task-text";
        textSpan.innerText = cleanText;
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

