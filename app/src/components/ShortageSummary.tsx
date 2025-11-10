import { useMemo, type CSSProperties } from "react";
import { DisplayShortageInfo } from "../types";
import { normalizeWeekdayIndex } from "../utils/dateUtils";

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];

interface DayShortageBucket {
  items: DisplayShortageInfo[];
  total: number;
  maxRatio: number;
}

interface ShortageSummaryProps {
  days: number;
  weekdayOfDay1: number;
  shortages: DisplayShortageInfo[];
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

const computeSeverityRatio = (shortage: DisplayShortageInfo) => {
  const needValue = typeof shortage.need === "number" ? shortage.need : null;
  if (needValue && needValue > 0) {
    return shortage.shortage / needValue;
  }
  return shortage.shortage;
};

const buildDayHighlightStyle = (ratio: number): CSSProperties => {
  const clamped = clamp(Number.isFinite(ratio) ? ratio : 0, 0, 2.5);
  const backgroundAlpha = 0.08 + clamped * 0.12;
  const borderAlpha = 0.18 + clamped * 0.2;
  return {
    backgroundColor: `rgba(254, 226, 226, ${backgroundAlpha.toFixed(3)})`,
    borderColor: `rgba(220, 38, 38, ${borderAlpha.toFixed(3)})`,
  };
};

const buildTileStyle = (ratio: number): CSSProperties => {
  const clamped = clamp(Number.isFinite(ratio) ? ratio : 0, 0, 2.5);
  const backgroundAlpha = 0.2 + clamped * 0.25;
  const borderAlpha = 0.35 + clamped * 0.25;
  return {
    backgroundColor: `rgba(254, 202, 202, ${backgroundAlpha.toFixed(3)})`,
    borderColor: `rgba(248, 113, 113, ${borderAlpha.toFixed(3)})`,
    boxShadow: `0 1px 2px rgba(185, 28, 28, ${(0.08 + clamped * 0.08).toFixed(3)})`,
  };
};

export default function ShortageSummary({ days, weekdayOfDay1, shortages }: ShortageSummaryProps) {
  const shortagesByDay = useMemo(() => {
    const map = new Map<number, DayShortageBucket>();
    shortages.forEach((info) => {
      const existing = map.get(info.day);
      const ratio = computeSeverityRatio(info);
      if (existing) {
        existing.items.push(info);
        existing.total += info.shortage;
        if (ratio > existing.maxRatio) {
          existing.maxRatio = ratio;
        }
      } else {
        map.set(info.day, {
          items: [info],
          total: info.shortage,
          maxRatio: ratio,
        });
      }
    });

    map.forEach((bucket) => {
      bucket.items.sort((a, b) => {
        const ratioDiff = computeSeverityRatio(b) - computeSeverityRatio(a);
        if (Math.abs(ratioDiff) > 0.001) {
          return ratioDiff;
        }
        return b.shortage - a.shortage;
      });
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
            const bucket = shortagesByDay.get(day);
            const items = bucket?.items ?? [];
            const totalShortage = bucket?.total ?? 0;
            const highlightStyle =
              bucket && bucket.total > 0 ? buildDayHighlightStyle(bucket.maxRatio) : undefined;

            return (
              <div
                key={day}
                className={`border rounded-lg bg-gray-50 p-2 transition-shadow ${
                  totalShortage > 0 ? "shadow-sm" : ""
                }`}
                style={highlightStyle}
              >
                <div className="flex items-baseline justify-between">
                  <span
                    className={`text-sm font-semibold ${isWeekend ? "text-red-500" : "text-gray-700"}`}
                  >
                    {day}日
                  </span>
                  <span className="text-xs text-gray-500">{WEEKDAYS[weekdayIndex]}</span>
                  {totalShortage > 0 && (
                    <span
                      className="ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold text-red-700"
                    >
                      合計 {totalShortage}人
                    </span>
                  )}
                </div>
                <div className="mt-2 space-y-2">
                  {items.length === 0 ? (
                    <div className="text-xs text-gray-500">不足なし</div>
                  ) : (
                    items.map((item, shortageIndex) => (
                      <div
                        key={`${item.day}-${item.time_range}-${shortageIndex}`}
                        className="rounded-md border px-2 py-2 text-left"
                        style={buildTileStyle(computeSeverityRatio(item))}
                      >
                        <div className="flex items-center justify-between text-xs text-red-800">
                          <span className="font-semibold">{item.time_range}</span>
                          <span className="font-semibold">不足 {item.shortage}人</span>
                        </div>
                        {typeof item.need === "number" && typeof item.actual === "number" && (
                          <div className="mt-2 space-y-1 text-[11px] text-gray-600">
                            <div className="flex items-center justify-between">
                              <span>必要 {item.need}人</span>
                              <span>
                                実 {item.actual}人
                                {item.need > 0 && (
                                  <>
                                    <span className="mx-1">/</span>
                                    <span className="font-semibold text-red-700">
                                      カバー率 {Math.round((item.actual / item.need) * 100)}%
                                    </span>
                                  </>
                                )}
                              </span>
                            </div>
                            {item.need > 0 && (
                              <div className="h-1.5 rounded-full bg-red-100">
                                <div
                                  className={`h-full rounded-full ${
                                    item.actual >= item.need ? "bg-green-500" : "bg-red-500"
                                  }`}
                                  style={{
                                    width: `${Math.min((item.actual / item.need) * 100, 100)}%`,
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        )}
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
