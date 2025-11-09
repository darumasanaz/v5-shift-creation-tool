import { Person, Shift } from "../types";

interface PreviousNightCarryEditorProps {
  shifts: Shift[];
  people: Person[];
  value: Record<string, string[]>;
  onChange: (next: Record<string, string[]>) => void;
}

export default function PreviousNightCarryEditor({
  shifts,
  people,
  value,
  onChange,
}: PreviousNightCarryEditorProps) {
  const nightShifts = shifts.filter((shift) => shift.end > 24);

  if (nightShifts.length === 0) {
    return null;
  }

  const handleToggle = (shiftCode: string, personId: string) => {
    const current = value[shiftCode] ?? [];
    const nextPeople = current.includes(personId)
      ? current.filter((id) => id !== personId)
      : [...current, personId];
    const next = { ...value };
    if (nextPeople.length > 0) {
      next[shiftCode] = nextPeople;
    } else {
      delete next[shiftCode];
    }
    onChange(next);
  };

  const handleClear = (shiftCode: string) => {
    if (!value[shiftCode]) {
      return;
    }
    const { [shiftCode]: _removed, ...rest } = value;
    onChange(rest);
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h2 className="text-lg font-semibold text-gray-800 mb-2">前月夜勤の引継ぎ</h2>
      <p className="text-sm text-gray-500 mb-3">
        前月末の夜勤から継続勤務している職員を選択してください。
      </p>
      {nightShifts.map((shift) => {
        const selected = value[shift.code] ?? [];
        return (
          <div key={shift.code} className="mb-4 last:mb-0">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-gray-700">
                {shift.name}（{shift.code}）
              </span>
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleClear(shift.code)}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  クリア
                </button>
              )}
            </div>
            {people.length === 0 ? (
              <p className="text-sm text-gray-500">職員が登録されていません。</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {people.map((person) => {
                  const checked = selected.includes(person.id);
                  return (
                    <label
                      key={`${shift.code}_${person.id}`}
                      className="inline-flex items-center gap-1 text-sm text-gray-700"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={checked}
                        onChange={() => handleToggle(shift.code, person.id)}
                      />
                      <span>{person.id}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
