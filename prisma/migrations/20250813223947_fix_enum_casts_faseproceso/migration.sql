-- 1) BEFORE INSERT: validar_fase_inicial
CREATE OR REPLACE FUNCTION validar_fase_inicial()
RETURNS TRIGGER AS $$
DECLARE
    v_rol_usuario    TEXT;
    v_fase_permitida TEXT;
BEGIN
    SELECT rol::TEXT INTO v_rol_usuario FROM "User" WHERE id = NEW."responsableId";

    CASE v_rol_usuario
        WHEN 'UReg' THEN v_fase_permitida := 'REGISTRO';
        WHEN 'UV'   THEN v_fase_permitida := NULL; -- Verificador puede cualquier fase
        ELSE v_fase_permitida := 'REGISTRO';
    END CASE;

    IF v_rol_usuario = 'UV' THEN
        RETURN NEW;
    END IF;

    -- 👇 CAST: texto -> enum
    IF v_fase_permitida IS NOT NULL
       AND NEW."faseActual" <> v_fase_permitida::"FaseProceso" THEN
        INSERT INTO "Log"(accion, entidad, detalle, "userId", "createdAt")
        VALUES (
          'VIOLACION_FASE_INICIAL',
          'Modem',
          'Intento de crear modem con SN: ' || NEW.sn
            || ' en fase ' || NEW."faseActual"::text      -- 👈 enum -> text
            || ' por rol ' || v_rol_usuario,
          NEW."responsableId",
          NOW()
        );
        RAISE EXCEPTION 'El rol % solo puede crear modems en fase %, no en %',
          v_rol_usuario, v_fase_permitida, NEW."faseActual"::text; -- 👈 enum -> text
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2) BEFORE UPDATE OF "faseActual": validar_transicion_fase
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

    WITH fase_order AS (
      SELECT 'REGISTRO'   AS fase, 1 UNION
      SELECT 'TEST_INICIAL',       2 UNION
      SELECT 'ENSAMBLE',           3 UNION
      SELECT 'RETEST',             4 UNION
      SELECT 'EMPAQUE',            5 UNION
      SELECT 'SCRAP',              6 UNION
      SELECT 'REPARACION',         7
    )
    -- 👇 CAST: texto -> enum para comparar con columna enum
    SELECT fo.orden INTO v_orden_ant
    FROM fase_order fo
    WHERE fo.fase::"FaseProceso" = OLD."faseActual";

    SELECT fo.orden INTO v_orden_nuevo
    FROM fase_order fo
    WHERE fo.fase::"FaseProceso" = NEW."faseActual";

    INSERT INTO "Log"(accion, entidad, detalle, "userId", "createdAt")
    VALUES (
      'DEBUG_FASE',
      'Modem',
      'Validando transición fase: '
        || OLD."faseActual"::text || '(' || COALESCE(v_orden_ant::text,'NULL') || ') -> '
        || NEW."faseActual"::text || '(' || COALESCE(v_orden_nuevo::text,'NULL') || ')', -- 👈 enum -> text
      NEW."responsableId",
      NOW()
    );

    IF v_orden_ant IS NULL THEN
        RAISE EXCEPTION 'Fase de origen "%" no reconocida', OLD."faseActual"::text;
    END IF;
    IF v_orden_nuevo IS NULL THEN
        RAISE EXCEPTION 'Fase de destino "%" no reconocida', NEW."faseActual"::text;
    END IF;

    -- 👇 CAST del literal a enum
    IF v_orden_nuevo < v_orden_ant AND NEW."faseActual" <> 'REPARACION'::"FaseProceso" THEN
        v_mensaje := 'No se puede retroceder de fase '
                      || OLD."faseActual"::text || ' a ' || NEW."faseActual"::text;
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

-- 3) AFTER UPDATE OF "faseActual": registrar_transicion_fase
CREATE OR REPLACE FUNCTION registrar_transicion_fase()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO "Log"(accion, entidad, detalle, "userId", "createdAt")
    VALUES (
      'TRANSICION_FASE',
      'Modem',
      'Cambio de fase: ' || OLD."faseActual"::text || ' -> ' || NEW."faseActual"::text  -- 👈 enum -> text
        || ' para modem SN: ' || NEW.sn,
      NEW."responsableId",
      NOW()
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4) registrar_actividad_log: en el caso de "Registro", castear NEW.fase
CREATE OR REPLACE FUNCTION registrar_actividad_log()
RETURNS TRIGGER AS $$
DECLARE
    v_entidad  TEXT;
    v_accion   TEXT;
    v_detalle  TEXT;
    v_user_id  INTEGER;
BEGIN
    v_entidad := TG_TABLE_NAME;

    IF TG_OP = 'INSERT' THEN
        v_accion := 'CREAR';
        v_detalle := 'Creación de nuevo registro';
        IF v_entidad = 'Modem' THEN
            v_user_id := COALESCE(NEW."responsableId", 1);
        ELSIF v_entidad = 'Lote' THEN
            v_user_id := COALESCE(NEW."responsableId", 1);
        ELSIF v_entidad = 'Registro' THEN
            v_user_id := COALESCE(NEW."userId", 1);
        ELSE
            v_user_id := 1;
        END IF;

    ELSIF TG_OP = 'UPDATE' THEN
        v_accion := 'ACTUALIZAR';
        v_detalle := 'Actualización de registro';
        IF v_entidad = 'Modem' THEN
            v_user_id := COALESCE(NEW."responsableId", OLD."responsableId", 1);
        ELSIF v_entidad = 'Lote' THEN
            v_user_id := COALESCE(NEW."responsableId", OLD."responsableId", 1);
        ELSE
            v_user_id := 1;
        END IF;

    ELSIF TG_OP = 'DELETE' THEN
        v_accion := 'ELIMINAR';
        v_detalle := 'Eliminación de registro';
        IF v_entidad = 'Modem' THEN
            v_user_id := COALESCE(OLD."responsableId", 1);
        ELSIF v_entidad = 'Lote' THEN
            v_user_id := COALESCE(OLD."responsableId", 1);
        ELSE
            v_user_id := 1;
        END IF;
    END IF;

    IF v_entidad = 'Modem' THEN
        IF TG_OP = 'INSERT' THEN
            v_detalle := 'Registro de nuevo dispositivo con SN: ' || NEW.sn;
        ELSIF TG_OP = 'UPDATE' THEN
            IF OLD."estadoActualId" IS DISTINCT FROM NEW."estadoActualId"
               OR OLD."faseActual"   IS DISTINCT FROM NEW."faseActual" THEN
                v_detalle := 'Actualización de estado/fase del dispositivo con SN: ' || NEW.sn;
            ELSE
                RETURN NEW;
            END IF;
        ELSIF TG_OP = 'DELETE' THEN
            v_detalle := 'Eliminación del dispositivo con SN: ' || OLD.sn;
        END IF;

    ELSIF v_entidad = 'Lote' THEN
        IF TG_OP = 'INSERT' THEN
            v_detalle := 'Creación de nuevo lote: ' || NEW.numero;
        ELSIF TG_OP = 'UPDATE' THEN
            IF OLD.estado IS DISTINCT FROM NEW.estado THEN
                v_detalle := 'Actualización de estado del lote: ' || NEW.numero;
            ELSE
                RETURN NEW;
            END IF;
        ELSIF TG_OP = 'DELETE' THEN
            v_detalle := 'Eliminación del lote: ' || OLD.numero;
        END IF;

    ELSIF v_entidad = 'Registro' THEN
        IF TG_OP = 'INSERT' THEN
            -- 👇 enum -> text para concatenar
            v_detalle := 'Registro de nueva acción de fase SN: ' || NEW.sn || ', fase: ' || NEW.fase::text;
        ELSE
            RETURN NEW;
        END IF;
    END IF;

    INSERT INTO "Log"(accion, entidad, detalle, "userId", "createdAt")
    VALUES (v_accion, v_entidad, v_detalle, v_user_id, NOW());

    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;
