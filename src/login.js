import { authenticateUser } from './supabase.js';
import { initAuthGuard } from './auth-guard.js';
initAuthGuard();

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  try {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const { _, isAdmin } = await authenticateUser(email, password)
    window.location.href = isAdmin ? "dashboard.html" : 'userDashboard.html';
  } catch (err) {
    alert('Invalid user ID or password. Please try again.');
  }
})
