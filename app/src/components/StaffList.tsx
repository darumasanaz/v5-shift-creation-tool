import { Person } from "../types";
import { User, Edit } from "lucide-react";

interface StaffListProps {
  people: Person[];
  selectedStaff: Person | null;
  onSelectStaff: (staff: Person | null) => void;
  onEditStaff: (staff: Person) => void;
}

export default function StaffList({ people, selectedStaff, onSelectStaff, onEditStaff }: StaffListProps) {
  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <h2 className="text-lg font-bold mb-3 text-gray-800">スタッフ一覧</h2>
      <p className="text-xs text-gray-500 mb-3">クリックで希望休入力、鉛筆アイコンで契約編集</p>
      <ul className="space-y-2">
        {people.map((person) => (
          <li key={person.id}>
            <div
              onClick={() => onSelectStaff(person.id === selectedStaff?.id ? null : person)}
              className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition duration-200 ${
                selectedStaff?.id === person.id ? "bg-blue-100 ring-2 ring-blue-500" : "hover:bg-gray-100"
              }`}
            >
              <div className="flex items-center gap-2">
                <User size={16} className="text-gray-600" />
                <span className="font-medium text-gray-700">{person.id}</span>
              </div>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onEditStaff(person);
                }}
                className="p-1 rounded-full hover:bg-gray-200 text-gray-500 hover:text-gray-800"
                title={`${person.id}の情報を編集`}
              >
                <Edit size={16} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
