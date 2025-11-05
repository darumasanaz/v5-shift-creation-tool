import { useMemo } from "react";
import { ShortageInfo } from "../types";
import { normalizeWeekdayIndex } from "../utils/dateUtils";

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];

interface ShortageSummaryProps {
  days: number;
  weekdayOfDay1: number;
  shortages: ShortageInfo[];
}

export default function ShortageSummary({ days, weekdayOfDay1, shortages }: ShortageSummaryProps) {
  const shortagesByDay = useMemo(() => {
    const map = new Map<number, ShortageInfo[]>();
    shortages.forEach((info) => {
      if (!map.has(info.day)) {
        map.set(info.day, []);
      }
      map.get(info.day)!.push(info);
    });
    return map;
  }, [shortages]);

  if (shortages.length === 0) {
    return null;
  }

  const normalizedWeekdayOfDay1 = normalizeWeekdayIndex(weekdayOfDay1);

  return (
    <div className="bg-white p-4 rounded-lg shadow overflow-x-auto">
      <h3 className="font-bold text-red-600">シフトの問題点</h3>
      <p className="text-xs text-gray-500 mt-1">不足が発生している日を確認してください</p>
      <div className="mt-3 min-w-max">
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${days}, minmax(140px, 1fr))` }}
        >
          {Array.from({ length: days }, (_, index) => {
            const day = index + 1;
            const weekdayIndex = normalizeWeekdayIndex(normalizedWeekdayOfDay1 + index);
            const isWeekend = weekdayIndex >= 5;
            const items = shortagesByDay.get(day) ?? [];

            return (
              <div key={day} className="border border-gray-200 rounded-lg bg-gray-50 p-2">
                <div className="flex items-baseline justify-between">
                  <span
                    className={`text-sm font-semibold ${isWeekend ? "text-red-500" : "text-gray-700"}`}
                  >
                    {day}日
                  </span>
                  <span className="text-xs text-gray-500">{WEEKDAYS[weekdayIndex]}</span>
                </div>
                <div className="mt-2 space-y-2">
                  {items.length === 0 ? (
                    <div className="text-xs text-gray-500">不足なし</div>
                  ) : (
                    items.map((item, shortageIndex) => (
                      <div
                        key={`${item.day}-${item.time_range}-${shortageIndex}`}
                        className="border border-red-200 bg-red-50 rounded-md px-2 py-1"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-red-700">{item.time_range}</span>
                          <span className="font-semibold text-red-600">{item.shortage}人</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
