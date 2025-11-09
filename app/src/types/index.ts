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

export type NeedTemplateTimeRange = "7-9" | "9-15" | "16-18" | "18-24" | "0-7";

export interface NeedTemplateDetail {
  "7-9": number;
  "9-15": number;
  "16-18": number;
  "18-24": number;
  "0-7": number;
}

export type NeedTemplate = Record<string, NeedTemplateDetail>;

export type WishOffs = Record<string, number[]>;

export type PaidLeaveRequests = Record<string, number[]>;

export interface InitialData {
  year: number;
  month: number;
  days: number;
  weekdayOfDay1: number;
  shifts: Shift[];
  people: Person[];
  needTemplate: NeedTemplate;
  dayTypeByDate: string[];
  previousMonthNightCarry?: Record<string, string[]>;
  paidLeaves?: PaidLeaveRequests;
}

export type ShiftPreferences = Record<string, Record<number, string>>;

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
