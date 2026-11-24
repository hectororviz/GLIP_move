-- CreateTable
CREATE TABLE "ad_users" (
    "loginKey" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cuenta" TEXT NOT NULL,
    "ultimoCambio" TEXT NOT NULL DEFAULT '',
    "ultimoCambioTs" BIGINT,
    "vencimiento" TEXT NOT NULL DEFAULT '',
    "vencimientoTs" BIGINT,
    "diasRestantes" INTEGER,
    "estadoClave" TEXT NOT NULL,
    "ausenteUltimoImport" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenAt" BIGINT NOT NULL,
    "updatedAt" BIGINT NOT NULL,
    "lastImportAt" BIGINT NOT NULL,
    "sourceFile" TEXT,

    CONSTRAINT "ad_users_pkey" PRIMARY KEY ("loginKey")
);
