import { Person, Schedule } from "../types";

export function buildScheduleMatrix(
  people: Person[],
  schedule: Schedule,
  days: number
): string[][] {
  const header = ["スタッフ", ...Array.from({ length: days }, (_, index) => `${index + 1}日`)];

  const rows = people.map((person) => {
    const assignments = Array.from({ length: days }, (_, dayIndex) => {
      const value = schedule[person.id]?.[dayIndex];
      return value ?? "";
    });

    return [person.id, ...assignments];
  });

  return [header, ...rows];
}

export function toCsvString(matrix: string[][]): string {
  return matrix
    .map((row) =>
      row
        .map((value) => {
          const stringValue = value ?? "";
          const escaped = String(stringValue).replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(",")
    )
    .join("\n");
}
