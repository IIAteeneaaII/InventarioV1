# Optimización de Escalabilidad

## Descripción

Este documento describe la solución implementada para optimizar la escalabilidad del sistema, reduciendo el crecimiento de las tablas `Registro` y `Log`.

## Problema

El sistema genera muchos registros intermedios y logs que no son necesarios a largo plazo, lo que causa:
- Crecimiento excesivo de la base de datos
- Consultas más lentas
- Mayor uso de recursos

## Solución

Hemos implementado varias optimizaciones:

1. **Limpieza automática de registros intermedios**:
   - Cuando un módem llega a la fase EMPAQUE, se eliminan automáticamente los registros intermedios (TEST_INICIAL, ENSAMBLE, RETEST)
   - Se conservan solo los registros de las fases REGISTRO y EMPAQUE
   - Esto reduce significativamente el tamaño de la tabla Registro

2. **Filtrado de logs no importantes**:
   - A nivel de base de datos: Triggers que evitan la inserción de logs que no son esenciales
   - A nivel de aplicación: Middleware que filtra los logs de rutas y operaciones de baja importancia
   - Eliminación del archivo `combined.log` para reducir espacio en disco
   - Solo se almacenan logs de acciones importantes y errores
   - Reduce el crecimiento de la tabla Log y uso de espacio en disco

## Instalación

Para aplicar los triggers de optimización, ejecute:

```bash
node scripts/aplicar_optimizacion.js
```

## Desactivación

Si experimenta problemas con los triggers, puede desactivarlos ejecutando:

```bash
node scripts/desactivar_optimizacion.js
```

Este script:
- Elimina los triggers y funciones de la base de datos
- Verifica que se hayan desinstalado correctamente

## Verificación

Para verificar que los triggers están funcionando:

1. **Limpieza de registros intermedios**:
   - Registre un módem nuevo
   - Páselo por todas las fases hasta EMPAQUE
   - Verifique que solo quedan los registros de REGISTRO y EMPAQUE

2. **Filtrado de logs**:
   - Realice algunas acciones en el sistema
   - Verifique que solo se registran logs de acciones importantes y errores

## Mantenimiento

Los triggers se aplican directamente a la base de datos y no requieren mantenimiento adicional. Sin embargo, tenga en cuenta que:

- Si reinstala la base de datos, deberá volver a aplicar los triggers
- Si realiza migraciones con Prisma, es posible que necesite volver a aplicar los triggers después

## Solución de problemas

### Error: "column 'new' does not exist"

Si aparece el error `The column 'new' does not exist in the current database`, significa que hay un conflicto entre los triggers y el esquema de la base de datos. Esto puede ocurrir porque:

1. **Solución rápida**: Ejecute `prisma migrate reset --force` para reiniciar la base de datos y luego vuelva a aplicar los triggers con `node scripts/aplicar_optimizacion.js`.

2. **Solución permanente**: Modifique el trigger para usar nombres de columnas que existan en la base de datos. Esto requiere revisar el script SQL y asegurarse de que todas las referencias de columnas son correctas.

### Error: "cannot insert multiple commands into a prepared statement"

Si aparece este error al ejecutar el script de aplicación, significa que Prisma no puede ejecutar múltiples comandos SQL en una sola operación.

**Solución**: El script `aplicar_optimizacion.js` ya ha sido modificado para ejecutar cada comando SQL por separado. Si sigue apareciendo este error, verifique que está usando la última versión del script.

### Otros errores

Si aparecen otros errores al utilizar la aplicación después de aplicar los triggers:

1. Desactive temporalmente los triggers ejecutando:

```sql
ALTER TABLE "Registro" DISABLE TRIGGER auto_limpiar_registros;
ALTER TABLE "Log" DISABLE TRIGGER filtrar_logs;
```

2. Después de resolver el problema, vuelva a activarlos con:

```sql
ALTER TABLE "Registro" ENABLE TRIGGER auto_limpiar_registros;
ALTER TABLE "Log" ENABLE TRIGGER filtrar_logs;
```

## Solución de Problemas

### Error: "column 'new' does not exist"

Este error ocurre cuando hay un conflicto entre los triggers de PostgreSQL y las operaciones de Prisma. El error típicamente aparece en operaciones de actualización como:

```
PrismaClientKnownRequestError: 
Invalid `tx.modem.update()` invocation:
The column `new` does not exist in the current database.
```

#### Solución:

1. Desactiva temporalmente los triggers:
   ```bash
   node scripts/desactivar_optimizacion.js
   ```

2. Reinicia la aplicación:
   ```bash
   npm start
   ```

3. Si el problema persiste, puede ser necesario reiniciar la base de datos:
   ```bash
   npx prisma migrate reset
   ```

### Error en triggers SQL

Si hay problemas con la sintaxis de los triggers, utiliza el script optimizado:

```bash
node scripts/aplicar_optimizacion_v2.js
```

Este script utiliza una sintaxis SQL compatible con PostgreSQL y evita problemas comunes con los bloques de función y variables.

## Restaurar la configuración original

Si necesita desactivar completamente la optimización, ejecute:

```sql
DROP TRIGGER IF EXISTS auto_limpiar_registros ON "Registro";
DROP TRIGGER IF EXISTS filtrar_logs ON "Log";
DROP FUNCTION IF EXISTS limpiar_registros_intermedios();
DROP FUNCTION IF EXISTS filtrar_logs_no_importantes();
```

## Problemas Conocidos

1. **Error "cannot insert multiple commands into a prepared statement"**:
   - Este error puede aparecer si intenta ejecutar múltiples comandos SQL a través de Prisma en una sola operación
   - Solución: El script `aplicar_optimizacion.js` ya está adaptado para ejecutar cada comando por separado

2. **Verificación de instalación de triggers**:
   - Si tiene problemas para verificar que los triggers están instalados, puede consultar directamente la base de datos
   - El script mostrará cuántos comandos se aplicaron correctamente

3. **Comportamiento inesperado**:
   - Si los triggers no funcionan como se espera, verifique los registros en la base de datos
   - Es posible que necesite reiniciar el servicio de la base de datos

## Cómo Funciona

1. **Trigger `auto_limpiar_registros`**:
   - Se activa cuando se inserta un nuevo registro en fase EMPAQUE
   - Elimina los registros intermedios del mismo módem
   - Mantiene los registros importantes (REGISTRO y EMPAQUE)

2. **Trigger `filtrar_logs`**:
   - Se activa antes de insertar un registro en la tabla Log
   - Verifica si la acción es importante
   - Si no es importante, cancela la inserción

Esta implementación es más eficiente que la limpieza programada porque:
- Actúa en tiempo real
- No requiere tareas programadas
- Reduce el tamaño de la base de datos desde el inicio

## Optimización Adicional de Logs

Se ha implementado una optimización adicional del sistema de logs a nivel de aplicación. Consulte el documento [OPTIMIZACION_LOGS.md](./OPTIMIZACION_LOGS.md) para más detalles sobre:

- Eliminación del archivo `combined.log`
- Filtrado avanzado de logs a nivel de middleware
- Reducción del almacenamiento en disco