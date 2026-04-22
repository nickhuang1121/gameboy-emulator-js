export class Bus {
    constructor({ cartridge, ppu, apu, timer, joypad, interrupts, wram }) {
        this.cartridge = cartridge;
        this.ppu = ppu;
        this.apu = apu;
        this.timer = timer;
        this.joypad = joypad;
        this.interrupts = interrupts;
        this.wram = wram;

        this.hram = new Uint8Array(0x7F);   // FF80-FFFE
        this.io = new Uint8Array(0x80);     // FF00-FF7F
        this.io.fill(0xFF);                 // 未實作 IO 暫時回傳 0xFF
        this.ppuDotCounter = 0;
        this.statIRQLine = false;
    }

    readByte(addr) {
        addr &= 0xFFFF;

        if (addr < 0x8000) return this.cartridge.readByte(addr); // ROM
        if (addr < 0xA000) return this.ppu.readVRAM(addr);       // VRAM
        if (addr < 0xC000) return this.cartridge.readByte(addr); // SRAM
        if (addr < 0xFE00) return this.wram.read(addr);          // WRAM + ECHO
        if (addr < 0xFEA0) return this.ppu.readOAM(addr);        // OAM
        if (addr < 0xFF00) return 0xFF;                          // unusable
        if (addr < 0xFF80) return this.readIO(addr);             // IO
        if (addr < 0xFFFF) return this.hram[addr - 0xFF80];      // HRAM
        return this.interrupts.readIE();                         // IE
    }

    writeByte(addr, value) {
        addr &= 0xFFFF;
        value &= 0xFF;

        if (addr < 0x8000) return this.cartridge.writeByte(addr, value); // ROM/MBC control
        if (addr < 0xA000) return this.ppu.writeVRAM(addr, value);
        if (addr < 0xC000) return this.cartridge.writeByte(addr, value); // SRAM
        if (addr < 0xFE00) return this.wram.write(addr, value);          // WRAM + ECHO
        if (addr < 0xFEA0) return this.ppu.writeOAM(addr, value);
        if (addr < 0xFF00) return;
        if (addr < 0xFF80) return this.writeIO(addr, value);
        if (addr < 0xFFFF) return void (this.hram[addr - 0xFF80] = value);
        this.interrupts.writeIE(value);
    }

    readIO(addr) {
        if (addr >= 0xFF10 && addr <= 0xFF3F) {
            return this.apu.readReg(addr);
        }

        if (addr >= 0xFF04 && addr <= 0xFF07) {
            return this.timer.read(addr);
        }

        switch (addr) {
            case 0xFF00: return this.joypad.read();       // JOYP
            case 0xFF0F: return this.interrupts.readIF(); // IF
            case 0xFF40: return this.ppu.lcdc;            // LCDC
            case 0xFF41: return this.ppu.stat | 0x80;     // STAT
            case 0xFF42: return this.ppu.scy;             // SCY
            case 0xFF43: return this.ppu.scx;             // SCX
            case 0xFF44: return this.ppu.ly;              // LY
            case 0xFF45: return this.ppu.lyc;             // LYC
            case 0xFF47: return this.ppu.bgp;             // BGP
            case 0xFF48: return this.ppu.obp0;            // OBP0
            case 0xFF49: return this.ppu.obp1;            // OBP1
            case 0xFF4A: return this.ppu.wy;              // WY
            case 0xFF4B: return this.ppu.wx;              // WX
            default: return this.io[addr - 0xFF00];
        }
    }

    writeIO(addr, value) {
        value &= 0xFF;

        if (addr >= 0xFF10 && addr <= 0xFF3F) {
            this.apu.writeReg(addr, value);
            return;
        }

        if (addr >= 0xFF04 && addr <= 0xFF07) {
            this.timer.write(addr, value);
            return;
        }

        switch (addr) {
            case 0xFF00:
                this.joypad.write(value);
                return;
            case 0xFF0F:
                this.interrupts.writeIF(value);
                return;
            case 0xFF40: {
                const lcdWasEnabled = (this.ppu.lcdc & 0x80) !== 0;
                this.ppu.lcdc = value;
                if (lcdWasEnabled && (value & 0x80) === 0) {
                    this.ppu.ly = 0;
                    this.ppuDotCounter = 0;
                }
                this.updateSTAT();
                return;
            }
            case 0xFF41:
                this.ppu.stat = (this.ppu.stat & 0x07) | (value & 0x78);
                this.updateSTAT();
                return;
            case 0xFF42: this.ppu.scy = value; return;
            case 0xFF43: this.ppu.scx = value; return;
            case 0xFF44:
                this.ppu.ly = 0;
                this.ppuDotCounter = 0;
                this.updateSTAT();
                return; // 寫入 LY 會重置
            case 0xFF45:
                this.ppu.lyc = value;
                this.updateSTAT();
                return;
            case 0xFF46: this.doDMA(value); return; // OAM DMA
            case 0xFF47: this.ppu.bgp = value; return;
            case 0xFF48: this.ppu.obp0 = value; return;
            case 0xFF49: this.ppu.obp1 = value; return;
            case 0xFF4A: this.ppu.wy = value; return;
            case 0xFF4B: this.ppu.wx = value; return;
            default:
                this.io[addr - 0xFF00] = value;
        }
    }

    doDMA(page) {
        const srcBase = (page & 0xFF) << 8;
        for (let i = 0; i < 0xA0; i++) {
            this.ppu.writeOAM(0xFE00 + i, this.readByte((srcBase + i) & 0xFFFF));
        }
    }

    requestInterrupt(bit) {
        this.interrupts.request(bit);
    }

    setButtonState(button, pressed) {
        this.joypad.setButtonState(button, pressed, (bit) => this.requestInterrupt(bit));
    }

    releaseAllButtons() {
        this.joypad.releaseAll();
    }

    updateSTAT() {
        if ((this.ppu.lcdc & 0x80) === 0) {
            this.ppu.ly = 0;
            const coincidence = this.ppu.ly === this.ppu.lyc;
            this.ppu.stat = (this.ppu.stat & 0xF8) | (coincidence ? 0x04 : 0x00);
            this.statIRQLine = false;
            return;
        }

        // bit2: LY==LYC coincidence
        const coincidence = this.ppu.ly === this.ppu.lyc;

        // bits1-0: mode (最小模擬)
        let mode = 0;
        if (this.ppu.ly >= 144) {
            mode = 1; // VBlank
        } else if (this.ppuDotCounter < 80) {
            mode = 2; // OAM scan
        } else if (this.ppuDotCounter < 252) {
            mode = 3; // transfer
        } else {
            mode = 0; // HBlank
        }

        this.ppu.stat = (this.ppu.stat & 0xF8) | (coincidence ? 0x04 : 0x00) | mode;

        const statIRQLine =
            (coincidence && (this.ppu.stat & 0x40) !== 0) ||
            (mode === 2 && (this.ppu.stat & 0x20) !== 0) ||
            (mode === 1 && (this.ppu.stat & 0x10) !== 0) ||
            (mode === 0 && (this.ppu.stat & 0x08) !== 0);

        if (!this.statIRQLine && statIRQLine) {
            this.requestInterrupt(1);
        }
        this.statIRQLine = statIRQLine;
    }

    tick(cycles) {
        cycles &= 0xFFFF;

        // Timer
        this.timer.tick(cycles, (bit) => this.requestInterrupt(bit));

        if ((this.ppu.lcdc & 0x80) === 0) {
            this.ppu.ly = 0;
            this.ppuDotCounter = 0;
            this.updateSTAT();
            return;
        }

        // 最小 PPU 時序：每 456 cycles 前進一條 LY
        this.ppuDotCounter += cycles;
        while (this.ppuDotCounter >= 456) {
            this.ppuDotCounter -= 456;
            this.ppu.ly = (this.ppu.ly + 1) % 154;
            if (this.ppu.ly === 144) {
                this.requestInterrupt(0); // VBlank
            }
        }

        this.updateSTAT();
    }
}
