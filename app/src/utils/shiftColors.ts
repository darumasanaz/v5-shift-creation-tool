const SHIFT_COLOR_CLASSES: Record<string, string> = {
  EA: "text-lime-600", // 早番
  DA: "text-gray-900", // 日勤A
  DB: "text-gray-900", // 日勤B
  LA: "text-gray-900", // 遅番
  NA: "text-yellow-500", // 夜勤A
  NB: "text-yellow-500", // 夜勤B
  NC: "text-yellow-500", // 夜勤C
  明: "text-red-500", // 明け
};

export const getShiftTextColorClass = (shiftCode?: string | null): string => {
  if (!shiftCode) {
    return "text-gray-800";
  }
  return SHIFT_COLOR_CLASSES[shiftCode] ?? "text-gray-800";
};
