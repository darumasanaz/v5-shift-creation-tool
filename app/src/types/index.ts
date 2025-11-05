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

export type NeedTemplateDetail = {
  "7-9": number;
  "9-15": number;
  "16-18": number;
  "0-7": number;
} &
  Partial<{
    "18-24": number;
    "18-21": number;
    "21-24": number;
  }>;

export type NeedTemplate = Record<string, NeedTemplateDetail>;

export interface InitialData {
  year: number;
  month: number;
  days: number;
  weekdayOfDay1: number;
  shifts: Shift[];
  people: Person[];
  needTemplate: NeedTemplate;
  dayTypeByDate: string[];
}

export type WishOffs = Record<string, number[]>;

export type Schedule = Record<string, (string | null | undefined)[]>;

export interface ShortageInfo {
  day: number;
  time_range: string;
  shortage: number;
}

export interface ScheduleResponse {
  schedule: Schedule;
  shortages: ShortageInfo[];
  status: string;
  message?: string;
}
