import { supabase } from './supabase.js';
import { initAuthGuard, getCurrentUser, isAdmin } from './auth-guard.js';
initAuthGuard();


const loading = document.getElementById('loading');
const error = document.getElementById('error');
const tableBody = document.getElementById('userTableBody');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const sortSelect = document.getElementById('sortSelect');
const resetButton = document.getElementById('resetButton');

// Define missing variables for the pie chart
let statusPieChart = null;

// Define missing status mappings
const STATUS_TO_LABEL = {
    0: 'Healthy',
    1: 'Warning',
    2: 'Alert'
};

const LABEL_TO_STATUS = {
    'Healthy': 0,
    'Warning': 1,
    'Alert': 2
};

const STATUS_COLORS = {
    'Healthy': '#10b981',     // Green
    'Warning': '#f59e0b',     // Yellow/Orange
    'Alert': '#ef4444'        // Red
};

// Add missing event listeners so the filters actually trigger the refresh
if (searchInput) searchInput.addEventListener('input', refresh);
if (statusFilter) statusFilter.addEventListener('change', refresh);
if (sortSelect) sortSelect.addEventListener('change', refresh);

// reset button
if (resetButton) {
    resetButton.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        if (statusFilter) statusFilter.value = '';
        if (sortSelect) sortSelect.value = 'az';

        refresh();
    });
}

function getStatusBadge(status) {
    if (status === 0) return '<span class="badge badge-healthy">🟢 Healthy</span>';
    if (status === 1) return '<span class="badge badge-warning">🟡 Warning</span>';
    if (status === 2) return '<span class="badge badge-intervention">🔴 Alert</span>';
    return '<span class="badge">Unknown</span>';
}

// Format a UTC ISO timestamp as a human-readable relative time
function relativeTime(isoString) {
    if (!isoString) return 'N/A';
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? 's' : ''} ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
}

// Get status label from integer
function getStatusLabel(statusInt) {
    return STATUS_TO_LABEL[Number(statusInt)] ?? null;
}

// Fetch patients from database
async function fetchPatients() {
    const { data: users, error: dbError } = await supabase
        .from('users')
        .select('id, name, age, gender, weight, height, status, updated_at')
        .eq('is_admin', false)
        .order('updated_at', { ascending: false });

    if (dbError) throw dbError;
    
    return users || [];
}

// Apply search, filter, and sort to get displayed list
async function getFilteredAndSortedPatients() {
    let list = await fetchPatients()

    // Search by name
    const search = (searchInput?.value || '').trim().toLowerCase();
    if (search) {
        list = list.filter(p => (p.name || '').toLowerCase().includes(search));
    }

    // Filter by status label (Healthy, Warning, Alert)
    const filterLabel = statusFilter?.value ?? '';
    if (filterLabel) {
        const statusInt = LABEL_TO_STATUS[filterLabel];
        if (statusInt !== undefined) {
            list = list.filter(p => Number(p.status) === statusInt);
        }
    }

    // Sort alphabetically by name
    const sortDir = sortSelect?.value ?? 'az';
    list.sort((a, b) => {
        const na = (a.name || '').toLowerCase();
        const nb = (b.name || '').toLowerCase();
        return sortDir === 'za' ? nb.localeCompare(na) : na.localeCompare(nb);
    });

    return list;
}

// Build status distribution for pie chart from filtered patients
function getStatusDistribution(patients) {
    const dist = { Healthy: 0, Warning: 0, Alert: 0 };
    for (const p of patients) {
        const label = getStatusLabel(p.status);
        if (label && dist[label] !== undefined) dist[label]++;
    }
    return dist;
}

// Render the table
function renderTable(patients) {
    if (!patients || patients.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#6b7280;padding:2rem;">No patients match your search or filter.</td></tr>';
        return;
    }

    tableBody.innerHTML = patients.map(user => {
        const bmi = (user.weight && user.height)
            ? (user.weight / ((user.height / 100) ** 2)).toFixed(1)
            : '-';
        return `
            <tr>
                <td>${escapeHtml(user.name || user.id)}</td>
                <td>${relativeTime(user.updated_at)}</td>
                <td>${user.age ?? '-'}</td>
                <td>${bmi}</td>
                <td>${getStatusBadge(user.status)}</td>
                <td>
                    <a href="userDashboard.html?userId=${escapeHtml(user.id)}" class="btn-view">View</a>
                </td>
            </tr>
        `;
    }).join('');
}

function escapeHtml(val) {
    if (val == null) return '';
    return String(val)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

// Update pie chart with filtered data
function updatePieChart(patients) {
    const dist = getStatusDistribution(patients);
    const labels = [];
    const data = [];
    const colors = [];
    const statusOrder = ['Healthy', 'Warning', 'Alert'];

    for (const label of statusOrder) {
        const count = dist[label] || 0;
        if (count > 0) {
            labels.push(`${label} (${count})`);
            data.push(count);
            colors.push(STATUS_COLORS[label]);
        }
    }

    const ctx = document.getElementById('statusPieChart');
    if (!ctx) return;

    if (statusPieChart) statusPieChart.destroy();

    if (data.length === 0) {
        statusPieChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['No data'],
                datasets: [{ data: [1], backgroundColor: ['#e5e7eb'], borderWidth: 0 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
        const legendEl = document.getElementById('pieChartLegend');
        if (legendEl) legendEl.innerHTML = '';
        return;
    }

    statusPieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                            return ` ${ctx.raw} patients (${pct}%)`;
                        }
                    }
                }
            }
        }
    });

    // Update custom legend labels: "Healthy (1) 100%"
    const legendEl = document.getElementById('pieChartLegend');
    if (legendEl) {
        const total = data.reduce((a, b) => a + b, 0);
        legendEl.innerHTML = statusOrder
            .filter(label => (dist[label] || 0) > 0)
            .map(label => {
                const count = dist[label];
                const pctVal = total ? (count / total) * 100 : 0;
                const pctStr = pctVal % 1 === 0 ? String(Math.round(pctVal)) : pctVal.toFixed(1);
                const color = STATUS_COLORS[label];
                return `<span class="pie-chart-legend-item"><span class="legend-dot" style="background:${color}"></span>${label} ${pctStr}%</span>`;
            })
            .join('');
    }
}

// Refresh table and pie chart from current filters
async function refresh() {
    try {
        loading.classList.remove('hidden');
        error.classList.add('hidden');
        
        const filtered = await getFilteredAndSortedPatients();
        renderTable(filtered);
        updatePieChart(filtered);
    } catch (err) {
        error.textContent = 'Unable to load data: ' + err.message;
        error.classList.remove('hidden');
        console.error(err);
    } finally {
        loading.classList.add('hidden');
    }
}

async function loadDashboard() {
    await refresh();
}

loadDashboard();