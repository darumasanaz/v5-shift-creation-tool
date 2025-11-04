import { Person, Schedule, WishOffs } from "../types";

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
}

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];

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
}: CalendarProps) {
  const firstDayOffset = ((weekdayOfDay1 % 7) + 7) % 7;

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
        </tbody>
      </table>
    </div>
  );
}
