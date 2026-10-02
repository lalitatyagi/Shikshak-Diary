import { loadEnv } from "../src/load-env.js";

loadEnv();

import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  SEED,
  assertUniqueRollNumbers,
  buildStudentPlans,
} from "../src/seed/seed-plan.js";

const prisma = new PrismaClient();

async function seed(): Promise<void> {
  const students = buildStudentPlans(SEED.studentCount);
  assertUniqueRollNumbers(students);

  const passwordHash = await bcrypt.hash(SEED.teacher.password, 10);

  // Idempotent: remove previous demo rows, then recreate.
  await prisma.user.deleteMany({ where: { email: SEED.teacher.email } });
  await prisma.school.deleteMany({ where: { name: SEED.schoolName } });

  const school = await prisma.school.create({
    data: { name: SEED.schoolName },
  });

  const teacher = await prisma.user.create({
    data: {
      name: SEED.teacher.name,
      email: SEED.teacher.email,
      passwordHash,
      role: Role.TEACHER,
    },
  });

  const classroom = await prisma.class.create({
    data: {
      schoolId: school.id,
      name: SEED.className,
      academicYear: SEED.academicYear,
    },
  });

  const subject = await prisma.subject.create({
    data: {
      schoolId: school.id,
      name: SEED.subjectName,
    },
  });

  await prisma.teacherClassSubject.create({
    data: {
      teacherId: teacher.id,
      classId: classroom.id,
      subjectId: subject.id,
    },
  });

  for (const plan of students) {
    const student = await prisma.student.create({
      data: {
        schoolId: school.id,
        name: plan.name,
        rollNumber: plan.rollNumber,
        parentContact: plan.parentContact,
      },
    });

    await prisma.enrollment.create({
      data: {
        studentId: student.id,
        classId: classroom.id,
      },
    });
  }

  const enrolledCount = await prisma.enrollment.count({
    where: { classId: classroom.id },
  });

  console.log("Seed complete:");
  console.log(`  School:   ${school.name}`);
  console.log(`  Teacher:  ${teacher.email} / ${SEED.teacher.password}`);
  console.log(`  Class:    ${classroom.name} (${classroom.academicYear})`);
  console.log(`  Subject:  ${subject.name}`);
  console.log(`  Students: ${enrolledCount} enrolled`);
}

seed()
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
