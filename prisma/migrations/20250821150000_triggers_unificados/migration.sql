-- Migración para implementar triggers del sistema optimizada
-- Versión unificada con fix para duplicación en EMPAQUE y limpieza de registros intermedios
-- FASE A: Restricción de permisos para usuario Visualizador (UV) - Solo acceso de consulta

-- Asegurar lenguaje PL/pgSQL
CREATE EXTENSION IF NOT EXISTS plpgsql;

-- Asegurar que la columna deletedAt existe en la tabla Modem
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'Modem' AND column_name = 'deletedAt'
    ) THEN
        ALTER TABLE "Modem" ADD COLUMN "deletedAt" TIMESTAMP;
    END IF;
END $$;

-- ===================== LIMPIEZA PREVIA DE TRIGGERS EXISTENTES =====================
DROP TRIGGER IF EXISTS log_modem_cambios            ON "Modem";
DROP TRIGGER IF EXISTS log_lote_cambios             ON "Lote";
DROP TRIGGER IF EXISTS log_registro_cambios         ON "Registro";
DROP TRIGGER IF EXISTS actualizar_lote_desde_modem  ON "Modem";
DROP TRIGGER IF EXISTS borrado_logico_modem_trigger ON "Modem";
DROP TRIGGER IF EXISTS validar_transicion_modem     ON "Modem";
DROP TRIGGER IF EXISTS registrar_transicion_modem   ON "Modem";
DROP TRIGGER IF EXISTS validar_cambio_fase          ON "Modem";
DROP TRIGGER IF EXISTS registrar_cambio_fase        ON "Modem";
DROP TRIGGER IF EXISTS validar_fase_inicial_modem   ON "Modem";
DROP TRIGGER IF EXISTS auto_limpiar_registros       ON "Modem";
DROP TRIGGER IF EXISTS auto_limpiar_registros       ON "Registro"; -- Añadido para limpieza completa
DROP TRIGGER IF EXISTS optimizar_registros_trigger  ON "Modem";
DROP TRIGGER IF EXISTS filtrar_logs                 ON "Log";
DROP TRIGGER IF EXISTS prevenir_duplicados_empaque_trigger ON "Registro";

-- ===================== 1) TRIGGER PARA PREVENIR DUPLICADOS DE EMPAQUE =====================
CREATE OR REPLACE FUNCTION prevenir_duplicados_empaque()
RETURNS TRIGGER AS $$
DECLARE
    v_existe_registro BOOLEAN;
    v_tiempo_reciente TIMESTAMP;
BEGIN
    -- Solo verificar para fase EMPAQUE
    IF NEW.fase = 'EMPAQUE' THEN
        -- Verificar si existe un registro de EMPAQUE reciente (últimos 5 segundos)
        v_tiempo_reciente := NOW() - INTERVAL '5 seconds';
        
        SELECT EXISTS (
            SELECT 1 FROM "Registro" 
            WHERE "modemId" = NEW."modemId" 
            AND fase = 'EMPAQUE'
            AND "createdAt" > v_tiempo_reciente
        ) INTO v_existe_registro;
        
        IF v_existe_registro THEN
            -- Registrar intento de duplicación evitado
            INSERT INTO "Log"(accion, entidad, detalle, "userId", "createdAt")
            VALUES('PREVENCION_DUPLICADO', 'REGISTRO', 
                   format('Evitada duplicación de registro EMPAQUE para modem id:%s', NEW."modemId"),
                   NEW."userId", now());
            
            -- No insertar el registro duplicado
            RETURN NULL;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevenir_duplicados_empaque_trigger
BEFORE INSERT ON "Registro"
FOR EACH ROW
EXECUTE FUNCTION prevenir_duplicados_empaque();

-- ===================== 2) VALIDAR TRANSICIÓN DE FASE (VERSIÓN ACTUALIZADA) =================
CREATE OR REPLACE FUNCTION validar_transicion_fase()
RETURNS TRIGGER AS $$
DECLARE
    v_rol_usuario  TEXT;
    v_orden_ant    INTEGER;
    v_orden_nuevo  INTEGER;
    v_mensaje      TEXT;
BEGIN
    SELECT rol::TEXT INTO v_rol_usuario FROM "User" WHERE id = NEW."responsableId";
    -- Eliminado el bypass para UV que permitía saltar validaciones

    -- CTE con columnas nombradas y casteo al enum; se usa en UN SOLO SELECT
    WITH fase_order(fase, orden) AS (
      VALUES
        ('REGISTRO'::"FaseProceso",     1),
        ('TEST_INICIAL'::"FaseProceso", 2),
        ('ENSAMBLE'::"FaseProceso",     3),
        ('RETEST'::"FaseProceso",       4),
        ('EMPAQUE'::"FaseProceso",      5),
        ('SCRAP'::"FaseProceso",        6),
        ('REPARACION'::"FaseProceso",   7)
    )
    SELECT
      MAX(CASE WHEN fase_order.fase = OLD."faseActual" THEN fase_order.orden END),
      MAX(CASE WHEN fase_order.fase = NEW."faseActual" THEN fase_order.orden END)
    INTO v_orden_ant, v_orden_nuevo
    FROM fase_order;

    -- Debug logging
    INSERT INTO "Log"(accion, entidad, detalle, "userId", "createdAt")
    VALUES (
      'DEBUG_FASE',
      'Modem',
      'Validando transición fase: '
        || OLD."faseActual"::text || '(' || COALESCE(v_orden_ant::text, 'NULL') || ') -> '
        || NEW."faseActual"::text || '(' || COALESCE(v_orden_nuevo::text, 'NULL') || ')',
      NEW."responsableId",
      NOW()
    );

    -- Validar que las fases existan
    IF v_orden_ant IS NULL THEN
        RAISE EXCEPTION 'Fase de origen "%" no reconocida', OLD."faseActual"::text;
    END IF;
    IF v_orden_nuevo IS NULL THEN
        RAISE EXCEPTION 'Fase de destino "%" no reconocida', NEW."faseActual"::text;
    END IF;

    -- REGLA ESPECIAL: Permitir la transición RETEST→ENSAMBLE
    IF OLD."faseActual" = 'RETEST'::"FaseProceso" AND NEW."faseActual" = 'ENSAMBLE'::"FaseProceso" THEN
        -- Esta transición está explícitamente permitida
        INSERT INTO "Log"(accion, entidad, detalle, "userId", "createdAt")
        VALUES (
          'TRANSICION_ESPECIAL',
          'Modem',
          'Permitida transición especial de RETEST a ENSAMBLE para el módem SN: ' || NEW.sn,
          NEW."responsableId",
          NOW()
        );
        RETURN NEW;
    END IF;

    -- REGLA ESPECIAL: SCRAP solo puede ir a ENSAMBLE
    IF OLD."faseActual" = 'SCRAP'::"FaseProceso" AND NEW."faseActual" <> 'ENSAMBLE'::"FaseProceso" THEN
        v_mensaje := 'Un modem en SCRAP solo puede transicionar a ENSAMBLE, no a ' || NEW."faseActual"::text;
        INSERT INTO "Log"(accion, entidad, detalle, "userId", "createdAt")
        VALUES ('VIOLACION_REGLA','Modem',v_mensaje,COALESCE(NEW."responsableId",1),NOW());
        RAISE EXCEPTION '%', v_mensaje;
    END IF;

    -- Regla de no retroceso (excepto casos especiales y REPARACION)
    IF v_orden_nuevo < v_orden_ant 
       AND NEW."faseActual" <> 'REPARACION'::"FaseProceso"
       AND NOT (OLD."faseActual" = 'SCRAP'::"FaseProceso" AND NEW."faseActual" = 'ENSAMBLE'::"FaseProceso") THEN
        v_mensaje := 'No se puede retroceder de fase ' || OLD."faseActual"::text || ' a ' || NEW."faseActual"::text;
        INSERT INTO "Log"(accion, entidad, detalle, "userId", "createdAt")
        VALUES ('VIOLACION_REGLA','Modem',v_mensaje,COALESCE(NEW."responsableId",1),NOW());
        RAISE EXCEPTION '%', v_mensaje;
    END IF;

    -- Regla de no saltar fases (excepto para ir a SCRAP o REPARACION)
    IF v_orden_nuevo > v_orden_ant + 1 
       AND NEW."faseActual" <> 'SCRAP'::"FaseProceso"
       AND NEW."faseActual" <> 'REPARACION'::"FaseProceso" THEN
        v_mensaje := 'No se puede saltar de fase '
                      || OLD."faseActual"::text || ' a ' || NEW."faseActual"::text
                      || '. Debe seguir REGISTRO->TEST_INICIAL->ENSAMBLE->RETEST->EMPAQUE';
        INSERT INTO "Log"(accion, entidad, detalle, "userId", "createdAt")
        VALUES ('VIOLACION_REGLA','Modem',v_mensaje,COALESCE(NEW."responsableId",1),NOW());
        RAISE EXCEPTION '%', v_mensaje;
    END IF;

    -- Si llega aquí, la transición es válida
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validar_cambio_fase
BEFORE UPDATE OF "faseActual" ON "Modem"
FOR EACH ROW
EXECUTE FUNCTION validar_transicion_fase();

-- ===================== 3) VALIDAR FASE INICIAL EN INSERT =================
CREATE OR REPLACE FUNCTION validar_fase_inicial()
RETURNS TRIGGER AS $$
DECLARE
    v_rol_usuario   TEXT;
    v_fase_permitida TEXT;
BEGIN
    SELECT rol::TEXT INTO v_rol_usuario FROM "User" WHERE id = NEW."responsableId";

    -- Si es rol UReg, validar que solo use REGISTRO
    -- Si es UA, puede usar cualquier fase (UV restringido)
    -- Para otros roles, validar según corresponda
    CASE v_rol_usuario
        WHEN 'UReg' THEN v_fase_permitida := 'REGISTRO';
        WHEN 'UA' THEN v_fase_permitida := NULL; -- UA puede usar cualquier fase
        WHEN 'UTI' THEN v_fase_permitida := 'TEST_INICIAL';
        WHEN 'UEN' THEN v_fase_permitida := 'ENSAMBLE';
        WHEN 'UR' THEN v_fase_permitida := 'RETEST';
        WHEN 'UE' THEN v_fase_permitida := 'EMPAQUE';
        WHEN 'UV' THEN v_fase_permitida := 'CONSULTA_SOLO'; -- UV solo para consulta
        ELSE v_fase_permitida := 'REGISTRO';
    END CASE;
    
    -- Solo UA puede crear modems en cualquier fase
    IF v_rol_usuario = 'UA' THEN
        RETURN NEW;
    END IF;
    
    -- UV no puede crear modems, solo consultar
    IF v_rol_usuario = 'UV' THEN
        INSERT INTO "Log"(accion, entidad, detalle, "userId", "createdAt")
        VALUES('ERROR_VALIDACION', 'MODEM', 
               'El usuario con rol UV (Visualizador) no puede crear modems, solo consultar',
               NEW."responsableId", now());
        RAISE EXCEPTION 'El usuario Visualizador (UV) no tiene permisos para crear modems';
    END IF;
    
    -- Para otros roles, validar la fase permitida
    -- Importante: Convertir "faseActual" a TEXT para comparar con string
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

CREATE TRIGGER validar_fase_inicial_modem
BEFORE INSERT ON "Modem"
FOR EACH ROW
EXECUTE FUNCTION validar_fase_inicial();

-- ===================== 4) REGISTRAR CAMBIOS DE FASE =================
CREATE OR REPLACE FUNCTION registrar_cambio_fase()
RETURNS TRIGGER AS $$
BEGIN
    -- Si hubo un cambio de fase, registrarlo solo en Log
    IF OLD."faseActual"::TEXT <> NEW."faseActual"::TEXT THEN
        -- Registrar en log con detalles detallados
        INSERT INTO "Log"(accion, entidad, detalle, "userId", "createdAt")
        VALUES('CAMBIO_FASE', 'MODEM', 
              format('Modem id:%s SN:%s cambió de fase %s a %s', 
                     NEW.id, NEW.sn, OLD."faseActual", NEW."faseActual"),
              NEW."responsableId", now());
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER registrar_cambio_fase
AFTER UPDATE OF "faseActual" ON "Modem"
FOR EACH ROW
EXECUTE FUNCTION registrar_cambio_fase();

-- ===================== 5) ACTUALIZAR LOTE DESDE MODEM =================
CREATE OR REPLACE FUNCTION actualizar_lote_desde_modem()
RETURNS TRIGGER AS $$
DECLARE
    v_lote_id INTEGER;
BEGIN
    -- Si cambia la fase o estado, actualizar el lote
    IF (OLD."faseActual"::TEXT <> NEW."faseActual"::TEXT) OR (OLD."estadoActualId" <> NEW."estadoActualId") THEN
        SELECT "loteId" INTO v_lote_id FROM "Registro" WHERE "modemId" = NEW.id LIMIT 1;
        
        IF v_lote_id IS NOT NULL THEN
            -- Actualizar marca de tiempo del lote
            BEGIN
                UPDATE "Lote" 
                SET "updatedAt" = now()
                WHERE id = v_lote_id;
            EXCEPTION WHEN OTHERS THEN
                -- Solo registrar el error y continuar
                RAISE NOTICE 'Error al actualizar lote: %', SQLERRM;
            END;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER actualizar_lote_desde_modem
AFTER UPDATE OF "faseActual", "estadoActualId" ON "Modem"
FOR EACH ROW
EXECUTE FUNCTION actualizar_lote_desde_modem();

-- ===================== 6) BORRADO LÓGICO DE MODEM =================
CREATE OR REPLACE FUNCTION borrado_logico_modem()
RETURNS TRIGGER AS $$
DECLARE
    v_estado_eliminado_id INTEGER;
BEGIN
    -- Obtener ID del estado ELIMINADO
    SELECT id INTO v_estado_eliminado_id FROM "Estado" WHERE codigoInterno = 'ELIMINADO' LIMIT 1;
    
    -- Si no existe un estado ELIMINADO, permitir el borrado físico para evitar errores
    IF v_estado_eliminado_id IS NULL THEN
        RETURN OLD;
    END IF;
    
    -- En lugar de eliminar físicamente, marcar como eliminado usando deletedAt
    UPDATE "Modem" 
    SET "deletedAt" = now(),
        "updatedAt" = now(),
        "estadoActualId" = v_estado_eliminado_id
    WHERE id = OLD.id;
    
    -- Registrar en log
    INSERT INTO "Log"(accion, entidad, detalle, "userId", "createdAt")
    VALUES('BORRADO_LOGICO', 'MODEM', 
           format('Borrado lógico del modem id:%s, serie:%s', OLD.id, OLD.sn),
           OLD."responsableId", now());
    
    -- Prevenir el borrado físico
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER borrado_logico_modem_trigger
BEFORE DELETE ON "Modem"
FOR EACH ROW
EXECUTE FUNCTION borrado_logico_modem();

-- ===================== 7) LOGS DE CAMBIOS EN MODEM =================
CREATE OR REPLACE FUNCTION log_modem_cambios()
RETURNS TRIGGER AS $$
DECLARE
    cambios_texto TEXT := '';
    old_estado_nombre TEXT;
    new_estado_nombre TEXT;
BEGIN
    -- Obtener nombres de los estados
    SELECT nombre INTO old_estado_nombre FROM "Estado" WHERE id = OLD."estadoActualId";
    SELECT nombre INTO new_estado_nombre FROM "Estado" WHERE id = NEW."estadoActualId";
    
    -- Crear texto detallando los cambios
    IF OLD.sn <> NEW.sn THEN
        cambios_texto := cambios_texto || format('Número serie: %s → %s; ', OLD.sn, NEW.sn);
    END IF;
    
    IF OLD."faseActual" <> NEW."faseActual" THEN
        cambios_texto := cambios_texto || format('Fase: %s → %s; ', OLD."faseActual", NEW."faseActual");
    END IF;
    
    IF OLD."estadoActualId" <> NEW."estadoActualId" THEN
        cambios_texto := cambios_texto || format('Estado: %s → %s; ', old_estado_nombre, new_estado_nombre);
    END IF;
    
    IF OLD."responsableId" <> NEW."responsableId" THEN
        cambios_texto := cambios_texto || format('Responsable: %s → %s; ', OLD."responsableId", NEW."responsableId");
    END IF;
    
    -- Si hay cambios, registrarlos en el log
    IF cambios_texto <> '' THEN
        INSERT INTO "Log"(accion, entidad, detalle, "userId", "createdAt")
        VALUES('ACTUALIZAR', 'MODEM', 
               format('Modem id:%s - %s', NEW.id, cambios_texto),
               NEW."responsableId", now());
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_modem_cambios
AFTER UPDATE ON "Modem"
FOR EACH ROW
EXECUTE FUNCTION log_modem_cambios();

-- ===================== 8) LOGS DE CAMBIOS EN LOTE =================
CREATE OR REPLACE FUNCTION log_lote_cambios()
RETURNS TRIGGER AS $$
DECLARE
    cambios_texto TEXT := '';
    responsable_id INTEGER;
BEGIN
    -- Determinar el responsable
    responsable_id := COALESCE(NEW."responsableId", 1); -- Default a ID 1 si no hay responsable
    
    -- Crear texto detallando los cambios
    IF OLD.numero <> NEW.numero THEN
        cambios_texto := cambios_texto || format('Número: %s → %s; ', OLD.numero, NEW.numero);
    END IF;
    
    IF OLD.estado <> NEW.estado THEN
        cambios_texto := cambios_texto || format('Estado: %s → %s; ', OLD.estado, NEW.estado);
    END IF;
    
    -- Si hay cambios, registrarlos en el log
    IF cambios_texto <> '' THEN
        INSERT INTO "Log"(accion, entidad, detalle, "userId", "createdAt")
        VALUES('ACTUALIZAR', 'LOTE', 
               format('Lote id:%s - %s', NEW.id, cambios_texto),
               responsable_id, now());
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_lote_cambios
AFTER UPDATE ON "Lote"
FOR EACH ROW
EXECUTE FUNCTION log_lote_cambios();

-- ===================== 9) LOGS DE CAMBIOS EN REGISTRO =================
CREATE OR REPLACE FUNCTION log_registro_cambios()
RETURNS TRIGGER AS $$
DECLARE
    cambios_texto TEXT := '';
    responsable_id INTEGER;
BEGIN
    -- Determinar el responsable
    responsable_id := COALESCE(NEW."userId", 1); -- Default a ID 1 si no hay responsable
    
    -- Crear texto detallando los cambios
    IF OLD."loteId" <> NEW."loteId" THEN
        cambios_texto := cambios_texto || format('Lote ID: %s → %s; ', OLD."loteId", NEW."loteId");
    END IF;
    
    IF OLD."modemId" <> NEW."modemId" THEN
        cambios_texto := cambios_texto || format('Modem ID: %s → %s; ', OLD."modemId", NEW."modemId");
    END IF;
    
    IF OLD.estado <> NEW.estado THEN
        cambios_texto := cambios_texto || format('Estado: %s → %s; ', OLD.estado, NEW.estado);
    END IF;
    
    -- Si hay cambios, registrarlos en el log
    IF cambios_texto <> '' THEN
        INSERT INTO "Log"(accion, entidad, detalle, "userId", "createdAt")
        VALUES('ACTUALIZAR', 'REGISTRO', 
               format('Registro id:%s - %s', NEW.id, cambios_texto),
               responsable_id, now());
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_registro_cambios
AFTER UPDATE ON "Registro"
FOR EACH ROW
EXECUTE FUNCTION log_registro_cambios();

-- ===================== 10) OPTIMIZACIÓN DE REGISTROS INTERMEDIOS =================
-- VERSIÓN CORREGIDA: Trigger para tabla Registro (no Modem)
CREATE OR REPLACE FUNCTION limpiar_registros_intermedios()
RETURNS TRIGGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Solo se activa cuando llega un registro de fase EMPAQUE
    IF NEW.fase = 'EMPAQUE' THEN
        -- Contar registros que serán eliminados (para logs)
        SELECT COUNT(*) INTO v_count
        FROM "Registro" 
        WHERE "modemId" = NEW."modemId"
        AND fase IN ('TEST_INICIAL', 'ENSAMBLE', 'RETEST')
        AND id != NEW.id;
        
        -- Registrar inicio de limpieza
        INSERT INTO "Log"(accion, entidad, detalle, "userId", "createdAt")
        VALUES(
            'LIMPIEZA_INICIO', 
            'REGISTRO', 
            format('Limpiando %s registros intermedios para modem id:%s', v_count, NEW."modemId"),
            NEW."userId", 
            now()
        );
        
        -- Eliminar registros intermedios
        DELETE FROM "Registro"
        WHERE "modemId" = NEW."modemId"
        AND fase IN ('TEST_INICIAL', 'ENSAMBLE', 'RETEST')
        AND id != NEW.id;
        
        -- Registrar finalización
        INSERT INTO "Log"(accion, entidad, detalle, "userId", "createdAt")
        VALUES(
            'LIMPIEZA_COMPLETADA', 
            'REGISTRO', 
            format('Completada limpieza de registros intermedios para modem id:%s', NEW."modemId"),
            NEW."userId", 
            now()
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_limpiar_registros
AFTER INSERT ON "Registro"
FOR EACH ROW
WHEN (NEW.fase = 'EMPAQUE')
EXECUTE FUNCTION limpiar_registros_intermedios();

-- ===================== 11) OPTIMIZACIÓN DE LOGS NO IMPORTANTES =================
CREATE OR REPLACE FUNCTION filtrar_logs_no_importantes()
RETURNS TRIGGER AS $$
DECLARE
    v_acciones_importantes TEXT[] := ARRAY[
        'ERROR', 'ERROR_VALIDACION', 'CAMBIO_FASE', 'BORRADO_LOGICO', 'SCRAP', 
        'OPTIMIZACION', 'DEBUG_FASE', 'VIOLACION_REGLA', 'PREVENCION_DUPLICADO',
        'LIMPIEZA', 'TRANSICION_ESPECIAL', 'LIMPIEZA_INICIO', 'LIMPIEZA_COMPLETADA'
    ];
BEGIN
    -- Si la acción está en la lista de acciones importantes, permitir
    IF NEW.accion = ANY(v_acciones_importantes) THEN
        RETURN NEW;
    END IF;
    
    -- Si es otra acción importante específica, permitir
    IF NEW.accion = 'ACTUALIZAR' AND NEW.detalle LIKE '%Estado:%' THEN
        RETURN NEW;
    END IF;
    
    -- En caso contrario, cancelar la inserción del log
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER filtrar_logs
BEFORE INSERT ON "Log"
FOR EACH ROW
EXECUTE FUNCTION filtrar_logs_no_importantes();

-- ===================== 12) LIMPIAR REGISTROS DUPLICADOS DE EMPAQUE =================
-- Script para eliminar registros duplicados existentes
DO $$
DECLARE
    r RECORD;
    v_admin_id INTEGER;
BEGIN
    -- Obtener un ID de usuario administrador
    SELECT id INTO v_admin_id FROM "User" WHERE rol IN ('UA', 'UAI') LIMIT 1;
    IF v_admin_id IS NULL THEN
        v_admin_id := (SELECT id FROM "User" WHERE id = 1); -- Fallback a ID 1
    END IF;
    
    -- Identificar registros duplicados en fase EMPAQUE por modemId
    FOR r IN (
        SELECT "modemId", MIN(id) as id_a_conservar
        FROM "Registro"
        WHERE fase = 'EMPAQUE'
        GROUP BY "modemId"
        HAVING COUNT(*) > 1
    ) LOOP
        -- Elimina todos los registros duplicados excepto el de menor ID
        DELETE FROM "Registro" 
        WHERE "modemId" = r."modemId" 
        AND fase = 'EMPAQUE'
        AND id != r.id_a_conservar;
        
        -- Log de limpieza
        INSERT INTO "Log"(accion, entidad, detalle, "userId", "createdAt")
        VALUES('LIMPIEZA', 'REGISTRO', 
              format('Eliminados registros duplicados de EMPAQUE para modem id:%s', r."modemId"),
              v_admin_id, now());
    END LOOP;
END $$;

-- ===================== 13) LIMPIEZA INICIAL DE REGISTROS INTERMEDIOS =================
-- Ejecutar una limpieza de todos los registros intermedios existentes
DO $$
DECLARE
    r RECORD;
    v_admin_id INTEGER;
    v_count INTEGER;
BEGIN
    -- Obtener un ID de usuario administrador
    SELECT id INTO v_admin_id FROM "User" WHERE rol IN ('UA', 'UAI') LIMIT 1;
    IF v_admin_id IS NULL THEN
        v_admin_id := (SELECT id FROM "User" WHERE id = 1); -- Fallback a ID 1
    END IF;
    
    -- Obtener todos los modems que ya están en EMPAQUE
    FOR r IN (
        SELECT DISTINCT "modemId" 
        FROM "Registro"
        WHERE fase = 'EMPAQUE'
    ) LOOP
        -- Contar registros intermedios
        SELECT COUNT(*) INTO v_count
        FROM "Registro"
        WHERE "modemId" = r."modemId"
        AND fase IN ('TEST_INICIAL', 'ENSAMBLE', 'RETEST');
        
        IF v_count > 0 THEN
            -- Eliminar registros intermedios
            DELETE FROM "Registro"
            WHERE "modemId" = r."modemId"
            AND fase IN ('TEST_INICIAL', 'ENSAMBLE', 'RETEST');
            
            -- Log de limpieza
            INSERT INTO "Log"(accion, entidad, detalle, "userId", "createdAt")
            VALUES('LIMPIEZA_INICIAL', 'REGISTRO', 
                  format('Limpieza inicial: Eliminados %s registros intermedios para modem id:%s', v_count, r."modemId"),
                  v_admin_id, now());
        END IF;
    END LOOP;
END $$;