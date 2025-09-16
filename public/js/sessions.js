// Global variables for sessions
window.currentSessionId = null;
window.sessionCreationStep = null;

//TODO:: fix session add from panel

async function loadSessions(container) {
    container.innerHTML = `
        <div id="sessions-section">
            <div class="mb-4">
                <button class="btn btn-gradient" onclick="showAddSessionModal()">
                    <i class="fas fa-plus"></i> افزودن سشن جدید
                </button>
                <button class="btn btn-info ms-2" onclick="refreshSessions()">
                    <i class="fas fa-sync"></i> بروزرسانی
                </button>
            </div>
            
            <!-- Sessions Stats -->
            <div class="row mb-4">
                <div class="col-md-3">
                    <div class="stat-card primary">
                        <div class="stat-card-content">
                            <div class="icon">
                                <i class="fas fa-users"></i>
                            </div>
                            <div class="stat-card-info">
                                <div class="value" id="total-sessions-count">0</div>
                                <div class="label">کل سشن‌ها</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="stat-card success">
                        <div class="stat-card-content">
                            <div class="icon">
                                <i class="fas fa-link"></i>
                            </div>
                            <div class="stat-card-info">
                                <div class="value" id="connected-sessions-count">0</div>
                                <div class="label">متصل</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="stat-card warning">
                        <div class="stat-card-content">
                            <div class="icon">
                                <i class="fas fa-star"></i>
                            </div>
                            <div class="stat-card-info">
                                <div class="value" id="premium-sessions-count">0</div>
                                <div class="label">پریمیوم</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="stat-card info">
                        <div class="stat-card-content">
                            <div class="icon">
                                <i class="fas fa-database"></i>
                            </div>
                            <div class="stat-card-info">
                                <div class="value" id="total-capacity">0</div>
                                <div class="label">ظرفیت کل</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Sessions List -->
            <div id="sessions-list">
                <div class="text-center py-5">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">در حال بارگذاری...</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    await loadSessionsData();
}

async function loadSessionsData() {
    try {
        const response = await apiRequest('/api/session/status');

        if (response.success) {
            displaySessions(response.data);
            updateSessionStats(response.data);
        }
    } catch (error) {
        console.error('Error loading sessions:', error);
        document.getElementById('sessions-list').innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i>
                خطا در بارگذاری سشن‌ها: ${error.message}
            </div>
        `;
    }
}

function displaySessions(data) {
    const sessionsList = document.getElementById('sessions-list');

    if (!data.sessions || data.sessions.length === 0) {
        sessionsList.innerHTML = `
            <div class="alert alert-info">
                <i class="fas fa-info-circle"></i>
                هیچ سشنی یافت نشد
            </div>
        `;
        return;
    }

    let html = '<div class="row">';

    data.sessions.forEach(session => {
        const statusClass = session.connected ? 'connected' : 'disconnected';
        const statusText = session.connected ? 'متصل' : 'قطع';
        const statusIcon = session.connected ? 'fa-check-circle' : 'fa-times-circle';
        const typeClass = session.isPremium ? 'premium' : 'regular';
        const typeText = session.isPremium ? 'Premium ⭐' : 'Regular';

        const usagePercent = Math.round((session.channelsUsed / session.maxChannels) * 100);
        let capacityClass = '';
        if (usagePercent > 80) capacityClass = 'danger';
        else if (usagePercent > 60) capacityClass = 'warning';

        html += `
            <div class="col-md-6 mb-3">
                <div class="session-card">
                    <div class="d-flex justify-content-between align-items-start mb-3">
                        <div>
                            <h5 class="mb-1">
                                <i class="fas fa-user-circle text-primary"></i> ${session.name}
                            </h5>
                            <span class="session-type-badge ${typeClass}">${typeText}</span>
                        </div>
                        <div class="text-end">
                            <span class="badge bg-${session.connected ? 'success' : 'danger'}">
                                <i class="fas ${statusIcon}"></i> ${statusText}
                            </span>
                        </div>
                    </div>
                    
                    <div class="mb-3">
                        <div class="d-flex justify-content-between mb-1">
                            <small class="text-muted">ظرفیت استفاده شده</small>
                            <small class="text-muted">${session.channelsUsed}/${session.maxChannels}</small>
                        </div>
                        <div class="capacity-bar">
                            <div class="capacity-fill ${capacityClass}" style="width: ${usagePercent}%"></div>
                        </div>
                    </div>
                    
                    <div class="row text-center">
                        <div class="col-4">
                            <div class="text-muted small">کانال‌ها</div>
                            <div class="fw-bold">${session.channelsUsed}</div>
                        </div>
                        <div class="col-4">
                            <div class="text-muted small">ظرفیت</div>
                            <div class="fw-bold">${session.maxChannels}</div>
                        </div>
                        <div class="col-4">
                            <div class="text-muted small">استفاده</div>
                            <div class="fw-bold">${session.usage}</div>
                        </div>
                    </div>
                    
                    ${session.lastError ? `
                        <div class="alert alert-warning mt-3 mb-0 small">
                            <i class="fas fa-exclamation-triangle"></i> ${session.lastError}
                        </div>
                    ` : ''}
                    
                    <div class="mt-3 d-flex gap-2">
                        <button class="btn btn-sm btn-outline-primary flex-grow-1" 
                                onclick="viewSessionDetails('${session.name}')">
                            <i class="fas fa-info-circle"></i> جزئیات
                        </button>
                        <button class="btn btn-sm btn-outline-success flex-grow-1" 
                                onclick="viewSessionChannels('${session.name}')">
                            <i class="fas fa-list"></i> کانال‌ها
                        </button>
                        ${!session.connected ? `
                            <button class="btn btn-sm btn-outline-warning flex-grow-1" 
                                    onclick="reconnectSession('${session.name}')">
                                <i class="fas fa-plug"></i> اتصال
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    });

    html += '</div>';
    sessionsList.innerHTML = html;
}

function updateSessionStats(data) {
    document.getElementById('total-sessions-count').textContent = data.total || 0;
    document.getElementById('connected-sessions-count').textContent = data.active || 0;

    // Count premium sessions
    const premiumCount = data.sessions ?
        data.sessions.filter(s => s.isPremium).length : 0;
    document.getElementById('premium-sessions-count').textContent = premiumCount;

    document.getElementById('total-capacity').textContent = data.totalCapacity || 0;
}

async function refreshSessions() {
    await loadSessionsData();
    Swal.fire({
        icon: 'success',
        title: 'بروزرسانی شد',
        text: 'لیست سشن‌ها بروزرسانی شد',
        timer: 1500,
        showConfirmButton: false
    });
}

// Show Add Session Modal - NEW FUNCTION
// Show Add Session Modal
async function showAddSessionModal() {
    const countryCodes = [
        { code: '+98', country: 'ایران', flag: '🇮🇷' },
        { code: '+1', country: 'آمریکا/کانادا', flag: '🇺🇸' },
        { code: '+44', country: 'انگلستان', flag: '🇬🇧' },
        { code: '+49', country: 'آلمان', flag: '🇩🇪' },
        { code: '+33', country: 'فرانسه', flag: '🇫🇷' },
        { code: '+7', country: 'روسیه', flag: '🇷🇺' },
        { code: '+86', country: 'چین', flag: '🇨🇳' },
        { code: '+91', country: 'هند', flag: '🇮🇳' },
        { code: '+90', country: 'ترکیه', flag: '🇹🇷' },
        { code: '+971', country: 'امارات', flag: '🇦🇪' }
    ];

    const { value: formValues } = await Swal.fire({
        title: 'افزودن سشن جدید',
        html: `
            <div class="text-start">
                <div class="mb-3">
                    <label class="form-label">نام سشن</label>
                    <input type="text" class="form-control" id="session-name" 
                           placeholder="مثال: session_1" style="direction: ltr;">
                </div>
                
                <div class="mb-3">
                    <label class="form-label">شماره تلفن</label>
                    <div class="d-flex gap-2">
                        <select class="form-select" id="country-code" style="width: 40%; direction: ltr;">
                            ${countryCodes.map(c =>
            `<option value="${c.code}">${c.flag} ${c.code} (${c.country})</option>`
        ).join('')}
                        </select>
                        <input type="tel" class="form-control" id="phone-number" 
                               placeholder="9121234567" style="direction: ltr;">
                    </div>
                    <small class="text-muted">شماره را بدون صفر اول وارد کنید</small>
                </div>
                
                <div class="mb-3">
                    <label class="form-label">نوع اکانت</label>
                    <select class="form-select" id="is-premium">
                        <option value="false">معمولی (Regular)</option>
                        <option value="true">پریمیوم (Premium) ⭐</option>
                    </select>
                </div>
                
                <div class="alert alert-info">
                    <i class="fas fa-info-circle"></i>
                    بعد از تایید، کد تایید به تلگرام شما ارسال خواهد شد
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'شروع',
        cancelButtonText: 'انصراف',
        confirmButtonColor: '#28a745',
        preConfirm: () => {
            const sessionName = document.getElementById('session-name').value.trim();
            const countryCode = document.getElementById('country-code').value;
            const phoneNumber = document.getElementById('phone-number').value.trim();
            const isPremium = document.getElementById('is-premium').value === 'true';

            if (!sessionName) {
                Swal.showValidationMessage('لطفا نام سشن را وارد کنید');
                return false;
            }

            if (!phoneNumber) {
                Swal.showValidationMessage('لطفا شماره تلفن را وارد کنید');
                return false;
            }

            // Format phone number
            const fullPhoneNumber = countryCode + phoneNumber.replace(/^0+/, '');

            return { sessionName, phoneNumber: fullPhoneNumber, isPremium };
        }
    });

    if (formValues) {
        await startSessionCreation(formValues);
    }
}

// Start Session Creation Process
async function startSessionCreation(data) {
    Swal.fire({
        title: 'در حال پردازش...',
        html: 'لطفا صبر کنید',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        // Step 1: Initialize session
        const initResponse = await apiRequest('/api/session/auth/initialize', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        if (!initResponse.success) {
            throw new Error(initResponse.error || 'خطا در شروع فرایند');
        }

        window.currentSessionId = initResponse.sessionId;

        // Step 2: Request code
        const codeResponse = await apiRequest('/api/session/auth/request-code', {
            method: 'POST',
            body: JSON.stringify({ sessionId: initResponse.sessionId })
        });

        if (!codeResponse.success) {
            throw new Error(codeResponse.error || 'خطا در ارسال کد');
        }

        // Step 3: Ask for verification code
        await askForVerificationCode();

    } catch (error) {
        console.error('Session creation error:', error);
        Swal.fire({
            icon: 'error',
            title: 'خطا',
            text: error.message || 'خطا در ایجاد سشن',
            confirmButtonText: 'بستن'
        });
    }
}

// Ask for Verification Code
async function askForVerificationCode() {
    const { value: code } = await Swal.fire({
        title: 'کد تایید',
        html: `
            <div class="text-center">
                <i class="fas fa-mobile-alt fa-3x text-primary mb-3"></i>
                <p>کد تایید به تلگرام شما ارسال شد</p>
                <p class="text-muted">کد معمولا 5 رقم است</p>
                <input type="text" class="form-control text-center mt-3" id="verification-code" 
                       placeholder="کد را وارد کنید" style="font-size: 1.5em; letter-spacing: 0.2em; direction: ltr;"
                       maxlength="5">
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'تایید',
        cancelButtonText: 'انصراف',
        preConfirm: () => {
            const code = document.getElementById('verification-code').value.trim();
            if (!code) {
                Swal.showValidationMessage('لطفا کد را وارد کنید');
                return false;
            }
            return code;
        }
    });

    if (code) {
        await submitVerificationCode(code);
    } else {
        // Cancel session creation
        await cancelSessionCreation();
    }
}

// Submit Verification Code
async function submitVerificationCode(code) {
    Swal.fire({
        title: 'در حال بررسی کد...',
        html: 'لطفا صبر کنید',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        const response = await apiRequest('/api/session/auth/submit-code', {
            method: 'POST',
            body: JSON.stringify({
                sessionId: window.currentSessionId,
                code: code
            })
        });

        if (response.requiresPassword) {
            // Need 2FA password
            await askFor2FAPassword();
        } else if (response.success) {
            // Session created successfully
            await handleSessionCreated(response.session);
        } else {
            throw new Error(response.error || 'کد نامعتبر است');
        }

    } catch (error) {
        console.error('Code submission error:', error);

        // Show error and ask if they want to try again
        const result = await Swal.fire({
            icon: 'error',
            title: 'خطا',
            text: error.message || 'کد نامعتبر است',
            showCancelButton: true,
            confirmButtonText: 'تلاش مجدد',
            cancelButtonText: 'انصراف'
        });

        if (result.isConfirmed) {
            // Try again with new code
            await askForVerificationCode();
        } else {
            await cancelSessionCreation();
        }
    }
}

// Ask for 2FA Password
async function askFor2FAPassword() {
    const { value: password } = await Swal.fire({
        title: 'احراز هویت دو مرحله‌ای',
        html: `
            <div class="text-center">
                <i class="fas fa-lock fa-3x text-warning mb-3"></i>
                <p>این اکانت دارای رمز دو مرحله‌ای است</p>
                <input type="password" class="form-control mt-3" id="tfa-password" 
                       placeholder="رمز را وارد کنید">
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'تایید',
        cancelButtonText: 'انصراف',
        preConfirm: () => {
            const password = document.getElementById('tfa-password').value;
            if (!password) {
                Swal.showValidationMessage('لطفا رمز را وارد کنید');
                return false;
            }
            return password;
        }
    });

    if (password) {
        await submit2FAPassword(password);
    } else {
        await cancelSessionCreation();
    }
}

// Submit 2FA Password
async function submit2FAPassword(password) {
    Swal.fire({
        title: 'در حال بررسی رمز...',
        html: 'لطفا صبر کنید',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        const response = await apiRequest('/api/session/auth/submit-password', {
            method: 'POST',
            body: JSON.stringify({
                sessionId: window.currentSessionId,
                password: password
            })
        });

        if (response.success) {
            await handleSessionCreated(response.session);
        } else {
            throw new Error(response.error || 'رمز نامعتبر است');
        }

    } catch (error) {
        console.error('Password submission error:', error);

        const result = await Swal.fire({
            icon: 'error',
            title: 'خطا',
            text: error.message || 'رمز نامعتبر است',
            showCancelButton: true,
            confirmButtonText: 'تلاش مجدد',
            cancelButtonText: 'انصراف'
        });

        if (result.isConfirmed) {
            await askFor2FAPassword();
        } else {
            await cancelSessionCreation();
        }
    }
}

// Handle Successfully Created Session
async function handleSessionCreated(session) {
    // Show success message
    await Swal.fire({
        icon: 'success',
        title: 'سشن ایجاد شد!',
        html: `
            <div class="text-start">
                <p><strong>نام:</strong> ${session.name}</p>
                <p><strong>شماره:</strong> ${session.phoneNumber}</p>
                <p><strong>نام کاربری:</strong> ${session.username ? '@' + session.username : 'ندارد'}</p>
                <p><strong>نام کامل:</strong> ${session.fullName}</p>
                <p><strong>نوع:</strong> ${session.isPremium ? 'Premium ⭐' : 'Regular'}</p>
            </div>
            <div class="alert alert-success mt-3">
                <i class="fas fa-check-circle"></i>
                سشن با موفقیت ایجاد و ذخیره شد
            </div>
        `,
        confirmButtonText: 'تمام'
    });

    // Save to server and reload sessions
    try {
        await apiRequest('/api/session/save', {
            method: 'POST',
            body: JSON.stringify(session)
        });
    } catch (error) {
        console.error('Error saving session to server:', error);
    }

    // Refresh sessions list
    await loadSessionsData();

    // Clean up
    window.currentSessionId = null;
}

// Cancel Session Creation
async function cancelSessionCreation() {
    if (window.currentSessionId) {
        try {
            await apiRequest('/api/session/auth/cancel', {
                method: 'POST',
                body: JSON.stringify({
                    sessionId: window.currentSessionId
                })
            });
        } catch (error) {
            console.error('Error cancelling session:', error);
        }

        window.currentSessionId = null;
    }

    Swal.fire({
        icon: 'info',
        title: 'انصراف',
        text: 'ایجاد سشن لغو شد',
        timer: 2000,
        showConfirmButton: false
    });
}

// Other existing functions...
async function viewSessionDetails(sessionName) {
    try {
        const response = await apiRequest('/api/session/status');
        const session = response.data.sessions.find(s => s.name === sessionName);

        if (session) {
            Swal.fire({
                title: `جزئیات سشن ${sessionName}`,
                html: `
                    <div class="text-start">
                        <p><strong>وضعیت:</strong> ${session.connected ? 'متصل' : 'قطع'}</p>
                        <p><strong>نوع:</strong> ${session.isPremium ? 'Premium' : 'Regular'}</p>
                        <p><strong>کانال‌های استفاده شده:</strong> ${session.channelsUsed}</p>
                        <p><strong>حداکثر ظرفیت:</strong> ${session.maxChannels}</p>
                        <p><strong>وضعیت سلامت:</strong> ${session.health || 'نامشخص'}</p>
                        ${session.floodWait ? `<p><strong>Flood Wait:</strong> ${session.floodWait}</p>` : ''}
                        ${session.lastActivity ? `<p><strong>آخرین فعالیت:</strong> ${new Date(session.lastActivity).toLocaleString('fa-IR')}</p>` : ''}
                    </div>
                `,
                icon: 'info',
                confirmButtonText: 'بستن'
            });
        }
    } catch (error) {
        Swal.fire('خطا', 'دریافت جزئیات سشن با خطا مواجه شد', 'error');
    }
}

async function viewSessionChannels(sessionName) {
    // Implementation from previous code...
}

async function reconnectSession(sessionName) {
    // Implementation from previous code...
}