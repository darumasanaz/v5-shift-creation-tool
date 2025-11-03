import { ChangeEvent, FormEvent, useState } from "react";
import { Person, Shift } from "../types";
import { X } from "lucide-react";

interface StaffEditorProps {
  staff: Person;
  allShifts: Shift[];
  onSave: (updatedStaff: Person) => void;
  onClose: () => void;
}

export default function StaffEditor({ staff, allShifts, onSave, onClose }: StaffEditorProps) {
  const [formData, setFormData] = useState<Person>(staff);

  const weekdays = ["月", "火", "水", "木", "金", "土", "日"];

  const toggleShift = (shiftCode: string) => {
    setFormData((prev) => {
      const canWork = prev.canWork.includes(shiftCode)
        ? prev.canWork.filter((code) => code !== shiftCode)
        : [...prev.canWork, shiftCode];
      return { ...prev, canWork };
    });
  };

  const toggleFixedOffWeekday = (weekday: string) => {
    setFormData((prev) => {
      const fixedOffWeekdays = prev.fixedOffWeekdays.includes(weekday)
        ? prev.fixedOffWeekdays.filter((value) => value !== weekday)
        : [...prev.fixedOffWeekdays, weekday];
      return { ...prev, fixedOffWeekdays };
    });
  };

  const handleNumberChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: Number(value) }));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-gray-200"
          aria-label="閉じる"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-bold mb-4">{staff.id} の情報編集</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <p className="block font-semibold mb-2">勤務可能シフト</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {allShifts.map((shift) => (
                <label key={shift.code} className="flex items-center gap-2 p-2 border rounded-md">
                  <input
                    type="checkbox"
                    checked={formData.canWork.includes(shift.code)}
                    onChange={() => toggleShift(shift.code)}
                  />
                  <span>
                    {shift.name} ({shift.code})
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="block font-semibold mb-2">固定休（曜日）</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {weekdays.map((weekday) => (
                <label key={weekday} className="flex items-center gap-2 p-2 border rounded-md">
                  <input
                    type="checkbox"
                    checked={formData.fixedOffWeekdays.includes(weekday)}
                    onChange={() => toggleFixedOffWeekday(weekday)}
                  />
                  <span>{weekday}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="text-sm font-medium text-gray-700">
              月間勤務日数(min)
              <input
                type="number"
                name="monthlyMin"
                value={formData.monthlyMin}
                onChange={handleNumberChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                min={0}
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              月間勤務日数(max)
              <input
                type="number"
                name="monthlyMax"
                value={formData.monthlyMax}
                onChange={handleNumberChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                min={0}
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              週間勤務日数(min)
              <input
                type="number"
                name="weeklyMin"
                value={formData.weeklyMin}
                onChange={handleNumberChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                min={0}
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              週間勤務日数(max)
              <input
                type="number"
                name="weeklyMax"
                value={formData.weeklyMax}
                onChange={handleNumberChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                min={0}
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              最大連続勤務日数
              <input
                type="number"
                name="consecMax"
                value={formData.consecMax}
                onChange={handleNumberChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                min={1}
              />
            </label>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded"
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
