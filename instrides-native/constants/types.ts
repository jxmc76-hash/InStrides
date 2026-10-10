export interface Entry {
  id: number;
  date: string; // YYYY-MM-DD
  type: string;
  details?: string;
  distance?: number | null;
  distanceUnit?: string;
  duration?: number | null;
  reps?: number | null;
  weight?: number | null;
  weightUnit?: string;
  otherRating?: number | null;
  subType?: string | null;
  learnings?: string[];
  isPlanned?: boolean;
  mark?: number | null;
  customMetricData?: Record<string, number>;
  isStravaActivity?: boolean;
}

export interface TrainingPlanSession {
  id: number;
  date: string;
  type: string;
  target: string;
  isComplete: boolean;
  logEntryId?: number | null;
}

export interface TrainingPlan {
  id: number;
  title: string;
  startDate: string;
  endDate: string;
  sessions: TrainingPlanSession[];
}

export interface Goal {
  id: number;
  text: string;
  target?: string;
  isComplete?: boolean;
  completedDate?: string;
}

export interface CustomMetric {
  name: string;
  type: string;
  unit?: string;
}

export interface LogData {
  types: string[];
  typeCategories: Record<string, string>;
  customMetrics: CustomMetric[];
  entries: Entry[];
  dailyNotes: Record<string, string>;
  goals: Goal[];
  themes: unknown[];
  completedLearnings: string[];
  trainingPlans: TrainingPlan[];
  tasks: unknown[];
}
