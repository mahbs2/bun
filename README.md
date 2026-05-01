# 🚗 Registro de Pedidos - Desguaces Insulares

Esta es una aplicación web sencilla y rápida diseñada para que las sucursales registren pedidos directamente en una hoja de Google Sheets, simplificando el flujo de trabajo actual.

## 📋 Requisitos
1. Una cuenta de Google (Gmail).
2. Una hoja de cálculo de Google Sheets.

## 🚀 Instrucciones de Configuración (PASO A PASO)

### 1. Configurar la Hoja de Google (Backend)
1. Crea una nueva **Hoja de cálculo de Google**.
2. Dale un nombre (ej: "Pedidos Desguaces Insulares").
3. En el menú superior, ve a **Extensiones** > **Apps Script**.
4. Borra el código que aparece por defecto y pega el contenido del archivo `Code.gs` que te he proporcionado.
5. Haz clic en el icono del disco (Guardar) y ponle nombre al proyecto.
6. Pulsa el botón azul **Implementar** > **Nueva implementación**.
7. Selecciona el tipo **Aplicación web**.
8. Configura los siguientes campos:
   - **Descripción**: API Pedidos.
   - **Ejecutar como**: Yo (tu correo).
   - **Quién tiene acceso**: Cualquier persona (esto es necesario para que la web pueda enviar los datos).
9. Pulsa **Implementar**. Si te pide autorizar permisos, acéptalos todos (es posible que debas hacer clic en "Avanzado" -> "Ir a... (no seguro)").
10. **IMPORTANTE**: Al finalizar, verás una URL (URL de la aplicación web). **Cópiala**.

### 2. Configurar la Web (Frontend)
1. Abre el archivo `index.html` con cualquier editor de texto (o el Bloc de Notas).
2. Busca la línea que dice: `const SCRIPT_URL = 'ESCRIBE_AQUI_TU_URL_DE_GOOGLE_APPS_SCRIPT';`
3. Reemplaza el texto entre comillas por la URL que copiaste en el paso anterior.
4. Guarda el archivo.

### 3. Cómo Usar la App
1. Solo tienes que abrir el archivo `index.html` en tu navegador móvil o del ordenador.
2. Selecciona la **Sucursal**.
3. Pega el texto del pedido (ej: `26425 Opel Corsa B (1993->)...`).
4. Pulsa **Guardar Pedido**.
5. ¡Listo! El pedido aparecerá automáticamente en tu Google Sheets en una nueva fila.

## 📊 Estructura de la Hoja de Cálculo
La aplicación insertará los datos en este orden de columnas:
- **Col A**: Pedido Completo (texto original)
- **Col B**: Nº Vehículo (extraído automáticamente)
- **Col C**: Nº Pieza (vacío por defecto)
- **Col D**: Descripción detallada
- **Col E**: Alta ("Sí")
- **Col G**: Enviado ("Si")
- **Col H**: Fecha y Hora
- **Col I**: Clientes ("Particulares")
- **Col J**: Sucursal / Operario

---
*Desarrollado para Desguaces Insulares*
