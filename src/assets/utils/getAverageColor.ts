export const getAverageColor = (url: string): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (!context) return resolve('#16ac77'); // fallback --primary

            canvas.width = 50;
            canvas.height = 50;
            context.drawImage(img, 0, 0, 50, 50);

            try {
                const data = context.getImageData(0, 0, 50, 50).data;
                let r = 0, g = 0, b = 0, count = 0;

                for (let i = 0; i < data.length; i += 4 * 2) {
                    const rVal = data[i] ?? 0;
                    const gVal = data[i + 1] ?? 0;
                    const bVal = data[i + 2] ?? 0;
                    const aVal = data[i + 3] ?? 0;
                    
                    if (aVal > 0) {
                        r += rVal;
                        g += gVal;
                        b += bVal;
                        count++;
                    }
                }

                if (count === 0) return resolve('#16ac77');

                r = Math.floor(r / count);
                g = Math.floor(g / count);
                b = Math.floor(b / count);

                const toHex = (c: number) => {
                    const hex = c.toString(16);
                    return hex.length === 1 ? '0' + hex : hex;
                };

                resolve(`#${toHex(r)}${toHex(g)}${toHex(b)}`);
            } catch (e) {
                resolve('#16ac77');
            }
        };
        img.onerror = () => resolve('#16ac77');
        img.src = url;
    });
};
