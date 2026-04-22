import { GB } from './gb.js';

const canvas = document.querySelector('#bootLogo');
const ctx = canvas.getContext('2d');

const gb = new GB();
const CYCLES_PER_FRAME = 70224;
const SCREEN_W = 160;
const SCREEN_H = 144;
const SCREEN_SCALE = 2;

(async () => {
    try {
        const header = await gb.init({ romFile: 'book_demo.gb' });//Tetris.gb Pokemon-Yellow.gb test1.gb book_demo.gb
        console.log('解析Game Boy Header完成：', header);
        canvas.width = SCREEN_W;
        canvas.height = SCREEN_H;
        canvas.style.width = `${SCREEN_W * SCREEN_SCALE}px`;
        canvas.style.height = `${SCREEN_H * SCREEN_SCALE}px`;
        ctx.imageSmoothingEnabled = false;

        const keyMap = {
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

        const unlockAudio = async () => {
            try {
                await gb.apu.resume();
            } catch (err) {
                console.warn('音訊啟用失敗:', err);
            }
            window.removeEventListener('pointerdown', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
        };
        window.addEventListener('pointerdown', unlockAudio, { once: true });
        window.addEventListener('keydown', unlockAudio, { once: true });

        window.addEventListener('keydown', (e) => {
            const btn = keyMap[e.code];
            if (!btn) return;
            e.preventDefault();
            gb.setButtonState(btn, true);
        });

        window.addEventListener('keyup', (e) => {
            const btn = keyMap[e.code];
            if (!btn) return;
            e.preventDefault();
            gb.setButtonState(btn, false);
        });

        window.addEventListener('blur', () => {
            gb.releaseAllButtons();
        });

        const runFrame = () => {
            let budget = CYCLES_PER_FRAME;
            try {
                while (budget > 0) {
                    budget -= gb.cpu.step();
                }
                gb.ppu.renderFrame(ctx);
            } catch (err) {
                console.error('CPU 執行中斷：', err);
                return;
            }
            requestAnimationFrame(runFrame);
        };
        runFrame();

    } catch (err) {
        console.error(err);
    }
})();
