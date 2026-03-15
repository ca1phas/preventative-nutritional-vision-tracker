import { GoogleGenAI } from '@google/genai';
import {
    prelimFoodSchema,
    foodNutritionSchema,
    analyzeSystemInstruction,
    mapSystemInstruction,
    getMapPrompt,
    mealAssessmentSchema,
    userAssessmentSchema,
    mealAssessmentSystemInstruction,
    userAssessmentSystemInstruction,
    dashboardInsightsSchema,
    dashboardInsightsSystemInstruction,
    clinicalRubricSchema,
    clinicalRubricSystemInstruction
} from './ai-config.js';

// Initialize with Vite environment variable
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });


// ==========================================
// 1. VISION & MAPPING (Powered by Gemini)
// ==========================================

export async function analyzeFoodImage(imageBase64, mimeType = "image/jpeg") {
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: [
            { inlineData: { data: cleanBase64, mimeType: mimeType } },
            "Analyze this food image."
        ],
        config: {
            systemInstruction: analyzeSystemInstruction,
            responseMimeType: "application/json",
            responseSchema: prelimFoodSchema,
            temperature: 0.2
        }
    });

    const foodItems = JSON.parse(response.text);
    const currentDatetime = new Date().toISOString();

    return foodItems.map(item => ({
        id: crypto.randomUUID(),
        datetime: currentDatetime,
        ...item
    }));
}

export async function searchUSDA(foodName) {
    const usdaApiKey = import.meta.env.VITE_USDA_API_KEY;

    // 1. Sanitize the input: Remove punctuation (%, /, ,, -) and leave only alphanumeric characters and spaces
    const sanitizedName = foodName.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    let searchTerms = sanitizedName.split(' ');

    while (searchTerms.length > 0) {
        const query = searchTerms.join(' ');
        const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=3&api_key=${usdaApiKey}`;

        try {
            const response = await fetch(url);

            // 2. Check if the response is actually OK before attempting to parse JSON
            if (!response.ok) {
                console.warn(`USDA API returned ${response.status} for query "${query}". Trying broader search...`);
                searchTerms.pop();
                continue; // Skip the JSON parsing and move to the next iteration
            }

            const data = await response.json();
            if (data.foods && data.foods.length > 0) return data.foods;
        } catch (error) {
            console.error(`Error fetching from USDA API for query "${query}":`, error);
        }
        searchTerms.pop();
    }
    return [];
}

export async function mapToNutritionSchema(foodItem, usdaResults) {
    const hydratedPrompt = getMapPrompt(foodItem, usdaResults);

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: hydratedPrompt,
        config: {
            systemInstruction: mapSystemInstruction,
            responseMimeType: "application/json",
            responseSchema: foodNutritionSchema,
            temperature: 0.1
        }
    });

    return JSON.parse(response.text);
}

// STAGE 1: CLINICAL PROFILER (Powered by Flextoken Qwen 2.5)
export async function generateClinicalRubric(userProfile) {
    const prompt = `--- PATIENT PROFILE ---\n${JSON.stringify(userProfile, null, 2)}`;

    const url = "https://aiworkshopapi.flexinfra.com.my/v1/chat/completions";

    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${import.meta.env.VITE_FLEXTOKEN_API_KEY}`
    };

    const systemPrompt = `
    ${clinicalRubricSystemInstruction}
    IMPORTANT: You must return the response strictly as a JSON object that matches the following schema. Do not include markdown formatting like \`\`\`json.
    ${JSON.stringify(clinicalRubricSchema)}
    `;

    const data = {
        model: "qwen2.5",
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt }
        ],
        max_completion_tokens: 1000,
        temperature: 0.1,
        top_p: 0.9,
    };

    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(data) });
    if (!response.ok) throw new Error(`API request failed: ${response.status}`);

    const responseData = await response.json();
    let content = responseData.choices[0].message.content;

    // --- ROBUST JSON EXTRACTION ---
    // Find the first '{' and last '}' to strip away any conversational filler or markdown
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');

    if (jsonStart !== -1 && jsonEnd !== -1) {
        content = content.substring(jsonStart, jsonEnd + 1);
    }

    try {
        return JSON.parse(content);
    } catch (parseError) {
        console.error("Failed to parse this content into JSON:", content);
        throw parseError;
    }
}

// STAGE 2: CLINICAL ASSESSOR (Powered by Flextoken Qwen 2.5)
export async function generateMealAssessment(userProfile, rawCurrentMeal) {
    try {
        // Multi-Agent Workflow: Generate the plan first
        const clinicalRubric = await generateClinicalRubric(userProfile);

        const prompt = `
        --- CLINICAL EVALUATION RUBRIC ---
        ${JSON.stringify(clinicalRubric, null, 2)}

        --- RAW MEAL DATA TO EVALUATE ---
        ${JSON.stringify(rawCurrentMeal, null, 2)}
        
        Using the rules and critical nutrients identified in the Rubric, evaluate this meal and calculate the status code.
        `;

        const url = "https://aiworkshopapi.flexinfra.com.my/v1/chat/completions";
        const headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${import.meta.env.VITE_FLEXTOKEN_API_KEY}`
        };

        const systemPrompt = `
        ${mealAssessmentSystemInstruction}
        IMPORTANT: You must return the response strictly as a JSON object that matches the following schema. Do not include markdown formatting.
        ${JSON.stringify(mealAssessmentSchema)}
        `;

        const data = {
            model: "qwen2.5",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt }
            ],
            max_completion_tokens: 1000,
            temperature: 0.1,
            top_p: 0.9,
        };

        const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(data) });
        if (!response.ok) throw new Error(`API request failed: ${response.status}`);

        const responseData = await response.json();
        const content = responseData.choices[0].message.content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        return JSON.parse(content);

    } catch (error) {
        console.error("Error generating Meal Assessment:", error);
        throw error;
    }
}

// export async function generateUserAssessment(userProfile, rawMeals) {
//     try {
//         // Multi-Agent Workflow: Generate the plan first
//         const clinicalRubric = await generateClinicalRubric(userProfile);

//         const prompt = `
//         --- CLINICAL EVALUATION RUBRIC ---
//         ${JSON.stringify(clinicalRubric, null, 2)}

//         --- RAW PATIENT 14-DAY MEAL HISTORY ---
//         ${JSON.stringify(rawMeals, null, 2)}

//         Using the rules and critical nutrients identified in the Rubric, evaluate this 14-day trend and calculate the user status code.
//         `;

//         const url = "https://aiworkshopapi.flexinfra.com.my/v1/chat/completions";
//         const headers = {
//             "Content-Type": "application/json",
//             "Authorization": `Bearer ${import.meta.env.VITE_FLEXTOKEN_API_KEY}`
//         };

//         const systemPrompt = `
//         ${userAssessmentSystemInstruction}
//         IMPORTANT: You must return the response strictly as a JSON object that matches the following schema. Do not include markdown formatting.
//         ${JSON.stringify(userAssessmentSchema)}
//         `;

//         const data = {
//             model: "qwen2.5",
//             messages: [
//                 { role: "system", content: systemPrompt },
//                 { role: "user", content: prompt }
//             ],
//             max_completion_tokens: 1000,
//             temperature: 0.1,
//             top_p: 0.9,
//         };

//         const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(data) });
//         if (!response.ok) throw new Error(`API request failed: ${response.status}`);

//         const responseData = await response.json();
//         const content = responseData.choices[0].message.content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
//         return JSON.parse(content);

//     } catch (error) {
//         console.error("Error generating User Assessment:", error);
//         throw error;
//     }
// }

// ---- Gemini version
export async function generateUserAssessment(userProfile, rawMeals) {
    try {
        // Multi-Agent Workflow: Generate the plan first
        const clinicalRubric = await generateClinicalRubric(userProfile);

        const prompt = `
        --- CLINICAL EVALUATION RUBRIC ---
        ${JSON.stringify(clinicalRubric, null, 2)}

        --- RAW PATIENT 14-DAY MEAL HISTORY ---
        ${JSON.stringify(rawMeals, null, 2)}
        
        Using the rules and critical nutrients identified in the Rubric, evaluate this 14-day trend and calculate the user status code.
        `;

        // Using Gemini 2.5 Flash-Lite as it is the most budget-friendly model
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-lite',
            contents: prompt,
            config: {
                systemInstruction: userAssessmentSystemInstruction,
                responseMimeType: "application/json",
                responseSchema: userAssessmentSchema,
                temperature: 0.1,
                topP: 0.9
            }
        });

        // Gemini with responseMimeType strictly outputs JSON, so we can parse directly
        return JSON.parse(response.text);

    } catch (error) {
        console.error("Error generating User Assessment:", error);
        throw error;
    }
}

// ==========================================
// 4. COMPLEX DASHBOARD INSIGHTS (Powered by Flextoken Qwen 2.5)
// ==========================================

// export async function generateDashboardInsights(userProfile, meals) {
//     const prompt = `
//     --- PATIENT PROFILE ---
//     ${JSON.stringify(userProfile, null, 2)}

//     --- RAW PATIENT 14-DAY MEAL HISTORY ---
//     ${JSON.stringify(meals, null, 2)}
//     `;

//     const url = "https://aiworkshopapi.flexinfra.com.my/v1/chat/completions";

//     const headers = {
//         "Content-Type": "application/json",
//         "Authorization": `Bearer ${import.meta.env.VITE_FLEXTOKEN_API_KEY}`
//     };

//     const systemPrompt = `
//     ${dashboardInsightsSystemInstruction}
//     IMPORTANT: You must return the response strictly as a JSON object that matches the following schema. Do not include markdown formatting like \`\`\`json.
//     ${JSON.stringify(dashboardInsightsSchema)}
//     `;

//     const data = {
//         model: "qwen2.5",
//         messages: [
//             { role: "system", content: systemPrompt },
//             { role: "user", content: prompt }
//         ],
//         max_completion_tokens: 2000, // Increased to handle deeply nested schemas
//         temperature: 0.2, // Kept at 0.2 to match your original configuration
//         top_p: 0.9,
//     };

//     try {
//         const response = await fetch(url, {
//             method: "POST",
//             headers,
//             body: JSON.stringify(data)
//         });

//         if (!response.ok) {
//             throw new Error(`API request failed: ${response.status}`);
//         }

//         const responseData = await response.json();
//         let content = responseData.choices[0].message.content;

//         // --- ROBUST JSON EXTRACTION ---
//         // Strip away any conversational filler or markdown that Qwen might occasionally append
//         const jsonStart = content.indexOf('{');
//         const jsonEnd = content.lastIndexOf('}');

//         if (jsonStart !== -1 && jsonEnd !== -1) {
//             content = content.substring(jsonStart, jsonEnd + 1);
//         }

//         return JSON.parse(content);
//     } catch (error) {
//         console.error("Error generating Dashboard Insights:", error);
//         throw error;
//     }
// }

// ==========================================
// 4. COMPLEX DASHBOARD INSIGHTS (Powered by Gemini)
// ==========================================

export async function generateDashboardInsights(userProfile, meals) {
    const prompt = `
    --- PATIENT PROFILE ---
    ${JSON.stringify(userProfile, null, 2)}

    --- RAW PATIENT 14-DAY MEAL HISTORY ---
    ${JSON.stringify(meals, null, 2)}
    `;

    try {
        // We use Gemini here because it effortlessly handles large JSON context windows
        // and strictly enforces the deeply nested insight schema.
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-lite',
            contents: prompt,
            config: {
                systemInstruction: dashboardInsightsSystemInstruction,
                responseMimeType: "application/json",
                responseSchema: dashboardInsightsSchema,
                temperature: 0.2
            }
        });

        return JSON.parse(response.text);
    } catch (error) {
        console.error("Error generating Dashboard Insights:", error);
        throw error;
    }
}