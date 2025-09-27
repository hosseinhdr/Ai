class AdminDashboard {
    constructor() {
        this.currentSection = 'overview';
        this.currentPage = 1;
        this.currentFilter = 'all';
        this.currentSearch = '';
        this.currentDays = 7;
        this.charts = {};

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadStats();
        this.initCharts();
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const section = item.dataset.section;
                this.switchSection(section);
            });
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });

        // Refresh
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.refreshCurrentSection();
        });

        // Export
        document.getElementById('exportBtn').addEventListener('click', () => {
            this.exportData();
        });

        // Search
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.currentSearch = e.target.value;
                this.currentPage = 1;
                this.loadUsers();
            });
        }

        // Filter
        const filterSelect = document.getElementById('filterSelect');
        if (filterSelect) {
            filterSelect.addEventListener('change', (e) => {
                this.currentFilter = e.target.value;
                this.currentPage = 1;
                this.loadUsers();
            });
        }

        // Period buttons
        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentDays = parseInt(btn.dataset.days);
                this.loadDailyStats();
            });
        });

        // Add Prize button
        const addPrizeBtn = document.getElementById('addPrizeBtn');
        if (addPrizeBtn) {
            addPrizeBtn.addEventListener('click', () => {
                this.openPrizeModal();
            });
        }

        // Normalize probabilities button
        const normalizeProbBtn = document.getElementById('normalizeProbBtn');
        if (normalizeProbBtn) {
            normalizeProbBtn.addEventListener('click', () => {
                this.normalizeProbabilities();
            });
        }

        // Prize form submit
        const prizeForm = document.getElementById('prizeForm');
        if (prizeForm) {
            prizeForm.addEventListener('submit', (e) => {
                this.savePrize(e);
            });
        }
    }

    switchSection(section) {
        // Update nav
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`.nav-item[data-section="${section}"]`).classList.add('active');

        // Update sections
        document.querySelectorAll('.section').forEach(sec => {
            sec.classList.remove('active');
        });
        document.getElementById(`${section}Section`).classList.add('active');

        // Update title
        const titles = {
            overview: 'نمای کلی',
            users: 'کاربران',
            prizes: 'جوایز',
            daily: 'آمار روزانه'
        };
        document.getElementById('sectionTitle').textContent = titles[section];

        this.currentSection = section;
        this.loadSectionData(section);
    }

    loadSectionData(section) {
        switch(section) {
            case 'overview':
                this.loadStats();
                break;
            case 'users':
                this.loadUsers();
                break;
            case 'prizes':
                this.loadPrizeStats();
                break;
            case 'daily':
                this.loadDailyStats();
                break;
        }
    }

    refreshCurrentSection() {
        this.loadSectionData(this.currentSection);
    }

    showLoading() {
        document.getElementById('loadingOverlay').classList.remove('hidden');
    }

    hideLoading() {
        document.getElementById('loadingOverlay').classList.add('hidden');
    }

    async loadStats() {
        this.showLoading();
        try {
            const response = await fetch('/admin/api/stats');
            const data = await response.json();

            if (data.success) {
                const stats = data.data;

                // Update main stats
                document.getElementById('totalUsers').textContent = this.formatNumber(stats.total.total_users);
                document.getElementById('verifiedUsers').textContent = this.formatNumber(stats.total.verified_count);
                document.getElementById('playedUsers').textContent = this.formatNumber(stats.total.played_count);

                const participationRate = stats.total.total_users > 0
                    ? ((stats.total.played_count / stats.total.total_users) * 100).toFixed(1)
                    : 0;
                document.getElementById('participationRate').textContent = `${participationRate}%`;

                // Update today stats
                document.getElementById('todayUsers').textContent = this.formatNumber(stats.today.today_users);
                document.getElementById('todayPlayed').textContent = this.formatNumber(stats.today.today_played);

                // Load charts data
                await this.loadChartData();
            }
        } catch (error) {
            console.error('Error loading stats:', error);
        }
        this.hideLoading();
    }

    async loadChartData() {
        try {
            // Daily stats for chart
            const dailyResponse = await fetch('/admin/api/daily-stats?days=7');
            const dailyData = await dailyResponse.json();

            if (dailyData.success) {
                this.updateDailyChart(dailyData.data);
            }

            // Prize stats for chart
            const prizeResponse = await fetch('/admin/api/prize-stats');
            const prizeData = await prizeResponse.json();

            if (prizeData.success) {
                this.updatePrizeChart(prizeData.data);
            }
        } catch (error) {
            console.error('Error loading chart data:', error);
        }
    }

    initCharts() {
        // Daily Chart
        const dailyCtx = document.getElementById('dailyChart');
        if (dailyCtx) {
            this.charts.daily = new Chart(dailyCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        {
                            label: 'کاربران جدید',
                            data: [],
                            borderColor: '#3B82F6',
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            tension: 0.3
                        },
                        {
                            label: 'شرکت‌کننده',
                            data: [],
                            borderColor: '#10B981',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            tension: 0.3
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: true,
                            text: 'آمار 7 روز اخیر',
                            color: '#FCD535',
                            font: {
                                family: 'IRANSansX',
                                size: 16
                            }
                        },
                        legend: {
                            labels: {
                                color: '#FFFFFF',
                                font: {
                                    family: 'IRANSansX'
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            ticks: { color: '#FFFFFF' },
                            grid: { color: 'rgba(255, 255, 255, 0.1)' }
                        },
                        x: {
                            ticks: { color: '#FFFFFF' },
                            grid: { color: 'rgba(255, 255, 255, 0.1)' }
                        }
                    }
                }
            });
        }

        // Prize Chart
        const prizeCtx = document.getElementById('prizeChart');
        if (prizeCtx) {
            this.charts.prize = new Chart(prizeCtx, {
                type: 'doughnut',
                data: {
                    labels: [],
                    datasets: [{
                        data: [],
                        backgroundColor: [
                            '#FF6B6B',
                            '#4DB6AC',
                            '#FFD93D',
                            '#6C63FF',
                            '#FF9800',
                            '#E91E63',
                            '#00BCD4',
                            '#9C27B0'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: true,
                            text: 'توزیع جوایز',
                            color: '#FCD535',
                            font: {
                                family: 'IRANSansX',
                                size: 16
                            }
                        },
                        legend: {
                            position: 'bottom',
                            labels: {
                                color: '#FFFFFF',
                                font: {
                                    family: 'IRANSansX'
                                }
                            }
                        }
                    }
                }
            });
        }
    }

    updateDailyChart(data) {
        if (!this.charts.daily) return;

        const labels = data.map(d => this.formatDate(d.date)).reverse();
        const usersData = data.map(d => d.total_users).reverse();
        const playedData = data.map(d => d.played_users).reverse();

        this.charts.daily.data.labels = labels;
        this.charts.daily.data.datasets[0].data = usersData;
        this.charts.daily.data.datasets[1].data = playedData;
        this.charts.daily.update();
    }

    updatePrizeChart(data) {
        if (!this.charts.prize) return;

        const labels = data.map(d => d.name);
        const counts = data.map(d => d.win_count);

        this.charts.prize.data.labels = labels;
        this.charts.prize.data.datasets[0].data = counts;
        this.charts.prize.update();
    }

    async loadUsers() {
        this.showLoading();
        try {
            const params = new URLSearchParams({
                page: this.currentPage,
                limit: 50,
                search: this.currentSearch,
                filter: this.currentFilter
            });

            const response = await fetch(`/admin/api/users?${params}`);
            const data = await response.json();

            if (data.success) {
                this.renderUsersTable(data.data.users);
                this.renderPagination(data.data.pagination);
            }
        } catch (error) {
            console.error('Error loading users:', error);
        }
        this.hideLoading();
    }

    renderUsersTable(users) {
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;

        tbody.innerHTML = users.map((user, index) => `
            <tr>
                <td>${((this.currentPage - 1) * 50) + index + 1}</td>
                <td style="direction: ltr; text-align: right;">${user.phone}</td>
                <td>
                    <span class="badge ${user.is_verified ? 'badge-success' : 'badge-danger'}">
                        ${user.is_verified ? 'تایید شده' : 'تایید نشده'}
                    </span>
                </td>
                <td>
                    <span class="badge ${user.has_played ? 'badge-success' : 'badge-warning'}">
                        ${user.has_played ? 'بله' : 'خیر'}
                    </span>
                </td>
                <td>${user.prize_name || user.prize || '-'}</td>
                <td>${user.prize_code || '-'}</td>
                <td>${this.formatDateTime(user.created_at)}</td>
                <td>${user.played_at ? this.formatDateTime(user.played_at) : '-'}</td>
            </tr>
        `).join('');
    }

    renderPagination(pagination) {
        const paginationDiv = document.getElementById('pagination');
        if (!paginationDiv) return;

        const pages = [];
        const maxPages = 5;
        const startPage = Math.max(1, pagination.page - Math.floor(maxPages / 2));
        const endPage = Math.min(pagination.pages, startPage + maxPages - 1);

        let html = `
            <button ${pagination.page === 1 ? 'disabled' : ''} onclick="dashboard.changePage(${pagination.page - 1})">قبلی</button>
        `;

        for (let i = startPage; i <= endPage; i++) {
            html += `
                <button class="${i === pagination.page ? 'active' : ''}" onclick="dashboard.changePage(${i})">${i}</button>
            `;
        }

        html += `
            <button ${pagination.page === pagination.pages ? 'disabled' : ''} onclick="dashboard.changePage(${pagination.page + 1})">بعدی</button>
        `;

        paginationDiv.innerHTML = html;
    }

    changePage(page) {
        this.currentPage = page;
        this.loadUsers();
    }

    async loadPrizeStats() {
        this.showLoading();
        try {
            const response = await fetch('/admin/api/prize-stats');
            const data = await response.json();

            if (data.success) {
                this.renderPrizesTable(data.data);
            }
        } catch (error) {
            console.error('Error loading prize stats:', error);
        }
        this.hideLoading();
    }

    renderPrizesTable(prizes) {
        const tbody = document.getElementById('prizesTableBody');
        if (!tbody) return;

        // Calculate total probability
        let totalProb = 0;
        prizes.forEach(prize => {
            if (prize.is_active) {
                totalProb += parseFloat(prize.probability);
            }
        });

        // Update total probability display
        const totalProbElement = document.getElementById('totalProbability');
        if (totalProbElement) {
            totalProbElement.textContent = totalProb.toFixed(4);
            const probSumElement = totalProbElement.parentElement;

            if (Math.abs(totalProb - 1.0) < 0.001) {
                probSumElement.classList.add('success');
                probSumElement.classList.remove('error');
            } else {
                probSumElement.classList.add('error');
                probSumElement.classList.remove('success');
            }
        }

        tbody.innerHTML = prizes.map(prize => {
            const expectedPercentage = (prize.probability * 100).toFixed(2);
            const actualPercentage = prize.win_percentage || 0;
            const difference = (actualPercentage - expectedPercentage).toFixed(2);

            return `
                <tr>
                    <td>${prize.name}</td>
                    <td>
                        <input type="number" 
                               class="prob-input" 
                               value="${prize.probability}" 
                               min="0" 
                               max="1" 
                               step="0.001"
                               data-id="${prize.id}"
                               onchange="dashboard.updateProbability(${prize.id}, this.value)">
                        <span>${expectedPercentage}%</span>
                    </td>
                    <td>${prize.win_count || 0}</td>
                    <td>${actualPercentage}%</td>
                    <td>
                        <span class="badge ${prize.is_active ? 'badge-success' : 'badge-danger'}">
                            ${prize.is_active ? 'فعال' : 'غیرفعال'}
                        </span>
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-sm btn-edit" onclick="dashboard.editPrize(${prize.id})">✏️</button>
                            <button class="btn-sm btn-toggle" onclick="dashboard.togglePrize(${prize.id}, ${!prize.is_active})">
                                ${prize.is_active ? '🔒' : '🔓'}
                            </button>
                            <button class="btn-sm btn-delete" onclick="dashboard.deletePrize(${prize.id})">🗑️</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async updateProbability(prizeId, newValue) {
        const probability = parseFloat(newValue);

        if (isNaN(probability) || probability < 0 || probability > 1) {
            alert('احتمال باید بین 0 و 1 باشد');
            this.loadPrizeStats();
            return;
        }

        try {
            const response = await fetch(`/admin/api/prizes/${prizeId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ probability })
            });

            const data = await response.json();

            if (data.success) {
                this.loadPrizeStats();
            } else {
                alert(data.message || 'خطا در بروزرسانی احتمال');
            }
        } catch (error) {
            console.error('Error updating probability:', error);
            alert('خطا در بروزرسانی احتمال');
        }
    }

    async editPrize(prizeId) {
        try {
            // Get prize data
            const response = await fetch('/admin/api/prizes');
            const data = await response.json();

            if (data.success) {
                const prize = data.data.find(p => p.id === prizeId);
                if (prize) {
                    this.openPrizeModal(prize);
                }
            }
        } catch (error) {
            console.error('Error loading prize:', error);
        }
    }

    openPrizeModal(prize = null) {
        const modal = document.getElementById('prizeModal');
        const form = document.getElementById('prizeForm');

        if (prize) {
            document.getElementById('prizeModalTitle').textContent = 'ویرایش جایزه';
            document.getElementById('prizeId').value = prize.id;
            document.getElementById('prizeName').value = prize.name;
            document.getElementById('prizeProbability').value = prize.probability;
            document.getElementById('prizeDisplayOrder').value = prize.displayOrder;
            document.getElementById('prizeLink').value = prize.link || '';
            document.getElementById('prizeImage').value = prize.image || '';
            document.getElementById('prizeButtonText').value = prize.buttonText || '';
            document.getElementById('prizePrizeText').value = prize.prizeText || '';
            document.getElementById('prizeCode').value = prize.code || '';
            document.getElementById('prizeIsEmpty').checked = prize.isEmpty;
            document.getElementById('prizeIsActive').checked = prize.isActive;
        } else {
            document.getElementById('prizeModalTitle').textContent = 'افزودن جایزه جدید';
            form.reset();
            document.getElementById('prizeId').value = '';
            document.getElementById('prizeIsActive').checked = true;
        }

        modal.classList.remove('hidden');
    }

    closePrizeModal() {
        document.getElementById('prizeModal').classList.add('hidden');
        document.getElementById('prizeForm').reset();
    }

    async savePrize(event) {
        event.preventDefault();

        const prizeId = document.getElementById('prizeId').value;
        const prizeData = {
            name: document.getElementById('prizeName').value,
            probability: parseFloat(document.getElementById('prizeProbability').value),
            display_order: parseInt(document.getElementById('prizeDisplayOrder').value),
            link: document.getElementById('prizeLink').value || null,
            image: document.getElementById('prizeImage').value || null,
            button_text: document.getElementById('prizeButtonText').value || 'دریافت جایزه',
            prize_text: document.getElementById('prizePrizeText').value || '',
            code: document.getElementById('prizeCode').value || null,
            is_empty: document.getElementById('prizeIsEmpty').checked,
            is_active: document.getElementById('prizeIsActive').checked
        };

        try {
            const url = prizeId
                ? `/admin/api/prizes/${prizeId}`
                : '/admin/api/prizes';

            const method = prizeId ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(prizeData)
            });

            const data = await response.json();

            if (data.success) {
                this.closePrizeModal();
                this.loadPrizeStats();
                alert(data.message);
            } else {
                alert(data.message || 'خطا در ذخیره جایزه');
            }
        } catch (error) {
            console.error('Error saving prize:', error);
            alert('خطا در ذخیره جایزه');
        }
    }

    async togglePrize(prizeId, isActive) {
        try {
            const response = await fetch(`/admin/api/prizes/${prizeId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ is_active: isActive })
            });

            const data = await response.json();

            if (data.success) {
                this.loadPrizeStats();
            } else {
                alert(data.message || 'خطا در تغییر وضعیت');
            }
        } catch (error) {
            console.error('Error toggling prize:', error);
            alert('خطا در تغییر وضعیت');
        }
    }

    async deletePrize(prizeId) {
        if (!confirm('آیا از حذف این جایزه اطمینان دارید؟')) return;

        try {
            const response = await fetch(`/admin/api/prizes/${prizeId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                this.loadPrizeStats();
                alert(data.message);
            } else {
                alert(data.message || 'خطا در حذف جایزه');
            }
        } catch (error) {
            console.error('Error deleting prize:', error);
            alert('خطا در حذف جایزه');
        }
    }

    async normalizeProbabilities() {
        if (!confirm('آیا از نرمال‌سازی احتمالات اطمینان دارید؟ احتمالات جوایز فعال به گونه‌ای تنظیم خواهند شد که مجموع آنها 1 شود.')) return;

        try {
            const response = await fetch('/admin/api/normalize-probabilities', {
                method: 'POST'
            });

            const data = await response.json();

            if (data.success) {
                this.loadPrizeStats();
                alert(data.message);
            } else {
                alert(data.message || 'خطا در نرمال‌سازی');
            }
        } catch (error) {
            console.error('Error normalizing probabilities:', error);
            alert('خطا در نرمال‌سازی احتمالات');
        }
    }

    async loadDailyStats() {
        this.showLoading();
        try {
            const response = await fetch(`/admin/api/daily-stats?days=${this.currentDays}`);
            const data = await response.json();

            if (data.success) {
                this.renderDailyTable(data.data);
            }
        } catch (error) {
            console.error('Error loading daily stats:', error);
        }
        this.hideLoading();
    }

    renderDailyTable(dailyStats) {
        const tbody = document.getElementById('dailyTableBody');
        if (!tbody) return;

        tbody.innerHTML = dailyStats.map(day => {
            const participationRate = day.total_users > 0
                ? ((day.played_users / day.total_users) * 100).toFixed(1)
                : 0;

            return `
                <tr>
                    <td>${this.formatDate(day.date)}</td>
                    <td>${this.formatNumber(day.total_users)}</td>
                    <td>${this.formatNumber(day.played_users)}</td>
                    <td>${participationRate}%</td>
                </tr>
            `;
        }).join('');
    }

    async exportData() {
        this.showLoading();
        try {
            const response = await fetch('/admin/api/export', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    format: 'csv',
                    filter: this.currentFilter
                })
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `users-export-${new Date().toISOString().split('T')[0]}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error('Error exporting data:', error);
            alert('خطا در خروجی گرفتن از داده‌ها');
        }
        this.hideLoading();
    }

    async logout() {
        if (!confirm('آیا از خروج اطمینان دارید؟')) return;

        try {
            const response = await fetch('/admin/logout', {
                method: 'POST'
            });

            if (response.ok) {
                window.location.href = '/admin/login';
            }
        } catch (error) {
            console.error('Error logging out:', error);
        }
    }

    // Utility functions
    formatNumber(num) {
        return new Intl.NumberFormat('fa-IR').format(num || 0);
    }

    formatDate(dateStr) {
        const date = new Date(dateStr);
        return new Intl.DateTimeFormat('fa-IR', {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric'
        }).format(date);
    }

    formatDateTime(dateStr) {
        const date = new Date(dateStr);
        return new Intl.DateTimeFormat('fa-IR', {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new AdminDashboard();
});