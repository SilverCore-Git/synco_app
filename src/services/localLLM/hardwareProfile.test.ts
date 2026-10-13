import { describe, expect, test } from "bun:test";
import { recommendModel, type HardwareProfile } from "./hardwareProfile";

const GB = 1024 ** 3;

const profile = (over: Partial<HardwareProfile>): HardwareProfile => ({
    webgpu: true,
    vendor: '',
    architecture: '',
    description: '',
    shaderF16: true,
    maxStorageBufferBindingSize: 2 * GB,
    bandwidthGBs: 100,
    unifiedMemory: false,
    deviceMemoryGB: 8,
    cores: 8,
    mobile: false,
    storageFreeBytes: 100 * GB,
    ...over,
});

const tierOf = (p: HardwareProfile) => recommendModel(p).model.tier;

describe("recommendModel", () => {
    test("GPU dédié rapide (type RTX 3060) → tier 1 en f16", () => {
        const r = recommendModel(profile({ vendor: 'nvidia', bandwidthGBs: 300 }));
        expect(r.model.tier).toBe(1);
        expect(r.precision).toBe('f16');
    });

    test("sans shader-f16 → variante f32", () => {
        expect(recommendModel(profile({ vendor: 'nvidia', bandwidthGBs: 300, shaderF16: false })).precision).toBe('f32');
    });

    test("Apple M de base (mémoire unifiée, ~60 Go/s) → tier 2", () => {
        expect(tierOf(profile({ vendor: 'apple', unifiedMemory: true, bandwidthGBs: 60 }))).toBe(2);
    });

    test("Apple Pro/Max (débit élevé) → tier 1 malgré deviceMemory plafonné à 8", () => {
        expect(tierOf(profile({ vendor: 'apple', unifiedMemory: true, bandwidthGBs: 180 }))).toBe(1);
    });

    test("iGPU Intel lent → tier 3", () => {
        expect(tierOf(profile({ vendor: 'intel', unifiedMemory: true, bandwidthGBs: 25 }))).toBe(3);
    });

    test("limite storage buffer < 1 Go exclut le tier 1 (non low_resource)", () => {
        expect(tierOf(profile({ vendor: 'nvidia', bandwidthGBs: 400, maxStorageBufferBindingSize: 128 * 1024 ** 2 }))).toBe(2);
    });

    test("disque presque plein → descend jusqu'au modèle qui tient", () => {
        expect(tierOf(profile({ vendor: 'nvidia', bandwidthGBs: 400, storageFreeBytes: 1.5 * GB }))).toBe(3);
    });

    test("mobile → tier 3", () => {
        expect(tierOf(profile({ mobile: true, unifiedMemory: true, bandwidthGBs: 200 }))).toBe(3);
    });

    test("benchmark indisponible → on ne bloque pas sur la vitesse", () => {
        expect(tierOf(profile({ vendor: 'apple', unifiedMemory: true, bandwidthGBs: null }))).toBe(2);
    });
});
