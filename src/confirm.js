import { searchUSDA, mapToNutritionSchema, generateMealAssessment } from './ai-service.js';
import { logCompleteMeal, uploadMealImage, getUserProfile, logoutUser } from './supabase.js';
import { getCurrentUser, initAuthGuard } from './auth-guard.js';

// Protect the route
initAuthGuard();

const ingredientList = document.getElementById('ingredientList');
const addItemBtn = document.getElementById('addItemBtn');
const confirmBtn = document.getElementById('confirmBtn');
const rejectBtn = document.getElementById('rejectBtn');
const loading = document.getElementById('loading');
const error = document.getElementById('error');
const success = document.getElementById('success');
const actions = document.getElementById('actions');
const jsonPreview = document.getElementById('jsonPreview');
const uploadedImagePreview = document.getElementById('uploadedImagePreview');
const confirmPreviewImg = document.getElementById('confirmPreviewImg');

const uploadedImage = JSON.parse(sessionStorage.getItem('uploadedImage') || 'null');
let rawIngredients = JSON.parse(sessionStorage.getItem('ingredients') || '[]');

if (!uploadedImage) window.location.href = 'upload.html';

let ingredients = rawIngredients.map(item => ({
    item: item.food_name || item.item || '',
    portion: item.portion || 1,
    serving_size_g: item.serving_size_g || 100
}));

if (ingredients.length === 0) {
    ingredients = [{ item: 'Unknown food', portion: 1, serving_size_g: 100 }];
}

if (uploadedImage?.dataUrl) {
    confirmPreviewImg.src = uploadedImage.dataUrl;
    uploadedImagePreview.classList.remove('hidden');
}

renderIngredientRows();
updateJsonPreview();

// ===== EVENT LISTENERS =====
addItemBtn.addEventListener('click', () => {
    ingredients.push({ item: '', portion: 1, serving_size_g: 100 });
    renderIngredientRows();
    updateJsonPreview();
});

ingredientList.addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-action="remove-item"]');
    if (!removeButton) return;
    const index = Number(removeButton.getAttribute('data-index'));
    ingredients.splice(index, 1);
    if (ingredients.length === 0) ingredients.push({ item: '', portion: 1, serving_size_g: 100 });
    renderIngredientRows();
    updateJsonPreview();
});

ingredientList.addEventListener('input', () => {
    ingredients = collectFoodItemsFromInputs();
    updateJsonPreview();
});

rejectBtn.addEventListener('click', () => {
    sessionStorage.removeItem('uploadedImage');
    sessionStorage.removeItem('ingredients');
    window.location.href = 'upload.html';
});

// ===== CORE: AI ANALYSIS + SUPABASE SAVE =====
confirmBtn.addEventListener('click', async () => {
    error.classList.add('hidden');
    success.classList.add('hidden');

    ingredients = collectFoodItemsFromInputs();
    const validationError = validateFoodItems(ingredients);
    if (validationError) { showError(validationError); return; }

    loading.classList.remove('hidden');
    actions.classList.add('hidden');

    try {
        // 1. Get the securely authenticated user
        const currentUser = await getCurrentUser();
        if (!currentUser) throw new Error("User session expired. Please log in again.");

        const loadingText = loading.querySelector('p');

        // 2. Upload the physical image to Supabase Storage FIRST
        let finalImageUrl = null;
        if (uploadedImage && uploadedImage.dataUrl) {
            loadingText.textContent = 'Uploading image securely...';
            finalImageUrl = await uploadMealImage(
                uploadedImage.dataUrl,
                uploadedImage.name || 'meal.jpg',
                currentUser.id
            );
        }

        loadingText.textContent = 'Estimating nutrition...';
        const finalNutritionData = [];

        // 3. USDA + AI mapping per food item
        for (const food of ingredients) {
            const aiFoodItem = {
                food_name: food.item,
                serving_size_g: food.serving_size_g * food.portion
            };
            const usdaResults = await searchUSDA(aiFoodItem.food_name);
            const nutritionRecord = await mapToNutritionSchema(aiFoodItem, usdaResults);
            finalNutritionData.push(nutritionRecord);
        }

        loadingText.textContent = 'Evaluating meal against health profile...';

        // 4. Fetch the user's clinical profile for personalized assessment
        const userProfile = await getUserProfile(currentUser.id);

        const aggregatedNutrition = finalNutritionData.reduce((acc, item) => {
            Object.keys(item).forEach(key => {
                if (typeof item[key] === 'number') acc[key] = (acc[key] || 0) + item[key];
            });
            return acc;
        }, {});

        const aiAssessment = await generateMealAssessment(userProfile, aggregatedNutrition);
        const mealStatus = aiAssessment.meal_status;
        const mealAssessmentText = aiAssessment.meal_assessment_text;

        loadingText.textContent = 'Saving meal data...';

        // 5. Save everything to Database
        const savedMeal = await logCompleteMeal(
            currentUser.id,
            finalImageUrl,
            finalNutritionData,
            mealStatus,
            mealAssessmentText
        );

        success.textContent = 'Meal saved successfully!';
        success.classList.remove('hidden');

        // Clear session storage now that we are done
        sessionStorage.removeItem('uploadedImage');
        sessionStorage.removeItem('ingredients');

        // Redirect properly using `mealId`
        setTimeout(() => {
            window.location.href = `output.html?mealId=${savedMeal.id}`;
        }, 1000);

    } catch (err) {
        console.error('Error:', err);
        showError('Error: ' + err.message);
        actions.classList.remove('hidden');
    } finally {
        loading.classList.add('hidden');
        if (loading.querySelector('p')) {
            loading.querySelector('p').textContent = 'Estimating nutrition and submitting...';
        }
    }
});

// ===== LOGOUT HANDLER =====
document.getElementById('logoutBtn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const button = e.target;
    button.disabled = true;
    button.textContent = 'Logging out...';

    try {
        await logoutUser();
        window.location.replace('index.html');
    } catch (err) {
        console.error('Logout error:', err);
        alert('Logout failed: ' + err.message);
        button.disabled = false;
        button.textContent = 'Logout';
    }
});

// ===== HELPERS =====
function renderIngredientRows() {
    ingredientList.innerHTML = ingredients.map((item, index) => `
        <div class="ingredient-row">
            <div class="ingredient-content">
                <div class="ingredient-line ingredient-line-name">
                    <span class="ingredient-label">Food Name:</span>
                    <input type="text" class="item-name" placeholder="Food name" value="${escapeHtml(item.item || '')}" />
                </div>
                <div class="ingredient-line ingredient-line-meta">
                    <span class="ingredient-label">Quantity:</span>
                    <input type="number" class="item-portion" min="1" step="1" value="${Number(item.portion || 1)}" />
                </div>
                <div class="ingredient-line ingredient-line-unit">
                    <span class="ingredient-label">Unit (g):</span>
                    <input type="number" class="item-serving" min="1" step="1" value="${Number(item.serving_size_g || 100)}" />
                </div>
            </div>
            <button type="button" class="btn-delete-icon" data-action="remove-item" data-index="${index}" aria-label="Delete food item">
                <i class="fas fa-trash" aria-hidden="true"></i>
            </button>
        </div>
    `).join('');
}

function collectFoodItemsFromInputs() {
    return Array.from(ingredientList.querySelectorAll('.ingredient-row')).map(row => ({
        item: row.querySelector('.item-name').value.trim(),
        portion: Number(row.querySelector('.item-portion').value || 1),
        serving_size_g: Number(row.querySelector('.item-serving').value || 100)
    }));
}

function validateFoodItems(foodItems) {
    if (!foodItems.length) return 'Add at least one food item.';
    const invalid = foodItems.find(f => !f.item || f.portion <= 0 || f.serving_size_g <= 0);
    if (invalid) return 'Every row must have a food name, portion > 0, and serving size > 0.';
    return '';
}

function updateJsonPreview() {
    jsonPreview.textContent = JSON.stringify({ food_items: collectFoodItemsFromInputs() }, null, 2);
}

function showError(message) {
    error.textContent = message;
    error.classList.remove('hidden');
}

function escapeHtml(value) {
    return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}