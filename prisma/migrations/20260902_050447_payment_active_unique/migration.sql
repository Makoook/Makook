CREATE UNIQUE INDEX "Payment_one_active_per_mission"
ON "Payment" ("missionId")
WHERE "status" IN ('CREATED', 'AUTHORIZED', 'CAPTURED');
