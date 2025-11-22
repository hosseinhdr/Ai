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

        // State management برای modal و navigation
        this.modalState = {
            loginOpen: false,
            winOpen: false,
            step: null // 'phone' | 'code' | null
        };

        this.utmParams = this.getUTMParameters();

        if (this.utmParams && Object.keys(this.utmParams).length > 0) {
            console.log('📊 UTM Parameters detected:', this.utmParams);
        }

        // Bind handlers
        this.handlePopState = this.handlePopState.bind(this);

        this.init();
    }

    getUTMParameters() {
        const urlParams = new URLSearchParams(window.location.search);
        const utmParams = {};

        const utmSource = urlParams.get('utm_source');
        const utmMedium = urlParams.get('utm_medium');
        const utmCampaign = urlParams.get('utm_campaign');

        if (utmSource) utmParams.utm_source = utmSource;
        if (utmMedium) utmParams.utm_medium = utmMedium;
        if (utmCampaign) utmParams.utm_campaign = utmCampaign;

        return Object.keys(utmParams).length > 0 ? utmParams : null;
    }

    async init() {
        this.showLoading();

        // شروع انیمیشن
        this.startCanvasAnimation();

        await this.loadPrizes();
        await this.checkAuthStatus();
        this.drawWheel();
        this.setupEventListeners();
        this.startPrizeTextRotation();
        this.hideLoading();

        // Setup popstate listener
        window.addEventListener('popstate', this.handlePopState);
    }

    handlePopState(event) {
        console.log('🔙 PopState event fired', event.state);

        // اگر state نداریم، یعنی به صفحه اصلی برگشتیم
        if (!event.state || !event.state.modal) {
            // بستن همه modal ها
            if (this.modalState.loginOpen) {
                this.closeLoginModalDirectly();
            }
            if (this.modalState.winOpen) {
                this.closeWinModalDirectly();
            }
            return;
        }

        // مدیریت modal های login
        if (event.state.modal === 'login') {
            if (event.state.step === 'code' && this.modalState.step === 'code') {
                // از کد به شماره برگرد
                this.goBackToPhoneStepDirectly();
            } else if (event.state.step === 'phone' && this.modalState.step === 'code') {
                // از کد به شماره برگرد
                this.goBackToPhoneStepDirectly();
            }
        }
    }

    pushHistoryState(modalType, step = null) {
        const state = {
            modal: modalType,
            step: step,
            timestamp: Date.now()
        };
        window.history.pushState(state, '', window.location.pathname + window.location.search);
    }

    startPrizeTextRotation() {
        const prizes = [
            { name: 'اتریوم', color: '#4F7082' },
            { name: 'شیبا', color: '#B37419' },
            { name: 'طلا', color: '#A78B17' }
        ];

        let currentIndex = 0;
        const prizeWordElement = document.getElementById('prizeWord');

        const updatePrizeText = () => {
            if (prizeWordElement) {
                // Fade out
                prizeWordElement.style.opacity = '0';

                setTimeout(() => {
                    const currentPrize = prizes[currentIndex];
                    prizeWordElement.textContent = currentPrize.name;
                    prizeWordElement.style.color = currentPrize.color;
                    prizeWordElement.style.opacity = '1';
                    currentIndex = (currentIndex + 1) % prizes.length;
                }, 500);
            }
        };

        // نمایش اولین کلمه
        if (prizeWordElement) {
            prizeWordElement.textContent = prizes[0].name;
            prizeWordElement.style.color = prizes[0].color;
            prizeWordElement.style.opacity = '1';
            currentIndex = 1;
        }

        setInterval(updatePrizeText, 3000);
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
        // دکمه چرخش
        this.spinBtn.addEventListener('click', () => this.handleSpinClick());

        // کلیک روی canvas
        this.canvas.addEventListener('click', () => {
            if (!this.isSpinning) {
                console.log('🎯 Canvas clicked - triggering spin');
                this.handleSpinClick();
            }
        });

        // Hover effects برای canvas
        this.canvas.addEventListener('mouseenter', () => {
            if (!this.isSpinning) {
                this.canvas.style.cursor = 'pointer';
            }
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.canvas.style.cursor = 'default';
        });

        // دکمه close login modal
        document.getElementById('closeLogin').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (this.modalState.step === 'code') {
                // برگشت به مرحله قبل
                window.history.back();
            } else {
                // بستن modal
                window.history.back();
            }
        });

        // دکمه ارسال کد
        document.getElementById('sendCodeBtn').addEventListener('click', () => {
            this.sendVerificationCode();
        });

        // دکمه تایید کد
        document.getElementById('verifyCodeBtn').addEventListener('click', () => {
            this.verifyCode();
        });

        // ارسال مجدد کد
        document.getElementById('resendTimer').addEventListener('click', async () => {
            const resendTimer = document.getElementById('resendTimer');
            if (resendTimer.classList.contains('clickable')) {
                resendTimer.textContent = 'در حال ارسال...';
                resendTimer.classList.remove('clickable');
                await this.sendVerificationCode();
            }
        });

        // تغییر شماره
        document.getElementById('changePhoneLink').addEventListener('click', (e) => {
            e.preventDefault();
            window.history.back();
        });

        // دکمه close win modal
        document.getElementById('closeWin').addEventListener('click', (e) => {
            e.preventDefault();
            window.history.back();
        });

        // Input handlers
        document.getElementById('phoneInput').addEventListener('input', (e) => {
            let value = e.target.value;
            value = value.replace(/[^\d۰-۹]/g, '');
            if (value.length > 11) {
                value = value.slice(0, 11);
            }
            value = this.convertEnglishToPersian(value);
            e.target.value = value;
        });

        document.getElementById('codeInput').addEventListener('input', (e) => {
            let value = e.target.value;
            value = value.replace(/[^\d۰-۹]/g, '');
            if (value.length > 6) {
                value = value.slice(0, 6);
            }
            value = this.convertEnglishToPersian(value);
            e.target.value = value;
            this.hideCodeError();
        });

        // Paste handlers
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

    startCanvasAnimation() {
        if (this.lightsAnimation) return;

        this.lightsAnimation = setInterval(() => {
            this.lightState++;
            this.drawWheel();
        }, 300);
    }

    startResendTimer() {
        if (this.resendTimer) {
            clearInterval(this.resendTimer);
            this.resendTimer = null;
        }

        const resendTimerEl = document.getElementById('resendTimer');
        if (!resendTimerEl) return;

        this.resendCountdown = 60;
        resendTimerEl.classList.remove('clickable');

        const updateDisplay = () => {
            const minutes = Math.floor(this.resendCountdown / 60);
            const seconds = this.resendCountdown % 60;
            const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            const persianTime = this.convertEnglishToPersian(timeStr);
            resendTimerEl.textContent = persianTime;
        };

        updateDisplay();

        this.resendTimer = setInterval(() => {
            this.resendCountdown--;

            if (this.resendCountdown <= 0) {
                clearInterval(this.resendTimer);
                this.resendTimer = null;
                resendTimerEl.textContent = 'ارسال مجدد کد';
                resendTimerEl.classList.add('clickable');
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
        const resendTimerEl = document.getElementById('resendTimer');
        if (resendTimerEl) {
            resendTimerEl.textContent = '';
            resendTimerEl.classList.remove('clickable');
        }
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
            this.ctx.font = 'bold 36px IRANYekanXNoEn';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.fillText('در حال بارگذاری جوایز...', centerX, centerY);
            return;
        }

        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const radius = 330;

        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();

        // چرخش کل canvas
        this.ctx.translate(centerX, centerY);
        this.ctx.rotate(this.currentRotation);
        this.ctx.translate(-centerX, -centerY);

        const numSegments = this.prizes.length;
        const anglePerSegment = (Math.PI * 2) / numSegments;
        const segmentColors = ['#1A95FF', '#006F67', '#FC9512', '#FF260D', '#CC0A60', '#3D08EA', '#FE7A18', '#9D9D9D'];

        // کشیدن قطعات
        for (let i = 0; i < numSegments; i++) {
            const startAngle = (i * anglePerSegment) - (Math.PI / 2);
            const endAngle = ((i + 1) * anglePerSegment) - (Math.PI / 2);

            // رسم قطعه با رنگ اصلی
            this.ctx.save();
            const baseColor = segmentColors[i % segmentColors.length];

            this.ctx.beginPath();
            this.ctx.moveTo(centerX, centerY);
            this.ctx.arc(centerX, centerY, radius, startAngle, endAngle);
            this.ctx.closePath();
            this.ctx.fillStyle = baseColor;
            this.ctx.fill();
            this.ctx.restore();

            // گرادیانت
            this.ctx.save();

            const whiteGradient = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
            whiteGradient.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
            whiteGradient.addColorStop(0.1, 'rgba(255, 255, 255, 0.45)');
            whiteGradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.32)');
            whiteGradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.22)');
            whiteGradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.15)');
            whiteGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.09)');
            whiteGradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.025)');
            whiteGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

            this.ctx.beginPath();
            this.ctx.moveTo(centerX, centerY);
            this.ctx.arc(centerX, centerY, radius, startAngle, endAngle);
            this.ctx.closePath();
            this.ctx.fillStyle = whiteGradient;
            this.ctx.fill();
            this.ctx.restore();

            // متن جایزه
            this.ctx.save();
            this.ctx.translate(centerX, centerY);
            const textAngle = startAngle + (anglePerSegment / 2);
            this.ctx.rotate(textAngle);

            this.ctx.font = 'bold 28px IRANYekanXNoEn';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillStyle = '#FFFFFF';

            const text = this.prizes[i].name;
            const lines = this.wrapText(text, 80);

            if (lines.length > 1) {
                this.ctx.fillText(lines[0], radius * 0.65, -20);
                this.ctx.fillText(lines[1], radius * 0.65, 20);
            } else {
                this.ctx.fillText(text, radius * 0.65, 0);
            }

            this.ctx.restore();
        }

        this.ctx.restore();

        // حلقه رنگین‌کمان مرکزی
        this.ctx.save();

        const outerRadius = 42;
        const innerRadius = 28;

        // دایره سفید برای پوشاندن
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fill();

        // رسم حلقه رنگین‌کمان
        const numRainbowSegments = 1440;

        for (let j = 0; j < numRainbowSegments; j++) {
            const segmentAngle = (Math.PI * 2) / numRainbowSegments;
            const startAngle = j * segmentAngle - Math.PI / 2;
            const endAngle = (j + 1) * segmentAngle - Math.PI / 2;

            const hue = (j / numRainbowSegments) * 360;
            const color = `hsl(${hue}, 100%, 50%)`;

            this.ctx.beginPath();
            this.ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle);
            this.ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
            this.ctx.closePath();
            this.ctx.fillStyle = color;
            this.ctx.fill();
        }

        // دایره سفید مرکزی
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fill();

        this.ctx.restore();

        // تنظیم cursor
        if (!this.isSpinning) {
            this.canvas.style.cursor = 'pointer';
        } else {
            this.canvas.style.cursor = 'default';
        }
    }

    async handleSpinClick() {
        if (this.isSpinning) return;

        if (!this.isAuthenticated) {
            this.openLoginModal();
            return;
        }

        if (this.hasPlayed) {
            this.showPreviousPrizeModal();
            return;
        }

        await this.spinWheel();
    }

    openLoginModal() {
        console.log('📂 Opening login modal');

        this.loginModal.style.display = 'block';
        this.modalState.loginOpen = true;
        this.modalState.step = 'phone';

        // Push state برای modal
        this.pushHistoryState('login', 'phone');

        // اضافه کردن کلاس موبایل در صورت نیاز
        if (this.isMobile()) {
            this.loginModal.classList.add('mobile-modal');
            document.body.style.overflow = 'hidden';
            document.body.classList.add('modal-open');
        }

        // Reset form
        this.resetLoginForm();
    }

    closeLoginModalDirectly() {
        console.log('🚫 Closing login modal directly');

        this.loginModal.style.display = 'none';
        this.modalState.loginOpen = false;
        this.modalState.step = null;

        // حذف کلاس‌ها
        this.loginModal.classList.remove('mobile-modal');
        document.body.style.overflow = '';
        document.body.classList.remove('modal-open');

        // Reset form
        this.resetLoginForm();
        this.stopResendTimer();
    }

    resetLoginForm() {
        document.getElementById('phoneStep').classList.remove('hidden');
        document.getElementById('codeStep').classList.add('hidden');
        document.getElementById('phoneInput').value = '';
        document.getElementById('codeInput').value = '';
        document.getElementById('phoneError').style.display = 'none';
        document.getElementById('codeError').style.display = 'none';
        this.hideCodeError();

        // Reset title
        const modalTitle = document.getElementById('loginModalTitle');
        if (modalTitle) {
            modalTitle.textContent = 'ورود به کمپین';
            modalTitle.classList.remove('modal-title-centered');
        }
    }

    goBackToPhoneStepDirectly() {
        console.log('⬅️ Going back to phone step directly');

        this.modalState.step = 'phone';

        document.getElementById('codeStep').classList.add('hidden');
        document.getElementById('phoneStep').classList.remove('hidden');

        // پاک کردن فیلدهای کد
        document.getElementById('codeInput').value = '';
        document.getElementById('codeError').style.display = 'none';
        this.hideCodeError();

        // توقف تایمر
        this.stopResendTimer();

        // Reset title
        const modalTitle = document.getElementById('loginModalTitle');
        if (modalTitle) {
            modalTitle.textContent = 'ورود به کمپین';
            modalTitle.classList.remove('modal-title-centered');
        }
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
            actionBtn.onclick = () => {
                window.history.back();
            };

            this.openWinModal();
        }
    }

    openWinModal() {
        console.log('🎁 Opening win modal');

        this.winModal.style.display = 'block';
        this.modalState.winOpen = true;

        // Push state
        this.pushHistoryState('win', null);
    }

    closeWinModalDirectly() {
        console.log('🚫 Closing win modal directly');

        this.winModal.style.display = 'none';
        this.modalState.winOpen = false;
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
            title.textContent = 'تبریک';
        }

        // تنظیم تصویر
        if (prizeData.image) {
            imageContainer.classList.remove('hidden');
            image.src = prizeData.image;
            image.alt = prizeData.name || 'جایزه';
        } else {
            imageContainer.classList.add('hidden');
        }

        message.textContent = prizeData.prizeText ||
            (prizeData.isEmpty ? 'متاسفانه این بار برنده نشدید!' : 'شما برنده ' + prizeData.name + ' شدید!');

        // نمایش کد جایزه
        if (prizeData.code && !prizeData.isEmpty) {
            codeElement.textContent = prizeData.code;
            codeContainer.classList.remove('hidden');
        } else {
            codeContainer.classList.add('hidden');
        }

        actionBtn.textContent = prizeData.buttonText || 'متوجه شدم';

        // تنظیم رفتار دکمه
        if (prizeData.link && !prizeData.isEmpty) {
            actionBtn.onclick = () => {
                window.open(prizeData.link, '_self');
                window.history.back();
            };
        } else {
            actionBtn.onclick = () => {
                window.history.back();
            };
        }

        this.openWinModal();
    }

    async spinWheel() {
        if (this.isSpinning) return;

        this.isSpinning = true;
        this.spinBtn.disabled = true;
        this.spinBtn.innerHTML = '<span>در حال چرخش...</span>';
        this.canvas.style.cursor = 'default';

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
        this.spinBtn.innerHTML = '<span>بچرخونش</span>';
        this.isSpinning = false;
        this.canvas.style.cursor = 'pointer';
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

                // تغییر به مرحله کد
                document.getElementById('phoneStep').classList.add('hidden');
                document.getElementById('codeStep').classList.remove('hidden');

                this.modalState.step = 'code';

                // Push new state
                this.pushHistoryState('login', 'code');

                // تغییر عنوان
                const modalTitle = document.getElementById('loginModalTitle');
                if (modalTitle) {
                    modalTitle.textContent = 'ورود کد تایید';
                    modalTitle.classList.add('modal-title-centered');
                }

                // نمایش شماره
                const phoneDisplay = document.getElementById('phoneDisplay');
                if (phoneDisplay) {
                    phoneDisplay.textContent = this.convertEnglishToPersian(phone);
                }

                // Reset code input
                document.getElementById('codeInput').value = '';
                document.getElementById('codeError').style.display = 'none';

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

        if (code.length !== 6) {
            this.showCodeError();
            return;
        }

        this.hideCodeError();
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
                this.hideCodeError();

                // پاکسازی history states
                // برگشت به حالت اصلی (بدون modal)
                const currentState = window.history.state;
                if (currentState && currentState.modal) {
                    // پاک کردن state های modal
                    window.history.go(-2); // برگشت دو مرحله
                }

                // بستن modal
                setTimeout(() => {
                    this.closeLoginModalDirectly();

                    // نمایش modal مناسب بعد از لاگین
                    if (this.hasPlayed) {
                        setTimeout(() => this.showPreviousPrizeModal(), 300);
                    } else {
                        // نمایش modal "گردونه آماده چرخش"
                        const readyModal = document.getElementById('winModal');
                        document.getElementById('winTitle').textContent = 'گردونه آماده چرخش';
                        document.getElementById('prizeImageContainer').classList.add('hidden');
                        document.getElementById('prizeCodeContainer').classList.add('hidden');
                        document.getElementById('winMessage').textContent = 'لورم ایپسوم متن ساختگی با تولید سادگی نامفهوم از صنعت چاپ و با استفاده از طراحان گرافیک است';
                        document.getElementById('prizeActionBtn').textContent = 'شروع';
                        document.getElementById('prizeActionBtn').onclick = () => {
                            window.history.back();
                        };

                        setTimeout(() => {
                            this.openWinModal();
                        }, 300);
                    }
                }, 100);
            } else {
                this.showCodeError();
            }
        } catch (error) {
            this.showCodeError();
        }

        this.hideLoading();
    }

    showCodeError() {
        const codeInput = document.getElementById('codeInput');
        const codeLabel = document.getElementById('codeLabel');
        const codeErrorInline = document.getElementById('codeErrorInline');

        codeInput.classList.add('error');
        codeLabel.classList.add('error');
        codeErrorInline.classList.remove('hidden');
    }

    hideCodeError() {
        const codeInput = document.getElementById('codeInput');
        const codeLabel = document.getElementById('codeLabel');
        const codeErrorInline = document.getElementById('codeErrorInline');

        codeInput.classList.remove('error');
        codeLabel.classList.remove('error');
        codeErrorInline.classList.add('hidden');
    }

    validatePhone(phone) {
        const phoneRegex = /^(\+98|0)?9\d{9}$/;
        return phoneRegex.test(phone);
    }

    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || window.innerWidth <= 768;
    }

    showLoading() {
        this.loadingOverlay.style.display = 'flex';
    }

    hideLoading() {
        this.loadingOverlay.style.display = 'none';
    }

    // Cleanup
    destroy() {
        window.removeEventListener('popstate', this.handlePopState);
        if (this.lightsAnimation) {
            clearInterval(this.lightsAnimation);
        }
        if (this.resendTimer) {
            clearInterval(this.resendTimer);
        }
    }
}

// شروع برنامه
document.addEventListener('DOMContentLoaded', () => {
    window.luckyWheel = new LuckyWheel();

    // راه‌اندازی انیمیشن Lottie
    const lottieContainer = document.getElementById('lottieAnimation');
    if (lottieContainer && typeof lottie !== 'undefined') {
        lottie.loadAnimation({
            container: lottieContainer,
            renderer: 'svg',
            loop: true,
            autoplay: true,
            path: '/images/landing.json'
        });
    }
});