-- AlterTable
ALTER TABLE "ad_users" ADD COLUMN     "diasTexto" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "email" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "ultimoLogon" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "ultimoLogonTs" BIGINT;
