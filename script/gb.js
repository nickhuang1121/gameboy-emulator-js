import { APU } from './apu.js';
import { PPU } from './ppu.js';
import { Cartridge } from './cartridge.js';
import { Timer } from './timer.js';
import { Joypad } from './joypad.js';
import { InterruptController } from './interrupt-controller.js';
import { WorkRAM } from './wram.js';
import { CPU } from './cpu.js';
import { Bus } from './bus.js';

export class GB {
    constructor() {
        this.cartridge = new Cartridge();
        this.ppu = new PPU();
        this.apu = new APU();
        this.timer = new Timer();
        this.joypad = new Joypad();
        this.interrupts = new InterruptController();
        this.wram = new WorkRAM();
        this.bus = new Bus({
            cartridge: this.cartridge,
            ppu: this.ppu,
            apu: this.apu,
            timer: this.timer,
            joypad: this.joypad,
            interrupts: this.interrupts,
            wram: this.wram
        });
        this.cpu = new CPU(this);
        this.romFile = null;
    }

    readByte(addr) {
        return this.bus.readByte(addr);
    }

    writeByte(addr, value) {
        this.bus.writeByte(addr, value);
    }

    requestInterrupt(bit) {
        this.bus.requestInterrupt(bit);
    }

    setButtonState(button, pressed) {
        this.bus.setButtonState(button, pressed);
    }

    releaseAllButtons() {
        this.bus.releaseAllButtons();
    }

    tick(cycles) {
        this.bus.tick(cycles);
    }

    async init(obj) {
        if (!obj.romFile) {
            console.log("沒有rom");
            return null;
        }

        this.romFile = obj.romFile;
        await this.cartridge.loadROM(obj.romFile);
        return this.cartridge.header;
    }
}
