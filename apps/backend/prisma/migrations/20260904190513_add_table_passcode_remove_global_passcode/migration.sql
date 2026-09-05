-- 每桌固定开台密码，取代全店统一密码机制
ALTER TABLE "tables" ADD COLUMN "passcode" TEXT;

-- 回填现有行：按桌号顺序生成互不相同的占位密码 1234, 1235, 1236 ...
-- （用户要求先都设成"1234"，但密码要能从密码反查唯一一张桌，不能重复，
--  所以顺序回填、之后店长可以在管理界面里逐桌改成想要的号码）
WITH seq AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "tableNumber") AS rn FROM "tables"
)
UPDATE "tables" t SET "passcode" = LPAD((1233 + seq.rn)::text, 4, '0')
FROM seq WHERE t.id = seq.id;

ALTER TABLE "tables" ALTER COLUMN "passcode" SET NOT NULL;
CREATE UNIQUE INDEX "tables_passcode_key" ON "tables"("passcode");

-- 全店统一开台密码机制废弃，改为每桌固定密码
ALTER TABLE "store_config" DROP COLUMN "tabletOpenPasscodeHash";
