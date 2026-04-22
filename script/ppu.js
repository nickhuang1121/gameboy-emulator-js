export class PPU {
    constructor() {
        this.vram = new Uint8Array(8 * 1024);
        this.oam = new Uint8Array(160);

        this.lcdc = 0x91;
        this.stat = 0x85;
        this.scy = 0x00;
        this.scx = 0x00;
        this.ly = 0x00;
        this.lyc = 0x00;
        this.bgp = 0xFC;
        this.obp0 = 0xFF;
        this.obp1 = 0xFF;
        this.wy = 0x00;
        this.wx = 0x00;

        this.screenWidth = 160;
        this.screenHeight = 144;
        this.frameBuffer = new Uint8ClampedArray(this.screenWidth * this.screenHeight * 4);
        this.bgColorIds = new Uint8Array(this.screenWidth * this.screenHeight);
    }

    readVRAM(addr) {
        const i = (addr & 0xFFFF) - 0x8000;
        return (i >= 0 && i < 0x2000) ? this.vram[i] : 0xFF;
    }

    writeVRAM(addr, value) {
        const i = (addr & 0xFFFF) - 0x8000;
        if (i >= 0 && i < 0x2000) this.vram[i] = value & 0xFF;
    }

    readOAM(addr) {
        const i = (addr & 0xFFFF) - 0xFE00;
        return (i >= 0 && i < 0xA0) ? this.oam[i] : 0xFF;
    }

    writeOAM(addr, value) {
        const i = (addr & 0xFFFF) - 0xFE00;
        if (i >= 0 && i < 0xA0) this.oam[i] = value & 0xFF;
    }

    getBGPShade(colorId) {
        const shade = (this.bgp >>> (colorId * 2)) & 0x03;
        switch (shade) {
            case 0: return 255;
            case 1: return 170;
            case 2: return 85;
            default: return 0;
        }
    }

    getOBJShade(paletteReg, colorId) {
        const shade = (paletteReg >>> (colorId * 2)) & 0x03;
        switch (shade) {
            case 0: return 255;
            case 1: return 170;
            case 2: return 85;
            default: return 0;
        }
    }

    getMapPixelColorId(mapBase, tileDataUnsigned, px, py) {
        const mapX = px & 0xFF;
        const mapY = py & 0xFF;
        const tileCol = mapX >>> 3;
        const tileRow = mapY >>> 3;
        const pixelX = mapX & 0x07;
        const pixelY = mapY & 0x07;

        const mapAddr = mapBase + (tileRow * 32) + tileCol;
        const tileIndex = this.readVRAM(mapAddr);

        let tileAddr;
        if (tileDataUnsigned) {
            tileAddr = 0x8000 + (tileIndex * 16);
        } else {
            const signedIndex = tileIndex < 0x80 ? tileIndex : tileIndex - 0x100;
            tileAddr = 0x9000 + (signedIndex * 16);
        }

        const lineAddr = tileAddr + (pixelY * 2);
        const lo = this.readVRAM(lineAddr);
        const hi = this.readVRAM(lineAddr + 1);
        const bit = 7 - pixelX;
        return (((hi >>> bit) & 1) << 1) | ((lo >>> bit) & 1);
    }

    renderFrame(ctx) {
        if (!ctx) return;

        // LCD off: 直接清白
        if ((this.lcdc & 0x80) === 0) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, this.screenWidth, this.screenHeight);
            return;
        }

        const bgMapBase = (this.lcdc & 0x08) ? 0x9C00 : 0x9800;
        const winMapBase = (this.lcdc & 0x40) ? 0x9C00 : 0x9800;
        const tileDataUnsigned = (this.lcdc & 0x10) !== 0;
        const bgEnabled = (this.lcdc & 0x01) !== 0;
        const objEnabled = (this.lcdc & 0x02) !== 0;
        const windowEnabled = (this.lcdc & 0x20) !== 0;
        const fb = this.frameBuffer;
        const bgIds = this.bgColorIds;

        let p = 0;
        let pixelIndex = 0;
        for (let y = 0; y < this.screenHeight; y++) {
            for (let x = 0; x < this.screenWidth; x++) {
                let colorId = 0;
                let shade = 255;

                if (bgEnabled) {
                    const useWindow = windowEnabled && (y >= this.wy) && (x >= (this.wx - 7));
                    if (useWindow) {
                        const wx = x - (this.wx - 7);
                        const wy = y - this.wy;
                        colorId = this.getMapPixelColorId(winMapBase, tileDataUnsigned, wx, wy);
                    } else {
                        const bgX = (x + this.scx) & 0xFF;
                        const bgY = (y + this.scy) & 0xFF;
                        colorId = this.getMapPixelColorId(bgMapBase, tileDataUnsigned, bgX, bgY);
                    }
                    shade = this.getBGPShade(colorId);
                }

                bgIds[pixelIndex++] = colorId;
                fb[p++] = shade;
                fb[p++] = shade;
                fb[p++] = shade;
                fb[p++] = 255;
            }
        }

        if (objEnabled) {
            this.renderSprites();
        }

        const imageData = new ImageData(fb, this.screenWidth, this.screenHeight);
        ctx.putImageData(imageData, 0, 0);
    }

    renderSprites() {
        const fb = this.frameBuffer;
        const bgIds = this.bgColorIds;
        const spriteHeight = (this.lcdc & 0x04) ? 16 : 8;

        // 反向掃描讓較小 OAM index 優先顯示在最上層
        for (let n = 39; n >= 0; n--) {
            const base = n * 4;
            const yPos = this.oam[base] - 16;
            const xPos = this.oam[base + 1] - 8;
            let tile = this.oam[base + 2];
            const attr = this.oam[base + 3];

            if (xPos <= -8 || xPos >= this.screenWidth) continue;
            if (yPos <= -spriteHeight || yPos >= this.screenHeight) continue;

            const priorityBehindBG = (attr & 0x80) !== 0;
            const yFlip = (attr & 0x40) !== 0;
            const xFlip = (attr & 0x20) !== 0;
            const palette = (attr & 0x10) ? this.obp1 : this.obp0;

            if (spriteHeight === 16) {
                tile &= 0xFE;
            }

            for (let py = 0; py < spriteHeight; py++) {
                const sy = yPos + py;
                if (sy < 0 || sy >= this.screenHeight) continue;

                let tileRow = yFlip ? (spriteHeight - 1 - py) : py;
                let tileNo = tile;
                if (spriteHeight === 16 && tileRow >= 8) {
                    tileNo = (tile + 1) & 0xFF;
                    tileRow -= 8;
                }

                const lineAddr = 0x8000 + (tileNo * 16) + (tileRow * 2);
                const lo = this.readVRAM(lineAddr);
                const hi = this.readVRAM(lineAddr + 1);

                for (let px = 0; px < 8; px++) {
                    const sx = xPos + px;
                    if (sx < 0 || sx >= this.screenWidth) continue;

                    const bit = xFlip ? px : (7 - px);
                    const colorId = (((hi >>> bit) & 1) << 1) | ((lo >>> bit) & 1);
                    if (colorId === 0) continue; // Sprite color 0 = transparent

                    const idx = sy * this.screenWidth + sx;
                    if (priorityBehindBG && bgIds[idx] !== 0) continue;

                    const shade = this.getOBJShade(palette, colorId);
                    const p = idx * 4;
                    fb[p] = shade;
                    fb[p + 1] = shade;
                    fb[p + 2] = shade;
                    fb[p + 3] = 255;
                }
            }
        }
    }
}
