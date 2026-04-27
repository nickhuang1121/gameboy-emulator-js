import { GB } from './gb.js';

const canvas = document.querySelector('#bootLogo');
const ctx = canvas.getContext('2d');
const joypad = document.querySelector('#joypad');

const CYCLES_PER_FRAME = 70224;
const SCREEN_W = 160;
const SCREEN_H = 144;
const SCREEN_SCALE = 2;
const ROM_SWITCH_DELAY_MS = 10000;

class Start {
    constructor() {
        this.gb = null;
        this.frameId = null;
        this.loadId = 0;
        this.keyMap = {
            ArrowRight: 'right',
            ArrowLeft: 'left',
            ArrowUp: 'up',
            ArrowDown: 'down',
            KeyZ: 'a',
            KeyX: 'b',
            Enter: 'start',
            ShiftLeft: 'select',
            ShiftRight: 'select'
        };

        joypad.addEventListener('pointerdown', this.handlePadDown);
        joypad.addEventListener('pointerup', this.handlePadUp);
        joypad.addEventListener('pointercancel', this.handlePadCancel);
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        window.addEventListener('blur', this.handleBlur);
        window.addEventListener('pointerdown', this.unlockAudio);
        window.addEventListener('keydown', this.unlockAudio);
        window.addEventListener('pagehide', this.flushSave);
    }

    flushSave = () => {
        this.gb?.cartridge?.flushBatterySave();
    };

    unlockAudio = async () => {
        if (!this.gb) return;

        try {
            await this.gb.apu.resume();
        } catch (err) {
            console.warn('音訊啟用失敗:', err);
        }
    };

    handlePadDown = (e) => {
        const btn = this.keyMap[e.target.dataset.key];
        if (!btn || !this.gb) return;

        e.preventDefault();
        this.gb.setButtonState(btn, true);
    };

    handlePadUp = (e) => {
        const btn = this.keyMap[e.target.dataset.key];
        if (!btn || !this.gb) return;

        e.preventDefault();
        this.gb.setButtonState(btn, false);
    };

    handlePadCancel = () => {
        this.gb?.releaseAllButtons();
    };

    handleKeyDown = (e) => {
        const btn = this.keyMap[e.code];
        if (!btn || !this.gb) return;

        e.preventDefault();
        this.gb.setButtonState(btn, true);
    };

    handleKeyUp = (e) => {
        const btn = this.keyMap[e.code];
        if (!btn || !this.gb) return;

        e.preventDefault();
        this.gb.setButtonState(btn, false);
    };

    handleBlur = () => {
        this.gb?.releaseAllButtons();
    };

    setupCanvas() {
        canvas.width = SCREEN_W;
        canvas.height = SCREEN_H;
        canvas.style.width = `${SCREEN_W * SCREEN_SCALE}px`;
        canvas.style.height = `${SCREEN_H * SCREEN_SCALE}px`;
        ctx.imageSmoothingEnabled = false;
    }

    reloadAfterAlert(message) {
        alert(message);
        window.location.reload();
    }

    async stop() {
        if (this.frameId !== null) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }

        if (!this.gb) {
            return;
        }

        this.gb.releaseAllButtons();
        this.gb.cartridge?.flushBatterySave();

        const audioCtx = this.gb.apu?.audioCtx;
        this.gb = null;

        if (audioCtx && audioCtx.state !== 'closed') {
            try {
                await audioCtx.close();
            } catch (err) {
                console.warn('音訊關閉失敗:', err);
            }
        }
    }

    async init(file) {
        const loadId = ++this.loadId;
        const romOptions = typeof file === 'string' ? { romFile: file, saveName: file } : file;

        await this.stop();

        const gb = new GB();
        this.gb = gb;

        try {
            const header = await gb.init(romOptions);
            if (
                header.mapperType !== 'romOnly' &&
                !header.mapperType.startsWith('MBC1') &&
                !header.mapperType.startsWith('MBC3') &&
                !header.mapperType.startsWith('MBC5')
            ) {
                this.reloadAfterAlert(`目前只支援 ROM ONLY / MBC1 / MBC3 / MBC5，這個 ROM 是 ${header.mapperType}`);
                return;
            }
            if (this.loadId !== loadId || this.gb !== gb) {
                return;
            }

            console.log('解析Game Boy Header完成：', header);
            this.setupCanvas();

            const runFrame = () => {
                if (this.loadId !== loadId || this.gb !== gb) {
                    return;
                }

                let budget = CYCLES_PER_FRAME;

                try {
                    while (budget > 0) {
                        budget -= gb.cpu.step();
                    }
                    gb.ppu.renderFrame(ctx);
                } catch (err) {
                    console.error('CPU 執行中斷：', err);
                    if (this.gb === gb) {
                        this.gb.releaseAllButtons();
                        this.gb = null;
                    }
                    this.frameId = null;
                    return;
                }

                this.frameId = requestAnimationFrame(runFrame);
            };

            this.frameId = requestAnimationFrame(runFrame);
        } catch (err) {
            if (this.gb === gb) {
                this.gb = null;
            }
            this.reloadAfterAlert(err.message ?? 'ROM 載入失敗');
            console.error(err);
        }
    }
}

const start = new Start();
start.init({ romFile: 'book_demo.gb', saveName: 'book_demo.gb' });


const romInput = document.querySelector('#rom-input');
romInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const romUrl = URL.createObjectURL(file);

    try {
        await start.init({ romFile: romUrl, saveName: file.name });
    } catch (err) {
        console.error('ROM 載入失敗：', err);
    } finally {
        URL.revokeObjectURL(romUrl);
        e.target.value = '';
    }
});
