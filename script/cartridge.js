export class Cartridge {
    constructor() {
        this.romBuffer = null;
        this.rom = null;
        this.romView = null;
        this.header = {
            gameName: null,
            mapperType: null,
            cartridgeType: null,
            bankNumber: null,
            ramSize: null,
            logoBytes: null,
            hasRam: false,
            hasBattery: false,
            hasRumble: false,

        }

        this.sram = null;
        this.mapperState = null;
    }
    createMapperState() {
        return {
            ramEnabled: false,
            romBankLow: 0x01,
            romBankHigh: 0x00,
            ramBank: 0x00,
            rumbleEnabled: false
        };
    }
    resetMapperState() {
        this.mapperState = this.createMapperState();
    }
    getCartridgeTypeCode() {
        return this.rom?.[0x0147] ?? 0x00;
    }
    getMapperConfig(cartridgeType = this.getCartridgeTypeCode()) {
        switch (cartridgeType) {
            case 0x00:
                return {
                    mapperType: 'romOnly',
                    hasRam: false,
                    hasBattery: false,
                    hasRumble: false,
                    isMBC5: false
                };
            case 0x01:
                return {
                    mapperType: 'MBC1',
                    hasRam: false,
                    hasBattery: false,
                    hasRumble: false,
                    isMBC5: false
                };
            case 0x02:
                return {
                    mapperType: 'MBC1RAM',
                    hasRam: true,
                    hasBattery: false,
                    hasRumble: false,
                    isMBC5: false
                };
            case 0x03:
                return {
                    mapperType: 'MBC1RAMBattery',
                    hasRam: true,
                    hasBattery: true,
                    hasRumble: false,
                    isMBC5: false
                };
            case 0x19:
                return {
                    mapperType: 'MBC5',
                    hasRam: false,
                    hasBattery: false,
                    hasRumble: false,
                    isMBC5: true
                };
            case 0x1A:
                return {
                    mapperType: 'MBC5RAM',
                    hasRam: true,
                    hasBattery: false,
                    hasRumble: false,
                    isMBC5: true
                };
            case 0x1B:
                return {
                    mapperType: 'MBC5RAMBattery',
                    hasRam: true,
                    hasBattery: true,
                    hasRumble: false,
                    isMBC5: true
                };
            case 0x1C:
                return {
                    mapperType: 'MBC5Rumble',
                    hasRam: false,
                    hasBattery: false,
                    hasRumble: true,
                    isMBC5: true
                };
            case 0x1D:
                return {
                    mapperType: 'MBC5RumbleRAM',
                    hasRam: true,
                    hasBattery: false,
                    hasRumble: true,
                    isMBC5: true
                };
            case 0x1E:
                return {
                    mapperType: 'MBC5RumbleRAMBattery',
                    hasRam: true,
                    hasBattery: true,
                    hasRumble: true,
                    isMBC5: true
                };
            default:
                return {
                    mapperType: `unsupportedMapper:${cartridgeType}`,
                    hasRam: false,
                    hasBattery: false,
                    hasRumble: false,
                    isMBC5: false
                };
        }
    }
    isMBC5() {
        return this.getMapperConfig().isMBC5;
    }
    getRomBankCount() {
        if (Number.isInteger(this.header.bankNumber) && this.header.bankNumber > 0) {
            return this.header.bankNumber;
        }
        return Math.max(1, Math.ceil((this.rom?.length ?? 0) / 0x4000));
    }
    getRamBankCount() {
        if (!this.sram) {
            return 0;
        }
        return Math.max(1, Math.ceil(this.sram.length / 0x2000));
    }
    getCurrentROMBank() {
        const bank = ((this.mapperState.romBankHigh & 0x01) << 8) | this.mapperState.romBankLow;
        return bank % this.getRomBankCount();
    }
    getCurrentRAMBank() {
        const bankCount = this.getRamBankCount();
        if (bankCount === 0) {
            return 0;
        }
        return this.mapperState.ramBank % bankCount;
    }
    getBankedRAMOffset(addr) {
        return (this.getCurrentRAMBank() * 0x2000) + (addr - 0xA000);
    }
    readMBC5Byte(addr) {
        if (addr < 0x4000) {
            return this.rom?.[addr] ?? 0;
        }
        if (addr < 0x8000) {
            const offset = (this.getCurrentROMBank() * 0x4000) + (addr - 0x4000);
            return this.rom?.[offset] ?? 0;
        }
        if (addr >= 0xA000 && addr < 0xC000) {
            if (!this.sram || !this.mapperState.ramEnabled) {
                return 0xFF;
            }
            return this.sram[this.getBankedRAMOffset(addr)] ?? 0xFF;
        }
        throw new Error(`卡帶位置read錯誤: 0x${addr.toString(16).padStart(4, '0')}`);
    }
    writeMBC5(addr, value) {
        if (addr < 0x2000) {
            this.mapperState.ramEnabled = (value & 0x0F) === 0x0A;
            return;
        }
        if (addr < 0x3000) {
            this.mapperState.romBankLow = value;
            return;
        }
        if (addr < 0x4000) {
            this.mapperState.romBankHigh = value & 0x01;
            return;
        }
        if (addr < 0x6000) {
            const { hasRumble } = this.getMapperConfig();
            if (hasRumble) {
                this.mapperState.rumbleEnabled = (value & 0x08) !== 0;
                this.mapperState.ramBank = value & 0x07;
            } else {
                this.mapperState.ramBank = value & 0x0F;
            }
            return;
        }
    }
    writeBankedRAM(addr, value) {
        if (!this.sram) {
            return;
        }
        this.sram[this.getBankedRAMOffset(addr)] = value;
    }
    readByte(addr) {
        addr &= 0xFFFF;
        if (this.isMBC5()) {
            return this.readMBC5Byte(addr);
        }
        if (addr < 0x8000) {
            return this.rom?.[addr] ?? 0;
        }
        if (addr >= 0xA000 && addr < 0xC000) {
            addr -= 0xA000;
            return this.sram?.[addr] ?? 0;
        }
        throw new Error(`卡帶位置read錯誤: 0x${addr.toString(16).padStart(4, '0')}`);

    }
    writeByte(addr, value) {
        addr &= 0xFFFF;
        value &= 0xFF;
        if (this.isMBC5()) {
            if (addr < 0x8000) {
                this.writeMBC5(addr, value);
                return;
            }
            if (addr >= 0xA000 && addr < 0xC000) {
                if (this.mapperState.ramEnabled) {
                    this.writeBankedRAM(addr, value);
                }
                return;
            }
        }
        if (addr >= 0xA000 && addr < 0xC000) {
            addr -= 0xA000;
            if (this.sram) {
                this.sram[addr] = value;
            }
        }
    }
    readWord(addr, littleEndian = true) {
        addr &= 0xFFFF;
        const b0 = this.readByte(addr);
        const b1 = this.readByte((addr + 1) & 0xFFFF);

        return littleEndian ? ((b1 << 8) | b0) & 0xFFFF : ((b0 << 8) | b1) & 0xFFFF;

    }
    parseGameName() {
        const bytes = [];
        for (let i = 0x0134; i < 0x0144; i++) {
            const b = this.readByte(i);
            if (b === 0) break;
            bytes.push(b);
        }
        const gameName = new TextDecoder('ascii').decode(new Uint8Array(bytes));
        return gameName;
    }
    parseBankNumber() {
        switch (this.readByte(0x0148)) {
            case 0x00: return 2;
            case 0x01: return 4;
            case 0x02: return 8;
            case 0x03: return 16;
            case 0x04: return 32;
            case 0x05: return 64;
            case 0x06: return 128;
            case 0x07: return 256;
            case 0x08: return 512;
            case 0x52: return 72;
            case 0x53: return 80;
            case 0x54: return 96;
            default:
                return Math.max(1, Math.ceil((this.rom?.length ?? 0) / 0x4000));
        }
    }
    parseRamSize() {
        switch (this.readByte(0x0149)) {
            case 0x00:
                this.sram = null;
                return 0;
            case 0x01:
                this.sram = new Uint8Array(2048);
                return this.sram.length;
            case 0x02:
                this.sram = new Uint8Array(8192);
                return this.sram.length;
            case 0x03:
                this.sram = new Uint8Array(32768);
                return this.sram.length;
            case 0x04:
                this.sram = new Uint8Array(131072);
                return this.sram.length;
            case 0x05:
                this.sram = new Uint8Array(65536);
                return this.sram.length;
            default:
                this.sram = null;
                return -1;

        }


    }
    parseLogoBytes() {
        if (!this.rom) {
            return null;
        }
        return this.rom.slice(0x0104, 0x0134);
    }

    setHeaderDetail() {
        const mapperConfig = this.getMapperConfig();
        this.header = {
            gameName: this.parseGameName(),
            mapperType: mapperConfig.mapperType,
            cartridgeType: this.getCartridgeTypeCode(),
            bankNumber: this.parseBankNumber(),
            ramSize: this.parseRamSize(),
            logoBytes: this.parseLogoBytes(),
            hasRam: mapperConfig.hasRam,
            hasBattery: mapperConfig.hasBattery,
            hasRumble: mapperConfig.hasRumble
        }


    }
    async loadROM(romFile) {
        try {
            const res = await fetch(romFile);
            if (!res.ok) {
                throw new Error(`讀取 ROM 失敗: HTTP ${res.status} ${res.statusText}`);
            }
            this.romBuffer = await res.arrayBuffer();
            this.rom = new Uint8Array(this.romBuffer);
            this.romView = new DataView(this.romBuffer);
            this.resetMapperState();
            this.setHeaderDetail();

        } catch (err) {
            throw new Error(`載入失敗： ${err.message}`);
        }

    }
}
