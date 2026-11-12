import { PrismaClient } from "@prisma/client";

// Postgres se usa cuando hay DATABASE_URL. Sin ella, los módulos de lib/*
// usan el fallback JSON en ./data/ (comportamiento original).
export function usePostgres(): boolean {
  return !!process.env.DATABASE_URL;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function prisma(): PrismaClient {
  if (!usePostgres()) throw new Error("DATABASE_URL no configurada (fallback JSON activo)");
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}

// Mutex en proceso: serializa los save* (patrón read-modify-write) dentro de
// una misma instancia, evitando lost updates entre requests concurrentes.
// Las constraints UNIQUE/FK a nivel PG protegen además entre instancias.
let tail: Promise<void> = Promise.resolve();

export function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn);
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
