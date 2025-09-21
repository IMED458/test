// Core Calculator Functions
class CalculatorManager {
    constructor() {
        this.init();
    }

    init() {
        this.formatNumber = this.formatNumber.bind(this);
        this.setResult = this.setResult.bind(this);
        this.requireValidNumber = this.requireValidNumber.bind(this);
        
        // Initialize all calculators
        this.attachEventListeners();
        
        // Show first calculator by default
        this.showCalculator('bicarb-card');
    }

    attachEventListeners() {
        // Auto-calculate on input change for better UX
        document.addEventListener('input', (e) => {
            if (e.target.closest('.card')) {
                const cardId = e.target.closest('.card').id;
                this.debounce(() => this.autoCalculate(cardId), 300)();
            }
        });
    }

    // Calculator Functions
    calcBicarb() {
        const weight = parseFloat(document.getElementById('bicarb-weight').value);
        const be = parseFloat(document.getElementById('bicarb-be').value);
        
        if (!this.requireValidNumber(weight, be) || be <= 0) {
            this.setResult('bicarb-result', NaN);
            return;
        }
        
        const dose = weight * be * 2 * 0.3; // Formula: weight × |BE| × 2 × 0.3
        this.setResult('bicarb-result', dose, 'მლ 8.4% NaHCO₃');
        
        // Show warning for high doses
        if (dose > 100) {
            this.showWarning('bicarb-result', 'მაღალი დოზა! შეამოწმეთ გამოთვლა და მონიტორინგი აუცილებელია.');
        }
    }

    calcPotassium() {
        const weight = parseFloat(document.getElementById('k-weight').value);
        const level = parseFloat(document.getElementById('k-level').value);
        
        if (!this.requireValidNumber(weight, level) || level <= 0) {
            this.setResult('potassium-result', NaN);
            return;
        }
        
        // Safety check - don't suggest dangerous corrections
        if (level < 2.5) {
            this.showError('potassium-result', '⚠️ კრიტიკულად დაბალი K! კონსულტაცია კარდიოლოგთან აუცილებელია.');
            return;
        }
        
        const amount = (weight * 1.74) / level; // Formula for KCl correction
        this.setResult('potassium-result', amount, 'მლ 15% KCl');
        
        // Rate warning
        if (amount > 40) {
            this.showWarning('potassium-result', `მაღალი დოზა (${amount.toFixed(1)} მლ). მაქს. 10-20 mmol/სთ გადასხმის სიჩქარე!`);
        }
    }

    calcKcoef() {
        const mg = parseFloat(document.getElementById('kcoef-mg').value);
        const volume = parseFloat(document.getElementById('kcoef-vol').value);
        
        if (!this.requireValidNumber(mg, volume) || volume <= 0) {
            this.setResult('kcoef-result', NaN);
            return;
        }
        
        const concentration = (mg * 1000) / volume; // mg to mcg conversion
        this.setResult('kcoef-result', concentration, 'მკგ/მლ');
        
        // Concentration guidance
        let guidance = '';
        if (concentration > 1000) {
            guidance = 'მაღალი კონცენტრაცია - ფრთხილად გამოყენება';
        } else if (concentration < 100) {
            guidance = 'დაბალი კონცენტრაცია - შესაძლოა მეტი მოცულობა დაჭირდეს';
        }
        
        if (guidance) {
            this.showInfo('kcoef-result', guidance);
        }
    }

    calcSolu() {
        const weight = parseFloat(document.getElementById('solu-weight').value);
        
        if (!this.requireValidNumber(weight)) {
            this.setResult('solu-result', NaN);
            return;
        }
        
        const dose = 30 * weight; // Standard 30 mg/kg loading dose
        this.setResult('solu-result', dose, 'მგ IV');
        
        // Volume calculation guidance (assuming 125 mg/mL concentration)
        const volume = dose / 125;
        this.showInfo('solu-result', `მოცულობა: ${(volume).toFixed(1)} მლ (125 მგ/მლ-ის კონცენტრაციით)`);
    }

    calcCrCl() {
        const age = parseFloat(document.getElementById('crcl-age').value);
        const weight = parseFloat(document.getElementById('crcl-weight').value);
        const gender = document.getElementById('crcl-gender').value;
        const creatinine = parseFloat(document.getElementById('crcl-creatinine').value);
        const unit = document.getElementById('crcl-unit').value;
        
        if (!this.requireValidNumber(age, weight, creatinine) || age < 0 || weight <= 0 || creatinine <= 0) {
            this.setResult('crcl-result', NaN);
            this.hideRecommendations();
            return;
        }
        
        // Convert µmol/L to mg/dL if necessary (1 mg/dL = 88.4 µmol/L)
        let crValue = unit === 'µmol/L' ? creatinine / 88.4 : creatinine;
        
        const genderFactor = gender === 'female' ? 0.85 : 1;
        const crcl = ((140 - age) * weight * genderFactor) / (72 * crValue);
        
        this.setResult('crcl-result', Math.max(0, crcl), 'მლ/წთ');
        
        // Show recommendations based on CrCl category
        this.showRecommendations(Math.max(0, crcl));
    }

    // Utility Methods
    formatNumber(n) {
        if (isNaN(n) || !isFinite(n)) return "—";
        
        const abs = Math.abs(n);
        if (abs >= 1000) {
            return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
        }
        if (abs >= 100) {
            return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
        }
        return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }

    setResult(elementId, value, unit = '') {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        const formattedValue = this.formatNumber(value);
        const displayText = unit ? `${formattedValue} ${unit}` : formattedValue;
        element.textContent = `შედეგი: ${displayText}`;
        element.className = 'result';
        
        // Add animation for new results
        element.style.transform = 'scale(1.02)';
        setTimeout(() => element.style.transform = 'scale(1)', 200);
    }

    requireValidNumber(...values) {
        return values.every(v => typeof v === 'number' && isFinite(v) && !isNaN(v));
    }

    showCalculator(cardId) {
        // Hide all cards
        document.querySelectorAll('.card').forEach(card => {
            card.style.display = 'none';
        });
        
        // Show selected card
        const selectedCard = document.getElementById(cardId);
        if (selectedCard) {
            selectedCard.style.display = 'block';
        }
        
        // Show grid
        const grid = document.getElementById('calculatorGrid');
        grid.classList.add('active');
        
        // Auto-calculate if inputs have values
        setTimeout(() => this.autoCalculate(cardId), 100);
    }

    autoCalculate(cardId) {
        const calculatorMethods = {
            'bicarb-card': () => this.calcBicarb(),
            'potassium-card': () => this.calcPotassium(),
            'kcoef-card': () => this.calcKcoef(),
            'solu-card': () => this.calcSolu(),
            'crcl-card': () => this.calcCrCl()
        };
        
        const method = calculatorMethods[cardId];
        if (method) {
            method();
        }
    }

    resetCard(cardId) {
        const card = document.getElementById(cardId);
        if (!card) return;
        
        // Clear inputs
        card.querySelectorAll('input, select').forEach(input => {
            if (input.tagName === 'SELECT') {
                input.selectedIndex = 0;
            } else {
                input.value = '';
            }
        });
        
        // Clear results
        const result = card.querySelector('.result');
        if (result) {
            result.textContent = 'შედეგი: —';
        }
        
        // Hide recommendations for CrCl
        if (cardId === 'crcl-card') {
            this.hideRecommendations();
        }
        
        this.showToast('ფორმა გასუფთავდა', 'info');
    }

    async copyResult(resultId) {
        const resultElement = document.getElementById(resultId);
        if (!resultElement || resultElement.textContent === 'შედეგი: —') {
            this.showToast('არაფერია კოპირებისთვის', 'warning');
            return;
        }

        try {
            await navigator.clipboard.writeText(resultElement.textContent);
            this.showToast('შედეგი კლიპბორდში დაიკოპირდა ✅', 'success');
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = resultElement.textContent;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.showToast('შედეგი კოპირებულია', 'success');
        }
    }

    showRecommendations(crcl) {
        const recDiv = document.getElementById('crcl-recommendations');
        const tableBody = document.getElementById('crcl-rec-table-body');
        
        if (!recDiv || !tableBody) return;
        
        // Determine category
        let category, range;
        if (crcl >= 50) {
            category = 'normal';
            range = '>50';
        } else if (crcl >= 30) {
            category = 'mild';
            range = '30-50';
        } else if (crcl >= 10) {
            category = 'moderate';
            range = '10-30';
        } else {
            category = 'severe';
            range = '<10';
        }
        
        // Generate recommendations table
        const recommendations = this.getAntibioticRecommendations(category);
        tableBody.innerHTML = '';
        
        recommendations.forEach(rec => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td data-label="ანტიბიოტიკი">${rec.name}</td>
                <td data-label="CrCl">${rec.crcl}</td>
                <td data-label="დოზა">${rec.dose}</td>
                <td data-label="სიხშირე">${rec.frequency}</td>
            `;
            tableBody.appendChild(row);
        });
        
        recDiv.classList.remove('hidden');
        
        // Show category warning
        const resultElement = document.getElementById('crcl-result');
        const warnings = {
            normal: 'ნორმალური თირკმელის ფუნქცია',
            mild: 'მსუბუქი შეზღუდვა - ზოგიერთი კორექცია შეიძლება საჭირო გახდეს',
            moderate: 'საშუალო შეზღუდვა - დოზირების კორექცია აუცილებელია',
            severe: 'მძიმე შეზღუდვა - ფრთხილი დოზირება და მონიტორინგი'
        };
        
        if (resultElement) {
            resultElement.innerHTML = `
                <span>შედეგი: ${this.formatNumber(crcl)} მლ/წთ</span>
                <div class="mt-2 pt-2 text-xs ${category === 'normal' ? 'text-ok' : 'text-warn'}">
                    ${warnings[category]}
                </div>
            `;
        }
    }

    hideRecommendations() {
        const recDiv = document.getElementById('crcl-recommendations');
        if (recDiv) {
            recDiv.classList.add('hidden');
        }
    }

    getAntibioticRecommendations(category) {
        const recs = {
            amoxicillin: {
                normal: { name: 'ამოქსიცილინი', crcl: '>50', dose: '500-875 მგ', frequency: 'ყოველ 8-12 სთ' },
                mild: { name: 'ამოქსიცილინი', crcl: '30-50', dose: '500 მგ', frequency: 'ყოველ 12 სთ' },
                moderate: { name: 'ამოქსიცილინი', crcl: '10-30', dose: '500 მგ', frequency: 'ყოველ 12-24 სთ' },
                severe: { name: 'ამოქსიცილინი', crcl: '<10', dose: '500 მგ', frequency: 'ყოველ 24 სთ' }
            },
            ciprofloxacin: {
                normal: { name: 'ციპროფლოქსაცინი', crcl: '>50', dose: '250-750 მგ', frequency: 'ყოველ 12 სთ' },
                mild: { name: 'ციპროფლოქსაცინი', crcl: '30-50', dose: '250-500 მგ', frequency: 'ყოველ 12 სთ' },
                moderate: { name: 'ციპროფლოქსაცინი', crcl: '10-30', dose: '250-500 მგ', frequency: 'ყოველ 24 სთ' },
                severe: { name: 'ციპროფლოქსაცინი', crcl: '<10', dose: '250 მგ', frequency: 'ყოველ 48 სთ' }
            },
            gentamicin: {
                normal: { name: 'გენტამიცინი', crcl: '>50', dose: '5-7 მგ/კგ', frequency: 'ყოველ 24 სთ' },
                mild: { name: 'გენტამიცინი', crcl: '30-50', dose: '3-5 მგ/კგ', frequency: 'ყოველ 24 სთ' },
                moderate: { name: 'გენტამიცინი', crcl: '10-30', dose: '2-3 მგ/კგ', frequency: 'ყოველ 48 სთ' },
                severe: { name: 'გენტამიცინი', crcl: '<10', dose: '1-2 მგ/კგ', frequency: 'ყოველ 72 სთ' }
            },
            meropenem: {
                normal: { name: 'მეროპენემი', crcl: '>50', dose: '1-2 გ', frequency: 'ყოველ 8 სთ' },
                mild: { name: 'მეროპენემი', crcl: '30-50', dose: '1-2 გ', frequency: 'ყოველ 12 სთ' },
                moderate: { name: 'მეროპენემი', crcl: '10-30', dose: '500 მგ-1 გ', frequency: 'ყოველ 12 სთ' },
                severe: { name: 'მეროპენემი', crcl: '<10', dose: '500 მგ', frequency: 'ყოველ 24 სთ' }
            },
            vancomycin: {
                normal: { name: 'ვანკომიცინი', crcl: '>50', dose: '15-20 მგ/კგ', frequency: 'ყოველ 8-12 სთ' },
                mild: { name: 'ვანკომიცინი', crcl: '30-50', dose: '15 მგ/კგ', frequency: 'ყოველ 24 სთ' },
                moderate: { name: 'ვანკომიცინი', crcl: '10-30', dose: '15 მგ/კგ', frequency: 'ყოველ 48 სთ' },
                severe: { name: 'ვანკომიცინი', crcl: '<10', dose: 'მონიტორინგი', frequency: 'ინდივიდუალური' }
            }
        };

        const result = [];
        Object.entries(recs).forEach(([key, doses]) => {
            result.push(doses[category]);
        });

        return result;
    }

    // UI Helpers
    showWarning(elementId, message) {
        this.showNotification(elementId, message, 'warning');
    }

    showError(elementId, message) {
        this.showNotification(elementId, message, 'error');
    }

    showInfo(elementId, message) {
        this.showNotification(elementId, message, 'info');
    }

    showNotification(elementId, message, type) {
        const element = document.getElementById(elementId);
        if (!element) return;

        // Remove existing notification
        const existing = element.querySelector('.notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = `notification mt-2 p-2 rounded text-xs ${type === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : type === 'warning' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`;
        notification.textContent = message;
        element.appendChild(notification);

        // Auto-remove after 6 seconds
        setTimeout(() => notification.remove(), 6000);
    }

    showToast(message, type = 'info') {
        if (window.authManager && window.authManager.showToast) {
            window.authManager.showToast(message, type);
        }
    }

    // Debounce utility for auto-calculation
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// Theme Management
class ThemeManager {
    constructor() {
        this.init();
    }

    init() {
        this.loadSavedTheme();
        this.attachThemeToggle();
    }

    loadSavedTheme() {
        const savedTheme = localStorage.getItem('imedcalc_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        document.getElementById('themeText').textContent = savedTheme === 'dark' ? 'ღია თემა' : 'მუქი თემა';
        
        // Update sun/moon icons
        const sunIcon = document.querySelector('.sun-hidden');
        const moonIcon = document.querySelector('.moon-hidden');
        if (sunIcon) sunIcon.style.display = savedTheme === 'dark' ? 'block' : 'none';
        if (moonIcon) moonIcon.style.display = savedTheme === 'dark' ? 'none' : 'block';
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('imedcalc_theme', newTheme);
        
        document.getElementById('themeText').textContent = newTheme === 'dark' ? 'ღია თემა' : 'მუქი თემა';
        
        // Animate icon change
        const sunIcon = document.querySelector('.sun-hidden');
        const moonIcon = document.querySelector('.moon-hidden');
        if (sunIcon) sunIcon.style.display = newTheme === 'dark' ? 'block' : 'none';
        if (moonIcon) moonIcon.style.display = newTheme === 'dark' ? 'none' : 'block';
        
        // Show theme change toast
        if (window.authManager) {
            window.authManager.showToast(`თემა შეცვლილია: ${newTheme === 'dark' ? 'მუქი' : 'ღია'}`, 'info');
        }
    }

    attachThemeToggle() {
        const toggleBtn = document.querySelector('.theme-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggleTheme());
        }
    }
}

// PWA Service Worker
class PWAManager {
    constructor() {
        this.initPWA();
    }

    initPWA() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js')
                    .then(registration => {
                        console.log('✅ Service Worker რეგისტრირებულია:', registration.scope);
                        if (window.authManager) {
                            window.authManager.showToast('PWA მოდი ჩართულია', 'success');
                        }
                    })
                    .catch(error => {
                        console.error('❌ Service Worker რეგისტრაციის შეცდომა:', error);
                        if (window.authManager) {
                            window.authManager.showToast('PWA ფუნქცია შეზღუდულია', 'warning');
                        }
                    });
            });
        }

        // Handle PWA install prompt
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            window.installPrompt = e;
            
            // Show install button after delay
            setTimeout(() => {
                const installBtn = document.createElement('button');
                installBtn.innerHTML = '📱 დაამონტაჟე აპი';
                installBtn.className = 'fixed top-4 right-4 nav-btn z-40';
                installBtn.onclick = () => this.handleInstall(installBtn);
                document.body.appendChild(installBtn);
                
                setTimeout(() => {
                    if (installBtn.parentElement) installBtn.remove();
                }, 10000);
            }, 2000);
        });
    }

    async handleInstall(button) {
        if (!window.installPrompt) return;
        
        button.disabled = true;
        button.innerHTML = '⏳ მუშავდება...';
        
        try {
            window.installPrompt.prompt();
            const { outcome } = await window.installPrompt.userChoice;
            
            if (outcome === 'accepted') {
                if (window.authManager) {
                    window.authManager.showToast('აპლიკაცია მონტაჟის პროცესშია', 'success');
                }
                window.installPrompt = null;
            }
        } catch (error) {
            console.error('Install error:', error);
        } finally {
            button.remove();
        }
    }
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize managers
    window.calculatorManager = new CalculatorManager();
    window.themeManager = new ThemeManager();
    window.pwaManager = new PWAManager();
    
    // Global function compatibility
    window.showCalculator = (cardId) => window.calculatorManager?.showCalculator(cardId);
    window.calcBicarb = () => window.calculatorManager?.calcBicarb();
    window.calcPotassium = () => window.calculatorManager?.calcPotassium();
    window.calcKcoef = () => window.calculatorManager?.calcKcoef();
    window.calcSolu = () => window.calculatorManager?.calcSolu();
    window.calcCrCl = () => window.calculatorManager?.calcCrCl();
    window.resetCard = (cardId) => window.calculatorManager?.resetCard(cardId);
    window.copyResult = (resultId) => window.calculatorManager?.copyResult(resultId);
    window.toggleTheme = () => window.themeManager?.toggleTheme();
    window.showToast = (message, type) => window.calculatorManager?.showToast(message, type);
    
    console.log('✅ IMEDCalc 2.0 ინიციალიზაცია დასრულებულია');
});

// Global error handler
window.addEventListener('error', (e) => {
    console.error('Global error:', e.error);
    if (window.authManager) {
        window.authManager.showToast('გაჩნდა შეცდომა. გთხოვთ, განაახლოთ გვერდი.', 'error');
    }
});

// Handle offline status
window.addEventListener('online', () => {
    if (window.authManager) {
        window.authManager.showToast('ინტერნეტ კავშირი აღდგა', 'success');
    }
});

window.addEventListener('offline', () => {
    if (window.authManager) {
        window.authManager.showToast('ინტერნეტ კავშირი დაკარგულია', 'warning');
    }
});