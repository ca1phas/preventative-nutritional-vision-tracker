import { initAuthGuard, getCurrentUser } from './auth-guard.js';
import { supabase, createUserProfile } from './supabase.js';

// ===== AUTH INITIALIZATION =====
initAuthGuard();
const currentUser = await getCurrentUser();
let isNewUser = false;

// ===== DOM ELEMENTS =====
const profileForm = document.getElementById('profileForm');
const resetProfileBtn = document.getElementById('resetProfileBtn');
const profileStatus = document.getElementById('profileStatus');
const userNameInput = document.getElementById('userName');
const userAgeInput = document.getElementById('userAge');
const userGenderInput = document.getElementById('userGender');
const userWeightInput = document.getElementById('userWeight');
const userHeightInput = document.getElementById('userHeight');
const medicalNotesInput = document.getElementById('medicalNotes');
const userBMIInput = document.getElementById('userBMI');
const currentUserDisplay = document.getElementById('currentUserDisplay');

if (currentUserDisplay && currentUser) {
    currentUserDisplay.textContent = `User: ${currentUser.email || currentUser.id}`;
}

// ===== UI STATUS HELPERS =====
function setStatus(message, type = 'info') {
    if (!profileStatus) return;

    if (!message) {
        profileStatus.style.display = 'none';
        profileStatus.textContent = '';
        return;
    }

    profileStatus.style.display = 'block';
    profileStatus.textContent = message;
    if (type === 'error') {
        profileStatus.style.color = '#dc2626';
    } else if (type === 'success') {
        profileStatus.style.color = '#059669';
    } else {
        profileStatus.style.color = '#374151';
    }
}

function showSetupBanner() {
    if (!profileForm) return;
    if (document.getElementById('setupBanner')) return;

    const banner = document.createElement('div');
    banner.id = 'setupBanner';
    banner.style.cssText = `
        background: #fff3cd;
        border: 1px solid #ffc107;
        border-radius: 6px;
        padding: 12px 16px;
        margin-bottom: 16px;
        color: #856404;
        font-weight: 500;
    `;
    banner.textContent = '👋 Welcome! Please complete all fields below to set up your profile before continuing.';
    profileForm.prepend(banner);

    [userNameInput, userAgeInput, userGenderInput, userWeightInput, userHeightInput].forEach(el => {
        if (el) el.required = true;
    });
}

function hideSetupBanner() {
    document.getElementById('setupBanner')?.remove();
}

function setProfileFormValues(profile = {}) {
    if (userNameInput) userNameInput.value = profile.name || '';
    if (userAgeInput) userAgeInput.value = Number.isFinite(Number(profile.age)) ? profile.age : '';
    if (userGenderInput) userGenderInput.value = (profile.gender || '').toLowerCase();
    if (userWeightInput) userWeightInput.value = Number.isFinite(Number(profile.weight)) ? profile.weight : '';
    if (userHeightInput) userHeightInput.value = Number.isFinite(Number(profile.height)) ? profile.height : '';
    if (medicalNotesInput) medicalNotesInput.value = profile.medical_notes || '';
    calculateBMI();
}

// ===== BMI CALCULATION =====
function calculateBMI() {
    if (!userWeightInput || !userHeightInput || !userBMIInput) return;

    const weight = parseFloat(userWeightInput.value);
    const height = parseFloat(userHeightInput.value);

    if (weight && height) {
        const bmi = (weight / ((height / 100) ** 2)).toFixed(1);
        userBMIInput.value = bmi;
    } else {
        userBMIInput.value = '';
    }
}

userWeightInput?.addEventListener('input', calculateBMI);
userHeightInput?.addEventListener('input', calculateBMI);

// ===== LOAD PROFILE =====
async function loadUserProfile() {
    setStatus('Loading profile...', 'info');

    try {
        const { data: profile, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', currentUser.id)
            .maybeSingle();

        if (error) throw error;

        if (!profile) {
            console.log('No profile found. Prompting user to complete setup.');
            isNewUser = true;
            showSetupBanner();
            setProfileFormValues({});
            setStatus('No profile found yet. Fill in your details and click Save Profile.', 'info');
            return;
        }

        isNewUser = false;
        hideSetupBanner();

        sessionStorage.setItem('profileComplete', 'true');
        setProfileFormValues({
            name: profile.name,
            age: profile.age,
            gender: profile.gender,
            weight: profile.weight,
            height: profile.height,
            medical_notes: profile.medical_notes
        });

        setStatus('Profile loaded from database.', 'success');

    } catch (err) {
        console.error('Unexpected error in loadUserProfile:', err);
        setStatus(`Unable to load profile: ${err.message}`, 'error');
    }
}

// ===== SAVE / SUBMIT PROFILE =====
profileForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const missingValues = [];
    if (!userNameInput.value.trim()) missingValues.push('Name');
    if (!userAgeInput.value) missingValues.push('Age');
    if (!userGenderInput.value) missingValues.push('Gender');
    if (!userWeightInput.value) missingValues.push('Weight');
    if (!userHeightInput.value) missingValues.push('Height');

    if (missingValues.length > 0) {
        const msg = `Please fill in all required fields: ${missingValues.join(', ')}`;
        setStatus(msg, 'error');
        alert(msg);
        return;
    }

    const profileData = {
        name: userNameInput.value.trim(),
        age: parseInt(userAgeInput.value, 10),
        gender: userGenderInput.value,
        weight: parseFloat(userWeightInput.value),
        height: parseFloat(userHeightInput.value),
        medical_notes: medicalNotesInput.value.trim() || null,
    };

    setStatus('Saving profile...', 'info');

    try {
        if (isNewUser) {
            await createUserProfile(currentUser.id, profileData);
            isNewUser = false;
            hideSetupBanner();
            sessionStorage.setItem('profileComplete', 'true');
            setStatus('Profile created successfully.', 'success');
            alert('Profile created successfully! Welcome aboard 🎉');
            window.location.replace("userDashboard.html");
        } else {
            const { error } = await supabase
                .from('users')
                .update(profileData)
                .eq('id', currentUser.id);

            if (error) throw error;
            setStatus('Profile saved successfully.', 'success');
        }

        console.log('Profile saved:', profileData);
        calculateBMI();

    } catch (err) {
        console.error('Error saving profile:', err);
        setStatus(`Failed to save profile: ${err.message}`, 'error');
    }
});

// ===== EVENT LISTENERS =====
resetProfileBtn?.addEventListener('click', () => {
    loadUserProfile();
});

// ===== INITIALIZE =====
loadUserProfile();