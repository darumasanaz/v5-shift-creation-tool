import { useMemo } from "react";
import { Person, Schedule, Shift, ShortageInfo, WishOffs } from "../types";

interface CalendarProps {
  year: number;
  month: number;
  days: number;
  weekdayOfDay1: number;
  people: Person[];
  schedule: Schedule;
  wishOffs: WishOffs;
  selectedStaff: Person | null;
  onWishOffToggle: (personId: string, dayIndex: number) => void;
  shortages: ShortageInfo[];
  shifts: Shift[];
}

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];

const TIME_RANGE_ORDER = ["7-9", "9-15", "16-18", "18-21", "21-24", "0-7"] as const;

type TimeRangeLabel = (typeof TIME_RANGE_ORDER)[number];

type ShortageRow = { label: string; byDay: Map<number, number> };

// Intervals are treated as half-open [start, end) ranges measured in hours.
// "0-7" uses 24-31 so that post-midnight segments map to the following day.
const TIME_RANGE_INTERVALS: Record<TimeRangeLabel, [number, number]> = {
  "7-9": [7, 9],
  "9-15": [9, 15],
  "16-18": [16, 18],
  "18-21": [18, 21],
  "21-24": [21, 24],
  "0-7": [24, 31],
};

const coversInterval = (shiftStart: number, shiftEnd: number, [start, end]: [number, number]) => {
  if (end <= 24) {
    const effectiveEnd = Math.min(shiftEnd, 24);
    return shiftStart < end && effectiveEnd > start;
  }

  if (shiftEnd <= 24) {
    return false;
  }

  const afterMidnightStart = Math.max(shiftStart, 24);
  return afterMidnightStart < end && shiftEnd > start;
};

const buildShiftCoverageMap = (shifts: Shift[]) => {
  const shiftToRanges = new Map<string, TimeRangeLabel[]>();

  shifts.forEach((shift) => {
    const labels: TimeRangeLabel[] = [];
    TIME_RANGE_ORDER.forEach((label) => {
      if (coversInterval(shift.start, shift.end, TIME_RANGE_INTERVALS[label])) {
        labels.push(label);
      }
    });
    if (labels.length > 0) {
      shiftToRanges.set(shift.code, labels);
    }
  });

  return shiftToRanges;
};

const parseRangeStartMinutes = (range: string) => {
  const [start] = range.split("-");
  if (!start) {
    return Number.MAX_SAFE_INTEGER;
  }

  const match = start.trim().match(/(\d{1,2})(?::(\d{1,2}))?/);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  const hours = parseInt(match[1] ?? "0", 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  return hours * 60 + minutes;
};

export default function Calendar({
  year,
  month,
  days,
  weekdayOfDay1,
  people,
  schedule,
  wishOffs,
  selectedStaff,
  onWishOffToggle,
  shortages,
  shifts,
}: CalendarProps) {
  const firstDayOffset = ((weekdayOfDay1 % 7) + 7) % 7;

  const shiftCoverage = useMemo(() => buildShiftCoverageMap(shifts), [shifts]);
  const shiftByCode = useMemo(() => {
    const map = new Map<string, Shift>();
    shifts.forEach((shift) => {
      map.set(shift.code, shift);
    });
    return map;
  }, [shifts]);

  const shortageRows = useMemo(() => {
    const baseRows: ShortageRow[] = TIME_RANGE_ORDER.map((label) => ({
      label,
      byDay: new Map<number, number>(),
    }));

    const additionalRows: ShortageRow[] = [];
    const rowByLabel = new Map<string, ShortageRow>(
      baseRows.map((row) => [row.label, row]),
    );

    const ensureRow = (label: string) => {
      const existing = rowByLabel.get(label);
      if (existing) {
        return existing;
      }

      const newRow = { label, byDay: new Map<number, number>() };
      for (let day = 1; day <= days; day += 1) {
        newRow.byDay.set(day, 0);
      }
      additionalRows.push(newRow);
      rowByLabel.set(label, newRow);
      return newRow;
    };

    for (let day = 1; day <= days; day += 1) {
      baseRows.forEach((row) => {
        row.byDay.set(day, 0);
      });
    }

    shortages.forEach((info) => {
      if (info.day < 1 || info.day > days) {
        return;
      }
      const targetRow = ensureRow(info.time_range);
      targetRow.byDay.set(info.day, info.shortage);
    });

    additionalRows.sort((a, b) => {
      const diff = parseRangeStartMinutes(a.label) - parseRangeStartMinutes(b.label);
      if (diff !== 0) {
        return diff;
      }
      return a.label.localeCompare(b.label, "ja");
    });

    return [...baseRows, ...additionalRows];
  }, [days, shortages]);

  const coverageRows = useMemo(() => {
    const rows = TIME_RANGE_ORDER.map((label) => ({ label, byDay: new Map<number, number>() }));
    const rowByLabel = new Map(rows.map((row) => [row.label, row]));

    for (let day = 1; day <= days; day += 1) {
      rows.forEach((row) => {
        row.byDay.set(day, 0);
      });
    }

    Object.values(schedule).forEach((assignments) => {
      if (!assignments) {
        return;
      }

      assignments.forEach((shiftCode, dayIndex) => {
        if (!shiftCode || dayIndex >= days) {
          return;
        }

        const labels = shiftCoverage.get(shiftCode);
        if (!labels) {
          return;
        }

        const shift = shiftByCode.get(shiftCode);
        if (!shift) {
          return;
        }

        const day = dayIndex + 1;
        labels.forEach((label) => {
          const targetRow = rowByLabel.get(label);
          if (!targetRow) {
            return;
          }
          const current = targetRow.byDay.get(day) ?? 0;
          targetRow.byDay.set(day, current + 1);
        });

        if (shift.end > 24) {
          const nextDay = day + 1;
          if (nextDay <= days) {
            const afterMidnightStart = Math.max(shift.start, 24) - 24;
            const afterMidnightEnd = shift.end - 24;

            TIME_RANGE_ORDER.forEach((label) => {
              const [rangeStart, rangeEnd] = TIME_RANGE_INTERVALS[label];
              const normalizedStart = rangeStart >= 24 ? rangeStart - 24 : rangeStart;
              const normalizedEnd = rangeEnd > 24 ? rangeEnd - 24 : rangeEnd;

              if (
                afterMidnightStart < normalizedEnd &&
                afterMidnightEnd > normalizedStart
              ) {
                const nextDayRow = rowByLabel.get(label);
                if (!nextDayRow) {
                  return;
                }
                const current = nextDayRow.byDay.get(nextDay) ?? 0;
                nextDayRow.byDay.set(nextDay, current + 1);
              }
            });
          }
        }
      });
    });

    return rows;
  }, [days, schedule, shiftByCode, shiftCoverage]);

  const handleDayClick = (personId: string, dayIndex: number) => {
    if (selectedStaff && selectedStaff.id === personId) {
      onWishOffToggle(personId, dayIndex);
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-lg font-semibold text-gray-800">
          {year}年 {month}月
        </h2>
        <p className="text-xs text-gray-500">セルをクリックして希望休を設定できます</p>
      </div>
      <table className="w-full border-collapse text-sm text-center">
        <thead>
          <tr className="bg-gray-200">
            <th className="p-2 border border-gray-300 sticky left-0 bg-gray-200 z-10">スタッフ</th>
            {Array.from({ length: days }, (_, i) => {
              const day = i + 1;
              const weekdayIndex = (firstDayOffset + i) % 7;
              const isWeekend = weekdayIndex >= 5;
              return (
                <th
                  key={day}
                  className={`p-2 border border-gray-300 ${isWeekend ? "text-red-500" : ""}`}
                >
                  {day}
                  <br />
                  {WEEKDAYS[weekdayIndex]}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {people.map((person) => (
            <tr key={person.id} className="hover:bg-gray-50">
              <td className="p-2 border border-gray-300 font-semibold sticky left-0 bg-white z-10 whitespace-nowrap">
                {person.id}
              </td>
              {Array.from({ length: days }, (_, dayIndex) => {
                const day = dayIndex + 1;
                const isWishedOff = wishOffs[person.id]?.includes(dayIndex) ?? false;
                const shift = schedule[person.id]?.[dayIndex] ?? null;
                const isSelected = selectedStaff?.id === person.id;

                return (
                  <td
                    key={`${person.id}-${day}`}
                    onClick={() => handleDayClick(person.id, dayIndex)}
                    className={`p-2 border border-gray-300 relative ${
                      isSelected ? "cursor-pointer" : ""
                    } ${isWishedOff ? "bg-red-50" : ""}`}
                  >
                    {isWishedOff && <span className="text-red-500 font-bold">休</span>}
                    {shift && <span className="font-bold text-blue-700">{shift}</span>}
                    {!isWishedOff && !shift && <span className="text-gray-300">-</span>}
                  </td>
                );
              })}
            </tr>
          ))}
          {coverageRows.map(({ label, byDay }) => (
            <tr key={`coverage-${label}`} className="bg-blue-50">
              <td className="p-2 border border-gray-300 font-semibold sticky left-0 bg-blue-100 z-10 whitespace-nowrap text-blue-700">
                勤務人数 {label}
              </td>
              {Array.from({ length: days }, (_, dayIndex) => {
                const day = dayIndex + 1;
                const count = byDay.get(day) ?? 0;
                return (
                  <td key={`coverage-${label}-${day}`} className="p-2 border border-gray-300">
                    <span className={count > 0 ? "font-semibold text-blue-700" : "text-gray-400"}>{count}</span>
                  </td>
                );
              })}
            </tr>
          ))}
          {shortageRows.map(({ label, byDay }) => (
            <tr key={`shortage-${label}`} className="bg-red-50">
              <td className="p-2 border border-gray-300 font-semibold sticky left-0 bg-red-100 z-10 whitespace-nowrap text-red-700">
                不足人数 {label}
              </td>
              {Array.from({ length: days }, (_, dayIndex) => {
                const day = dayIndex + 1;
                const shortage = byDay.get(day) ?? 0;
                const isShort = shortage > 0;
                return (
                  <td key={`shortage-${label}-${day}`} className="p-2 border border-gray-300">
                    <span className={isShort ? "font-semibold text-red-600" : "text-gray-400"}>
                      {shortage}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
