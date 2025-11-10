import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeDayTypeByDate, normalizeWeekdayIndex } from "../utils/dateUtils";
import {
  CoverageBreakdown,
  NeedTemplate,
  NeedTemplateTimeRange,
  PaidLeaveRequests,
  Person,
  Schedule,
  Shift,
  ShortageInfo,
  ShiftPreferences,
  WishOffs,
} from "../types";

interface CalendarProps {
  year: number;
  month: number;
  days: number;
  weekdayOfDay1: number;
  people: Person[];
  schedule: Schedule;
  wishOffs: WishOffs;
  paidLeaves: PaidLeaveRequests;
  shiftPreferences: ShiftPreferences;
  selectedStaff: Person | null;
  onWishOffToggle: (personId: string, dayIndex: number) => void;
  onPaidLeaveToggle: (personId: string, dayIndex: number) => void;
  onShiftPreferenceChange: (personId: string, dayIndex: number, shiftCode: string | null) => void;
  shortages: ShortageInfo[];
  shifts: Shift[];
  needTemplate: NeedTemplate;
  dayTypeByDate: string[];
  coverageBreakdown: CoverageBreakdown;
  onShortagesCalculated?: (shortages: ShortageInfo[]) => void;
}

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];

const TIME_RANGE_ORDER = ["7-9", "9-15", "16-18", "18-21", "21-24", "0-7"] as const;

type TimeRangeLabel = (typeof TIME_RANGE_ORDER)[number];

type ShortageRow = { label: string; byDay: Map<number, number> };

const TIME_RANGE_TO_TEMPLATE_RANGE: Record<TimeRangeLabel, NeedTemplateTimeRange> = {
  "7-9": "7-9",
  "9-15": "9-15",
  "16-18": "16-18",
  "18-21": "18-24",
  "21-24": "18-24",
  "0-7": "0-7",
};

type ContextMenuState = {
  personId: string;
  dayIndex: number;
  x: number;
  y: number;
};

// Intervals are treated as half-open [start, end) ranges measured in hours.
const TIME_RANGE_INTERVALS: Record<TimeRangeLabel, [number, number]> = {
  "7-9": [7, 9],
  "9-15": [9, 15],
  "16-18": [16, 18],
  "18-21": [18, 21],
  "21-24": [21, 24],
  // Treat the overnight portion as belonging to the same calendar day.
  "0-7": [24, 31],
};

const coversInterval = (shiftStart: number, shiftEnd: number, [start, end]: [number, number]) => {
  const effectiveEnd = Math.min(shiftEnd, 24);
  if (end <= 24) {
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
  paidLeaves,
  shiftPreferences,
  selectedStaff,
  onWishOffToggle,
  onPaidLeaveToggle,
  onShiftPreferenceChange,
  shortages,
  shifts,
  needTemplate,
  dayTypeByDate,
  coverageBreakdown,
  onShortagesCalculated,
}: CalendarProps) {
  const normalizedWeekdayOfDay1 = useMemo(
    () => normalizeWeekdayIndex(weekdayOfDay1),
    [weekdayOfDay1],
  );
  const normalizedDayTypes = useMemo(
    () => normalizeDayTypeByDate(dayTypeByDate, weekdayOfDay1),
    [dayTypeByDate, weekdayOfDay1],
  );
  const firstDayOffset = normalizedWeekdayOfDay1;

  const shiftCoverage = useMemo(() => buildShiftCoverageMap(shifts), [shifts]);
  const shiftByCode = useMemo(() => {
    const map = new Map<string, Shift>();
    shifts.forEach((shift) => {
      map.set(shift.code, shift);
    });
    return map;
  }, [shifts]);

  const coverageLabelsFromApi = useMemo(() => {
    const labels = new Set<string>();
    Object.values(coverageBreakdown ?? {}).forEach((ranges) => {
      Object.keys(ranges ?? {}).forEach((label) => {
        labels.add(label);
      });
    });
    return labels;
  }, [coverageBreakdown]);

  const fallbackLabelSet = useMemo(() => {
    const set = new Set<TimeRangeLabel>();
    TIME_RANGE_ORDER.forEach((label) => {
      if (!coverageLabelsFromApi.has(label)) {
        set.add(label);
      }
    });
    return set;
  }, [coverageLabelsFromApi]);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const clickTimeoutRef = useRef<number | null>(null);
  const pendingClickRef = useRef<{ personId: string; dayIndex: number } | null>(null);

  const clearClickTimeout = useCallback(() => {
    if (clickTimeoutRef.current !== null) {
      if (typeof window !== "undefined") {
        window.clearTimeout(clickTimeoutRef.current);
      }
      clickTimeoutRef.current = null;
    }
    pendingClickRef.current = null;
  }, []);

  const coverageRows = useMemo(() => {
    const rows = TIME_RANGE_ORDER.map((label) => ({ label, byDay: new Map<number, number>() }));
    const rowByLabel = new Map(rows.map((row) => [row.label, row]));

    for (let day = 1; day <= days; day += 1) {
      rows.forEach((row) => {
        row.byDay.set(day, 0);
      });
    }

    Object.entries(coverageBreakdown ?? {}).forEach(([dayKey, ranges]) => {
      const day = Number(dayKey);
      if (!Number.isFinite(day) || day < 1 || day > days) {
        return;
      }

      Object.entries(ranges ?? {}).forEach(([label, info]) => {
        const targetRow = rowByLabel.get(label);
        if (!targetRow) {
          return;
        }
        targetRow.byDay.set(day, info.actual);
      });
    });

    if (fallbackLabelSet.size > 0) {
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
            if (!fallbackLabelSet.has(label)) {
              return;
            }
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
                if (!fallbackLabelSet.has(label)) {
                  return;
                }
                const [rangeStart, rangeEnd] = TIME_RANGE_INTERVALS[label];
                if (rangeStart >= 24) {
                  return;
                }
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
    }

    return rows;
  }, [coverageBreakdown, days, fallbackLabelSet, schedule, shiftByCode, shiftCoverage]);

  const requirementRows = useMemo(() => {
    const rows = TIME_RANGE_ORDER.map((label) => ({ label, byDay: new Map<number, number>() }));
    const rowByLabel = new Map(rows.map((row) => [row.label, row]));

    for (let day = 1; day <= days; day += 1) {
      rows.forEach((row) => {
        row.byDay.set(day, 0);
      });
    }

    Object.entries(coverageBreakdown ?? {}).forEach(([dayKey, ranges]) => {
      const day = Number(dayKey);
      if (!Number.isFinite(day) || day < 1 || day > days) {
        return;
      }

      Object.entries(ranges ?? {}).forEach(([label, info]) => {
        const targetRow = rowByLabel.get(label);
        if (!targetRow) {
          return;
        }
        targetRow.byDay.set(day, info.need);
      });
    });

    if (fallbackLabelSet.size > 0) {
      for (let day = 1; day <= days; day += 1) {
        const dayTypeKey = normalizedDayTypes[day - 1];
        const template = dayTypeKey ? needTemplate[dayTypeKey] : undefined;

        fallbackLabelSet.forEach((label) => {
          const row = rowByLabel.get(label);
          if (!row) {
            return;
          }
          const templateRange = TIME_RANGE_TO_TEMPLATE_RANGE[label];
          const requirement = template ? template[templateRange] ?? 0 : 0;
          row.byDay.set(day, requirement);
        });
      }
    }

    return rows;
  }, [coverageBreakdown, days, fallbackLabelSet, needTemplate, normalizedDayTypes]);

  const coverageByLabel = useMemo(() => {
    return new Map(coverageRows.map((row) => [row.label, row.byDay]));
  }, [coverageRows]);

  const requirementByLabel = useMemo(() => {
    return new Map(requirementRows.map((row) => [row.label, row.byDay]));
  }, [requirementRows]);

  const shortageComputation = useMemo(() => {
    const baseRows: ShortageRow[] = TIME_RANGE_ORDER.map((label) => ({
      label,
      byDay: new Map<number, number>(),
    }));
    const baseRowByLabel = new Map<string, ShortageRow>(
      baseRows.map((row) => [row.label, row]),
    );
    const additionalRows: ShortageRow[] = [];
    const additionalRowByLabel = new Map<string, ShortageRow>();

    for (let day = 1; day <= days; day += 1) {
      baseRows.forEach((row) => {
        row.byDay.set(day, 0);
      });
    }

    Object.entries(coverageBreakdown ?? {}).forEach(([dayKey, ranges]) => {
      const day = Number(dayKey);
      if (!Number.isFinite(day) || day < 1 || day > days) {
        return;
      }

      Object.entries(ranges ?? {}).forEach(([label, info]) => {
        const baseRow = baseRowByLabel.get(label);
        if (baseRow) {
          baseRow.byDay.set(day, info.shortage);
          return;
        }

        let targetRow = additionalRowByLabel.get(label);
        if (!targetRow) {
          targetRow = { label, byDay: new Map<number, number>() };
          for (let d = 1; d <= days; d += 1) {
            targetRow.byDay.set(d, 0);
          }
          additionalRows.push(targetRow);
          additionalRowByLabel.set(label, targetRow);
        }
        targetRow.byDay.set(day, info.shortage);
      });
    });

    fallbackLabelSet.forEach((label) => {
      const row = baseRowByLabel.get(label);
      if (!row) {
        return;
      }
      for (let day = 1; day <= days; day += 1) {
        const requirement = requirementByLabel.get(label)?.get(day) ?? 0;
        const coverage = coverageByLabel.get(label)?.get(day) ?? 0;
        const shortageValue = Math.max(requirement - coverage, 0);
        row.byDay.set(day, shortageValue);
      }
    });

    shortages.forEach((info) => {
      if (info.day < 1 || info.day > days) {
        return;
      }

      const baseRow = baseRowByLabel.get(info.time_range);
      if (baseRow) {
        const current = baseRow.byDay.get(info.day) ?? 0;
        if (info.shortage > current) {
          baseRow.byDay.set(info.day, info.shortage);
        }
        return;
      }

      let targetRow = additionalRowByLabel.get(info.time_range);
      if (!targetRow) {
        targetRow = { label: info.time_range, byDay: new Map<number, number>() };
        for (let day = 1; day <= days; day += 1) {
          targetRow.byDay.set(day, 0);
        }
        additionalRows.push(targetRow);
        additionalRowByLabel.set(info.time_range, targetRow);
      }
      targetRow.byDay.set(info.day, info.shortage);
    });

    additionalRows.sort((a, b) => {
      const diff = parseRangeStartMinutes(a.label) - parseRangeStartMinutes(b.label);
      if (diff !== 0) {
        return diff;
      }
      return a.label.localeCompare(b.label, "ja");
    });

    const shortageList: ShortageInfo[] = [];
    [...baseRows, ...additionalRows].forEach((row) => {
      row.byDay.forEach((value, day) => {
        if (value > 0) {
          shortageList.push({ day, time_range: row.label, shortage: value });
        }
      });
    });

    return {
      rows: [...baseRows, ...additionalRows],
      list: shortageList,
    };
  }, [
    coverageBreakdown,
    coverageByLabel,
    days,
    fallbackLabelSet,
    requirementByLabel,
    shortages,
  ]);

  const shortageRows = shortageComputation.rows;

  useEffect(() => {
    if (!onShortagesCalculated) {
      return;
    }
    onShortagesCalculated(shortageComputation.list);
  }, [onShortagesCalculated, shortageComputation.list]);

  const handleDayClick = useCallback(
    (event: ReactMouseEvent<HTMLTableCellElement>, personId: string, dayIndex: number) => {
      if (!selectedStaff || selectedStaff.id !== personId) {
        return;
      }
      if (typeof window === "undefined") {
        onWishOffToggle(personId, dayIndex);
        return;
      }
      clearClickTimeout();
      pendingClickRef.current = { personId, dayIndex };
      clickTimeoutRef.current = window.setTimeout(() => {
        if (pendingClickRef.current) {
          onWishOffToggle(pendingClickRef.current.personId, pendingClickRef.current.dayIndex);
        }
        clearClickTimeout();
      }, 200);
    },
    [selectedStaff, onWishOffToggle, clearClickTimeout],
  );

  const handleDayDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLTableCellElement>, personId: string, dayIndex: number) => {
      if (!selectedStaff || selectedStaff.id !== personId) {
        return;
      }
      event.preventDefault();
      clearClickTimeout();
      onPaidLeaveToggle(personId, dayIndex);
    },
    [selectedStaff, onPaidLeaveToggle, clearClickTimeout],
  );

  const handleContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLTableCellElement>, personId: string, dayIndex: number) => {
      if (!selectedStaff || selectedStaff.id !== personId) {
        return;
      }
      event.preventDefault();
      setContextMenu({ personId, dayIndex, x: event.clientX, y: event.clientY });
    },
    [selectedStaff],
  );

  const handlePreferenceSelect = useCallback(
    (shiftCode: string | null) => {
      if (!contextMenu) {
        return;
      }
      onShiftPreferenceChange(contextMenu.personId, contextMenu.dayIndex, shiftCode);
      setContextMenu(null);
    },
    [contextMenu, onShiftPreferenceChange],
  );

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (contextMenu && selectedStaff?.id !== contextMenu.personId) {
      setContextMenu(null);
    }
  }, [contextMenu, selectedStaff]);

  useEffect(() => {
    return () => {
      clearClickTimeout();
    };
  }, [clearClickTimeout]);

  const activePreference = contextMenu
    ? shiftPreferences[contextMenu.personId]?.[contextMenu.dayIndex] ?? null
    : null;

  const contextMenuPerson = contextMenu
    ? people.find((person) => person.id === contextMenu.personId) ?? null
    : null;

  const contextMenuDay = contextMenu ? contextMenu.dayIndex + 1 : null;

  const menuPosition = useMemo(() => {
    if (!contextMenu) {
      return null;
    }

    if (typeof window === "undefined") {
      return { top: contextMenu.y, left: contextMenu.x };
    }

    const padding = 8;
    const menuWidth = 256;
    const menuHeight = 320;
    const clampedTop = Math.min(contextMenu.y, window.innerHeight - menuHeight - padding);
    const clampedLeft = Math.min(contextMenu.x, window.innerWidth - menuWidth - padding);

    return {
      top: Math.max(padding, clampedTop),
      left: Math.max(padding, clampedLeft),
    };
  }, [contextMenu]);

  return (
    <div className="p-4">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-lg font-semibold text-gray-800">
          {year}年 {month}月
        </h2>
        <p className="text-xs text-gray-500">
          セルをクリックで希望休、ダブルクリックで有給、右クリックで希望シフトを設定できます
        </p>
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
                const assignedValue = schedule[person.id]?.[dayIndex] ?? null;
                const isPaidLeaveRequested = paidLeaves[person.id]?.includes(dayIndex) ?? false;
                const isPaidLeaveScheduled = assignedValue === "有給";
                const showPaidLeave = isPaidLeaveRequested || isPaidLeaveScheduled;
                const shift = showPaidLeave ? null : assignedValue;
                const isSelected = selectedStaff?.id === person.id;
                const preferredShiftCode = shiftPreferences[person.id]?.[dayIndex] ?? null;
                const preferredShift = preferredShiftCode ? shiftByCode.get(preferredShiftCode) : null;

                return (
                  <td
                    key={`${person.id}-${day}`}
                    onClick={(event) => handleDayClick(event, person.id, dayIndex)}
                    onDoubleClick={(event) => handleDayDoubleClick(event, person.id, dayIndex)}
                    onContextMenu={(event) => handleContextMenu(event, person.id, dayIndex)}
                    className={`p-2 border border-gray-300 relative ${
                      isSelected ? "cursor-pointer" : ""
                    } ${showPaidLeave ? "bg-amber-50" : ""} ${
                      !showPaidLeave && isWishedOff ? "bg-red-50" : ""
                    } ${
                      preferredShiftCode && !isWishedOff && !showPaidLeave
                        ? "ring-2 ring-inset ring-blue-300"
                        : ""
                    }`}
                  >
                    {showPaidLeave && <span className="text-amber-600 font-bold">有給</span>}
                    {!showPaidLeave && isWishedOff && (
                      <span className="text-red-500 font-bold">休</span>
                    )}
                    {!showPaidLeave && !isWishedOff && shift && (
                      <span className="font-bold text-blue-700">{shift}</span>
                    )}
                    {!showPaidLeave && !isWishedOff && !shift && (
                      <span className="text-gray-300">-</span>
                    )}
                    {preferredShiftCode && !isWishedOff && !showPaidLeave && (
                      <span className="absolute bottom-1 right-1 text-[10px] px-1 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200 shadow-sm">
                        希望:
                        {preferredShift?.name ?? preferredShiftCode}
                      </span>
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
          {requirementRows.map(({ label, byDay }) => (
            <tr key={`requirement-${label}`} className="bg-amber-50">
              <td className="p-2 border border-gray-300 font-semibold sticky left-0 bg-amber-100 z-10 whitespace-nowrap text-amber-700">
                必要人数 {label}
              </td>
              {Array.from({ length: days }, (_, dayIndex) => {
                const day = dayIndex + 1;
                const requirement = byDay.get(day) ?? 0;
                return (
                  <td key={`requirement-${label}-${day}`} className="p-2 border border-gray-300">
                    <span className={requirement > 0 ? "font-semibold text-amber-700" : "text-gray-400"}>
                      {requirement}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 w-64 bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden"
          style={menuPosition ?? { top: contextMenu.y, left: contextMenu.x }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="px-3 py-2 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-700">希望シフトを選択</p>
            <p className="text-[11px] text-gray-500">
              {contextMenu.personId} / {contextMenuDay}日
            </p>
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {shifts.map((shift) => {
              const canSelect = !contextMenuPerson || contextMenuPerson.canWork.includes(shift.code);
              const isActive = activePreference === shift.code;
              return (
                <button
                  key={shift.code}
                  type="button"
                  onClick={() => handlePreferenceSelect(shift.code)}
                  disabled={!canSelect}
                  className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between transition ${
                    isActive ? "bg-blue-50 text-blue-700" : "hover:bg-gray-100"
                  } ${canSelect ? "" : "cursor-not-allowed text-gray-300"}`}
                >
                  <span>{shift.name}</span>
                  <span className="text-xs text-gray-400">{shift.code}</span>
                </button>
              );
            })}
          </div>
          <div className="border-t border-gray-200">
            <button
              type="button"
              onClick={() => handlePreferenceSelect(null)}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              希望シフトを解除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
