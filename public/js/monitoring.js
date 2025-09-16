async function loadMonitoring(container) {
    container.innerHTML = `
        <div id="monitoring-section">
            <!-- Basic Stats -->
            <div class="row mb-4">
                <div class="col-md-3">
                    <div class="stat-card primary">
                        <div class="stat-card-content">
                            <div class="icon">
                                <i class="fas fa-clock"></i>
                            </div>
                            <div class="stat-card-info">
                                <div class="value" id="uptime">0</div>
                                <div class="label">زمان فعالیت</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="stat-card success">
                        <div class="stat-card-content">
                            <div class="icon">
                                <i class="fas fa-check"></i>
                            </div>
                            <div class="stat-card-info">
                                <div class="value" id="total-operations">0</div>
                                <div class="label">کل عملیات</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="stat-card warning">
                        <div class="stat-card-content">
                            <div class="icon">
                                <i class="fas fa-exclamation-triangle"></i>
                            </div>
                            <div class="stat-card-info">
                                <div class="value" id="error-count">0</div>
                                <div class="label">تعداد خطاها</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="stat-card info">
                        <div class="stat-card-content">
                            <div class="icon">
                                <i class="fas fa-memory"></i>
                            </div>
                            <div class="stat-card-info">
                                <div class="value" id="memory-usage">0 MB</div>
                                <div class="label">مصرف حافظه</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- System Health -->
            <div class="row mb-4">
                <div class="col-md-12">
                    <div class="stat-card">
                        <h5 class="mb-3">
                            <i class="fas fa-heartbeat text-danger"></i> سلامت سیستم
                        </h5>
                        <div id="system-health">
                            <div class="text-center py-3">
                                <span class="text-muted">در حال بارگذاری...</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Rate Limits -->
            <div class="row">
                <div class="col-md-12">
                    <div class="stat-card">
                        <h5 class="mb-3">
                            <i class="fas fa-tachometer-alt text-primary"></i> محدودیت‌های نرخ
                        </h5>
                        <div id="rate-limits">
                            <div class="text-center py-3">
                                <span class="text-muted">در حال بارگذاری...</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    await loadMonitoringData();
}

async function loadMonitoringData() {
    try {
        // Get health status
        const healthResponse = await fetch('/health');
        if (healthResponse.ok) {
            const health = await healthResponse.json();
            updateHealthDisplay(health);
        }

        // Get monitoring status
        const monitoringResponse = await apiRequest('/api/monitoring/status');
        if (monitoringResponse.success) {
            updateMonitoringStats(monitoringResponse.data);
        }

        // Get rate limit status
        const rateLimitResponse = await apiRequest('/api/ratelimit/status');
        if (rateLimitResponse.success) {
            displayRateLimits(rateLimitResponse.data);
        }

    } catch (error) {
        console.error('Error loading monitoring data:', error);
    }
}

function updateHealthDisplay(health) {
    const healthDiv = document.getElementById('system-health');

    let statusBadge = '';
    if (health.status === 'healthy') {
        statusBadge = '<span class="badge bg-success">سالم</span>';
    } else if (health.status === 'degraded') {
        statusBadge = '<span class="badge bg-warning">نیاز به توجه</span>';
    } else {
        statusBadge = '<span class="badge bg-danger">بحرانی</span>';
    }

    const uptime = Math.floor(health.uptime / 3600) + ' ساعت';
    document.getElementById('uptime').textContent = uptime;

    const memoryMB = Math.round(health.memory.heapUsed / 1024 / 1024);
    document.getElementById('memory-usage').textContent = memoryMB + ' MB';

    let html = `
        <div class="row">
            <div class="col-md-6">
                <p><strong>وضعیت کلی:</strong> ${statusBadge}</p>
                <p><strong>پایگاه داده:</strong> ${health.services.database.connected ? '✅ متصل' : '❌ قطع'}</p>
                <p><strong>سشن‌های تلگرام:</strong> ${health.services.telegram.connectedSessions}/${health.services.telegram.totalSessions} متصل</p>
            </div>
            <div class="col-md-6">
                <p><strong>زمان فعالیت:</strong> ${uptime}</p>
                <p><strong>حافظه استفاده شده:</strong> ${memoryMB} MB</p>
                <p><strong>آخرین بررسی:</strong> ${new Date(health.timestamp).toLocaleTimeString('fa-IR')}</p>
            </div>
        </div>
    `;

    healthDiv.innerHTML = html;
}

function updateMonitoringStats(data) {
    if (data.summary) {
        document.getElementById('total-operations').textContent = data.summary.totalOperations || 0;
        document.getElementById('error-count').textContent = data.summary.totalErrors || 0;
    }
}

function displayRateLimits(data) {
    const limitsDiv = document.getElementById('rate-limits');

    let html = '<div class="table-responsive"><table class="table table-sm">';
    html += '<thead><tr>';
    html += '<th>عملیات</th>';
    html += '<th>محدودیت</th>';
    html += '<th>بازه زمانی</th>';
    html += '<th>وضعیت</th>';
    html += '</tr></thead><tbody>';

    for (const [operation, config] of Object.entries(data.limits)) {
        const statusBadge = config.burstAllowed ?
            '<span class="badge bg-success">انعطاف‌پذیر</span>' :
            '<span class="badge bg-warning">سخت</span>';

        html += `<tr>
            <td>${operation}</td>
            <td>${config.requests} درخواست</td>
            <td>${config.window}</td>
            <td>${statusBadge}</td>
        </tr>`;
    }

    html += '</tbody></table></div>';
    limitsDiv.innerHTML = html;
}