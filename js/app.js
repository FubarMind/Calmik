// --- Глобальные переменные для дыхания ---
window.breathingPhase = 'inhale';
window.breathingProgress = 0; // от 0 до 1

// --- Звуки для фоновых квадратов ---
const SOUND_URLS = {
    rain: 'sounds/rain.mp3',
    fire: 'sounds/fire.mp3',
    sea: 'sounds/sea.mp3'
};

let currentSound = null;
let currentSoundType = null;
let soundsLoaded = false;

// --- Глобальный таймер ---
let globalTimerSeconds = 120; // 2 минуты по умолчанию
let globalTimerInterval = null;
let globalTimerActive = false;

function formatGlobalTimer(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function updateGlobalTimerDisplay() {
    const el = document.getElementById('global-timer-value');
    if (el) el.textContent = formatGlobalTimer(globalTimerSeconds);
}

function setGlobalTimer(seconds) {
    globalTimerSeconds = Math.max(60, Math.min(1800, seconds)); // 1 мин - 30 мин
    updateGlobalTimerDisplay();
}

function changeGlobalTimer(delta) {
    setGlobalTimer(globalTimerSeconds + delta);
}

function resetGlobalTimer() {
    globalTimerActive = false;
    clearInterval(globalTimerInterval);
    setGlobalTimer(60); // Сброс на минимальное значение (1 минута)
}

function startGlobalTimer(onFinish) {
    if (globalTimerActive) return;
    globalTimerActive = true;
    let secondsLeft = globalTimerSeconds;
    updateGlobalTimerDisplay();
    globalTimerInterval = setInterval(() => {
        secondsLeft--;
        globalTimerSeconds = secondsLeft;
        updateGlobalTimerDisplay();
        if (secondsLeft <= 0) {
            clearInterval(globalTimerInterval);
            globalTimerActive = false;
            if (typeof onFinish === 'function') onFinish();
        }
    }, 1000);
}

// Предзагрузка звуков
function preloadSounds() {
    const sounds = {};
    let loadedCount = 0;
    const totalSounds = Object.keys(SOUND_URLS).length;

    return new Promise((resolve, reject) => {
        for (const [type, url] of Object.entries(SOUND_URLS)) {
            const audio = new Audio();
            audio.preload = 'auto';
            
            audio.oncanplaythrough = () => {
                loadedCount++;
                if (loadedCount === totalSounds) {
                    soundsLoaded = true;
                    resolve();
                }
            };
            
            audio.onerror = (error) => {
                console.error(`Ошибка загрузки звука ${type}:`, error);
                reject(error);
            };
            
            audio.src = url;
            sounds[type] = audio;
        }
    });
}

function stopCurrentSound() {
    if (currentSound) {
        currentSound.pause();
        currentSound.currentTime = 0;
        currentSound = null;
        currentSoundType = null;
    }
}

function playSound(type) {
    console.log(`Попытка воспроизвести звук: ${type}`);
    console.log(`Путь к файлу: ${SOUND_URLS[type]}`);

    // Если выбран тот же звук, останавливаем его
    if (currentSoundType === type) {
        console.log('Останавливаем текущий звук');
        stopCurrentSound();
        return;
    }

    // Останавливаем текущий звук
    stopCurrentSound();

    // Создаем новый звук
    currentSound = new Audio(SOUND_URLS[type]);
    
    // Добавляем обработчики событий для отладки
    currentSound.addEventListener('loadstart', () => console.log('Начало загрузки звука'));
    currentSound.addEventListener('canplay', () => console.log('Звук готов к воспроизведению'));
    currentSound.addEventListener('playing', () => console.log('Звук начал воспроизводиться'));
    currentSound.addEventListener('error', (e) => console.error('Ошибка загрузки звука:', e));
    
    currentSound.loop = true;
    currentSound.volume = 0.45;

    // Пробуем воспроизвести
    const playPromise = currentSound.play();
    
    if (playPromise !== undefined) {
        playPromise
            .then(() => {
                currentSoundType = type;
                console.log(`Воспроизводится звук ${type}`);
            })
            .catch(error => {
                console.error('Ошибка воспроизведения:', error);
                // Пробуем воспроизвести после взаимодействия пользователя
                document.addEventListener('click', function tryPlayAgain() {
                    console.log('Попытка воспроизвести после клика');
                    currentSound.play()
                        .then(() => console.log('Воспроизведение успешно после клика'))
                        .catch(e => console.error('Ошибка воспроизведения после клика:', e));
                    document.removeEventListener('click', tryPlayAgain);
                }, { once: true });
            });
    }
}

// --- Pulse sound for hold/pause ---
let lastPulseTime = 0;
let lastPulsePhase = 0;
function playPulseSound(volume = 0.18, freq = 220) {
    if (!document.getElementById('sound-toggle')?.checked) return;
    const ctx = window._pulseAudioCtx || (window._pulseAudioCtx = new (window.AudioContext || window.webkitAudioContext)());
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.08);
}

class BreathingApp {
    constructor() {
        this.techniques = {
            '4-7-8': {
                inhale: 4,
                hold: 7,
                exhale: 8,
                pause: 0
            },
            'square': {
                inhale: 4,
                hold: 4,
                exhale: 4,
                pause: 4
            },
            'deep': {
                inhale: 5,
                hold: 2,
                exhale: 5,
                pause: 2
            }
        };
        this.phaseActions = {
            inhale: 'Вдохните',
            hold: 'Задержите дыхание',
            exhale: 'Выдохните',
            pause: 'Пауза'
        };
        this.currentTechnique = '4-7-8';
        this.isRunning = false;
        this.currentPhase = 'inhale';
        this.timeLeft = 0;
        this.timer = null;

        // DOM Elements
        this.phaseDisplay = document.querySelector('.phase');
        this.timeDisplay = document.querySelector('.time');
        this.startStopBtn = document.getElementById('start-stop-btn');
        this.soundToggle = document.getElementById('sound-toggle');
        this.techniqueBtns = Array.from(document.querySelectorAll('.technique-btn'));

        // Сохраняем ссылку на экземпляр приложения
        this.startStopBtn.__breathingApp = this;

        this.initializeEventListeners();
        this.loadSettings();
        this.setActiveTechniqueBtn(this.currentTechnique);
        this.resetBreathing();
        this.updateStartStopBtn();
    }

    initializeEventListeners() {
        this.startStopBtn.addEventListener('click', () => {
            if (this.isRunning) {
                this.stopBreathing();
            } else {
                this.startBreathing();
            }
        });
        this.techniqueBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tech = btn.getAttribute('data-technique');
                if (tech !== this.currentTechnique) {
                    this.currentTechnique = tech;
                    this.setActiveTechniqueBtn(tech);
                    if (this.isRunning) {
                        this.stopBreathing();
                        this.startBreathing();
                    } else {
                        this.resetBreathing();
                    }
                }
            });
        });
        this.soundToggle.addEventListener('change', () => this.saveSettings());
    }

    setActiveTechniqueBtn(tech) {
        this.techniqueBtns.forEach(btn => {
            if (btn.getAttribute('data-technique') === tech) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        resetGlobalTimer();
    }

    updateStartStopBtn() {
        if (this.isRunning) {
            this.startStopBtn.textContent = 'Остановить';
            this.startStopBtn.classList.remove('primary-btn');
            this.startStopBtn.classList.add('secondary-btn');
        } else {
            this.startStopBtn.textContent = 'Начать';
            this.startStopBtn.classList.remove('secondary-btn');
            this.startStopBtn.classList.add('primary-btn');
        }
    }

    startBreathing() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.techniqueBtns.forEach(btn => btn.disabled = true);
        this.updateStartStopBtn();
        this.startPhase();
        startGlobalTimer(() => {
            this.stopBreathing();
        });
    }

    stopBreathing() {
        this.isRunning = false;
        this.techniqueBtns.forEach(btn => btn.disabled = false);
        clearInterval(this.timer);
        this.updateStartStopBtn();
        this.resetBreathing();
        resetGlobalTimer();
    }

    startPhase() {
        const technique = this.techniques[this.currentTechnique];
        this.currentPhase = this.currentPhase || 'inhale';
        this.timeLeft = technique[this.currentPhase];
        this.phaseStartTime = Date.now();
        this.phaseDuration = technique[this.currentPhase] * 1000; // в миллисекундах
        this.updateDisplay();

        const animate = () => {
            if (!this.isRunning) return;
            
            const currentTime = Date.now();
            const elapsed = currentTime - this.phaseStartTime;
            const progress = Math.min(elapsed / this.phaseDuration, 1);
            
            this.timeLeft = Math.ceil(technique[this.currentPhase] * (1 - progress));
            this.updateDisplay();

            if (progress >= 1) {
                this.nextPhase();
            } else {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }

    nextPhase() {
        const phases = ['inhale', 'hold', 'exhale', 'pause'];
        const currentIndex = phases.indexOf(this.currentPhase);
        this.currentPhase = phases[(currentIndex + 1) % phases.length];
        if (this.isRunning) {
            this.startPhase();
        }
    }

    updateDisplay() {
        // Показываем действие и секунды
        const action = this.phaseActions[this.currentPhase] || '';
        const timerContainer = document.querySelector('.timer-display');
        if (timerContainer) {
            timerContainer.innerHTML = `
                <div class="phase">${action}</div>
                <div class="time">${this.timeLeft}</div>
            `;
        }
        window.breathingPhase = this.currentPhase;
        const technique = this.techniques[this.currentTechnique];
        const phaseTime = technique[this.currentPhase];
        window.breathingProgress = phaseTime ? this.timeLeft / phaseTime : 0;
    }

    resetBreathing() {
        this.currentPhase = 'inhale';
        this.timeLeft = this.techniques[this.currentTechnique].inhale;
        this.updateDisplay();
    }

    saveSettings() {
        const settings = {
            sound: this.soundToggle.checked
        };
        localStorage.setItem('breathingSettings', JSON.stringify(settings));
    }

    loadSettings() {
        const settings = JSON.parse(localStorage.getItem('breathingSettings')) || {
            sound: false
        };
        this.soundToggle.checked = settings.sound;
    }
}

// --- Cosmic Circle Animation ---
function lerpColor(a, b, t) {
    return a + (b - a) * t;
}

function lerpColorRGB(c1, c2, t) {
    return [
        Math.round(lerpColor(c1[0], c2[0], t)),
        Math.round(lerpColor(c1[1], c2[1], t)),
        Math.round(lerpColor(c1[2], c2[2], t))
    ];
}

function rgbToStr(rgb, alpha = 1) {
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

function animateCosmicCircle() {
    console.log('animateCosmicCircle called');
    const canvas = document.getElementById('cosmic-circle');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const baseRadius = w / 2 * 0.78;
    let t = 0;
    let currentScale = 1.0;

    // Цвета для градиента круга
    const cosmicColors = [
        [18, 38, 60],    // глубокий синий
        [32, 70, 120],   // насыщенный синий
        [44, 120, 180],  // бирюзово-синий
        [44, 180, 180],  // аквамарин
        [80, 200, 220],  // ярко-бирюзовый
        [120, 160, 220], // голубой
        [120, 120, 200], // мягкий фиолетово-синий
        [60, 120, 180],  // синий с бирюзой
        [32, 70, 120],   // глубокий синий (замыкаем)
    ];

    // Всполохи
    const flareColors = [
        [60, 120, 200], // светло-синий
        [80, 160, 220], // голубой
        [100, 180, 255] // чуть ярче
    ];
    const flares = Array.from({length: 4}, (_, i) => ({
        angle: Math.random() * 2 * Math.PI,
        radius: lerpColor(baseRadius * 0.3, baseRadius * 0.7, Math.random()),
        color: flareColors[i % flareColors.length],
        alpha: lerpColor(0.10, 0.18, Math.random()),
        speed: lerpColor(0.0002, 0.0005, Math.random()),
        width: lerpColor(baseRadius * 0.18, baseRadius * 0.32, Math.random()),
        height: lerpColor(baseRadius * 0.10, baseRadius * 0.22, Math.random()),
        phase: Math.random() * Math.PI * 2
    }));

    // Шарики
    const orbColors = [
        [44, 120, 180],   // насыщенный синий
        [32, 70, 120],    // глубокий синий
        [44, 120, 130],   // бирюзово-синий
        [24, 54, 80],     // сине-зелёный
        [60, 120, 180]    // синий с бирюзой
    ];
    const orbs = Array.from({length: 8}, () => {
        const angle = Math.random() * 2 * Math.PI;
        const dist = lerpColor(baseRadius * 0.15, baseRadius * 0.7, Math.random());
        return {
            baseAngle: angle,
            angle: angle,
            dist: dist,
            baseDist: dist,
            size: lerpColor(14, 28, Math.random()),
            color: orbColors[Math.floor(Math.random() * orbColors.length)],
            speed: lerpColor(0.0005, 0.0015, Math.random()),
            drift: lerpColor(0.5, 1.5, Math.random()),
            phase: Math.random() * Math.PI * 2
        };
    });

    function getBreathTargetScale() {
        let phase = window.breathingPhase || 'inhale';
        let progress = 1 - (window.breathingProgress || 0);
        switch(phase) {
            case 'inhale':
                return 0.92 + 0.3 * progress;
            case 'exhale':
                return 1.22 - 0.3 * progress;
            case 'hold':
            case 'pause':
                return 1.22;
            default:
                return currentScale;
        }
    }

    function getWavePulsation(i, scale) {
        return 0;
    }

    function getOrbSpeedMultiplier() {
        let phase = window.breathingPhase || 'inhale';
        let progress = 1 - (window.breathingProgress || 0);
        if (phase === 'hold' || phase === 'pause') {
            return 1.2 + 2.5 * progress;
        }
        return 1;
    }

    function drawWaves(scale) {
        for (let i = 1; i <= 3; i++) {
            ctx.save();
            ctx.beginPath();
            const pulsate = getWavePulsation(i, scale);
            ctx.arc(cx, cy, baseRadius * scale + i * 16 + pulsate, 0, 2 * Math.PI);
            ctx.closePath();
            ctx.strokeStyle = `rgba(180,255,255,${0.13 - i*0.03})`;
            ctx.lineWidth = 7 - i*2;
            ctx.shadowColor = '#bfffff';
            ctx.shadowBlur = 16 - i*4;
            ctx.stroke();
            ctx.restore();
        }
    }

    function drawFlares(scale) {
        for (let flare of flares) {
            flare.angle += flare.speed;
            const fx = cx + Math.cos(flare.angle + Math.sin(t + flare.phase) * 0.2) * flare.radius * scale;
            const fy = cy + Math.sin(flare.angle + Math.cos(t + flare.phase) * 0.2) * flare.radius * scale;
            ctx.save();
            ctx.globalAlpha = flare.alpha + 0.08 * Math.sin(t * 1.2 + flare.phase);
            const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, flare.width);
            grad.addColorStop(0, rgbToStr(flare.color, 0.7));
            grad.addColorStop(1, rgbToStr(flare.color, 0));
            ctx.beginPath();
            ctx.ellipse(fx, fy, flare.width, flare.height, flare.angle, 0, 2 * Math.PI);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.restore();
        }
    }

    function drawOrbs(scale) {
        const speedMult = getOrbSpeedMultiplier();
        for (let orb of orbs) {
            orb.angle += orb.speed * speedMult * (1.1 + 0.7 * Math.sin(t * 0.7 + orb.phase));
            orb.dist = orb.baseDist + Math.sin(t * orb.drift * 1.25 + orb.phase) * 18 + Math.cos(t * 0.9 + orb.phase) * 7;
            const pulse = 1 + 0.13 * Math.sin(t * 1.5 + orb.phase);
            const alpha = 0.62 + 0.22 * Math.sin(t * 1.2 + orb.phase);
            const ox = cx + Math.cos(orb.angle) * orb.dist * scale;
            const oy = cy + Math.sin(orb.angle) * orb.dist * scale;
            const r = orb.size * pulse;
            ctx.save();
            const lightColor = lerpColorRGB(orb.color, [255,255,255], 0.22);
            const gradInner = ctx.createRadialGradient(ox, oy, r * 0.1, ox, oy, r);
            gradInner.addColorStop(0, rgbToStr(lightColor, 0.32 * alpha));
            gradInner.addColorStop(0.35, rgbToStr(orb.color, 0.85 * alpha));
            gradInner.addColorStop(1, rgbToStr(orb.color, 0.92 * alpha));
            ctx.beginPath();
            ctx.arc(ox, oy, r, 0, 2 * Math.PI);
            ctx.closePath();
            ctx.shadowColor = rgbToStr(orb.color, 0.5 * alpha);
            ctx.shadowBlur = 14;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = gradInner;
            ctx.fill();
            const grad = ctx.createRadialGradient(ox, oy, r * 0.98, ox, oy, r * 1.13);
            grad.addColorStop(0, rgbToStr(orb.color, 0.13 * alpha));
            grad.addColorStop(0.7, rgbToStr(orb.color, 0.05 * alpha));
            grad.addColorStop(1, rgbToStr(orb.color, 0));
            ctx.beginPath();
            ctx.arc(ox, oy, r * 1.12, 0, 2 * Math.PI);
            ctx.closePath();
            ctx.globalAlpha = 1;
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.restore();
        }
    }

    function draw() {
        t += 0.008;
        const targetScale = getBreathTargetScale();
        currentScale += (targetScale - currentScale) * 0.03;
        const grad = ctx.createRadialGradient(cx, cy, baseRadius * 0.1, cx, cy, baseRadius);
        const colorIdx1 = Math.floor(t) % cosmicColors.length;
        const colorIdx2 = (colorIdx1 + 1) % cosmicColors.length;
        const colorT = t % 1;
        const c1 = lerpColorRGB(cosmicColors[colorIdx1], cosmicColors[colorIdx2], colorT);
        const c2 = lerpColorRGB(cosmicColors[colorIdx2], cosmicColors[(colorIdx2 + 1) % cosmicColors.length], colorT);
        grad.addColorStop(0, rgbToStr(c1, 1));
        grad.addColorStop(1, rgbToStr(c2, 1));
        ctx.clearRect(0, 0, w, h);
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, baseRadius * currentScale, 0, 2 * Math.PI);
        ctx.closePath();
        ctx.clip();
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        drawFlares(currentScale);
        drawOrbs(currentScale);
        ctx.restore();
        drawWaves(currentScale);
        requestAnimationFrame(draw);
    }
    draw();
}

document.addEventListener('DOMContentLoaded', animateCosmicCircle);

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    console.log('Приложение загружено');
    
    // Проверяем доступность звуковых файлов
    Object.entries(SOUND_URLS).forEach(([type, url]) => {
        fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
            });
    });

    new BreathingApp();

    // Sound squares logic
    const soundSquares = Array.from(document.querySelectorAll('.sound-square'));
    soundSquares.forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.getAttribute('data-sound');
            if (currentSoundType === type) {
                stopCurrentSound();
                soundSquares.forEach(b => b.classList.remove('active'));
            } else {
                playSound(type);
                soundSquares.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                // Автоматически запускаем дыхание при выборе звука
                const breathingApp = document.querySelector('#start-stop-btn')?.__breathingApp;
                if (breathingApp && !breathingApp.isRunning) {
                    breathingApp.startBreathing();
                }
            }
        });
    });

    setGlobalTimer(120);
    document.getElementById('timer-minus')?.addEventListener('click', () => {
        if (!globalTimerActive) changeGlobalTimer(-30);
    });
    document.getElementById('timer-plus')?.addEventListener('click', () => {
        if (!globalTimerActive) changeGlobalTimer(30);
    });

    // === Звездный фон ===
    drawStarsBg();
});

function drawStarsBg() {
    const canvas = document.getElementById('stars-bg');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    const starCount = Math.floor((w * h) / 1800); // плотность звезд
    for (let i = 0; i < starCount; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const r = Math.random() * 0.7 + 0.3; // радиус 0.3-1.0
        const alpha = Math.random() * 0.5 + 0.3; // прозрачность 0.3-0.8
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 2 + Math.random() * 4;
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}
window.addEventListener('resize', drawStarsBg);