export const SHIFT_JAPANESE_LABELS: Record<string, string> = {
  EA: "早",
  DA: "日A",
  DB: "日B",
  LA: "遅",
  NA: "夜A",
  NB: "夜B",
  NC: "夜C",
};

export type ShiftLabelMode = "alphabet" | "japanese";

export const toDisplayShiftLabel = (code: string, mode: ShiftLabelMode): string => {
  if (!code) {
    return "";
  }
  if (mode === "japanese") {
    return SHIFT_JAPANESE_LABELS[code] ?? code;
  }
  return code;
};
