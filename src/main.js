import { logoutUser } from './supabase.js';
import { getCurrentUser, initAuthGuard } from './auth-guard.js';

initAuthGuard();

document.getElementById('learnMoreBtn')?.addEventListener('click', () => {
  document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' });
});
document.getElementById('contactTeamBtn')?.addEventListener('click', () => {
  document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
});

// need login before click "Start Tracking" and "Get Started Now" button ( DONE )
// Need user to login first
// If user clicks User Dashboard or AdminPortal Button it also redirects them to login if they are not logged in 

// Admin 
document.getElementById('adminRole')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const user = await getCurrentUser();
  window.location.href = user ? 'dashboard.html' : 'login.html';
});

// User
document.getElementById('userRole')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const user = await getCurrentUser();
  window.location.href = user ? 'userDashboard.html' : 'login.html';
});

async function requireLogin(e) {
  e.preventDefault();
  const user = await getCurrentUser();
  const triggerId = e.currentTarget?.id;

  if (!user) {
    window.location.href = 'login.html';
  } else {
    // User is logged in, proceed
    const destination = triggerId === 'getStartedBtn' ? 'userProfile.html' : 'upload.html';
    window.location.href = destination;
  }
}


document.getElementById('getStartedBtn')?.addEventListener('click', requireLogin);
document.getElementById('startTrackingBtn')?.addEventListener('click', requireLogin);

// Dropdown
const userMenuBtn = document.getElementById('userMenuBtn');
const userDropdown = document.getElementById('userDropdown');
if (userMenuBtn && userDropdown) {
  userMenuBtn.addEventListener('click', (e) => { e.stopPropagation(); userDropdown.classList.toggle('show'); });
  document.addEventListener('click', () => userDropdown.classList.remove('show'));
}

// Admin — login via login.html, admin check happens in dashboard.js via is_admin flag
document.getElementById('adminRole')?.addEventListener('click', (e) => {
  e.preventDefault();
  // Refirect user to dashboard.html if auth
  // window.location.href = 'dashboard.html';

  // Refirect them to login.html if not
  // window.location.href = 'login.html';
});

// User — login via login.html
document.getElementById('userRole')?.addEventListener('click', (e) => {
  e.preventDefault();

  // Refirect user to userProfile.html if auth
  // window.location.href = 'userProfile.html';

  // Refirect them to login.html if not
  // window.location.href = 'login.html';
});

document.getElementById('loginBtn')?.addEventListener('click', (e) => {
  e.preventDefault();
  window.location.href = 'login.html';
});

// Smooth scrolling
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const href = this.getAttribute('href');

    // Skip if href is just '#' with nothing after it
    if (href === '#') return;

    const target = document.querySelector(href);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});


// Active nav on scroll
window.addEventListener('scroll', () => {
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-menu a');
  let current = '';
  sections.forEach(section => { if (pageYOffset >= section.offsetTop - 200) current = section.getAttribute('id'); });
  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === `#${current}`) link.classList.add('active');
  });
});

// Mobile menu
const mobileMenuToggle = document.getElementById('mobileMenuToggle');
const navMenu = document.getElementById('navMenu');
if (mobileMenuToggle && navMenu) {
  mobileMenuToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    navMenu.classList.toggle('mobile-open');
    const icon = mobileMenuToggle.querySelector('i');
    icon.classList.toggle('fa-bars');
    icon.classList.toggle('fa-times');
  });
  navMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navMenu.classList.remove('mobile-open');
      const icon = mobileMenuToggle.querySelector('i');
      icon.classList.remove('fa-times');
      icon.classList.add('fa-bars');
    });
  });
  document.addEventListener('click', (e) => {
    if (!navMenu.contains(e.target) && !mobileMenuToggle.contains(e.target)) {
      navMenu.classList.remove('mobile-open');
      const icon = mobileMenuToggle.querySelector('i');
      icon.classList.remove('fa-times');
      icon.classList.add('fa-bars');
    }
  });
}

// homepage header
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const user = await getCurrentUser();
    console.log('User in DOMContentLoaded:', user);

    if (user) {
      const desktopNavLinks = document.getElementById('desktopNavLinks');
      const desktopNavActions = document.getElementById('desktopNavActions');
      const mobileNavLinks = document.getElementById('mobileNavLinks');
      const mobileNavActions = document.getElementById('mobileNavActions');

      if (desktopNavLinks) {
        desktopNavLinks.innerHTML = `
          <a href="userProfile.html">Profile</a>
          <a href="userDashboard.html">Dashboard</a>
          <a href="history.html">History</a>
          <a href="upload.html">Upload Meal</a>
          <div class="user-dropdown" style="display: inline-block; position: relative; margin-left: 0.5rem;">
            <a href="#" class="dropdown-toggle" id="homepageDropdownBtn" style="display: flex; align-items: center; gap: 0.3rem;">
              Homepage <i class="fas fa-chevron-down"></i>
            </a>
            <div class="dropdown-menu" id="homepageDropdownMenu">
              <a href="index.html#about" class="dropdown-item">About</a>
              <a href="index.html#solution" class="dropdown-item">Solution</a>
              <a href="index.html#features" class="dropdown-item">Features</a>
              <a href="index.html#contact" class="dropdown-item">Contact</a>
            </div>
          </div>
        `;

        const dropdownToggle = document.getElementById('homepageDropdownBtn');
        const dropdownMenu = document.getElementById('homepageDropdownMenu');
        if (dropdownToggle && dropdownMenu) {
          dropdownToggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropdownMenu.classList.toggle('show');
          });
        }
      }

      if (desktopNavActions) {
        desktopNavActions.innerHTML = '<button id="logoutBtnNav" class="btn-logout">Logout</button>';
      }

      if (mobileNavLinks) {
        mobileNavLinks.innerHTML = `
          <a href="userProfile.html">Profile</a>
          <a href="userDashboard.html">Dashboard</a>
          <a href="history.html">History</a>
          <a href="upload.html">Upload Meal</a>
          <div style="padding: 1rem 1.5rem; color: #9ca3af; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.5rem;">Homepage Links</div>
          <a href="index.html#about" style="padding-left: 2.5rem; border-bottom: none;"><i class="fas fa-angle-right"></i> About</a>
          <a href="index.html#solution" style="padding-left: 2.5rem; border-bottom: none;"><i class="fas fa-angle-right"></i> Solution</a>
          <a href="index.html#features" style="padding-left: 2.5rem; border-bottom: none;"><i class="fas fa-angle-right"></i> Features</a>
          <a href="index.html#contact" style="padding-left: 2.5rem;"><i class="fas fa-angle-right"></i> Contact</a>
        `;

        const mobileMenuToggle = document.getElementById('mobileMenuToggle');
        const sidebar = document.getElementById('mobileSidebar');
        const overlay = document.getElementById('mobileOverlay');
        mobileNavLinks.querySelectorAll('a').forEach(link => {
          link.addEventListener('click', () => {
            if(sidebar) sidebar.classList.remove('active');
            if(overlay) overlay.classList.remove('active');
          });
        });
      }

      if (mobileNavActions) {
        mobileNavActions.innerHTML = '<button id="logoutBtnMobileNav" class="btn-logout" style="width: 100%;">Logout</button>';
      }

      const bindLogout = (btnId) => {
        const logoutBtn = document.getElementById(btnId);
        if (logoutBtn) {
          logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            logoutBtn.disabled = true;
            logoutBtn.textContent = 'Logging out...';
            try {
              await logoutUser();
              window.location.replace('index.html');
            } catch (err) {
              console.error('Logout error:', err);
              logoutBtn.disabled = false;
              logoutBtn.textContent = 'Logout';
            }
          });
        }
      };
      
      bindLogout('logoutBtnNav');
      bindLogout('logoutBtnMobileNav');

    } else {
      console.log('User not logged in - showing default public navbar');
    }
  } catch (err) {
    console.error('Error in DOMContentLoaded:', err);
  }
});

// click blank blank place to close dropdown menu
document.addEventListener('click', function (event) {
  const dropdowns = document.querySelectorAll('.user-dropdown');
  dropdowns.forEach(dropdown => {
    const menu = dropdown.querySelector('.dropdown-menu');
    if (menu && menu.classList.contains('show') && !dropdown.contains(event.target)) {
      menu.classList.remove('show');
    }
  });
});