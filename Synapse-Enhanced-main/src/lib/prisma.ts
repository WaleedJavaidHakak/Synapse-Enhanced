import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaExitHook: boolean | undefined
}

// One client per process: every route bundle imports this module, so reuse the global instance
export const prisma = globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

globalForPrisma.prisma = prisma

// Register the exit hook once, not once per bundle (that leaked listeners)
if (!globalForPrisma.prismaExitHook) {
  globalForPrisma.prismaExitHook = true
  process.on('beforeExit', async () => {
    await prisma.$disconnect()
  })
}
