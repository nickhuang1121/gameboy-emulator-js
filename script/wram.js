export class WorkRAM {
    constructor() {
        this.data = new Uint8Array(0x2000); // C000-DFFF
    }

    read(addr) {
        addr &= 0xFFFF;
        if (addr >= 0xC000 && addr < 0xE000) {
            return this.data[addr - 0xC000];
        }
        if (addr >= 0xE000 && addr < 0xFE00) {
            // Echo RAM: E000-FDFF mirrors C000-DDFF
            return this.data[addr - 0xE000];
        }
        return 0xFF;
    }

    write(addr, value) {
        addr &= 0xFFFF;
        value &= 0xFF;
        if (addr >= 0xC000 && addr < 0xE000) {
            this.data[addr - 0xC000] = value;
            return;
        }
        if (addr >= 0xE000 && addr < 0xFE00) {
            this.data[addr - 0xE000] = value;
        }
    }
}
