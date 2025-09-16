// Simplified Dashboard without realtime monitoring
async function loadDashboard(container) {
    container.innerHTML = `
        <div id="dashboard-section">
            <!-- Stats Cards -->
            <div class="row mb-4">
                <div class="col-md-3 mb-3">
                    <div class="stat-card glass-card primary">
                        <div class="stat-card-content">
                            <div class="icon">
                                <i class="fas fa-users"></i>
                            </div>
                            <div class="stat-card-info">
                                <div class="value" id="total-sessions">0</div>
                                <div class="label">کل سشن‌ها</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 mb-3">
                    <div class="stat-card glass-card success">
                        <div class="stat-card-content">
                            <div class="icon">
                                <i class="fas fa-check-circle"></i>
                            </div>
                            <div class="stat-card-info">
                                <div class="value" id="active-sessions">0</div>
                                <div class="label">سشن‌های فعال</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 mb-3">
                    <div class="stat-card glass-card warning">
                        <div class="stat-card-content">
                            <div class="icon">
                                <i class="fas fa-broadcast-tower"></i>
                            </div>
                            <div class="stat-card-info">
                                <div class="value" id="total-channels">0</div>
                                <div class="label">کل کانال‌ها</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 mb-3">
                    <div class="stat-card glass-card info">
                        <div class="stat-card-content">
                            <div class="icon">
                                <i class="fas fa-chart-pie"></i>
                            </div>
                            <div class="stat-card-info">
                                <div class="value" id="capacity-usage">0%</div>
                                <div class="label">ظرفیت استفاده شده</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Sessions Overview -->
            <div class="row mb-4">
                <div class="col-md-12">
                    <div class="chart-container glass-card">
                        <h5 class="mb-3">
                            <i class="fas fa-info-circle text-primary"></i> وضعیت سشن‌ها
                        </h5>
                        <div id="sessions-overview">
                            <!-- Sessions will be loaded here -->
                        </div>
                    </div>
                </div>
            </div>

            <!-- Quick Actions -->
            <div class="row mb-4">
                <div class="col-md-12">
                    <div class="stat-card glass-card">
                        <h5 class="mb-3">
                            <i class="fas fa-bolt text-warning"></i> دسترسی سریع
                        </h5>
                        <div class="row">
                            <div class="col-md-3 mb-2">
                                <button class="btn btn-primary quick-action-btn" onclick="showAddSessionModal()">
                                    <i class="fas fa-plus"></i> افزودن سشن
                                </button>
                            </div>
                            <div class="col-md-3 mb-2">
                                <button class="btn btn-success quick-action-btn" onclick="showJoinChannelModal()">
                                    <i class="fas fa-sign-in-alt"></i> عضویت در کانال
                                </button>
                            </div>
                            <div class="col-md-3 mb-2">
                                <button class="btn btn-warning quick-action-btn" onclick="showChannelInfoModal()">
                                    <i class="fas fa-info"></i> اطلاعات کانال
                                </button>
                            </div>
                            <div class="col-md-3 mb-2">
                                <button class="btn btn-info quick-action-btn" onclick="exportData()">
                                    <i class="fas fa-download"></i> دانلود گزارش
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    await loadDashboardData();
}

// Load Dashboard Data
async function loadDashboardData() {
    try {
        const sessionStatus = await apiRequest('/api/session/status');
        if (sessionStatus.success) {
            updateDashboardStats(sessionStatus.data);
            displaySessionsOverview(sessionStatus.data.sessions);
        }

        const capacityStats = await apiRequest('/api/session/capacity');
        if (capacityStats) {
            const percentage = capacityStats.total?.percentage || 0;
            document.getElementById('capacity-usage').textContent = percentage + '%';
        }
    } catch (error) {
        console.error('Dashboard data error:', error);
    }
}

// Update Dashboard Stats
function updateDashboardStats(data) {
    document.getElementById('total-sessions').textContent = data.total || 0;
    document.getElementById('active-sessions').textContent = data.active || 0;
    document.getElementById('total-channels').textContent = data.totalChannelsUsed || 0;
}

// Display Sessions Overview
function displaySessionsOverview(sessions) {
    const container = document.getElementById('sessions-overview');
    if (!sessions || sessions.length === 0) {
        container.innerHTML = '<p class="text-center text-muted">هیچ سشنی یافت نشد</p>';
        return;
    }

    let html = '<div class="table-responsive"><table class="table table-hover">';
    html += '<thead><tr>';
    html += '<th>نام سشن</th>';
    html += '<th>وضعیت</th>';
    html += '<th>کانال‌ها</th>';
    html += '<th>ظرفیت</th>';
    html += '<th>نوع</th>';
    html += '</tr></thead><tbody>';

    sessions.forEach(session => {
        const statusBadge = session.connected ?
            '<span class="badge bg-success">متصل</span>' :
            '<span class="badge bg-danger">قطع</span>';

        const typeBadge = session.isPremium ?
            '<span class="badge bg-warning">Premium ⭐</span>' :
            '<span class="badge bg-secondary">Regular</span>';

        html += `<tr>
            <td>${session.name}</td>
            <td>${statusBadge}</td>
            <td>${session.channelsUsed}/${session.maxChannels}</td>
            <td>${session.usage}</td>
            <td>${typeBadge}</td>
        </tr>`;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

// Show Channel Info Modal
async function showChannelInfoModal() {
    const { value: channelIdentifier } = await Swal.fire({
        title: 'دریافت اطلاعات کانال',
        html: `
            <div class="text-start">
                <div class="mb-3">
                    <label class="form-label">لینک، یوزرنیم یا ID کانال</label>
                    <input type="text" class="form-control" id="channel-identifier"
                           placeholder="@username, https://t.me/..., -100123456789"
                           style="direction: ltr;">
                    <small class="text-muted">
                        فرمت‌های قابل قبول:
                        <br>• @channelname
                        <br>• https://t.me/channelname
                        <br>• https://t.me/joinchat/XXXX
                        <br>• https://t.me/+XXXX
                        <br>• Channel ID: -100123456789
                    </small>
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'دریافت اطلاعات',
        cancelButtonText: 'انصراف',
        confirmButtonColor: '#17a2b8',
        preConfirm: () => {
            const identifier = document.getElementById('channel-identifier').value;
            if (!identifier) {
                Swal.showValidationMessage('لطفا شناسه کانال را وارد کنید');
                return false;
            }
            return identifier;
        }
    });

    if (channelIdentifier) {
        await getChannelInfo(channelIdentifier);
    }
}

// Get Channel Info
async function getChannelInfo(identifier) {
    Swal.fire({
        title: 'در حال دریافت اطلاعات...',
        html: 'لطفا صبر کنید',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        const response = await apiRequest(`/api/channel/info?channel=${encodeURIComponent(identifier)}`);

        if (response.success) {
            const info = response.data;

            let html = `
                <div class="text-start">
                    <p><strong>🏷️ نام:</strong> ${info.title || 'نامشخص'}</p>
                    <p><strong>🆔 ID:</strong> <code style="direction: ltr;">${info.id || 'نامشخص'}</code></p>
            `;

            if (info.username) {
                html += `<p><strong>👤 یوزرنیم:</strong> @${info.username}</p>`;
            }

            if (info.about) {
                html += `<p><strong>📝 درباره:</strong> ${info.about}</p>`;
            }

            html += `
                <p><strong>👥 تعداد اعضا:</strong> ${info.participantsCount || 0}</p>
                <p><strong>🔒 نوع:</strong> ${info.isPrivate ? 'خصوصی' : 'عمومی'}</p>
                <p><strong>📱 سشن:</strong> ${info.sessionName}</p>
            `;

            if (info.isMember !== undefined) {
                html += `<p><strong>🔗 عضویت:</strong> ${info.isMember ? '✅ عضو هستید' : '❌ عضو نیستید'}</p>`;
            }

            if (info.needsToJoin) {
                html += `
                    <div class="alert alert-warning mt-3">
                        <i class="fas fa-info-circle"></i>
                        شما عضو این کانال نیستید. برای دریافت اطلاعات کامل باید عضو شوید.
                    </div>
                `;
            }

            html += '</div>';

            Swal.fire({
                icon: 'success',
                title: 'اطلاعات کانال',
                html: html,
                confirmButtonText: 'بستن',
                showCancelButton: info.needsToJoin,
                cancelButtonText: 'عضویت در کانال',
                cancelButtonColor: '#28a745'
            }).then((result) => {
                if (!result.isConfirmed && info.needsToJoin) {
                    // Join channel
                    joinChannel(identifier);
                }
            });
        } else {
            throw new Error(response.error || 'خطا در دریافت اطلاعات');
        }
    } catch (error) {
        console.error('Channel info error:', error);
        Swal.fire({
            icon: 'error',
            title: 'خطا',
            text: error.message || 'خطا در دریافت اطلاعات کانال',
            confirmButtonText: 'بستن'
        });
    }
}

// Export functionality
function exportData() {
    Swal.fire({
        title: 'دانلود گزارش',
        text: 'گزارش سیستم در حال آماده‌سازی است...',
        icon: 'info',
        timer: 2000,
        showConfirmButton: false
    });

    setTimeout(async () => {
        try {
            const sessionStatus = await apiRequest('/api/session/status');
            const channelsList = await apiRequest('/api/channel/list');

            const data = {
                date: new Date().toLocaleDateString('fa-IR'),
                sessions: sessionStatus.data || {},
                channels: channelsList.data || {},
                timestamp: new Date().toISOString()
            };

            const dataStr = JSON.stringify(data, null, 2);
            const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

            const link = document.createElement('a');
            link.setAttribute('href', dataUri);
            link.setAttribute('download', `report_${Date.now()}.json`);
            link.click();
        } catch (error) {
            Swal.fire('خطا', 'خطا در تولید گزارش', 'error');
        }
    }, 2000);
}