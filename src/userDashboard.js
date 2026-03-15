import './style.css';
import { supabase, getUserProfile, getUserMeals } from './supabase.js';
import { generateDashboardInsights } from './ai-service.js';
import { initAuthGuard, isAdmin, getCurrentUser } from './auth-guard.js';

// Initialize Authentication Guard
initAuthGuard();

const state = {
    viewMode: 'week',
    offset: 0,
    chartInstance: null,
    budget: 2000,
    userDB: {},
    targetUserId: null // Keeps track of whose data we are currently viewing
};

function toggleLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = show ? 'flex' : 'none';
}

// ===== DATA FETCHING =====

async function fetchUserProfileAndBudget(userId) {
    if (!userId) return null;

    try {
        const profile = await getUserProfile(userId);

        if (profile && profile.weight && profile.height && profile.age && profile.gender) {
            // Calculate BMR and TDEE budget
            let bmr = (10 * profile.weight) + (6.25 * profile.height) - (5 * profile.age);
            if (profile.gender.toLowerCase() === 'male') bmr += 5;
            else bmr -= 161;

            const tdee = Math.round(bmr * 1.2);
            state.budget = tdee > 0 ? tdee : 2000;
        }
        return profile;
    } catch (error) {
        console.error('Error fetching user profile for budget:', error);
        return null;
    }
}

async function fetchUserNutritionData(userId) {
    if (!userId) return {};

    try {
        // Direct query to aggregate data nicely for the charts
        const { data, error } = await supabase
            .from('meals')
            .select(`
                created_at,
                nutritions (*) 
            `)
            .eq('user_id', userId);

        if (error) throw error;

        const processedData = {};

        const mainKeys = ['calories_kcal', 'protein_g', 'total_carbs_g', 'total_fat_g', 'total_sugar_g'];
        const ignoreKeys = ['id', 'serving_size_g'];

        if (data && data.length > 0) {
            data.forEach(entry => {
                if (!entry.nutritions) return;

                const date = new Date(entry.created_at);
                const dateStr = date.getFullYear() + '-' +
                    String(date.getMonth() + 1).padStart(2, '0') + '-' +
                    String(date.getDate()).padStart(2, '0');

                if (!processedData[dateStr]) {
                    processedData[dateStr] = { main: { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0 }, extra: {} };
                }

                // Main 5 nutrients
                processedData[dateStr].main.calories += entry.nutritions.calories_kcal || 0;
                processedData[dateStr].main.protein += entry.nutritions.protein_g || 0;
                processedData[dateStr].main.carbs += entry.nutritions.total_carbs_g || 0;
                processedData[dateStr].main.fat += entry.nutritions.total_fat_g || 0;
                processedData[dateStr].main.sugar += entry.nutritions.total_sugar_g || 0;

                // Extra nutrients (View More)
                Object.keys(entry.nutritions).forEach(key => {
                    if (!mainKeys.includes(key) && !ignoreKeys.includes(key) && entry.nutritions[key] !== null) {
                        if (!processedData[dateStr].extra[key]) processedData[dateStr].extra[key] = 0;
                        processedData[dateStr].extra[key] += entry.nutritions[key];
                    }
                });
            });
        }
        return processedData;
    } catch (error) {
        console.error('Error fetching nutrition data:', error);
        return {};
    }
}

// ===== INITIALIZATION & EVENTS =====

document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    toggleLoading(true);

    try {
        // 1. Resolve Target User ID using actual Supabase auth state
        const currentUser = await getCurrentUser();

        // If Supabase says no one is logged in, boot them to the homepage
        if (!currentUser || !currentUser.id) {
            window.location.href = 'index.html';
            return;
        }

        const loggedInUserId = currentUser.id;
        const urlParams = new URLSearchParams(window.location.search);
        const requestedUserId = urlParams.get('userId');

        // Check if an Admin is trying to view a specific patient
        if (requestedUserId && requestedUserId !== loggedInUserId) {
            const adminStatus = await isAdmin();
            if (adminStatus) {
                state.targetUserId = requestedUserId;

                const navbarBrand = document.querySelector('.navbar-brand');
                if (navbarBrand) {
                    navbarBrand.innerHTML = `
                        <h1><i class="fas fa-heartbeat"></i> Nutrition Tracker - Admin Portal</h1>
                        <div class="navbar-links"></div>
                    `;
                }
            
                // Hide the patient-facing subtitle
                const subtitleEl = document.querySelector('.page-header > p:first-of-type');
                if (subtitleEl) subtitleEl.style.display = 'none';
            
                // Restructure the header into a flex row
                const pageHeader = document.querySelector('.page-header');
                if (pageHeader) {
                    pageHeader.style.cssText = 'display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap;';
                }
            
                // Move h2 content — replace the icon+title with just the icon+title (no back button here)
                const h2El = document.querySelector('.page-header h2');
                if (h2El) h2El.style.display = 'none';
            
                // Inject "Viewing Patient Profile" on the LEFT and "Back to Admin Portal" on the RIGHT
                const adminBar = document.createElement('div');
                adminBar.id = 'adminHeaderBar';
                adminBar.style.cssText = 'width: 100%; display: flex; align-items: center; justify-content: space-between; margin-top: 0.75rem;';
                
                adminBar.innerHTML = `
                    <a href="dashboard.html" class="admin-portal-back-link">
                        <i class="fas fa-arrow-left"></i> Back to Admin Portal
                    </a>
                `;
                pageHeader.appendChild(adminBar);
            } else {
                // If a normal user tries to snoop another ID, default them back to their own
                state.targetUserId = loggedInUserId;
            }
        } else {
            state.targetUserId = loggedInUserId;
        }

        // 2. Fetch Data
        const [userDB, profile] = await Promise.all([
            fetchUserNutritionData(state.targetUserId),
            fetchUserProfileAndBudget(state.targetUserId)
        ]);

        state.userDB = userDB;

        // 3. Update UI to reflect who we are viewing
        if (profile && state.targetUserId !== loggedInUserId) {
            const displayEl = document.getElementById('currentUserDisplay');
            if (displayEl) {
                displayEl.innerHTML = `<i class="fas fa-user-md" style="color: black;"></i><span style="color:black;"> Viewing Patient Profile: </span> <strong style="color:black;">${profile.name || 'Unknown Patient'}</strong>`;
                displayEl.style.color = "#ef4444"; // Red to clearly indicate admin view
            }
        }
    } catch (err) {
        console.error("Initialization error:", err);
    } finally {
        toggleLoading(false);
    }

    updateDashboard();

    // Load AI insights asynchronously after UI renders
    loadAIInsights();
});

function setupEventListeners() {
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.viewMode = e.target.dataset.view;
            state.offset = 0;
            updateDashboard();
        });
    });

    function bindViewMore(btnId, wrapperId) {
        document.getElementById(btnId)?.addEventListener('click', function () {
            const wrapper = document.getElementById(wrapperId);
            const icon = this.querySelector('i');
            const text = this.querySelector('span');

            if (wrapper.style.gridTemplateRows === '0fr' || !wrapper.style.gridTemplateRows) {
                wrapper.style.gridTemplateRows = '1fr';
                text.innerText = 'View Less';
                icon.style.transform = 'rotate(180deg)';
            } else {
                wrapper.style.gridTemplateRows = '0fr';
                text.innerText = 'View More Nutrients';
                icon.style.transform = 'rotate(0deg)';
            }
        });
    }

    bindViewMore('toggleTodayExtraBtn', 'todayExtraWrapper');
    bindViewMore('togglePeriodExtraBtn', 'periodExtraWrapper');

    document.getElementById('prevDate').addEventListener('click', () => {
        state.offset -= 1;
        updateDashboard();
    });

    document.getElementById('nextDate').addEventListener('click', () => {
        if (state.offset < 0) {
            state.offset += 1;
            updateDashboard();
        }
    });
}

async function loadAIInsights() {
    const container = document.getElementById('insightsContainer');
    if (!container) return;
    container.innerHTML = '<p style="padding: 1rem; color: #6b7280;"><i class="fas fa-spinner fa-spin"></i> <em>Analyzing 14-day history to generate clinical insights...</em></p>';

    try {
        if (!state.targetUserId) {
            container.innerHTML = '<p>Unable to load patient ID.</p>';
            return;
        }

        const userProfile = await getUserProfile(state.targetUserId);
        const allUserMeals = await getUserMeals(state.targetUserId);

        // Filter for last 14 days
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
        const recentMeals = allUserMeals.filter(meal => new Date(meal.created_at) >= twoWeeksAgo);

        // Strip data to prevent 400 Bad Request Payload errors
        const summarizedTrendData = recentMeals.map(meal => ({
            date: new Date(meal.created_at).toLocaleDateString(),
            status: meal.status,
            calories: meal.nutritions?.calories_kcal || 0,
            carbs: meal.nutritions?.total_carbs_g || 0,
            protein: meal.nutritions?.protein_g || 0,
            fat: meal.nutritions?.total_fat_g || 0,
            sugar: meal.nutritions?.total_sugar_g || 0,
            sodium: meal.nutritions?.sodium_mg || 0
        }));

        // Generate Insights
        const aiData = await generateDashboardInsights(userProfile, summarizedTrendData);

        // 1. Update the overall status banner with AI status code
        updateOverallStatus(aiData.user_status);

        // 2. Add the Summary Text above the cards
        let summaryEl = document.getElementById('aiSummaryText');
        if (!summaryEl) {
            summaryEl = document.createElement('div');
            summaryEl.id = 'aiSummaryText';
            summaryEl.style.cssText = "margin-bottom: 1.5rem; padding: 1.2rem; background: #e0f2fe; border-left: 4px solid #0284c7; border-radius: 6px; color: #0369a1; font-size: 1.05rem; line-height: 1.5;";
            container.parentNode.insertBefore(summaryEl, container);
        }
        summaryEl.innerHTML = `<i class="fas fa-stethoscope"></i> <strong>Clinical Assessment:</strong> ${aiData.user_assessment_text}`;

        // 3. Render the dynamic Insight Cards
        container.innerHTML = '';

        const insightConfig = [
            { data: aiData.insight_good, type: 'success', icon: 'fa-check-circle' },
            { data: aiData.insight_improve, type: 'warning', icon: 'fa-arrow-up' },
            { data: aiData.insight_pattern, type: 'info', icon: 'fa-chart-pie' },
            { data: aiData.insight_risk, type: 'danger', icon: 'fa-exclamation-triangle' }
        ];

        let hasInsights = false;

        insightConfig.forEach(item => {
            if (!item.data || !item.data.heading || item.data.heading.trim() === '') return;

            hasInsights = true;
            const insightCard = document.createElement('div');
            insightCard.className = `insight-card insight-${item.type}`;
            insightCard.innerHTML = `
                <div class="insight-icon">
                    <i class="fas ${item.icon}"></i>
                </div>
                <div class="insight-content">
                    <h4>${item.data.heading}</h4>
                    <p>${item.data.description}</p>
                </div>
            `;
            container.appendChild(insightCard);
        });

        if (!hasInsights) {
            container.innerHTML = '<p style="padding: 1rem; color: #6b7280;">No specific clinical insights detected for this period.</p>';
        }

    } catch (error) {
        console.error("Failed to load AI Insights:", error);
        container.innerHTML = '<p style="color:red; padding: 1rem;">Failed to load AI insights. Check console for details.</p>';
    }
}

function updateOverallStatus(statusCode) {
    const statusContainer = document.getElementById('overallUserStatus');
    if (!statusContainer) return;

    if (statusCode === 2) {
        statusContainer.className = 'status-banner intervention';
        statusContainer.innerHTML = '<i class="fas fa-exclamation-triangle"></i> OVERALL STATUS: Intervention Needed (High Risk)';
    } else if (statusCode === 1) {
        statusContainer.className = 'status-banner warning';
        statusContainer.innerHTML = '<i class="fas fa-exclamation-circle"></i> OVERALL STATUS: Warning (Moderate Risk)';
    } else {
        statusContainer.className = 'status-banner healthy';
        statusContainer.innerHTML = '<i class="fas fa-check-circle"></i> OVERALL STATUS: Healthy (Good Management)';
    }
}

function updateDashboard() {
    const { startDate, endDate, label } = calculateDateRange(state.viewMode, state.offset);
    document.getElementById('dateLabel').innerText = label;

    const periodTitle = document.getElementById('dynamicPeriodTitle');
    if (state.viewMode === 'week') {
        periodTitle.innerHTML = '<i class="fas fa-calendar-week" style="color: var(--accent-blue)"></i> WEEKLY MACRONUTRIENTS (AVG)';
    } else {
        periodTitle.innerHTML = '<i class="fas fa-calendar-alt" style="color: var(--accent-green)"></i> MONTHLY MACRONUTRIENTS (AVG)';
    }

    const periodData = extractDataForPeriod(startDate, endDate);
    updateStats(periodData);
    renderChart(periodData, startDate, endDate);
    updateTodayStatus();

    document.getElementById('nextDate').style.opacity = state.offset === 0 ? '0.3' : '1';
    document.getElementById('nextDate').style.cursor = state.offset === 0 ? 'not-allowed' : 'pointer';
}

function calculateDateRange(mode, offset) {
    const now = new Date();
    let startDate, endDate, label;

    if (mode === 'week') {
        const dayOfWeek = now.getDay() || 7;
        now.setDate(now.getDate() - dayOfWeek + 1 + (offset * 7));
        startDate = new Date(now.setHours(0, 0, 0, 0));
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);

        if (offset === 0) label = "This week";
        else if (offset === -1) label = "Last week";
        else label = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    } else {
        now.setMonth(now.getMonth() + offset);
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        if (offset === 0) label = "This month";
        else if (offset === -1) label = "Last month";
        else label = startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    return { startDate, endDate, label };
}

function extractDataForPeriod(start, end) {
    const result = [];
    let current = new Date(start);

    while (current <= end) {
        const dateStr = current.getFullYear() + '-' +
            String(current.getMonth() + 1).padStart(2, '0') + '-' +
            String(current.getDate()).padStart(2, '0');

        const dayData = state.userDB[dateStr] || { main: { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0 }, extra: {} };
        result.push({
            dateStr: dateStr,
            dateObj: new Date(current),
            ...dayData.main,
            extra: dayData.extra
        });
        current.setDate(current.getDate() + 1);
    }
    return result;
}

function updateStats(periodData) {
    let totalMain = { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0 };
    let totalExtra = {};
    let daysWithData = 0;

    periodData.forEach(day => {
        if (day.calories > 0) {
            totalMain.calories += day.calories;
            totalMain.protein += day.protein;
            totalMain.carbs += day.carbs;
            totalMain.fat += day.fat;
            totalMain.sugar += day.sugar;

            Object.keys(day.extra).forEach(key => {
                if (!totalExtra[key]) totalExtra[key] = 0;
                totalExtra[key] += day.extra[key];
            });
            daysWithData++;
        }
    });

    const divisor = daysWithData || 1;

    document.getElementById('avgCaloriesLabel').innerText = `${Math.round(totalMain.calories).toLocaleString()} cals in - ${Math.round(totalMain.calories / divisor).toLocaleString()} cals/day (Avg)`;

    const grid = document.getElementById('periodMacrosGrid');
    grid.innerHTML = `
        <div class="macro-card" style="box-shadow: 0 1px 3px rgba(0,0,0,0.05); border: 1px solid var(--border-color);"><i class="fas fa-fire c-cal" style="font-size:1.5rem; margin-bottom:8px;"></i><div class="macro-label">Calories</div><div class="macro-value c-cal">${Math.round(totalMain.calories / divisor)}</div></div>
        <div class="macro-card" style="box-shadow: 0 1px 3px rgba(0,0,0,0.05); border: 1px solid var(--border-color);"><i class="fas fa-egg c-pro" style="font-size:1.5rem; margin-bottom:8px;"></i><div class="macro-label">Protein</div><div class="macro-value c-pro">${Math.round(totalMain.protein / divisor)}g</div></div>
        <div class="macro-card" style="box-shadow: 0 1px 3px rgba(0,0,0,0.05); border: 1px solid var(--border-color);"><i class="fas fa-bread-slice c-carb" style="font-size:1.5rem; margin-bottom:8px;"></i><div class="macro-label">Carbs</div><div class="macro-value c-carb">${Math.round(totalMain.carbs / divisor)}g</div></div>
        <div class="macro-card" style="box-shadow: 0 1px 3px rgba(0,0,0,0.05); border: 1px solid var(--border-color);"><i class="fas fa-cheese c-fat" style="font-size:1.5rem; margin-bottom:8px;"></i><div class="macro-label">Fat</div><div class="macro-value c-fat">${Math.round(totalMain.fat / divisor)}g</div></div>
        <div class="macro-card" style="box-shadow: 0 1px 3px rgba(0,0,0,0.05); border: 1px solid var(--border-color);"><i class="fas fa-candy-cane c-sug" style="font-size:1.5rem; margin-bottom:8px;"></i><div class="macro-label">Sugar</div><div class="macro-value c-sug">${Math.round(totalMain.sugar / divisor)}g</div></div>
    `;

    renderExtraMacros(totalExtra, divisor, 'periodExtraContainer', 'togglePeriodExtraBtn', 'periodExtraWrapper');
}

function updateTodayStatus() {
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

    const todayData = state.userDB[todayStr] ? state.userDB[todayStr] : { main: { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0 }, extra: {} }; 

    const titleEl = document.getElementById('todayStatusTitle');
    const calText = document.getElementById('todayCalText');
    const budgetText = document.getElementById('todayBudgetText');
    const gaugeEl = document.getElementById('calorieGauge');

    const consumed = Math.round(todayData.main.calories);
    const target = Math.round(state.budget);
    const remaining = target - consumed;

    let statusColor = "#10b981";
    if (consumed === 0) {
        titleEl.innerText = "TODAY - NO DATA";
        titleEl.style.color = "#6b7280";
        statusColor = "#111827"; 
        gaugeEl.style.setProperty('--gauge-color', '#9ca3af');
    } else if (consumed > target + 200) {
        titleEl.innerText = "TODAY - OVER BUDGET";
        titleEl.style.color = "#ef4444";
        statusColor = "#ef4444"; 
        gaugeEl.style.setProperty('--gauge-color', '#ef4444');
    } else if (consumed < target - 500) {
        titleEl.innerText = "TODAY - UNDER TARGET";
        titleEl.style.color = "#ff9966";
        statusColor = "#ff9966"; 
        gaugeEl.style.setProperty('--gauge-color', '#ff9966');
    } else {
        titleEl.innerText = "TODAY - HEALTHY";
        titleEl.style.color = "#10b981";
        statusColor = "#10b981"; 
        gaugeEl.style.setProperty('--gauge-color', '#10b981');
    }

    let progressPercentage = Math.min((consumed / target) * 100, 100);
    gaugeEl.style.setProperty('--progress', consumed === 0 ? '0' : progressPercentage);

    calText.innerHTML = `
        <span style="font-size: clamp(2rem, 4vw, 2.8rem); font-weight: 900; color: ${statusColor}; line-height: 1; letter-spacing: -1px;">${consumed}</span>
        <span style="font-size: clamp(1rem, 2vw, 1.3rem); color: #6b7280; font-weight: 600;">/ ${target}</span>
        <span style="font-size: 0.9rem; color: #9ca3af; font-weight: 500; margin-left: 2px;">kcal</span>
    `;

    if (remaining >= 0) {
        budgetText.innerHTML = `<i class="fas fa-check-circle" style="color: #10b981; margin-right: 4px;"></i> ${remaining} cal left`;
    } else {
        budgetText.innerHTML = `<i class="fas fa-exclamation-triangle" style="color: #ef4444; margin-right: 4px;"></i> ${Math.abs(remaining)} cal over`;
    }

    const dynamicTargets = {
        pro: Math.round((target * 0.20) / 4),
        carb: Math.round((target * 0.50) / 4),
        fat: Math.round((target * 0.30) / 9),
        sug: Math.round((target * 0.10) / 4)
    };

    document.getElementById('todayMacroLines').innerHTML = `
        ${createMacroLine('Protein', todayData.main.protein, dynamicTargets.pro, '#ec4899')}
        ${createMacroLine('Carbs', todayData.main.carbs, dynamicTargets.carb, '#f59e0b')}
        ${createMacroLine('Fat', todayData.main.fat, dynamicTargets.fat, '#3b82f6')}
        ${createMacroLine('Sugar', todayData.main.sugar, dynamicTargets.sug, '#a855f7')}
    `;

    renderExtraMacros(todayData.extra, 1, 'todayExtraContainer', 'toggleTodayExtraBtn', 'todayExtraWrapper');
}

function createMacroLine(name, value, target, color) {
    const val = Math.round(value);
    const pct = Math.min((val / target) * 100, 100);
    return `
        <div style="display: flex; align-items: center; gap: 15px;">
            <div style="width: 55px; font-size: 0.85rem; font-weight: 600; color: #6b7280;">${name}</div>
            <div style="flex-grow: 1; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;">
                <div style="height: 100%; border-radius: 4px; transition: width 0.5s ease-out; background-color: ${color}; width: ${pct}%;"></div>
            </div>
            <div style="width: 45px; text-align: right; font-size: 0.9rem; font-weight: 700; color: ${color};">${val}g</div>
        </div>
    `;
}

function renderExtraMacros(extraData, divisor, containerId, btnId, wrapperId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    let hasExtra = false;

    Object.keys(extraData).forEach(key => {
        const avgValue = Math.round(extraData[key] / divisor);
        if (avgValue > 0) {
            hasExtra = true;
            let unit = '';
            let name = key;
            if (key.endsWith('_g')) { unit = 'g'; name = key.slice(0, -2); }
            else if (key.endsWith('_ml')) { unit = 'ml'; name = key.slice(0, -3); }
            else if (key.endsWith('_mg')) { unit = 'mg'; name = key.slice(0, -3); }
            else if (key.endsWith('_mcg')) { unit = 'mcg'; name = key.slice(0, -4); }
            else if (key.endsWith('_kcal')) { unit = 'kcal'; name = key.slice(0, -5); }

            name = name.replace('total_', '').replace(/_/g, ' ');
            name = name.replace(/\b\w/g, l => l.toUpperCase());

            container.innerHTML += `
                <div class="macro-card extra-mini-card" style="padding: 1rem 0.5rem; border: 1px dashed #d1d5db; box-shadow: none; background: #f9fafb;">
                    <div class="macro-label" style="font-size: 0.65rem; color: #9ca3af; margin-bottom: 0.25rem;">${name}</div>
                    <div class="macro-value" style="font-size: 1.1rem; font-weight: 600; color: #374151;">${avgValue}${unit}</div>
                </div>
            `;
        }
    });

    const btn = document.getElementById(btnId);
    const wrapper = document.getElementById(wrapperId);
    if (btn) {
        btn.parentElement.style.display = hasExtra ? 'block' : 'none';
        if (!hasExtra) {
            wrapper.style.gridTemplateRows = '0fr';
            btn.querySelector('span').innerText = 'View More Nutrients';
            btn.querySelector('i').style.transform = 'rotate(0deg)';
        }
    }
}

function renderChart(periodData, start, end) {
    const ctx = document.getElementById('mainChart').getContext('2d');
    const labels = [];
    const dataPoints = [];
    const backgroundColors = [];

    periodData.forEach(day => {
        if (state.viewMode === 'week') {
            labels.push(day.dateObj.toLocaleDateString('en-US', { weekday: 'short' }));
        } else {
            labels.push(day.dateObj.getDate().toString());
        }

        dataPoints.push(Math.round(day.calories));

        if (day.calories === 0) {
            backgroundColors.push('rgba(0,0,0,0.03)');
        } else if (day.calories > state.budget + 200) {
            backgroundColors.push('#ef4444');
        } else if (day.calories < state.budget - 500) {
            backgroundColors.push('#ff9966');
        } else {
            backgroundColors.push('#10b981');
        }
    });

    if (state.chartInstance) state.chartInstance.destroy();

    state.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                data: dataPoints,
                backgroundColor: backgroundColors,
                borderRadius: 4,
                borderSkipped: false,
                barPercentage: state.viewMode === 'week' ? 0.6 : 0.8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: function (context) { return `${context.raw} kcal`; } } }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: '#e5e7eb', drawBorder: false },
                    ticks: { color: '#6b7280', callback: value => value >= 1000 ? (value / 1000).toFixed(1) + 'k' : value }
                },
                x: {
                    grid: { display: false, drawBorder: false },
                    ticks: { color: '#6b7280' }
                }
            },
            animation: { duration: 400 }
        }
    });
}