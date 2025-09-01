-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('UAI', 'UA', 'UV', 'UReg', 'UTI', 'UR', 'UC', 'UE', 'UEN');

-- CreateEnum
CREATE TYPE "EstadoRegistro" AS ENUM ('SN_OK', 'SCRAP_COSMETICO', 'SCRAP_ELECTRONICO', 'SCRAP_INFESTACION', 'REPARACION');

-- CreateEnum
CREATE TYPE "EstadoLote" AS ENUM ('EN_PROCESO', 'PAUSADO', 'COMPLETADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoInsumo" AS ENUM ('CAPUCHONES', 'BASES', 'TAPAS');

-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('ENTRADA', 'SALIDA');

-- CreateEnum
CREATE TYPE "FaseProceso" AS ENUM ('REGISTRO', 'TEST_INICIAL', 'ENSAMBLE', 'RETEST', 'EMPAQUE', 'SCRAP', 'REPARACION');

-- CreateEnum
CREATE TYPE "MotivoScrap" AS ENUM ('FUERA_DE_RANGO', 'DEFECTO_SW', 'SIN_REPARACION', 'COSMETICA', 'INFESTADO', 'OTRO');

-- CreateEnum
CREATE TYPE "DetalleScrap" AS ENUM ('CIRCUITO_OK_BASE_NOK', 'BASE_OK_CIRCUITO_NOK', 'CIRCUITO_NOK_BASE_NOK', 'INFESTACION', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoLote" AS ENUM ('ENTRADA', 'SALIDA');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "activo" BOOLEAN NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogoSKU" (
    "id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "skuItem" TEXT,
    "descripcion" TEXT,

    CONSTRAINT "CatalogoSKU_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lote" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "skuId" INTEGER NOT NULL,
    "tipoLote" "TipoLote" NOT NULL DEFAULT 'ENTRADA',
    "esScrap" BOOLEAN NOT NULL DEFAULT false,
    "motivoScrap" "MotivoScrap",
    "estado" "EstadoLote" NOT NULL DEFAULT 'EN_PROCESO',
    "prioridad" INTEGER NOT NULL DEFAULT 5,
    "responsableId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Lote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Modem" (
    "id" SERIAL NOT NULL,
    "sn" TEXT NOT NULL,
    "skuId" INTEGER NOT NULL,
    "estadoActualId" INTEGER NOT NULL,
    "faseActual" "FaseProceso" NOT NULL,
    "loteId" INTEGER NOT NULL,
    "loteSalidaId" INTEGER,
    "responsableId" INTEGER NOT NULL,
    "motivoScrap" "MotivoScrap",
    "detalleScrap" "DetalleScrap",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Modem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Registro" (
    "id" SERIAL NOT NULL,
    "sn" TEXT NOT NULL,
    "fase" "FaseProceso" NOT NULL,
    "estado" "EstadoRegistro" NOT NULL,
    "motivoScrap" "MotivoScrap",
    "detalleScrap" "DetalleScrap",
    "reparacion" TEXT,
    "userId" INTEGER NOT NULL,
    "loteId" INTEGER NOT NULL,
    "modemId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Registro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Log" (
    "id" SERIAL NOT NULL,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "detalle" TEXT,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estado" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "codigoInterno" TEXT NOT NULL,
    "esFinal" BOOLEAN NOT NULL DEFAULT false,
    "requiereObservacion" BOOLEAN NOT NULL DEFAULT false,
    "ordenDisplay" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Estado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventarioCosmetico" (
    "id" SERIAL NOT NULL,
    "skuId" INTEGER NOT NULL,
    "tipoInsumo" "TipoInsumo" NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventarioCosmetico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroInsumo" (
    "id" SERIAL NOT NULL,
    "tipoMovimiento" "TipoMovimiento" NOT NULL,
    "tipoInsumo" "TipoInsumo" NOT NULL,
    "skuId" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "responsableId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroInsumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransicionEstado" (
    "id" SERIAL NOT NULL,
    "estadoDesdeId" INTEGER NOT NULL,
    "estadoHaciaId" INTEGER NOT NULL,
    "nombreEvento" TEXT NOT NULL,
    "descripcion" TEXT,
    "requiereCantidad" BOOLEAN NOT NULL DEFAULT false,
    "requiereObservacion" BOOLEAN NOT NULL DEFAULT false,
    "rolesPermitidos" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransicionEstado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_userName_key" ON "User"("userName");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogoSKU_nombre_key" ON "CatalogoSKU"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogoSKU_skuItem_key" ON "CatalogoSKU"("skuItem");

-- CreateIndex
CREATE UNIQUE INDEX "Lote_numero_key" ON "Lote"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Modem_sn_key" ON "Modem"("sn");

-- CreateIndex
CREATE INDEX "Registro_userId_idx" ON "Registro"("userId");

-- CreateIndex
CREATE INDEX "Registro_loteId_idx" ON "Registro"("loteId");

-- CreateIndex
CREATE INDEX "Registro_modemId_idx" ON "Registro"("modemId");

-- CreateIndex
CREATE UNIQUE INDEX "Estado_nombre_key" ON "Estado"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Estado_codigoInterno_key" ON "Estado"("codigoInterno");

-- CreateIndex
CREATE INDEX "InventarioCosmetico_skuId_idx" ON "InventarioCosmetico"("skuId");

-- CreateIndex
CREATE UNIQUE INDEX "InventarioCosmetico_skuId_tipoInsumo_key" ON "InventarioCosmetico"("skuId", "tipoInsumo");

-- CreateIndex
CREATE INDEX "RegistroInsumo_skuId_idx" ON "RegistroInsumo"("skuId");

-- CreateIndex
CREATE INDEX "RegistroInsumo_responsableId_idx" ON "RegistroInsumo"("responsableId");

-- CreateIndex
CREATE INDEX "TransicionEstado_estadoDesdeId_idx" ON "TransicionEstado"("estadoDesdeId");

-- CreateIndex
CREATE INDEX "TransicionEstado_estadoHaciaId_idx" ON "TransicionEstado"("estadoHaciaId");

-- CreateIndex
CREATE UNIQUE INDEX "TransicionEstado_estadoDesdeId_nombreEvento_key" ON "TransicionEstado"("estadoDesdeId", "nombreEvento");

-- AddForeignKey
ALTER TABLE "Lote" ADD CONSTRAINT "Lote_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "CatalogoSKU"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lote" ADD CONSTRAINT "Lote_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Modem" ADD CONSTRAINT "Modem_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "CatalogoSKU"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Modem" ADD CONSTRAINT "Modem_estadoActualId_fkey" FOREIGN KEY ("estadoActualId") REFERENCES "Estado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Modem" ADD CONSTRAINT "Modem_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Modem" ADD CONSTRAINT "Modem_loteSalidaId_fkey" FOREIGN KEY ("loteSalidaId") REFERENCES "Lote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Modem" ADD CONSTRAINT "Modem_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registro" ADD CONSTRAINT "Registro_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registro" ADD CONSTRAINT "Registro_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registro" ADD CONSTRAINT "Registro_modemId_fkey" FOREIGN KEY ("modemId") REFERENCES "Modem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Log" ADD CONSTRAINT "Log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioCosmetico" ADD CONSTRAINT "InventarioCosmetico_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "CatalogoSKU"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroInsumo" ADD CONSTRAINT "RegistroInsumo_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "CatalogoSKU"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroInsumo" ADD CONSTRAINT "RegistroInsumo_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransicionEstado" ADD CONSTRAINT "TransicionEstado_estadoDesdeId_fkey" FOREIGN KEY ("estadoDesdeId") REFERENCES "Estado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransicionEstado" ADD CONSTRAINT "TransicionEstado_estadoHaciaId_fkey" FOREIGN KEY ("estadoHaciaId") REFERENCES "Estado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
