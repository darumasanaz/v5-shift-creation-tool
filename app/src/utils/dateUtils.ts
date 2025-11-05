const WEEKDAY_NAME_TO_INDEX = new Map<string, number>([
  ["monday", 0],
  ["mon", 0],
  ["月", 0],
  ["月曜", 0],
  ["月曜日", 0],
  ["tuesday", 1],
  ["tue", 1],
  ["火", 1],
  ["火曜", 1],
  ["火曜日", 1],
  ["wednesday", 2],
  ["wed", 2],
  ["水", 2],
  ["水曜", 2],
  ["水曜日", 2],
  ["thursday", 3],
  ["thu", 3],
  ["木", 3],
  ["木曜", 3],
  ["木曜日", 3],
  ["friday", 4],
  ["fri", 4],
  ["金", 4],
  ["金曜", 4],
  ["金曜日", 4],
  ["saturday", 5],
  ["sat", 5],
  ["土", 5],
  ["土曜", 5],
  ["土曜日", 5],
  ["sunday", 6],
  ["sun", 6],
  ["日", 6],
  ["日曜", 6],
  ["日曜日", 6],
]);

export const normalizeWeekdayIndex = (weekday: number): number => {
  if (!Number.isFinite(weekday)) {
    return 0;
  }

  const rounded = Math.trunc(weekday);

  if (rounded >= 1 && rounded <= 7) {
    return ((rounded - 1) % 7 + 7) % 7;
  }

  return ((rounded % 7) + 7) % 7;
};

export const normalizeDayTypeByDate = (
  dayTypeByDate: string[],
  weekdayOfDay1: number,
): string[] => {
  if (!Array.isArray(dayTypeByDate) || dayTypeByDate.length === 0) {
    return dayTypeByDate;
  }

  const normalizedStart = normalizeWeekdayIndex(weekdayOfDay1);
  const counts = new Map<number, number>();

  dayTypeByDate.forEach((label, index) => {
    const normalizedLabel = label.trim().toLowerCase();
    const expected = WEEKDAY_NAME_TO_INDEX.get(normalizedLabel);
    if (expected === undefined) {
      return;
    }
    const actual = (normalizedStart + index) % 7;
    const diff = (actual - expected + 7) % 7;
    counts.set(diff, (counts.get(diff) ?? 0) + 1);
  });

  if (counts.size === 0) {
    return dayTypeByDate;
  }

  const zeroCount = counts.get(0) ?? 0;
  const [bestDiff, bestCount] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];

  if (bestDiff === 0 || bestCount <= zeroCount || bestCount <= 1) {
    return dayTypeByDate;
  }

  const shift = bestDiff % dayTypeByDate.length;
  if (shift === 0) {
    return dayTypeByDate;
  }

  return [...dayTypeByDate.slice(shift), ...dayTypeByDate.slice(0, shift)];
};
