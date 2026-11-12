-- CreateTable
CREATE TABLE "app_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "glpiBaseUrl" TEXT NOT NULL,
    "appToken" TEXT NOT NULL DEFAULT '',
    "userTokenEnc" TEXT NOT NULL DEFAULT '',
    "keepUserOnMove" BOOLEAN NOT NULL DEFAULT true,
    "rootLocationId" INTEGER,
    "appName" TEXT NOT NULL DEFAULT 'GLPI Move',
    "accentColor" TEXT NOT NULL DEFAULT '#0b5ed7',
    "brandIcon" TEXT,

    CONSTRAINT "app_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "floors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "glpiLocationId" INTEGER,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "floors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "puestos" (
    "floorId" TEXT NOT NULL,
    "glpiId" INTEGER NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "w" DOUBLE PRECISION NOT NULL,
    "h" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "puestos_pkey" PRIMARY KEY ("floorId","glpiId")
);

-- CreateTable
CREATE TABLE "areas" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "responsableUserId" INTEGER NOT NULL,
    "responsableNombre" TEXT,
    "createdAt" BIGINT NOT NULL,
    "updatedAt" BIGINT NOT NULL,

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mails" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "createdAt" BIGINT NOT NULL,
    "updatedAt" BIGINT NOT NULL,

    CONSTRAINT "mails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shares" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "ruta" TEXT NOT NULL,
    "rutaKey" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "createdAt" BIGINT NOT NULL,
    "updatedAt" BIGINT NOT NULL,

    CONSTRAINT "shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_grants" (
    "accountId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "userDisplay" TEXT,
    "userFirstname" TEXT,
    "userRealname" TEXT,
    "canSend" BOOLEAN NOT NULL DEFAULT false,
    "canRead" BOOLEAN NOT NULL DEFAULT false,
    "by" TEXT,
    "at" BIGINT NOT NULL,

    CONSTRAINT "mail_grants_pkey" PRIMARY KEY ("accountId","userId")
);

-- CreateTable
CREATE TABLE "share_grants" (
    "shareId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "userDisplay" TEXT,
    "userFirstname" TEXT,
    "userRealname" TEXT,
    "by" TEXT,
    "at" BIGINT NOT NULL,

    CONSTRAINT "share_grants_pkey" PRIMARY KEY ("shareId","userId")
);

-- CreateTable
CREATE TABLE "activity_log" (
    "id" BIGSERIAL NOT NULL,
    "ts" BIGINT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "glpiId" INTEGER NOT NULL,
    "locationId" INTEGER,
    "userId" INTEGER,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mails_direccion_key" ON "mails"("direccion");

-- CreateIndex
CREATE UNIQUE INDEX "shares_rutaKey_key" ON "shares"("rutaKey");

-- AddForeignKey
ALTER TABLE "puestos" ADD CONSTRAINT "puestos_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "floors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mails" ADD CONSTRAINT "mails_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_grants" ADD CONSTRAINT "mail_grants_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "mails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_grants" ADD CONSTRAINT "share_grants_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

