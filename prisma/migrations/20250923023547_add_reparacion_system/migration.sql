-- Migración manual para sistema de reparaciones
-- Aplicar después de que la base de datos esté disponible

-- 1. Agregar el rol URep si no existe
DO $$ BEGIN
    ALTER TYPE "Rol" ADD VALUE 'URep';
EXCEPTION
    WHEN invalid_schema_name THEN null;
    WHEN duplicate_object THEN null;
END $$;

-- 2. Crear enum NivelReparacion
DO $$ BEGIN
    CREATE TYPE "NivelReparacion" AS ENUM ('NA', 'NIVEL_1', 'NIVEL_2', 'NIVEL_2_PLUS');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Crear tabla CodigoReparacion
CREATE TABLE IF NOT EXISTS "CodigoReparacion" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodigoReparacion_pkey" PRIMARY KEY ("id")
);

-- 4. Crear tabla CodigoDano
CREATE TABLE IF NOT EXISTS "CodigoDano" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "codigoRepId" INTEGER,
    "nivelRep" "NivelReparacion",
    "scrap" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodigoDano_pkey" PRIMARY KEY ("id")
);

-- 5. Agregar columnas a la tabla Registro
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'Registro' AND column_name = 'codigoReparacionId'
    ) THEN
        ALTER TABLE "Registro" ADD COLUMN "codigoReparacionId" INTEGER;
    END IF;
    
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'Registro' AND column_name = 'codigoDanoId'
    ) THEN
        ALTER TABLE "Registro" ADD COLUMN "codigoDanoId" INTEGER;
    END IF;
    
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'Registro' AND column_name = 'fechaInicioReparacion'
    ) THEN
        ALTER TABLE "Registro" ADD COLUMN "fechaInicioReparacion" TIMESTAMP(3);
    END IF;
    
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'Registro' AND column_name = 'fechaFinReparacion'
    ) THEN
        ALTER TABLE "Registro" ADD COLUMN "fechaFinReparacion" TIMESTAMP(3);
    END IF;
    
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'Registro' AND column_name = 'observacionesReparacion'
    ) THEN
        ALTER TABLE "Registro" ADD COLUMN "observacionesReparacion" TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'Registro' AND column_name = 'tecnicoReparador'
    ) THEN
        ALTER TABLE "Registro" ADD COLUMN "tecnicoReparador" TEXT;
    END IF;
END $$;

-- 6. Crear índices únicos
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace 
        WHERE c.relname = 'CodigoReparacion_codigo_key' AND n.nspname = 'public'
    ) THEN
        CREATE UNIQUE INDEX "CodigoReparacion_codigo_key" ON "CodigoReparacion"("codigo");
    END IF;
    
    IF NOT EXISTS (
        SELECT FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace 
        WHERE c.relname = 'CodigoDano_codigo_key' AND n.nspname = 'public'
    ) THEN
        CREATE UNIQUE INDEX "CodigoDano_codigo_key" ON "CodigoDano"("codigo");
    END IF;
    
    IF NOT EXISTS (
        SELECT FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace 
        WHERE c.relname = 'Registro_codigoReparacionId_idx' AND n.nspname = 'public'
    ) THEN
        CREATE INDEX "Registro_codigoReparacionId_idx" ON "Registro"("codigoReparacionId");
    END IF;
    
    IF NOT EXISTS (
        SELECT FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace 
        WHERE c.relname = 'Registro_codigoDanoId_idx' AND n.nspname = 'public'
    ) THEN
        CREATE INDEX "Registro_codigoDanoId_idx" ON "Registro"("codigoDanoId");
    END IF;
END $$;

-- 7. Crear foreign keys
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.table_constraints 
        WHERE constraint_name = 'CodigoDano_codigoRepId_fkey'
    ) THEN
        ALTER TABLE "CodigoDano" ADD CONSTRAINT "CodigoDano_codigoRepId_fkey" 
        FOREIGN KEY ("codigoRepId") REFERENCES "CodigoReparacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT FROM information_schema.table_constraints 
        WHERE constraint_name = 'Registro_codigoReparacionId_fkey'
    ) THEN
        ALTER TABLE "Registro" ADD CONSTRAINT "Registro_codigoReparacionId_fkey" 
        FOREIGN KEY ("codigoReparacionId") REFERENCES "CodigoReparacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT FROM information_schema.table_constraints 
        WHERE constraint_name = 'Registro_codigoDanoId_fkey'
    ) THEN
        ALTER TABLE "Registro" ADD CONSTRAINT "Registro_codigoDanoId_fkey" 
        FOREIGN KEY ("codigoDanoId") REFERENCES "CodigoDano"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- 8. Insertar códigos de reparación (seed data)
INSERT INTO "CodigoReparacion" ("codigo", "descripcion", "activo", "createdAt", "updatedAt") VALUES
    ('N001', 'Equipo OK (Sin reparación)', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('N002', 'Limpieza general del equipo', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('N003', 'Reemplazo de carcasa', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('N004', 'Reemplazo de conectores externos', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('N005', 'Reemplazo de botones', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('N006', 'Reemplazo de antena', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('N007', 'Reemplazo de fuente de poder', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('N008', 'Reemplazo de LEDs indicadores', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('N009', 'Reparación de ventilación', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('N010', 'Reemplazo de etiquetas', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('N011', 'Secado por humedad', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('N012', 'Enfriamiento y ventilación adicional', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('N013', 'Reemplazo de memoria', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('N014', 'Actualización de firmware', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('N015', 'Reconfiguración de software', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('N016', 'Pruebas y calibración final', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('SC1', 'Soldadura de componentes básicos', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('SC2', 'Soldadura de conectores internos', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('SC3', 'Reparación de circuito impreso', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("codigo") DO NOTHING;

-- 9. Insertar códigos de daño (seed data)
INSERT INTO "CodigoDano" ("codigo", "descripcion", "nivelRep", "scrap", "activo", "createdAt", "updatedAt") VALUES
    -- Códigos de diagnóstico para SCRAP ELECTRÓNICO (R01)
    ('T001', 'TARJETA SCRAP', 'NA', 'NA', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('D002', 'NO ENCIENDE', 'NIVEL_2_PLUS', 'N012', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('D003', 'SE PASMA', 'NIVEL_2_PLUS', 'N012', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('D004', 'SE RESETEA', 'NIVEL_2_PLUS', 'N012', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('D005', 'LINEA TELEFÓNICA 1', 'NIVEL_1', 'N006', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('D006', 'LINEA TELEFONICA 2', 'NA', 'NA', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('D007', 'LAN 1', 'NIVEL_1', 'N006', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('D008', 'LAN 2', 'NIVEL_1', 'N006', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('D009', 'LAN 3', 'NIVEL_1', 'N006', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('D010', 'LAN 4', 'NIVEL_1', 'N006', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('D011', 'NO SE REGISTRA', 'NA', 'NA', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('D012', 'SIN TX/FO', 'NIVEL_2_PLUS', 'N014', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('D013', 'SIN RX/FO', 'NIVEL_2_PLUS', 'N014', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('D014', 'CONECTORES', 'NIVEL_1', 'N006', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('D015', 'SIN CONEXIÓN GPON (LOS)', 'NIVEL_2_PLUS', 'N014', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('D016', 'SIN ACCESO A CONFIGURACIONES', 'NA', 'N004', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('D017', 'SIN WIFI', 'NIVEL_2_PLUS', 'N012', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('D018', 'WIFI (BAJA CALIDAD Y/O BAJA POTENCIA)', 'NIVEL_2_PLUS', 'N012', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('D019', 'NO SE RESETEA', 'NA', 'NA', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('D020', 'NO ACTUALIZA FIRMWARE', 'NA', 'NA', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('D021', 'PACKET LOSS', 'NIVEL_2_PLUS', 'N012', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('D022', 'ANTENA DAÑADA', 'NIVEL_2_PLUS', 'N010', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('D023', 'BOTONES DAÑADOS', 'NIVEL_2', 'N009', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('D024', 'INDICADORES LED DAÑADOS', 'NIVEL_2_PLUS', 'N010', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('D025', 'NO SE ESPECIFICA DAÑO', 'NIVEL_2_PLUS', 'N009', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    -- Códigos de daño originales (mantenidos para compatibilidad)
    ('D000', 'Sin daño aparente', 'NA', 'NA', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('D001', 'Daño en carcasa', 'NIVEL_1', 'NA', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('B001', 'Bloque de daños múltiples', 'NIVEL_2', 'SC3', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('B002', 'Bloque de daños críticos', 'NIVEL_2', 'SC3', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("codigo") DO NOTHING;

-- 10. Establecer relaciones entre códigos de daño y reparación
DO $$
DECLARE
    rep_n004_id INTEGER;
    rep_n006_id INTEGER;
    rep_n009_id INTEGER;
    rep_n010_id INTEGER;
    rep_n012_id INTEGER;
    rep_n014_id INTEGER;
BEGIN
    -- Obtener IDs de códigos de reparación necesarios
    SELECT id INTO rep_n004_id FROM "CodigoReparacion" WHERE codigo = 'N004';
    SELECT id INTO rep_n006_id FROM "CodigoReparacion" WHERE codigo = 'N006';
    SELECT id INTO rep_n009_id FROM "CodigoReparacion" WHERE codigo = 'N009';
    SELECT id INTO rep_n010_id FROM "CodigoReparacion" WHERE codigo = 'N010';
    SELECT id INTO rep_n012_id FROM "CodigoReparacion" WHERE codigo = 'N012';
    SELECT id INTO rep_n014_id FROM "CodigoReparacion" WHERE codigo = 'N014';
    
    -- Limpiar todas las relaciones primero
    UPDATE "CodigoDano" SET "codigoRepId" = NULL;
    
    -- Establecer relaciones según especificación R02
    -- T001: N/A (sin reparación) - ya está NULL
    -- D002: N012 (NIVEL_2_PLUS)
    UPDATE "CodigoDano" SET "codigoRepId" = rep_n012_id WHERE codigo = 'D002';
    -- D003: N012 (NIVEL_2_PLUS)
    UPDATE "CodigoDano" SET "codigoRepId" = rep_n012_id WHERE codigo = 'D003';
    -- D004: N012 (NIVEL_2_PLUS)
    UPDATE "CodigoDano" SET "codigoRepId" = rep_n012_id WHERE codigo = 'D004';
    -- D005: N006 (NIVEL_1)
    UPDATE "CodigoDano" SET "codigoRepId" = rep_n006_id WHERE codigo = 'D005';
    -- D006: N/A (sin reparación) - ya está NULL
    -- D007: N006 (NIVEL_1)
    UPDATE "CodigoDano" SET "codigoRepId" = rep_n006_id WHERE codigo = 'D007';
    -- D008: N006 (NIVEL_1)
    UPDATE "CodigoDano" SET "codigoRepId" = rep_n006_id WHERE codigo = 'D008';
    -- D009: N006 (NIVEL_1)
    UPDATE "CodigoDano" SET "codigoRepId" = rep_n006_id WHERE codigo = 'D009';
    -- D010: N006 (NIVEL_1)
    UPDATE "CodigoDano" SET "codigoRepId" = rep_n006_id WHERE codigo = 'D010';
    -- D011: N/A (sin reparación) - ya está NULL
    -- D012: N014 (NIVEL_2_PLUS)
    UPDATE "CodigoDano" SET "codigoRepId" = rep_n014_id WHERE codigo = 'D012';
    -- D013: N014 (NIVEL_2_PLUS)
    UPDATE "CodigoDano" SET "codigoRepId" = rep_n014_id WHERE codigo = 'D013';
    -- D014: N006 (NIVEL_1)
    UPDATE "CodigoDano" SET "codigoRepId" = rep_n006_id WHERE codigo = 'D014';
    -- D015: N014 (NIVEL_2_PLUS)
    UPDATE "CodigoDano" SET "codigoRepId" = rep_n014_id WHERE codigo = 'D015';
    -- D016: N004 (N/A nivel)
    UPDATE "CodigoDano" SET "codigoRepId" = rep_n004_id WHERE codigo = 'D016';
    -- D017: N012 (NIVEL_2_PLUS)
    UPDATE "CodigoDano" SET "codigoRepId" = rep_n012_id WHERE codigo = 'D017';
    -- D018: N012 (NIVEL_2_PLUS)
    UPDATE "CodigoDano" SET "codigoRepId" = rep_n012_id WHERE codigo = 'D018';
    -- D019: N/A (sin reparación) - ya está NULL
    -- D020: N/A (sin reparación) - ya está NULL
    -- D021: N012 (NIVEL_2_PLUS)
    UPDATE "CodigoDano" SET "codigoRepId" = rep_n012_id WHERE codigo = 'D021';
    -- D022: N010 (NIVEL_2_PLUS)
    UPDATE "CodigoDano" SET "codigoRepId" = rep_n010_id WHERE codigo = 'D022';
    -- D023: N009 (NIVEL_2)
    UPDATE "CodigoDano" SET "codigoRepId" = rep_n009_id WHERE codigo = 'D023';
    -- D024: N010 (NIVEL_2_PLUS)
    UPDATE "CodigoDano" SET "codigoRepId" = rep_n010_id WHERE codigo = 'D024';
    -- D025: N009 (NIVEL_2_PLUS)
    UPDATE "CodigoDano" SET "codigoRepId" = rep_n009_id WHERE codigo = 'D025';
END $$;

-- 11. Actualizar triggers para soporte de rol URep
-- Actualizar función validar_fase_inicial para incluir URep
CREATE OR REPLACE FUNCTION validar_fase_inicial()
RETURNS TRIGGER AS $$
DECLARE
    v_rol_usuario   TEXT;
    v_fase_permitida TEXT;
BEGIN
    SELECT rol::TEXT INTO v_rol_usuario FROM "User" WHERE id = NEW."responsableId";

    -- Mapeo de roles y sus fases permitidas
    CASE v_rol_usuario
        WHEN 'UReg' THEN v_fase_permitida := 'REGISTRO';
        WHEN 'UA' THEN v_fase_permitida := NULL; -- UA puede usar cualquier fase
        WHEN 'UTI' THEN v_fase_permitida := 'TEST_INICIAL';
        WHEN 'URep' THEN v_fase_permitida := 'REPARACION';
        WHEN 'UC' THEN v_fase_permitida := 'COSMETICA';
        WHEN 'UEN' THEN v_fase_permitida := 'ENSAMBLE';
        WHEN 'UR' THEN v_fase_permitida := 'RETEST';
        WHEN 'UE' THEN v_fase_permitida := 'EMPAQUE';
        WHEN 'UV' THEN v_fase_permitida := NULL; -- UV acceso limitado solo para visualización
        ELSE v_fase_permitida := 'REGISTRO';
    END CASE;
    
    -- Solo UA puede crear en cualquier fase, UV no puede crear modems
    IF v_rol_usuario = 'UA' THEN
        RETURN NEW;
    ELSIF v_rol_usuario = 'UV' THEN
        RAISE EXCEPTION 'El usuario con rol UV solo tiene permisos de visualización';
    END IF;
    
    -- Para otros roles, validar la fase permitida
    IF v_fase_permitida IS NOT NULL AND NEW."faseActual"::TEXT <> v_fase_permitida THEN
        INSERT INTO "Log"(accion, entidad, detalle, "userId", "createdAt")
        VALUES('ERROR_VALIDACION', 'MODEM', 
               format('El usuario con rol %s intentó crear un modem en fase %s (permitida: %s)', 
                      v_rol_usuario, NEW."faseActual", v_fase_permitida),
               NEW."responsableId", now());
        RAISE EXCEPTION 'El usuario con rol % solo puede crear modems en fase %', 
                        v_rol_usuario, v_fase_permitida;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Actualizar función validar_cambio_fase para incluir URep
CREATE OR REPLACE FUNCTION validar_cambio_fase()
RETURNS TRIGGER AS $$
DECLARE
    v_rol_usuario TEXT;
    v_fases_permitidas TEXT[];
    v_fase_actual TEXT;
    v_fase_nueva TEXT;
    v_mensaje TEXT;
BEGIN
    -- Si no es un cambio de fase, permitir
    IF OLD."faseActual"::TEXT = NEW."faseActual"::TEXT THEN
        RETURN NEW;
    END IF;

    v_fase_actual := OLD."faseActual"::TEXT;
    v_fase_nueva := NEW."faseActual"::TEXT;
    
    -- Obtener rol del usuario responsable
    SELECT rol::TEXT INTO v_rol_usuario FROM "User" WHERE id = NEW."responsableId";
    
    -- Solo UA puede hacer cualquier cambio, UV tiene acceso limitado
    IF v_rol_usuario = 'UA' THEN
        RETURN NEW;
    END IF;
    
    -- Determinar fases permitidas según el rol
    CASE v_rol_usuario
        WHEN 'UReg' THEN 
            v_fases_permitidas := ARRAY['REGISTRO'];
        WHEN 'UTI' THEN 
            v_fases_permitidas := ARRAY['TEST_INICIAL', 'REPARACION']; -- UTI puede enviar a reparación
        WHEN 'URep' THEN 
            v_fases_permitidas := ARRAY['REPARACION', 'ENSAMBLE', 'SCRAP']; -- URep maneja reparaciones
        WHEN 'UC' THEN 
            v_fases_permitidas := ARRAY['COSMETICA'];
        WHEN 'UEN' THEN 
            v_fases_permitidas := ARRAY['ENSAMBLE', 'REPARACION']; -- UEN puede enviar a reparación
        WHEN 'UR' THEN 
            v_fases_permitidas := ARRAY['RETEST', 'REPARACION']; -- UR puede enviar a reparación
        WHEN 'UE' THEN 
            v_fases_permitidas := ARRAY['EMPAQUE', 'SCRAP'];
        ELSE
            v_fases_permitidas := ARRAY['REGISTRO'];
    END CASE;
    
    -- Validar si la nueva fase está permitida para el rol
    IF NOT (v_fase_nueva = ANY(v_fases_permitidas)) THEN
        v_mensaje := format('El usuario con rol %s no puede cambiar a fase %s. Fases permitidas: %s', 
                           v_rol_usuario, v_fase_nueva, array_to_string(v_fases_permitidas, ', '));
        
        INSERT INTO "Log"(accion, entidad, detalle, "userId", "createdAt")
        VALUES('ERROR_VALIDACION', 'MODEM', v_mensaje, NEW."responsableId", now());
        
        RAISE EXCEPTION '%', v_mensaje;
    END IF;
    
    -- Validar transiciones específicas según la fase actual
    IF v_fase_actual = 'REGISTRO' AND NOT (v_fase_nueva IN ('TEST_INICIAL', 'SCRAP')) THEN
        RAISE EXCEPTION 'Desde REGISTRO sólo se puede pasar a TEST_INICIAL o SCRAP';
    ELSIF v_fase_actual = 'TEST_INICIAL' AND NOT (v_fase_nueva IN ('COSMETICA', 'ENSAMBLE', 'REPARACION', 'SCRAP')) THEN
        RAISE EXCEPTION 'Desde TEST_INICIAL sólo se puede pasar a COSMETICA, ENSAMBLE, REPARACION o SCRAP';
    ELSIF v_fase_actual = 'COSMETICA' AND NOT (v_fase_nueva IN ('ENSAMBLE', 'SCRAP')) THEN
        RAISE EXCEPTION 'Desde COSMETICA sólo se puede pasar a ENSAMBLE o SCRAP';
    ELSIF v_fase_actual = 'ENSAMBLE' AND NOT (v_fase_nueva IN ('RETEST', 'REPARACION', 'SCRAP')) THEN
        RAISE EXCEPTION 'Desde ENSAMBLE sólo se puede pasar a RETEST, REPARACION o SCRAP';
    ELSIF v_fase_actual = 'RETEST' AND NOT (v_fase_nueva IN ('EMPAQUE', 'ENSAMBLE', 'REPARACION', 'SCRAP')) THEN
        RAISE EXCEPTION 'Desde RETEST sólo se puede pasar a EMPAQUE, ENSAMBLE, REPARACION o SCRAP';
    ELSIF v_fase_actual = 'REPARACION' AND NOT (v_fase_nueva IN ('ENSAMBLE', 'SCRAP')) THEN
        RAISE EXCEPTION 'Desde REPARACION sólo se puede pasar a ENSAMBLE o SCRAP';
    ELSIF v_fase_actual = 'EMPAQUE' AND v_fase_nueva <> 'SCRAP' THEN
        RAISE EXCEPTION 'Desde EMPAQUE sólo se puede pasar a SCRAP';
    ELSIF v_fase_actual = 'SCRAP' AND NOT (v_fase_nueva = 'REPARACION' AND OLD."motivoScrap" = 'FUERA_DE_RANGO') THEN
        RAISE EXCEPTION 'Desde SCRAP solo se puede pasar a REPARACION si el motivo es FUERA_DE_RANGO';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger específico para validar transiciones de reparación
CREATE OR REPLACE FUNCTION validar_transicion_reparacion()
RETURNS TRIGGER AS $$
DECLARE
    v_rol_usuario TEXT;
    v_fase_anterior TEXT;
    v_fase_nueva TEXT;
BEGIN
    -- Solo procesar si hay cambio hacia o desde REPARACION
    v_fase_anterior := OLD."faseActual"::TEXT;
    v_fase_nueva := NEW."faseActual"::TEXT;
    
    IF v_fase_anterior = v_fase_nueva THEN
        RETURN NEW;
    END IF;
    
    -- Obtener rol del usuario
    SELECT rol::TEXT INTO v_rol_usuario FROM "User" WHERE id = NEW."responsableId";
    
    -- Validar entrada a REPARACION
    IF v_fase_nueva = 'REPARACION' THEN
        -- Solo ciertos roles pueden enviar a reparación
        IF NOT (v_rol_usuario IN ('URep', 'UTI', 'UA')) THEN
            RAISE EXCEPTION 'Solo usuarios URep, UTI o UA pueden enviar modems a reparación';
        END IF;
        
        -- Validar fase de origen válida
        IF NOT (v_fase_anterior IN ('TEST_INICIAL', 'ENSAMBLE', 'RETEST')) AND 
           NOT (v_fase_anterior = 'SCRAP' AND OLD."motivoScrap" = 'FUERA_DE_RANGO') THEN
            RAISE EXCEPTION 'Solo se puede enviar a REPARACION desde TEST_INICIAL, ENSAMBLE, RETEST o SCRAP con motivo FUERA_DE_RANGO';
        END IF;
    END IF;
    
    -- Validar salida de REPARACION
    IF v_fase_anterior = 'REPARACION' THEN
        -- Solo ciertos roles pueden completar reparaciones
        IF NOT (v_rol_usuario IN ('URep', 'UTI', 'UA')) THEN
            RAISE EXCEPTION 'Solo usuarios URep, UTI o UA pueden completar reparaciones';
        END IF;
        
        -- Solo se puede ir a ENSAMBLE o SCRAP desde REPARACION
        IF NOT (v_fase_nueva IN ('ENSAMBLE', 'SCRAP')) THEN
            RAISE EXCEPTION 'Desde REPARACION solo se puede ir a ENSAMBLE (exitosa) o SCRAP (fallida)';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger para validar registros de reparación
CREATE OR REPLACE FUNCTION validar_registro_reparacion()
RETURNS TRIGGER AS $$
DECLARE
    v_fase_modem TEXT;
    v_rol_usuario TEXT;
BEGIN
    -- Solo validar si hay códigos de reparación involucrados
    IF NEW."codigoDanoId" IS NULL AND NEW."codigoReparacionId" IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Obtener fase actual del modem y rol del usuario
    SELECT m."faseActual"::TEXT, u.rol::TEXT 
    INTO v_fase_modem, v_rol_usuario
    FROM "Modem" m 
    JOIN "User" u ON u.id = NEW."userId"
    WHERE m.id = NEW."modemId";
    
    -- Solo permitir registros de reparación en fase REPARACION
    IF (NEW."codigoDanoId" IS NOT NULL OR NEW."codigoReparacionId" IS NOT NULL) 
       AND v_fase_modem != 'REPARACION' 
       AND NEW.fase != 'REPARACION' THEN
        RAISE EXCEPTION 'Los códigos de reparación solo se pueden usar en fase REPARACION';
    END IF;
    
    -- Solo ciertos roles pueden usar códigos de reparación
    IF (NEW."codigoDanoId" IS NOT NULL OR NEW."codigoReparacionId" IS NOT NULL) 
       AND NOT (v_rol_usuario IN ('URep', 'UTI', 'UA')) THEN
        RAISE EXCEPTION 'Solo usuarios URep, UTI o UA pueden registrar códigos de reparación';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar triggers si no existen
DO $$
BEGIN
    -- Trigger para validar transiciones de reparación
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'validar_transicion_reparacion_trigger'
    ) THEN
        CREATE TRIGGER validar_transicion_reparacion_trigger
            BEFORE UPDATE OF "faseActual" ON "Modem"
            FOR EACH ROW
            EXECUTE FUNCTION validar_transicion_reparacion();
    END IF;
    
    -- Trigger para validar registros de reparación
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'validar_registro_reparacion_trigger'
    ) THEN
        CREATE TRIGGER validar_registro_reparacion_trigger
            BEFORE INSERT OR UPDATE ON "Registro"
            FOR EACH ROW
            EXECUTE FUNCTION validar_registro_reparacion();
    END IF;
END $$;

-- Agregar comentarios para documentación
COMMENT ON FUNCTION validar_transicion_reparacion() IS 'Valida transiciones hacia y desde la fase REPARACION';
COMMENT ON FUNCTION validar_registro_reparacion() IS 'Valida que solo roles autorizados puedan usar códigos de reparación';