import { useMemo } from "react";
import { NeedTemplate, Person, Schedule, Shift, WishOffs } from "../types";

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
  shifts: Shift[];
  needTemplate: NeedTemplate;
  dayTypeByDate: string[];
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
    return shiftStart < end && effectiveEnd > start;
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

const normalizeNeedDetail = (detail: NeedTemplate[string]): Record<TimeRangeLabel, number> => ({
  "7-9": detail["7-9"] ?? 0,
  "9-15": detail["9-15"] ?? 0,
  "16-18": detail["16-18"] ?? 0,
  "18-21": detail["18-21"] ?? detail["18-24"] ?? 0,
  "21-24": detail["21-24"] ?? detail["18-24"] ?? 0,
  "0-7": detail["0-7"] ?? 0,
});

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
  shifts,
  needTemplate,
  dayTypeByDate,
}: CalendarProps) {
  const firstDayOffset = ((weekdayOfDay1 % 7) + 7) % 7;

  const shiftCoverage = useMemo(() => buildShiftCoverageMap(shifts), [shifts]);

  const normalizedTemplate = useMemo(() => {
    const entries = Object.entries(needTemplate || {});
    return new Map(entries.map(([key, detail]) => [key, normalizeNeedDetail(detail)]));
  }, [needTemplate]);

  const needsByLabel = useMemo(() => {
    const rows = TIME_RANGE_ORDER.map((label) => ({ label, byDay: new Map<number, number>() }));
    const rowByLabel = new Map(rows.map((row) => [row.label, row]));

    for (let day = 1; day <= days; day += 1) {
      rows.forEach((row) => {
        row.byDay.set(day, 0);
      });

      const dayType = dayTypeByDate[day - 1];
      const template = dayType ? normalizedTemplate.get(dayType) : undefined;
      if (!template) {
        continue;
      }

      TIME_RANGE_ORDER.forEach((label) => {
        const targetRow = rowByLabel.get(label);
        if (!targetRow) {
          return;
        }
        const needValue = template[label];
        targetRow.byDay.set(day, needValue ?? 0);
      });
    }

    return rows;
  }, [dayTypeByDate, days, normalizedTemplate]);

  const needsByLabelMap = useMemo(() => {
    const map = new Map<TimeRangeLabel, Map<number, number>>();
    needsByLabel.forEach(({ label, byDay }) => {
      map.set(label, new Map(byDay));
    });
    return map;
  }, [needsByLabel]);

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

  const coverageByLabelMap = useMemo(() => {
    const map = new Map<TimeRangeLabel, Map<number, number>>();
    coverageRows.forEach(({ label, byDay }) => {
      map.set(label, new Map(byDay));
    });
    return map;
  }, [coverageRows]);

  const shortageRows = useMemo(() => {
    return TIME_RANGE_ORDER.map((label) => {
      const byDay = new Map<number, number>();
      for (let day = 1; day <= days; day += 1) {
        const needValue = needsByLabelMap.get(label)?.get(day) ?? 0;
        const actual = coverageByLabelMap.get(label)?.get(day) ?? 0;
        byDay.set(day, Math.max(needValue - actual, 0));
      }
      return { label, byDay };
    });
  }, [coverageByLabelMap, days, needsByLabelMap]);

  const excessRows = useMemo(() => {
    return TIME_RANGE_ORDER.map((label) => {
      const byDay = new Map<number, number>();
      for (let day = 1; day <= days; day += 1) {
        const needValue = needsByLabelMap.get(label)?.get(day) ?? 0;
        const actual = coverageByLabelMap.get(label)?.get(day) ?? 0;
        byDay.set(day, Math.max(actual - needValue, 0));
      }
      return { label, byDay };
    });
  }, [coverageByLabelMap, days, needsByLabelMap]);

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
          {shortageRows.map(({ label, byDay }) => (
            <tr key={`shortage-${label}`} className="bg-red-50">
              <td className="p-2 border border-gray-300 font-semibold sticky left-0 bg-red-100 z-10 whitespace-nowrap text-red-700">
                不足 {label}
              </td>
              {Array.from({ length: days }, (_, dayIndex) => {
                const day = dayIndex + 1;
                const shortage = byDay.get(day) ?? 0;
                return (
                  <td key={`shortage-${label}-${day}`} className="p-2 border border-gray-300">
                    <span className={shortage > 0 ? "font-semibold text-red-600" : "text-gray-400"}>
                      {shortage}
                    </span>
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
          {excessRows.map(({ label, byDay }) => (
            <tr key={`excess-${label}`} className="bg-green-50">
              <td className="p-2 border border-gray-300 font-semibold sticky left-0 bg-green-100 z-10 whitespace-nowrap text-green-700">
                超過 {label}
              </td>
              {Array.from({ length: days }, (_, dayIndex) => {
                const day = dayIndex + 1;
                const excess = byDay.get(day) ?? 0;
                return (
                  <td key={`excess-${label}-${day}`} className="p-2 border border-gray-300">
                    <span className={excess > 0 ? "font-semibold text-green-700" : "text-gray-400"}>{excess}</span>
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
