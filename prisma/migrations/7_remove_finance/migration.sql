-- حذف کامل ماژول مالی و حسابداری (Payment و Receivable)
-- درخواست کارفرما: «حسابداری دارم — بخش مالی نباشد»

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Payment";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Receivable";
PRAGMA foreign_keys=on;
