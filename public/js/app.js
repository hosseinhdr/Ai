class LuckyWheel {
    constructor() {
        this.canvas = document.getElementById('wheel');
        this.ctx = this.canvas.getContext('2d');
        this.spinBtn = document.getElementById('spinBtn');
        this.loginModal = document.getElementById('loginModal');
        this.winModal = document.getElementById('winModal');
        this.loadingOverlay = document.getElementById('loadingOverlay');

        this.prizes = [];
        this.isSpinning = false;
        this.isAuthenticated = false;
        this.hasPlayed = false;
        this.currentRotation = 0;
        this.userPhone = '';
        this.userPrize = null;
        this.lightsAnimation = null;
        this.lightState = 0;
        this.resendTimer = null;
        this.resendCountdown = 0;

        // فقط UTM های واقعی رو بگیر
        this.utmParams = this.getUTMParameters();

        // فقط اگر واقعا UTM داشتیم لاگ کن
        if (this.utmParams && Object.keys(this.utmParams).length > 0) {
            console.log('📊 UTM Parameters detected:', this.utmParams);
        }

        this.init();
    }

    // متد جدید برای دریافت UTM parameters از URL
    getUTMParameters() {
        const urlParams = new URLSearchParams(window.location.search);
        const utmParams = {};

        // فقط UTM های واقعی رو جمع کن
        const utmSource = urlParams.get('utm_source');
        const utmMedium = urlParams.get('utm_medium');
        const utmCampaign = urlParams.get('utm_campaign');

        if (utmSource) utmParams.utm_source = utmSource;
        if (utmMedium) utmParams.utm_medium = utmMedium;
        if (utmCampaign) utmParams.utm_campaign = utmCampaign;

        // اگر هیچ UTM ای نبود، null برگردون
        return Object.keys(utmParams).length > 0 ? utmParams : null;
    }

    async init() {
        this.showLoading();

        // شروع انیمیشن چراغ‌ها - همیشه فعال
        this.startLightsAnimation();

        await this.loadPrizes();
        await this.checkAuthStatus();
        this.drawWheel();
        this.setupEventListeners();
        this.hideLoading();
    }

    async loadPrizes() {
        try {
            const response = await fetch('/api/wheel/prizes');
            const data = await response.json();

            if (data.success && data.prizes && data.prizes.length > 0) {
                this.prizes = data.prizes;
            } else {
                throw new Error('No prizes available');
            }
        } catch (error) {
            console.error('Error loading prizes:', error);
            alert('خطا در بارگذاری جوایز. لطفا صفحه را رفرش کنید.');
            this.prizes = [];
        }
    }

    async checkAuthStatus() {
        try {
            const response = await fetch('/api/auth/check');
            const data = await response.json();
            if (data.success && data.authenticated) {
                this.isAuthenticated = true;
                this.hasPlayed = data.user.hasPlayed;
                this.userPrize = data.user.prize;
            }
        } catch (error) {
            console.error('Error checking auth status:', error);
        }
    }

    setupEventListeners() {
        this.spinBtn.addEventListener('click', () => this.handleSpinClick());

        document.getElementById('closeLogin').addEventListener('click', () => {
            this.closeModal(this.loginModal);
        });

        document.getElementById('sendCodeBtn').addEventListener('click', () => {
            this.sendVerificationCode();
        });

        document.getElementById('verifyCodeBtn').addEventListener('click', () => {
            this.verifyCode();
        });

        // دکمه ارسال مجدد
        document.getElementById('resendCodeBtn').addEventListener('click', async () => {
            const resendBtn = document.getElementById('resendCodeBtn');
            if (!resendBtn.disabled) {
                resendBtn.disabled = true;
                resendBtn.textContent = 'در حال ارسال...';
                await this.sendVerificationCode();
            }
        });

        document.getElementById('closeWin').addEventListener('click', () => {
            this.closeModal(this.winModal);
        });

        // ورودی شماره موبایل - همیشه فارسی نمایش میده
        document.getElementById('phoneInput').addEventListener('input', (e) => {
            let value = e.target.value;
            value = value.replace(/[^\d۰-۹]/g, '');
            if (value.length > 11) {
                value = value.slice(0, 11);
            }
            value = this.convertEnglishToPersian(value);
            e.target.value = value;
        });

        // ورودی کد تایید - همیشه فارسی نمایش میده
        document.getElementById('codeInput').addEventListener('input', (e) => {
            let value = e.target.value;
            value = value.replace(/[^\d۰-۹]/g, '');
            if (value.length > 6) {
                value = value.slice(0, 6);
            }
            value = this.convertEnglishToPersian(value);
            e.target.value = value;
        });

        document.getElementById('codeInput').addEventListener('paste', (e) => {
            e.preventDefault();
            const pastedText = (e.clipboardData || window.clipboardData).getData('text');
            let cleanText = pastedText.replace(/[^\d۰-۹]/g, '').slice(0, 6);
            cleanText = this.convertEnglishToPersian(cleanText);
            document.getElementById('codeInput').value = cleanText;
        });

        document.getElementById('phoneInput').addEventListener('paste', (e) => {
            e.preventDefault();
            const pastedText = (e.clipboardData || window.clipboardData).getData('text');
            let cleanText = pastedText.replace(/[^\d۰-۹]/g, '').slice(0, 11);
            cleanText = this.convertEnglishToPersian(cleanText);
            document.getElementById('phoneInput').value = cleanText;
        });
    }

    convertPersianToEnglish(str) {
        const persianNumbers = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
        const englishNumbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        for (let i = 0; i < persianNumbers.length; i++) {
            str = str.replace(new RegExp(persianNumbers[i], 'g'), englishNumbers[i]);
        }
        return str;
    }

    convertEnglishToPersian(str) {
        const persianNumbers = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
        const englishNumbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        for (let i = 0; i < englishNumbers.length; i++) {
            str = str.replace(new RegExp(englishNumbers[i], 'g'), persianNumbers[i]);
        }
        return str;
    }

    startLightsAnimation() {
        if (this.lightsAnimation) return;

        this.lightsAnimation = setInterval(() => {
            this.lightState++;
            this.drawWheel();
        }, 300);
    }

    stopLightsAnimation() {
        // چراغ‌ها هیچ‌وقت خاموش نمیشن
    }

    startResendTimer() {
        // توقف تایمر قبلی
        if (this.resendTimer) {
            clearInterval(this.resendTimer);
            this.resendTimer = null;
        }

        const resendBtn = document.getElementById('resendCodeBtn');
        if (!resendBtn) return;

        // شروع از 60 ثانیه
        this.resendCountdown = 60;
        resendBtn.disabled = true;

        // نمایش اولیه
        const updateDisplay = () => {
            const minutes = Math.floor(this.resendCountdown / 60);
            const seconds = this.resendCountdown % 60;
            const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            const persianTime = this.convertEnglishToPersian(timeStr);
            resendBtn.textContent = `ارسال مجدد (${persianTime})`;
        };

        updateDisplay();

        // هر ثانیه کم کن
        this.resendTimer = setInterval(() => {
            this.resendCountdown--;

            if (this.resendCountdown <= 0) {
                clearInterval(this.resendTimer);
                this.resendTimer = null;
                resendBtn.textContent = 'ارسال مجدد';
                resendBtn.disabled = false;
            } else {
                updateDisplay();
            }
        }, 1000);
    }

    stopResendTimer() {
        if (this.resendTimer) {
            clearInterval(this.resendTimer);
            this.resendTimer = null;
        }
        const resendBtn = document.getElementById('resendCodeBtn');
        if (resendBtn) {
            resendBtn.textContent = 'ارسال مجدد';
            resendBtn.disabled = false;
        }
    }

    backToPhoneStep() {
        // برگشت به مرحله شماره
        this.stopResendTimer();
        document.getElementById('codeStep').classList.add('hidden');
        document.getElementById('phoneStep').classList.remove('hidden');

        // شماره قبلی رو نمایش بده (به فارسی)
        if (this.userPhone) {
            const persianPhone = this.convertEnglishToPersian(this.userPhone);
            document.getElementById('phoneInput').value = persianPhone;
        }

        // پاک کردن کد و خطاها
        document.getElementById('codeInput').value = '';
        document.getElementById('codeError').style.display = 'none';
        document.getElementById('phoneError').style.display = 'none';
    }

    wrapText(text, maxWidth) {
        const words = text.split(' ');
        if (words.length === 1 && text.length > 10) {
            const mid = Math.floor(text.length / 2);
            return [text.substring(0, mid), text.substring(mid)];
        } else if (words.length > 1) {
            const mid = Math.ceil(words.length / 2);
            return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
        }
        return [text];
    }

    drawWheel() {
        if (!this.prizes || this.prizes.length === 0) {
            const centerX = this.canvas.width / 2;
            const centerY = this.canvas.height / 2;

            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.font = 'bold 18px IranSansX';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.fillText('در حال بارگذاری جوایز...', centerX, centerY);
            return;
        }

        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const radius = 150;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();

        this.ctx.translate(centerX, centerY);
        this.ctx.rotate(this.currentRotation);
        this.ctx.translate(-centerX, -centerY);

        this.ctx.save();
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        this.ctx.shadowBlur = 25;
        this.ctx.shadowOffsetY = 15;

        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, radius + 25, 0, Math.PI * 2);
        this.ctx.fillStyle = '#F5F5F5';
        this.ctx.fill();
        this.ctx.restore();

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, radius + 25, 0, Math.PI * 2);
        this.ctx.arc(centerX, centerY, radius + 5, 0, Math.PI * 2, true);
        this.ctx.fillStyle = '#FCD535';
        this.ctx.fill();

        // چراغ‌های انیمیشن - همیشه روشن
        const lightCount = 24;
        for (let i = 0; i < lightCount; i++) {
            const angle = (i / lightCount) * Math.PI * 2;
            const lightX = centerX + Math.cos(angle) * (radius + 15);
            const lightY = centerY + Math.sin(angle) * (radius + 15);

            const isOn = (i + this.lightState) % 2 === 0;

            if (isOn) {
                this.ctx.save();
                this.ctx.shadowColor = '#FFD700';
                this.ctx.shadowBlur = 15;
                this.ctx.beginPath();
                this.ctx.arc(lightX, lightY, 6, 0, Math.PI * 2);
                this.ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
                this.ctx.fill();
                this.ctx.restore();
            }

            this.ctx.beginPath();
            this.ctx.arc(lightX, lightY, 5, 0, Math.PI * 2);

            if (isOn) {
                this.ctx.fillStyle = '#FFEB3B';
                this.ctx.fill();

                this.ctx.beginPath();
                this.ctx.arc(lightX, lightY, 2, 0, Math.PI * 2);
                this.ctx.fillStyle = '#FFFFFF';
                this.ctx.fill();
            } else {
                this.ctx.fillStyle = '#D4AF37';
                this.ctx.fill();
            }
        }

        this.ctx.restore();

        const numSegments = this.prizes.length;
        const anglePerSegment = (Math.PI * 2) / numSegments;
        const segmentColors = ['#FF6B6B', '#FF9800', '#4DB6AC', '#FFC107', '#9C27B0', '#66BB6A', '#42A5F5', '#E91E63'];

        for (let i = 0; i < numSegments; i++) {
            const startAngle = (i * anglePerSegment) - (Math.PI / 2);
            const endAngle = ((i + 1) * anglePerSegment) - (Math.PI / 2);

            this.ctx.save();
            this.ctx.beginPath();
            this.ctx.moveTo(centerX, centerY);
            this.ctx.arc(centerX, centerY, radius, startAngle, endAngle);
            this.ctx.closePath();
            this.ctx.fillStyle = segmentColors[i % segmentColors.length];
            this.ctx.fill();
            this.ctx.strokeStyle = '#1E3A5F';
            this.ctx.lineWidth = 3;
            this.ctx.stroke();
            this.ctx.restore();

            this.ctx.save();
            this.ctx.translate(centerX, centerY);
            const textAngle = startAngle + (anglePerSegment / 2);
            this.ctx.rotate(textAngle);

            this.ctx.font = 'bold 15px IranSansX';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillStyle = '#FFFFFF';

            const text = this.prizes[i].name;
            const lines = this.wrapText(text, 80);

            if (lines.length > 1) {
                this.ctx.fillText(lines[0], radius * 0.6, -10);
                this.ctx.fillText(lines[1], radius * 0.6, 10);
            } else {
                this.ctx.fillText(text, radius * 0.6, 0);
            }

            this.ctx.restore();
        }

        this.ctx.restore();

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, 30, 0, Math.PI * 2);
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fill();
        this.ctx.strokeStyle = '#1E3A5F';
        this.ctx.lineWidth = 4;
        this.ctx.stroke();

        this.ctx.font = 'bold 12px IranSansX';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = '#1E3A5F';
        this.ctx.fillText('گردونه', centerX, centerY -10);
        this.ctx.fillText('صراف', centerX, centerY + 10);
        this.ctx.restore();
    }

    async handleSpinClick() {
        if (this.isSpinning) return;

        if (!this.isAuthenticated) {
            this.openModal(this.loginModal);
            return;
        }

        if (this.hasPlayed) {
            this.showPreviousPrizeModal();
            return;
        }

        await this.spinWheel();
    }

    showPreviousPrizeModal() {
        if (this.userPrize && typeof this.userPrize === 'object') {
            this.displayPrizeModal(this.userPrize, true);
        } else {
            document.getElementById('winTitle').textContent = 'شما قبلاً شرکت کرده‌اید! 🎯';
            document.getElementById('prizeImageContainer').classList.add('hidden');
            document.getElementById('prizeCodeContainer').classList.add('hidden');
            document.getElementById('winMessage').textContent =
                this.userPrize ? 'شما قبلاً برنده "' + this.userPrize + '" شده‌اید.' : 'شما قبلاً در این کمپین شرکت کرده‌اید.';

            const actionBtn = document.getElementById('prizeActionBtn');
            actionBtn.textContent = 'متوجه شدم';
            actionBtn.onclick = () => this.closeModal(this.winModal);

            this.openModal(this.winModal);
        }
    }

    displayPrizeModal(prizeData, alreadyPlayed = false) {
        const modal = document.getElementById('winModal');
        const title = document.getElementById('winTitle');
        const message = document.getElementById('winMessage');
        const imageContainer = document.getElementById('prizeImageContainer');
        const image = document.getElementById('prizeImage');
        const codeContainer = document.getElementById('prizeCodeContainer');
        const codeElement = document.getElementById('prizeCode');
        const actionBtn = document.getElementById('prizeActionBtn');

        if (alreadyPlayed) {
            title.textContent = 'شما قبلاً شرکت کرده‌اید! 🎯';
        } else if (prizeData.isEmpty) {
            title.textContent = 'متاسفیم! 😔';
        } else {
            title.textContent = 'تبریک! 🎉';
        }

        if (prizeData.image) {
            imageContainer.classList.remove('hidden');
            image.style.opacity = '0.5';
            image.alt = prizeData.name || 'جایزه';

            const tempImg = new Image();
            tempImg.onload = function() {
                image.src = prizeData.image;
                image.style.opacity = '1';
                image.style.animation = 'fadeIn 0.5s ease-in';
            };
            tempImg.onerror = function() {
                image.src = 'https://cdn-icons-png.flaticon.com/512/3524/3524388.png';
                image.style.opacity = '1';
            };
            tempImg.src = prizeData.image;
        } else {
            imageContainer.classList.add('hidden');
        }

        message.textContent = prizeData.prizeText ||
            (prizeData.isEmpty ? 'متاسفانه این بار برنده نشدید!' : 'شما برنده ' + prizeData.name + ' شدید!');

        if (prizeData.code && !prizeData.isEmpty) {
            codeElement.textContent = prizeData.code;
            codeContainer.classList.remove('hidden');
        } else {
            codeContainer.classList.add('hidden');
        }

        actionBtn.textContent = prizeData.buttonText || 'متوجه شدم';

        if (prizeData.link && !prizeData.isEmpty) {
            actionBtn.onclick = () => {
                window.open(prizeData.link, '_blank');
                this.closeModal(modal);
            };
        } else {
            actionBtn.onclick = () => this.closeModal(modal);
        }

        this.openModal(modal);
    }

    async spinWheel() {
        if (this.isSpinning) return;

        this.isSpinning = true;
        this.spinBtn.disabled = true;
        this.spinBtn.textContent = 'در حال چرخش...';

        try {
            const response = await fetch('/api/wheel/spin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const data = await response.json();

            if (data.success) {
                const targetIndex = data.prizeIndex;

                console.log('🎯 Target Prize Index:', targetIndex);
                console.log('🏆 Prize Name:', data.prize.name);

                await this.animateWheel(targetIndex);

                this.displayPrizeModal(data.prize);

                this.hasPlayed = true;
                this.userPrize = data.prize;
            } else {
                if (data.message && data.message.includes('شرکت کرده‌اید')) {
                    this.hasPlayed = true;
                    this.userPrize = data.prize;
                    if (data.prize) {
                        this.displayPrizeModal(data.prize, true);
                    } else {
                        this.showPreviousPrizeModal();
                    }
                } else {
                    alert(data.message || 'خطایی رخ داد');
                }
            }
        } catch (error) {
            console.error('Error:', error);
            alert('خطا در ارتباط با سرور');
        }

        this.spinBtn.disabled = false;
        this.spinBtn.textContent = 'چرخش';
        this.isSpinning = false;
    }

    async animateWheel(targetIndex) {
        return new Promise((resolve) => {
            const numSegments = this.prizes.length;
            const segmentAngle = (Math.PI * 2) / numSegments;

            const targetSegmentCenterAngle = targetIndex * segmentAngle + (segmentAngle / 2);
            const targetRotation = -targetSegmentCenterAngle;

            const fullRotations = 4 + Math.floor(Math.random() * 3);
            const totalRotation = (fullRotations * Math.PI * 2) + targetRotation;

            const duration = 4000 + Math.random() * 1000;
            const startTime = Date.now();
            const startRotation = this.currentRotation;

            const animate = () => {
                const now = Date.now();
                const elapsed = now - startTime;
                const progress = Math.min(elapsed / duration, 1);

                const easeOut = 1 - Math.pow(1 - progress, 4);

                this.currentRotation = startRotation + (totalRotation * easeOut);

                this.drawWheel();

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    while (this.currentRotation < 0) {
                        this.currentRotation += Math.PI * 2;
                    }
                    while (this.currentRotation > Math.PI * 2) {
                        this.currentRotation -= Math.PI * 2;
                    }

                    resolve();
                }
            };

            animate();
        });
    }

    async sendVerificationCode() {
        const phoneInput = document.getElementById('phoneInput');
        let phone = phoneInput.value.trim();
        phone = this.convertPersianToEnglish(phone);
        const phoneError = document.getElementById('phoneError');

        if (!this.validatePhone(phone)) {
            phoneError.textContent = 'شماره موبایل معتبر نیست';
            phoneError.style.display = 'block';
            return;
        }

        phoneError.style.display = 'none';
        this.showLoading();

        try {
            const requestBody = { phone };

            // فقط اگر UTM داشتیم، ارسال کن
            if (this.utmParams) {
                requestBody.utmParams = this.utmParams;
            }

            const response = await fetch('/api/auth/send-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (data.success) {
                this.userPhone = phone;

                document.getElementById('phoneStep').classList.add('hidden');
                document.getElementById('codeStep').classList.remove('hidden');

                document.getElementById('codeInput').value = '';
                document.getElementById('codeError').style.display = 'none';

                // نمایش شماره در صفحه کد
                const phoneDisplay = document.getElementById('phoneDisplay');
                if (phoneDisplay) {
                    phoneDisplay.textContent = this.convertEnglishToPersian(phone);
                }

                // فوری دکمه رو غیرفعال کن و تایمر شروع کن
                const resendBtn = document.getElementById('resendCodeBtn');
                resendBtn.disabled = true;
                resendBtn.textContent = 'ارسال مجدد (۱:۰۰)';

                // شروع تایمر
                this.startResendTimer();

                if (data.devCode) console.log('📱 Dev Code:', data.devCode);
            } else {
                phoneError.textContent = data.message;
                phoneError.style.display = 'block';
            }
        } catch (error) {
            phoneError.textContent = 'خطا در ارسال کد';
            phoneError.style.display = 'block';
        }

        this.hideLoading();
    }

    async verifyCode() {
        const codeInput = document.getElementById('codeInput');
        let code = codeInput.value.trim();
        code = this.convertPersianToEnglish(code);
        const codeError = document.getElementById('codeError');

        if (code.length !== 6) {
            codeError.textContent = 'کد باید 6 رقم باشد';
            codeError.style.display = 'block';
            return;
        }

        codeError.style.display = 'none';
        this.showLoading();

        try {
            const response = await fetch('/api/auth/verify-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: this.userPhone, code: code })
            });

            const data = await response.json();

            if (data.success) {
                this.isAuthenticated = true;
                this.hasPlayed = data.user.hasPlayed;
                this.userPrize = data.user.prize;

                this.stopResendTimer();

                this.closeModal(this.loginModal);

                if (this.hasPlayed) {
                    setTimeout(() => this.showPreviousPrizeModal(), 500);
                } else {
                    const readyModal = document.getElementById('winModal');
                    document.getElementById('winTitle').textContent = 'آماده چرخش! 🎯';
                    document.getElementById('prizeImageContainer').classList.add('hidden');
                    document.getElementById('prizeCodeContainer').classList.add('hidden');
                    document.getElementById('winMessage').textContent = 'حالا می‌توانید گردونه را بچرخانید!';
                    document.getElementById('prizeActionBtn').textContent = 'شروع';
                    document.getElementById('prizeActionBtn').onclick = () => this.closeModal(readyModal);

                    this.openModal(readyModal);

                    setTimeout(() => {
                        this.closeModal(readyModal);
                    }, 2000);
                }
            } else {
                codeError.textContent = data.message;
                codeError.style.display = 'block';
            }
        } catch (error) {
            codeError.textContent = 'خطا در تایید کد';
            codeError.style.display = 'block';
        }

        this.hideLoading();
    }

    validatePhone(phone) {
        const phoneRegex = /^(\+98|0)?9\d{9}$/;
        return phoneRegex.test(phone);
    }

    openModal(modal) {
        modal.style.display = 'block';
        modal.style.position = 'fixed';
        modal.style.zIndex = '10000';
    }

    closeModal(modal) {
        modal.style.display = 'none';
        if (modal === this.loginModal) {
            this.stopResendTimer();

            document.getElementById('phoneStep').classList.remove('hidden');
            document.getElementById('codeStep').classList.add('hidden');
            document.getElementById('phoneInput').value = '';
            document.getElementById('codeInput').value = '';
            document.getElementById('phoneError').style.display = 'none';
            document.getElementById('codeError').style.display = 'none';
        }
    }

    showLoading() {
        this.loadingOverlay.style.display = 'flex';
    }

    hideLoading() {
        this.loadingOverlay.style.display = 'none';
    }
}

// شروع برنامه
document.addEventListener('DOMContentLoaded', () => {
    window.luckyWheel = new LuckyWheel();
});