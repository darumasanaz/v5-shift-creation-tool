import { Person, Schedule, Shift } from "../types";

export type RuleViolationType = "CONSECUTIVE" | "WEEKLY_MAX" | "MONTHLY_MAX";

export interface RuleViolation {
  personId: string;
  message: string;
  rule: RuleViolationType;
  dayIndex?: number;
}

const shiftDuration = (shift?: Shift | null): number => {
  if (!shift) return 0;
  return shift.end - shift.start;
};

export const validateScheduleRules = (
  schedule: Schedule,
  people: Person[],
  shifts: Shift[],
  days: number,
  weekdayOfDay1: number,
): RuleViolation[] => {
  const shiftMap = new Map(shifts.map((shift) => [shift.code, shift]));
  const violations: RuleViolation[] = [];

  people.forEach((person) => {
    const assignments = schedule[person.id] ?? [];
    let consecutiveDays = 0;
    let weeklyHours = 0;
    let monthlyHours = 0;

    for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
      const assignment = assignments[dayIndex];
      const shift = assignment ? shiftMap.get(assignment) : undefined;
      const hours = shiftDuration(shift);

      if (shift) {
        consecutiveDays += 1;
        if (consecutiveDays > person.consecMax) {
          violations.push({
            personId: person.id,
            rule: "CONSECUTIVE",
            message: `${person.consecMax}日を超える連勤 (day ${dayIndex + 1})`,
            dayIndex,
          });
        }
      } else {
        consecutiveDays = 0;
      }

      weeklyHours += hours;
      monthlyHours += hours;
      const isWeekEnd = (weekdayOfDay1 + dayIndex) % 7 === 6;
      if (isWeekEnd) {
        if (weeklyHours > person.weeklyMax) {
          violations.push({
            personId: person.id,
            rule: "WEEKLY_MAX",
            message: `週の労働時間上限 ${person.weeklyMax}h を超過`,
          });
        }
        weeklyHours = 0;
      }
    }

    if (weeklyHours > person.weeklyMax) {
      violations.push({
        personId: person.id,
        rule: "WEEKLY_MAX",
        message: `週の労働時間上限 ${person.weeklyMax}h を超過`,
      });
    }

    if (monthlyHours > person.monthlyMax) {
      violations.push({
        personId: person.id,
        rule: "MONTHLY_MAX",
        message: `月の労働時間上限 ${person.monthlyMax}h を超過`,
      });
    }
  });

  return violations;
};
