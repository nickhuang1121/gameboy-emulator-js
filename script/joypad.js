export class Joypad {
    constructor() {
        this.select = 0x30; // FF00: bit4/bit5
        this.buttons = {
            right: false,
            left: false,
            up: false,
            down: false,
            a: false,
            b: false,
            select: false,
            start: false
        };
    }

    read() {
        let low = 0x0F;

        // bit4=0: 方向鍵
        if ((this.select & 0x10) === 0) {
            if (this.buttons.right) low &= ~0x01;
            if (this.buttons.left) low &= ~0x02;
            if (this.buttons.up) low &= ~0x04;
            if (this.buttons.down) low &= ~0x08;
        }

        // bit5=0: A/B/Select/Start
        if ((this.select & 0x20) === 0) {
            if (this.buttons.a) low &= ~0x01;
            if (this.buttons.b) low &= ~0x02;
            if (this.buttons.select) low &= ~0x04;
            if (this.buttons.start) low &= ~0x08;
        }

        return 0xC0 | this.select | (low & 0x0F);
    }

    write(value) {
        this.select = value & 0x30;
    }

    setButtonState(button, pressed, requestInterrupt) {
        if (!(button in this.buttons)) return;
        const next = !!pressed;
        const prev = this.buttons[button];
        this.buttons[button] = next;

        // 按下瞬間觸發 Joypad interrupt
        if (!prev && next && requestInterrupt) {
            requestInterrupt(4);
        }
    }

    releaseAll() {
        this.buttons.right = false;
        this.buttons.left = false;
        this.buttons.up = false;
        this.buttons.down = false;
        this.buttons.a = false;
        this.buttons.b = false;
        this.buttons.select = false;
        this.buttons.start = false;
    }
}
