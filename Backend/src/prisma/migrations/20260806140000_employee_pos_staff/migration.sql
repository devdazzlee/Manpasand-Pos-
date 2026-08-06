-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED');

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- AlterTable Employee: additive columns
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "employee_code" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "employment_type" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME';
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "date_of_birth" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "personal_email" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "emergency_name" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "emergency_phone" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "photo_url" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "deactivated_at" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "deactivated_reason" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "department_id" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "reporting_manager_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Employee_employee_code_key" ON "Employee"("employee_code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Employee_department_id_idx" ON "Employee"("department_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Employee_status_idx" ON "Employee"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Employee_employee_code_idx" ON "Employee"("employee_code");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_reporting_manager_id_fkey" FOREIGN KEY ("reporting_manager_id") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
