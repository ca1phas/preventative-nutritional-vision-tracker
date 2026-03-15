// ==========================================
// SUPABASE VALIDATION SCHEMAS
// ==========================================

export const userSchema = {
    "type": "object",
    "description": "Schema for validating users table payloads",
    "properties": {
        "id": { "type": "string", "description": "UUID from auth.users (Required on Create)" },
        "name": { "type": "string", "nullable": true },
        "age": { "type": "integer", "minimum": 0, "nullable": true },
        "gender": { "type": "string", "nullable": true },
        "medical_notes": {
            "type": "array",
            "items": { "type": "string" },
            "nullable": true
        },
        "weight": { "type": "number", "minimum": 0, "nullable": true },
        "is_admin": { "type": "boolean", "default": false },
        "status": {
            "type": "integer",
            "enum": [0, 1, 2],
            "description": "0 = Healthy, 1 = Warning, 2 = Alert",
            "nullable": true
        }
    },
    "additionalProperties": false
};

export const nutritionSchema = {
    "type": "object",
    "description": "Schema for validating nutritions table payloads",
    "properties": {
        "serving_size_g": { "type": "number", "minimum": 0, "nullable": true },
        "calories_kcal": { "type": "number", "minimum": 0, "nullable": true },
        "total_water_ml": { "type": "number", "minimum": 0, "nullable": true },
        "protein_g": { "type": "number", "minimum": 0, "nullable": true },
        "total_carbs_g": { "type": "number", "minimum": 0, "nullable": true },
        "total_fat_g": { "type": "number", "minimum": 0, "nullable": true },
        "total_fiber_g": { "type": "number", "minimum": 0, "nullable": true },
        "total_sugar_g": { "type": "number", "minimum": 0, "nullable": true },
        "saturated_fatty_acids_g": { "type": "number", "minimum": 0, "nullable": true },
        "trans_fatty_acids_g": { "type": "number", "minimum": 0, "nullable": true },
        "monounsaturated_fat_g": { "type": "number", "minimum": 0, "nullable": true },
        "polyunsaturated_fat_g": { "type": "number", "minimum": 0, "nullable": true },
        "linoleic_acid_pufa_18_2_g": { "type": "number", "minimum": 0, "nullable": true },
        "alpha_linolenic_acid_pufa_18_3_g": { "type": "number", "minimum": 0, "nullable": true },
        "dietary_cholesterol_mg": { "type": "number", "minimum": 0, "nullable": true },
        "calcium_mg": { "type": "number", "minimum": 0, "nullable": true },
        "iron_mg": { "type": "number", "minimum": 0, "nullable": true },
        "magnesium_mg": { "type": "number", "minimum": 0, "nullable": true },
        "phosphorus_mg": { "type": "number", "minimum": 0, "nullable": true },
        "potassium_mg": { "type": "number", "minimum": 0, "nullable": true },
        "sodium_mg": { "type": "number", "minimum": 0, "nullable": true },
        "zinc_mg": { "type": "number", "minimum": 0, "nullable": true },
        "copper_mg": { "type": "number", "minimum": 0, "nullable": true },
        "manganese_mg": { "type": "number", "minimum": 0, "nullable": true },
        "iodine_mcg": { "type": "number", "minimum": 0, "nullable": true },
        "selenium_mcg": { "type": "number", "minimum": 0, "nullable": true },
        "molybdenum_mcg": { "type": "number", "minimum": 0, "nullable": true },
        "chromium_mcg": { "type": "number", "minimum": 0, "nullable": true },
        "fluoride_mg": { "type": "number", "minimum": 0, "nullable": true },
        "vitamin_c_mg": { "type": "number", "minimum": 0, "nullable": true },
        "thiamin_mg": { "type": "number", "minimum": 0, "nullable": true },
        "riboflavin_mg": { "type": "number", "minimum": 0, "nullable": true },
        "niacin_mg": { "type": "number", "minimum": 0, "nullable": true },
        "pantothenic_acid_mg": { "type": "number", "minimum": 0, "nullable": true },
        "vitamin_b6_mg": { "type": "number", "minimum": 0, "nullable": true },
        "vitamin_b12_mcg": { "type": "number", "minimum": 0, "nullable": true },
        "biotin_mcg": { "type": "number", "minimum": 0, "nullable": true },
        "folate_mcg": { "type": "number", "minimum": 0, "nullable": true },
        "vitamin_a_mcg": { "type": "number", "minimum": 0, "nullable": true },
        "vitamin_e_mg": { "type": "number", "minimum": 0, "nullable": true },
        "vitamin_d_mcg": { "type": "number", "minimum": 0, "nullable": true },
        "vitamin_k_mcg": { "type": "number", "minimum": 0, "nullable": true },
        "choline_mg": { "type": "number", "minimum": 0, "nullable": true }
    },
    "additionalProperties": false
};

export const mealSchema = {
    "type": "object",
    "description": "Schema for validating meals table payloads",
    "properties": {
        "user_id": { "type": "string", "description": "Must be a valid UUID" },
        "nutrition_id": { "type": "string", "description": "Must be a valid UUID", "nullable": true },
        "image_url": { "type": "string", "format": "uri", "nullable": true },
        "status": {
            "type": "integer",
            "enum": [0, 1, 2],
            "description": "0 = Healthy, 1 = Warning, 2 = Alert",
            "nullable": true
        },
        "assessment_text": { "type": "string", "nullable": true } // <-- ADDED THIS LINE
    },
    "required": ["user_id"],
    "additionalProperties": false
};

export const foodItemSchema = {
    "type": "object",
    "description": "Schema for validating food_items table payloads",
    "properties": {
        "meal_id": { "type": "string", "description": "Must be a valid UUID" },
        "nutrition_id": { "type": "string", "description": "Must be a valid UUID", "nullable": true },
        "food_name": { "type": "string", "minLength": 1 }
    },
    "required": ["meal_id", "food_name"],
    "additionalProperties": false
};