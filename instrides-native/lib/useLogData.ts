import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import type { LogData, Entry } from '../constants/types';

const DEFAULT: LogData = {
  types: ['RUN', 'YOGA', 'GYM', 'SWIM'],
  typeCategories: {},
  customMetrics: [],
  entries: [],
  dailyNotes: {},
  goals: [],
  themes: [],
  completedLearnings: [],
  trainingPlans: [],
  tasks: [],
};

export function useLogData() {
  const [logData, setLogData] = useState<LogData>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [logId, setLogId] = useState<string | null>(null);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    const id = `log-${uid}`;
    setLogId(id);
    const unsub = onSnapshot(doc(db, 'logs', id), (snap) => {
      if (snap.exists()) setLogData(snap.data() as LogData);
      setLoading(false);
    });
    return unsub;
  }, [auth.currentUser?.uid]);

  const save = async (updated: LogData) => {
    if (!logId) return;
    setLogData(updated);
    await setDoc(doc(db, 'logs', logId), updated);
  };

  const addEntry = async (entry: Omit<Entry, 'id'>) => {
    const updated = {
      ...logData,
      entries: [...logData.entries, { ...entry, id: Date.now() }],
    };
    await save(updated);
  };

  const updateEntry = async (entry: Entry) => {
    const updated = {
      ...logData,
      entries: logData.entries.map((e) => (e.id === entry.id ? entry : e)),
    };
    await save(updated);
  };

  const deleteEntry = async (id: number) => {
    const updated = {
      ...logData,
      entries: logData.entries.filter((e) => e.id !== id),
    };
    await save(updated);
  };

  const tickPlanSession = async (planId: number, sessionId: number, entryId?: number) => {
    const plans = logData.trainingPlans.map((p) =>
      p.id !== planId ? p : {
        ...p,
        sessions: p.sessions.map((s) =>
          s.id !== sessionId ? s : { ...s, isComplete: true, logEntryId: entryId ?? null }
        ),
      }
    );
    await save({ ...logData, trainingPlans: plans });
  };

  return { logData, loading, addEntry, updateEntry, deleteEntry, tickPlanSession, save };
}
