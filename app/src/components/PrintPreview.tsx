import { useEffect } from "react";
import Calendar from "./Calendar";
import ShortageSummary from "./ShortageSummary";
import {
  InitialData,
  Person,
  Schedule,
  ShiftPreferences,
  ShortageInfo,
  WishOffs,
} from "../types";

interface PrintPreviewProps {
  isOpen: boolean;
  initialData: InitialData;
  people: Person[];
  schedule: Schedule;
  wishOffs: WishOffs;
  shiftPreferences: ShiftPreferences;
  shortages: ShortageInfo[];
  displayShortages: ShortageInfo[];
  generatedAt: string;
  onClose: () => void;
}

const noop = () => {};

export default function PrintPreview({
  isOpen,
  initialData,
  people,
  schedule,
  wishOffs,
  shiftPreferences,
  shortages,
  displayShortages,
  generatedAt,
  onClose,
}: PrintPreviewProps) {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeydown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const handlePrint = () => {
    window.print();
  };

  const monthLabel = `${initialData.year}年${initialData.month}月`;

  return (
    <div className="print-preview-overlay" role="dialog" aria-modal="true">
      <div className="print-preview-surface">
        <div className="print-preview-controls">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-800">印刷プレビュー</h2>
              <p className="text-sm text-gray-500">
                {monthLabel}のシフト表を紙出力向けに整えたレイアウトです。
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg transition"
              >
                印刷する
              </button>
              <button
                type="button"
                onClick={onClose}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded-lg transition"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>

        <section className="print-preview-content">
          <header className="print-preview-header">
            <h1 className="text-2xl font-bold text-gray-900">Shift Scheduler v5</h1>
            <p className="text-base text-gray-600">{monthLabel} シフト表</p>
            <p className="text-xs text-gray-400">最終更新: {generatedAt}</p>
          </header>

          <div className="print-preview-calendar">
            <Calendar
              year={initialData.year}
              month={initialData.month}
              days={initialData.days}
              weekdayOfDay1={initialData.weekdayOfDay1}
              people={people}
              schedule={schedule}
              wishOffs={wishOffs}
              shiftPreferences={shiftPreferences}
              selectedStaff={null}
              onWishOffToggle={noop}
              onShiftPreferenceChange={noop}
              shortages={shortages}
              shifts={initialData.shifts}
              needTemplate={initialData.needTemplate}
              dayTypeByDate={initialData.dayTypeByDate}
              onShortagesCalculated={noop}
            />
          </div>

          <div className="print-preview-summary">
            <ShortageSummary
              days={initialData.days}
              weekdayOfDay1={initialData.weekdayOfDay1}
              shortages={displayShortages}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
