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
    return shiftStart <= end && effectiveEnd > start;
  }

  if (shiftEnd <= 24) {
    return false;
  }

  return shiftEnd > start;
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

  const shortageRows = useMemo(() => {
    if (shortages.length === 0) {
      return [] as { range: string; byDay: Map<number, ShortageInfo> }[];
    }

    const ranges = new Map<string, Map<number, ShortageInfo>>();

    shortages.forEach((info) => {
      if (!ranges.has(info.time_range)) {
        ranges.set(info.time_range, new Map());
      }
      ranges.get(info.time_range)!.set(info.day, info);
    });

    return Array.from(ranges.entries())
      .sort((a, b) => {
        const diff = parseRangeStartMinutes(a[0]) - parseRangeStartMinutes(b[0]);
        if (diff !== 0) {
          return diff;
        }
        return a[0].localeCompare(b[0], "ja");
      })
      .map(([range, byDay]) => ({ range, byDay }));
  }, [shortages]);

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

        const day = dayIndex + 1;
        labels.forEach((label) => {
          const targetRow = rowByLabel.get(label);
          if (!targetRow) {
            return;
          }
          const current = targetRow.byDay.get(day) ?? 0;
          targetRow.byDay.set(day, current + 1);
        });
      });
    });

    return rows;
  }, [days, schedule, shiftCoverage]);

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
          {shortageRows.map(({ range, byDay }) => (
            <tr key={`shortage-${range}`} className="bg-red-50">
              <td className="p-2 border border-gray-300 font-semibold sticky left-0 bg-red-100 z-10 whitespace-nowrap text-red-700">
                不足 {range}
              </td>
              {Array.from({ length: days }, (_, dayIndex) => {
                const day = dayIndex + 1;
                const shortage = byDay.get(day);
                return (
                  <td key={`shortage-${range}-${day}`} className="p-2 border border-gray-300">
                    {shortage ? (
                      <span className="font-semibold text-red-600">{shortage.shortage}人</span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
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
        </tbody>
      </table>
    </div>
  );
}
