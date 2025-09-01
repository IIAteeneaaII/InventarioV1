-- Reemplaza SOLO esta función; no toques triggers.
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

    -- Definimos fases con columnas nombradas y casteadas al enum
    WITH fase_order(fase, orden) AS (
      VALUES
        ('REGISTRO'::"FaseProceso",   1),
        ('TEST_INICIAL'::"FaseProceso", 2),
        ('ENSAMBLE'::"FaseProceso",     3),
        ('RETEST'::"FaseProceso",       4),
        ('EMPAQUE'::"FaseProceso",      5),
        ('SCRAP'::"FaseProceso",        6),
        ('REPARACION'::"FaseProceso",   7)
    )
    SELECT fo.orden INTO v_orden_ant
    FROM fase_order fo
    WHERE fo.fase = OLD."faseActual";

    SELECT fo.orden INTO v_orden_nuevo
    FROM fase_order fo
    WHERE fo.fase = NEW."faseActual";

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

    IF v_orden_ant IS NULL THEN
        RAISE EXCEPTION 'Fase de origen "%" no reconocida', OLD."faseActual"::text;
    END IF;
    IF v_orden_nuevo IS NULL THEN
        RAISE EXCEPTION 'Fase de destino "%" no reconocida', NEW."faseActual"::text;
    END IF;

    IF v_orden_nuevo < v_orden_ant AND NEW."faseActual" <> 'REPARACION'::"FaseProceso" THEN
        v_mensaje := 'No se puede retroceder de fase ' || OLD."faseActual"::text || ' a ' || NEW."faseActual"::text;
        INSERT INTO "Log"(accion, entidad, detalle, "userId", "createdAt")
        VALUES ('VIOLACION_REGLA','Modem',v_mensaje,COALESCE(NEW."responsableId",1),NOW());
        RAISE EXCEPTION '%', v_mensaje;
    END IF;

    IF v_orden_nuevo > v_orden_ant + 1 THEN
        v_mensaje := 'No se puede saltar de fase '
                      || OLD."faseActual"::text || ' a ' || NEW."faseActual"::text
                      || '. Debe seguir REGISTRO->TEST_INICIAL->ENSAMBLE->RETEST->EMPAQUE';
        INSERT INTO "Log"(accion, entidad, detalle, "userId", "createdAt")
        VALUES ('VIOLACION_REGLA','Modem',v_mensaje,COALESCE(NEW."responsableId",1),NOW());
        RAISE EXCEPTION '%', v_mensaje;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
