export interface Shift {
  code: string;
  name: string;
  start: number;
  end: number;
}

export interface Person {
  id: string;
  canWork: string[];
  fixedOffWeekdays: string[];
  weeklyMin: number;
  weeklyMax: number;
  monthlyMin: number;
  monthlyMax: number;
  consecMax: number;
}

export interface InitialData {
  year: number;
  month: number;
  days: number;
  weekdayOfDay1: number;
  shifts: Shift[];
  people: Person[];
}

export type WishOffs = Record<string, number[]>;

export type Schedule = Record<string, (string | null | undefined)[]>;

export interface ShortageInfo {
  day: number;
  time_range: string;
  shortage: number;
  message?: string;
}

export interface ScheduleResponse {
  schedule: Schedule;
  shortages: ShortageInfo[];
  status: string;
  message?: string;
}
