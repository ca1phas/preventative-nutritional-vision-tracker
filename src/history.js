import { supabase } from './supabase.js';
import { initAuthGuard, getCurrentUser } from './auth-guard.js';

// Initialize route protection
initAuthGuard();

const DEFAULT_MEAL_IMAGE = '/images/hero-background.jpg';

// DOM Elements
const historyUserDisplay = document.getElementById('historyUserDisplay');
const historyDateFilter = document.getElementById('historyDateFilter');
const historyDateClear = document.getElementById('historyDateClear');
const historyCards = document.getElementById('historyCards');
const historyEmptyState = document.getElementById('historyEmptyState');

let currentUserId = null;

// Initialize Page
initializeHistoryPage();

async function initializeHistoryPage() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      console.error('No authenticated user found. Redirecting should be handled by auth-guard.');
      return;
    }

    currentUserId = user.id;


    // Load all meals initially
    await loadMeals('');

    // Event Listeners for Filters
    historyDateFilter.addEventListener('change', () => {
      loadMeals(historyDateFilter.value);
    });

    historyDateClear.addEventListener('click', () => {
      historyDateFilter.value = '';
      loadMeals('');
    });

  } catch (error) {
    console.error('Error initializing history page:', error);
  }
}

async function loadMeals(selectedDate) {
  historyCards.innerHTML = '';
  historyEmptyState.classList.add('hidden');

  // Base query tied securely to the authenticated user's ID
  let query = supabase
    .from('meals')
    .select('id, user_id, nutrition_id, image_url, status, created_at, updated_at')
    .eq('user_id', currentUserId)
    .order('created_at', { ascending: false }); // Best practice for history: newest first

  if (selectedDate) {
    const start = `${selectedDate}T00:00:00`;
    const end = `${selectedDate}T23:59:59.999`;
    query = query.gte('created_at', start).lte('created_at', end);
  }

  const { data: mealsData, error } = await query;

  if (error) {
    console.error('Error loading meals:', error);
    historyEmptyState.classList.remove('hidden');
    return;
  }

  const meals = Array.isArray(mealsData) ? mealsData : [];
  const mealIds = meals.map((meal) => meal.id).filter(Boolean);

  let foodItemsByMealId = {};

  // Only query food items if we actually found meals
  if (mealIds.length > 0) {
    const { data: foodItems, error: foodItemsError } = await supabase
      .from('food_items')
      .select('id, meal_id, nutrition_id, food_name, created_at, updated_at')
      .in('meal_id', mealIds)
      .order('created_at', { ascending: true });

    if (foodItemsError) {
      console.error('Error loading food items for history:', foodItemsError);
    } else {
      foodItemsByMealId = (foodItems || []).reduce((groups, item) => {
        if (!groups[item.meal_id]) {
          groups[item.meal_id] = [];
        }
        groups[item.meal_id].push(item);
        return groups;
      }, {});
    }
  }

  // Combine meals with their respective food items
  const enrichedMeals = meals.map((meal) => ({
    ...meal,
    foodItems: foodItemsByMealId[meal.id] || [],
  }));

  renderMeals(enrichedMeals, selectedDate);
}

function renderMeals(meals, selectedDate) {
  historyCards.innerHTML = '';

  if (!meals.length) {
    historyEmptyState.classList.remove('hidden');
    return;
  }

  historyEmptyState.classList.add('hidden');

  if (selectedDate) {
    const grid = document.createElement('div');
    grid.className = 'history-cards-grid';
    meals.forEach((meal) => {
      grid.appendChild(buildMealCard(meal));
    });
    historyCards.appendChild(grid);
    return;
  }

  const groupedMeals = groupMealsByDate(meals);
  // Sort dates descending so newest dates appear first
  const orderedDateKeys = Object.keys(groupedMeals).sort((left, right) => {
    return new Date(right).getTime() - new Date(left).getTime();
  });

  orderedDateKeys.forEach((dateKey, index) => {
    const section = document.createElement('section');
    section.className = 'history-date-group';

    const heading = document.createElement('h3');
    heading.className = 'history-date-heading';
    heading.innerHTML = `<i class="fas fa-calendar-day"></i> ${formatDateHeading(dateKey)}`;
    section.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'history-cards-grid';
    groupedMeals[dateKey].forEach((meal) => {
      grid.appendChild(buildMealCard(meal));
    });
    section.appendChild(grid);
    historyCards.appendChild(section);

    if (index < orderedDateKeys.length - 1) {
      const separator = document.createElement('hr');
      separator.className = 'history-date-separator';
      historyCards.appendChild(separator);
    }
  });
}

function buildMealCard(meal) {
  const card = document.createElement('article');
  card.className = 'history-meal-card';

  const status = normalizeStatus(meal.status);
  const dateValue = new Date(meal.created_at);
  const foodNames = meal.foodItems.map((item) => item.food_name).filter(Boolean);
  const foodNameText = foodNames.length > 0 ? foodNames.join(', ') : 'Unnamed meal';
  const isRiceCard = /\brice\b/i.test(foodNameText) && /\blong-grain\b/i.test(foodNameText);
  const titleClassName = isRiceCard ? 'history-card-title history-card-title-rice-gap' : 'history-card-title';

  // Point to output/details view with specific ID
  const outputUrl = `output.html?mealId=${encodeURIComponent(meal.id)}`;

  card.innerHTML = `
    <div class="history-card-image-wrap">
      <img src="${escapeAttribute(meal.image_url || DEFAULT_MEAL_IMAGE)}" alt="Meal image" class="history-card-image" />
    </div>
    <div class="history-card-content">
      <h4 class="${titleClassName}">${escapeHtml(foodNameText)}</h4>
      <div class="history-meta-row">
        <span class="history-meta-item"><i class="fas fa-calendar-alt"></i> ${formatCardDate(dateValue)}</span>
        <span class="history-meta-item"><i class="fas fa-clock"></i> ${formatCardTime(dateValue)}</span>
      </div>
      <div class="history-card-actions">
        <button class="history-status-btn status-${status}" type="button">${statusLabel(status)}</button>
        <a href="${outputUrl}" class="history-view-link">View more</a>
      </div>
    </div>
  `;

  // Make the entire card clickable
  card.addEventListener('click', (event) => {
    if (event.target.closest('.history-view-link')) {
      return;
    }
    window.location.href = outputUrl;
  });

  return card;
}

function groupMealsByDate(meals) {
  return meals.reduce((groups, meal) => {
    const dateKey = toDateKey(meal.created_at);
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(meal);
    return groups;
  }, {});
}

function normalizeStatus(statusValue) {
  const numericStatus = Number(statusValue);
  if (numericStatus === 0) return 'healthy';
  if (numericStatus === 1) return 'warning';
  if (numericStatus === 2) return 'intervention';

  const stringStatus = String(statusValue || '').toLowerCase();
  if (stringStatus === 'healthy' || stringStatus === 'warning' || stringStatus === 'intervention') {
    return stringStatus;
  }

  return 'healthy';
}

function statusLabel(status) {
  if (status === 'warning') return 'Alert';
  if (status === 'intervention') return 'Intervention';
  return 'Healthy';
}

function toDateKey(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateHeading(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatCardDate(date) {
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

function formatCardTime(date) {
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}