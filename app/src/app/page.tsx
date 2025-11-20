"use client";

import { useEffect, useState } from "react";
import {
  CoverageBreakdown,
  InitialData,
  PaidLeaveRequests,
  Person,
  Schedule,
  ScheduleResponse,
  Shift,
  ShiftPreferences,
  ShortageInfo,
  WishOffs,
} from "../types";
import { buildScheduleMatrix, toCsvString } from "../utils/export";
import Calendar from "../components/Calendar";
import StaffList from "../components/StaffList";
import StaffEditor from "../components/StaffEditor";
import ShiftDisplay from "../components/ShiftDisplay";
import PreviousNightCarryEditor from "../components/PreviousNightCarryEditor";
import { ShiftLabelMode } from "../utils/shiftLabels";

const getNightShiftCodes = (shifts: Shift[]): string[] =>
  shifts.filter((shift) => shift.end > 24).map((shift) => shift.code);

const sanitizeCarry = (
  carry: Record<string, string[]>,
  shifts: Shift[],
  people: Person[],
): Record<string, string[]> => {
  const validPersonIds = new Set(people.map((person) => person.id));
  const nightShiftCodes = getNightShiftCodes(shifts);
  const next: Record<string, string[]> = {};

  nightShiftCodes.forEach((code) => {
    const entries = carry[code] ?? [];
    const filtered = entries.filter((id) => validPersonIds.has(id));
    if (filtered.length > 0) {
      next[code] = filtered;
    }
  });

  return next;
};

const mapsEqual = (
  a: Record<string, string[]>,
  b: Record<string, string[]>,
): boolean => {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) {
    return false;
  }

  return keysA.every((key) => {
    const arrA = a[key] ?? [];
    const arrB = b[key] ?? [];
    if (arrA.length !== arrB.length) {
      return false;
    }
    return arrA.every((value, index) => value === arrB[index]);
  });
};

export default function Home() {
  const [initialData, setInitialData] = useState<InitialData | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [wishOffs, setWishOffs] = useState<WishOffs>({});
  const [paidLeaves, setPaidLeaves] = useState<PaidLeaveRequests>({});
  const [shiftPreferences, setShiftPreferences] = useState<ShiftPreferences>({});
  const [schedule, setSchedule] = useState<Schedule>({});
  const [shortages, setShortages] = useState<ShortageInfo[]>([]);
  const [coverageBreakdown, setCoverageBreakdown] = useState<CoverageBreakdown>({});
  const [isLoading, setIsLoading] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<Person | null>(null);
  const [editingStaff, setEditingStaff] = useState<Person | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [csvUrl, setCsvUrl] = useState<string | null>(null);
  const [previousMonthNightCarry, setPreviousMonthNightCarry] = useState<Record<string, string[]>>({});
  const [shiftLabelMode, setShiftLabelMode] = useState<ShiftLabelMode>("alphabet");
  const [isEditMode, setIsEditMode] = useState(false);
  const [undoStack, setUndoStack] = useState<Schedule[]>([]);
  const [redoStack, setRedoStack] = useState<Schedule[]>([]);

  const cloneSchedule = (source: Schedule): Schedule => {
    return Object.fromEntries(
      Object.entries(source).map(([personId, days]) => [personId, [...(days ?? [])]]),
    );
  };

  const schedulesEqual = (a: Schedule, b: Schedule): boolean => {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      const daysA = a[key] ?? [];
      const daysB = b[key] ?? [];
      if (daysA.length !== daysB.length) {
        return false;
      }
      for (let i = 0; i < daysA.length; i += 1) {
        if (daysA[i] !== daysB[i]) {
          return false;
        }
      }
    }
    return true;
  };

  const updateScheduleWithHistory = (updater: (draft: Schedule) => Schedule) => {
    setSchedule((prev) => {
      const draft = cloneSchedule(prev);
      const next = updater(draft);
      if (schedulesEqual(prev, next)) {
        return prev;
      }
      setUndoStack((stack) => [...stack, cloneSchedule(prev)]);
      setRedoStack([]);
      return next;
    });
  };

  useEffect(() => {
    return () => {
      if (csvUrl) {
        URL.revokeObjectURL(csvUrl);
      }
    };
  }, [csvUrl]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/initial-data");
        if (!res.ok) {
          throw new Error("初期データの取得に失敗しました");
        }
        const data: InitialData = await res.json();
        setInitialData(data);
        setPeople(data.people);
        setPaidLeaves(data.paidLeaves ?? {});
        setPreviousMonthNightCarry(() => {
          const initialCarry = data.previousMonthNightCarry ?? {};
          return sanitizeCarry(initialCarry, data.shifts, data.people);
        });
      } catch (error) {
        console.error("Failed to fetch initial data:", error);
        setStatusMessage("初期データの取得に失敗しました。リロードしてください。");
      }
    };
    fetchData();
  }, []);

  const handleWishOffToggle = (personId: string, dayIndex: number) => {
    setWishOffs((prev) => {
      const current = prev[personId] ?? [];
      const updated = current.includes(dayIndex)
        ? current.filter((value) => value !== dayIndex)
        : [...current, dayIndex];
      if (updated.length === 0) {
        const { [personId]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [personId]: updated };
    });
    setPaidLeaves((prev) => {
      const current = prev[personId] ?? [];
      if (!current.includes(dayIndex)) {
        return prev;
      }
      const updated = current.filter((value) => value !== dayIndex);
      if (updated.length === 0) {
        const { [personId]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [personId]: updated };
    });
  };

  const handlePaidLeaveToggle = (personId: string, dayIndex: number) => {
    setPaidLeaves((prev) => {
      const current = prev[personId] ?? [];
      const updated = current.includes(dayIndex)
        ? current.filter((value) => value !== dayIndex)
        : [...current, dayIndex];
      if (updated.length === 0) {
        const { [personId]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [personId]: updated };
    });
    setWishOffs((prev) => {
      const current = prev[personId] ?? [];
      if (!current.includes(dayIndex)) {
        return prev;
      }
      const updated = current.filter((value) => value !== dayIndex);
      if (updated.length === 0) {
        const { [personId]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [personId]: updated };
    });
  };

  const handleGenerateSchedule = async () => {
    setIsLoading(true);
    setStatusMessage(null);
    setSchedule({});
    setShortages([]);
    setCoverageBreakdown({});
    try {
      const res = await fetch("/api/generate-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          people,
          wishOffs,
          paidLeaves,
          shiftPreferences,
          previousMonthNightCarry,
        }),
      });
      const result: ScheduleResponse = await res.json();
      if (!res.ok) {
        throw new Error(result.message ?? "シフトの作成に失敗しました");
      }
      setSchedule(result.schedule);
      setUndoStack([]);
      setRedoStack([]);
      setShortages(result.shortages);
      setCoverageBreakdown(result.coverageBreakdown ?? {});
      setStatusMessage(result.status);
    } catch (error) {
      console.error("Error generating schedule:", error);
      setStatusMessage(error instanceof Error ? error.message : "不明なエラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportSchedule = () => {
    if (!initialData) {
      return;
    }

    const matrix = buildScheduleMatrix(people, schedule, initialData.days);
    const csvString = toCsvString(matrix);
    const blob = new Blob(["\ufeff" + csvString], { type: "text/csv" });

    if (csvUrl) {
      URL.revokeObjectURL(csvUrl);
    }

    const url = URL.createObjectURL(blob);
    setCsvUrl(url);

    const link = document.createElement("a");
    link.href = url;
    link.download = `shift_schedule_${initialData.year}_${initialData.month}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUpdateStaff = (updatedStaff: Person) => {
    setPeople((prev) => prev.map((person) => (person.id === updatedStaff.id ? updatedStaff : person)));
    setEditingStaff(null);
  };

  const handleShiftPreferenceChange = (personId: string, dayIndex: number, shiftCode: string | null) => {
    setShiftPreferences((prev) => {
      const current = prev[personId] ?? {};
      if (!shiftCode) {
        const { [dayIndex]: _removed, ...rest } = current;
        const next = Object.keys(rest).length > 0 ? rest : undefined;
        if (!next) {
          const { [personId]: _personRemoved, ...others } = prev;
          return others;
        }
        return { ...prev, [personId]: rest };
      }
      return { ...prev, [personId]: { ...current, [dayIndex]: shiftCode } };
    });
  };

  const ensureRowLength = (row: (string | null | undefined)[], desiredLength: number) => {
    if (row.length >= desiredLength) {
      return [...row];
    }
    const padded = [...row];
    while (padded.length < desiredLength) {
      padded.push(null);
    }
    return padded;
  };

  const handleAssignmentChange = (personId: string, dayIndex: number, shiftCode: string | null) => {
    updateScheduleWithHistory((draft) => {
      const daysCount = initialData?.days ?? 0;
      const currentRow = ensureRowLength(draft[personId] ?? [], daysCount);
      currentRow[dayIndex] = shiftCode;
      draft[personId] = currentRow;
      return draft;
    });
  };

  const handleMoveOrCopy = (
    source: { personId: string; dayIndex: number },
    target: { personId: string; dayIndex: number },
    mode: "move" | "copy",
  ) => {
    updateScheduleWithHistory((draft) => {
      const daysCount = initialData?.days ?? 0;
      const sourceRow = ensureRowLength(draft[source.personId] ?? [], daysCount);
      const targetRow = ensureRowLength(draft[target.personId] ?? [], daysCount);
      const shiftCode = sourceRow[source.dayIndex] ?? null;
      if (!shiftCode) {
        return draft;
      }
      const targetPerson = people.find((person) => person.id === target.personId);
      const isTargetOnPaidLeave = paidLeaves[target.personId]?.includes(target.dayIndex) ?? false;
      const isPaidLeaveScheduled = targetRow[target.dayIndex] === "有給";
      if (!targetPerson || !targetPerson.canWork.includes(shiftCode) || isTargetOnPaidLeave || isPaidLeaveScheduled) {
        return draft;
      }
      targetRow[target.dayIndex] = shiftCode;
      if (mode === "move") {
        sourceRow[source.dayIndex] = null;
      }
      draft[source.personId] = sourceRow;
      draft[target.personId] = targetRow;
      return draft;
    });
  };

  const handleUndo = () => {
    setUndoStack((stack) => {
      if (stack.length === 0) {
        return stack;
      }
      const previous = stack[stack.length - 1];
      setRedoStack((redo) => [...redo, cloneSchedule(schedule)]);
      setSchedule(cloneSchedule(previous));
      return stack.slice(0, -1);
    });
  };

  const handleRedo = () => {
    setRedoStack((stack) => {
      if (stack.length === 0) {
        return stack;
      }
      const next = stack[stack.length - 1];
      setUndoStack((undo) => [...undo, cloneSchedule(schedule)]);
      setSchedule(cloneSchedule(next));
      return stack.slice(0, -1);
    });
  };

  const handleDraftSave = () => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("shift-draft", JSON.stringify(schedule));
      }
      setStatusMessage("下書きを保存しました");
    } catch (error) {
      console.error("Failed to save draft", error);
      setStatusMessage("下書きの保存に失敗しました");
    }
  };

  const handleConfirmSave = () => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("shift-confirmed", JSON.stringify(schedule));
      }
      setStatusMessage("確定保存しました");
    } catch (error) {
      console.error("Failed to confirm save", error);
      setStatusMessage("確定保存に失敗しました");
    }
  };

  useEffect(() => {
    if (!initialData) {
      return;
    }

    setPreviousMonthNightCarry((prev) => {
      const sanitized = sanitizeCarry(prev, initialData.shifts, people);
      if (mapsEqual(prev, sanitized)) {
        return prev;
      }
      return sanitized;
    });
  }, [initialData, people]);

  const handlePreviousCarryChange = (next: Record<string, string[]>) => {
    if (!initialData) {
      setPreviousMonthNightCarry(next);
      return;
    }
    const sanitized = sanitizeCarry(next, initialData.shifts, people);
    setPreviousMonthNightCarry(sanitized);
  };

  if (!initialData) {
    return <div className="p-4">Loading initial data...</div>;
  }

  return (
    <div className="flex flex-col h-screen font-sans">
      <header className="bg-white shadow-md p-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Shift Scheduler v5</h1>
          {statusMessage && <p className="text-sm text-gray-500 mt-1">状態: {statusMessage}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              onClick={() =>
                setShiftLabelMode((prev) => (prev === "alphabet" ? "japanese" : "alphabet"))
              }
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300"
            >
              {shiftLabelMode === "alphabet" ? "日本語表記で表示" : "アルファベット表記で表示"}
            </button>
            <button
              onClick={handleExportSchedule}
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300"
            >
              エクスポート
            </button>
            <button
              onClick={handleGenerateSchedule}
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300 disabled:bg-gray-400"
            >
              {isLoading ? "作成中..." : "シフトを作成する"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 justify-end text-sm">
            <button
              onClick={() => setIsEditMode((prev) => !prev)}
              className={`px-4 py-2 rounded-lg font-semibold border transition ${
                isEditMode
                  ? "bg-orange-100 text-orange-700 border-orange-300"
                  : "bg-gray-100 text-gray-700 border-gray-300"
              }`}
            >
              {isEditMode ? "編集モード: ON" : "編集モード: OFF"}
            </button>
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className="px-3 py-2 rounded-lg font-semibold border border-gray-300 bg-white text-gray-700 disabled:bg-gray-100 disabled:text-gray-400"
            >
              Undo
            </button>
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="px-3 py-2 rounded-lg font-semibold border border-gray-300 bg-white text-gray-700 disabled:bg-gray-100 disabled:text-gray-400"
            >
              Redo
            </button>
            <button
              onClick={handleDraftSave}
              className="px-4 py-2 rounded-lg font-semibold border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
            >
              下書き保存
            </button>
            <button
              onClick={handleConfirmSave}
              className="px-4 py-2 rounded-lg font-semibold border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
            >
              確定保存
            </button>
          </div>
        </div>
      </header>

      <main className="flex-grow flex p-4 gap-4 overflow-hidden">
        <div className="w-80 flex flex-col gap-4">
          <StaffList
            people={people}
            selectedStaff={selectedStaff}
            onSelectStaff={setSelectedStaff}
            onEditStaff={setEditingStaff}
          />
          <ShiftDisplay
            selectedStaff={selectedStaff}
            schedule={schedule}
            shiftLabelMode={shiftLabelMode}
          />
          <PreviousNightCarryEditor
            shifts={initialData.shifts}
            people={people}
            value={previousMonthNightCarry}
            onChange={handlePreviousCarryChange}
          />
        </div>
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-auto bg-white rounded-lg shadow">
            <Calendar
              year={initialData.year}
              month={initialData.month}
              days={initialData.days}
              weekdayOfDay1={initialData.weekdayOfDay1}
              people={people}
              schedule={schedule}
              wishOffs={wishOffs}
              paidLeaves={paidLeaves}
              shiftPreferences={shiftPreferences}
              selectedStaff={selectedStaff}
              onWishOffToggle={handleWishOffToggle}
              onPaidLeaveToggle={handlePaidLeaveToggle}
              onShiftPreferenceChange={handleShiftPreferenceChange}
              shortages={shortages}
              shifts={initialData.shifts}
              needTemplate={initialData.needTemplate}
              dayTypeByDate={initialData.dayTypeByDate}
              coverageBreakdown={coverageBreakdown}
              shiftLabelMode={shiftLabelMode}
              isEditMode={isEditMode}
              onAssignmentChange={handleAssignmentChange}
              onMoveOrCopy={handleMoveOrCopy}
            />
          </div>
        </div>
      </main>

      {editingStaff && (
        <StaffEditor
          staff={editingStaff}
          allShifts={initialData.shifts}
          onSave={handleUpdateStaff}
          onClose={() => setEditingStaff(null)}
        />
      )}
    </div>
  );
}
