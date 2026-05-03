/* ===================================================
   DESGUACES INSULARES — app.js
   Lógica completa: Auth, Parser, Pedidos, Stats
   =================================================== */

'use strict';

// =====================================================
// 1. CONFIGURACIÓN GLOBAL
// =====================================================
const CONFIG = {
    appName: 'Desguaces Insulares',
    // Nombres de pestañas configurables (sucursal -> nombre hoja)
    sheetNames: {
        'Tabares': 'Tabares',
        'Orotava': 'Orotava',
        'S/C': 'SC',
        'Icod': 'Icod',
        'Granadilla': 'Granadilla',
        'Islas': 'Islas',
    },
    // URL del Google Apps Script (se guarda en localStorage)
    scriptUrl: '',
    // Configuración del parser — dígitos para nº vehículo y pieza
    parser: {
        vehicleMinDigits: 5,
        vehicleMaxDigits: 6,
        partMinDigits: 6,
        partMaxDigits: 7,
    },
    // Columnas a escribir (0-indexed: A=0, B=1, C=2, D=3, I=8)
    columns: { A: 0, B: 1, C: 2, D: 3, I: 8 },
};

// Persistencia de la URL del script en localStorage
function getScriptUrl() {
    return localStorage.getItem('di_script_url') || '';
}
function setScriptUrl(url) {
    CONFIG.scriptUrl = url.trim();
    localStorage.setItem('di_script_url', url.trim());
}

// =====================================================
// 2. BASE DE DATOS LOCAL (demo con localStorage)
// =====================================================
const DB = {
    key: 'di_pedidos_v2',
    usersKey: 'di_users_v2',

    getOrders() {
        try {
            return JSON.parse(localStorage.getItem(this.key) || '[]');
        } catch { return []; }
    },

    saveOrders(orders) {
        localStorage.setItem(this.key, JSON.stringify(orders));
    },

    addOrder(order) {
        const orders = this.getOrders();
        order.id = Date.now() + Math.random().toString(36).slice(2, 7);
        order.createdAt = new Date().toISOString();
        order.updatedAt = new Date().toISOString();
        orders.push(order);
        this.saveOrders(orders);
        return order;
    },

    updateOrder(id, fields) {
        const orders = this.getOrders();
        const idx = orders.findIndex(o => o.id === id);
        if (idx === -1) return null;
        Object.assign(orders[idx], fields, { updatedAt: new Date().toISOString() });
        this.saveOrders(orders);
        return orders[idx];
    },

    getUsers() {
        const stored = localStorage.getItem(this.usersKey);
        if (stored) {
            let users = JSON.parse(stored);
            if (!users.some(u => u.role === 'desmontador')) {
                users.push(
                    { email: 'desmontador1@di.com', name: 'Pedro Desmonte', password: 'demo123', role: 'desmontador', sucursal: 'Todas', active: true },
                    { email: 'desmontador2@di.com', name: 'Luis Piezas', password: 'demo123', role: 'desmontador', sucursal: 'Todas', active: true }
                );
                localStorage.setItem(this.usersKey, JSON.stringify(users));
            }
            return users;
        }
        // Usuarios demo por defecto
        const defaults = [
            { email: 'admin@di.com', name: 'Administrador', password: 'demo123', role: 'admin', sucursal: 'Todas', active: true },
            { email: 'jefe@di.com', name: 'Jefe Almacén', password: 'demo123', role: 'encargado', sucursal: 'Tabares', active: true },
            { email: 'emp@di.com', name: 'Empleado Demo', password: 'demo123', role: 'empleado', sucursal: 'Orotava', active: true },
            { email: 'cristian@di.com', name: 'Cristian P.', password: 'demo123', role: 'empleado', sucursal: 'S/C', active: true },
            { email: 'mounir@di.com', name: 'Mounir', password: 'demo123', role: 'empleado', sucursal: 'Icod', active: true },
            { email: 'rolo@di.com', name: 'ROLO', password: 'demo123', role: 'empleado', sucursal: 'Granadilla', active: true },
            // Nuevos roles: desmontador y asignador
            { email: 'desmontador1@di.com', name: 'Pedro Desmonte', password: 'demo123', role: 'desmontador', sucursal: 'Todas', active: true },
            { email: 'desmontador2@di.com', name: 'Luis Piezas', password: 'demo123', role: 'desmontador', sucursal: 'Todas', active: true },
            { email: 'asignador@di.com', name: 'María Asigna', password: 'demo123', role: 'asignador', sucursal: 'Todas', active: true },
        ];
        localStorage.setItem(this.usersKey, JSON.stringify(defaults));
        return defaults;
    },

    getDesmontadores() {
        return this.getUsers().filter(u => u.role === 'desmontador' && u.active);
    },

    authenticate(email, password) {
        const users = this.getUsers();
        return users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password && u.active) || null;
    },
};

// Generar datos demo si no hay pedidos
function seedDemoData() {
    const existing = DB.getOrders();
    if (existing.length > 0) return;

    const sucursales = ['Tabares', 'Orotava', 'S/C', 'Icod', 'Granadilla', 'Islas'];
    const clientes = ['Talleres', 'Particulares'];
    const usuarios = [
        { email: 'cristian@di.com', name: 'Cristian P.' },
        { email: 'mounir@di.com', name: 'Mounir' },
        { email: 'rolo@di.com', name: 'ROLO' },
        { email: 'emp@di.com', name: 'Empleado Demo' },
    ];
    const sampleTexts = [
        '26438 Seat Inca (6K9)(09.1995->) 513363 RETROVISOR IZQ, RETROVISOR DCH RECEP',
        '26425 Opel Corsa B (1993->) ENGANCHE CINTURON DEL IZQ RECEPCION',
        '26380 Seat Ibiza (6L1)(04.2002->) MARCO CUADRO RELOJES RECEPCION',
        'KORANDO ----JUEGO DE LLANTAS DE ALUMIIO',
        '26265 Audi A3 (8L)(09.1996->) 513735 BOMBA DIRECCION C7 / E20 / B2',
        '31245 Toyota Yaris (2001->) ESPEJO RETROVISOR IZQ',
        '28900 Ford Focus (2005->) 678123 ALTERNADOR',
        '15789 Volkswagen Golf IV (1997->) PUERTA DELANTERA IZQ',
        '22456 Renault Clio (2003->) BOMBA GASOIL',
        '39012 Peugeot 206 (2001->) 456789 AMORTIGUADOR TRASERO DCH',
    ];

    const orders = [];
    const now = new Date();
    const desmontadores = [
        { email: 'desmontador1@di.com', name: 'Pedro Desmonte' },
        { email: 'desmontador2@di.com', name: 'Luis Piezas' },
    ];

    for (let i = 0; i < 45; i++) {
        const daysAgo = Math.floor(Math.random() * 30);
        const date = new Date(now);
        date.setDate(date.getDate() - daysAgo);
        date.setHours(8 + Math.floor(Math.random() * 9), Math.floor(Math.random() * 60));

        const rawText = sampleTexts[Math.floor(Math.random() * sampleTexts.length)];
        const parsed = parseOrder(rawText);
        const sucursal = sucursales[Math.floor(Math.random() * sucursales.length)];
        const cliente = clientes[Math.floor(Math.random() * clientes.length)];
        const user = usuarios[Math.floor(Math.random() * usuarios.length)];
        const sent = Math.random() > 0.05;
        const rowNum = Math.floor(Math.random() * 50) + 5;

        // Determinar estado del flujo de trabajo
        let workflowStatus = 'pendiente';
        let assignedTo = null;
        let assignedToName = null;
        let result = null;
        let observations = null;
        const rnd = Math.random();
        if (rnd < 0.2) {
            workflowStatus = 'pendiente';
        } else if (rnd < 0.5) {
            workflowStatus = 'asignado';
            const d = desmontadores[Math.floor(Math.random() * desmontadores.length)];
            assignedTo = d.email; assignedToName = d.name;
        } else if (rnd < 0.75) {
            workflowStatus = 'sacado';
            const d = desmontadores[Math.floor(Math.random() * desmontadores.length)];
            assignedTo = d.email; assignedToName = d.name;
            result = 'si';
            observations = Math.random() > 0.5 ? 'Pieza en buen estado' : null;
        } else {
            workflowStatus = 'no-sacado';
            const d = desmontadores[Math.floor(Math.random() * desmontadores.length)];
            assignedTo = d.email; assignedToName = d.name;
            result = 'no';
            observations = Math.random() > 0.5 ? 'Pieza dañada / no encontrada' : null;
        }

        orders.push({
            id: `demo_${i}_${Date.now()}`,
            rawText,
            vehicleNumber: parsed.vehicleNumber,
            partNumbers: parsed.partNumbers,
            description: parsed.description,
            sucursal,
            cliente,
            sheetName: CONFIG.sheetNames[sucursal] || sucursal,
            sheetRow: sent ? rowNum : null,
            userEmail: user.email,
            userName: user.name,
            status: sent ? 'enviado' : 'error',
            sheetResponse: sent ? 'Insertado en fila ' + rowNum : null,
            error: !sent ? 'Error de conexión con Google Sheets' : null,
            createdAt: date.toISOString(),
            updatedAt: date.toISOString(),
            colA: rawText,
            colB: parsed.vehicleNumber,
            colC: parsed.partNumbers.join('\n'),
            colD: parsed.description,
            colI: cliente,
            // Flujo de desmontaje
            workflowStatus,
            assignedTo,
            assignedToName,
            result,
            observations,
        });
    }
    DB.saveOrders(orders);
}

// =====================================================
// 3. PARSER DE PEDIDOS
// =====================================================

/**
 * Analiza el texto libre de un pedido y extrae:
 * - vehicleNumber: número de vehículo (5–6 dígitos, primer número corto)
 * - partNumbers: array de números de pieza (6–7 dígitos)
 * - description: resto del texto descriptivo
 * - confidence: nivel de confianza ('high', 'medium', 'low')
 * - warnings: array de mensajes de aviso
 */
function parseOrder(text) {
    const { vehicleMinDigits, vehicleMaxDigits, partMinDigits, partMaxDigits } = CONFIG.parser;
    const warnings = [];
    let vehicleNumber = '';
    const partNumbers = [];
    let workingText = text.trim();

    // Regex para encontrar números puros (secuencias de dígitos)
    // vehicleRe: secuencias de dígitos del tamaño de vehículo
    const vehicleRe = new RegExp(`\\b(\\d{${vehicleMinDigits},${vehicleMaxDigits}})\\b`, 'g');
    // partRe: secuencias de dígitos del tamaño de pieza
    const partRe = new RegExp(`\\b(\\d{${partMinDigits},${partMaxDigits}})\\b`, 'g');

    // PASO 1: Buscar el primer número de vehículo (número corto al inicio)
    // Estrategia: el primer número del rango de vehículo que aparece en el texto
    const vehicleMatch = vehicleRe.exec(workingText);
    let vehicleStart = -1;
    let vehicleEnd = -1;

    if (vehicleMatch) {
        vehicleNumber = vehicleMatch[1];
        vehicleStart = vehicleMatch.index;
        vehicleEnd = vehicleMatch.index + vehicleMatch[0].length;
    } else {
        warnings.push('No se detectó número de vehículo. Revisa el pedido.');
    }

    // PASO 2: Buscar números de pieza (rango de dígitos mayor que el de vehículo)
    // Reiniciamos la búsqueda en el texto completo
    const partReGlobal = new RegExp(`\\b(\\d{${partMinDigits},${partMaxDigits}})\\b`, 'g');
    let partMatch;
    while ((partMatch = partReGlobal.exec(workingText)) !== null) {
        const num = partMatch[1];
        const pos = partMatch.index;
        // El número de pieza no debe ser el mismo que el número de vehículo
        // ni estar en la misma posición
        if (vehicleNumber && num === vehicleNumber && pos === vehicleStart) continue;
        // Evitar duplicados
        if (!partNumbers.includes(num)) {
            partNumbers.push(num);
        }
    }

    // PASO 3: Construir descripción
    // Eliminamos el número de vehículo y los números de pieza del texto
    let description = workingText;

    // Eliminar número de vehículo del principio si está al inicio
    if (vehicleNumber) {
        description = description.replace(new RegExp(`^\\s*${vehicleNumber}\\s*`), '').trim();
    }

    // Eliminar números de pieza, pero solo si son standalone (evitar quitar partes de texto)
    for (const pn of partNumbers) {
        description = description.replace(new RegExp(`\\b${pn}\\b\\s*`, 'g'), '').trim();
    }

    // Limpiar múltiples espacios y caracteres sobrantes al inicio
    description = description.replace(/\s+/g, ' ').trim();
    // Limpiar comas o barras sobrantes al inicio
    description = description.replace(/^[\s,\/\\;]+/, '').trim();

    // PASO 4: Evaluar confianza
    let confidence = 'high';
    if (!vehicleNumber) confidence = 'low';
    else if (partNumbers.length === 0 && text.match(/\d{6,7}/)) confidence = 'medium';
    if (description.length < 3) {
        confidence = 'low';
        warnings.push('La descripción resultante es muy corta. Revisa el pedido.');
    }
    if (!vehicleNumber && partNumbers.length > 0) {
        warnings.push('Se detectaron números de pieza pero no número de vehículo.');
    }
    if (partNumbers.length > 3) {
        warnings.push(`Se detectaron ${partNumbers.length} números de pieza. Revisa si son correctos.`);
    }

    return { vehicleNumber, partNumbers, description, confidence, warnings };
}

// =====================================================
// 4. AUTENTICACIÓN Y ESTADO
// =====================================================
let currentUser = null;

function initAuth() {
    // Cargar URL del script guardada
    CONFIG.scriptUrl = getScriptUrl();

    const stored = sessionStorage.getItem('di_user');
    if (stored) {
        try {
            currentUser = JSON.parse(stored);
            showApp();
        } catch {
            showLogin();
        }
    } else {
        showLogin();
    }
}

function login(email, password) {
    const user = DB.authenticate(email, password);
    if (user) {
        currentUser = user;
        sessionStorage.setItem('di_user', JSON.stringify(user));
        return true;
    }
    return false;
}

function logout() {
    currentUser = null;
    sessionStorage.removeItem('di_user');
    showLogin();
}

function canAccessStats() {
    return currentUser && ['admin', 'encargado', 'asignador'].includes(currentUser.role);
}
function canAccessConfig() {
    return currentUser && currentUser.role === 'admin';
}
function canAccessAsignacion() {
    return currentUser && ['admin', 'encargado', 'asignador'].includes(currentUser.role);
}
function canAccessControl() {
    return currentUser && ['admin', 'encargado', 'asignador'].includes(currentUser.role);
}
function canAccessDesmontador() {
    return currentUser && currentUser.role === 'desmontador';
}
function canCreateOrders() {
    return currentUser && !['desmontador'].includes(currentUser.role);
}

// CDN helper
function isCDN(order) {
    return !!(order.rawText && order.rawText.toUpperCase().includes('CDN'));
}

// =====================================================
// 5. NAVEGACIÓN Y PÁGINAS
// =====================================================
function showLogin() {
    document.getElementById('page-login').classList.add('active');
    document.getElementById('app').style.display = 'none';
}

function showApp() {
    document.getElementById('page-login').classList.remove('active');
    document.getElementById('app').style.display = 'flex';

    // Actualizar UI con datos del usuario
    updateUserUI();
    // Mostrar/ocultar elementos según rol
    applyRolePermissions();
    // Navegar: desmontadores van directo a su panel
    if (currentUser && currentUser.role === 'desmontador') {
        navigateTo('desmontador');
    } else {
        navigateTo('dashboard');
    }
}

function updateUserUI() {
    if (!currentUser) return;
    const initials = currentUser.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const roleLabels = {
        admin: 'Administrador',
        encargado: 'Encargado',
        empleado: 'Empleado',
        desmontador: 'Desmontador',
        asignador: 'Asignador',
    };

    setEl('sidebar-name', currentUser.name);
    setEl('sidebar-role', roleLabels[currentUser.role] || currentUser.role);
    setEl('sidebar-avatar', initials);
    setEl('topbar-avatar', initials);

    // greeting en dashboard
    const h = new Date().getHours();
    const greeting = h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
    setEl('dashboard-greeting', `${greeting}, ${currentUser.name.split(' ')[0]}`);
}

function applyRolePermissions() {
    const statsNav = document.getElementById('nav-stats');
    const configNav = document.getElementById('nav-config');
    const asignacionNav = document.getElementById('nav-asignacion');
    const desmontadorNav = document.getElementById('nav-desmontador');
    const dashboardNav = document.querySelector('.nav-item[data-page="dashboard"]');
    const historyNav = document.querySelector('.nav-item[data-page="history"]');
    const newOrderNav = document.querySelector('.nav-item[data-page="new-order"]');
    const dashboardNewOrderBtn = document.querySelector('.btn[data-page="new-order"]');
    const quickActionCard = document.querySelector('.quick-action-card');

    const isDesmontador = currentUser && currentUser.role === 'desmontador';

    // Desmontadores no ven dashboard ni historial general ni creación de pedidos
    if (dashboardNav) dashboardNav.style.display = isDesmontador ? 'none' : '';
    if (historyNav) historyNav.style.display = isDesmontador ? 'none' : '';
    if (newOrderNav) newOrderNav.style.display = canCreateOrders() ? 'flex' : 'none';

    if (statsNav) statsNav.style.display = canAccessStats() ? 'flex' : 'none';
    if (configNav) configNav.style.display = canAccessConfig() ? 'flex' : 'none';
    if (asignacionNav) asignacionNav.style.display = canAccessAsignacion() ? 'flex' : 'none';
    const controlNav = document.getElementById('nav-control');
    if (controlNav) controlNav.style.display = canAccessControl() ? 'flex' : 'none';
    if (desmontadorNav) desmontadorNav.style.display = canAccessDesmontador() ? 'flex' : 'none';
    if (dashboardNewOrderBtn) dashboardNewOrderBtn.style.display = canCreateOrders() ? '' : 'none';
    if (quickActionCard) quickActionCard.style.display = canCreateOrders() ? '' : 'none';
}

function navigateTo(pageId) {
    if (pageId === 'dashboard' && currentUser && currentUser.role === 'desmontador') {
        navigateTo('desmontador');
        return;
    }
    if (pageId === 'history' && currentUser && currentUser.role === 'desmontador') {
        navigateTo('desmontador');
        return;
    }
    if (pageId === 'stats' && !canAccessStats()) {
        showToast('No tienes permisos para acceder a las estadísticas.', 'error');
        return;
    }
    if (pageId === 'config' && !canAccessConfig()) {
        showToast('No tienes permisos para acceder a la configuración.', 'error');
        return;
    }
    if (pageId === 'asignacion' && !canAccessAsignacion()) {
        showToast('No tienes permisos para acceder a asignación.', 'error');
        return;
    }
    if (pageId === 'control' && !canAccessControl()) {
        showToast('No tienes permisos para acceder al control de pedidos.', 'error');
        return;
    }
    if (pageId === 'desmontador' && !canAccessDesmontador()) {
        showToast('No tienes permisos para acceder al panel de desmontador.', 'error');
        return;
    }
    if (pageId === 'new-order' && !canCreateOrders()) {
        showToast('Los desmontadores no crean pedidos.', 'error');
        return;
    }

    // Desactivar páginas e items de nav
    document.querySelectorAll('.content-page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));

    // Activar página
    const page = document.getElementById(`page-${pageId}`);
    if (page) page.classList.add('active');

    // Activar nav item
    const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
    if (navItem) navItem.classList.add('active');

    // Cerrar sidebar en móvil
    closeMobileSidebar();

    // Cargar datos de la página
    if (pageId === 'dashboard') loadDashboard();
    else if (pageId === 'history') loadHistory();
    else if (pageId === 'stats') loadStats();
    else if (pageId === 'config') loadConfig();
    else if (pageId === 'new-order') resetOrderForm();
    else if (pageId === 'asignacion') loadAsignacion();
    else if (pageId === 'control') loadControl();
    else if (pageId === 'desmontador') loadDesmontador();
}

// =====================================================
// 6. DASHBOARD
// =====================================================

/** Returns HTML badge for workflow status */
function workflowStatusBadge(ws) {
    const map = {
        'pendiente':  { cls: 'badge-yellow',   label: '⏳ Pendiente' },
        'asignado':   { cls: 'badge-blue',      label: '👤 Asignado' },
        'sacado':     { cls: 'badge-green',     label: '✓ Sacado' },
        'no-sacado':  { cls: 'badge-red',       label: '✕ No sacado' },
    };
    const s = map[ws] || map['pendiente'];
    return `<span class="badge ${s.cls}">${s.label}</span>`;
}
function loadDashboard() {
    const orders = DB.getOrders();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const today = orders.filter(o => new Date(o.createdAt) >= startOfDay).length;
    const week = orders.filter(o => new Date(o.createdAt) >= startOfWeek).length;
    const month = orders.filter(o => new Date(o.createdAt) >= startOfMonth).length;

    setEl('kpi-today', today);
    setEl('kpi-week', week);
    setEl('kpi-month', month);
    setEl('kpi-total', orders.length);

    // Recent orders (last 8, user-specific for employees)
    let recent = [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (currentUser && currentUser.role === 'empleado') {
        recent = recent.filter(o => o.userEmail === currentUser.email);
    }
    recent = recent.slice(0, 8);

    const tbody = document.getElementById('dashboard-recent-body');
    if (!tbody) return;
    if (recent.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No hay pedidos recientes</td></tr>';
        return;
    }
    tbody.innerHTML = recent.map(o => `
    <tr onclick="openOrderModal('${o.id}')">
      <td><strong>${o.vehicleNumber || '—'}</strong></td>
      <td class="truncate" style="max-width:200px">${truncate(o.description || o.rawText, 50)}</td>
      <td><span class="badge badge-blue">${o.sucursal}</span></td>
      <td><span class="badge ${o.cliente === 'Talleres' ? 'badge-purple' : 'badge-orange'}">${o.cliente}</span></td>
      <td>${formatDate(o.createdAt)}</td>
      <td>${workflowStatusBadge(o.workflowStatus || 'pendiente')}</td>
    </tr>
  `).join('');
}

window.renderDismantlerStats = function() {
    const period = document.getElementById('kpi-stats-period')?.value || '12h';
    let msAgo = 0;
    if (period === '12h') msAgo = 12 * 60 * 60 * 1000;
    else if (period === '48h') msAgo = 48 * 60 * 60 * 1000;
    else if (period === '5days') msAgo = 5 * 24 * 60 * 60 * 1000;

    const limitDate = new Date(Date.now() - msAgo);
    const orders = DB.getOrders();
    const stats = {};

    orders.forEach(o => {
        if (o.result === 'si' && o.assignedToName && o.completedAt) {
            if (new Date(o.completedAt) >= limitDate) {
                stats[o.assignedToName] = (stats[o.assignedToName] || 0) + 1;
            }
        }
    });

    const sortedStats = Object.entries(stats).sort((a,b) => b[1] - a[1]);
    const tbody = document.getElementById('dismantler-stats-body');
    if (!tbody) return;

    if (sortedStats.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--slate-500)">No hay piezas sacadas en este periodo</td></tr>';
        return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    tbody.innerHTML = sortedStats.map((item, index) => {
        return `<tr>
            <td style="text-align:center;font-size:1.1rem">${medals[index] || (index+1)}</td>
            <td style="font-weight:600">${item[0]}</td>
            <td style="text-align:right; font-size:1.1rem; color:var(--blue-600); font-weight:bold">${item[1]}</td>
        </tr>`;
    }).join('');
}

// =====================================================
// 7. HISTORIAL
// =====================================================
function loadHistory(sucursalFilter = '', clienteFilter = '', searchFilter = '') {
    let orders = DB.getOrders();

    // Empleados solo ven sus propios pedidos
    if (currentUser && currentUser.role === 'empleado') {
        orders = orders.filter(o => o.userEmail === currentUser.email);
    }

    // Desmontadores solo ven los pedidos asignados a ellos
    if (currentUser && currentUser.role === 'desmontador') {
        orders = orders.filter(o => o.assignedTo === currentUser.email);
    }

    // Filtros
    if (sucursalFilter) orders = orders.filter(o => o.sucursal === sucursalFilter);
    if (clienteFilter) orders = orders.filter(o => o.cliente === clienteFilter);
    if (searchFilter) {
        const q = searchFilter.toLowerCase();
        orders = orders.filter(o =>
            (o.rawText || '').toLowerCase().includes(q) ||
            (o.vehicleNumber || '').includes(q) ||
            (o.description || '').toLowerCase().includes(q) ||
            (o.sucursal || '').toLowerCase().includes(q)
        );
    }

    // Ordenar por fecha descendente
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const tbody = document.getElementById('history-body');
    if (!tbody) return;
    if (orders.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="8">No se encontraron pedidos</td></tr>';
        return;
    }
    tbody.innerHTML = orders.map(o => {
        const cdnClass = isCDN(o) ? ' cdn-order' : '';
        const cdnBadge = isCDN(o) ? '<span class="cdn-badge" title="Pedido CDN">CDN</span> ' : '';
        return `
    <tr class="${cdnClass}" onclick="openOrderModal('${o.id}')">
      <td style="text-align:center;padding:6px">
        ${o.photo
            ? `<img src="${o.photo}" onclick="event.stopPropagation();openPhotoModal('${o.photo}')" style="width:36px;height:36px;object-fit:cover;border-radius:4px;cursor:pointer;border:1px solid var(--slate-200)" title="Ver foto" />`
            : `<span style="color:var(--slate-300);font-size:1rem">&mdash;</span>`}
      </td>
      <td><strong>${cdnBadge}${o.vehicleNumber || '&mdash;'}</strong></td>
      <td>${o.partNumbers && o.partNumbers.length ? o.partNumbers.join(', ') : '&mdash;'}</td>
      <td class="truncate" style="max-width:200px">${truncate(o.description || '&mdash;', 45)}</td>
      <td><span class="badge badge-blue">${o.sucursal}</span></td>
      <td><span class="badge ${o.cliente === 'Talleres' ? 'badge-purple' : 'badge-orange'}">${o.cliente}</span></td>
      <td>${o.userName || o.userEmail || '&mdash;'}</td>
      <td>${formatDateTime(o.createdAt)}</td>
      <td>${workflowStatusBadge(o.workflowStatus || 'pendiente')}</td>
      <td>${o.tiempoTotal != null ? o.tiempoTotal + ' min' : '&mdash;'}</td>
      <td class="truncate" style="max-width:150px" title="${escHtml(o.observations || '')}">${o.observations ? escHtml(o.observations) : '-'}</td>
    </tr>`;
    }).join('');
}

// =====================================================
// 8. FORMULARIO DE PEDIDO
// =====================================================
let previewVisible = false;
let parsedData = null;

function resetOrderForm() {
    const form = document.getElementById('order-form');
    if (form) form.reset();
    const preview = document.getElementById('order-preview');
    if (preview) preview.style.display = 'none';
    const success = document.getElementById('order-success');
    if (success) success.style.display = 'none';
    const formCard = document.querySelector('.order-form-card');
    if (formCard) formCard.style.display = 'block';
    setEl('char-count', '0');
    previewVisible = false;
    parsedData = null;
}

function showPreview() {
    const text = document.getElementById('order-text').value.trim();
    const sucursal = document.getElementById('order-sucursal').value;
    const cliente = document.getElementById('order-cliente').value;

    if (!text) {
        showToast('Pega el texto del pedido primero.', 'error');
        document.getElementById('order-text').focus();
        return;
    }
    if (!sucursal) {
        showToast('Selecciona una sucursal.', 'error');
        document.getElementById('order-sucursal').focus();
        return;
    }
    if (!cliente) {
        showToast('Selecciona el tipo de cliente.', 'error');
        document.getElementById('order-cliente').focus();
        return;
    }

    parsedData = parseOrder(text);

    // Actualizar previsualización
    setEl('prev-colA', text);
    setEl('prev-colB', parsedData.vehicleNumber || '(no detectado)');
    setEl('prev-colC', parsedData.partNumbers.length > 0 ? parsedData.partNumbers.join(' / ') : '(vacío)');
    setEl('prev-colD', parsedData.description || '(vacío)');
    setEl('prev-colI', cliente);
    setEl('prev-sheet', (CONFIG.sheetNames[sucursal] || sucursal) + ' (' + sucursal + ')');

    const warning = document.getElementById('preview-warning');
    const warningText = document.getElementById('preview-warning-text');
    if (parsedData.warnings.length > 0 || parsedData.confidence !== 'high') {
        warning.style.display = 'flex';
        warningText.textContent = parsedData.warnings.join(' | ') || 'Revisa los datos detectados antes de enviar.';
    } else {
        warning.style.display = 'none';
    }

    const previewEl = document.getElementById('order-preview');
    previewEl.style.display = 'block';
    previewEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    previewVisible = true;
}

window.openPhotoModal = function(base64) {
    const imgEl = document.getElementById('photo-modal-img');
    if(imgEl) imgEl.src = base64;
    const modal = document.getElementById('photo-modal');
    if(modal) modal.style.display = 'flex';
};

function compressImageForm(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.getElementById('photo-compress-canvas') || document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const MAX = 800;
                if (width > height) {
                    if (width > MAX) { height *= MAX / width; width = MAX; }
                } else {
                    if (height > MAX) { width *= MAX / height; height = MAX; }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.6));
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
}

async function submitOrder(e) {
    e.preventDefault();

    const text = document.getElementById('order-text').value.trim();
    const sucursal = document.getElementById('order-sucursal').value;
    const cliente = document.getElementById('order-cliente').value;

    if (!text || !sucursal || !cliente) {
        showToast('Completa todos los campos obligatorios.', 'error');
        return;
    }

    const isUrgent = document.getElementById('order-urgent')?.checked || false;
    const photoInput = document.getElementById('order-photo');
    let photoData = null;
    if (photoInput && photoInput.files && photoInput.files[0]) {
        photoData = await compressImageForm(photoInput.files[0]);
    }

    // Parsear si no se ha hecho ya
    if (!parsedData) {
        parsedData = parseOrder(text);
    }

    const btn = document.getElementById('btn-send');
    const btnText = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.btn-spinner');
    btn.disabled = true;
    btnText.style.display = 'none';
    spinner.style.display = 'block';

    const sheetName = CONFIG.sheetNames[sucursal] || sucursal;
    const scriptUrl = getScriptUrl();

    // Construir payload
    const payload = {
        rawText: text,
        sucursal,
        cliente,
        userName: currentUser.name,
        userEmail: currentUser.email,
    };

    let sheetResponse = null;
    let sheetError = null;
    let orderStatus = 'enviado';
    let jsonResponse = null;

    // --- Envío real a Google Apps Script ---
    if (scriptUrl) {
        try {
            const res = await fetch(scriptUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(payload),
                redirect: 'follow',
            });
            jsonResponse = await res.json();
            if (jsonResponse.success) {
                sheetResponse = 'Guardado exitosamente en la hoja: ' + sheetName;
            } else {
                sheetError = jsonResponse.error || 'Error desconocido en Google Sheets';
                orderStatus = 'error';
            }
        } catch (err) {
            sheetError = 'Error de red: ' + err.message;
            orderStatus = 'error';
        }
    } else {
        sheetResponse = 'Sin URL de script configurada — pedido guardado solo en historial local.';
    }

    // Construir registro del pedido para historial local
    const order = {
        urgent: isUrgent,
        photo: photoData,
        rawText: text,
        vehicleNumber: parsedData.vehicleNumber,
        partNumbers: parsedData.partNumbers,
        description: parsedData.description,
        sucursal,
        cliente,
        sheetName,
        sheetRow: (jsonResponse && jsonResponse.row) ? jsonResponse.row : null,
        userEmail: currentUser.email,
        userName: currentUser.name,
        userRole: currentUser.role,
        status: orderStatus,
        colA: text,
        colB: parsedData.vehicleNumber,
        colC: parsedData.partNumbers.join('\n'),
        colD: parsedData.description,
        colI: cliente,
        sheetResponse,
        error: sheetError,
        // Flujo de trabajo
        workflowStatus: 'pendiente',
        assignedTo: null,
        assignedToName: null,
        result: null,
        observations: null,
    };

    DB.addOrder(order);

    btn.disabled = false;
    btnText.style.display = 'inline';
    spinner.style.display = 'none';

    if (orderStatus === 'error') {
        showToast('Error al guardar en Google Sheets: ' + sheetError, 'error');
        // Mostrar error pero permitir reintento
        btn.disabled = false;
        return;
    }

    // Mostrar confirmación de éxito
    setEl('success-sheet', sheetName);
    const details = document.getElementById('success-details');
    details.innerHTML = `
    <strong>Nº Vehículo:</strong> ${order.vehicleNumber || '—'}<br>
    <strong>Nº Pieza:</strong> ${order.partNumbers.length > 0 ? order.partNumbers.join(', ') : '—'}<br>
    <strong>Sucursal:</strong> ${sucursal}<br>
    <strong>Cliente:</strong> ${cliente}<br>
    <strong>Respuesta Sheets:</strong> ${sheetResponse || '—'}<br>
    <strong>Fecha:</strong> ${formatDateTime(new Date().toISOString())}
  `;

    document.querySelector('.order-form-card').style.display = 'none';
    document.getElementById('order-success').style.display = 'block';

    if (scriptUrl) {
        showToast('¡Pedido guardado en Google Sheets correctamente!', 'success');
    } else {
        showToast('Pedido guardado en historial local. Configura la URL del script para enviar a Sheets.', 'info');
    }
    parsedData = null;
}

// =====================================================
// 9. ESTADÍSTICAS
// =====================================================
let charts = {};

function loadStats() {
    const orders = DB.getOrders();
    const period = parseInt(document.getElementById('stats-period')?.value || '30');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - period);
    const filtered = orders.filter(o => new Date(o.createdAt) >= cutoff);

    // KPIs
    setEl('stats-total', filtered.length);
    const avgDay = period > 0 ? (filtered.length / period).toFixed(1) : 0;
    setEl('stats-avg-day', avgDay);

    // Top branch
    const branchCount = {};
    filtered.forEach(o => { branchCount[o.sucursal] = (branchCount[o.sucursal] || 0) + 1; });
    const topBranch = Object.entries(branchCount).sort((a, b) => b[1] - a[1])[0];
    setEl('stats-top-branch', topBranch ? topBranch[0] : '—');

    // % Talleres
    const talleresCount = filtered.filter(o => o.cliente === 'Talleres').length;
    const pct = filtered.length > 0 ? Math.round((talleresCount / filtered.length) * 100) : 0;
    setEl('stats-talleres-pct', pct + '%');

    // Chart: daily
    renderDailyChart(filtered, period);
    // Chart: branches
    renderBranchesChart(branchCount);
    // Chart: clients
    renderClientsChart(filtered);
    // Ranking
    renderRanking(branchCount);
    // User activity table
    renderUserStats(filtered);
}

function renderDailyChart(orders, period) {
    const labels = [];
    const data = [];
    const dayMap = {};
    orders.forEach(o => {
        const d = o.createdAt.split('T')[0];
        dayMap[d] = (dayMap[d] || 0) + 1;
    });

    const now = new Date();
    const daysToShow = Math.min(period, 14);
    for (let i = daysToShow - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        labels.push(d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }));
        data.push(dayMap[key] || 0);
    }

    if (charts.daily) charts.daily.destroy();
    const ctx = document.getElementById('chart-daily');
    if (!ctx) return;
    charts.daily = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Pedidos',
                data,
                backgroundColor: 'rgba(37,99,235,0.7)',
                borderColor: 'rgba(37,99,235,1)',
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0, color: '#64748b' }, grid: { color: '#f1f5f9' } },
                x: { ticks: { color: '#64748b' }, grid: { display: false } }
            }
        }
    });
}

function renderBranchesChart(branchCount) {
    const sucursales = ['Tabares', 'Orotava', 'S/C', 'Icod', 'Granadilla', 'Islas'];
    const data = sucursales.map(s => branchCount[s] || 0);
    const colors = ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#f59e0b', '#0891b2'];

    if (charts.branches) charts.branches.destroy();
    const ctx = document.getElementById('chart-branches');
    if (!ctx) return;
    charts.branches = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sucursales,
            datasets: [{
                label: 'Pedidos',
                data,
                backgroundColor: colors.map(c => c + 'bb'),
                borderColor: colors,
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0, color: '#64748b' }, grid: { color: '#f1f5f9' } },
                x: { ticks: { color: '#64748b' }, grid: { display: false } }
            }
        }
    });
}

function renderClientsChart(orders) {
    const talleres = orders.filter(o => o.cliente === 'Talleres').length;
    const particulares = orders.filter(o => o.cliente === 'Particulares').length;

    if (charts.clients) charts.clients.destroy();
    const ctx = document.getElementById('chart-clients');
    if (!ctx) return;
    charts.clients = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Talleres', 'Particulares'],
            datasets: [{
                data: [talleres, particulares],
                backgroundColor: ['rgba(147,51,234,0.8)', 'rgba(234,88,12,0.8)'],
                borderColor: ['#9333ea', '#ea580c'],
                borderWidth: 2,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 12 }, color: '#475569' } }
            },
            cutout: '65%',
        }
    });
}

function renderRanking(branchCount) {
    const sorted = Object.entries(branchCount).sort((a, b) => b[1] - a[1]);
    const max = sorted[0]?.[1] || 1;
    const posClasses = ['gold', 'silver', 'bronze'];

    const container = document.getElementById('branch-ranking');
    if (!container) return;
    if (sorted.length === 0) {
        container.innerHTML = '<p style="color:var(--slate-400);font-size:0.85rem;text-align:center">Sin datos</p>';
        return;
    }
    container.innerHTML = sorted.map(([branch, count], i) => `
    <div class="ranking-item">
      <div class="ranking-pos ${posClasses[i] || ''}">${i + 1}</div>
      <span class="ranking-name">${branch}</span>
      <div class="ranking-bar-wrapper">
        <div class="ranking-bar">
          <div class="ranking-bar-fill" style="width:${Math.round((count / max) * 100)}%"></div>
        </div>
      </div>
      <span class="ranking-count">${count}</span>
    </div>
  `).join('');
}

function renderUserStats(orders) {
    const userMap = {};
    orders.forEach(o => {
        const key = o.userEmail || o.userName || 'Desconocido';
        if (!userMap[key]) {
            userMap[key] = { name: o.userName || key, email: o.userEmail || key, sucursal: o.sucursal, count: 0, lastOrder: o.createdAt };
        }
        userMap[key].count++;
        if (o.createdAt > userMap[key].lastOrder) userMap[key].lastOrder = o.createdAt;
    });

    const sorted = Object.values(userMap).sort((a, b) => b.count - a.count);
    const tbody = document.getElementById('stats-users-body');
    if (!tbody) return;
    if (sorted.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="4">Sin datos</td></tr>';
        return;
    }
    tbody.innerHTML = sorted.map(u => `
    <tr>
      <td><strong>${u.name}</strong><br><small style="color:var(--slate-400)">${u.email}</small></td>
      <td>${u.sucursal || '—'}</td>
      <td><strong>${u.count}</strong></td>
      <td>${formatDate(u.lastOrder)}</td>
    </tr>
  `).join('');
}

function exportCSV() {
    const orders = DB.getOrders();
    const headers = ['ID', 'Fecha', 'Usuario', 'Sucursal', 'Cliente', 'Nº Vehículo', 'Nº Pieza', 'Descripción', 'Texto original', 'Hoja destino', 'Estado'];
    const rows = orders.map(o => [
        o.id,
        formatDateTime(o.createdAt),
        o.userName || o.userEmail,
        o.sucursal,
        o.cliente,
        o.vehicleNumber || '',
        (o.partNumbers || []).join('; '),
        o.description || '',
        '"' + (o.rawText || '').replace(/"/g, '""') + '"',
        o.sheetName,
        o.status,
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pedidos_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exportado correctamente.', 'success');
}

// =====================================================
// 10. CONFIGURACIÓN
// =====================================================
function loadConfig() {
    // Cargar URL del script
    const saved = getScriptUrl();
    setInputVal('config-script-url', saved);
    if (saved) {
        const statusEl = document.getElementById('sheets-connection-status');
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.innerHTML = '<span class="badge badge-green">✓ URL configurada</span>';
        }
    }

    // Cargar nombres de hoja actuales
    document.querySelectorAll('#config-sheet-names input').forEach(input => {
        const key = input.dataset.key;
        if (CONFIG.sheetNames[key]) input.value = CONFIG.sheetNames[key];
    });

    // Cargar usuarios
    renderUsersTable();

    // Parser settings
    const p = CONFIG.parser;
    setInputVal('parser-vehicle-min', p.vehicleMinDigits);
    setInputVal('parser-vehicle-max', p.vehicleMaxDigits);
    setInputVal('parser-part-min', p.partMinDigits);
    setInputVal('parser-part-max', p.partMaxDigits);
}

function renderUsersTable() {
    const users = DB.getUsers();
    const roleLabels = { admin: 'Administrador', encargado: 'Encargado', empleado: 'Empleado' };
    const tbody = document.getElementById('users-body');
    if (!tbody) return;

    if (users.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No hay usuarios registrados</td></tr>';
        return;
    }

    tbody.innerHTML = users.map((u) => {
        const isSelf = currentUser && u.email === currentUser.email;
        return `
    <tr>
      <td>
        <div style="font-weight:600;font-size:0.88rem">${escHtml(u.email)}</div>
        ${isSelf ? '<span style="font-size:0.72rem;color:var(--blue-600);font-weight:600">← Tú</span>' : ''}
      </td>
      <td>${escHtml(u.name)}</td>
      <td><span class="badge ${u.role === 'admin' ? 'badge-purple' : u.role === 'encargado' ? 'badge-blue' : 'badge-slate'}">${roleLabels[u.role] || u.role}</span></td>
      <td>${escHtml(u.sucursal || '—')}</td>
      <td><span class="badge ${u.active ? 'badge-green' : 'badge-red'}">${u.active ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        <div class="user-actions-cell">
          <button class="btn btn-ghost btn-sm" title="Editar" onclick="openUserModal('${escHtml(u.email)}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Editar
          </button>
          <button class="btn btn-ghost btn-sm" title="Cambiar contraseña" onclick="openPwdModal('${escHtml(u.email)}','${escHtml(u.name)}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Contraseña
          </button>
          ${!isSelf ? `<button class="btn btn-sm ${u.active ? 'btn-danger-ghost' : 'btn-ghost'}" onclick="toggleUserActive('${escHtml(u.email)}')">${u.active ? 'Desactivar' : 'Activar'}</button>` : ''}
        </div>
      </td>
    </tr>
  `;
    }).join('');
}

// ---- Open user modal (create or edit) ----
function openUserModal(emailToEdit) {
    const modal = document.getElementById('user-modal');
    const form = document.getElementById('user-form');
    const errorEl = document.getElementById('user-modal-error');
    const modeInput = document.getElementById('user-modal-mode');
    const emailOrigInput = document.getElementById('user-modal-email-orig');
    const pwdSection = document.getElementById('um-password-section');
    const activeSection = document.getElementById('um-active-section');
    const submitBtn = document.getElementById('user-modal-submit');
    const titleEl = document.getElementById('user-modal-title');

    form.reset();
    errorEl.style.display = 'none';

    if (emailToEdit) {
        // Edit mode
        const users = DB.getUsers();
        const user = users.find(u => u.email === emailToEdit);
        if (!user) return;

        modeInput.value = 'edit';
        emailOrigInput.value = emailToEdit;
        titleEl.textContent = 'Editar usuario';
        submitBtn.textContent = 'Guardar cambios';

        document.getElementById('um-name').value = user.name;
        document.getElementById('um-email').value = user.email;
        document.getElementById('um-role').value = user.role;
        document.getElementById('um-sucursal').value = user.sucursal || 'Todas';
        document.getElementById('um-active').checked = user.active;
        activeSection.style.display = 'block';
        pwdSection.style.display = 'none'; // password changed via separate modal

        // Disable email field if editing self
        document.getElementById('um-email').disabled = (currentUser && user.email === currentUser.email);
    } else {
        // Create mode
        modeInput.value = 'create';
        emailOrigInput.value = '';
        titleEl.textContent = 'Nuevo usuario';
        submitBtn.textContent = 'Crear usuario';
        activeSection.style.display = 'none';
        pwdSection.style.display = 'block';
        document.getElementById('um-email').disabled = false;
        document.getElementById('um-password').required = true;
        document.getElementById('um-password2').required = true;
    }

    modal.style.display = 'flex';
}

// ---- Save user (create or edit) ----
function saveUser(e) {
    e.preventDefault();
    const errorEl = document.getElementById('user-modal-error');
    const mode = document.getElementById('user-modal-mode').value;
    const emailOrig = document.getElementById('user-modal-email-orig').value;

    const name = document.getElementById('um-name').value.trim();
    const email = document.getElementById('um-email').value.trim().toLowerCase();
    const role = document.getElementById('um-role').value;
    const sucursal = document.getElementById('um-sucursal').value;
    const pwd = document.getElementById('um-password').value;
    const pwd2 = document.getElementById('um-password2').value;
    const active = document.getElementById('um-active').checked;

    errorEl.style.display = 'none';

    if (!name || !email || !role) {
        errorEl.textContent = 'Rellena todos los campos obligatorios.';
        errorEl.style.display = 'flex';
        return;
    }

    const users = DB.getUsers();

    if (mode === 'create') {
        if (!pwd || pwd.length < 4) {
            errorEl.textContent = 'La contraseña debe tener al menos 4 caracteres.';
            errorEl.style.display = 'flex';
            return;
        }
        if (pwd !== pwd2) {
            errorEl.textContent = 'Las contraseñas no coinciden.';
            errorEl.style.display = 'flex';
            return;
        }
        // Check email unique
        if (users.find(u => u.email.toLowerCase() === email)) {
            errorEl.textContent = 'Ya existe un usuario con ese email.';
            errorEl.style.display = 'flex';
            return;
        }
        users.push({ email, name, password: pwd, role, sucursal, active: true });
        localStorage.setItem(DB.usersKey, JSON.stringify(users));
        document.getElementById('user-modal').style.display = 'none';
        renderUsersTable();
        showToast(`Usuario ${name} creado correctamente.`, 'success');

    } else {
        // Edit
        const user = users.find(u => u.email.toLowerCase() === emailOrig.toLowerCase());
        if (!user) return;

        // If email changed (not self), check uniqueness
        const newEmail = document.getElementById('um-email').disabled ? emailOrig : email;
        if (newEmail !== emailOrig && users.find(u => u.email.toLowerCase() === newEmail)) {
            errorEl.textContent = 'Ya existe un usuario con ese email.';
            errorEl.style.display = 'flex';
            return;
        }
        user.name = name;
        user.email = newEmail;
        user.role = role;
        user.sucursal = sucursal;
        user.active = active;

        localStorage.setItem(DB.usersKey, JSON.stringify(users));
        // Update session if self
        if (currentUser && currentUser.email === emailOrig) {
            currentUser.name = name;
            currentUser.role = role;
            currentUser.sucursal = sucursal;
            currentUser.active = active;
            sessionStorage.setItem('di_user', JSON.stringify(currentUser));
            updateUserUI();
        }
        document.getElementById('user-modal').style.display = 'none';
        renderUsersTable();
        showToast(`Usuario ${name} actualizado correctamente.`, 'success');
    }
}

// ---- Toggle user active/inactive ----
function toggleUserActive(email) {
    const users = DB.getUsers();
    const user = users.find(u => u.email === email);
    if (user) {
        user.active = !user.active;
        localStorage.setItem(DB.usersKey, JSON.stringify(users));
        renderUsersTable();
        showToast(`Usuario ${user.active ? 'activado' : 'desactivado'}: ${user.name}`, user.active ? 'success' : 'info');
    }
}

// ---- Change password modal ----
function openPwdModal(email, name) {
    document.getElementById('pwd-modal-email').value = email;
    document.getElementById('pwd-modal-user-name').textContent = name;
    document.getElementById('pwd-form').reset();
    document.getElementById('pwd-modal-error').style.display = 'none';
    document.getElementById('pwd-modal').style.display = 'flex';
}

function saveUserPassword(e) {
    e.preventDefault();
    const email = document.getElementById('pwd-modal-email').value;
    const pwd = document.getElementById('pwd-new').value;
    const pwd2 = document.getElementById('pwd-new2').value;
    const errorEl = document.getElementById('pwd-modal-error');
    errorEl.style.display = 'none';

    if (!pwd || pwd.length < 4) {
        errorEl.textContent = 'La contraseña debe tener al menos 4 caracteres.';
        errorEl.style.display = 'flex';
        return;
    }
    if (pwd !== pwd2) {
        errorEl.textContent = 'Las contraseñas no coinciden.';
        errorEl.style.display = 'flex';
        return;
    }

    const users = DB.getUsers();
    const user = users.find(u => u.email === email);
    if (!user) return;
    user.password = pwd;
    localStorage.setItem(DB.usersKey, JSON.stringify(users));
    document.getElementById('pwd-modal').style.display = 'none';
    showToast(`Contraseña de ${user.name} actualizada correctamente.`, 'success');
}

// =====================================================
// 11. MODAL DE DETALLE DE PEDIDO
// =====================================================
function openOrderModal(orderId) {
    const orders = DB.getOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const body = document.getElementById('modal-body');
    body.innerHTML = `
    <div class="modal-field">
      <span class="modal-field-label">Texto original (Col. A)</span>
      <span class="modal-field-value" style="font-family:monospace;background:var(--slate-50);padding:10px;border-radius:6px;border:1px solid var(--slate-200)">${escHtml(order.rawText || '—')}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="modal-field">
        <span class="modal-field-label">Nº Vehículo (Col. B)</span>
        <span class="modal-field-value" style="font-size:1.2rem;font-weight:700;color:var(--blue-700)">${order.vehicleNumber || '—'}</span>
      </div>
      <div class="modal-field">
        <span class="modal-field-label">Nº Pieza (Col. C)</span>
        <span class="modal-field-value" style="color:var(--purple-600);font-weight:600">${order.partNumbers && order.partNumbers.length ? order.partNumbers.join(' / ') : '—'}</span>
      </div>
    </div>
    <div class="modal-field">
      <span class="modal-field-label">Descripción (Col. D)</span>
      <span class="modal-field-value">${escHtml(order.description || '—')}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
      <div class="modal-field">
        <span class="modal-field-label">Sucursal</span>
        <span class="modal-field-value"><span class="badge badge-blue">${order.sucursal}</span></span>
      </div>
      <div class="modal-field">
        <span class="modal-field-label">Cliente (Col. I)</span>
        <span class="modal-field-value"><span class="badge ${order.cliente === 'Talleres' ? 'badge-purple' : 'badge-orange'}">${order.cliente}</span></span>
      </div>
      <div class="modal-field">
        <span class="modal-field-label">Hoja destino</span>
        <span class="modal-field-value"><span class="badge badge-slate">${order.sheetName}</span></span>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="modal-field">
        <span class="modal-field-label">Usuario</span>
        <span class="modal-field-value">${order.userName || order.userEmail || '—'}</span>
      </div>
      <div class="modal-field">
        <span class="modal-field-label">Fecha y hora</span>
        <span class="modal-field-value">${formatDateTime(order.createdAt)}</span>
      </div>
    </div>
    <div class="modal-field">
      <span class="modal-field-label">Estado del envío a Google Sheets</span>
      <span class="modal-field-value">
        <span class="badge ${order.status === 'enviado' ? 'badge-green' : 'badge-red'}">${order.status === 'enviado' ? '✓ Enviado correctamente' : '✗ Error al enviar'}</span>
        ${order.sheetResponse ? `<small style="display:block;margin-top:6px;color:var(--slate-500)">${order.sheetResponse}</small>` : ''}
        ${order.error ? `<small style="display:block;margin-top:6px;color:var(--red-600)">${order.error}</small>` : ''}
      </span>
    </div>
    <div class="modal-field">
      <span class="modal-field-label">Estado del pedido</span>
      <span class="modal-field-value">${workflowStatusBadge(order.workflowStatus || 'pendiente')}</span>
    </div>
    ${order.assignedTo ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="modal-field">
        <span class="modal-field-label">Asignado a (desmontador)</span>
        <span class="modal-field-value"><strong>${escHtml(order.assignedToName || order.assignedTo)}</strong></span>
      </div>
      <div class="modal-field">
        <span class="modal-field-label">Resultado del desmontaje</span>
        <span class="modal-field-value">${order.result === 'si' ? '<span class="badge badge-green">✓ Sí, sacado</span>' : order.result === 'no' ? '<span class="badge badge-red">✕ No sacado</span>' : '<span class="badge badge-slate">Pendiente</span>'}</span>
      </div>
    </div>
    ` : ''}
    ${order.observations ? `
    <div class="modal-field">
      <span class="modal-field-label">Observaciones del desmontador</span>
      <span class="modal-field-value" style="background:var(--slate-50);padding:10px;border-radius:6px;border:1px solid var(--slate-200)">${escHtml(order.observations)}</span>
    </div>
    ` : ''}
  `;

    document.getElementById('order-modal').style.display = 'flex';
}

// =====================================================
// 11b. ASIGNACIÓN DE PEDIDOS
// =====================================================
function loadAsignacion() {
    let orders = DB.getOrders();
    // Ordenar: primero pendientes, luego asignados, luego completados
    const statusOrder = { pendiente: 0, asignado: 1, sacado: 2, 'no-sacado': 3 };
    orders.sort((a, b) => {
        const sa = statusOrder[a.workflowStatus || 'pendiente'];
        const sb = statusOrder[b.workflowStatus || 'pendiente'];
        if (sa !== sb) return sa - sb;
        return new Date(b.createdAt) - new Date(a.createdAt);
    });

    const desmontadores = DB.getDesmontadores();
    const tbody = document.getElementById('asignacion-body');
    if (!tbody) return;

    if (orders.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="8">No hay pedidos registrados</td></tr>';
        return;
    }

    tbody.innerHTML = orders.map(o => {
        const ws = o.workflowStatus || 'pendiente';
        const canAssign = ws === 'pendiente' || ws === 'asignado';
        const btnLabel = ws === 'asignado' ? 'Reasignar' : 'Asignar';
        const cdnClass = isCDN(o) ? ' cdn-order' : '';
        const cdnBadge = isCDN(o) ? '<span class="cdn-badge">CDN</span> ' : '';
        return `
        <tr class="${cdnClass}">
          <td style="text-align:center;padding:6px">
            ${o.photo
                ? `<img src="${o.photo}" onclick="event.stopPropagation();openPhotoModal('${o.photo}')" style="width:36px;height:36px;object-fit:cover;border-radius:4px;cursor:pointer;border:1px solid var(--slate-200)" title="Ver foto" />`
                : `<span style="color:var(--slate-300)">&mdash;</span>`}
          </td>
          <td><strong>${cdnBadge}${o.vehicleNumber || '&mdash;'}</strong></td>
          <td class="truncate" style="max-width:160px">${truncate(o.description || o.rawText, 35)}</td>
          <td><span class="badge badge-blue">${o.sucursal}</span></td>
          <td><span class="badge ${o.cliente === 'Talleres' ? 'badge-purple' : 'badge-orange'}">${o.cliente}</span></td>
          <td><small>${o.userName || o.userEmail || '&mdash;'}</small></td>
          <td>${workflowStatusBadge(ws)}</td>
          <td>
            <small>${o.assignedToName || '&mdash;'}</small>
            ${o.tiempoTotal != null ? `<br><small style="color:var(--slate-500)">${o.tiempoTotal} min</small>` : ''}
          </td>
          <td>
            ${canAssign
                ? `<button class="btn btn-primary btn-sm" onclick="openAssignModal('${o.id}')">${btnLabel}</button>`
                : `<span style="color:var(--slate-400);font-size:0.8rem">Completado</span>`}
          </td>
        </tr>`;
    }).join('');
}

let _assigningOrderId = null;

function openAssignModal(orderId) {
    console.log("Abriendo modal para asignar pedido:", orderId);
    _assigningOrderId = orderId;
    const desmontadores = DB.getDesmontadores();
    const select = document.getElementById('assign-select');
    if (!select) return;

    // Find current assignment
    const order = DB.getOrders().find(o => o.id === orderId);
    if (!order) return;

    const info = document.getElementById('assign-order-info');
    if (info) {
        info.innerHTML = `
            <div style="font-size:0.85rem;color:var(--slate-500);margin-bottom:4px">ID: ${order.id}</div>
            <div style="font-weight:600;color:var(--blue-700);margin-bottom:4px">Nº Vehículo: ${order.vehicleNumber || '\u2014'}</div>
            <div style="font-size:0.9rem;color:var(--slate-700);margin-bottom:8px">${escHtml(order.description || order.rawText || '\u2014')}</div>
            ${order.photo ? `<div style="margin:8px 0"><img src="${order.photo}" onclick="openPhotoModal('${order.photo}')" style="max-width:100%;max-height:120px;border-radius:8px;cursor:pointer;object-fit:cover;border:1px solid var(--slate-200)" title="Ver foto" /></div>` : ''}
            <div style="font-size:0.85rem;color:var(--slate-500)">Asignado actual: <strong>${escHtml(order.assignedToName || 'Nadie')}</strong></div>
        `;
    }

    if (desmontadores.length === 0) {
        select.innerHTML = '<option value="">No hay desmontadores disponibles</option>';
        select.disabled = true;
    } else {
        select.disabled = false;
        select.innerHTML = '<option value="">— Selecciona un desmontador —</option>' +
            desmontadores.map(d => `<option value="${escHtml(d.email)}" ${order.assignedTo === d.email ? 'selected' : ''}>${escHtml(d.name)}</option>`).join('');
    }

    const titleEl = document.getElementById('assign-modal-title');
    if (titleEl) titleEl.textContent = order.assignedTo ? 'Reasignar pedido' : 'Asignar pedido';

    document.getElementById('assign-modal').style.display = 'flex';
}

function confirmAssign() {
    const select = document.getElementById('assign-select');
    const email = select ? select.value : '';
    if (!email) { showToast('Selecciona un desmontador.', 'error'); return; }

    const users = DB.getUsers();
    const desmontador = users.find(u => u.email === email);
    if (!desmontador) return;

    const updated = DB.updateOrder(_assigningOrderId, {
        workflowStatus: 'asignado',
        assignedTo: desmontador.email,
        assignedToName: desmontador.name,
        assignedAt: new Date().toISOString()
    });
    console.log("Pedido asignado:", _assigningOrderId, "a", desmontador.email);

    document.getElementById('assign-modal').style.display = 'none';
    showToast(`Pedido asignado a ${desmontador.name}`, 'success');
    
    if (updated) {
        syncAssignToSheets(updated);
    }
    
    // Refrescar interfaces relevantes
    loadAsignacion();
    loadHistory();
    loadDesmontador();
}

async function syncAssignToSheets(order) {
    const scriptUrl = getScriptUrl();
    if (!scriptUrl) return;

    if (!order.sheetName || (!order.sheetRow && !order.rawText)) return;

    const payload = {
        action: 'assignOrder',
        sheet: order.sheetName,
        row: order.sheetRow || null,
        rawText: order.rawText || null,
        assignedToName: order.assignedToName || ''
    };

    try {
        fetch(scriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload),
            redirect: 'follow',
        });
    } catch (err) {
        console.error("Failed assigning to Sheets:", err);
    }
}

// =====================================================
// 11c. PANEL DEL DESMONTADOR
// =====================================================
function loadDesmontador() {
    if (!currentUser) return;
    const allOrders = DB.getOrders();
    const myOrders = allOrders.filter(o => o.assignedTo === currentUser.email);

    const now = new Date();
    const limit12h = new Date(now.getTime() - 12 * 60 * 60 * 1000);

    // KPIs basados en últimas 12h para completados
    const pending = myOrders.filter(o => o.workflowStatus === 'asignado').length;
    const sacadas12h = myOrders.filter(o => o.result === 'si' && o.completedAt && new Date(o.completedAt) >= limit12h).length;
    const noSacadas12h = myOrders.filter(o => o.result && o.result !== 'si' && o.completedAt && new Date(o.completedAt) >= limit12h).length;
    setEl('dsm-kpi-pending', pending);
    setEl('dsm-kpi-sacadas', sacadas12h);
    setEl('dsm-kpi-no-sacadas', noSacadas12h);

    // Pending orders (todos los asignados sin completar)
    const pendingOrders = myOrders.filter(o => o.workflowStatus === 'asignado');
    const pendingContainer = document.getElementById('dsm-pending-list');
    if (pendingContainer) {
        if (pendingOrders.length === 0) {
            pendingContainer.innerHTML = '<div class="dsm-empty">No tienes pedidos asignados pendientes</div>';
        } else {
            pendingContainer.innerHTML = pendingOrders.map(o => `
            <div class="dsm-order-card">
              <div class="dsm-order-header">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span class="dsm-vehicle">${o.vehicleNumber || '—'}</span>
                  ${o.partNumbers && o.partNumbers.length ? `<span class="dsm-part">${o.partNumbers.join(', ')}</span>` : ''}
                  ${o.urgent ? `<span class="badge badge-red">URGENTE</span>` : ''}
                </div>
                <span class="badge badge-blue">${o.sucursal}</span>
              </div>
              ${o.photo ? `<div style="margin:8px 0"><img src="${o.photo}" onclick="openPhotoModal('${o.photo}')" style="max-width:100%;max-height:140px;border-radius:8px;cursor:pointer;object-fit:cover;border:1px solid var(--slate-200)" /></div>` : ''}
              <p class="dsm-desc">${escHtml(o.description || o.rawText || '—')}</p>
              <div class="dsm-order-meta">
                <small>${o.userName || '—'} · ${formatDate(o.createdAt)}</small>
                <small>${o.cliente}</small>
              </div>
              <div class="dsm-result-btns" style="display:block;">
                <button class="btn btn-primary result-btn" style="width:100%" onclick="openResultModal('${o.id}')">Marcar resultado de desmontaje</button>
              </div>
            </div>`).join('');
        }
    }

    // History: solo completados en últimas 12 horas
    const completedOrders = myOrders
        .filter(o => o.result !== null && o.result !== undefined && o.completedAt && new Date(o.completedAt) >= limit12h)
        .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    const histContainer = document.getElementById('dsm-history-body');
    if (histContainer) {
        if (completedOrders.length === 0) {
            histContainer.innerHTML = '<tr class="empty-row"><td colspan="6">Sin pedidos completados en las últimas 12 horas</td></tr>';
        } else {
            const resultLabel = (r) => {
                const map = { si: '<span class="badge badge-green">✓ Sacado</span>', no: '<span class="badge badge-red">✕ No sacado</span>', 'no-ubi': '<span class="badge badge-orange">No ubi</span>', 'no-tiene': '<span class="badge badge-yellow">No tiene</span>', rota: '<span class="badge badge-red">Rota</span>' };
                return map[r] || `<span class="badge badge-slate">${r}</span>`;
            };
            histContainer.innerHTML = completedOrders.map(o => `
            <tr>
              <td style="text-align:center;padding:6px">
                ${o.photo ? `<img src="${o.photo}" onclick="openPhotoModal('${o.photo}')" style="width:36px;height:36px;object-fit:cover;border-radius:4px;cursor:pointer;border:1px solid var(--slate-200)" />` : '<span style="color:var(--slate-300)">—</span>'}
              </td>
              <td><strong>${o.vehicleNumber || '—'}</strong></td>
              <td class="truncate" style="max-width:180px">${truncate(o.description || o.rawText, 40)}</td>
              <td><span class="badge badge-blue">${o.sucursal}</span></td>
              <td>${resultLabel(o.result)}</td>
              <td>${formatDate(o.completedAt)}</td>
            </tr>`).join('');
        }
    }
}

let _resultOrderId = null;
let _resultValue = null;

function openResultModal(orderId) {
    _resultOrderId = orderId;
    const obs = document.getElementById('result-observations');
    if (obs) obs.value = '';
    const sel = document.getElementById('result-select-value');
    if (sel) sel.value = 'si';
    const confirmBtn = document.getElementById('result-confirm-btn');
    if (confirmBtn) {
        confirmBtn.className = 'btn btn-success';
    }
    document.getElementById('result-modal').style.display = 'flex';
}

async function confirmResult() {
    const _resultValue = document.getElementById('result-select-value')?.value || 'si';
    const obs = (document.getElementById('result-observations')?.value || '').trim();
    const newWS = ['si','rota'].includes(_resultValue) ? 'sacado' : 'no-sacado';

    const now = new Date();
    const order = DB.getOrders().find(o => o.id === _resultOrderId);
    let tiempoTotal = null;
    let tiempoStr = '—';
    if (order && order.assignedAt) {
        tiempoTotal = Math.round((now.getTime() - new Date(order.assignedAt).getTime()) / 60000);
        tiempoStr = `${tiempoTotal} min`;
    }

    const updated = DB.updateOrder(_resultOrderId, {
        workflowStatus: newWS,
        result: _resultValue,
        observations: obs || null,
        completedAt: now.toISOString(),
        tiempoTotal: tiempoTotal
    });

    document.getElementById('result-modal').style.display = 'none';

    if (updated) {
        // Update Google Sheets col F
        await updateSheetResultColumn(updated);
    }

    showToast(_resultValue === 'si' ? '¡Pieza marcada como sacada!' : 'Pieza marcada, resultado guardado.', 'success');
    loadDesmontador();
}

async function updateSheetResultColumn(order) {
    const scriptUrl = getScriptUrl();
    if (!scriptUrl) return;

    if (!order.sheetName || (!order.sheetRow && !order.rawText)) {
        showToast('Error: El pedido está incompleto y no se puede actualizar el resultado.', 'error');
        return;
    }

    const valueMap = {
        'si': 'Sí',
        'no': 'No',
        'no-ubi': 'No ubi',
        'no-tiene': 'No tiene',
        'rota': 'Rota'
    };
    const value = valueMap[order.result] || 'Sí';

    const payload = {
        action: 'updateRow',
        sheet: order.sheetName,
        row: order.sheetRow || null,
        rawText: order.rawText || null,
        value,
        observations: order.observations || '',
        tiempoTotal: order.tiempoTotal != null ? `${order.tiempoTotal} min` : ''
    };

    try {
        const res = await fetch(scriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload),
            redirect: 'follow',
        });
        const json = await res.json();
        if (!json.success) {
            console.error('Sheets col F update failed:', json.error);
            showToast('Error en el código de Google Sheets: ' + json.error, 'error');
        } else {
            console.log('Sheet update success:', json.message);
        }
    } catch (err) {
        console.error('Error updating Sheets col F:', err.message);
        showToast('Error de red al actualizar Sheets: ' + err.message, 'error');
    }
}

// =====================================================
// 12. TOAST NOTIFICATIONS
// =====================================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
        success: '<polyline points="20 6 9 17 4 12"/>',
        error: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
        info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    };

    toast.innerHTML = `
    <div class="toast-icon">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">${icons[type] || icons.info}</svg>
    </div>
    <span>${escHtml(message)}</span>
  `;

    container.appendChild(toast);

    const remove = () => {
        toast.classList.add('toast-closing');
        setTimeout(() => toast.remove(), 200);
    };

    toast.addEventListener('click', remove);
    setTimeout(remove, 4000);
}

// =====================================================
// 13. SIDEBAR MÓVIL
// =====================================================
function openMobileSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeMobileSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('active');
    document.body.style.overflow = '';
}

// =====================================================
// 14. HELPERS
// =====================================================
function setEl(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}
function setInputVal(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
}
function truncate(str, n) {
    return str && str.length > n ? str.slice(0, n) + '…' : (str || '');
}
function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatDateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// =====================================================
// 14b. CONTROL DE PEDIDOS
// =====================================================
function loadControl() {
    const orders = DB.getOrders();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // KPIs
    const pending = orders.filter(o => o.workflowStatus === 'pendiente').length;
    const assigned = orders.filter(o => o.workflowStatus === 'asignado').length;
    const sacadasHoy = orders.filter(o => o.result === 'si' && o.completedAt && new Date(o.completedAt) >= startOfDay).length;
    const today = orders.filter(o => new Date(o.createdAt) >= startOfDay).length;

    setEl('ctrl-kpi-pending', pending);
    setEl('ctrl-kpi-assigned', assigned);
    setEl('ctrl-kpi-sacadas', sacadasHoy);
    setEl('ctrl-kpi-today', today);

    // Pendientes por sucursal
    const sucursales = ['Tabares', 'Orotava', 'S/C', 'Icod', 'Granadilla', 'Islas'];
    const branchPending = {};
    orders.filter(o => o.workflowStatus === 'pendiente').forEach(o => {
        branchPending[o.sucursal] = (branchPending[o.sucursal] || 0) + 1;
    });
    const branchContainer = document.getElementById('ctrl-branch-list');
    if (branchContainer) {
        branchContainer.innerHTML = sucursales.map(s => {
            const count = branchPending[s] || 0;
            const color = count > 10 ? 'var(--red-500)' : count > 5 ? 'var(--orange-500)' : 'var(--brand-600)';
            return `<div class="ctrl-branch-card">
                <span class="ctrl-branch-count" style="color:${color}">${count}</span>
                <span class="ctrl-branch-name">${s}</span>
            </div>`;
        }).join('');
    }

    // Tiempo hace 12 horas
    const twelveHoursAgo = new Date(now.getTime() - (12 * 60 * 60 * 1000));

    // Estado desmontadores
    const users = DB.getUsers().filter(u => u.role === 'desmontador' && u.active);
    const dsmStats = {};
    users.forEach(u => {
        dsmStats[u.email] = { name: u.name, pending: 0, sacados: 0, noSacados: 0, enProceso: false, pendingOrders: [] };
    });
    
    orders.forEach(o => {
        if (!o.assignedTo || !dsmStats[o.assignedTo]) return;
        
        if (o.workflowStatus === 'asignado') { 
            dsmStats[o.assignedTo].pending++; 
            dsmStats[o.assignedTo].enProceso = true; 
            dsmStats[o.assignedTo].pendingOrders.push(o);
        }
        
        // Solo contar los completados en las últimas 12 horas
        if (o.completedAt) {
            const completedTime = new Date(o.completedAt);
            if (completedTime >= twelveHoursAgo) {
                if (o.result === 'si') dsmStats[o.assignedTo].sacados++;
                if (o.result && o.result !== 'si') dsmStats[o.assignedTo].noSacados++;
            }
        }
    });
    
    const dsmBody = document.getElementById('ctrl-dismantlers-body');
    if (dsmBody) {
        const dsmList = Object.entries(dsmStats).map(([email, stats]) => ({ email, ...stats }));
        if (dsmList.length === 0) {
            dsmBody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--slate-400)">No hay desmontadores registrados</td></tr>';
        } else {
            dsmBody.innerHTML = dsmList.map(d => {
                const hasPending = d.pendingOrders.length > 0;
                
                let pendingHtml = '';
                if (hasPending) {
                    pendingHtml = `
                    <tr id="pending-row-${d.email.replace(/[@.]/g, '-')}" class="pending-subrow" style="display:none; background-color: var(--slate-50);">
                        <td colspan="6" style="padding: 12px 16px;">
                            <div style="font-size: 0.85rem; color: var(--slate-600); margin-bottom: 8px; font-weight: 600;">Pedidos en proceso:</div>
                            <div style="display:flex; flex-direction: column; gap: 6px;">
                                ${d.pendingOrders.map(po => `
                                    <div style="display:flex; justify-content: space-between; align-items: center; padding: 8px; background: white; border: 1px solid var(--slate-200); border-radius: 4px;">
                                        <div>
                                            <strong style="color:var(--brand-700)">${po.vehicleNumber || '—'}</strong>
                                            <span style="color:var(--slate-500); margin-left: 6px;">${truncate(po.description || po.rawText, 40)}</span>
                                        </div>
                                        <div style="display:flex; gap:8px;">
                                            <span class="badge badge-blue">${po.sucursal}</span>
                                            <span style="color:var(--slate-400); font-size: 0.8rem;">${po.assignedAt ? formatDateTime(po.assignedAt) : '—'}</span>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </td>
                    </tr>
                    `;
                }
                
                return `
                <tr ${hasPending ? `style="cursor:pointer;" onclick="toggleDismantlerPending('${d.email.replace(/[@.]/g, '-')}')"` : ''}>
                    <td style="text-align:center; width: 40px; color: var(--slate-400);">
                        ${hasPending ? `<svg id="icon-${d.email.replace(/[@.]/g, '-')}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition: transform 0.2s;"><polyline points="9 18 15 12 9 6"></polyline></svg>` : ''}
                    </td>
                    <td><strong>${d.name}</strong></td>
                    <td style="text-align:center">${d.pending > 0 ? `<span class="badge badge-orange">${d.pending}</span>` : '<span style="color:var(--slate-300)">0</span>'}</td>
                    <td style="text-align:center">${d.sacados > 0 ? `<span class="badge badge-green">${d.sacados}</span>` : '<span style="color:var(--slate-300)">0</span>'}</td>
                    <td style="text-align:center">${d.noSacados > 0 ? `<span class="badge badge-red">${d.noSacados}</span>` : '<span style="color:var(--slate-300)">0</span>'}</td>
                    <td style="text-align:center">${d.enProceso ? '<span class="badge badge-blue">Activo</span>' : '<span style="color:var(--slate-400);font-size:0.8rem">Libre</span>'}</td>
                </tr>
                ${pendingHtml}
                `;
            }).join('');
        }
    }

    // Actividad reciente (solo últimas 12 horas)
    const recentActivity = [];
    orders.forEach(o => {
        if (o.assignedAt && new Date(o.assignedAt) >= twelveHoursAgo) {
            recentActivity.push({ time: o.assignedAt, text: `Pedido ${o.vehicleNumber || o.id.slice(-6)} asignado a ${o.assignedToName || '—'}`, type: 'assign' });
        }
        if (o.completedAt && new Date(o.completedAt) >= twelveHoursAgo) {
            recentActivity.push({ time: o.completedAt, text: `Pedido ${o.vehicleNumber || o.id.slice(-6)} completado (${o.result === 'si' ? 'Sacado' : 'No sacado'})`, type: o.result === 'si' ? 'done' : 'fail' });
        }
    });
    recentActivity.sort((a, b) => new Date(b.time) - new Date(a.time));
    const top20 = recentActivity.slice(0, 20);

    const feedEl = document.getElementById('ctrl-activity-feed');
    if (feedEl) {
        if (top20.length === 0) {
            feedEl.innerHTML = '<p style="color:var(--slate-400);text-align:center;padding:20px">Sin actividad en las últimas 12 horas</p>';
        } else {
            const iconMap = { 
                assign: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--blue-500)" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>', 
                done: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green-500)" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>', 
                fail: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--red-500)" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' 
            };
            feedEl.innerHTML = top20.map(a => `
            <div class="activity-item">
                <span class="activity-icon" style="display:flex;align-items:center;justify-content:center;background:var(--slate-50);width:28px;height:28px;border-radius:50%;border:1px solid var(--slate-200);">${iconMap[a.type]}</span>
                <span class="activity-text">${a.text}</span>
                <span class="activity-time">${formatDateTime(a.time)}</span>
            </div>`).join('');
        }
    }
}

function toggleDismantlerPending(emailId) {
    const row = document.getElementById(`pending-row-${emailId}`);
    const icon = document.getElementById(`icon-${emailId}`);
    
    if (row && icon) {
        if (row.style.display === 'none') {
            row.style.display = 'table-row';
            icon.style.transform = 'rotate(90deg)';
        } else {
            row.style.display = 'none';
            icon.style.transform = 'rotate(0)';
        }
    }
}

// =====================================================
// 15. EVENT LISTENERS
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    // Seed demo data
    seedDemoData();

    // Init auth
    initAuth();

    // ---- MOBILE SIDEBAR ----
    document.getElementById('menu-open-btn')?.addEventListener('click', openMobileSidebar);
    document.getElementById('sidebar-toggle')?.addEventListener('click', closeMobileSidebar);
    document.getElementById('sidebar-overlay')?.addEventListener('click', closeMobileSidebar);

    // ---- LOGIN ----
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const btn = document.getElementById('login-btn');
        const btnText = btn.querySelector('.btn-text');
        const spinner = btn.querySelector('.btn-spinner');
        const errorEl = document.getElementById('login-error');

        btn.disabled = true;
        btnText.style.display = 'none';
        spinner.style.display = 'block';
        errorEl.style.display = 'none';

        await sleep(800);

        if (login(email, password)) {
            showApp();
        } else {
            errorEl.textContent = 'Email o contraseña incorrectos. Contacta con el administrador.';
            errorEl.style.display = 'flex';
            btn.disabled = false;
            btnText.style.display = 'inline';
            spinner.style.display = 'none';
        }
    });

    document.getElementById('btn-google-login').addEventListener('click', () => {
        showToast('Google OAuth requiere configuración de servidor. Usa el login estándar en demo.', 'info');
    });

    // ---- LOGOUT ----
    document.getElementById('btn-logout').addEventListener('click', logout);

    // ---- NAV ----
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(item.dataset.page);
        });
    });

    // ---- ORDER FORM ----
    document.getElementById('order-text').addEventListener('input', (e) => {
        setEl('char-count', e.target.value.length);
        // Ocultar preview si el usuario cambia el texto
        if (previewVisible) {
            document.getElementById('order-preview').style.display = 'none';
            previewVisible = false;
        }
    });

    document.getElementById('btn-preview').addEventListener('click', showPreview);
    document.getElementById('order-form').addEventListener('submit', submitOrder);

    document.getElementById('btn-new-order').addEventListener('click', () => {
        document.getElementById('order-success').style.display = 'none';
        document.querySelector('.order-form-card').style.display = 'block';
        resetOrderForm();
    });

    // ---- HISTORY FILTERS ----
    document.getElementById('filter-sucursal').addEventListener('change', e => {
        loadHistory(e.target.value, document.getElementById('filter-cliente').value, document.getElementById('filter-search').value);
    });
    document.getElementById('filter-cliente').addEventListener('change', e => {
        loadHistory(document.getElementById('filter-sucursal').value, e.target.value, document.getElementById('filter-search').value);
    });
    document.getElementById('filter-search').addEventListener('input', e => {
        loadHistory(document.getElementById('filter-sucursal').value, document.getElementById('filter-cliente').value, e.target.value);
    });

    // ---- STATS PERIOD ----
    const statsPeriod = document.getElementById('stats-period');
    if (statsPeriod) statsPeriod.addEventListener('change', loadStats);

    // ---- EXPORT CSV ----
    const exportBtn = document.getElementById('btn-export-csv');
    if (exportBtn) exportBtn.addEventListener('click', exportCSV);

    // ---- MODAL ----
    document.getElementById('modal-close').addEventListener('click', () => {
        document.getElementById('order-modal').style.display = 'none';
    });
    document.getElementById('order-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('order-modal')) {
            document.getElementById('order-modal').style.display = 'none';
        }
    });

    // ---- CONFIG ----
    const saveSheetsBtn = document.getElementById('btn-save-sheets');
    if (saveSheetsBtn) {
        saveSheetsBtn.addEventListener('click', () => {
            document.querySelectorAll('#config-sheet-names input').forEach(input => {
                const key = input.dataset.key;
                CONFIG.sheetNames[key] = input.value.trim() || key;
            });
            showToast('Nombres de hojas guardados correctamente.', 'success');
        });
    }

    // ---- SCRIPT URL (Google Apps Script) ----
    const saveScriptUrlBtn = document.getElementById('btn-save-script-url');
    if (saveScriptUrlBtn) {
        saveScriptUrlBtn.addEventListener('click', () => {
            const url = (document.getElementById('config-script-url')?.value || '').trim();
            if (url && !url.startsWith('https://script.google.com')) {
                showToast('La URL debe comenzar con https://script.google.com', 'error');
                return;
            }
            setScriptUrl(url);
            const statusEl = document.getElementById('sheets-connection-status');
            if (statusEl) {
                statusEl.style.display = url ? 'block' : 'none';
                statusEl.innerHTML = url
                    ? '<span class="badge badge-green">&#10003; URL guardada correctamente</span>'
                    : '';
            }
            showToast(url ? 'URL guardada. Los pedidos se enviarán a Google Sheets.' : 'URL eliminada.', 'success');
        });
    }

    const testConnectionBtn = document.getElementById('btn-test-connection');
    if (testConnectionBtn) {
        testConnectionBtn.addEventListener('click', async () => {
            const url = getScriptUrl();
            const statusEl = document.getElementById('sheets-connection-status');
            if (!url) { showToast('Primero guarda la URL del script.', 'error'); return; }
            testConnectionBtn.disabled = true;
            testConnectionBtn.textContent = 'Probando\u2026';
            if (statusEl) { statusEl.style.display = 'block'; statusEl.innerHTML = '<span style="color:var(--slate-500);font-size:0.82rem">\u23f3 Probando\u2026</span>'; }
            try {
                await fetch(url, {
                    method: 'POST', mode: 'no-cors',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({ rawText: 'TEST', sucursal: 'Tabares', cliente: 'Particulares', userName: 'Test', userEmail: 'test@test.com', _isTest: true }),
                });
                if (statusEl) statusEl.innerHTML = '<span class="badge badge-green">&#10003; Script alcanzado correctamente</span>';
                showToast('Conexi\u00f3n OK. Verifica que el acceso sea "Cualquiera" en Apps Script.', 'success');
            } catch (err) {
                if (statusEl) statusEl.innerHTML = '<span class="badge badge-red">&#10007; Error: ' + escHtml(err.message) + '</span>';
                showToast('No se pudo conectar: ' + err.message, 'error');
            }
            testConnectionBtn.disabled = false;
            testConnectionBtn.textContent = 'Probar conexi\u00f3n';
        });
    }

    const saveParserBtn = document.getElementById('btn-save-parser');
    if (saveParserBtn) {
        saveParserBtn.addEventListener('click', () => {
            CONFIG.parser.vehicleMinDigits = parseInt(document.getElementById('parser-vehicle-min').value) || 5;
            CONFIG.parser.vehicleMaxDigits = parseInt(document.getElementById('parser-vehicle-max').value) || 6;
            CONFIG.parser.partMinDigits = parseInt(document.getElementById('parser-part-min').value) || 6;
            CONFIG.parser.partMaxDigits = parseInt(document.getElementById('parser-part-max').value) || 7;
            showToast('Configuración del parser guardada.', 'success');
        });
    }

    // ---- USER MODAL ----
    document.getElementById('user-form').addEventListener('submit', saveUser);
    document.getElementById('user-modal-close').addEventListener('click', () => {
        document.getElementById('user-modal').style.display = 'none';
    });
    document.getElementById('user-modal-cancel').addEventListener('click', () => {
        document.getElementById('user-modal').style.display = 'none';
    });
    document.getElementById('user-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('user-modal')) {
            document.getElementById('user-modal').style.display = 'none';
        }
    });
    // Toggle active text
    document.getElementById('um-active').addEventListener('change', (e) => {
        document.getElementById('um-active-text').textContent = e.target.checked ? 'Usuario activo' : 'Usuario desactivado';
    });

    // ---- PASSWORD MODAL ----
    document.getElementById('pwd-form').addEventListener('submit', saveUserPassword);
    document.getElementById('pwd-modal-close').addEventListener('click', () => {
        document.getElementById('pwd-modal').style.display = 'none';
    });
    document.getElementById('pwd-modal-cancel').addEventListener('click', () => {
        document.getElementById('pwd-modal').style.display = 'none';
    });
    document.getElementById('pwd-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('pwd-modal')) {
            document.getElementById('pwd-modal').style.display = 'none';
        }
    });

    // ---- ASSIGN MODAL ----
    const assignModal = document.getElementById('assign-modal');
    if (assignModal) {
        document.getElementById('assign-modal-close')?.addEventListener('click', () => { assignModal.style.display = 'none'; });
        document.getElementById('assign-modal-cancel')?.addEventListener('click', () => { assignModal.style.display = 'none'; });
        document.getElementById('assign-confirm-btn')?.addEventListener('click', confirmAssign);
        assignModal.addEventListener('click', (e) => { if (e.target === assignModal) assignModal.style.display = 'none'; });
    }

    // ---- RESULT MODAL ----
    const resultModal = document.getElementById('result-modal');
    if (resultModal) {
        document.getElementById('result-modal-close')?.addEventListener('click', () => { resultModal.style.display = 'none'; });
        document.getElementById('result-modal-cancel')?.addEventListener('click', () => { resultModal.style.display = 'none'; });
        document.getElementById('result-confirm-btn')?.addEventListener('click', confirmResult);
        resultModal.addEventListener('click', (e) => { if (e.target === resultModal) resultModal.style.display = 'none'; });
    }
});
