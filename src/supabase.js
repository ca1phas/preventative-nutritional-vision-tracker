import { createClient } from '@supabase/supabase-js';

// Initialize with Vite environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ==========================================
// AUTHENTICATION
// ==========================================

export async function authenticateUser(email, password) {
    // 1. Attempt standard login
    let { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    // 2. If login fails, attempt to automatically sign up
    if (authError) {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email,
            password,
        });

        // If sign-up also fails (e.g., the user exists but typed the wrong password, 
        // or the password is too weak), throw the error to the UI.
        if (signUpError) {
            throw new Error(signUpError.message);
        }

        // Use the newly created user data
        authData = signUpData;
    }

    // 3. Check for admin status
    // We use .maybeSingle() instead of .single() because a brand new user 
    // won't have a profile row in the 'users' table yet.
    const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('is_admin')
        .eq('id', authData.user.id)
        .maybeSingle();

    if (profileError) console.error("Could not fetch user profile details:", profileError);

    return {
        user: authData.user,
        isAdmin: profile?.is_admin || false
    };
}


export async function logoutUser() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}


// ==========================================
// USERS CRUD
// ==========================================
export async function createUserProfile(id, profileData) {
    const { data, error } = await supabase.from('users').insert([{ id, ...profileData }]).select().single();
    if (error) throw error;
    return data;
}

export async function getUserProfile(id) {
    if (!id) {
        throw new Error('User ID is required');
    }

    let data, error;

    try {
        ({ data, error } = await supabase.from('users').select('*').eq('id', id).single());
    } catch (err) {
        throw new Error(`Failed to fetch user profile: ${err.message}`);
    }

    if (error) {
        if (error.code === 'PGRST116') {
            throw new Error(`User with ID "${id}" not found`);
        }
        throw new Error(`Database error: ${error.message}`);
    }

    if (!data) {
        throw new Error(`No data returned for user ID "${id}"`);
    }

    return data;
}

export async function updateUserProfile(id, updates) {
    const { data, error } = await supabase.from('users').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
}

// ==========================================
// USERS - GET ALL (for admin dashboard)
// ==========================================
export async function getAllUsers() {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, name, email, age, gender, medical_notes, is_admin, status, created_at')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    } catch (err) {
        throw new Error('Failed to fetch users: ' + err.message);
    }
}



// ==========================================
// NUTRITIONS CRUD
// ==========================================
export async function createNutrition(nutritionData) {
    const { data, error } = await supabase.from('nutritions').insert([nutritionData]).select().single();
    if (error) throw error;
    return data;
}

export async function updateNutrition(id, updates) {
    const { data, error } = await supabase.from('nutritions').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
}

// ==========================================
// MEALS CRUD
// ==========================================
export async function createMeal(mealData) {
    const { data, error } = await supabase.from('meals').insert([mealData]).select().single();
    if (error) throw error;
    return data;
}

export async function getMeal(id) {
    const { data, error } = await supabase
        .from('meals')
        .select('*, nutritions(*), food_items(*, nutritions(*))')
        .eq('id', id)
        .single();
    if (error) throw error;
    return data;
}

export async function getUserMeals(userId) {
    const { data, error } = await supabase
        .from('meals')
        .select('*, nutritions(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
}

export async function updateMeal(id, updates) {
    const { data, error } = await supabase.from('meals').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
}

export async function deleteMeal(id) {
    const { error } = await supabase.from('meals').delete().eq('id', id);
    if (error) throw error;
    return true;
}

// ==========================================
// FOOD ITEMS CRUD
// ==========================================
export async function createFoodItem(foodItemData) {
    const { data, error } = await supabase.from('food_items').insert([foodItemData]).select().single();
    if (error) throw error;
    return data;
}

export async function getFoodItemsByMeal(mealId) {
    const { data, error } = await supabase
        .from('food_items')
        .select('*, nutritions(*)')
        .eq('meal_id', mealId);
    if (error) throw error;
    return data;
}

export async function deleteFoodItem(id) {
    const { error } = await supabase.from('food_items').delete().eq('id', id);
    if (error) throw error;
    return true;
}

// ==========================================
// STORAGE: IMAGE UPLOADS
// ==========================================
export async function uploadMealImage(base64DataUrl, originalFileName, userId) {
    try {
        // 1. Convert the Base64 Data URL back into a binary Blob
        const response = await fetch(base64DataUrl);
        const blob = await response.blob();

        // 2. Create a clean, unique file path (e.g., user_id/167888999-my-lunch.jpg)
        const cleanFileName = originalFileName.replace(/[^a-zA-Z0-9.]/g, '-');
        const uniquePath = `${userId}/${Date.now()}-${cleanFileName}`;

        // 3. Upload to the 'meal-images' bucket
        const { data, error } = await supabase.storage
            .from('meal-images')
            .upload(uniquePath, blob, {
                contentType: blob.type,
                upsert: false
            });

        if (error) throw error;

        // 4. Retrieve the permanent public URL
        const { data: publicUrlData } = supabase.storage
            .from('meal-images')
            .getPublicUrl(uniquePath);

        return publicUrlData.publicUrl;

    } catch (error) {
        throw new Error('Failed to upload image: ' + error.message);
    }
}




// ==========================================
// MASTER PIPELINE: LOG COMPLETE MEAL
// ==========================================
export async function logCompleteMeal(userId, imageUrl, finalNutritionData, mealStatus, assessmentText) {
    // List of allowed keys that match our database schema exactly
    const schemaKeys = [
        'serving_size_g', 'calories_kcal', 'total_water_ml', 'protein_g', 'total_carbs_g',
        'total_fat_g', 'total_fiber_g', 'total_sugar_g', 'saturated_fatty_acids_g',
        'trans_fatty_acids_g', 'monounsaturated_fat_g', 'polyunsaturated_fat_g',
        'linoleic_acid_pufa_18_2_g', 'alpha_linolenic_acid_pufa_18_3_g', 'dietary_cholesterol_mg',
        'calcium_mg', 'iron_mg', 'magnesium_mg', 'phosphorus_mg', 'potassium_mg',
        'sodium_mg', 'zinc_mg', 'copper_mg', 'manganese_mg', 'iodine_mcg', 'selenium_mcg',
        'molybdenum_mcg', 'chromium_mcg', 'fluoride_mg', 'vitamin_c_mg', 'thiamin_mg',
        'riboflavin_mg', 'niacin_mg', 'pantothenic_acid_mg', 'vitamin_b6_mg', 'vitamin_b12_mcg',
        'biotin_mcg', 'folate_mcg', 'vitamin_a_mcg', 'vitamin_e_mg', 'vitamin_d_mcg',
        'vitamin_k_mcg', 'choline_mg'
    ];

    // 1. Aggregate the nutrition data for the whole meal
    const aggregated = finalNutritionData.reduce((acc, n) => {
        Object.keys(n).forEach(key => {
            if (typeof n[key] === 'number') acc[key] = (acc[key] || 0) + n[key];
        });
        return acc;
    }, {});

    // Map to schema, setting undefined to null
    const mealNutritionRow = {};
    schemaKeys.forEach(key => { mealNutritionRow[key] = aggregated[key] || null; });

    // 2. Insert Total Nutrition
    const { data: nutritionInsert, error: nutritionError } = await supabase
        .from('nutritions')
        .insert(mealNutritionRow)
        .select('id')
        .single();
    if (nutritionError) throw new Error('Failed to save total nutrition: ' + nutritionError.message);

    // 3. Insert Meal (Update this block)
    const { data: mealInsert, error: mealError } = await supabase
        .from('meals')
        .insert({
            user_id: userId,
            nutrition_id: nutritionInsert.id,
            image_url: imageUrl || null,
            status: mealStatus,
            assessment_text: assessmentText
        })
        .select('id')
        .single();
    if (mealError) throw new Error('Failed to save meal: ' + mealError.message);

    // 4. Insert Individual Food Items & their specific Nutritions
    for (const item of finalNutritionData) {
        const itemNutritionRow = {};
        schemaKeys.forEach(key => { itemNutritionRow[key] = item[key] || null; });

        // Insert individual nutrition
        const { data: itemNutrInsert, error: itemNutrError } = await supabase
            .from('nutritions')
            .insert(itemNutritionRow)
            .select('id')
            .single();

        if (itemNutrError) console.warn('Failed to save individual item nutrition:', itemNutrError.message);

        // Insert food item
        const { error: foodItemError } = await supabase
            .from('food_items')
            .insert({
                meal_id: mealInsert.id,
                nutrition_id: itemNutrInsert ? itemNutrInsert.id : null,
                food_name: item.food_name || 'Unknown Item'
            });

        if (foodItemError) console.warn('Failed to save food item:', foodItemError.message);
    }

    return mealInsert;
}