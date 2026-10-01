import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { ICON_TABLES, ICONS_BY_EXTENSION, getFileIconFor } from "./getFileIcon";

const available = new Set(Object.keys(JSON.parse(readFileSync(
    fileURLToPath(new URL("../../../node_modules/bootstrap-icons/font/bootstrap-icons.json", import.meta.url)), "utf8"
))).map((name) => `bi-${name}`));

describe("icônes de fichiers", () => {
    test("chaque icône existe dans Bootstrap Icons", () => {
        const used = [
            ...ICON_TABLES.GROUPS.map((g) => g.icon),
            ...Object.values(ICON_TABLES.SPECIFIC).map((i) => i.icon),
            ...Object.values(ICON_TABLES.BY_NAME).map((i) => i.icon),
            ...ICON_TABLES.BY_MIME.map(([, i]) => i.icon),
            ICON_TABLES.DEFAULT_ICON.icon,
        ];
        expect(used.filter((icon) => !available.has(icon))).toEqual([]);
    });

    test("une extension n'appartient qu'à un seul groupe, et pas à SPECIFIC", () => {
        const seen = new Map<string, string>();
        const duplicates: string[] = [];
        for (const group of ICON_TABLES.GROUPS) {
            for (const ext of group.ext) {
                if (seen.has(ext) || ext in ICON_TABLES.SPECIFIC) duplicates.push(`${ext} (${seen.get(ext) ?? "SPECIFIC"} / ${group.icon})`);
                seen.set(ext, group.icon);
                expect(ext).toBe(ext.toLowerCase());
                expect(ext.startsWith(".")).toBe(false);
            }
        }
        expect(duplicates).toEqual([]);
        expect(ICONS_BY_EXTENSION.size).toBeGreaterThan(900);
    });

    test.each([
        ["scene.blend", "", "bi-box"],
        ["piece.STEP", "", "bi-rulers"],
        ["benchy.stl", "model/stl", "bi-printer"],
        ["ubuntu-24.04-desktop-amd64.iso", "application/x-iso9660-image", "bi-disc"],
        ["windows.vmdk", "", "bi-hdd-stack"],
        ["setup.exe", "", "bi-filetype-exe"],
        ["app-release.apk", "", "bi-android2"],
        ["paquet_1.0_amd64.deb", "", "bi-ubuntu"],
        ["Synco.dmg", "", "bi-disc"],
        ["backup.tar.gz", "", "bi-file-earmark-zip"],
        ["main.rs", "", "bi-file-earmark-code"],
        ["index.ts", "video/mp2t", "bi-file-earmark-code"],
        ["App.tsx", "", "bi-filetype-tsx"],
        ["script.py", "text/x-python", "bi-filetype-py"],
        ["Dockerfile", "", "bi-box-seam"],
        ["docker-compose.yml", "", "bi-boxes"],
        [".gitignore", "", "bi-git"],
        ["model.safetensors", "", "bi-robot"],
        ["scan.dcm", "", "bi-file-earmark-medical"],
        ["trace.gpx", "", "bi-geo-alt"],
        ["cert.pem", "", "bi-shield-lock"],
        ["invitation.ics", "", "bi-calendar-event"],
        ["livre.epub", "", "bi-book"],
        ["photo.CR3", "", "bi-camera"],
        ["notes.md", "", "bi-markdown"],
        ["rapport", "application/pdf", "bi-filetype-pdf"],
        ["sans-extension", "image/webp", "bi-file-earmark-image"],
        ["inconnu.qwerty", "", "bi-file-earmark"],
        ["", "", "bi-file-earmark"],
    ])("%s (%s) → %s", (name, mime, icon) => {
        expect(getFileIconFor(name, mime).icon).toBe(icon);
    });
});
