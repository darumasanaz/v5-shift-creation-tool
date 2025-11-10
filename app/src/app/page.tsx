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
import ShortageSummary from "../components/ShortageSummary";
import PreviousNightCarryEditor from "../components/PreviousNightCarryEditor";

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
  const [displayShortages, setDisplayShortages] = useState<ShortageInfo[]>([]);
  const [coverageBreakdown, setCoverageBreakdown] = useState<CoverageBreakdown>({});
  const [isLoading, setIsLoading] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<Person | null>(null);
  const [editingStaff, setEditingStaff] = useState<Person | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [csvUrl, setCsvUrl] = useState<string | null>(null);
  const [previousMonthNightCarry, setPreviousMonthNightCarry] = useState<Record<string, string[]>>({});

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
    setDisplayShortages([]);
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
        <div className="flex gap-2">
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
      </header>

      <main className="flex-grow flex p-4 gap-4 overflow-hidden">
        <div className="w-80 flex flex-col gap-4">
          <StaffList
            people={people}
            selectedStaff={selectedStaff}
            onSelectStaff={setSelectedStaff}
            onEditStaff={setEditingStaff}
          />
          <ShiftDisplay selectedStaff={selectedStaff} schedule={schedule} />
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
              onShortagesCalculated={setDisplayShortages}
            />
          </div>
          <div className="flex-shrink-0">
            <ShortageSummary
              days={initialData.days}
              weekdayOfDay1={initialData.weekdayOfDay1}
              shortages={displayShortages}
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
