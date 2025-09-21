// Authentication Manager
class AuthManager {
    constructor() {
        this.tokenKey = 'imedcalc_jwt';
        this.userKey = 'imedcalc_user';
        this.init();
    }

    init() {
        // Check for existing token on load
        const token = this.getToken();
        if (token) {
            this.validateToken().then(valid => {
                if (valid) {
                    this.updateUI(true);
                    this.scheduleTokenRefresh();
                } else {
                    this.clearAuth();
                }
            }).catch(() => this.clearAuth());
        } else {
            this.updateUI(false);
        }

        // Event listeners
        this.attachEventListeners();
    }

    attachEventListeners() {
        // Form submissions
        document.getElementById('loginForm')?.addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('registerForm')?.addEventListener('submit', (e) => this.handleRegister(e));
        document.getElementById('logoUploadForm')?.addEventListener('submit', (e) => this.handleLogoUpload(e));
    }

    async apiCall(endpoint, options = {}) {
        const token = this.getToken();
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        try {
            const response = await fetch(endpoint, config);
            const data = await response.json();

            if (response.status === 401 || (data.error && data.error.includes('ტოკენი'))) {
                this.clearAuth();
                throw new Error('სესია ვადაგასულია. გთხოვთ, შეხვიდეთ ხელახლა.');
            }

            if (!response.ok) {
                throw new Error(data.error || `შეცდომა: ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // Token Management
    getToken() {
        return localStorage.getItem(this.tokenKey);
    }

    setToken(token, user) {
        localStorage.setItem(this.tokenKey, token);
        if (user) {
            localStorage.setItem(this.userKey, JSON.stringify(user));
        }
        this.updateUI(true);
        this.scheduleTokenRefresh();
        this.showToast('მომხმარებელი შეხვედრა წარმატებულია', 'success');
    }

    clearAuth() {
        localStorage.removeItem(this.tokenKey);
        localStorage.removeItem(this.userKey);
        this.updateUI(false);
        this.clearTokenRefresh();
    }

    async validateToken() {
        if (!this.getToken()) return false;
        try {
            const data = await this.apiCall('/api/profile');
            return !!data.id;
        } catch {
            return false;
        }
    }

    scheduleTokenRefresh() {
        // Clear existing timeout
        this.clearTokenRefresh();
        
        // Schedule refresh in 20 hours (token expires in 24h)
        this.refreshTimeout = setTimeout(async () => {
            try {
                const data = await this.apiCall('/api/profile');
                if (data.id) {
                    this.showToast('სესია განახლდა ავტომატურად', 'info');
                }
            } catch {
                this.clearAuth();
            }
        }, 20 * 60 * 60 * 1000); // 20 hours
    }

    clearTokenRefresh() {
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout);
            this.refreshTimeout = null;
        }
    }

    // UI Updates
    updateUI(isLoggedIn) {
        const loginBtn = document.getElementById('loginBtn');
        const registerBtn = document.getElementById('registerBtn');
        const profileBtn = document.getElementById('profileBtn');
        const logoutBtn = document.getElementById('logoutBtn');

        if (isLoggedIn) {
            loginBtn?.classList.add('hidden');
            registerBtn?.classList.add('hidden');
            profileBtn?.classList.remove('hidden');
            logoutBtn?.classList.remove('hidden');
            
            // Load profile info
            this.loadProfileInfo();
        } else {
            loginBtn?.classList.remove('hidden');
            registerBtn?.classList.remove('hidden');
            profileBtn?.classList.add('hidden');
            logoutBtn?.classList.add('hidden');
        }
    }

    async loadProfileInfo() {
        try {
            const profile = await this.apiCall('/api/profile');
            const profileInfo = document.getElementById('profileInfo');
            if (profileInfo) {
                profileInfo.innerHTML = `
                    <div class="flex items-center justify-between p-3 bg-gradient-to-r from-brand/10 to-brand-2/10 rounded-xl">
                        <div>
                            <p class="font-semibold text-brand">${profile.name}</p>
                            <p class="text-muted text-sm">${profile.email}</p>
                        </div>
                        <div class="text-xs text-muted">
                            ID: ${profile.id}
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Profile load error:', error);
        }
    }

    // Form Handlers
    async handleLogin(event) {
        event.preventDefault();
        const form = event.target;
        const formData = new FormData(form);
        const data = Object.fromEntries(formData);
        const errorEl = document.getElementById('loginError');

        try {
            errorEl.classList.add('hidden');
            this.setLoading(form, true);

            const response = await this.apiCall('/api/login', {
                method: 'POST',
                body: JSON.stringify(data)
            });

            this.setToken(response.token, response.user);
            hideModal('loginModal');
            form.reset();

        } catch (error) {
            this.showError(errorEl, error.message);
        } finally {
            this.setLoading(form, false);
        }
    }

    async handleRegister(event) {
        event.preventDefault();
        const form = event.target;
        const formData = new FormData(form);
        const data = Object.fromEntries(formData);
        const errorEl = document.getElementById('registerError');

        try {
            errorEl.classList.add('hidden');
            this.setLoading(form, true);

            const response = await this.apiCall('/api/register', {
                method: 'POST',
                body: JSON.stringify(data)
            });

            this.setToken(response.token, response.user);
            hideModal('registerModal');
            form.reset();
            this.showToast('რეგისტრაცია წარმატებულია! მოგესალმებით!', 'success');

        } catch (error) {
            this.showError(errorEl, error.message);
        } finally {
            this.setLoading(form, false);
        }
    }

    async handleLogoUpload(event) {
        event.preventDefault();
        const form = event.target;
        const formData = new FormData(form);
        const errorEl = document.getElementById('uploadError');
        const fileInput = form.querySelector('input[type="file"]');

        if (!fileInput.files?.length) {
            this.showError(errorEl, 'გთხოვთ, აირჩიოთ SVG ფაილი');
            return;
        }

        const file = fileInput.files[0];
        if (file.size > 2 * 1024 * 1024) {
            this.showError(errorEl, 'ფაილის ზომა უნდა იყოს 2MB-ზე ნაკლები');
            return;
        }

        try {
            errorEl.classList.add('hidden');
            this.setLoading(form, true);

            const response = await this.apiCall('/api/upload-logo', {
                method: 'POST',
                body: formData
            });

            this.showToast('ლოგო წარმატებით ატვირთულია!', 'success');
            hideModal('profileModal');
            
            // Reload to show new logo
            setTimeout(() => location.reload(), 1000);

        } catch (error) {
            this.showError(errorEl, error.message);
        } finally {
            this.setLoading(form, false);
        }
    }

    async handleLogout() {
        if (confirm('ნამდვილად გსურთ გამოსვლა?')) {
            this.clearAuth();
            this.showToast('გამოსვლა წარმატებულია', 'info');
        }
    }

    // Utility Methods
    setLoading(form, loading) {
        const submitBtn = form.querySelector('button[type="submit"]');
        if (loading) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '⏳ მუშავდება...';
        } else {
            submitBtn.disabled = false;
            submitBtn.innerHTML = submitBtn.dataset.originalText || submitBtn.innerHTML.replace('⏳ მუშავდება...', '');
        }
    }

    showError(element, message) {
        if (!element) return;
        element.textContent = message;
        element.className = 'mt-4 p-3 rounded-lg bg-red-100/20 border border-red-500/30 text-red-400';
        element.classList.remove('hidden');
        
        // Auto-hide after 5 seconds
        setTimeout(() => element.classList.add('hidden'), 5000);
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        container.classList.remove('hidden');
        
        const toast = document.createElement('div');
        const colors = {
            success: { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400' },
            error: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400' },
            info: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400' },
            warning: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400' }
        };
        
        const colorClass = colors[type] || colors.info;
        
        toast.innerHTML = `
            <div class="flex items-center gap-2 p-4 rounded-xl ${colorClass.bg} border-l-4 ${colorClass.border} ${colorClass.text} shadow-lg backdrop-blur-sm">
                <span>${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" class="ml-auto text-current hover:text-opacity-70">×</button>
            </div>
        `;
        
        container.appendChild(toast);
        
        // Auto-remove after 4 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
                if (container.children.length === 0) {
                    container.classList.add('hidden');
                }
            }
        }, 4000);
    }

    // Modal helpers (for compatibility)
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('hidden');
            modal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('overflow-hidden');
        }
    }
}

// Initialize AuthManager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.authManager = new AuthManager();
});

// Global functions for backward compatibility
function showModal(id) {
    if (window.authManager) {
        window.authManager.showModal(id);
    } else {
        document.getElementById(id)?.classList.remove('hidden');
    }
}

function hideModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('overflow-hidden');
    }
}

function showPasswordReset() {
    const email = prompt('შეიყვანეთ იმეილის მისამართი პაროლის აღდგენისთვის:');
    if (!email) return;
    
    if (!window.authManager) {
        alert('ავტორიზაციის სისტემა არ არის ხელმისაწვდომი');
        return;
    }

    window.authManager.apiCall('/api/password-reset-request', {
        method: 'POST',
        body: JSON.stringify({ email })
    }).then(response => {
        window.authManager.showToast(response.message, 'info');
    }).catch(error => {
        window.authManager.showToast(error.message, 'error');
    });
}

function handleLogout() {
    if (window.authManager) {
        window.authManager.handleLogout();
    }
}

// Close modals on outside click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        const modalId = e.target.id;
        hideModal(modalId);
    }
});

// Close modals on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal:not(.hidden)').forEach(modal => {
            hideModal(modal.id);
        });
    }
});