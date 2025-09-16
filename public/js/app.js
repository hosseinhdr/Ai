// Global variables
window.apiKey = localStorage.getItem('apiKey');
window.currentSection = 'dashboard';
window.charts = {};

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.className = savedTheme === 'dark' ? 'dark-theme' : '';

    // Create theme toggle button
    const themeToggle = document.createElement('button');
    themeToggle.className = 'theme-toggle';
    themeToggle.innerHTML = savedTheme === 'dark' ?
        '<i class="fas fa-sun"></i>' :
        '<i class="fas fa-moon"></i>';
    themeToggle.onclick = toggleTheme;
    document.body.appendChild(themeToggle);
}

function toggleTheme() {
    const isDark = document.body.classList.contains('dark-theme');

    if (isDark) {
        document.body.classList.remove('dark-theme');
        localStorage.setItem('theme', 'light');
        document.querySelector('.theme-toggle').innerHTML = '<i class="fas fa-moon"></i>';
    } else {
        document.body.classList.add('dark-theme');
        localStorage.setItem('theme', 'dark');
        document.querySelector('.theme-toggle').innerHTML = '<i class="fas fa-sun"></i>';
    }
}

// IMMEDIATE AUTH CHECK - Before any DOM manipulation
(function() {
    // Check if we're already on login page
    if (window.location.pathname.includes('login')) {
        return;
    }

    // Check if API key exists
    const apiKey = localStorage.getItem('apiKey');
    if (!apiKey) {
        // No API key, redirect to login immediately
        window.location.replace('/login');
        return;
    }

    // Verify API key is valid
    fetch('/api/session/status', {
        headers: {
            'x-api-key': apiKey
        }
    }).then(response => {
        if (!response.ok) {
            // Invalid API key
            localStorage.removeItem('apiKey');
            localStorage.removeItem('rememberedApiKey');
            window.location.replace('/login');
        }
    }).catch(() => {
        // Error checking auth, redirect to login
        localStorage.removeItem('apiKey');
        window.location.replace('/login');
    });
})();

// Initialize app only if authenticated
document.addEventListener('DOMContentLoaded', () => {
    // Double check authentication
    if (!window.apiKey) {
        window.location.replace('/login');
        return;
    }

    updateTime();
    setInterval(updateTime, 1000);
    showSection('dashboard');

    // Add logout handler
    setupLogoutHandler();

    // Periodic auth check (every 5 minutes)
    setInterval(checkAuthentication, 300000);

    // Initialize theme
    initTheme();

    // Setup session timeout
    resetSessionTimeout();
});

// Authentication check function
function checkAuthentication() {
    if (!window.apiKey) {
        window.location.replace('/login');
        return false;
    }

    // Verify API key is still valid
    fetch('/api/session/status', {
        headers: {
            'x-api-key': window.apiKey
        }
    }).then(response => {
        if (!response.ok) {
            // API key is invalid, clear and redirect to login
            localStorage.removeItem('apiKey');
            localStorage.removeItem('rememberedApiKey');
            window.location.replace('/login');
        }
    }).catch(error => {
        console.error('Auth check error:', error);
        // On error, redirect to login for safety
        localStorage.removeItem('apiKey');
        window.location.replace('/login');
    });

    return true;
}

// Setup logout handler
function setupLogoutHandler() {
    // Override the global logout function
    window.logout = async function() {
        const result = await Swal.fire({
            title: 'خروج از پنل',
            text: 'آیا مطمئن هستید که می‌خواهید خارج شوید؟',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'بله، خروج',
            cancelButtonText: 'انصراف',
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6'
        });

        if (result.isConfirmed) {
            // Clear all stored data
            localStorage.clear();
            sessionStorage.clear();

            // Clear cookies if any
            document.cookie.split(";").forEach(function(c) {
                document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
            });

            // Show logout message
            await Swal.fire({
                icon: 'success',
                title: 'خروج موفق',
                text: 'به امید دیدار مجدد',
                timer: 1500,
                timerProgressBar: true,
                showConfirmButton: false
            });

            // Force redirect to login
            window.location.replace('/login');
        }
    };
}

// Update time
function updateTime() {
    const now = new Date();
    const timeElement = document.getElementById('current-time');
    if (timeElement) {
        timeElement.textContent = now.toLocaleDateString('fa-IR') + ' ' + now.toLocaleTimeString('fa-IR');
    }
}

// Show section
async function showSection(section, element = null) {
    // Check auth before showing any section
    if (!window.apiKey) {
        window.location.replace('/login');
        return;
    }

    window.currentSection = section;

    // Update navigation
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

    // Find and activate the correct nav link
    if (element) {
        element.classList.add('active');
    } else {
        // Find the nav link by href
        const navLink = document.querySelector(`.nav-link[href="#${section}"]`);
        if (navLink) {
            navLink.classList.add('active');
        }
    }

    // Update title
    const titles = {
        'dashboard': 'داشبورد',
        'sessions': 'مدیریت سشن‌ها',
        'channels': 'مدیریت کانال‌ها',
        'monitoring': 'مانیتورینگ',
        'api-keys': 'کلیدهای API',
        'settings': 'تنظیمات'
    };

    const titleElement = document.getElementById('section-title');
    if (titleElement) {
        titleElement.textContent = titles[section] || 'داشبورد';
    }

    // Load section
    const container = document.getElementById('sections-container');
    if (!container) return;

    showLoadingSpinner();

    try {
        switch(section) {
            case 'dashboard':
                await loadDashboard(container);
                break;
            case 'sessions':
                await loadSessions(container);
                break;
            case 'channels':
                await loadChannels(container);
                break;
            case 'monitoring':
                await loadMonitoring(container);
                break;
            case 'api-keys':
                await loadApiKeys(container);
                break;
            case 'settings':
                await loadSettings(container);
                break;
        }
    } catch (error) {
        console.error('Error loading section:', error);

        // Check if it's an auth error
        if (error.message && (error.message.includes('401') || error.message.includes('Unauthorized'))) {
            localStorage.removeItem('apiKey');
            window.location.replace('/login');
            return;
        }

        container.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i>
                خطا در بارگذاری بخش ${titles[section]}
            </div>
        `;
    } finally {
        hideLoadingSpinner();
    }
}

// Refresh data
async function refreshData() {
    const activeLink = document.querySelector('.nav-link.active');
    showSection(window.currentSection, activeLink);
}

// Logout function
function logout() {
    // This will be overridden by setupLogoutHandler
}

// Loading spinner functions
function showLoadingSpinner() {
    const spinner = document.querySelector('.loading-spinner');
    if (spinner) {
        spinner.classList.add('active');
    }
}

function hideLoadingSpinner() {
    const spinner = document.querySelector('.loading-spinner');
    if (spinner) {
        spinner.classList.remove('active');
    }
}

// API helper function with auth handling
async function apiRequest(endpoint, options = {}) {
    // Check if we have API key
    if (!window.apiKey) {
        window.location.replace('/login');
        throw new Error('No API key');
    }

    const defaultOptions = {
        headers: {
            'x-api-key': window.apiKey,
            'Content-Type': 'application/json'
        }
    };

    // Merge headers
    if (options.headers) {
        options.headers = { ...defaultOptions.headers, ...options.headers };
    } else {
        options.headers = defaultOptions.headers;
    }

    const response = await fetch(endpoint, options);

    // Handle auth errors
    if (response.status === 401) {
        // Invalid API key, redirect to login
        localStorage.removeItem('apiKey');
        localStorage.removeItem('rememberedApiKey');
        window.location.replace('/login');
        throw new Error('Unauthorized');
    }

    if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
    }

    return response.json();
}

// Format numbers to Persian
function toPersianNumber(num) {
    const persianNumbers = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return num.toString().replace(/\d/g, x => persianNumbers[x]);
}

// Format uptime
function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
        return `${days} روز ${hours} ساعت ${minutes} دقیقه`;
    } else if (hours > 0) {
        return `${hours} ساعت ${minutes} دقیقه`;
    } else {
        return `${minutes} دقیقه`;
    }
}

// Session timeout handler
let sessionTimeout;
let warningTimeout;

function resetSessionTimeout() {
    // Clear existing timeouts
    if (sessionTimeout) clearTimeout(sessionTimeout);
    if (warningTimeout) clearTimeout(warningTimeout);

    // Show warning after 25 minutes
    warningTimeout = setTimeout(() => {
        Swal.fire({
            title: 'هشدار',
            text: 'جلسه شما در 5 دقیقه آینده منقضی می‌شود',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'ادامه جلسه',
            cancelButtonText: 'خروج',
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33'
        }).then((result) => {
            if (result.isConfirmed) {
                // Reset timeout
                resetSessionTimeout();
                // Make a request to keep session alive
                apiRequest('/api/session/status').catch(() => {});
            } else {
                logout();
            }
        });
    }, 25 * 60 * 1000); // 25 minutes

    // Auto logout after 30 minutes
    sessionTimeout = setTimeout(() => {
        Swal.fire({
            icon: 'info',
            title: 'جلسه منقضی شد',
            text: 'برای ادامه لطفا دوباره وارد شوید',
            confirmButtonText: 'باشه'
        }).then(() => {
            localStorage.removeItem('apiKey');
            window.location.replace('/login');
        });
    }, 30 * 60 * 1000); // 30 minutes
}

// Track user activity
document.addEventListener('click', resetSessionTimeout);
document.addEventListener('keypress', resetSessionTimeout);
document.addEventListener('mousemove', () => {
    // Only reset on significant mouse movement
    if (!window.lastMouseMove || Date.now() - window.lastMouseMove > 1000) {
        window.lastMouseMove = Date.now();
        resetSessionTimeout();
    }
});