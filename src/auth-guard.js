import { supabase, logoutUser } from "./supabase.js";

const publicPages = ["/login.html", "/login", "/index.html", "/index", "/"];

export async function initAuthGuard() {
  const currentPath = window.location.pathname;
  const isPublicPage = publicPages.some((page) => currentPath.endsWith(page));
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Not logged in, trying to access protected page
  if (!session && !isPublicPage) {
    window.location.replace("login.html");
    return;
  }


  // Logged In
  if (session) {
    // Try to access login
    if (currentPath.endsWith("login.html") || currentPath.endsWith("/login")) {
      const adminStatus = await isAdmin();
      const destination = adminStatus ? "dashboard.html" : "userDashboard.html";
      window.location.replace(destination);
      return;
    }

    // Try to access admin page when not admin
    if (currentPath.endsWith("dashboard.html") && currentPath.endsWith("/dashboard") && !isAdmin()) {
      alert("Admin access required");
      window.location.replace("/");
      return;
    }

    // When user try to access other pages when user profile is incomplete
    const currentUser = await getCurrentUser();
    let { data: profile, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', currentUser?.id)
      .maybeSingle();


    if (!profile && (!currentPath.endsWith("userProfile.html") && !currentPath.endsWith("/userProfile"))) {
      window.location.replace("userProfile.html");
      return;
    }

    const logoutButtons = document.querySelectorAll("#logoutBtn, .btn-logout");
    logoutButtons.forEach((button) => {
      button.addEventListener("click", async (e) => {
        e.preventDefault();
        button.textContent = "Logging out...";
        button.disabled = true;

        try {
          await logoutUser();
          window.location.replace("index.html");
        } catch (err) {
          console.error("Logout error:", err);
          alert("Failed to logout. Please try again.");
          button.textContent = "Logout";
          button.disabled = false;
        }
      });
    });
  }
}

supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    window.location.replace("login.html");
  }
});

export async function getCurrentUser() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user || null;
}

export async function redirectIfNotAuth() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.replace("login.html");
  }
}

export async function isAdmin() {
  const user = await getCurrentUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  return profile?.is_admin || false;
}

document.addEventListener('DOMContentLoaded', () => {
  const menuToggle = document.getElementById('mobileMenuToggle');
  const sidebar = document.getElementById('mobileSidebar');
  const overlay = document.getElementById('mobileOverlay');
  const closeBtn = document.getElementById('closeSidebarBtn');

  if (menuToggle && sidebar && overlay && closeBtn) {
    const openMenu = () => {
      sidebar.classList.add('active');
      overlay.classList.add('active');
    };

    const closeMenu = () => {
      sidebar.classList.remove('active');
      overlay.classList.remove('active');
    };

    menuToggle.addEventListener('click', openMenu);
    closeBtn.addEventListener('click', closeMenu);
    overlay.addEventListener('click', closeMenu);
  }

  const logoutBtnMobile = document.getElementById('logoutBtnMobile');
  if (logoutBtnMobile) {
    logoutBtnMobile.addEventListener('click', async (e) => {
      e.preventDefault();
      document.getElementById('logoutBtn')?.click();
    });
  }
});