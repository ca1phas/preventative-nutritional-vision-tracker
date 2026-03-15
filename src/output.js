import { getUserProfile, getUserMeals, getMeal, updateUserProfile, logoutUser } from './supabase.js';
import { generateUserAssessment } from './ai-service.js';
import { initAuthGuard } from './auth-guard.js';

// Protect the route
initAuthGuard();

// Nutrient display mappings
const nutrientLabels = {
  calories_kcal: "Calories (kcal)",
  total_water_ml: "Total Water (ml)",
  protein_g: "Protein (g)",
  total_carbs_g: "Carbohydrates (g)",
  total_fat_g: "Fat (g)",
  total_fiber_g: "Fiber (g)",
  total_sugar_g: "Sugar (g)",
  saturated_fatty_acids_g: "Saturated Fat (g)",
  trans_fatty_acids_g: "Trans Fat (g)",
  monounsaturated_fat_g: "Monounsaturated Fat (g)",
  polyunsaturated_fat_g: "Polyunsaturated Fat (g)",
  dietary_cholesterol_mg: "Cholesterol (mg)",
  sodium_mg: "Sodium (mg)",
  potassium_mg: "Potassium (mg)",
  calcium_mg: "Calcium (mg)",
  iron_mg: "Iron (mg)",
  vitamin_c_mg: "Vitamin C (mg)",
  vitamin_a_mcg: "Vitamin A (mcg)",
  vitamin_d_mcg: "Vitamin D (mcg)",
  vitamin_b12_mcg: "Vitamin B12 (mcg)"
};

async function initOutput() {
  try {
    // 1. Get the meal ID from the URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const mealId = urlParams.get('mealId');

    if (!mealId) {
      document.getElementById("basicInfo").innerHTML = "<p>No meal ID provided. Please go back and select a meal.</p>";
      return;
    }

    // 2. Fetch the definitive data directly from Supabase
    const mealData = await getMeal(mealId);

    if (!mealData) {
      document.getElementById("basicInfo").innerHTML = "<p>Meal not found in the database.</p>";
      return;
    }

    // 3. Render Image
    const imgUrl = mealData.image_url;
    if (imgUrl) {
      document.getElementById("mealImageContainer").innerHTML = `
        <img src="${imgUrl}" alt="Uploaded Meal" style="width:100%; height:100%; object-fit:cover; object-position:center; display:block; background:#f3f4f6;">
      `;
    }

    // 4. Extract data for the whole meal
    const aggregatedData = mealData.nutritions || {};
    const foodNames = mealData.food_items && mealData.food_items.length > 0
      ? mealData.food_items.map(f => f.food_name).join(', ')
      : 'Unknown Items';

    const totalWeight = aggregatedData.serving_size_g || 0;
    const formattedDate = new Date(mealData.created_at).toLocaleString();

    // 5. Render Basic Info
    document.getElementById("basicInfo").innerHTML = `
      <p><strong>Date & Time:</strong> ${formattedDate}</p>
      <p><strong>Detected Foods:</strong> ${foodNames}</p>
      <p><strong>Total Estimated Weight:</strong> ${totalWeight} g</p>
    `;

    // 6. Render Nutrition Table
    const tbody = document.querySelector("#nutritionTable tbody");
    tbody.innerHTML = ''; // Clear table

    Object.keys(nutrientLabels).forEach(key => {
      let value = aggregatedData[key];
      if (value === null || value === undefined || value === 0) return;

      // Round to 2 decimal places for neatness
      value = Math.round(value * 100) / 100;

      const row = `
        <tr>
          <td>${nutrientLabels[key]}</td>
          <td><strong>${value}</strong></td>
        </tr>
      `;
      tbody.innerHTML += row;
    });

    // 7. Run Clinical AI Assessment Pipeline
    await runClinicalAssessment(mealData.user_id, mealData);

  } catch (err) {
    console.error("Failed to load output data:", err);
    document.getElementById("basicInfo").innerHTML = "<p style='color:red;'>Error loading meal data. Please try again.</p>";
  }
}

async function runClinicalAssessment(userId, currentMealData) {
  const summaryContainer = document.getElementById("aiSummary");
  summaryContainer.innerHTML = "<p><em>Loading clinical assessment...</em></p>";

  try {
    // Fetch all user meals and the user profile for trend analysis
    const allUserMeals = await getUserMeals(userId);
    const userProfile = await getUserProfile(userId);

    // Filter meals for the past 14 days
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const pastTwoWeeksMeals = allUserMeals.filter(meal =>
      new Date(meal.created_at) >= twoWeeksAgo
    );

    // 1. Grab the current meal evaluation straight from the database
    const mealAssessmentText = currentMealData.assessment_text || "No specific assessment recorded for this meal.";
    const mealStatus = currentMealData.status !== null ? currentMealData.status : 0;

    // 2. Generate the 14-day trend dynamically
    const userEvaluation = await generateUserAssessment(userProfile, pastTwoWeeksMeals);

    // Update database status for the overall user based on the new trend
    await updateUserProfile(userId, { status: userEvaluation.user_status });

    // Render the combined results to the UI
    summaryContainer.innerHTML = `
      <h3 style="margin-top:0; color:#1f2937; margin-bottom: 1rem;"><i class="fas fa-stethoscope"></i> Clinical AI Assessment</h3>
      
      <div style="margin-bottom: 1.5rem;">
          <h4 style="margin-bottom: 0.5rem; color: #4b5563;">Current Meal Evaluation</h4>
          <p style="margin-bottom:0; line-height:1.5;">${mealAssessmentText}</p>
      </div>

      <div style="margin-bottom: 1.5rem;">
          <h4 style="margin-bottom: 0.5rem; color: #4b5563;">14-Day Trend Analysis</h4>
          <p style="margin-bottom:0; line-height:1.5;">${userEvaluation.user_assessment_text}</p>
      </div>

      <div style="font-size: 0.9em; padding: 12px; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 6px; display: flex; justify-content: space-around;">
          <span><strong>Meal Risk Level:</strong> ${getStatusBadge(mealStatus)}</span>
          <span><strong>Overall Patient Risk Level:</strong> ${getStatusBadge(userEvaluation.user_status)}</span>
      </div>
    `;

  } catch (err) {
    console.error("AI Assessment Error:", err);
    summaryContainer.innerHTML = "<p style='color:red;'>Failed to load clinical assessment.</p>";
  }
}

// Helper function to color-code the status integers
function getStatusBadge(statusCode) {
  switch (statusCode) {
    case 0:
      return '<span style="color: green; font-weight: bold;">0 (Healthy)</span>';
    case 1:
      return '<span style="color: orange; font-weight: bold;">1 (Warning)</span>';
    case 2:
      return '<span style="color: red; font-weight: bold;">2 (Alert)</span>';
    default:
      return `<span>${statusCode}</span>`;
  }
}

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

// Run immediately
initOutput();