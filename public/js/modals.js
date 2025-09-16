// Modal functions for all sections

async function showJoinChannelModal() {
    const { value: formValues } = await Swal.fire({
        title: 'عضویت در کانال جدید',
        html: `
            <div class="text-start">
                <div class="mb-3">
                    <label class="form-label">لینک یا یوزرنیم کانال</label>
                    <input type="text" class="form-control" id="swal-channel-link"
                           placeholder="@channelname یا https://t.me/channelname"
                           style="direction: ltr;">
                    <small class="text-muted">
                        فرمت‌های قابل قبول:
                        <br>• @channelname
                        <br>• https://t.me/channelname
                        <br>• https://t.me/joinchat/XXXX
                    </small>
                </div>
                <div class="alert alert-info">
                    <i class="fas fa-info-circle"></i>
                    سشن به صورت خودکار بر اساس ظرفیت انتخاب می‌شود.
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'عضویت',
        cancelButtonText: 'انصراف',
        confirmButtonColor: '#28a745',
        preConfirm: () => {
            const channelLink = document.getElementById('swal-channel-link').value;
            if (!channelLink) {
                Swal.showValidationMessage('لطفا لینک کانال را وارد کنید');
                return false;
            }
            return { channelLink };
        }
    });

    if (formValues) {
        await joinChannel(formValues.channelLink);
    }
}

async function joinChannel(channelLink) {
    Swal.fire({
        title: 'در حال عضویت...',
        html: 'لطفا صبر کنید',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        const response = await apiRequest('/api/channel/join', {
            method: 'POST',
            body: JSON.stringify({ channel: channelLink })
        });

        if (response.success) {
            Swal.fire({
                icon: 'success',
                title: 'عضویت موفق',
                html: `
                    با موفقیت عضو کانال <strong>${response.channelTitle}</strong> شدید.
                    <br>سشن استفاده شده: ${response.sessionUsed}
                    <br>ظرفیت باقیمانده: ${response.remainingSlots} کانال
                `,
                confirmButtonText: 'تایید'
            });

            // Refresh channels list if on channels page
            if (window.currentSection === 'channels') {
                await loadChannelsList();
            }
        } else {
            throw new Error(response.error || 'خطا در عضویت در کانال');
        }
    } catch (error) {
        console.error('Join channel error:', error);
        Swal.fire({
            icon: 'error',
            title: 'خطا',
            text: error.message || 'خطا در ارتباط با سرور',
            confirmButtonText: 'بستن'
        });
    }
}

async function showCleanupModal() {
    const { value: days } = await Swal.fire({
        title: 'پاکسازی کانال‌های غیرفعال',
        html: `
            <div class="text-start">
                <div class="mb-3">
                    <label class="form-label">حذف کانال‌های غیرفعال بیش از:</label>
                    <div class="input-group">
                        <input type="number" class="form-control" id="swal-cleanup-days" value="7" min="1" max="365">
                        <span class="input-group-text">روز</span>
                    </div>
                </div>
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle"></i>
                    این عملیات غیرقابل بازگشت است!
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'پاکسازی',
        cancelButtonText: 'انصراف',
        confirmButtonColor: '#ffc107',
        preConfirm: () => {
            const days = document.getElementById('swal-cleanup-days').value;
            if (!days || days < 1) {
                Swal.showValidationMessage('لطفا تعداد روز معتبر وارد کنید');
                return false;
            }
            return parseInt(days);
        }
    });

    if (days) {
        await performCleanup(days);
    }
}

async function performCleanup(days) {
    const result = await Swal.fire({
        title: 'آیا مطمئن هستید؟',
        text: `کانال‌های غیرفعال بیش از ${days} روز حذف خواهند شد`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'بله، حذف شود',
        cancelButtonText: 'انصراف'
    });

    if (result.isConfirmed) {
        Swal.fire({
            title: 'در حال پاکسازی...',
            html: 'لطفا صبر کنید',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        try {
            const response = await apiRequest('/api/channel/cleanup', {
                method: 'POST',
                body: JSON.stringify({ days: days })
            });

            if (response.success) {
                Swal.fire({
                    icon: 'success',
                    title: 'پاکسازی انجام شد',
                    text: `${response.totalLeft || 0} کانال با موفقیت حذف شد`,
                    confirmButtonText: 'تایید'
                });

                // Refresh channels list if on channels page
                if (window.currentSection === 'channels') {
                    await loadChannelsList();
                }
            } else {
                throw new Error(response.error);
            }
        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: 'خطا',
                text: error.message,
                confirmButtonText: 'بستن'
            });
        }
    }
}