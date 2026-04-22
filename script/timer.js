export class Timer {
    constructor() {
        this.divReg = 0xAB; // FF04
        this.tima = 0x00;   // FF05
        this.tma = 0x00;    // FF06
        this.tac = 0xF8;    // FF07

        this.divCounter = 0;
        this.timerCounter = 0;
    }

    read(addr) {
        switch (addr & 0xFFFF) {
            case 0xFF04: return this.divReg;
            case 0xFF05: return this.tima;
            case 0xFF06: return this.tma;
            case 0xFF07: return this.tac;
            default: return 0xFF;
        }
    }

    write(addr, value) {
        addr &= 0xFFFF;
        value &= 0xFF;

        switch (addr) {
            case 0xFF04:
                this.divReg = 0;
                this.divCounter = 0;
                return;
            case 0xFF05:
                this.tima = value;
                return;
            case 0xFF06:
                this.tma = value;
                return;
            case 0xFF07:
                this.tac = 0xF8 | (value & 0x07);
                this.timerCounter = 0;
                return;
        }
    }

    tick(cycles, requestInterrupt) {
        cycles &= 0xFFFF;

        // DIV: 每 256 cycles +1
        this.divCounter += cycles;
        while (this.divCounter >= 256) {
            this.divCounter -= 256;
            this.divReg = (this.divReg + 1) & 0xFF;
        }

        // TIMA: TAC bit2=1 時啟用，頻率由 bit1-0 決定
        if ((this.tac & 0x04) === 0) return;

        this.timerCounter += cycles;

        let period = 1024; // 4096Hz
        switch (this.tac & 0x03) {
            case 0x00: period = 1024; break;
            case 0x01: period = 16; break;
            case 0x02: period = 64; break;
            case 0x03: period = 256; break;
        }

        while (this.timerCounter >= period) {
            this.timerCounter -= period;
            if (this.tima === 0xFF) {
                this.tima = this.tma;
                if (requestInterrupt) requestInterrupt(2); // Timer interrupt
            } else {
                this.tima = (this.tima + 1) & 0xFF;
            }
        }
    }
}
