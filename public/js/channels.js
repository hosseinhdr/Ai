// Global variables for channels
window.allChannels = window.allChannels || {};
window.currentChannels = window.currentChannels || [];

async function loadChannels(container) {
    container.innerHTML = `
        <div id="channels-section">
            <!-- Action Buttons -->
            <div class="mb-4">
                <div class="row">
                    <div class="col-md-4">
                        <button class="btn btn-success w-100" onclick="showJoinChannelModal()">
                            <i class="fas fa-plus-circle"></i> عضویت در کانال جدید
                        </button>
                    </div>
                    <div class="col-md-4">
                        <button class="btn btn-warning w-100" onclick="showCleanupModal()">
                            <i class="fas fa-broom"></i> پاکسازی کانال‌های غیرفعال
                        </button>
                    </div>
                    <div class="col-md-4">
                        <button class="btn btn-info w-100" onclick="loadChannelsList()">
                            <i class="fas fa-sync-alt"></i> بروزرسانی لیست
                        </button>
                    </div>
                </div>
            </div>

            <!-- Stats -->
            <div class="row mb-4">
                <div class="col-md-3 mb-3">
                    <div class="stat-card primary">
                        <div class="stat-card-content">
                            <div class="icon">
                                <i class="fas fa-broadcast-tower"></i>
                            </div>
                            <div class="stat-card-info">
                                <div class="value" id="total-channels-count">0</div>
                                <div class="label">کل کانال‌ها</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 mb-3">
                    <div class="stat-card success">
                        <div class="stat-card-content">
                            <div class="icon">
                                <i class="fas fa-check-circle"></i>
                            </div>
                            <div class="stat-card-info">
                                <div class="value" id="active-channels-count">0</div>
                                <div class="label">کانال‌های فعال</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 mb-3">
                    <div class="stat-card warning">
                        <div class="stat-card-content">
                            <div class="icon">
                                <i class="fas fa-pause-circle"></i>
                            </div>
                            <div class="stat-card-info">
                                <div class="value" id="inactive-channels-count">0</div>
                                <div class="label">کانال‌های غیرفعال</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 mb-3">
                    <div class="stat-card info">
                        <div class="stat-card-content">
                            <div class="icon">
                                <i class="fas fa-percentage"></i>
                            </div>
                            <div class="stat-card-info">
                                <div class="value" id="channels-capacity">0%</div>
                                <div class="label">ظرفیت استفاده شده</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Filters -->
            <div class="card mb-4">
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-4">
                            <input type="text" class="form-control" id="channel-search"
                                   placeholder="🔍 جستجو نام یا یوزرنیم..."
                                   onkeyup="filterChannels()">
                        </div>
                        <div class="col-md-3">
                            <select class="form-select" id="session-filter" onchange="filterChannels()">
                                <option value="">همه سشن‌ها</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <select class="form-select" id="type-filter" onchange="filterChannels()">
                                <option value="">همه انواع</option>
                                <option value="public">عمومی</option>
                                <option value="private">خصوصی</option>
                            </select>
                        </div>
                        <div class="col-md-2">
                            <button class="btn btn-primary w-100" onclick="exportChannels()">
                                <i class="fas fa-download"></i> دانلود
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Channels List -->
            <div id="channels-list">
                <div class="text-center py-5">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">در حال بارگذاری...</span>
                    </div>
                    <p class="mt-3">در حال دریافت لیست کانال‌ها...</p>
                </div>
            </div>
        </div>
    `;

    await loadChannelsList();
}

async function loadChannelsList() {
    const channelsList = document.getElementById('channels-list');
    channelsList.innerHTML = `
        <div class="text-center py-5">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">در حال بارگذاری...</span>
            </div>
            <p class="mt-3">در حال دریافت لیست کانال‌ها...</p>
        </div>
    `;

    try {
        const response = await apiRequest('/api/channel/list');

        if (!response.success) {
            throw new Error(response.error || 'خطای ناشناخته');
        }

        window.allChannels = response.data || {};
        displayChannels(window.allChannels);
        updateChannelStats(window.allChannels);
        updateSessionFilter(window.allChannels);

    } catch (error) {
        console.error('Error loading channels:', error);
        channelsList.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i>
                خطا در دریافت لیست کانال‌ها: ${error.message}
                <br>
                <button class="btn btn-sm btn-primary mt-2" onclick="loadChannelsList()">
                    <i class="fas fa-redo"></i> تلاش مجدد
                </button>
            </div>
        `;
    }
}

function displayChannels(data) {
    const channelsList = document.getElementById('channels-list');

    if (!data.bySession || Object.keys(data.bySession).length === 0) {
        channelsList.innerHTML = `
            <div class="alert alert-info text-center">
                <i class="fas fa-info-circle fa-3x mb-3"></i>
                <h5>هیچ کانالی یافت نشد</h5>
                <p>برای شروع، روی دکمه "عضویت در کانال جدید" کلیک کنید.</p>
            </div>
        `;
        return;
    }

    let html = '';

    for (const [sessionName, channels] of Object.entries(data.bySession)) {
        html += `
            <div class="card mb-3">
                <div class="card-header bg-gradient">
                    <div class="d-flex justify-content-between align-items-center text-white">
                        <h6 class="mb-0">
                            <i class="fas fa-user-circle"></i> ${sessionName}
                        </h6>
                        <div>
                            <span class="badge bg-light text-dark me-2">${channels.length} کانال</span>
                        </div>
                    </div>
                </div>
                <div class="card-body">
        `;

        if (channels.length === 0) {
            html += `
                <p class="text-center text-muted py-3">
                    <i class="fas fa-inbox fa-2x mb-2"></i><br>
                    این سشن عضو هیچ کانالی نیست
                </p>
            `;
        } else {
            html += `
                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>نام کانال</th>
                                <th>یوزرنیم</th>
                                <th>تعداد اعضا</th>
                                <th>نوع</th>
                                <th>عملیات</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            for (const channel of channels) {
                html += `
                    <tr class="channel-row"
                        data-session="${sessionName}"
                        data-title="${channel.title || ''}"
                        data-username="${channel.username || ''}"
                        data-public="${channel.isPublic}">
                        <td>
                            <i class="fas fa-broadcast-tower text-primary me-2"></i>
                            ${channel.title || 'بدون نام'}
                        </td>
                        <td>
                            ${channel.username ?
                    `<a href="https://t.me/${channel.username}" target="_blank">@${channel.username}</a>` :
                    '<span class="text-muted">ندارد</span>'}
                        </td>
                        <td>${channel.participantsCount || 0}</td>
                        <td>
                            ${channel.isPublic ?
                    '<span class="badge bg-success">عمومی</span>' :
                    '<span class="badge bg-secondary">خصوصی</span>'}
                        </td>
                        <td>
                            <button class="btn btn-sm btn-info" onclick="viewChannelInfo('${channel.id}')">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="leaveChannel('${channel.id}', '${sessionName}')">
                                <i class="fas fa-sign-out-alt"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }

            html += `
                        </tbody>
                    </table>
                </div>
            `;
        }

        html += `
                </div>
            </div>
        `;
    }

    channelsList.innerHTML = html;
}

function updateChannelStats(data) {
    let totalChannels = 0;
    let activeChannels = 0;

    if (data.bySession) {
        for (const channels of Object.values(data.bySession)) {
            totalChannels += channels.length;
            activeChannels += channels.length;
        }
    }

    document.getElementById('total-channels-count').textContent = totalChannels;
    document.getElementById('active-channels-count').textContent = activeChannels;
    document.getElementById('inactive-channels-count').textContent = 0;

    const capacity = data.total ? Math.round((data.total / 2000) * 100) : 0;
    document.getElementById('channels-capacity').textContent = capacity + '%';
}

function updateSessionFilter(data) {
    const filter = document.getElementById('session-filter');
    filter.innerHTML = '<option value="">همه سشن‌ها</option>';

    if (data.bySession) {
        for (const sessionName of Object.keys(data.bySession)) {
            filter.innerHTML += `<option value="${sessionName}">${sessionName}</option>`;
        }
    }
}

function filterChannels() {
    const searchTerm = document.getElementById('channel-search').value.toLowerCase();
    const sessionFilter = document.getElementById('session-filter').value;
    const typeFilter = document.getElementById('type-filter').value;

    const rows = document.querySelectorAll('.channel-row');

    rows.forEach(row => {
        const title = row.dataset.title.toLowerCase();
        const username = row.dataset.username.toLowerCase();
        const session = row.dataset.session;
        const isPublic = row.dataset.public === 'true';

        let show = true;

        if (searchTerm && !title.includes(searchTerm) && !username.includes(searchTerm)) {
            show = false;
        }

        if (sessionFilter && session !== sessionFilter) {
            show = false;
        }

        if (typeFilter) {
            if (typeFilter === 'public' && !isPublic) show = false;
            if (typeFilter === 'private' && isPublic) show = false;
        }

        row.style.display = show ? '' : 'none';
    });
}

async function viewChannelInfo(channelId) {
    // TODO: Implement channel info view
    Swal.fire('در حال توسعه', 'این قابلیت به زودی اضافه می‌شود', 'info');
}

async function leaveChannel(channelId, sessionName) {
    const result = await Swal.fire({
        title: 'آیا مطمئن هستید؟',
        text: 'می‌خواهید از این کانال خارج شوید؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'بله، خروج',
        cancelButtonText: 'انصراف'
    });

    if (result.isConfirmed) {
        try {
            const response = await apiRequest('/api/channel/leave', {
                method: 'POST',
                body: JSON.stringify({ channelId, sessionName })
            });

            if (response.success) {
                Swal.fire('انجام شد!', 'از کانال خارج شدید', 'success');
                await loadChannelsList();
            } else {
                throw new Error(response.error);
            }
        } catch (error) {
            Swal.fire('خطا!', error.message, 'error');
        }
    }
}

function exportChannels() {
    const dataStr = JSON.stringify(window.allChannels, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

    const exportFileDefaultName = `channels_${new Date().toISOString().split('T')[0]}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
}