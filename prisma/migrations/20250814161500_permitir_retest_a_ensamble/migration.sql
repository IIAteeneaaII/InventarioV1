-- Migración: Permitir transición RETEST→ENSAMBLE
-- Fecha: 2025-08-14

-- Modificar la función validar_transicion_fase para permitir RETEST→ENSAMBLE
CREATE OR REPLACE FUNCTION validar_transicion_fase()
RETURNS TRIGGER AS $$
DECLARE
    v_rol_usuario  TEXT;
    v_orden_ant    INTEGER;
    v_orden_nuevo  INTEGER;
    v_mensaje      TEXT;
BEGIN
    SELECT rol::TEXT INTO v_rol_usuario FROM "User" WHERE id = NEW."responsableId";
    IF v_rol_usuario = 'UV' THEN
        RETURN NEW;
    END IF;

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
