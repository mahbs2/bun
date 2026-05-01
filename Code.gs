/**
 * DESGUACES INSULARES — Google Apps Script
 * ==========================================
 * INSTRUCCIONES DE INSTALACIÓN:
 * 1. Abre tu hoja de cálculo de Google.
 * 2. Ve a 'Extensiones' → 'Apps Script'.
 * 3. Borra todo lo que haya y pega este código completo.
 * 4. Pulsa 'Implementar' → 'Nueva implementación'.
 * 5. Tipo: 'Aplicación web'.
 * 6. Ejecutar como: 'Yo' (tu cuenta).
 * 7. Quién puede acceder: 'Cualquiera'.
 * 8. Pulsa 'Implementar' y copia la URL resultante.
 * 9. Pega esa URL en la web (campo Script URL en Configuración).
 */

// ============================================================
// CONFIGURACIÓN: Nombre de cada pestaña por sucursal
// Cambia aquí los nombres si tus pestañas tienen nombres distintos
// ============================================================
var SHEET_NAMES = {
  'Tabares':    'Tabares',
  'Orotava':    'Orotava',
  'S/C':        'SC',
  'Icod':       'Icod',
  'Granadilla': 'Granadilla',
  'Islas':      'Islas'
};

// ============================================================
// CONFIG del parser (dígitos de nº vehículo y nº pieza)
// ============================================================
var VEHICLE_MIN = 5;  // mínimo dígitos nº vehículo
var VEHICLE_MAX = 6;  // máximo dígitos nº vehículo
var PART_MIN    = 6;  // mínimo dígitos nº pieza
var PART_MAX    = 7;  // máximo dígitos nº pieza

// ============================================================
// HANDLER PRINCIPAL: recibe POST desde la web
// ============================================================
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // ---- Test ping: return OK without writing anything ----
    if (data._isTest) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, message: 'Test OK' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ============================================================
    // ACTION: assignOrder — Escribe el nombre del asignador en col J
    // ============================================================
    if (data.action === 'assignOrder') {
      var ssA = SpreadsheetApp.getActiveSpreadsheet();
      var sheetA = ssA.getSheetByName(data.sheet);
      if (!sheetA) return jsonError('No se encontró la hoja: ' + data.sheet);
      
      var tRow = null;
      if (data.rawText) {
        var vA = sheetA.getRange('A:A').getValues();
        for (var idx = 0; idx < vA.length; idx++) {
          if (vA[idx][0] == data.rawText) { tRow = idx + 1; break; }
        }
      }
      if (!tRow && data.row && data.row >= 2) tRow = data.row;
      if (!tRow) return jsonError('No se encontró el pedido en la hoja.');

      sheetA.getRange(tRow, 10).setValue(data.assignedToName); // Col J = 10
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, message: 'Columna J actualizada' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ============================================================
    // ACTION: updateRow — actualiza con el resultado del desmontaje
    // ============================================================
    if (data.action === 'updateRow') {
      var ss2 = SpreadsheetApp.getActiveSpreadsheet();
      var sheet2 = ss2.getSheetByName(data.sheet);
      if (!sheet2) return jsonError('No se encontró la hoja: ' + data.sheet);
      
      var targetRow = null;
      if (data.rawText) {
        var dataA = sheet2.getRange('A:A').getValues();
        for (var i = 0; i < dataA.length; i++) {
          if (dataA[i][0] == data.rawText) {
            targetRow = i + 1;
            break;
          }
        }
      }
      
      if (!targetRow && data.row && data.row >= 2) {
        targetRow = data.row;
      }

      if (!targetRow) {
        return jsonError('No se encontró el pedido en la hoja.');
      }

      var cellF = sheet2.getRange(targetRow, 6);
      cellF.setValue(data.value); // Col F
      
      // Colores de Columna F
      if (data.value === 'Sí') cellF.setBackground('#ffe599');
      else if (data.value === 'No') cellF.setBackground('#ea9999');
      else if (data.value === 'No ubi') cellF.setBackground('#f9cb9c');
      else if (data.value === 'No tiene') cellF.setBackground('#b4a7d6');
      else if (data.value === 'Rota') cellF.setBackground('#ea9999');

      // Observaciones a Col L (12), Tiempo a Col M (13)
      if (data.observations) sheet2.getRange(targetRow, 12).setValue(data.observations);
      if (data.tiempoTotal) sheet2.getRange(targetRow, 13).setValue(data.tiempoTotal);

      return ContentService
        .createTextOutput(JSON.stringify({ success: true, message: 'Resultados (F, L, M) actualizados' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var rawText  = (data.rawText  || '').trim();
    var sucursal = (data.sucursal || '').trim();
    var cliente  = (data.cliente  || '').trim();
    var userName = (data.userName || '').trim();
    var userEmail= (data.userEmail|| '').trim();

    // Validaciones básicas
    if (!rawText)  return jsonError('Falta el texto del pedido.');
    if (!sucursal) return jsonError('Falta la sucursal.');
    if (!cliente)  return jsonError('Falta el tipo de cliente.');

    // Buscar la hoja correcta
    var sheetName = SHEET_NAMES[sucursal] || sucursal;
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      return jsonError('No se encontró la hoja: ' + sheetName + '. Revisa la configuración.');
    }

    // Parser del texto
    var parsed = parsePedido(rawText);

    // Encontrar la primera fila vacía en columna A (después de encabezados)
    var lastRow = getLastDataRow(sheet);
    var nextRow = lastRow + 1;

    // Escribir SOLO en columnas A, B, C, D e I
    // A = col 1, B = col 2, C = col 3, D = col 4, I = col 9
    sheet.getRange(nextRow, 1).setValue(rawText);               // A: Texto completo
    sheet.getRange(nextRow, 2).setValue(parsed.vehicleNumber);  // B: Nº Vehículo
    sheet.getRange(nextRow, 3).setValue(parsed.partNumbersStr); // C: Nº Pieza(s)
    sheet.getRange(nextRow, 4).setValue(parsed.description);    // D: Descripción
    sheet.getRange(nextRow, 9).setValue(cliente);               // I: Cliente

    // Responder con éxito
    var response = {
      success: true,
      row: nextRow,
      sheet: sheetName,
      parsed: {
        vehicleNumber: parsed.vehicleNumber,
        partNumbers:   parsed.partNumbers,
        description:   parsed.description
      },
      message: 'Pedido guardado en hoja "' + sheetName + '"'
    };

    return ContentService
      .createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return jsonError('Error inesperado: ' + err.toString());
  }
}

// ============================================================
// PARSER DE PEDIDOS
// Extrae nº vehículo, nº(s) de pieza y descripción del texto libre
// ============================================================
function parsePedido(text) {
  var vehicleNumber  = '';
  var partNumbers    = [];
  var description    = text;

  // Regex para nº vehículo (5–6 dígitos)
  var vehicleRegex = new RegExp('\\b(\\d{' + VEHICLE_MIN + ',' + VEHICLE_MAX + '})\\b');
  // Regex para nº pieza (6–7 dígitos)
  var partRegex    = new RegExp('\\b(\\d{' + PART_MIN + ',' + PART_MAX + '})\\b', 'g');

  // 1. Extraer nº vehículo (primer número corto encontrado)
  var vehicleMatch = vehicleRegex.exec(text);
  if (vehicleMatch) {
    vehicleNumber = vehicleMatch[1];
  }

  // 2. Extraer números de pieza (números más largos, distintos al vehículo)
  var partMatch;
  while ((partMatch = partRegex.exec(text)) !== null) {
    var num = partMatch[1];
    // No incluir si es el mismo número que el vehículo en la misma posición
    if (num === vehicleNumber && partMatch.index === (vehicleMatch ? vehicleMatch.index : -1)) continue;
    if (partNumbers.indexOf(num) === -1) {
      partNumbers.push(num);
    }
  }

  // 3. Construir descripción: quitar nº vehículo del inicio + quitar nº piezas
  description = text;
  if (vehicleNumber) {
    description = description.replace(new RegExp('^\\s*' + vehicleNumber + '\\s*'), '').trim();
  }
  for (var i = 0; i < partNumbers.length; i++) {
    description = description.replace(new RegExp('\\b' + partNumbers[i] + '\\b\\s*', 'g'), '').trim();
  }
  description = description.replace(/\s+/g, ' ').replace(/^[\s,\/\\;]+/, '').trim();

  // 4. Para Col. C: si hay varios números de pieza, unirlos con salto de línea
  // (en Google Sheets quedará como texto en varias líneas dentro de la misma celda)
  var partNumbersStr = partNumbers.join('\n');

  return {
    vehicleNumber:  vehicleNumber,
    partNumbers:    partNumbers,
    partNumbersStr: partNumbersStr,
    description:    description
  };
}

// ============================================================
// HELPERS
// ============================================================

// Encuentra la última fila con datos en la columna A (evita sobrescribir)
function getLastDataRow(sheet) {
  var data = sheet.getRange('A:A').getValues();
  var lastRow = 1; // empezamos en 1 (fila de encabezado)
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] !== '') {
      lastRow = i + 1; // +1 porque el array es 0-indexed
    }
  }
  return lastRow;
}

// Devuelve un error en JSON
function jsonError(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// FUNCIÓN DE PRUEBA (ejecútala desde el editor de Apps Script)
// ============================================================
function testParser() {
  var casos = [
    '26425 Opel Corsa B (1993->) ENGANCHE CINTURON DEL IZQ RECEPCION',
    '26265 Audi A3 (8L)(09.1996->) 513735 BOMBA DIRECCION C7 / E20 / B2',
    '26438 Seat Inca (6K9)(09.1995->) 513363 RETROVISOR IZQ, RETROVISOR DCH RECEP',
    'KORANDO ----JUEGO DE LLANTAS DE ALUMIIO'
  ];
  for (var i = 0; i < casos.length; i++) {
    var r = parsePedido(casos[i]);
    Logger.log('--- Caso ' + (i+1) + ' ---');
    Logger.log('Texto:    ' + casos[i]);
    Logger.log('Vehículo: ' + r.vehicleNumber);
    Logger.log('Piezas:   ' + r.partNumbers.join(', '));
    Logger.log('Desc:     ' + r.description);
  }
}
