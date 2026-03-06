// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyCEdnLpfnidHwW0ITNbGwQY1JkMihlsVFo",
    authDomain: "portal-de-demandas.firebaseapp.com",
    projectId: "portal-de-demandas",
    storageBucket: "portal-de-demandas.firebasestorage.app",
    messagingSenderId: "462772597904",
    appId: "1:462772597904:web:809708ecf323339b209415",
    measurementId: "G-DQ1Y92V6PR"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let tasks = [];
let csClients = [];

// Realtime listeners for Firestore
db.collection('tasks').onSnapshot((snapshot) => {
    tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderBoard();
    if (typeof renderMaintenanceBoard === 'function') renderMaintenanceBoard();
    if (typeof updateBadgePreventivas === 'function') updateBadgePreventivas();
});

db.collection('csClients').onSnapshot((snapshot) => {
    csClients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (typeof renderCSBoard === 'function') renderCSBoard();
});

// Function to fetch demands from the new backend API
async function fetchDemandasDaAPI() {
    const syncButton = document.getElementById('btnSyncTiFlux');
    const syncIcon = syncButton?.querySelector('.icon-sync');
    const lastSyncLabel = document.getElementById('lastSyncTime');

    try {
        // Visual Feedback: Start Rotation & Disable Button
        if (syncIcon) syncIcon.classList.add('rotating');
        if (syncButton) syncButton.disabled = true;
        if (lastSyncLabel) lastSyncLabel.innerText = 'Sincronizando...';

        let response = await fetch('/api/demandas');
        if (!response.ok) {
            // Fallback para caso a Vercel esteja limpando o prefixo /api
            response = await fetch('/demandas');
        }
        if (!response.ok) {
            throw new Error('Falha ao buscar demandas do servidor');
        }
        const apiTasks = await response.json();

        // Busca estado atual do banco para garantir que não vamos sobrescrever conclusões recentes
        const currentSnap = await db.collection('tasks').get();
        const currentTasksMap = new Map();
        currentSnap.forEach(doc => currentTasksMap.set(doc.id, doc.data()));

        // Merge API tasks with local tasks (avoiding duplicates by ID, updating existing ones)
        if (apiTasks.length > 0) {
            let newTasksCount = 0;
            let updatedTasksCount = 0;
            let syncdItems = [];

            const batch = db.batch();
            let hasChanges = false;

            apiTasks.forEach(apiTask => {
                const localTask = currentTasksMap.get(apiTask.id);
                const isApiTaskCompleted = apiTask.status && apiTask.status.includes('Concluida');

                if (!localTask) {
                    // Se o chamado já vem fechado do TiFlux e não é uma Preventiva, não adicionamos como "Novo"
                    // para evitar poluir o portal com chamados que já foram resolvidos antes de entrarem aqui.
                    if (isApiTaskCompleted && apiTask.status !== 'Preventiva Concluida') {
                        return;
                    }

                    newTasksCount++;
                    const taskRef = db.collection('tasks').doc(apiTask.id);
                    batch.set(taskRef, apiTask);
                    hasChanges = true;
                    syncdItems.push({ number: apiTask.number || 'N/A', type: 'Novo', client: apiTask.cliente });
                } else {
                    // Proteção CRÍTICA contra sobrescrita de demandas já concluídas localmente
                    const isLocalCompleted = localTask.status && localTask.status.includes('Concluida');

                    // Se já está concluído localmente, só atualizamos campos auxiliares, mas mantemos o status concluído
                    if (isLocalCompleted) {
                        return;
                    }

                    // Se no TiFlux o chamado agora está concluído, mas no portal ainda está aberto
                    // nós permitimos a atualização para que ele mova para a aba de concluídos.
                    const hasDifferences = apiTask.status !== localTask.status ||
                        apiTask.desc !== localTask.desc ||
                        apiTask.prioridade !== localTask.prioridade ||
                        apiTask.responsavel !== localTask.responsavel ||
                        apiTask.cliente !== localTask.cliente ||
                        apiTask.quality !== localTask.quality ||
                        apiTask.closedAt !== localTask.closedAt ||
                        apiTask.createdAt !== localTask.createdAt ||
                        apiTask.date !== localTask.date;

                    if (hasDifferences) {
                        updatedTasksCount++;
                        const taskRef = db.collection('tasks').doc(apiTask.id);
                        batch.set(taskRef, apiTask, { merge: true });
                        hasChanges = true;
                        syncdItems.push({ number: apiTask.number || 'N/A', type: 'Atu.', client: apiTask.cliente });
                    }
                }
            });

            if (hasChanges) {
                await batch.commit();
            }

            // Atualiza hora da última sincronização
            const now = new Date();
            const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            if (lastSyncLabel) lastSyncLabel.innerText = timeStr;

            if (newTasksCount > 0 || updatedTasksCount > 0) {
                showSyncResultsModal(newTasksCount, updatedTasksCount, syncdItems);
                showToast(`TiFlux: ${newTasksCount} novos e ${updatedTasksCount} atualizados!`);
            } else {
                showToast('TiFlux verificado: sem novos chamados.');
            }
        } else {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            if (lastSyncLabel) lastSyncLabel.innerText = timeStr;
            showToast('Nenhum chamado encontrado no TiFlux no momento.');
        }
    } catch (error) {
        console.error('Erro de integração:', error);
        showToast('Erro ao sincronizar com TiFlux (Servidor offline?)');
        if (lastSyncLabel) lastSyncLabel.innerText = 'Erro ao sincronizar';
    } finally {
        // Visual Feedback: Stop Rotation & Enable Button
        if (syncIcon) syncIcon.classList.remove('rotating');
        if (syncButton) syncButton.disabled = false;
    }
}

// Sync Results Modal Logic
function showSyncResultsModal(newCount, updatedCount, items) {
    const modal = document.getElementById('syncResultsModal');
    const summary = document.getElementById('syncSummaryText');
    const list = document.getElementById('syncResultsList');

    summary.innerHTML = `Foram encontrados <strong>${newCount}</strong> novos chamados e <strong>${updatedCount}</strong> atualizados no TiFlux.`;

    list.innerHTML = items.map(item => `
        <div class="sync-item ${item.type === 'Novo' ? 'new' : 'updated'}">
            <div style="display: flex; flex-direction: column;">
                <span class="sync-item-number">#${item.number}</span>
                <span style="font-size: 0.75rem; color: var(--text-muted);">${item.client}</span>
            </div>
            <span class="sync-badge ${item.type === 'Novo' ? 'new' : 'updated'}">${item.type}</span>
        </div>
    `).join('');

    modal.classList.add('active');
}

const btnCloseSyncResults = document.getElementById('btnCloseSyncResults');
const btnOkSyncResults = document.getElementById('btnOkSyncResults');
const syncResultsModal = document.getElementById('syncResultsModal');

if (btnCloseSyncResults) btnCloseSyncResults.addEventListener('click', () => syncResultsModal.classList.remove('active'));
if (btnOkSyncResults) btnOkSyncResults.addEventListener('click', () => syncResultsModal.classList.remove('active'));
if (syncResultsModal) syncResultsModal.addEventListener('click', (e) => {
    if (e.target === syncResultsModal) syncResultsModal.classList.remove('active');
});

// DOM Elements Demandas
const btnNewTask = document.getElementById('btnNewTask');
const modal = document.getElementById('taskModal');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnSyncTiFlux = document.getElementById('btnSyncTiFlux');
const lastSyncTime = document.getElementById('lastSyncTime');
const btnToggleHeader = document.getElementById('btnToggleHeader');
const collapsibleHeader = document.getElementById('collapsibleHeader');
const btnCancelModal = document.getElementById('btnCancelModal');
const taskForm = document.getElementById('taskForm');
const toast = document.getElementById('toast');
const taskStatusInput = document.getElementById('taskStatus');

// DOM Elements CS
const btnNewCS = document.getElementById('btnNewCS');
const csModal = document.getElementById('csModal');
const btnCloseCsModal = document.getElementById('btnCloseCsModal');
const btnCancelCsModal = document.getElementById('btnCancelCsModal');
const csForm = document.getElementById('csForm');
const csBoard = document.getElementById('csBoard');

// DOM Elements Resolve
const resolveModal = document.getElementById('resolveModal');
const btnCloseResolveModal = document.getElementById('btnCloseResolveModal');
const btnCancelResolveModal = document.getElementById('btnCancelResolveModal');
const resolveForm = document.getElementById('resolveForm');

// Login Elements
const loginOverlay = document.getElementById('loginOverlay');
const loginForm = document.getElementById('loginForm');
const loginEmailInput = document.getElementById('loginEmail');
const loginPassInput = document.getElementById('loginPass');
const loginErrorMsg = document.getElementById('loginErrorMsg');
const sidebarFooter = document.getElementById('sidebarFooter');
const currentUserName = document.getElementById('currentUserName');
const btnLogout = document.getElementById('btnLogout');

// Sidebar Elements
const btnToggleSidebar = document.getElementById('btnToggleSidebar');
const sidebar = document.getElementById('sidebar');

// User State
const USER_STORAGE_KEY = 'portalCS_user';
let currentUser = localStorage.getItem(USER_STORAGE_KEY);

const kanbanBoard = document.querySelector('.kanban-board');
const searchInput = document.getElementById('searchInput');
const slaFilter = document.getElementById('slaFilter');
const maintenanceSearch = document.getElementById('maintenanceSearch');
const maintenanceFilter = document.getElementById('maintenanceFilter');

// Configuração de Permissões (Simulada)
// Na vida real isso viria do backend/TiFlux. Aqui vamos definir que apenas "Victor" pode excluir.
const ADMIN_USERS = ['Victor', 'victor', 'Gerente', 'Admin'];

if (searchInput) searchInput.addEventListener('input', renderBoard);
if (slaFilter) slaFilter.addEventListener('change', renderBoard);
if (maintenanceSearch) maintenanceSearch.addEventListener('input', renderMaintenanceBoard);
if (maintenanceFilter) maintenanceFilter.addEventListener('change', renderMaintenanceBoard);

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Set min date for taskDate input to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('taskDate').setAttribute('min', today);

    checkAuth();
    renderBoard();
    renderCSBoard();
    setupDragAndDrop();

    // Auto-fetch demands from API when the page loads
    fetchDemandasDaAPI();

    // Fetch Custom Users Admin List
    fetchCustomUsers();

    // Limpeza de Bugs que podem ter ficado salvos no banco durante o desenvolvimento
    db.collection('tasks').get().then(snap => {
        snap.forEach(doc => {
            const data = doc.data();
            let deleted = false;

            // Limpa se for "undefined", "N/A" ou se estiver com um status invisível pro Kanban original
            if (data.number === 'undefined' || data.number === 'N/A' || data.cliente === 'Cliente TiFlux' || data.number === undefined) {
                doc.ref.delete();
                deleted = true;
            }

            const allowedStatuses = [
                'Analise', 'QP - Melhoria', 'QP - Correção', 'Adhoc',
                'Analise Concluida', 'QP - Melhoria Concluida', 'QP - Correção Concluida',
                'Adhoc Concluida', 'Preventiva', 'Preventiva Concluida'
            ];

            if (!deleted && !allowedStatuses.includes(data.status)) {
                // Se o status for o antigo "QP", vamos primeiro tentar migrar para "QP - Correção" em vez de deletar
                if (data.status === 'QP') {
                    doc.ref.update({ status: 'QP - Correção' });
                } else if (data.status === 'QP Concluida') {
                    doc.ref.update({ status: 'QP - Correção Concluida' });
                } else {
                    doc.ref.delete();
                    deleted = true;
                }
            }

            // Limpa os 14 Invasores do teste curinga passado
            const titleLower = (data.desc || '').toLowerCase();
            if (!deleted && data.status === 'Analise' && !titleLower.includes('analise') && !titleLower.includes('análise') && !titleLower.includes('qp')) {
                doc.ref.delete();
                deleted = true;
            }

            // ATUALIZAÇÃO RETROATIVA DE SLA E DATA DE ABERTURA
            if (!deleted && (data.status === 'Analise' || data.status === 'QP - Melhoria' || data.status === 'QP - Correção')) {
                let daysToAdd = 0;
                if (data.status === 'Analise') daysToAdd = 7;
                else if (data.status.includes('QP')) daysToAdd = 30;

                if (!data.createdAt || data.createdAt === data.date || !data.slaUpdated) {
                    if (data.slaUpdated) {
                        const [y, m, d] = data.date.split('-');
                        const sla = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
                        sla.setDate(sla.getDate() - daysToAdd);
                        const mStr = String(sla.getMonth() + 1).padStart(2, '0');
                        const dStr = String(sla.getDate()).padStart(2, '0');
                        const newCreatedAt = `${sla.getFullYear()}-${mStr}-${dStr}`;

                        doc.ref.update({ createdAt: newCreatedAt });
                    } else {
                        const originalDate = data.date;
                        if (originalDate && originalDate.includes('-')) {
                            const [y, m, d] = originalDate.split('-');
                            const sla = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
                            sla.setDate(sla.getDate() + daysToAdd);
                            const mStr = String(sla.getMonth() + 1).padStart(2, '0');
                            const dStr = String(sla.getDate()).padStart(2, '0');
                            const newSlaDate = `${sla.getFullYear()}-${mStr}-${dStr}`;

                            doc.ref.update({
                                date: newSlaDate,
                                createdAt: originalDate,
                                slaUpdated: true
                            });
                        }
                    }
                }
            }
        });
    });

    // Sidebar state
    const SIDEBAR_STATE_KEY = 'portalCS_sidebar';
    if (localStorage.getItem(SIDEBAR_STATE_KEY) === 'collapsed') {
        sidebar.classList.add('collapsed');
    }

    btnToggleSidebar.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        const isCollapsed = sidebar.classList.contains('collapsed');
        localStorage.setItem(SIDEBAR_STATE_KEY, isCollapsed ? 'collapsed' : 'expanded');
    });

    // Header Collapse Logic
    const HEADER_STATE_KEY = 'portalCS_header';
    if (localStorage.getItem(HEADER_STATE_KEY) === 'collapsed' && collapsibleHeader) {
        collapsibleHeader.classList.add('collapsed');
    }

    if (btnToggleHeader && collapsibleHeader) {
        btnToggleHeader.addEventListener('click', () => {
            collapsibleHeader.classList.toggle('collapsed');
            const isCollapsed = collapsibleHeader.classList.contains('collapsed');
            localStorage.setItem(HEADER_STATE_KEY, isCollapsed ? 'collapsed' : 'expanded');
        });
    }

    // Manual Sync Button Listener
    if (btnSyncTiFlux) {
        btnSyncTiFlux.addEventListener('click', fetchDemandasDaAPI);
    }
});

// Auth Logic
// Variaveis e Funções para Custom Admin Users (Configurações)
let customUsers = [];

function fetchCustomUsers() {
    db.collection('customUsers').onSnapshot((snapshot) => {
        customUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (document.getElementById('configBoard').style.display === 'block') {
            renderUserAdminList();
        }
    });
}

function renderUserAdminList() {
    const listContainer = document.getElementById('userAdminList');
    if (!listContainer) return;

    if (customUsers.length === 0) {
        listContainer.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 2rem;">Nenhum usuário extra cadastrado ainda.</div>';
        return;
    }

    let html = '';
    customUsers.forEach(u => {
        const isAdminBadge = u.isAdmin ? `<span class="sync-badge updated" style="margin-left: 8px; font-size: 0.6rem;">ADMIN</span>` : '';
        const initials = u.name ? u.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??';

        html += `
            <div class="user-card">
                <div style="display: flex; align-items: center;">
                    <div class="user-avatar">${initials}</div>
                    <div>
                        <div style="display: flex; align-items: center;">
                            <span style="color: var(--text-primary); font-weight: 600; font-size: 0.95rem;">${u.name}</span>
                            ${isAdminBadge}
                        </div>
                        <span style="color: var(--text-muted); font-size: 0.8rem;">${u.email}</span>
                    </div>
                </div>
                <div style="display: flex; gap: 4px;">
                    <button class="action-btn edit" onclick="openEditUserModal('${u.id}')" title="Editar Usuário">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </button>
                    <button class="action-btn delete" onclick="deleteCustomUser('${u.id}')" title="Excluir Usuário">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                    </button>
                </div>
            </div>
        `;
    });
    listContainer.innerHTML = html;
}

window.openEditUserModal = function (id) {
    const user = customUsers.find(u => u.id === id);
    if (user) {
        document.getElementById('adminUserId').value = user.id;
        document.getElementById('adminUserName').value = user.name;
        document.getElementById('adminUserEmail').value = user.email;
        document.getElementById('adminUserPass').value = user.pass;
        document.getElementById('adminUserIsAdmin').checked = user.isAdmin || false;

        // Change button text or title to indicate editing
        const submitBtn = userAdminForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.textContent = 'Atualizar Usuário';

        const formTitle = userAdminForm.previousElementSibling;
        if (formTitle) formTitle.textContent = 'Editar Usuário';
    }
};

const userAdminForm = document.getElementById('userAdminForm');
if (userAdminForm) {
    userAdminForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('adminUserId').value;
        const name = document.getElementById('adminUserName').value.trim();
        const email = document.getElementById('adminUserEmail').value.trim().toLowerCase();
        const pass = document.getElementById('adminUserPass').value.trim();
        const isAdmin = document.getElementById('adminUserIsAdmin').checked;

        if (!name || !email || !pass) return;

        const userData = {
            name: name,
            email: email,
            pass: pass,
            isAdmin: isAdmin
        };

        if (id) {
            // Update existing user
            db.collection('customUsers').doc(id).update(userData).then(() => {
                showToast('Usuário atualizado com sucesso!');
                resetUserForm();
            });
        } else {
            // Add new user
            db.collection('customUsers').add(userData).then(() => {
                showToast('Usuário cadastrado com sucesso!');
                resetUserForm();
            });
        }
    });

    function resetUserForm() {
        userAdminForm.reset();
        document.getElementById('adminUserId').value = '';

        const submitBtn = userAdminForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.textContent = 'Salvar Usuário';

        const formTitle = userAdminForm.previousElementSibling;
        if (formTitle) formTitle.textContent = 'Cadastrar Novo Usuário';
    }
}

window.deleteCustomUser = function (id) {
    if (confirm("Remover este usuário do acesso ao Portal?")) {
        db.collection('customUsers').doc(id).delete().then(() => {
            showToast('Usuário removido.', 'critical');
        });
    }
};

function checkAuth() {
    currentUser = localStorage.getItem(USER_STORAGE_KEY);
    const isAdminUser = localStorage.getItem('portalCS_isAdmin') === 'true';

    if (currentUser) {
        loginOverlay.classList.remove('active');
        sidebarFooter.style.display = 'block';
        currentUserName.textContent = currentUser;

        // Ocultar Configurações se não for Admin
        const viewConfigBtn = document.getElementById('btnViewConfig');
        if (viewConfigBtn) {
            viewConfigBtn.style.display = isAdminUser ? 'flex' : 'none';
        }

    } else {
        loginOverlay.classList.add('active');
        sidebarFooter.style.display = 'none';
    }
}

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = loginEmailInput.value.trim().toLowerCase();
    const pass = loginPassInput.value.trim();
    loginErrorMsg.style.display = 'none';

    if (email && pass) {
        // Validação Mestra (Fallback caso banco esteja vazio ou sem usuários configurados com email)
        if (email === 'admin@admin.com' && pass === 'admin') {
            localStorage.setItem(USER_STORAGE_KEY, 'Admin Master');
            localStorage.setItem('portalCS_isAdmin', 'true');
            loginEmailInput.value = '';
            loginPassInput.value = '';
            checkAuth();
            showToast(`Bem-vindo, Administrador!`);
            return;
        }

        // Validação conta o banco (customUsers)
        const validUser = customUsers.find(u => u.email === email && u.pass === pass);

        if (validUser) {
            localStorage.setItem(USER_STORAGE_KEY, validUser.name);
            localStorage.setItem('portalCS_isAdmin', validUser.isAdmin ? 'true' : 'false');
            loginEmailInput.value = '';
            loginPassInput.value = '';
            checkAuth();
            showToast(`Bem-vindo, ${validUser.name}!`);
        } else {
            loginErrorMsg.style.display = 'block';
        }
    }
});

btnLogout.addEventListener('click', () => {
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem('portalCS_isAdmin');
    checkAuth();
    showToast('Sessão encerrada.');
});

// Modal Actions
function openModal() {
    taskForm.reset();
    document.getElementById('taskId').value = '';
    const today = new Date().toISOString().split('T')[0];
    const taskCreatedAtInput = document.getElementById('taskCreatedAt');
    if (taskCreatedAtInput) taskCreatedAtInput.value = today;

    // Auto-fill currentUser name for new forms if exists
    if (currentUser) {
        document.getElementById('taskResponsavel').value = currentUser;
    }

    modal.classList.add('active');
}

function openEditModal(id) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        // Fallback extraction for older tasks stored without the new backend quality field
        let extractedQuality = task.quality || '';
        if (!extractedQuality && task.desc) {
            const qpMatch = task.desc.match(/\[?(?:qp|quality|an[áa]lise)(?:.*?-)?\s*(\d+)\]?/i);
            if (qpMatch) extractedQuality = qpMatch[1];
        }

        document.getElementById('taskId').value = task.id;
        document.getElementById('taskNumber').value = task.number;
        document.getElementById('taskQuality').value = extractedQuality;
        document.getElementById('taskCliente').value = task.cliente || '';
        document.getElementById('taskContato').value = task.contato || '';
        document.getElementById('taskSolicitante').value = task.solicitante || '';
        document.getElementById('taskResponsavel').value = task.responsavel || '';
        document.getElementById('taskPrioridade').value = task.prioridade || 'Normal';
        document.getElementById('taskDesc').value = task.desc;

        const taskCreatedAtInput = document.getElementById('taskCreatedAt');
        if (taskCreatedAtInput) {
            taskCreatedAtInput.value = task.createdAt || task.date || '';
        }

        document.getElementById('taskDate').value = task.date;
        document.getElementById('taskStatus').value = task.status;

        const taskObs = document.getElementById('taskObs');
        if (taskObs) taskObs.value = task.obs || '';

        modal.classList.add('active');
    }
}

function closeModal() {
    modal.classList.remove('active');
}

btnNewTask.addEventListener('click', openModal);
btnCloseModal.addEventListener('click', closeModal);
btnCancelModal.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
});

// Modal CS Actions
function openCsModal() {
    csForm.reset();
    document.getElementById('csId').value = '';

    // Set default dates to today for ease of use
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('csDateImpl').value = today;
    document.getElementById('csDateStart').value = today;
    document.getElementById('csDateLastContact').value = today;
    document.getElementById('csDateDue').value = '';

    document.getElementById('csReclamacoes').value = 'N';

    const csObs = document.getElementById('csObs');
    if (csObs) csObs.value = '';

    csModal.classList.add('active');
}

function openEditCsModal(id) {
    const client = csClients.find(c => c.id === id);
    if (client) {
        document.getElementById('csId').value = client.id;
        document.getElementById('csName').value = client.name;
        document.getElementById('csCnpj').value = client.cnpj || '';
        document.getElementById('csContact').value = client.contact;
        document.getElementById('csDateImpl').value = client.dateImpl;
        document.getElementById('csDateStart').value = client.dateStart;
        document.getElementById('csDateLastContact').value = client.dateLastContact || '';
        document.getElementById('csDateDue').value = client.dateDue || '';
        document.getElementById('csInteracao').value = client.interacao || '';
        document.getElementById('csGrow').value = client.grow || '';
        document.getElementById('csEngage').value = client.engage || '';
        document.getElementById('csReclamacoes').value = client.reclamacoes || 'N';
        document.getElementById('csAvaliacaoGrow').value = client.avaliacaoGrow || '';
        document.getElementById('csAvaliacaoEngage').value = client.avaliacaoEngage || '';

        const csObs = document.getElementById('csObs');
        if (csObs) csObs.value = client.obs || '';

        csModal.classList.add('active');
    }
}

function closeCsModal() {
    csModal.classList.remove('active');
}

btnNewCS.addEventListener('click', openCsModal);
btnCloseCsModal.addEventListener('click', closeCsModal);
btnCancelCsModal.addEventListener('click', closeCsModal);
csModal.addEventListener('click', (e) => {
    if (e.target === csModal) closeCsModal();
});

// Toast Notification
function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.style.backgroundColor = type === 'success' ? 'var(--status-normal)' : 'var(--status-critical)';
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Save Task (Demandas)
taskForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const id = document.getElementById('taskId').value || Date.now().toString();
    const number = document.getElementById('taskNumber').value;
    const quality = document.getElementById('taskQuality').value;
    const cliente = document.getElementById('taskCliente').value;
    const contato = document.getElementById('taskContato').value;
    const solicitante = document.getElementById('taskSolicitante').value;
    const responsavel = document.getElementById('taskResponsavel').value;
    const prioridade = document.getElementById('taskPrioridade').value;
    const desc = document.getElementById('taskDesc').value;

    // Safety check just in case index.html was slow to load or not cached correctly
    const createdAtInput = document.getElementById('taskCreatedAt');
    const createdAt = createdAtInput ? createdAtInput.value : (document.getElementById('taskDate').value);

    const date = document.getElementById('taskDate').value;
    const status = document.getElementById('taskStatus').value;
    const obs = document.getElementById('taskObs').value;

    const isNew = !document.getElementById('taskId').value;

    if (isNew) {
        const finalResponsavel = responsavel || currentUser;
        const taskDataNew = { id, number, quality, cliente, contato, solicitante, responsavel: finalResponsavel, prioridade, desc, createdAt, date, status, obs };
        db.collection('tasks').doc(taskDataNew.id).set(taskDataNew).then(() => {
            showToast('Demanda criada com sucesso!');
        });
    } else {
        const taskObj = tasks.find(t => t.id === id) || {};
        const updatedTask = { ...taskObj, number, quality, cliente, contato, solicitante, responsavel, prioridade, desc, createdAt, date, status, obs };
        db.collection('tasks').doc(id).set(updatedTask).then(() => {
            showToast('Demanda atualizada!');
        });
    }

    closeModal();
});

// Save CS Client
function calculateCSRisk(clientData) {
    let riskPoints = 0;

    // Interacao logic
    if (clientData.interacao === 'Resistência') riskPoints += 3;
    else if (clientData.interacao === 'Baixo') riskPoints += 1;

    // Grow logic
    if (clientData.grow === 'Estagnado/Sem contato') riskPoints += 2;

    // Engage logic
    if (clientData.engage === 'Em risco') riskPoints += 3;
    else if (clientData.engage === 'Neutro') riskPoints += 1;

    // Reclamacoes
    if (clientData.reclamacoes === 'S') riskPoints += 3;

    // Avaliacoes
    const avGrow = parseInt(clientData.avaliacaoGrow);
    if (!isNaN(avGrow)) {
        if (avGrow <= 1) riskPoints += 2;
        else if (avGrow === 2) riskPoints += 1;
    }

    const avEngage = parseInt(clientData.avaliacaoEngage);
    if (!isNaN(avEngage)) {
        if (avEngage <= 1) riskPoints += 2;
        else if (avEngage === 2) riskPoints += 1;
    }

    if (riskPoints >= 5 || clientData.engage === 'Em risco' || clientData.interacao === 'Resistência') {
        return 'Alto';
    } else if (riskPoints >= 3) {
        return 'Médio';
    } else {
        return 'Baixo';
    }
}

csForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const id = document.getElementById('csId').value || Date.now().toString();
    const name = document.getElementById('csName').value;
    const cnpj = document.getElementById('csCnpj').value;
    const contact = document.getElementById('csContact').value;
    const dateImpl = document.getElementById('csDateImpl').value;
    const dateStart = document.getElementById('csDateStart').value;
    const dateLastContact = document.getElementById('csDateLastContact').value;
    const dateDue = document.getElementById('csDateDue').value;

    const interacao = document.getElementById('csInteracao').value;
    const grow = document.getElementById('csGrow').value;
    const engage = document.getElementById('csEngage').value;
    const reclamacoes = document.getElementById('csReclamacoes').value;
    const avaliacaoGrow = document.getElementById('csAvaliacaoGrow').value;
    const avaliacaoEngage = document.getElementById('csAvaliacaoEngage').value;

    const obs = document.getElementById('csObs').value;

    const isNew = !document.getElementById('csId').value;

    const clientData = {
        id, name, cnpj, contact, dateImpl, dateStart,
        dateLastContact, dateDue, interacao, grow, engage,
        reclamacoes, avaliacaoGrow, avaliacaoEngage, obs
    };

    clientData.risk = calculateCSRisk(clientData);

    if (isNew) {
        db.collection('csClients').doc(clientData.id).set(clientData).then(() => {
            showToast('Cliente CS cadastrado com sucesso!');
        });
    } else {
        db.collection('csClients').doc(id).set(clientData).then(() => {
            showToast('Cliente CS atualizado!');
        });
    }

    closeCsModal();
});

// Relatórios (Geração de PDF)
const btnGeneratePDF = document.getElementById('btnGeneratePDF');
if (btnGeneratePDF) {
    btnGeneratePDF.addEventListener('click', () => {
        const reportMonth = document.getElementById('reportMonth').value;
        const reportSLAFilter = document.getElementById('reportSLAFilter').value;
        const reportTypeFilter = document.getElementById('reportTypeFilter').value;

        if (!reportMonth && reportSLAFilter !== 'open_overdue') {
            alert("Por favor, selecione o 'Mês de Referência' para gerar relatórios fechados.");
            return;
        }

        // Filtra as tarefas baseadas nos critérios da tela de relatórios
        let reportData = tasks.filter(t => {
            // Filtro de Tipo de Demanda
            if (reportTypeFilter === 'demandas_all') {
                // Geral: remove Preventivas
                if (t.status.includes('Preventiva')) return false;
            } else if (reportTypeFilter !== 'all') {
                // Filtro específico (QP - Melhoria, QP - Correção, Adhoc)
                if (t.status !== reportTypeFilter && !t.status.startsWith(reportTypeFilter + ' ')) {
                    // Check for exact match or start of concluded status
                    if (!t.status.includes(reportTypeFilter)) return false;
                }
            }

            // Se for open_overdue, pega demandas NÃO concluídas e atrasadas
            if (reportSLAFilter === 'open_overdue') {
                if (t.status.includes('Concluida')) return false;
                const sla = checkSLA(t.date);
                return sla.text === 'Vencido' || sla.text === 'Vence Hoje';
            }

            // Para os outros, a demanda DEVE estar concluída
            if (!t.status.includes('Concluida')) return false;

            // Filtro de Mês pelo campo date (Vencimento) ou criacao etc. 
            // Vamos usar a data do SLA (task.date) como base para o filtro mensal por enquanto.
            if (reportMonth && t.date) {
                if (!t.date.startsWith(reportMonth)) return false; // Verifica YYYY-MM
            }

            // Filtro de Qualidade SLA na conclusão (Vamos assumir que atrasou se SLAs falham)
            if (reportSLAFilter !== 'all') {
                const sla = checkSLA(t.date);
                if (reportSLAFilter === 'ontime' && (sla.text === 'Vencido' || sla.text === 'Vence Hoje' || sla.text.includes('Faltam'))) {
                    return false; // Se não estava no verde/neutro
                }
                if (reportSLAFilter === 'overdue' && sla.text === 'No prazo') {
                    return false; // Se entregou em dia, mas pediu as atrasadas
                }
            }

            return true;
        });

        if (reportData.length === 0) {
            alert("Nenhuma demanda encontrada com estes filtros para exportação.");
            return;
        }

        // Configuração jsPDF
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape'); // Orientação Paisagem

        doc.setFontSize(18);
        doc.text("Relatório de Demandas - PortalCS", 14, 15);
        doc.setFontSize(11);
        doc.text(`Tipo: ${reportTypeFilter} | Filtro: ${reportSLAFilter} | Período: ${reportMonth || 'Abertas'}`, 14, 23);
        doc.text(`Total de Registros: ${reportData.length}`, 14, 29);

        // Preparar Dados da Tabela
        const tableColumn = ["Status", "TiFlux #", "Cliente / Posto", "Responsável", "Vencimento", "Prioridade"];
        const tableRows = [];

        // Funcão auxiliar para evitar que Emojis (e caracteres com múltiplos bytes além do Latin-1 padrão) corrompam o construtor doc.text do jsPDF
        const sanitizeForPDF = (str) => {
            if (!str) return '';
            return String(str).replace(/[^\x00-\xFF]/g, '');
        };

        reportData.forEach(t => {
            const ticketData = [
                sanitizeForPDF(t.status),
                t.number || 'N/A',
                sanitizeForPDF(t.cliente || 'Desconhecido'),
                sanitizeForPDF(t.responsavel || '-'),
                t.date ? t.date.split('-').reverse().join('/') : '-',
                sanitizeForPDF(t.prioridade || 'Normal')
            ];
            tableRows.push(ticketData);
        });

        // Desenhar a Tabela Usando AutoTable
        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 35,
            theme: 'striped',
            headStyles: { fillColor: [139, 92, 246] }, // Tom de roxo
            styles: { fontSize: 10, cellPadding: 3 },
            alternateRowStyles: { fillColor: [245, 245, 245] }
        });

        // Save PDF
        doc.save(`relatorio_${reportSLAFilter}_${reportMonth || 'hoje'}.pdf`);
        showToast("PDF Gerado com Sucesso!");
    });
}

// Relatório de Preventivas (PDF)
const btnGeneratePreventivasPDF = document.getElementById('btnGeneratePreventivasPDF');
if (btnGeneratePreventivasPDF) {
    btnGeneratePreventivasPDF.addEventListener('click', () => {
        const filterVal = document.getElementById('reportPreventivaFilter').value;
        const preventivasByClient = {};

        // Coletar dados de preventivas (similar à lógica da aba de preventivas)
        tasks.forEach(task => {
            if (task.status.includes('Preventiva')) {
                const clientName = task.cliente || 'Sem Cliente';
                if (!preventivasByClient[clientName]) {
                    preventivasByClient[clientName] = [];
                }
                preventivasByClient[clientName].push(task);
            }
        });

        const clients = Object.keys(preventivasByClient).sort();
        const reportRows = [];

        const sanitizeForPDF = (str) => {
            if (!str) return '';
            return String(str).replace(/[^\x00-\xFF]/g, '');
        };

        const formatDate = (dateStr) => {
            if (!dateStr) return '-';
            const parts = dateStr.split('-');
            if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
            return dateStr;
        };

        clients.forEach(clientName => {
            const clientTasks = preventivasByClient[clientName].sort((a, b) => {
                const dateA = new Date(a.closedAt || a.createdAt || a.date || '1970-01-01');
                const dateB = new Date(b.closedAt || b.createdAt || b.date || '1970-01-01');
                return dateB - dateA;
            });

            const lastTask = clientTasks[0];
            let badgeClass = 'No Prazo';
            let proxPreventiva = '-';

            if (lastTask.closedAt) {
                const closedDate = new Date(lastTask.closedAt + 'T12:00:00');
                closedDate.setDate(closedDate.getDate() + 90);
                proxPreventiva = `${String(closedDate.getDate()).padStart(2, '0')}/${String(closedDate.getMonth() + 1).padStart(2, '0')}/${closedDate.getFullYear()}`;

                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const diff = closedDate - today;
                const daysToMaintenance = Math.ceil(diff / (1000 * 60 * 60 * 24));

                if (daysToMaintenance <= 0) badgeClass = 'Vencida';
                else if (daysToMaintenance <= 15) badgeClass = 'Proxima (15d)';
            } else {
                badgeClass = 'Em Aberto';
                proxPreventiva = 'Pendente';
            }

            // Aplicar Filtro do Relatório
            if (filterVal === 'vencidas' && badgeClass !== 'Vencida') return;
            if (filterVal === 'perto' && badgeClass !== 'Proxima (15d)') return;

            reportRows.push([
                sanitizeForPDF(clientName),
                sanitizeForPDF(lastTask.responsavel || '-'),
                formatDate(lastTask.closedAt),
                proxPreventiva,
                badgeClass
            ]);
        });

        if (reportRows.length === 0) {
            alert("Nenhuma preventiva encontrada para exportação com estes filtros.");
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');
        doc.setFontSize(18);
        doc.text("Relatório de Status de Preventivas", 14, 15);
        doc.setFontSize(11);
        doc.text(`Filtro: ${filterVal === 'all' ? 'Todas' : (filterVal === 'vencidas' ? 'Apenas Vencidas' : 'Próximas 15 dias')}`, 14, 23);

        doc.autoTable({
            head: [["Cliente / Posto", "Últ. Responsável", "Últ. Realizada", "Próxima Visita", "Status"]],
            body: reportRows,
            startY: 30,
            theme: 'striped',
            headStyles: { fillColor: [16, 185, 129] }, // Verde para preventivas
            styles: { fontSize: 10 }
        });

        doc.save(`relatorio_preventivas_${filterVal}.pdf`);
        showToast("Relatório de Preventivas Gerado!");
    });
}

// Relatório de CS (PDF)
const btnGenerateCSPDF = document.getElementById('btnGenerateCSPDF');
if (btnGenerateCSPDF) {
    btnGenerateCSPDF.addEventListener('click', () => {
        const filterVal = document.getElementById('reportCSFilter').value;
        const reportRows = [];

        const sanitizeForPDF = (str) => {
            if (!str) return '';
            return String(str).replace(/[^\x00-\xFF]/g, '');
        };

        csClients.forEach(client => {
            const risk = client.risk || 'Baixo';

            // Filtro
            if (filterVal === 'alto' && risk !== 'Alto') return;
            if (filterVal === 'medio' && risk !== 'Médio' && risk !== 'Medio') return;

            reportRows.push([
                sanitizeForPDF(client.name),
                sanitizeForPDF(client.interacao || '-'),
                sanitizeForPDF(client.grow || '-'),
                sanitizeForPDF(client.engage || '-'),
                sanitizeForPDF(risk)
            ]);
        });

        if (reportRows.length === 0) {
            alert("Nenhum cliente CS encontrado para exportação.");
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF(); // Retrato para CS parece ok
        doc.setFontSize(18);
        doc.text("Relatório de Saúde Customer Success", 14, 15);
        doc.setFontSize(11);
        doc.text(`Filtrando por Risco: ${filterVal === 'all' ? 'Todos' : filterVal}`, 14, 23);

        doc.autoTable({
            head: [["Cliente", "Interação", "CS Grow", "CS Engage", "Índice de Risco"]],
            body: reportRows,
            startY: 30,
            theme: 'striped',
            headStyles: { fillColor: [139, 92, 246] }, // Roxo
            styles: { fontSize: 9 }
        });

        doc.save(`relatorio_saude_cs_${filterVal}.pdf`);
        showToast("Relatório de CS Gerado!");
    });
}


// Delete Task (Secured)
function deleteTask(id) {
    // Check if user is in hardcoded list
    const isHardcodedAdmin = ADMIN_USERS.includes(currentUser);
    // Check if user is in Firebase customUsers and has isAdmin == true
    const isCustomAdmin = customUsers.find(u => u.name === currentUser && u.isAdmin);

    if (!currentUser || (!isHardcodedAdmin && !isCustomAdmin)) {
        alert('Acesso Negado: Apenas administradores podem excluir demandas.');
        return;
    }

    if (confirm('Tem certeza que deseja EXCLUIR esta demanda? Esta ação não pode ser desfeita.')) {
        db.collection('tasks').doc(id).delete().then(() => {
            showToast('Demanda excluída!', 'critical');
        });
    }
}

// Complete Task Trigger (Opens Modal)
let pendingCompleteTaskId = null;
let pendingCompleteNewStatus = null;

function completeTask(id, newStatus = null) {
    pendingCompleteTaskId = id;
    pendingCompleteNewStatus = newStatus;

    document.getElementById('resolveTaskId').value = id;
    document.getElementById('taskResolvedVersion').value = ''; // clear previous
    document.getElementById('taskResolvedValidator').value = ''; // clear previous
    document.getElementById('taskResolvedDesc').value = ''; // clear previous
    resolveModal.classList.add('active');
}

function closeResolveModal() {
    resolveModal.classList.remove('active');
    pendingCompleteTaskId = null;
    pendingCompleteNewStatus = null;
}

if (btnCloseResolveModal) btnCloseResolveModal.addEventListener('click', closeResolveModal);
if (btnCancelResolveModal) btnCancelResolveModal.addEventListener('click', closeResolveModal);
if (resolveModal) resolveModal.addEventListener('click', (e) => {
    if (e.target === resolveModal) closeResolveModal();
});

// Submit Resolve Form
resolveForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!pendingCompleteTaskId) return;

    const resolvedVersion = document.getElementById('taskResolvedVersion').value.trim();
    const resolvedValidator = document.getElementById('taskResolvedValidator').value.trim();
    const resolvedDesc = document.getElementById('taskResolvedDesc').value.trim();
    const id = pendingCompleteTaskId;
    const index = tasks.findIndex(t => t.id === id);

    if (index !== -1) {
        let finalStatus = pendingCompleteNewStatus;
        if (!finalStatus) {
            const currentStatus = tasks[index].status;
            if (currentStatus === 'Analise') finalStatus = 'Analise Concluida';
            else if (currentStatus === 'QP - Melhoria') finalStatus = 'QP - Melhoria Concluida';
            else if (currentStatus === 'QP - Correção') finalStatus = 'QP - Correção Concluida';
            else if (currentStatus === 'Adhoc') finalStatus = 'Adhoc Concluida';
            else finalStatus = 'Analise Concluida'; // Fallback
        }

        const taskObj = { ...tasks[index] }; // Garantir cópia para evitar problemas de referência
        taskObj.status = finalStatus;
        if (resolvedVersion) taskObj.resolvedVersion = resolvedVersion;
        if (resolvedValidator) taskObj.resolvedValidator = resolvedValidator;
        if (resolvedDesc) taskObj.resolvedDesc = resolvedDesc;

        db.collection('tasks').doc(taskObj.id).set(taskObj).then(() => {
            showToast('Demanda concluída com sucesso!', 'success');
            // Mudar automaticamente para a aba de concluídas para mostrar o resultado
            switchView('concluidas');
        }).catch(err => {
            console.error('Erro ao concluir:', err);
            showToast('Erro ao salvar conclusão.', 'critical');
        });
    }

    closeResolveModal();
});

// SLA Logic (Color Coding)
function checkSLA(dateStr) {
    if (!dateStr) return { class: 'status-normal', badge: 'badge-normal', icon: '<circle cx="12" cy="12" r="10"/>' };

    // Parse the task date as UTC at midnight to match the input date correctly
    const [year, month, day] = dateStr.split('-');
    const taskDate = new Date(year, month - 1, day);

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Ignore time for comparison

    const diffTime = taskDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
        // Overdue or Due Today (Vencido / Vence Hoje)
        return {
            class: 'status-critical',
            badge: 'badge-critical',
            icon: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
            text: diffDays === 0 ? 'Vence Hoje' : 'Vencido'
        };
    } else if (diffDays <= 2) {
        // Warning (2 days or less)
        return {
            class: 'status-warning',
            badge: 'badge-warning',
            icon: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
            text: `Faltam ${diffDays} dias`
        };
    } else {
        // Normal
        return {
            class: 'status-normal',
            badge: 'badge-normal',
            icon: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
            text: 'No prazo'
        };
    }
}

// View Toggle Logic
const btnViewDemandas = document.getElementById('btnViewDemandas');
const btnViewCS = document.getElementById('btnViewCS');
const btnViewConcluidas = document.getElementById('btnViewConcluidas');
const btnViewCSMaintenance = document.getElementById('btnViewCSMaintenance');
const btnViewRelatorios = document.getElementById('btnViewRelatorios');
const btnViewConfig = document.getElementById('btnViewConfig');

const demandasFilterBar = document.getElementById('demandasFilterBar');
const relatoriosBoard = document.getElementById('relatoriosBoard');
const configBoard = document.getElementById('configBoard');
const maintenanceBoard = document.getElementById('maintenanceBoard');

function switchView(viewName) {
    // Update active class on nav
    [btnViewDemandas, btnViewCS, btnViewConcluidas, btnViewCSMaintenance, btnViewRelatorios, btnViewConfig].forEach(btn => {
        if (btn) btn.classList.remove('active');
    });

    // Ocultar tudo inicialmente
    btnNewTask.style.display = 'none';
    btnNewCS.style.display = 'none';
    kanbanBoard.style.display = 'none';
    csBoard.style.display = 'none';
    relatoriosBoard.style.display = 'none';
    configBoard.style.display = 'none';
    if (maintenanceBoard) maintenanceBoard.style.display = 'none';
    if (demandasFilterBar) demandasFilterBar.style.display = 'none';

    if (viewName === 'demandas' && btnViewDemandas) {
        btnViewDemandas.classList.add('active');
        btnNewTask.style.display = 'inline-flex';
        kanbanBoard.style.display = 'flex';
        if (demandasFilterBar) demandasFilterBar.style.display = 'flex';
        if (slaFilter) slaFilter.style.display = 'block';
    }
    else if (viewName === 'cs' && btnViewCS) {
        btnViewCS.classList.add('active');
        btnNewCS.style.display = 'inline-flex';
        csBoard.style.display = 'block';
    }
    else if (viewName === 'maintenance' && btnViewCSMaintenance) {
        btnViewCSMaintenance.classList.add('active');
        if (maintenanceBoard) maintenanceBoard.style.display = 'block';
        if (typeof renderMaintenanceBoard === 'function') renderMaintenanceBoard();
    }
    else if (viewName === 'concluidas' && btnViewConcluidas) {
        btnViewConcluidas.classList.add('active');
        kanbanBoard.style.display = 'flex';
        if (demandasFilterBar) demandasFilterBar.style.display = 'flex';
        if (slaFilter) slaFilter.style.display = 'none'; // Hide SLA filter as it is irrelevant here
    }
    else if (viewName === 'relatorios' && btnViewRelatorios) {
        btnViewRelatorios.classList.add('active');
        relatoriosBoard.style.display = 'block';
    }
    else if (viewName === 'config' && btnViewConfig) {
        btnViewConfig.classList.add('active');
        configBoard.style.display = 'block';
        if (typeof renderUserAdminList === 'function') renderUserAdminList();
    }

    // Show/Hide Kanban columns based on view if Kanban is visible
    if (kanbanBoard.style.display !== 'none') {
        document.querySelectorAll('.kanban-column').forEach(col => {
            if (col.dataset.view === viewName) {
                col.style.display = 'flex';
            } else {
                col.style.display = 'none';
            }
        });
    }

    // DISPARAR RENDERIZAÇÃO IMEDIATA AO TROCAR DE ABA
    // Isso garante que os filtros de aba (concluídas vs abertas) sejam aplicados na hora.
    renderBoard();
}

if (btnViewDemandas) btnViewDemandas.addEventListener('click', (e) => { e.preventDefault(); switchView('demandas'); });
if (btnViewCS) btnViewCS.addEventListener('click', (e) => { e.preventDefault(); switchView('cs'); });
if (btnViewCSMaintenance) btnViewCSMaintenance.addEventListener('click', (e) => { e.preventDefault(); switchView('maintenance'); });
if (btnViewConcluidas) btnViewConcluidas.addEventListener('click', (e) => { e.preventDefault(); switchView('concluidas'); });
if (btnViewRelatorios) btnViewRelatorios.addEventListener('click', (e) => { e.preventDefault(); switchView('relatorios'); });
if (btnViewConfig) btnViewConfig.addEventListener('click', (e) => { e.preventDefault(); switchView('config'); });

// Render Board
function renderBoard() {
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const slaFilterValue = slaFilter ? slaFilter.value : 'all';

    let filteredTasks = tasks.filter(task => {
        // Texto Filter
        const matchesSearch = !searchTerm ||
            (task.number && task.number.toLowerCase().includes(searchTerm)) ||
            (task.quality && task.quality.toLowerCase().includes(searchTerm)) ||
            (task.cliente && task.cliente.toLowerCase().includes(searchTerm)) ||
            (task.desc && task.desc.toLowerCase().includes(searchTerm));

        if (!matchesSearch) return false;

        // SLA Filter
        const isCompleted = task.status.includes('Concluida');

        // Se estiver na aba Concluidas, ignora os filtros SLA de (vencimento, aberto, etc)
        // e exibe a tarefa. Se NÃO estiver na aba Concluidas (estiver no Quadro Demandas),
        // ela DEVE ficar escondida.
        const inConcluidasView = btnViewConcluidas && btnViewConcluidas.classList.contains('active');

        // Se for uma tarefa concluída e não estou na aba de concluídas: oculta.
        if (isCompleted && !inConcluidasView) return false;

        // Se estou na aba de concluídas, exibo apenas se estiver concluída. Oculto as abertas.
        if (inConcluidasView) {
            return isCompleted;
        }

        // AGORA o check de "all" para as pendentes no KanBan original
        if (slaFilterValue === 'all') return true;

        // Se passar por aqui, é porque estou no Quadro Demandas normal E a tarefa está aberta
        const sla = checkSLA(task.date);
        if (slaFilterValue === 'vencidas') {
            return sla.text === 'Vencido' || sla.text === 'Vence Hoje';
        } else if (slaFilterValue === 'perto') {
            return sla.text.includes('Faltam');
        } else if (slaFilterValue === 'longe') {
            return sla.text === 'No prazo';
        }

        return true;
    });

    // Clear all columns
    document.querySelectorAll('.column-content').forEach(col => {
        col.innerHTML = '';
        // Update counter based on filtered tasks
        const status = col.parentElement.dataset.status;
        const count = filteredTasks.filter(t => t.status === status).length;
        col.parentElement.querySelector('.counter').textContent = count;
    });

    // Build cards
    filteredTasks.forEach(task => {
        const sla = checkSLA(task.date);

        // Format date to Brazilian format
        let dateDisplay = '-';
        if (task.date) {
            const [y, m, d] = task.date.split('-');
            dateDisplay = `${d}/${m}/${y}`;
        }

        let createdDisplay = '-';
        const rawCreatedAt = task.createdAt || task.date;
        if (rawCreatedAt) {
            const [y, m, d] = rawCreatedAt.split('-');
            createdDisplay = `${d}/${m}/${y}`;
        }

        // Fallback extraction for older tasks stored without the quality field
        let displayQuality = task.quality || '';
        if (!displayQuality && task.desc) {
            const qpMatch = task.desc.match(/\[?(?:qp|quality|an[áa]lise)(?:.*?-)?\s*(\d+)\]?/i);
            if (qpMatch) displayQuality = qpMatch[1];
        }

        const isCompleted = task.status.includes('Concluida');

        let contatoTexto = '';
        if (task.solicitante || task.contato) {
            const nom = task.solicitante ? `<b>${task.solicitante}</b>` : '';
            const tel = task.contato ? `${task.contato}` : '';
            const sep = (nom && tel) ? ' - ' : '';
            contatoTexto = ` | ${nom}${sep}${tel}`;
        }

        const obsHtml = task.obs ? `
            <div style="margin-top: 8px; padding: 6px 8px; background: rgba(0,0,0,0.1); border-radius: 4px; font-size: 0.7rem; color: var(--text-muted); font-style: italic; display: flex; align-items: flex-start; gap: 4px; border: 1px dashed rgba(255,255,255,0.1);">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 2px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span style="overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${task.obs}</span>
            </div>
        ` : '';

        const cardHTML = `
            <div class="task-card ${sla.class} ${isCompleted ? 'completed-card' : ''}" draggable="${!isCompleted}" data-id="${task.id}">
                <div class="card-header">
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <span class="task-num" title="Número TiFlux">#${task.number} (TiFlux)</span>
                        ${displayQuality ? `<span class="task-num" title="Número Quality" style="color: var(--status-warning);">#${displayQuality} (Quality)</span>` : ''}
                        ${(isCompleted && task.resolvedVersion) ? `<span class="task-num" title="Versão da Solução" style="color: var(--status-success);">Versão: ${task.resolvedVersion}</span>` : ''}
                    </div>
                    <span class="task-priority priority-${(task.prioridade || 'Normal').toLowerCase()}">${task.prioridade || 'Normal'}</span>
                </div>
                <div class="task-cliente" title="Cliente" style="line-height: 1.4;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align:middle;">
                        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                    </svg>
                    ${task.cliente || 'Cliente não informado'} ${contatoTexto}
                </div>
                <div style="font-size: 0.70rem; color: var(--text-muted); margin-top: 2px; margin-bottom: 8px; display: flex; align-items: center; gap: 4px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    Data Abertura: ${createdDisplay}
                </div>
                <div class="task-desc">${task.desc}</div>
                ${obsHtml}
                ${(isCompleted && (task.resolvedValidator || task.resolvedDesc)) ? `
                <div class="task-resolution-info" style="margin-top: 8px; padding: 6px 8px; background: rgba(0,0,0,0.2); border-left: 2px solid var(--status-success); border-radius: 4px; font-size: 0.75rem;">
                    ${task.resolvedValidator ? `<div style="color: var(--text-color); margin-bottom: 2px;"><b>Validado por:</b> ${task.resolvedValidator}</div>` : ''}
                    ${task.resolvedDesc ? `<div style="color: var(--text-muted);">${task.resolvedDesc}</div>` : ''}
                </div>
                ` : ''}
                <div class="card-footer">
                    <span class="task-resp" title="Responsável">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; vertical-align:text-bottom"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        ${task.responsavel || 'Não atribuído'}
                    </span>
                    <div class="sla-badge ${isCompleted ? 'badge-completed' : sla.badge}" title="${isCompleted ? 'Concluída' : sla.text}">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            ${isCompleted ? '<path d="M20 6 9 17l-5-5"/>' : sla.icon}
                        </svg>
                        <span>${dateDisplay}</span>
                    </div>
                    <div class="card-actions" style="display: flex; gap: 4px;">
                        ${!isCompleted ? `
                        <button class="btn-whatsapp" onclick="sendWhatsappCobrança('${task.id}')" title="Cobrar via WhatsApp" style="background: none; border: none; cursor: pointer; color: #25D366; display:flex; align-items:center;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21zm6.5-10.5c.34-.34 1.1-.34 1.45 0 .4.4 1.05.4 1.45 0l1.2-1.2c.4-.4.4-1.05 0-1.45l-.73-.73c-.4-.4-1.05-.4-1.45 0-.5.5-1.3 1.1-2 1.4-1.4.6-3-.2-3.8-1.5-.4-.7-.2-1.6.3-2.1.3-.3.9-.3 1.2 0l1.4 1.4z"/></svg>
                        </button>
                        <button class="btn-complete" onclick="completeTask('${task.id}')" title="Concluir" style="background: none; border: none; cursor: pointer; color: var(--status-normal);">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                        </button>
                        ` : ''}
                        <button class="btn-delete" onclick="deleteTask('${task.id}')" title="Excluir" style="background: none; border: none; cursor: pointer; color: var(--status-critical);">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                        </button>
                    </div>
                </div>
            </div>
        `;

        const targetCol = document.getElementById(`col-${task.status}`);
        if (targetCol) {
            targetCol.insertAdjacentHTML('beforeend', cardHTML);
        }
    });

    // Reattach drag events to new cards
    setupDragAndDrop();
}

function setupDragAndDrop() {
    const cards = document.querySelectorAll('.task-card');
    const contents = document.querySelectorAll('.column-content');

    cards.forEach(card => {
        card.addEventListener('dragstart', () => {
            card.classList.add('dragging');
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
        });

        // Edit on double click
        card.addEventListener('dblclick', (e) => {
            if (e.target.closest('button')) return; // Ignore buttons
            const taskId = card.dataset.id;
            openEditModal(taskId);
        });
    });

    contents.forEach(content => {
        content.addEventListener('dragover', e => {
            e.preventDefault();
            content.classList.add('drag-over');
            const draggable = document.querySelector('.dragging');
            if (draggable) {
                content.appendChild(draggable);
            }
        });

        content.addEventListener('dragleave', () => {
            content.classList.remove('drag-over');
        });

        content.addEventListener('drop', e => {
            content.classList.remove('drag-over');
            const draggable = document.querySelector('.dragging');
            if (draggable) {
                const taskId = draggable.dataset.id;
                const newStatus = content.parentElement.dataset.status;

                // Update object
                const index = tasks.findIndex(t => t.id === taskId);
                if (index !== -1 && tasks[index].status !== newStatus) {
                    if (newStatus.includes('Concluida')) {
                        completeTask(taskId, newStatus);
                    } else {
                        const taskToUpdate = tasks.find(t => t.id === taskId);
                        if (taskToUpdate) {
                            taskToUpdate.status = newStatus;
                            db.collection('tasks').doc(taskId).set(taskToUpdate);
                        }
                    }
                }
            }
        });
    });
}

function sendWhatsappCobrança(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    let extractedQuality = task.quality || '';
    if (!extractedQuality && task.desc) {
        const qpMatch = task.desc.match(/\[?(?:qp|quality|an[áa]lise)(?:.*?-)?\s*(\d+)\]?/i);
        if (qpMatch) extractedQuality = qpMatch[1];
    }

    const clientName = task.cliente || 'o cliente';
    const numQuality = extractedQuality ? `${extractedQuality}` : 'Sem número Quality';

    // Mount the message text based on the type of task
    let message = '';

    if (task.status === 'QP') {
        message = `Olá pessoal !\nPoderiam verificar o status da QP: "${numQuality}", por favor !\nAgradeço o apoio!`;
    } else {
        message = `Olá pessoal !\nPoderiam verificar o status do Chamado: "${numQuality}" do cliente *${clientName}*, por favor !\nAgradeço o apoio!`;
    }

    const encodedMsg = encodeURIComponent(message);
    let whatsappUrl = `https://api.whatsapp.com/send?text=${encodedMsg}`;

    // Open in new tab
    window.open(whatsappUrl, '_blank');
}

function saveTasks() {
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
}

function saveCS() {
    localStorage.setItem(CS_STORAGE_KEY, JSON.stringify(csClients));
}

// Render CS Board
function renderCSBoard() {
    const csTableBody = document.getElementById('csTableBody');
    if (!csTableBody) return;

    csTableBody.innerHTML = '';

    const getBadgeClass = (value, type) => {
        if (!value) return 'badge-neutral';
        const val = value.toLowerCase();

        if (type === 'interacao') {
            if (val === 'ótimo' || val === 'otimo') return 'badge-success';
            if (val === 'baixo') return 'badge-warning';
            if (val === 'resistência' || val === 'resistencia') return 'badge-critical';
        } else if (type === 'grow') {
            if (val === 'concluído' || val === 'concluido') return 'badge-success';
            if (val === 'em andamento') return 'badge-warning';
            if (val.includes('estagnado')) return 'badge-critical';
        } else if (type === 'engage') {
            if (val === 'satisfeito') return 'badge-success';
            if (val === 'neutro') return 'badge-warning'; // changed to warning for visibility
            if (val === 'em risco') return 'badge-critical';
        } else if (type === 'risk') {
            if (val === 'baixo') return 'badge-success';
            if (val === 'médio' || val === 'medio') return 'badge-warning';
            if (val === 'alto') return 'badge-critical';
        }
        return 'badge-neutral';
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const [y, m, d] = parts;
            return `${d}/${m}/${y}`;
        }
        return dateStr;
    };

    csClients.forEach(client => {
        const tr = document.createElement('tr');
        tr.className = 'cs-table-row';
        tr.style.borderBottom = '1px solid var(--border-color)';
        tr.style.transition = 'background 0.2s';

        tr.onmouseover = () => tr.style.background = 'rgba(255,255,255,0.02)';
        tr.onmouseout = () => tr.style.background = 'transparent';

        const interacaoBadge = client.interacao ? `<span class="cs-badge ${getBadgeClass(client.interacao, 'interacao')}">${client.interacao}</span>` : '-';
        const growBadge = client.grow ? `<span class="cs-badge ${getBadgeClass(client.grow, 'grow')}">${client.grow}</span>` : '-';
        const engageBadge = client.engage ? `<span class="cs-badge ${getBadgeClass(client.engage, 'engage')}">${client.engage}</span>` : '-';
        const riskBadge = client.risk ? `<span class="cs-badge ${getBadgeClass(client.risk, 'risk')}">${client.risk}</span>` : '-';

        // Lógica de Preventiva
        // Busca o último chamado de preventiva para este cliente
        const lastPreventiva = tasks
            .filter(t => t.cliente === client.name && t.status.includes('Preventiva') && t.closedAt)
            .sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt))[0];

        let proxPreventiva = '-';
        let preventivaStatusClass = '';

        if (lastPreventiva && lastPreventiva.closedAt) {
            const closedDate = new Date(lastPreventiva.closedAt + 'T12:00:00'); // Use noon to avoid TZ issues
            closedDate.setDate(closedDate.getDate() + 90);

            const y = closedDate.getFullYear();
            const m = String(closedDate.getMonth() + 1).padStart(2, '0');
            const d = String(closedDate.getDate()).padStart(2, '0');
            proxPreventiva = `${d}/${m}/${y}`;

            // Check if upcoming
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const diff = closedDate - today;
            const daysToMaintenance = Math.ceil(diff / (1000 * 60 * 60 * 24));

            if (daysToMaintenance <= 0) preventivaStatusClass = 'badge-critical';
            else if (daysToMaintenance <= 15) preventivaStatusClass = 'badge-warning';
            else preventivaStatusClass = 'badge-success';
        }

        const maintenanceBadge = proxPreventiva !== '-' ? `<span class="cs-badge ${preventivaStatusClass}">${proxPreventiva}</span>` : '<span class="cs-badge badge-neutral">Não agendada</span>';

        tr.innerHTML = `
            <td style="padding: 1rem; color: var(--text-primary); font-weight: 500; font-size: 0.875rem;">${client.name}</td>
            <td style="padding: 1rem; color: var(--text-secondary); font-size: 0.8rem;">${client.contact || '-'}</td>
            <td style="padding: 1rem; color: var(--text-secondary); font-size: 0.8rem;">${formatDate(client.dateLastContact)}</td>
            <td style="padding: 1rem; color: var(--text-secondary); font-size: 0.8rem;">${formatDate(client.dateDue)}</td>
            <td style="padding: 1rem;">${maintenanceBadge}</td>
            <td style="padding: 1rem;">${interacaoBadge}</td>
            <td style="padding: 1rem;">${growBadge}</td>
            <td style="padding: 1rem;">${engageBadge}</td>
            <td style="padding: 1rem;">${riskBadge}</td>
            <td style="padding: 1rem; font-size: 0.75rem; color: var(--text-muted); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${client.obs || ''}">${client.obs || '-'}</td>
            <td style="padding: 1rem; white-space: nowrap;">
                <button class="btn-icon" onclick="openEditCsModal('${client.id}')" title="Editar">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                </button>
            </td>
        `;
        csTableBody.appendChild(tr);
    });
}

function renderMaintenanceBoard() {
    const tableBody = document.getElementById('maintenanceTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    const preventivasByClient = {};
    const searchVal = document.getElementById('maintenanceSearch')?.value.toLowerCase() || '';
    const filterVal = document.getElementById('maintenanceFilter')?.value || 'all';

    tasks.forEach(task => {
        if (task.status.includes('Preventiva')) {
            const clientName = task.cliente || 'Sem Cliente';
            if (!preventivasByClient[clientName]) {
                preventivasByClient[clientName] = [];
            }
            preventivasByClient[clientName].push(task);
        }
    });

    const clients = Object.keys(preventivasByClient).sort();

    if (clients.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: var(--text-muted);">Nenhuma preventiva encontrada</td></tr>';
        return;
    }

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const [y, m, d] = parts;
            return `${d}/${m}/${y}`;
        }
        return dateStr;
    };

    let count = 0;

    clients.forEach(clientName => {
        const clientTasks = preventivasByClient[clientName];

        clientTasks.sort((a, b) => {
            const dateA = new Date(a.closedAt || a.createdAt || a.date || '1970-01-01');
            const dateB = new Date(b.closedAt || b.createdAt || b.date || '1970-01-01');
            return dateB - dateA;
        });

        const lastTask = clientTasks[0];

        let proxPreventiva = '-';
        let badgeClass = 'badge-neutral';
        let dataRealizada = '-';

        if (lastTask.closedAt) {
            dataRealizada = formatDate(lastTask.closedAt);
            const closedDate = new Date(lastTask.closedAt + 'T12:00:00');
            closedDate.setDate(closedDate.getDate() + 90);

            const y = closedDate.getFullYear();
            const m = String(closedDate.getMonth() + 1).padStart(2, '0');
            const d = String(closedDate.getDate()).padStart(2, '0');
            proxPreventiva = `${d}/${m}/${y}`;

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const diff = closedDate - today;
            const daysToMaintenance = Math.ceil(diff / (1000 * 60 * 60 * 24));

            if (daysToMaintenance <= 0) badgeClass = 'badge-critical';
            else if (daysToMaintenance <= 15) badgeClass = 'badge-warning';
            else badgeClass = 'badge-success';
        } else {
            dataRealizada = 'Em andamento (Aberta)';
            badgeClass = 'badge-neutral';
            proxPreventiva = 'Aguardando conclusão';
        }

        const responsavel = lastTask.responsavel || '';
        const matchSearch = clientName.toLowerCase().includes(searchVal) || responsavel.toLowerCase().includes(searchVal);

        let matchStatus = true;
        if (filterVal === 'vencidas' && badgeClass !== 'badge-critical') matchStatus = false;
        if (filterVal === 'perto' && badgeClass !== 'badge-warning') matchStatus = false;
        if (filterVal === 'longe' && badgeClass !== 'badge-success' && badgeClass !== 'badge-neutral') matchStatus = false;

        if (matchSearch && matchStatus) {
            count++;
            const tr = document.createElement('tr');
            tr.className = 'cs-table-row';
            tr.style.borderBottom = '1px solid var(--border-color)';

            const maintenanceBadge = `<span class="cs-badge ${badgeClass}">${proxPreventiva}</span>`;

            tr.innerHTML = `
                <td style="padding: 1rem; color: var(--text-primary); font-weight: 500; font-size: 0.875rem;"><a href="#" onclick="window.openEditCsModal('${lastTask.id}')" style="color: var(--accent-color); text-decoration: none;">#${lastTask.number}</a></td>
                <td style="padding: 1rem; color: var(--text-primary); font-weight: 500; font-size: 0.875rem;">${clientName}</td>
                <td style="padding: 1rem; color: var(--text-secondary); font-size: 0.8rem;">${responsavel || '-'}</td>
                <td style="padding: 1rem; color: var(--text-secondary); font-size: 0.8rem;">${dataRealizada}</td>
                <td style="padding: 1rem;">${maintenanceBadge}</td>
            `;
            tableBody.appendChild(tr);
        }
    });

    if (count === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: var(--text-muted);">Nenhuma preventiva encontrada para os filtros atuais.</td></tr>';
    }
}

function updateBadgePreventivas() {
    const badge = document.getElementById('badgePreventivas');
    if (!badge) return;

    let totalAlerts = 0;
    const preventivasByClient = {};

    tasks.forEach(task => {
        if (task.status.includes('Preventiva')) {
            const clientName = task.cliente || 'Sem Cliente';
            if (!preventivasByClient[clientName]) {
                preventivasByClient[clientName] = [];
            }
            preventivasByClient[clientName].push(task);
        }
    });

    Object.keys(preventivasByClient).forEach(clientName => {
        const clientTasks = preventivasByClient[clientName];
        clientTasks.sort((a, b) => {
            const dateA = new Date(a.closedAt || a.createdAt || a.date || '1970-01-01');
            const dateB = new Date(b.closedAt || b.createdAt || b.date || '1970-01-01');
            return dateB - dateA;
        });

        const lastTask = clientTasks[0];

        if (lastTask && lastTask.closedAt) {
            const closedDate = new Date(lastTask.closedAt + 'T12:00:00');
            closedDate.setDate(closedDate.getDate() + 90);

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const diff = closedDate - today;
            const daysToMaintenance = Math.ceil(diff / (1000 * 60 * 60 * 24));

            if (daysToMaintenance <= 15) {
                totalAlerts++;
            }
        }
    });

    if (totalAlerts > 0) {
        badge.textContent = totalAlerts;
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
}

// Expose functions to global scope (to be used in HTML onclick)
window.deleteTask = deleteTask;
window.completeTask = completeTask;
window.sendWhatsappCobrança = sendWhatsappCobrança;
window.openEditCsModal = openEditCsModal;
