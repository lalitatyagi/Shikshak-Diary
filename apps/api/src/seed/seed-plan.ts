/** Demo seed constants — keep in sync with README demo login. */
export const SEED = {
  schoolName: "Shikshak Demo School",
  className: "8-B",
  academicYear: "2025-26",
  subjectName: "Mathematics",
  teacher: {
    name: "Priya Sharma",
    email: "teacher@demo.local",
    /** Plain password used only by the seed script (hashed before insert). */
    password: "Teacher123!",
  },
  studentCount: 40,
} as const;

const FIRST_NAMES = [
  "Aarav",
  "Ananya",
  "Arjun",
  "Diya",
  "Ishaan",
  "Kavya",
  "Krishna",
  "Meera",
  "Neha",
  "Om",
  "Priya",
  "Rahul",
  "Riya",
  "Rohan",
  "Saanvi",
  "Siddharth",
  "Tanvi",
  "Vihaan",
  "Yash",
  "Zara",
] as const;

const LAST_NAMES = [
  "Sharma",
  "Verma",
  "Patel",
  "Singh",
  "Gupta",
  "Khan",
  "Nair",
  "Reddy",
  "Iyer",
  "Joshi",
] as const;

export type SeedStudentPlan = {
  name: string;
  rollNumber: number;
  parentContact: string | null;
};

/**
 * Builds the fixed list of students for the demo class.
 * Pure function — no DB — so we can unit-test counts and uniqueness.
 */
export function buildStudentPlans(
  count: number = SEED.studentCount,
): SeedStudentPlan[] {
  if (count < 1) {
    throw new Error("Student count must be at least 1");
  }

  const students: SeedStudentPlan[] = [];

  for (let roll = 1; roll <= count; roll += 1) {
    const first = FIRST_NAMES[(roll - 1) % FIRST_NAMES.length]!;
    const last = LAST_NAMES[(roll - 1) % LAST_NAMES.length]!;
    students.push({
      name: `${first} ${last}`,
      rollNumber: roll,
      parentContact:
        roll % 5 === 0 ? `9${String(800000000 + roll).slice(0, 9)}` : null,
    });
  }

  return students;
}

export function assertUniqueRollNumbers(students: SeedStudentPlan[]): void {
  const rolls = new Set(students.map((s) => s.rollNumber));
  if (rolls.size !== students.length) {
    throw new Error("Seed students must have unique roll numbers");
  }
}
