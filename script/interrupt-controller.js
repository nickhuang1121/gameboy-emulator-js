export class InterruptController {
    constructor() {
        this.ifReg = 0xE1; // FF0F, 高 3 bits 永遠為 1
        this.ieReg = 0x00; // FFFF
    }

    readIF() {
        return this.ifReg | 0xE0;
    }

    writeIF(value) {
        this.ifReg = 0xE0 | (value & 0x1F);
    }

    readIE() {
        return this.ieReg & 0x1F;
    }

    writeIE(value) {
        this.ieReg = value & 0x1F;
    }

    request(bit) {
        bit &= 0x07;
        this.ifReg = 0xE0 | ((this.ifReg | (1 << bit)) & 0x1F);
    }
}
