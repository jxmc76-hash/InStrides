import { useState, useEffect, useCallback } from 'react';
import AppleHealthKit, {
  HealthKitPermissions,
  HealthValue,
  HealthActivitySummary,
} from 'react-native-health';
import { Platform } from 'react-native';

export type WorkoutType = 'RUN' | 'SWIM' | 'GYM' | 'YOGA' | 'SIT';

export interface HealthWorkout {
  id: string;
  type: WorkoutType;
  startDate: string;
  endDate: string;
  duration: number; // minutes
  distance?: number; // km
  calories?: number;
}

export interface DailyHealthData {
  date: string; // YYYY-MM-DD
  workouts: HealthWorkout[];
  sleepScore?: number;
  sleepDurationMinutes?: number;
  sleepBedtime?: string;
  sleepInterruptions?: number;
  weight?: number; // kg
  vo2Max?: number;
}

const HK_TYPE_MAP: Record<string, WorkoutType> = {
  Running: 'RUN',
  Swimming: 'SWIM',
  TraditionalStrengthTraining: 'GYM',
  FunctionalStrengthTraining: 'GYM',
  CrossTraining: 'GYM',
  Yoga: 'YOGA',
  Mindfulness: 'SIT',
  MindAndBody: 'SIT',
};

const PERMISSIONS: HealthKitPermissions = {
  permissions: {
    read: [
      AppleHealthKit.Constants.Permissions.Workout,
      AppleHealthKit.Constants.Permissions.SleepAnalysis,
      AppleHealthKit.Constants.Permissions.BodyMass,
      AppleHealthKit.Constants.Permissions.Vo2Max,
      AppleHealthKit.Constants.Permissions.HeartRate,
      AppleHealthKit.Constants.Permissions.DistanceWalkingRunning,
      AppleHealthKit.Constants.Permissions.DistanceSwimming,
      AppleHealthKit.Constants.Permissions.MindfulSession,
    ],
    write: [],
  },
};

function dateKey(d: Date): string {
  return d.toISOString().split('T')[0];
}

function minutesBetween(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
}

// Calculate sleep score from raw Apple Health sleep data
function calcSleepScore(durationMin: number, bedtimeHour: number, interruptions: number): number {
  // duration /50 (target 480 min = 8h)
  const durationScore = Math.min(50, Math.round((durationMin / 480) * 50));
  // bedtime /30 (ideal 22:00-23:00 = hour 22-23)
  const idealBedtime = 22.5;
  const hourDiff = Math.abs(bedtimeHour - idealBedtime);
  const bedtimeScore = Math.max(0, Math.round(30 - hourDiff * 6));
  // interruptions /20 (0 = 20, 5+ = 0)
  const intScore = Math.max(0, 20 - interruptions * 4);
  return durationScore + bedtimeScore + intScore;
}

export function useHealthKit() {
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DailyHealthData[]>([]);

  const authorize = useCallback(() => {
    if (Platform.OS !== 'ios') {
      setLoading(false);
      return;
    }
    AppleHealthKit.initHealthKit(PERMISSIONS, (err) => {
      if (err) {
        console.warn('HealthKit init error:', err);
        setLoading(false);
        return;
      }
      setAuthorized(true);
    });
  }, []);

  const fetchData = useCallback(() => {
    if (!authorized || Platform.OS !== 'ios') return;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);

    const options = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };

    // Accumulate all data into a map keyed by date
    const dayMap = new Map<string, DailyHealthData>();
    const getDay = (date: string): DailyHealthData => {
      const key = date.split('T')[0];
      if (!dayMap.has(key)) dayMap.set(key, { date: key, workouts: [] });
      return dayMap.get(key)!;
    };

    let pending = 4;
    const done = () => {
      pending--;
      if (pending === 0) {
        const sorted = Array.from(dayMap.values()).sort((a, b) => b.date.localeCompare(a.date));
        setData(sorted);
        setLoading(false);
      }
    };

    // Workouts
    AppleHealthKit.getSamples(
      { ...options, type: 'Workout' } as any,
      (err: any, results: any[]) => {
        if (!err && results) {
          for (const w of results) {
            const mappedType = HK_TYPE_MAP[w.activityName];
            if (!mappedType) continue;
            const day = getDay(w.startDate);
            day.workouts.push({
              id: w.id ?? `${w.startDate}-${w.activityName}`,
              type: mappedType,
              startDate: w.startDate,
              endDate: w.endDate,
              duration: minutesBetween(w.startDate, w.endDate),
              distance: w.distance ? w.distance / 1000 : undefined,
              calories: w.calories,
            });
          }
        }
        done();
      },
    );

    // Sleep
    AppleHealthKit.getSleepSamples(options, (err: any, results: any[]) => {
      if (!err && results) {
        // Group by night (use start date's date key)
        const nights = new Map<string, { durationMin: number; bedtimeHour: number; interruptions: number }>();
        for (const s of results) {
          if (s.value !== 'ASLEEP' && s.value !== 'CORE' && s.value !== 'DEEP' && s.value !== 'REM') continue;
          const key = s.startDate.split('T')[0];
          const dur = minutesBetween(s.startDate, s.endDate);
          const bedHour = new Date(s.startDate).getHours() + new Date(s.startDate).getMinutes() / 60;
          const existing = nights.get(key);
          if (existing) {
            existing.durationMin += dur;
          } else {
            nights.set(key, { durationMin: dur, bedtimeHour: bedHour, interruptions: 0 });
          }
        }
        // Count interruptions (AWAKE periods)
        for (const s of results) {
          if (s.value !== 'AWAKE') continue;
          const key = s.startDate.split('T')[0];
          const n = nights.get(key);
          if (n) n.interruptions++;
        }
        for (const [key, night] of nights) {
          const day = getDay(key);
          day.sleepDurationMinutes = night.durationMin;
          day.sleepBedtime = `${Math.floor(night.bedtimeHour)}:${String(Math.round((night.bedtimeHour % 1) * 60)).padStart(2, '0')}`;
          day.sleepInterruptions = night.interruptions;
          day.sleepScore = calcSleepScore(night.durationMin, night.bedtimeHour, night.interruptions);
        }
      }
      done();
    });

    // Weight
    AppleHealthKit.getWeightSamples(options, (err: any, results: HealthValue[]) => {
      if (!err && results) {
        for (const w of results) {
          const day = getDay(w.startDate);
          day.weight = Math.round(w.value * 10) / 10;
        }
      }
      done();
    });

    // VO2 Max
    AppleHealthKit.getVo2MaxSamples(options as any, (err: any, results: HealthValue[]) => {
      if (!err && results) {
        for (const v of results) {
          const day = getDay(v.startDate);
          day.vo2Max = Math.round(v.value * 10) / 10;
        }
      }
      done();
    });
  }, [authorized]);

  useEffect(() => { authorize(); }, [authorize]);
  useEffect(() => { if (authorized) fetchData(); }, [authorized, fetchData]);

  return { data, loading, authorized, refetch: fetchData };
}
