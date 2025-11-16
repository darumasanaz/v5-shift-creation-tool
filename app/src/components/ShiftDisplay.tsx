import { Person, Schedule } from "../types";
import { ShiftLabelMode, toDisplayShiftLabel } from "../utils/shiftLabels";

interface ShiftDisplayProps {
  selectedStaff: Person | null;
  schedule: Schedule;
  shiftLabelMode: ShiftLabelMode;
}

export default function ShiftDisplay({
  selectedStaff,
  schedule,
  shiftLabelMode,
}: ShiftDisplayProps) {
  if (!selectedStaff) {
    return (
      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-800 mb-2">個別シフト</h3>
        <p className="text-sm text-gray-500">スタッフを選択するとシフトが表示されます。</p>
      </div>
    );
  }

  const assignments = schedule[selectedStaff.id] ?? [];

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <h3 className="text-lg font-semibold text-gray-800 mb-3">{selectedStaff.id} のシフト</h3>
      {assignments.length === 0 ? (
        <p className="text-sm text-gray-500">まだシフトが作成されていません。</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 text-sm text-gray-700 max-h-60 overflow-y-auto">
          {assignments.map((shift, index) => (
            <li key={`${selectedStaff.id}-${index}`} className="flex items-center justify-between p-2 border rounded">
              <span>{index + 1}日</span>
              <span className={shift ? "font-semibold text-blue-700" : "text-gray-400"}>
                {shift ? toDisplayShiftLabel(shift, shiftLabelMode) : "-"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
