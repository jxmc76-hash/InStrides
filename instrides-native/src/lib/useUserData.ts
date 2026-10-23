import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UserDayData {
  energy?: number; // 1-10
  notes?: string;
  gymWeight?: Record<string, number>; // workoutId -> kg
}

export interface UserDataStore {
  days: Record<string, UserDayData>; // date -> data
  selectedWorkoutTypes: string[]; // which columns to show in grid
  gymWeights: Record<string, number>; // workoutId -> kg used
}

const STORAGE_KEY = 'traininglog_userdata';

const DEFAULT_STORE: UserDataStore = {
  days: {},
  selectedWorkoutTypes: ['RUN', 'YOGA', 'GYM', 'SWIM', 'SIT'],
  gymWeights: {},
};

export function useUserData() {
  const [store, setStore] = useState<UserDataStore>(DEFAULT_STORE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setStore({ ...DEFAULT_STORE, ...JSON.parse(raw) });
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const save = useCallback(async (updated: UserDataStore) => {
    setStore(updated);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}
  }, []);

  const setEnergy = useCallback((date: string, value: number) => {
    setStore((prev) => {
      const next = { ...prev, days: { ...prev.days, [date]: { ...prev.days[date], energy: value } } };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const setNotes = useCallback((date: string, notes: string) => {
    setStore((prev) => {
      const next = { ...prev, days: { ...prev.days, [date]: { ...prev.days[date], notes } } };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const setGymWeight = useCallback((workoutId: string, kg: number) => {
    setStore((prev) => {
      const next = { ...prev, gymWeights: { ...prev.gymWeights, [workoutId]: kg } };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const setSelectedTypes = useCallback((types: string[]) => {
    setStore((prev) => {
      const next = { ...prev, selectedWorkoutTypes: types };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return { store, loaded, setEnergy, setNotes, setGymWeight, setSelectedTypes, save };
}
