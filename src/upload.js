import { analyzeFoodImage } from './ai-service.js';
import { initAuthGuard } from './auth-guard.js';

initAuthGuard()

const uploadForm = document.getElementById('uploadForm');
const mealImageInput = document.getElementById('mealImage');
const imagePreview = document.getElementById('imagePreview');
const previewImg = document.getElementById('previewImg');
const submitBtn = document.getElementById('submitBtn');
const loading = document.getElementById('loading');
const errorMsg = document.getElementById('error');

let currentImageDataUrl = null;
let currentImageFile = null;

// 1. Handle File Selection and Preview
mealImageInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) {
        imagePreview.classList.add('hidden');
        currentImageDataUrl = null;
        currentImageFile = null;
        return;
    }

    currentImageFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
        currentImageDataUrl = e.target.result;
        previewImg.src = currentImageDataUrl;
        imagePreview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
});

// 2. Handle Form Submission
uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const file = mealImageInput.files[0];
    if (!file || !isValidFormat(file)) {
        showError('Invalid file type. Please use PNG, JPEG, WEBP, HEIC, or HEIF.');
        return;
    }

    // Update UI State
    submitBtn.classList.add('hidden');
    loading.classList.remove('hidden');
    errorMsg.classList.add('hidden');

    try {
        // Step 1: Send image to Gemini via ai-service.js
        const mimeType = currentImageFile.type || "image/jpeg";
        const detectedIngredients = await analyzeFoodImage(currentImageDataUrl, mimeType);

        // Step 2: Save the image and the AI results to sessionStorage so confirm.js can read them
        sessionStorage.setItem('uploadedImage', JSON.stringify({
            name: currentImageFile.name,
            dataUrl: currentImageDataUrl
        }));

        sessionStorage.setItem('ingredients', JSON.stringify(detectedIngredients));

        // Step 3: Redirect to the confirmation page
        window.location.href = 'confirm.html';

    } catch (error) {
        console.error("AI Analysis Failed:", error);
        showError("Failed to analyze the image. Please try again or use a clearer photo.");
        submitBtn.classList.remove('hidden');
        loading.classList.add('hidden');
    }
});

function showError(message) {
    errorMsg.textContent = message;
    errorMsg.classList.remove('hidden');
}

function isValidFormat(file) {
    const validFormats = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];
    return validFormats.includes(file.type);
}